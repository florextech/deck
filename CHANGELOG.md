# Changelog

## v0.2.0 (2026-05-07)

### Features
- QR code in Connect tab for easy tablet pairing
- Auto-update checker in Settings (checks GitHub releases)
- Docker image published to ghcr.io on release
- Execution feedback (green/red flash on tiles)
- Confirmation dialog for dangerous actions
- Categories with horizontal filter tabs
- Drag & drop reorder (host only)
- i18n: English and Español with all strings translated
- 8 themes (Midnight, Ocean, Ember, Forest, Rose, Ice, Gold, Crimson)
- Multi-workspace support (connect tablet to multiple PCs)
- Network scan to discover Deck instances
- Role-based: PC configures, tablet only executes

### Fixes
- macOS Electron titlebar padding
- Host detection (localhost always = host)
- Port fallback if 4000 is busy
- QR generated server-side (no client-side lib issues)

## v0.1.0 (2026-05-07)

### Features
- Action grid with configurable buttons (open URL, copy text, run command, open app)
- Real-time notification panel (captures macOS, Windows, Linux system notifications)
- Multi-workspace support (connect one tablet to multiple PCs)
- 8 themes (Midnight, Ocean, Ember, Forest, Rose, Ice, Gold, Crimson)
- i18n (English, Español)
- Notification sound with toggle
- Auto-detect installed apps on PC
- Network scan to discover other Deck instances
- Role-based access (PC configures, tablet executes)
- Confirmation dialog for dangerous actions
- Visual feedback on execution (green/red flash)
- Categories with horizontal tabs
- Drag & drop reorder (host only)
- QR code on startup for easy tablet connection
- PWA support (fullscreen on tablet)
- Electron installer (.dmg, .exe, AppImage)
- Auto port fallback if 4000 is busy
- Hot-reload config file
- REST API for sending notifications (`POST /notify`)
