# Orchestration Thread Runtime State

This document explains how thread "working" state is derived in the web client and why we reconcile session updates by timestamp.

## Why this exists

Session state and turn state arrive from different event shapes and can briefly disagree during normal streaming, replay, and reconnect recovery. If UI code reads only one field (for example only `session.status`), it can regress into incorrect badges, timers, and action gating.

The source of truth for "actively working" in web code is:

- `apps/web/src/session-logic.ts`
- `isThreadActivelyWorking(...)`

Current call sites that should stay aligned:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/Sidebar.logic.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/hooks/useThreadActions.ts`

## Data model

Two fields are intentionally distinct:

1. Session lifecycle (`thread.session`):

- Server/runtime lifecycle (`starting`, `running`, `ready`, `error`, etc.).
- `activeTurnId` can be absent even while status is `running`.

2. Latest turn lifecycle (`thread.latestTurn`):

- Conversation turn status (`running`, `completed`, `interrupted`, `error`).
- Contains timestamps (`startedAt`, `completedAt`) used by elapsed UI and "settled" decisions.

## Important invariant: `running` does not always mean an active turn id

`running + activeTurnId: null` is valid and expected in server semantics (for example runtime `waiting` maps to orchestration `running`).

References:

- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- `orchestrationSessionStatusFromRuntimeState(...)` maps `waiting -> running`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`
- tests assert `status === "running"` with `activeTurnId === null`

## Canonical web predicate

Use `isThreadActivelyWorking(latestTurn, session)` when deciding:

- status pills
- composer action state
- autoscroll/timers
- action guards (archive, checkpoint revert, etc.)

Do not duplicate this logic with ad-hoc checks like:

- `session.status === "running"`
- `phase === "running"`
- `session.status === "running" && activeTurnId != null`

Those checks miss valid runtime states and create UI/action mismatches.

## Stale `thread.session-set` protection

In replay/reconnect paths, a later-arriving `thread.session-set` event can carry an older `session.updatedAt` than the session already in store. Applying it can incorrectly regress state (for example completed -> running or running -> ready).

Web store rule:

- Ignore incoming `thread.session-set` when `incoming.updatedAt < current.updatedAt`

Implementation:

- `apps/web/src/store.ts` (`thread.session-set` branch)

Coverage:

- `apps/web/src/store.test.ts`
- tests assert stale snapshots are ignored in both regression directions

## Practical examples

1. Active turn still running:

- `session.orchestrationStatus === "running"`
- `session.activeTurnId` present
- Result: thread is actively working

2. Runtime waiting / approval phase with no turn id yet:

- `session.orchestrationStatus === "running"`
- `session.activeTurnId` absent
- `latestTurn` absent or incomplete
- Result: thread is actively working

3. Late stale snapshot after completion:

- `latestTurn.state === "completed"` with `completedAt` set
- incoming `thread.session-set` says `running` but has older `session.updatedAt`
- Result: snapshot is ignored; UI does not regress to "working"

## Contributor checklist

When touching orchestration thread UI/state:

1. Reuse `isThreadActivelyWorking` and `isLatestTurnSettled` instead of re-encoding predicates.
2. Treat `session.updatedAt` as monotonic per thread session snapshot in client reconciliation.
3. Add/adjust tests in:

- `apps/web/src/session-logic.test.ts`
- `apps/web/src/store.test.ts`
- `apps/web/src/components/Sidebar.logic.test.ts`

4. If changing server runtime/session semantics, update this doc and the tests above in the same PR.
