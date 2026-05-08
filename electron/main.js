const { app, BrowserWindow, Tray, Menu, shell } = require("electron");
const { fork } = require("child_process");
const { networkInterfaces } = require("os");
const path = require("path");

const PORT = 4000;
let tray = null;
let serverProcess = null;
let agentProcess = null;
let win = null;

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

function getResourcePath(file) {
  // In packaged app, files are in app.asar or resources
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", file);
  }
  return path.join(__dirname, file);
}

app.whenReady().then(() => {
  const serverPath = getResourcePath("server.js");
  const agentPath = getResourcePath("agent.js");
  const configPath = app.isPackaged
    ? path.join(app.getPath("userData"), "deck.config.json")
    : path.join(__dirname, "deck.config.json");

  // Copy default config if not exists
  const fs = require("fs");
  if (!fs.existsSync(configPath)) {
    const defaultConfig = getResourcePath("deck.config.json");
    if (fs.existsSync(defaultConfig)) fs.copyFileSync(defaultConfig, configPath);
    else fs.writeFileSync(configPath, JSON.stringify({ actions: [] }, null, 2));
  }

  // Start server
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, PORT: String(PORT), CONFIG_PATH: configPath },
    silent: true,
  });
  serverProcess.stdout?.on("data", (d) => console.log(`[server] ${d}`));
  serverProcess.stderr?.on("data", (d) => console.error(`[server] ${d}`));

  // Start agent
  agentProcess = fork(agentPath, [], {
    env: { ...process.env, SERVER_URL: `http://localhost:${PORT}` },
    silent: true,
  });

  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;
  console.log(`Deck running at: ${url}`);

  // Window
  win = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#09090b",
  });

  win.loadURL(`data:text/html,
    <body style="background:#09090b;color:#fafafa;font-family:-apple-system,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:12px">
      <h2 style="font-size:18px;font-weight:600;margin:0">Deck is running</h2>
      <p style="color:#71717a;font-size:13px;margin:0">Open on your tablet:</p>
      <code style="background:#18181b;padding:10px 20px;border-radius:10px;font-size:15px;color:#a78bfa">${url}</code>
      <p style="color:#52525b;font-size:11px;margin-top:8px">Config: ${configPath.replace(/'/g, "\\'")}</p>
    </body>
  `);

  // Tray
  try {
    const trayIcon = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar", "build", "tray-icon.png")
      : path.join(__dirname, "build", "tray-icon.png");
    tray = new Tray(trayIcon);
    tray.setToolTip("Deck");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `Open: ${url}`, click: () => shell.openExternal(url) },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]));
  } catch (e) {
    console.log("Tray icon not available:", e.message);
  }
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
  if (agentProcess) agentProcess.kill();
});

app.on("window-all-closed", () => {
  // Keep running in tray
});
