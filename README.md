# Deck

Stream Deck for your tablet. Configure buttons on your phone/tablet that execute actions on your PC.

## How it works

```
Tablet/Phone  ──ws──▶  Server (:4000)  ──ws──▶  Desktop Agent (your PC)
   (browser)            relays commands           executes: open apps,
   tap buttons          serves UI                 copy text, run commands
```

## Quick Start

```bash
pnpm install
pnpm dev
```

Scan the QR code shown in terminal with your tablet. Done.

## Configure

**From the tablet:** Tap Config → Add action → pick type → done.

**From a file:** Edit `deck.config.json`:

```json
{
  "actions": [
    { "id": "1", "label": "GitHub", "type": "url", "payload": { "type": "url", "url": "https://github.com" } },
    { "id": "2", "label": "Copy Key", "type": "copy", "payload": { "type": "copy", "text": "my-ssh-key" } },
    { "id": "3", "label": "Deploy", "type": "command", "payload": { "type": "command", "command": "cd ~/app && pnpm deploy" } }
  ]
}
```

Hot-reload: save the file → buttons update instantly on the tablet.

## Send notifications to tablet

```bash
curl -X POST http://localhost:4000/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy done ✓", "level": "success"}'
```

## Install as standalone (no Docker needed)

```bash
pnpm build:standalone
```

This creates a single executable in `dist/` that you can run anywhere without Node.js installed.

## Structure

```
deck.config.json    ← your buttons (edit this)
apps/
  server/           ← serves UI + WebSocket relay
  agent/            ← runs on PC, executes commands
```

## Scripts

```bash
pnpm dev            # server + agent (shows QR)
pnpm dev:server     # only server
pnpm dev:agent      # only agent
pnpm test           # tests
pnpm build:standalone  # create executable
```

## License

MIT
