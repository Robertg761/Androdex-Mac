# Androdex Android Sync Migration Checklist

This document is the working checklist for converging:

- `/Users/robert/Documents/Projects/Androdex - Mac`
- `/Users/robert/Documents/Projects/Androdex - Android`

onto a single source of truth.

The target architecture is:

- `Androdex - Mac` is the canonical backend for auth, sessions, orchestration state, replay, and thread actions.
- `Androdex - Android` is a true remote client of that same backend.
- Any relay or host helper layer is transport-only, not a second stateful protocol.

## Success Criteria

- Android, desktop, and web all converge on the same thread/session state.
- Android bootstraps from the Mac server's real auth model, not a bridge-owned shadow protocol.
- Android hydrates from the Mac server's orchestration snapshot and replay stream.
- Android mutating actions dispatch directly into the Mac server's canonical orchestration commands.
- The old bridge translation path is either removed or reduced to a thin transport helper.

## Tracking Conventions

- Use `[ ]` for pending work.
- Change to `[x]` when complete.
- Add short dated notes under a checklist item when useful.
- Prefer updating this document instead of keeping status in chat context.

## Phase 0: Freeze Direction

- [x] Decide and document that `Androdex - Mac` is the only source of truth for auth, sessions, threads, turns, checkpoints, approvals, and replay state.
- [x] Decide that `Androdex - Android` will stop adding new bridge-only thread/state translation logic.
- [x] Decide whether internet access is required for v1 of this convergence or whether LAN/loopback-first is acceptable.
- [x] Decide whether the old bridge remains temporarily as a transport shell or is bypassed entirely for the first integrated milestone.
- [x] Record the migration decision in both repos so future work does not continue down the old adapter path.

2026-04-12: Documented the Mac-side canonical architecture and first-cut transport stance in `docs/androdex-android-canonical-architecture.md`. Current direction is LAN/loopback-first for the first integrated milestone, with any remaining bridge or relay limited to transport-only responsibilities.
2026-04-12: Recorded the same convergence direction in `Androdex - Android/Docs/android-sync-convergence.md` and added README/doc-index pointers there so Android-side work no longer defaults to the older bridge-first architecture notes.

Definition of done:

- Both repos have a short architecture note stating that the Mac repo is canonical and Android is a client.

## Phase 1: Define Canonical Client Contract

- [x] Treat `packages/contracts/src/auth.ts` in `Androdex - Mac` as the canonical auth contract.
- [x] Treat `packages/contracts/src/orchestration.ts` in `Androdex - Mac` as the canonical orchestration/read-model contract.
- [x] Inventory the exact server endpoints and WS RPC methods Android must support from:
  - `apps/server/src/auth/http.ts`
  - `apps/server/src/orchestration/http.ts`
  - `apps/server/src/ws.ts`
- [x] Write a small "Android client protocol surface" note listing only the required methods for v1.
- [x] Explicitly mark which Android features are in-scope for v1:
  - thread list
  - open thread
  - load snapshot
  - live updates
  - replay recovery
  - send turn
  - interrupt
  - approvals
  - user input
  - checkpoint revert
  - session stop
- [x] Explicitly mark which Android features are out-of-scope for first cutover if needed.

2026-04-12: Captured the canonical Android v1 protocol surface in `docs/androdex-android-client-protocol-surface.md`, including the required HTTP endpoints, required WS RPC methods, recovery model, v1 feature scope, and explicit non-goals.

Definition of done:

- There is one written client contract checklist with no protocol ambiguity left.

## Phase 2: Design Android Transport Layer

- [x] Create a new Android-side transport package instead of continuing to grow the current custom bridge protocol in `android/app/src/main/java/io/androdex/android/data/AndrodexClient.kt`.
- [x] Split Android networking into three layers:
  - auth HTTP
  - orchestration HTTP
  - WS RPC subscription/replay
