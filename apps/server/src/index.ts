import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, watchFile, readdirSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { networkInterfaces } from "node:os";
import cors from "cors";
import QRCode from "qrcode";
import type { ServerToClientEvents, ClientToServerEvents, DeckAction } from "@open-deck/shared";

const PORT = Number(process.env.PORT) || 4000;
const CONFIG_PATH = resolve(process.env.CONFIG_PATH || "../../deck.config.json");

// Load config
function loadActions(): DeckAction[] {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return (JSON.parse(raw) as { actions: DeckAction[] }).actions;
  } catch (e) {
    console.error("[deck] Failed to load config:", (e as Error).message);
    return [];
  }
}

let actions = loadActions();

// Watch config for hot-reload
watchFile(CONFIG_PATH, () => {
  console.log("[deck] Config changed, reloading...");
  actions = loadActions();
  io.emit("config:actions", actions);
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(process.cwd(), "public")));

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["polling", "websocket"],
  allowEIO3: true,
});

// Track desktop agent socket
let agentSocket: string | null = null;

io.on("connection", (socket) => {
  const role = socket.handshake.query["role"];

  if (role === "agent") {
    agentSocket = socket.id;
    console.log(`[deck] Desktop agent connected: ${socket.id}`);
    socket.on("disconnect", () => {
      agentSocket = null;
      console.log("[deck] Desktop agent disconnected");
    });
    return;
  }

  // Tablet/client
  console.log(`[deck] Client connected: ${socket.id}`);
  socket.emit("config:actions", actions);

  socket.on("action:execute", (actionId) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;

    console.log(`[deck] Execute: ${action.label} (${action.type})`);

    // Macro: execute steps in sequence
    if (action.payload.type === "macro") {
      const steps = action.payload.steps;
      steps.forEach((step, i) => {
        setTimeout(() => {
          const stepAction = actions.find((a) => a.id === step.actionId);
          if (stepAction && agentSocket) {
            io.to(agentSocket).emit("action:run" as keyof ServerToClientEvents, stepAction as never);
          }
        }, (step.delay ?? 0) + i * 200);
      });
      return;
    }

    if (agentSocket) {
      io.to(agentSocket).emit("action:run" as keyof ServerToClientEvents, action as never);
    } else {
      console.log("[deck] No desktop agent connected!");
      socket.emit("notification:new", {
        id: crypto.randomUUID(),
        title: "Desktop agent not connected",
        level: "error",
        timestamp: Date.now(),
        read: false,
      });
    }
  });
});

app.get("/health", (req, res) => {
  const remoteIp = (req.ip ?? req.socket.remoteAddress ?? "").replace("::ffff:", "");
  const localIps = Object.values(networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n!.address);
  const isLocal = remoteIp === "127.0.0.1" || remoteIp === "::1" || localIps.includes(remoteIp);
  const ip = localIps[0] ?? "localhost";
  res.json({ status: "ok", agent: !!agentSocket, actions: actions.length, isLocal, url: `http://${ip}:${PORT}`, version: process.env.npm_package_version ?? "0.6.1" });
});

