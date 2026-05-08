const { app, BrowserWindow, Tray, Menu, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { networkInterfaces } = require("os");
const { exec } = require("child_process");
const { readdirSync, existsSync, readFileSync, writeFileSync, watchFile } = require("fs");
const { join } = require("path");
const path = require("path");
const express = require("express");
const { createServer } = require("http");
const https = require("https");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");

const PORT = 4000;
let win = null;
let tray = null;
const os = require("os").platform();
const logs = [];
function log(msg) { const entry = `[${new Date().toLocaleTimeString()}] ${msg}`; logs.push(entry); if (logs.length > 100) logs.shift(); console.log(entry); }

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

app.whenReady().then(() => {
  // Config
  const configPath = join(app.getPath("userData"), "deck.config.json");
  if (!existsSync(configPath)) {
    const def = join(__dirname, "deck.config.json");
    if (existsSync(def)) writeFileSync(configPath, readFileSync(def));
    else writeFileSync(configPath, JSON.stringify({ actions: [] }, null, 2));
  }

  function loadActions() { try { return JSON.parse(readFileSync(configPath, "utf-8")).actions; } catch { return []; } }
  let actions = loadActions();
  watchFile(configPath, () => { actions = loadActions(); io.emit("config:actions", actions); });

  // Server
  const srv = express();
  srv.use(cors());
  srv.use(express.json());
  srv.use(express.static(join(__dirname, "public")));

  const httpServer = createServer(srv);
  const io = new Server(httpServer, { cors: { origin: "*" }, transports: ["polling", "websocket"] });

  io.on("connection", (socket) => {
    socket.emit("config:actions", actions);
    socket.on("action:execute", (actionId) => {
      const action = actions.find(a => a.id === actionId);
      if (!action) return;
      console.log(`[exec] ${action.label}`);
      executeAction(action);
    });
  });

  // Execute actions directly (no separate agent needed)
  function executeAction(action) {
    switch (action.payload.type) {
      case "url":
        const urlCmd = os === "darwin" ? `open "${action.payload.url}"` : os === "win32" ? `start "" "${action.payload.url}"` : `xdg-open "${action.payload.url}"`;
        exec(urlCmd, (err) => notify(err ? "Failed to open" : "Opened", err ? "error" : "success"));
        break;
      case "copy":
        const cpCmd = os === "darwin" ? "pbcopy" : os === "win32" ? "clip" : "xclip -selection clipboard";
        const child = exec(cpCmd, (err) => notify(err ? "Copy failed" : "Copied!", err ? "error" : "success"));
        child.stdin.write(action.payload.text);
        child.stdin.end();
        break;
      case "command":
        exec(action.payload.command, { shell: os === "win32" ? "cmd.exe" : "/bin/bash", timeout: 30000 }, (err) => {
          notify(err ? `Failed: ${action.payload.command.slice(0, 30)}` : `Done: ${action.payload.command.slice(0, 30)}`, err ? "error" : "success");
        });
        break;
    }
  }

  function notify(title, level) {
    io.emit("notification:new", { id: Date.now().toString(), title, level, timestamp: Date.now(), read: false });
  }

  // Endpoints
  srv.get("/health", (req, res) => {
    const localIps = Object.values(networkInterfaces()).flat().filter(n => n && n.family === "IPv4" && !n.internal).map(n => n.address);
    const ip = localIps[0] || "localhost";
    const remoteIp = (req.ip || req.socket.remoteAddress || "").replace("::ffff:", "");
    const isLocal = remoteIp === "127.0.0.1" || remoteIp === "::1" || localIps.includes(remoteIp);
    const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
    res.json({ status: "ok", agent: true, actions: actions.length, isLocal, url: `http://${ip}:${PORT}`, version: pkg.version });
  });
  srv.get("/qr", async (_, res) => {
    const ip = getLocalIP();
    const svg = await QRCode.toString(`http://${ip}:${PORT}`, { type: "svg", margin: 1, color: { dark: "#ffffff", light: "#00000000" } });
    res.type("svg").send(svg);
  });
  srv.get("/apps", (_, res) => { res.json({ apps: detectApps() }); });
  srv.put("/config", (req, res) => {
    try { actions = req.body.actions; writeFileSync(configPath, JSON.stringify({ actions }, null, 2)); io.emit("config:actions", actions); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  srv.post("/notify", (req, res) => {
    const { title, level = "info" } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    notify(title, level);
    res.json({ ok: true });
  });

  // Plugin system
  const pluginsDir = join(app.getPath("userData"), "plugins");
  const pluginsStatePath = join(app.getPath("userData"), "plugins-state.json");
  const REGISTRY_URL = "https://raw.githubusercontent.com/florextech/deck-plugins/main/registry.json";
  const LOCAL_REGISTRY = [
    { id: "clock", name: "Clock", description: "Shows current time and date", author: "Deck", version: "1.0.0", official: true, tags: ["widget","utility"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/clock.js" },
    { id: "system-monitor", name: "System Monitor", description: "CPU, RAM usage and uptime widget", author: "Deck", version: "1.0.0", official: true, tags: ["widget","system"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/system-monitor.js" },
    { id: "spotify", name: "Spotify", description: "Control Spotify playback and see now playing", author: "Deck", version: "1.0.0", official: true, tags: ["media","music"], platforms: ["macos"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/spotify.js" },
    { id: "pomodoro", name: "Pomodoro Timer", description: "25 min focus timer with notification", author: "Deck", version: "1.0.0", official: true, tags: ["productivity","timer"], platforms: ["macos","windows","linux"], url: "https://raw.githubusercontent.com/florextech/deck/main/plugins-available/pomodoro.js" },
  ];

  function loadPluginsState() { try { return JSON.parse(readFileSync(pluginsStatePath, "utf-8")); } catch { return {}; } }
  function savePluginsState(state) { writeFileSync(pluginsStatePath, JSON.stringify(state, null, 2)); }
  function currentPlatform() { return os === "darwin" ? "macos" : os === "win32" ? "windows" : "linux"; }

  srv.get("/plugins/store", async (_, res) => {
    const installed = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter(f => f.endsWith(".js")).map(f => f.replace(".js", "")) : [];
    const state = loadPluginsState();
    const platform = currentPlatform();
    let registryPlugins = LOCAL_REGISTRY;
    try {
      const raw = await httpsGet(REGISTRY_URL);
      const data = JSON.parse(raw);
      if (data.plugins && data.plugins.length) registryPlugins = data.plugins;
      log(`Registry loaded: ${registryPlugins.length} plugins`);
    } catch (e) { log(`Registry fetch failed: ${e.message}`); }
    const plugins = registryPlugins.map(p => ({ ...p, installed: installed.includes(p.id), disabled: !!state[p.id]?.disabled, currentPlatform: platform }));
    for (const id of installed) { if (!plugins.find(p => p.id === id)) plugins.push({ id, name: id, description: "Installed locally", installed: true, disabled: !!state[id]?.disabled, currentPlatform: platform }); }
    res.json({ plugins });
  });

  srv.post("/plugins/toggle", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const state = loadPluginsState();
    state[id] = { disabled: !state[id]?.disabled };
    savePluginsState(state);
    res.json({ ok: true, disabled: state[id].disabled });
  });

  srv.post("/plugins/install", async (req, res) => {
    try {
      const { id, url, platforms } = req.body;
      if (!id || !url) return res.status(400).json({ error: "id and url required" });
      if (platforms && platforms.length && !platforms.includes(currentPlatform())) return res.status(400).json({ error: `Not supported on ${currentPlatform()}` });
      if (!url.startsWith("https://raw.githubusercontent.com/")) return res.status(403).json({ error: "Only GitHub raw URLs allowed" });
      log(`Installing plugin: ${id} from ${url}`);
      const code = await httpsGet(url);
      if (!code.includes("module.exports") || !code.includes("setup")) return res.status(400).json({ error: "Invalid plugin" });
      const { mkdirSync } = require("fs");
      if (!existsSync(pluginsDir)) mkdirSync(pluginsDir, { recursive: true });
      writeFileSync(join(pluginsDir, `${id}.js`), code);
      res.json({ ok: true }); log(`Plugin installed: ${req.body.id}`);
    } catch (e) { log(`Install error: ${e.message}`); res.status(500).json({ error: e.message }); }
  });

  srv.post("/plugins/uninstall", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id required" });
    const filePath = join(pluginsDir, `${id}.js`);
    if (existsSync(filePath)) { const { unlinkSync } = require("fs"); unlinkSync(filePath); }
    res.json({ ok: true });
  });

  srv.post("/plugins/reload", (_, res) => { log("Plugins reload requested"); res.json({ ok: true }); });
  srv.get("/widgets", (_, res) => { res.json({}); });
  srv.get("/logs", (_, res) => { res.json({ logs }); });

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`[deck] :${PORT}`));

  // App detection
  function detectApps() {
    if (os !== "darwin") return [];
    const dirs = ["/Applications", "/System/Applications"];
    const iconUrls = { "Google Chrome": "https://cdn.simpleicons.org/googlechrome", "Firefox": "https://cdn.simpleicons.org/firefox", "Safari": "https://cdn.simpleicons.org/safari", "Visual Studio Code": "https://cdn.simpleicons.org/vscodium", "Slack": "https://cdn.simpleicons.org/slack", "Discord": "https://cdn.simpleicons.org/discord", "Spotify": "https://cdn.simpleicons.org/spotify", "Docker Desktop": "https://cdn.simpleicons.org/docker", "Figma": "https://cdn.simpleicons.org/figma", "Notion": "https://cdn.simpleicons.org/notion", "Telegram": "https://cdn.simpleicons.org/telegram" };
    const apps = [];
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      try { for (const f of readdirSync(dir).filter(f => f.endsWith(".app"))) { const name = f.replace(".app", ""); apps.push({ name, icon: iconUrls[name] || "", command: `open -a "${name}"` }); } } catch {}
    }
    return apps.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Window
  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;

  win = new BrowserWindow({ width: 900, height: 700, minWidth: 400, minHeight: 500, resizable: true, titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 12 }, backgroundColor: "#09090b" });
  setTimeout(() => {
    const loadPage = () => {
      win.loadURL(`http://localhost:${PORT}`).catch(() => {
        setTimeout(loadPage, 500);
      });
    };
    loadPage();
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS('body { padding-top: 38px !important; } body::before { content:""; position:fixed; top:0; left:0; right:0; height:38px; -webkit-app-region:drag; z-index:9999; }');
    });
  }, 2000);

  // Tray
  try {
    const trayIcon = join(__dirname, "build", "tray-icon.png");
    if (existsSync(trayIcon)) {
      tray = new Tray(trayIcon);
      tray.setToolTip("Deck");
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: `Open: ${url}`, click: () => shell.openExternal(url) },
        { label: "Quit", click: () => app.quit() },
      ]));
    }
  } catch (e) { console.log("Tray:", e.message); }

  // Auto-update
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win, { type: 'info', title: 'Update ready', message: `v${info.version} downloaded. Restart to update?`, buttons: ['Restart', 'Later'] }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.checkForUpdates().catch(() => {});

  console.log(`Deck running at: ${url}`);
});

app.on("window-all-closed", () => {});
