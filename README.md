# Open Deck

**Stream Deck para tu tablet** — Accesos rápidos configurables que ejecutan comandos en tu PC.

## Cómo funciona

```
┌─────────────┐         ┌──────────┐         ┌──────────────┐
│  Tablet     │ ──ws──▶ │  Server  │ ──ws──▶ │ Desktop Agent│
│  (PWA)      │ ◀──ws── │ :4000    │ ◀──ws── │ (tu PC)      │
└─────────────┘         └──────────┘         └──────────────┘
   Grilla de              Reenvía              Ejecuta:
   botones +              comandos +           - Copiar al clipboard
   notificaciones         notificaciones       - Abrir URLs
                                               - Ejecutar comandos
```

## Setup

```bash
pnpm install
pnpm dev
```

Eso levanta:
- **Web** → http://localhost:3100 (abrir en la tablet)
- **Server** → http://localhost:4000
- **Agent** → se conecta al server y ejecuta comandos en tu PC

## Configurar acciones

Edita `deck.config.json` en la raíz:

```json
{
  "actions": [
    { "id": "1", "label": "GitHub", "icon": "🐙", "type": "url", "payload": { "type": "url", "url": "https://github.com" } },
    { "id": "2", "label": "Copy SSH", "icon": "🔑", "type": "copy", "payload": { "type": "copy", "text": "tu-ssh-key" } },
    { "id": "3", "label": "Deploy", "icon": "🚀", "type": "command", "payload": { "type": "command", "command": "cd ~/app && pnpm deploy" } }
  ]
}
```

**Hot-reload**: al guardar el archivo, los botones se actualizan automáticamente en la tablet.

### Tipos de acciones

| Tipo | Qué hace |
|------|----------|
| `url` | Abre una URL en el navegador del PC |
| `copy` | Copia texto al clipboard del PC |
| `command` | Ejecuta un comando en la terminal del PC |

### Opciones por acción

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| `id` | ✓ | ID único |
| `label` | ✓ | Texto del botón |
| `icon` | | Emoji del botón |
| `type` | ✓ | `url`, `copy`, o `command` |
| `payload` | ✓ | Datos de la acción |
| `color` | | Color del borde (hex) |

## Enviar notificaciones a la tablet

Desde cualquier script o CI:

```bash
curl -X POST http://localhost:4000/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Deploy completado ✓", "level": "success"}'
```

Levels: `info`, `success`, `warning`, `error`

## Usar desde tablet

1. Abre `http://<tu-ip>:3100` en Chrome/Safari de tu tablet
2. "Add to Home Screen" para modo fullscreen (PWA)
3. Presiona botones → se ejecutan en tu PC

## Estructura

```
open-deck/
├── deck.config.json      ← TUS ACCIONES (edita esto)
├── apps/
│   ├── web/              ← UI (Next.js, se abre en tablet)
│   ├── server/           ← WebSocket relay
│   └── agent/            ← Desktop agent (corre en tu PC)
└── packages/
    └── shared/           ← Tipos TypeScript
```

## Scripts

```bash
pnpm dev          # Todo junto (server + web + agent)
pnpm dev:web      # Solo la UI
pnpm dev:server   # Solo el server
pnpm dev:agent    # Solo el agent
pnpm test         # Tests
pnpm typecheck    # Verificar tipos
```

## Docker

```bash
docker compose up
```

El agent NO va en Docker (necesita acceso al sistema del PC).

## License

MIT © Florex Labs