- [ ] Make the new Android transport consume Mac-native auth/session/bootstrap instead of the current custom relay pairing payloads in `android/app/src/main/java/io/androdex/android/model/Models.kt`.
- [ ] Keep `AndrodexService` as the UI coordinator, but make it backend-agnostic.
- [ ] Add a clean repository interface that can be backed by the new Mac-native transport.
- [ ] Avoid mixing handshake/pairing crypto, relay routing, and app-state reconciliation in one class the way the current client does.

2026-04-12: Added Android-side Mac-native transport scaffolding under `android/app/src/main/java/io/androdex/android/transport/macnative/`, with explicit auth HTTP, orchestration HTTP, and orchestration WS layers plus session persistence and canonical endpoint/method constants.

Definition of done:

- Android has a clear client abstraction for Mac-native auth, orchestration, and WebSocket transport.

## Phase 3: Replace Pairing Model

- [ ] Stop using the current Androdex-specific QR/session payload as the long-term canonical connection model from `android/app/src/main/java/io/androdex/android/ui/pairing/PairingPayloadValidator.kt`.
- [ ] Design a new pairing payload format for Android that contains only what is needed to reach the Mac server and bootstrap auth safely.
- [ ] Decide whether that payload contains:
  - a direct base URL
  - a relay URL
  - or a transport descriptor plus a pairing credential
- [ ] Make the payload versioned and short-lived.
- [ ] Preserve host label and fingerprint concepts for trust UX, but do not let them become a second protocol layer.
- [ ] Update Android pairing validation to accept only the new payload format for the converged path.
- [ ] Keep a temporary compatibility path only if needed to support existing users during migration.

Definition of done:

- A QR or pasted payload can bootstrap Android into the Mac server's real auth flow.

## Phase 4: Implement Mac-Native Auth On Android

- [ ] Implement `POST /api/auth/bootstrap/bearer` on Android using the same model as the web remote client.
- [ ] Implement `GET /api/auth/session` on Android.
- [ ] Implement `POST /api/auth/ws-token` on Android.
- [ ] Persist bearer-session identity and expiry on Android in a clean local persistence layer.
- [ ] Define token refresh and rebootstrap behavior when auth expires.
- [ ] Surface clear Android UX for:
  - pairing required
  - session expired
  - host unavailable
- [ ] Remove any assumption that Android must maintain a custom host session identifier separate from the Mac server's own session model.

Definition of done:

- Android can authenticate against the Mac server without the legacy bridge protocol.

## Phase 5: Implement Read-Only Sync First

- [ ] Implement `GET /api/orchestration/snapshot` on Android.
- [ ] Implement WS subscription to orchestration domain events using the same recovery model as the web client.
- [ ] Implement replay via `orchestration.replayEvents` after reconnect or sequence gap.
- [ ] Port the snapshot-sequence bookkeeping model from the web client.
- [ ] Make Android thread list render directly from the Mac read model instead of synthetic bridge-owned thread summaries.
- [ ] Make Android thread open and hydration render directly from the Mac snapshot plus replay stream.
- [ ] Preserve Android-only render and cache optimizations, but not Android-owned truth.

Definition of done:

- Android can reconnect and catch up to the same state the Mac and web clients see, without translation.

## Phase 6: Port Core Mutating Actions

- [ ] Implement Android send-turn using the canonical orchestration dispatch path.
- [ ] Implement interrupt using the canonical thread interrupt command.
- [ ] Implement approval responses using the canonical approval response command.
- [ ] Implement user-input responses using the canonical user-input response command.
- [ ] Implement checkpoint revert using the canonical checkpoint revert command.
- [ ] Implement session stop and background terminal cleanup using the canonical session stop command.
- [ ] Ensure Android stale-action handling matches server truth instead of trying to guess locally.

Definition of done:

- Android mutates the same thread and session objects the Mac app uses.

## Phase 7: Preserve Android UX While Removing Shadow Logic

- [ ] Keep Android timeline rendering, drafts, notifications, and local screen state in the Android repo.
- [ ] Remove bridge-invented compatibility fields where the Mac server already exposes canonical state.
- [ ] Replace Android-side synthetic thread capability inference with capability data derived from real server state where possible.
- [ ] Keep Android-friendly labels and gating messages, but base them on canonical server conditions.
- [ ] Avoid copying web UI architecture; only copy protocol and recovery logic.

