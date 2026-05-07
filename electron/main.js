const { app, BrowserWindow, Tray, Menu } = require("electron");
const { fork } = require("child_process");
const { networkInterfaces } = require("os");
const path = require("path");
const qrcode = require("qrcode-terminal");

const PORT = 4000;
let tray = null;
let serverProcess = null;
let agentProcess = null;

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
  // Start server
  serverProcess = fork(path.join(__dirname, "server.js"), [], {
    env: { ...process.env, PORT: String(PORT), CONFIG_PATH: path.join(__dirname, "deck.config.json") },
  });

  // Start agent
  agentProcess = fork(path.join(__dirname, "agent.js"), [], {
    env: { ...process.env, SERVER_URL: `http://localhost:${PORT}` },
  });

  const ip = getLocalIP();
  const url = `http://${ip}:${PORT}`;

  // Show QR in terminal
  console.log(`\n  Deck running at: ${url}\n`);
  qrcode.generate(url, { small: true });

  // System tray
  tray = new Tray(path.join(__dirname, "build", "tray-icon.png"));
  const contextMenu = Menu.buildFromTemplate([
    { label: `Open: ${url}`, click: () => require("electron").shell.openExternal(url) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("Deck");
  tray.setContextMenu(contextMenu);

  // Optional: open a small window
  const win = new BrowserWindow({ width: 400, height: 300, resizable: false, titleBarStyle: "hiddenInset" });
  win.loadURL(`data:text/html,
    <body style="background:#09090b;color:#fafafa;font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0">
      <h2 style="font-size:18px;margin-bottom:8px">Deck is running</h2>
      <p style="color:#71717a;font-size:13px;margin-bottom:16px">Open on your tablet:</p>
      <code style="background:#18181b;padding:8px 16px;border-radius:8px;font-size:14px;color:#a78bfa">${url}</code>
      <p style="color:#52525b;font-size:11px;margin-top:20px">Or scan the QR code in terminal</p>
    </body>
  `);
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
  if (agentProcess) agentProcess.kill();
});

app.on("window-all-closed", (e) => e.preventDefault());
