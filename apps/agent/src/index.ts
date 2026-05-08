import { io } from "socket.io-client";
import { exec, execSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { platform, homedir } from "node:os";
import type { DeckAction } from "@open-deck/shared";

const SERVER = process.env.SERVER_URL || "http://localhost:4000";
const os = platform();

console.log(`[agent] Connecting to ${SERVER}...`);

const socket = io(SERVER, { transports: ["websocket"], query: { role: "agent" } });

socket.on("connect", () => {
  console.log("[agent] Connected ✓");
  notify("Agent connected", "success");
  startNotificationWatcher();
});
socket.on("disconnect", () => console.log("[agent] Disconnected"));

// Execute actions from tablet
socket.on("action:run" as string, (action: DeckAction) => {
  console.log(`[agent] → ${action.label} (${action.type})`);
  switch (action.payload.type) {
    case "url": openUrl(action.payload.url); break;
    case "copy": copyToClipboard(action.payload.text); break;
    case "command": runCommand(action.payload.command); break;
    case "shortcut": runShortcut(action.payload.keys); break;
  }
});

// Respond with installed apps
socket.on("apps:list" as string, () => {
  const apps = detectApps();
  socket.emit("apps:result" as string, apps as never);
});

/* ─── Actions ─── */
function openUrl(url: string) {
  const cmd = os === "darwin" ? `open "${url}"` : os === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) notify(`❌ Failed to open URL`, "error");
    else notify(`🌐 Opened URL`, "success");
  });
}

function copyToClipboard(text: string) {
  const cmd = os === "darwin" ? "pbcopy" : os === "win32" ? "clip" : "xclip -selection clipboard";
  const child = exec(cmd, (err) => {
    if (err) notify(`❌ Copy failed`, "error");
    else notify(`📋 Copied!`, "success");
  });
  child.stdin?.write(text);
  child.stdin?.end();
}

function runCommand(command: string) {
  exec(command, { shell: os === "win32" ? "cmd.exe" : "/bin/bash", timeout: 30000 }, (err, stdout) => {
    if (err) notify(`❌ ${command.slice(0, 30)}...`, "error");
    else notify(`✓ ${command.slice(0, 30)}${stdout ? " → " + stdout.trim().slice(0, 20) : ""}`, "success");
  });
}

function runShortcut(keys: string) {
  // keys format: "cmd+shift+a" or "ctrl+alt+t"
  let cmd: string;
  if (os === "darwin") {
    // Use osascript to simulate key press
    const keyMap: Record<string, string> = { cmd: "command down", shift: "shift down", alt: "option down", ctrl: "control down" };
    const parts = keys.toLowerCase().split("+");
    const key = parts.pop() ?? "";
    const modifiers = parts.map(m => keyMap[m] || `${m} down`).join(", ");
    cmd = `osascript -e 'tell application "System Events" to keystroke "${key}" using {${modifiers}}'`;
  } else if (os === "win32") {
    // Use PowerShell SendKeys
    const keyMap: Record<string, string> = { ctrl: "^", alt: "%", shift: "+" };
    const parts = keys.toLowerCase().split("+");
    const key = parts.pop() ?? "";
    const mods = parts.map(m => keyMap[m] || "").join("");
    cmd = `powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${mods}${key}')"`;
  } else {
    // xdotool on Linux
    cmd = `xdotool key ${keys.replace(/\+/g, "+")}`;
  }
  exec(cmd, (err) => {
    if (err) notify(`❌ Shortcut failed`, "error");
    else notify(`⌨️ ${keys}`, "success");
  });
}

