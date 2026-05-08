import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, watchFile, readdirSync, existsSync } from "node:fs";
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
  res.json({ status: "ok", agent: !!agentSocket, actions: actions.length, isLocal, url: `http://${ip}:${PORT}`, version: process.env.npm_package_version ?? "0.2.0" });
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

async function loadPlugins() {
  const pluginsDir = resolve(CONFIG_PATH, "../plugins");
  if (!existsSync(pluginsDir)) return;
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
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
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
  setInterval(() => {
    const data = config.getData();
    io.emit("widget:update" as keyof ServerToClientEvents, { id, data } as never);
  }, config.interval);
}

app.get("/widgets", (_req, res) => {
  const data: Record<string, unknown> = {};
  for (const [id, w] of Object.entries(widgets)) { data[id] = w.getData(); }
  res.json(data);
});

// Plugin store
const REGISTRY_URL = "https://raw.githubusercontent.com/florextech/deck-plugins/main/registry.json";

app.get("/plugins/store", async (_req, res) => {
  try {
    const r = await fetch(REGISTRY_URL);
    const data = await r.json() as { plugins: unknown[] };
    // Mark installed plugins
    const pluginsDir = resolve(CONFIG_PATH, "../plugins");
    const installed = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter(f => f.endsWith(".js")).map(f => f.replace(".js", "")) : [];
    res.json({ plugins: (data.plugins as Array<{ id: string }>).map(p => ({ ...p, installed: installed.includes(p.id) })) });
  } catch { res.json({ plugins: [] }); }
});

app.post("/plugins/install", async (req, res) => {
  try {
    const { id, url } = req.body as { id: string; url: string };
    if (!id || !url) { res.status(400).json({ error: "id and url required" }); return; }
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
    if (!existsSync(pluginsDir)) { const { mkdirSync } = await import("node:fs"); mkdirSync(pluginsDir, { recursive: true }); }
    writeFileSync(resolve(pluginsDir, `${id}.js`), code);
    res.json({ ok: true, message: "Restart to activate" });
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
