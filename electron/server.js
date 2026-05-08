const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { readFileSync, writeFileSync, watchFile } = require("fs");
const { join } = require("path");
const cors = require("cors");

const PORT = Number(process.env.PORT) || 4000;
const CONFIG_PATH = process.env.CONFIG_PATH || join(__dirname, "deck.config.json");

function loadActions() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")).actions; }
  catch { return []; }
}

let actions = loadActions();
watchFile(CONFIG_PATH, () => { actions = loadActions(); io.emit("config:actions", actions); });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*", methods: ["GET", "POST"] }, transports: ["polling", "websocket"] });

let agentSocket = null;

io.on("connection", (socket) => {
  if (socket.handshake.query.role === "agent") {
    agentSocket = socket.id;
    socket.on("disconnect", () => { agentSocket = null; });
    return;
  }
  socket.emit("config:actions", actions);
  socket.on("action:execute", (actionId) => {
    const action = actions.find((a) => a.id === actionId);
    if (!action) return;
    if (agentSocket) io.to(agentSocket).emit("action:run", action);
    else socket.emit("notification:new", { id: Date.now().toString(), title: "Agent not connected", level: "error", timestamp: Date.now(), read: false });
  });
});

app.get("/health", (req, res) => {
  const { networkInterfaces } = require("os");
  const localIps = Object.values(networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n.address);
  const ip = localIps[0] || "localhost";
  const remoteIp = (req.ip || req.socket.remoteAddress || "").replace("::ffff:", "");
  const isLocal = remoteIp === "127.0.0.1" || remoteIp === "::1" || localIps.includes(remoteIp);
  res.json({ status: "ok", agent: !!agentSocket, actions: actions.length, isLocal, url: `http://${ip}:${PORT}` });
});
app.get("/qr", async (_, res) => {
  const { networkInterfaces } = require("os");
  const QRCode = require("qrcode");
  const localIps = Object.values(networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n.address);
  const ip = localIps[0] || "localhost";
  const svg = await QRCode.toString(`http://${ip}:${PORT}`, { type: "svg", margin: 1, color: { dark: "#ffffff", light: "#00000000" } });
  res.type("svg").send(svg);
});
app.get("/apps", (_, res) => {
  if (!agentSocket) return res.json({ apps: [] });
  const timeout = setTimeout(() => res.json({ apps: [] }), 3000);
  const sock = io.sockets.sockets.get(agentSocket);
  if (!sock) { clearTimeout(timeout); return res.json({ apps: [] }); }
  sock.emit("apps:list");
  sock.once("apps:result", (data) => { clearTimeout(timeout); res.json({ apps: data }); });
});
app.put("/config", (req, res) => {
  try {
    actions = req.body.actions;
    writeFileSync(CONFIG_PATH, JSON.stringify({ actions }, null, 2));
    io.emit("config:actions", actions);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/notify", (req, res) => {
  const { title, level = "info" } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  io.emit("notification:new", { id: Date.now().toString(), title, level, timestamp: Date.now(), read: false });
  res.json({ ok: true });
});

httpServer.listen(PORT, "0.0.0.0", () => console.log(`[server] :${PORT}`));
