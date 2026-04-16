# Androdex

Androdex is a minimal web GUI for coding agents (currently Codex and Claude, more coming soon).

## Installation

> [!WARNING]
> Androdex currently supports Codex and Claude.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

### Run without installing

```bash
npx androdex
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/Robertg761/Androdex-Desktop/releases), or from your favorite package registry.

Package-registry examples below assume the rebranded `androdex` listings have been published; until then, GitHub Releases is the guaranteed install path.

#### Windows (`winget`)

```bash
winget install Androdex.Androdex
```

#### macOS (Homebrew)

```bash
brew install --cask androdex
```

#### Arch Linux (AUR)

```bash
yay -S androdex-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Android convergence note: this repo is now the canonical backend for the Androdex Android client's auth, orchestration snapshot/replay, and thread action contract. See [docs/androdex-android-canonical-architecture.md](./docs/androdex-android-canonical-architecture.md), [docs/androdex-android-client-protocol-surface.md](./docs/androdex-android-client-protocol-surface.md), and [docs/androdex-android-sync-migration-checklist.md](./docs/androdex-android-sync-migration-checklist.md).

Observability guide: [docs/observability.md](./docs/observability.md)

Thread runtime state and reconciliation guide: [docs/orchestration-thread-runtime-state.md](./docs/orchestration-thread-runtime-state.md)

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