Definition of done:

- Android still feels native, but its data source is canonical.

## Phase 8: Decide Transport Strategy

- [ ] Decide whether Android connects directly to the Mac server on LAN for the first milestone.
- [ ] If remote internet access is required, define a transport-only relay or tunnel that forwards HTTP and WebSocket traffic without translating app state.
- [ ] Do not let the relay own thread state, replay cursors, or pairing/session semantics.
- [ ] If a helper service is still needed on the host, shrink it to launch, discovery, or tunnel orchestration only.
- [ ] Remove the requirement that a custom bridge protocol sit between Android and the Mac server.

Definition of done:

- Transport is clearly separated from application protocol.

## Phase 9: Decommission Legacy Bridge Responsibilities

- [ ] Identify every place the old bridge synthesizes `thread/list`, `thread/read`, `thread/resume`, or timeline semantics.
- [ ] Mark those paths deprecated once the Android client can read real orchestration snapshot and replay.
- [ ] Remove desktop refresh workaround dependence from the convergence path.
- [ ] Remove convenience helpers like `androdex-bridge/src/session-state.js` from the critical path unless they remain useful as optional-only helpers.
- [ ] Keep only host utilities that are still useful outside the old protocol.

Definition of done:

- The old bridge no longer acts as a shadow backend.

## Phase 10: Testing Matrix

- [ ] Test fresh pair on Android against the Mac server.
- [ ] Test saved reconnect after Android app restart.
- [ ] Test reconnect after Mac server restart.
- [ ] Test reconnect after network drop with replay recovery.
- [ ] Test Android opening a thread created on Mac or web.
- [ ] Test Mac or web opening a thread updated on Android and seeing the same state.
- [ ] Test approvals resolved on one client and reflected correctly on the other.
- [ ] Test user-input prompts resolved on one client and cleared on the other.
- [ ] Test interrupt, rollback, and session stop from Android while Mac or web is open.
- [ ] Test sequence-gap recovery and duplicate suppression.
- [ ] Test auth expiry and re-pair or re-auth flows.

Definition of done:

- Desktop, web, and Android all converge on the same thread and session truth after failures and reconnects.

## Phase 11: Cleanup And Cutover

- [ ] Add a feature flag or branch strategy so the new Android-native path can be tested without breaking current users.
- [ ] Land the new Android client path behind a runtime flag first.
- [ ] Run a short bake-in period using the real Mac server protocol.
- [ ] Remove dead bridge translation code after the new path is stable.
- [ ] Update both READMEs so setup reflects the converged architecture.
- [ ] Archive or delete old planning docs that assume the bridge remains authoritative.

Definition of done:

- The default path is the converged one, and the old shadow protocol is gone.

## Recommended First 10 Tasks

- [ ] In `Androdex - Android`, create a new package for Mac-native auth and orchestration transport.
- [ ] Implement Android bearer bootstrap.
- [ ] Implement Android WS-token issuance.
- [ ] Implement Android orchestration snapshot fetch.
- [ ] Implement Android event replay.
- [ ] Implement Android live WS subscription.
- [ ] Feed the real snapshot into thread list UI.
- [ ] Feed the real snapshot into thread-open and hydration UI.
- [ ] Implement reconnect recovery using `snapshotSequence`.
- [ ] Prove Android can read the same thread state as Mac and web before any further bridge work.

## Important Guardrails

- [ ] Do not mutate the dirty Android worktree casually; there are already local changes on `feature/t3code-foundation`.
- [ ] Do not add new bridge-only compatibility APIs unless they are strictly temporary and clearly marked for deletion.
- [ ] Do not let relay or host-helper code become a second source of truth.
- [ ] Do not prioritize feature breadth over sync correctness.
- [ ] Treat "same snapshot + same replay + same actions" as the definition of success.

## Current Status

- [x] Old local WIP branch in `Androdex - Mac` removed.
- [x] `origin` and `upstream` tracking in `Androdex - Mac` narrowed to `main` only.
- [x] Cross-repo architecture review completed.
- [ ] Migration execution not started yet.
