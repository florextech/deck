# Contributing to Deck

Thanks for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/florextech/deck.git
cd deck
pnpm install
pnpm dev
```

## Development

- `pnpm dev` — runs server + agent with QR code
- `pnpm test` — runs tests
- `pnpm lint` — runs ESLint
- `pnpm typecheck` — checks TypeScript

## Project Structure

```
apps/server/    → Express + Socket.IO server (serves UI)
apps/agent/     → Desktop agent (executes commands, captures notifications)
packages/shared → Shared TypeScript types
electron/       → Electron wrapper for installers
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding tests
- `chore:` maintenance

## Pull Requests

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Commit your changes
4. Push and open a PR

## Adding a new theme

Edit `apps/server/public/index.html`:

1. Add a new `[data-theme="your-theme"]` CSS block with your colors
2. Add the theme to the `themes` array in `renderSettings()`

## Adding a new language

Edit the `i18n` object in `apps/server/public/index.html`:

1. Add a new language key (e.g. `fr: { ... }`)
2. Add a button in `renderSettings()` for the new language

## Issues

Feel free to open issues for bugs, feature requests, or questions.
