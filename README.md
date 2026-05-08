# Deck

Stream Deck for your tablet. Configure buttons that execute actions on your PC.

## How it works

```
Tablet/Phone  ──ws──▶  Server (:4000)  ──ws──▶  Desktop Agent (your PC)
   (browser)            serves UI +              executes: open apps,
   tap buttons          relays commands          copy text, run commands
                        + notifications          + captures PC notifications
```

## Quick Start

```bash
git clone https://github.com/florextech/deck.git
cd deck
pnpm install
pnpm dev
```

Scan the QR code shown in terminal with your tablet.

## Tutorial

### 1. First run

After `pnpm dev`, you'll see a QR code in your terminal. Scan it with your tablet's camera to open Deck.

### 2. Add your first action (from PC)

1. Open `http://localhost:4000` on your PC
2. Tap **Config** at the bottom
3. Tap **+ Add action**
4. Choose a type:
   - **Open a link** → paste any URL
   - **Copy text** → text that gets copied to your PC clipboard
   - **Run command** → any terminal command
   - **Open app** → pick from detected apps
5. Give it a name → **Add to deck**

### 3. Use from tablet

Switch to the **Deck** tab and tap your buttons. They execute on your PC instantly.

### 4. Customize

In **Config → Settings** you can:
- Change theme (8 options)
- Toggle notification sound
- Switch language (English/Español)
- Add more PCs (workspaces)

### 5. Install as app (PWA)

On your tablet in Chrome: menu ⋮ → "Add to Home screen". Opens fullscreen without browser bars.

## Features

- **Action grid** — configurable buttons that execute on your PC
- **Notifications** — real-time PC notifications on your tablet (macOS, Windows, Linux)
- **Multi-workspace** — connect one tablet to multiple PCs, switch between them
- **Themes** — 8 themes (Midnight, Ocean, Ember, Forest, Rose, Ice, Gold, Crimson)
- **i18n** — English and Spanish
- **Sound** — notification sound with toggle
- **App detection** — auto-detects installed apps on your PC
- **Network scan** — auto-discover other PCs running Deck
- **Roles** — PC can configure, tablet can only execute
- **PWA** — install as fullscreen app on tablet
- **Installer** — generate .dmg/.exe with Electron

## Configure

**From the PC:** Open `http://localhost:4000` → Config → Actions → Add

**From a file:** Edit `deck.config.json`:

```json
{
  "actions": [
    { "id": "1", "label": "GitHub", "type": "url", "payload": { "type": "url", "url": "https://github.com" } },
    { "id": "2", "label": "Copy Key", "type": "copy", "payload": { "type": "copy", "text": "my-key" } },
    { "id": "3", "label": "Deploy", "type": "command", "payload": { "type": "command", "command": "cd ~/app && pnpm deploy" } }
  ]
}
```

## Send notifications

```bash
curl -X POST http://localhost:4000/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy done", "level": "success"}'
```

Or use the helper: `./scripts/deck-notify "message" level`

## Build installer (no Docker needed)

```bash
pnpm build:installer       # Mac (.dmg)
pnpm build:installer:win   # Windows (.exe)
```

### macOS: "Deck.app is damaged and can't be opened"

This happens because the app is not signed with an Apple Developer certificate. Run this after installing:

```bash
xattr -cr /Applications/Deck.app
```

Then open the app normally.

## Structure

```
deck.config.json    ← your buttons
apps/
  server/           ← serves UI + WebSocket relay
  agent/            ← runs on PC, executes commands + captures notifications
electron/           ← Electron wrapper for installer
```

## Scripts

```bash
pnpm dev              # server + agent (shows QR)
pnpm test             # tests
pnpm lint             # eslint
pnpm typecheck        # typescript
pnpm build:installer  # .dmg/.exe
```

## License

MIT
