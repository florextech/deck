const { app, BrowserWindow, Tray, Menu, shell } = require("electron");
const { networkInterfaces } = require("os");
const path = require("path");
const fs = require("fs");

const PORT = 4000;
let win = null;
let tray = null;

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
  // Config path
  const configPath = path.join(app.getPath("userData"), "deck.config.json");
  if (!fs.existsSync(configPath)) {
    const defaultConf = path.join(__dirname, "deck.config.json");
    if (fs.existsSync(defaultConf)) fs.copyFileSync(defaultConf, configPath);
    else fs.writeFileSync(configPath, JSON.stringify({ actions: [] }, null, 2));
  }

  // Set env before requiring server/agent
  process.env.PORT = String(PORT);
  process.env.CONFIG_PATH = configPath;
  process.env.SERVER_URL = `http://localhost:${PORT}`;

  // Start server inline
  require("./server.js");

  // Start agent inline (delay to let server start)
  setTimeout(() => require("./agent.js"), 1000);

  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;

  // Window
  win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    resizable: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: "#09090b",
    webPreferences: { nodeIntegration: false },
  });

  // Load the actual deck UI
  setTimeout(() => {
    win.loadURL(`http://localhost:${PORT}`);
  }, 1500);

  // Tray
  try {
    const trayIcon = path.join(__dirname, "build", "tray-icon.png");
    if (fs.existsSync(trayIcon)) {
      tray = new Tray(trayIcon);
      tray.setToolTip("Deck");
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: `Open in browser: ${url}`, click: () => shell.openExternal(url) },
        { label: "Show window", click: () => win?.show() },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]));
    }
  } catch (e) {
    console.log("Tray:", e.message);
  }

  console.log(`Deck running at: ${url}`);
});

app.on("window-all-closed", () => {
  // Keep running
});
