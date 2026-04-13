# Androdex Android Convergence Architecture

## Decision

`Androdex-Desktop` is the canonical backend for:

- auth policy, bootstrap, bearer sessions, and WebSocket auth
- orchestration snapshot state
- orchestration event replay and live domain events
- threads, turns, approvals, checkpoints, and session lifecycle actions

`Androdex - Android` is a remote client of that backend. It may keep Android-native UI state, caching, rendering, notifications, and persistence, but it must not become a second source of truth for thread or session state.

## Contract Sources

The canonical protocol contracts live in this repo:

- auth contracts: `packages/contracts/src/auth.ts`
- orchestration contracts: `packages/contracts/src/orchestration.ts`
- WS RPC method contracts: `packages/contracts/src/rpc.ts`

Android convergence work should treat those files as authoritative.

## Migration Rules

- Do not add new bridge-only thread, replay, approval, or session semantics on Android.
- Do not let a relay or host helper own thread lists, thread hydration, replay cursors, approvals, or checkpoint truth.
- If a relay remains during migration, it is transport-only: discovery, forwarding, or tunneling only.
- Android should derive thread state from the same snapshot and replay stream used by the web client.
- Android mutations should dispatch canonical orchestration commands to the Mac server, not translate into a separate adapter protocol.

## First Integrated Milestone

For the first cutover milestone, LAN or loopback reachability is acceptable. Internet-reachable transport is optional and can be layered in later, but only as HTTP/WebSocket forwarding to the same backend contract.

That means the initial goal is:

1. Pair Android to the Mac server.
2. Bootstrap a bearer session against the Mac server.
3. Fetch the canonical orchestration snapshot.
4. Subscribe to canonical orchestration domain events.
5. Recover on reconnect by replaying from `snapshotSequence`.
6. Dispatch canonical mutating commands back to the Mac server.

## Scope Boundaries

Android-owned:

- timeline presentation
- local drafts
- device notifications
- local persistence for bearer/session metadata
- mobile-specific caching and rendering optimizations

Mac-owned:

- auth/session identity
- read-model truth
- replay ordering and sequence semantics
- approvals and user-input pending state
- checkpoint state
- interrupt, revert, and session-stop effects

## Existing Reference Implementations

The current web remote client already demonstrates the intended Mac-native path:

- auth bootstrap and WS-token issuance: `apps/web/src/environments/remote/api.ts`
- snapshot/replay/live recovery flow: `apps/web/src/environments/runtime/connection.ts`

Android should copy the protocol and recovery behavior from those paths, not the web UI structure.