app.get("/qr", async (_req, res) => {
  const localIps = Object.values(networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n!.address);
  const ip = localIps[0] ?? "localhost";
  const url = `http://${ip}:${PORT}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#ffffff", light: "#00000000" } });
  res.type("svg").send(svg);
});

// Get detected apps from agent
app.get("/apps", (_req, res) => {
  if (!agentSocket) { res.json({ apps: [] }); return; }
  const timeout = setTimeout(() => res.json({ apps: [] }), 3000);
  const agentSock = io.sockets.sockets.get(agentSocket);
  if (!agentSock) { clearTimeout(timeout); res.json({ apps: [] }); return; }
  (agentSock as unknown as { emit: (ev: string, ...args: unknown[]) => void }).emit("apps:list");
  (agentSock as unknown as { once: (ev: string, fn: (data: unknown) => void) => void }).once("apps:result", (data) => {
    clearTimeout(timeout);
    res.json({ apps: data });
  });
});

// Save config from web UI
app.put("/config", (req, res) => {
  try {
    const { actions: newActions } = req.body as { actions: DeckAction[] };
    if (!Array.isArray(newActions)) { res.status(400).json({ error: "actions array required" }); return; }
    actions = newActions;
    writeFileSync(CONFIG_PATH, JSON.stringify({ actions }, null, 2));
    io.emit("config:actions", actions);
    console.log(`[deck] Config saved (${actions.length} actions)`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// API to send notifications from anywhere
app.post("/notify", (req, res) => {
  const { title, level = "info" } = req.body as { title?: string; level?: string };
  if (!title) { res.status(400).json({ error: "title required" }); return; }
  const notification = { id: crypto.randomUUID(), title, level: level as "info", timestamp: Date.now(), read: false };
  io.emit("notification:new", notification);
  res.json({ ok: true });
});

// Plugin system
const widgets: Record<string, { interval: number; getData: () => unknown }> = {};
const customActions: Record<string, (payload: unknown) => void> = {};

// Plugin state (enabled/disabled)
const PLUGINS_STATE_PATH = resolve(CONFIG_PATH, "../plugins-state.json");

function loadPluginsState(): Record<string, { disabled?: boolean }> {
  try { return JSON.parse(readFileSync(PLUGINS_STATE_PATH, "utf-8")); } catch { return {}; }
}

function savePluginsState(state: Record<string, { disabled?: boolean }>) {
  writeFileSync(PLUGINS_STATE_PATH, JSON.stringify(state, null, 2));
}

async function loadPlugins() {
  const pluginsDir = resolve(CONFIG_PATH, "../plugins");
  if (!existsSync(pluginsDir)) return;
  const state = loadPluginsState();
  const deck = {
    registerAction: (type: string, handler: (payload: unknown) => void) => { customActions[type] = handler; },
    registerWidget: (id: string, config: { interval: number; getData: () => unknown }) => { widgets[id] = config; startWidget(id, config); },
    notify: (title: string, level: string) => { io.emit("notification:new", { id: crypto.randomUUID(), title, level: level as "info", timestamp: Date.now(), read: false }); },
    getActions: () => actions,
    onExecute: (_cb: unknown) => {},
  };
  try {
    const files = readdirSync(pluginsDir).filter(f => f.endsWith(".js"));
    for (const file of files) {
      const id = file.replace(".js", "");
      if (state[id]?.disabled) { console.log(`[deck] Plugin skipped (disabled): ${id}`); continue; }
      try {
        const { createRequire } = await import("node:module");
        const req = createRequire(import.meta.url);
        const plugin = req(resolve(pluginsDir, file));
        plugin.setup(deck);
        console.log(`[deck] Plugin loaded: ${plugin.name}`);
      } catch (e) { console.log(`[deck] Plugin error (${file}):`, (e as Error).message); }
    }
  } catch { /* no plugins dir */ }
}

function startWidget(id: string, config: { interval: number; getData: () => unknown }) {
  const timer = setInterval(() => {
    const data = config.getData();
    io.emit("widget:update" as keyof ServerToClientEvents, { id, data } as never);
  }, config.interval);
  widgetTimers.push(timer);
}

const widgetTimers: ReturnType<typeof setInterval>[] = [];

app.post("/plugins/reload", async (_req, res) => {
  // Clear existing widgets and timers
  widgetTimers.forEach(t => clearInterval(t));
  widgetTimers.length = 0;
  for (const k of Object.keys(widgets)) delete widgets[k];
  for (const k of Object.keys(customActions)) delete customActions[k];
  await loadPlugins();
  res.json({ ok: true });
});

app.get("/widgets", (_req, res) => {
  const data: Record<string, unknown> = {};
  for (const [id, w] of Object.entries(widgets)) { data[id] = w.getData(); }
  res.json(data);
});

// Debug logs
const serverLogs: string[] = [];
function log(msg: string) { const entry = `[${new Date().toLocaleTimeString()}] ${msg}`; serverLogs.push(entry); if (serverLogs.length > 100) serverLogs.shift(); console.log(entry); }
app.get("/logs", (_req, res) => { res.json({ logs: serverLogs }); });

// Plugin store
const REGISTRY_URL = "https://raw.githubusercontent.com/florextech/deck-plugins/main/registry.json";
const LOCAL_REGISTRY = [
  { id: "clock", name: "Clock", description: "Shows current time and date", author: "Deck", version: "1.0.0", official: true, tags: ["widget","utility"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/clock.js" },
  { id: "system-monitor", name: "System Monitor", description: "CPU, RAM usage and uptime widget", author: "Deck", version: "1.0.0", official: true, tags: ["widget","system"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/system-monitor.js" },
  { id: "spotify", name: "Spotify", description: "Control Spotify playback and see now playing", author: "Deck", version: "1.0.0", official: true, tags: ["media","music"], platforms: ["macos"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/spotify.js" },
  { id: "pomodoro", name: "Pomodoro Timer", description: "25 min focus timer with notification", author: "Deck", version: "1.0.0", official: true, tags: ["productivity","timer"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/pomodoro.js" },
];

function currentPlatform(): string {
  const p = process.platform;
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return "linux";
}

app.get("/plugins/store", async (_req, res) => {
  const pluginsDir = resolve(CONFIG_PATH, "../plugins");
  const installed = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter(f => f.endsWith(".js")).map(f => f.replace(".js", "")) : [];
  const state = loadPluginsState();
  const platform = currentPlatform();
  let registryPlugins: Array<{ id: string; platforms?: string[]; [k: string]: unknown }> = LOCAL_REGISTRY;
  try {
    const r = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(5000) });
    const data = await r.json() as { plugins: Array<{ id: string; platforms?: string[] }> };
    if (data.plugins && data.plugins.length) registryPlugins = data.plugins;
  } catch { /* use local fallback */ }
  const plugins = registryPlugins.map(p => ({ ...p, installed: installed.includes(p.id), disabled: !!state[p.id]?.disabled, currentPlatform: platform }));
  for (const id of installed) {
    if (!plugins.find(p => p.id === id)) {
      plugins.push({ id, name: id, description: "Installed locally", installed: true, disabled: !!state[id]?.disabled, currentPlatform: platform } as never);
    }
  }
  res.json({ plugins });
});

app.post("/plugins/toggle", (req, res) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }
    const state = loadPluginsState();
    state[id] = { disabled: !state[id]?.disabled };
    savePluginsState(state);
    res.json({ ok: true, disabled: state[id].disabled });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

app.post("/plugins/install", async (req, res) => {
  try {
    const { id, url, platforms } = req.body as { id: string; url: string; platforms?: string[] };
    if (!id || !url) { res.status(400).json({ error: "id and url required" }); return; }
    // Platform check
    if (platforms && platforms.length && !platforms.includes(currentPlatform())) {
      res.status(400).json({ error: `Not supported on ${currentPlatform()}. Supported: ${platforms.join(", ")}` }); return;
    }
    // Only allow from trusted sources
    if (!url.startsWith("https://raw.githubusercontent.com/")) {
      res.status(403).json({ error: "Only GitHub raw URLs allowed" }); return;
    }
    const r = await fetch(url);
    const code = await r.text();
    // Basic security validation
    const blocked = ["eval(", "Function(", "child_process", "require('fs')", "require(\"fs\")", "writeFileSync", "unlinkSync", "rmSync", "process.env"];
    const found = blocked.find(b => code.includes(b) && !url.includes("florextech/deck"));
    if (found) { res.status(403).json({ error: `Blocked: contains '${found}'` }); return; }
    // Validate structure
    if (!code.includes("module.exports") || !code.includes("setup")) {
      res.status(400).json({ error: "Invalid plugin: must export { name, setup }" }); return;
    }
    const pluginsDir = resolve(CONFIG_PATH, "../plugins");
    if (!existsSync(pluginsDir)) { mkdirSync(pluginsDir, { recursive: true }); }
    writeFileSync(resolve(pluginsDir, `${id}.js`), code);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

app.post("/plugins/uninstall", (req, res) => {
  try {
    const { id } = req.body as { id: string };
    if (!id) { res.status(400).json({ error: "id required" }); return; }
    const pluginsDir = resolve(CONFIG_PATH, "../plugins");
    const filePath = resolve(pluginsDir, `${id}.js`);
    if (existsSync(filePath)) { unlinkSync(filePath); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[deck] Server on http://localhost:${PORT}`);
  console.log(`[deck] Config: ${CONFIG_PATH} (${actions.length} actions)`);
  loadPlugins();
});

httpServer.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    const next = PORT + 1;
    console.log(`[deck] Port ${PORT} in use, trying ${next}...`);
    httpServer.listen(next, "0.0.0.0", () => {
      console.log(`[deck] Server on http://localhost:${next}`);
    });
  }
});