function notify(title: string, level: string) {
  fetch(`${SERVER}/notify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, level }) }).catch(() => {});
}

/* ─── App Detection ─── */
interface DetectedApp { name: string; icon: string; command: string }

function detectApps(): DetectedApp[] {
  if (os === "darwin") return detectMacApps();
  if (os === "win32") return detectWindowsApps();
  return detectLinuxApps();
}

function detectMacApps(): DetectedApp[] {
  const dirs = ["/Applications", "/System/Applications", `${process.env.HOME}/Applications`];
  const apps: DetectedApp[] = [];
  const iconMap: Record<string, string> = {
    "Google Chrome": "https://cdn.simpleicons.org/googlechrome",
    "Firefox": "https://cdn.simpleicons.org/firefox",
    "Safari": "https://cdn.simpleicons.org/safari",
    "Arc": "https://cdn.simpleicons.org/arc",
    "Visual Studio Code": "https://cdn.simpleicons.org/vscodium",
    "Cursor": "https://cdn.simpleicons.org/cursor",
    "Slack": "https://cdn.simpleicons.org/slack",
    "Discord": "https://cdn.simpleicons.org/discord",
    "Telegram": "https://cdn.simpleicons.org/telegram",
    "WhatsApp": "https://cdn.simpleicons.org/whatsapp",
    "Spotify": "https://cdn.simpleicons.org/spotify",
    "Docker Desktop": "https://cdn.simpleicons.org/docker",
    "Figma": "https://cdn.simpleicons.org/figma",
    "Notion": "https://cdn.simpleicons.org/notion",
    "Postman": "https://cdn.simpleicons.org/postman",
    "Zoom": "https://cdn.simpleicons.org/zoom",
    "iTerm": "https://cdn.simpleicons.org/iterm2",
    "Warp": "https://cdn.simpleicons.org/warp",
    "OBS": "https://cdn.simpleicons.org/obsstudio",
    "1Password": "https://cdn.simpleicons.org/1password",
    "Xcode": "https://cdn.simpleicons.org/xcode",
  };

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir).filter((f) => f.endsWith(".app"));
      for (const entry of entries) {
        const name = entry.replace(".app", "");
        const icon = iconMap[name] ?? "";
        apps.push({ name, icon, command: `open -a "${name}"` });
      }
    } catch { /* skip */ }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

function detectWindowsApps(): DetectedApp[] {
  // Common Windows apps by shortcut
  return [
    { name: "Chrome", icon: "🌐", command: "start chrome" },
    { name: "VS Code", icon: "💻", command: "code" },
    { name: "Explorer", icon: "📁", command: "explorer" },
    { name: "Terminal", icon: "⬛", command: "wt" },
    { name: "Notepad", icon: "📝", command: "notepad" },
  ];
}

function detectLinuxApps(): DetectedApp[] {
  return [
    { name: "Firefox", icon: "🦊", command: "firefox" },
    { name: "Files", icon: "📁", command: "nautilus" },
    { name: "Terminal", icon: "⬛", command: "gnome-terminal" },
    { name: "VS Code", icon: "💻", command: "code" },
  ];
}

/* ─── System Notification Watcher ─── */
let lastNotifTimestamp = Date.now() * 1000000;

function startNotificationWatcher() {
  if (os === "darwin") startMacWatcher();
  else if (os === "win32") startWindowsWatcher();
  else startLinuxWatcher();
}

function startMacWatcher() {
  const dbPath = `${homedir()}/Library/Group Containers/group.com.apple.usernoted/db2/db`;
  if (!existsSync(dbPath)) {
    console.log("[agent] macOS notification DB not found");
    return;
  }
  console.log("[agent] Watching macOS notifications...");

  setInterval(() => {
    try {
      const query = `SELECT rec.app_id, rec.delivered_date, attr.value FROM record AS rec JOIN attribute AS attr ON attr.record_id = rec.rec_id WHERE rec.delivered_date > ${lastNotifTimestamp / 1000000000} AND attr.key = 'titl' ORDER BY rec.delivered_date DESC LIMIT 5;`;
      const result = execSync(`sqlite3 "${dbPath}" "${query}" 2>/dev/null`, { encoding: "utf-8", timeout: 3000 }).trim();
      if (!result) return;
      for (const line of result.split("\n").reverse()) {
        const parts = line.split("|");
        if (parts.length < 3) continue;
        const appName = (parts[0] ?? "").split(".").pop() ?? "";
        const title = parts[2] ?? "";
        if (title) notify(`${appName}: ${title}`, "info");
      }
      lastNotifTimestamp = Date.now() * 1000000;
    } catch { /* ignore */ }
  }, 5000);
}

function startWindowsWatcher() {
  // Windows: use PowerShell to read notification history
  console.log("[agent] Watching Windows notifications...");
  let lastCheck = new Date().toISOString();

  setInterval(() => {
    try {
      const ps = `Get-WinEvent -LogName 'Microsoft-Windows-PushNotification-Platform/Operational' -MaxEvents 5 -ErrorAction SilentlyContinue | Where-Object { $_.TimeCreated -gt '${lastCheck}' } | Select-Object -ExpandProperty Message`;
      const result = execSync(`powershell -Command "${ps}"`, { encoding: "utf-8", timeout: 5000 }).trim();
      if (result) {
        for (const line of result.split("\n").filter(Boolean).slice(0, 3)) {
          notify(line.slice(0, 80), "info");
        }
      }
      lastCheck = new Date().toISOString();
    } catch { /* ignore - may need admin or event log may not exist */ }
  }, 5000);
}

function startLinuxWatcher() {
  // Linux: monitor dbus notifications via dbus-monitor
  console.log("[agent] Watching Linux notifications (dbus)...");

  const child = exec(
    `dbus-monitor "interface='org.freedesktop.Notifications',member='Notify'" 2>/dev/null`,
    { shell: "/bin/bash" }
  );

  let buffer = "";
  child.stdout?.on("data", (data: string) => {
    buffer += data;
    // Extract notification body from dbus output
    const matches = buffer.match(/string "([^"]{2,80})"/g);
    if (matches && matches.length >= 3) {
      // Usually: app_name, replaces_id, icon, summary, body
      const summary = matches[2]?.replace(/^string "/, "").replace(/"$/, "");
      const appName = matches[0]?.replace(/^string "/, "").replace(/"$/, "");
      if (summary) notify(`${appName}: ${summary}`, "info");
      buffer = "";
    }
    if (buffer.length > 2000) buffer = "";
  });
}
