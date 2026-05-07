import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { readFileSync, writeFileSync, watchFile } from "node:fs";
import { resolve } from "node:path";
import cors from "cors";
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

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: "*" },
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agent: !!agentSocket, actions: actions.length });
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

httpServer.listen(PORT, () => {
  console.log(`[deck] Server on http://localhost:${PORT}`);
  console.log(`[deck] Config: ${CONFIG_PATH} (${actions.length} actions)`);
});
