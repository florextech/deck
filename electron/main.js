const { app, BrowserWindow, Tray, Menu, shell, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const { networkInterfaces } = require("os");
const { exec } = require("child_process");
const { readdirSync, existsSync, readFileSync, writeFileSync, watchFile } = require("fs");
const { join } = require("path");
const path = require("path");
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");

const PORT = 4000;
let win = null;
let tray = null;
const os = require("os").platform();

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
    res.json({ status: "ok", agent: true, actions: actions.length, isLocal, url: `http://${ip}:${PORT}` });
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

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`[deck] :${PORT}`));

  // App detection
  function detectApps() {
    if (os !== "darwin") return [];
    const dirs = ["/Applications", "/System/Applications"];
    const iconUrls = { "Google Chrome": "https://cdn.simpleicons.org/googlechrome", "Firefox": "https://cdn.simpleicons.org/firefox", "Safari": "https://cdn.simpleicons.org/safari", "Visual Studio Code": "https://cdn.simpleicons.org/visualstudiocode", "Slack": "https://cdn.simpleicons.org/slack", "Discord": "https://cdn.simpleicons.org/discord", "Spotify": "https://cdn.simpleicons.org/spotify", "Docker Desktop": "https://cdn.simpleicons.org/docker", "Figma": "https://cdn.simpleicons.org/figma", "Notion": "https://cdn.simpleicons.org/notion", "Telegram": "https://cdn.simpleicons.org/telegram" };
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
    win.loadURL(`http://localhost:${PORT}`);
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS('body { padding-top: 38px !important; }');
    });
  }, 1500);

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
