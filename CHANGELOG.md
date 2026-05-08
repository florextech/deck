# Changelog

All notable changes to this project will be documented in this file.

## [0.6.0] - 2026-05-08

### Added
- Enable/disable plugins without uninstalling (toggle in plugin store)
- Platform support field for plugins (macOS, Windows, Linux badges)
- Platform validation on plugin install (warns if unsupported)

### Fixed
- ESLint errors: removed stale `require()` import, fixed ignore patterns for dist/

## [0.3.0] - 2026-05-07

### Added
- Event delegation for all click handlers (more robust)
- Pinned Lucide CDN version for stability

### Fixed
- App picker crashes with special characters in app names
- Inline onerror causing SyntaxError
- Extra closing brace breaking JS
- Deprecated meta tag warning
- VS Code icon 404
- Electron: merged server+agent into single process (reliable execution)
- Electron: retry page load if server not ready

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
