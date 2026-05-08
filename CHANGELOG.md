# Changelog

All notable changes to this project will be documented in this file.

## [0.2.1] - 2026-05-07

### Added
- Silent auto-update via electron-updater (downloads in background, asks to restart)
- QR code endpoint server-side (`/qr`) for reliable rendering
- Docker image on release (`ghcr.io/florextech/deck`)
- Version auto-set from git tag in CI

### Fixed
- QR not showing in Electron app
- macOS titlebar overlapping UI
- Host detection in Electron (localhost = always host)
- Windows CI build (bash shell for version step)
- Duplicate health endpoint causing crash

## [0.2.0] - 2026-05-07

### Added
- Connect tab with QR code for tablet pairing
- Update checker in Settings
- Execution feedback (green/red flash on tiles)
- Confirmation dialog for dangerous actions
- Categories with horizontal filter tabs
- Drag & drop reorder (host only)
- i18n: English and Español
- 8 themes (Midnight, Ocean, Ember, Forest, Rose, Ice, Gold, Crimson)
- Multi-workspace support
- Network scan to discover Deck instances
- Role-based access (PC configures, tablet executes)
- Lucide icons (no emojis)
- Notification sound with toggle
- Port auto-fallback if 4000 is busy

## [0.1.0] - 2026-05-07

### Added
- Initial release
- Action grid with configurable buttons
- Real-time notifications from PC (macOS, Windows, Linux)
- Desktop agent with app detection
- PWA support
- Electron installer (.dmg, .exe, AppImage)
- Hot-reload config file
- REST API for notifications (`POST /notify`)
- QR code on terminal startup
