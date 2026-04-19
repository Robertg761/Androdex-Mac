# Architecture

This document describes the intended architecture for the core app and the dependency rules that keep the repo easy to evolve.

## Package Roles

### `packages/contracts`

- Schema and TypeScript contract boundary only.
- No runtime side effects.
- No app-specific behavior.
- No imports from any app package.
- No imports from `@t3tools/shared`.

### `packages/shared`

- Shared runtime utilities used by multiple apps.
- Explicit subpath exports only.
- May import `@t3tools/contracts`.
- Must not import from apps.
- Must not import React, Electron, or app bootstrap logic.

### `packages/client-runtime`

- Small client-side runtime helpers for scoped refs and environment descriptors.
- May import `@t3tools/contracts`.
- Must stay intentionally small.
- Must not become a general-purpose web state package.

## App Roles

### `apps/server`

- Owns orchestration runtime, provider integration, persistence, HTTP/WS transport, and static web serving.
- Preserve the `Services` / `Layers` split for domain logic.
- Runtime bootstrap and transport composition should live outside the domain folders.

### `apps/web`

- Owns presentation, route composition, client-side projection state, and browser/local environment behavior.
- Shared UI belongs in `components/ui`.
- Feature coordination belongs in `features/*`.
- Routes should stay thin.

### `apps/desktop`

- Owns Electron shell concerns only.
- Backend process lifecycle, updates, window management, desktop bridge IPC, notifications, and desktop-local persistence belong here.

## Dependency Direction Rules

- `contracts` cannot import from any app or from `shared`.
- `shared` can import from `contracts`, but never from apps.
- `client-runtime` can import from `contracts` only unless a very small helper is explicitly promoted.
- `web` cannot import runtime logic from `desktop`.
- `desktop` cannot import runtime logic from `web`.
- `server` cannot import runtime logic from `web`.
- UI code should consume store public entrypoints only, not store internals.

## Core App Structure

### Server

- `runtime/`: server bootstrap, layer bundles, route composition
- `transports/`: HTTP and WS transport modules
- existing domain folders stay responsible for domain logic

### Web

- `features/thread/`: thread route coordination, thread actions, terminal coordination
- `features/composer/`: send pipeline, pending-input behavior, draft orchestration
- `features/sidebar/`: sidebar selectors and actions
- `features/diff/`: diff route state and rendering composition
- `features/settings/`: settings screen behavior
- `store/`: domain reducers, state helpers, selectors, public store entrypoint

### Desktop

- `bootstrap/`: app startup composition
- `backend/`: backend process lifecycle and readiness
- `ipc/`: IPC channels and registration
- `window/`: BrowserWindow lifecycle and navigation
- `updates/`: update state machine and install flow
- `persistence/`: desktop-local persistence helpers

## Guardrails

### File Size

- Target: keep most modules under 400-500 lines.
- Modules above 700 lines need a clear reason.
- Route files, bootstrap files, and composition files should stay especially small.
- Generated files are exempt.

### Barrels

- `packages/shared` keeps explicit subpath exports only.
- `packages/contracts` may keep a root export for schema ergonomics.
- Avoid app-local convenience barrels unless they represent a deliberate public surface.

## Refactor Priorities

When touching architecture, prefer these moves in order:

1. Extract domain helpers from large files.
2. Introduce a stable public entrypoint for the area being refactored.
3. Move orchestration logic out of transport/UI/bootstrap files.
4. Create a new package only if the logic is truly cross-app and stable.
