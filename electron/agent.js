const { io } = require("socket.io-client");
const { exec } = require("child_process");
const { readdirSync, existsSync } = require("fs");
const { platform } = require("os");

const SERVER = process.env.SERVER_URL || "http://localhost:4000";
const os = platform();

const socket = io(SERVER, { transports: ["websocket"], query: { role: "agent" } });
socket.on("connect", () => console.log("[agent] connected"));

socket.on("action:run", (action) => {
  switch (action.payload.type) {
    case "url": openUrl(action.payload.url); break;
    case "copy": copyText(action.payload.text); break;
    case "command": runCmd(action.payload.command); break;
  }
});

socket.on("apps:list", () => socket.emit("apps:result", detectApps()));

function openUrl(url) {
  const cmd = os === "darwin" ? `open "${url}"` : os === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
  notify("Opened URL", "success");
}

function copyText(text) {
  const cmd = os === "darwin" ? "pbcopy" : os === "win32" ? "clip" : "xclip -selection clipboard";
  const c = exec(cmd); c.stdin.write(text); c.stdin.end();
  notify("Copied!", "success");
}

function runCmd(command) {
  exec(command, { shell: os === "win32" ? "cmd.exe" : "/bin/bash", timeout: 30000 }, (err) => {
    notify(err ? `❌ ${command.slice(0, 30)}` : `✓ ${command.slice(0, 30)}`, err ? "error" : "success");
  });
}

function notify(title, level) {
  fetch(`${SERVER}/notify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, level }) }).catch(() => {});
}

function detectApps() {
  if (os !== "darwin") return [];
  const dirs = ["/Applications", "/System/Applications"];
  const icons = { "Google Chrome": "🌐", "Firefox": "🦊", "Safari": "🧭", "Visual Studio Code": "💻", "Slack": "💬", "Spotify": "🎵", "Terminal": "⬛", "Finder": "📁", "Docker Desktop": "🐳", "Figma": "🎨", "Discord": "🎮", "Notion": "📝" };
  const apps = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir).filter(f => f.endsWith(".app"))) {
        const name = f.replace(".app", "");
        apps.push({ name, icon: icons[name] || "📦", command: `open -a "${name}"` });
      }
    } catch {}
  }
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
