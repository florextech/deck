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
  if (os === "darwin") startNotificationWatcher();
});
socket.on("disconnect", () => console.log("[agent] Disconnected"));

// Execute actions from tablet
socket.on("action:run" as string, (action: DeckAction) => {
  console.log(`[agent] → ${action.label} (${action.type})`);
  switch (action.payload.type) {
    case "url": openUrl(action.payload.url); break;
    case "copy": copyToClipboard(action.payload.text); break;
    case "command": runCommand(action.payload.command); break;
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
    "Google Chrome": "🌐", "Firefox": "🦊", "Safari": "🧭", "Arc": "🌈",
    "Visual Studio Code": "💻", "Cursor": "💻", "Xcode": "🔨",
    "Slack": "💬", "Discord": "🎮", "Telegram": "✈️", "WhatsApp": "📱",
    "Spotify": "🎵", "Music": "🎵", "Podcasts": "🎙️",
    "Terminal": "⬛", "iTerm": "⬛", "Warp": "⬛", "Alacritty": "⬛",
    "Finder": "📁", "Notes": "📝", "Notion": "📝",
    "Figma": "🎨", "Sketch": "🎨",
    "Docker Desktop": "🐳", "Postman": "📡",
    "System Preferences": "⚙️", "System Settings": "⚙️",
    "Preview": "🖼️", "Photos": "🖼️",
    "Calendar": "📅", "Mail": "📧",
    "1Password": "🔐", "Bitwarden": "🔐",
    "OBS": "📹", "Zoom": "📹", "Teams": "📹",
  };

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir).filter((f) => f.endsWith(".app"));
      for (const entry of entries) {
        const name = entry.replace(".app", "");
        const icon = iconMap[name] ?? "📦";
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

/* ─── macOS System Notification Watcher ─── */
let lastNotifTimestamp = Date.now() * 1000000; // nanoseconds

function startNotificationWatcher() {
  const dbPath = `${homedir()}/Library/Group Containers/group.com.apple.usernoted/db2/db`;
  if (!existsSync(dbPath)) {
    console.log("[agent] Notification DB not found, skipping watcher");
    return;
  }

  console.log("[agent] Watching macOS notifications...");

  setInterval(() => {
    try {
      const query = `SELECT rec.app_id, rec.delivered_date, attr.value 
        FROM record AS rec 
        JOIN attribute AS attr ON attr.record_id = rec.rec_id 
        WHERE rec.delivered_date > ${lastNotifTimestamp / 1000000000} 
        AND attr.key = 'titl'
        ORDER BY rec.delivered_date DESC 
        LIMIT 5;`;

      const result = execSync(
        `sqlite3 "${dbPath}" "${query}" 2>/dev/null`,
        { encoding: "utf-8", timeout: 3000 }
      ).trim();

      if (!result) return;

      const lines = result.split("\n");
      for (const line of lines.reverse()) {
        const parts = line.split("|");
        if (parts.length < 3) continue;
        const appId = parts[0] ?? "";
        const title = parts[2] ?? "";
        if (!title) continue;

        const appName = appId.split(".").pop() ?? appId;
        notify(`${appName}: ${title}`, "info");
      }

      lastNotifTimestamp = Date.now() * 1000000;
    } catch {
      // silently ignore errors
    }
  }, 5000);
}
