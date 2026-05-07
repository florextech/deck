import { io } from "socket.io-client";
import { exec } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { platform } from "node:os";
import type { DeckAction } from "@open-deck/shared";

const SERVER = process.env.SERVER_URL || "http://localhost:4000";
const os = platform();

console.log(`[agent] Connecting to ${SERVER}...`);

const socket = io(SERVER, { transports: ["websocket"], query: { role: "agent" } });

socket.on("connect", () => console.log("[agent] Connected ✓"));
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
