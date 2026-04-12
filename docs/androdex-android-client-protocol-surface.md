# Androdex Android Client Protocol Surface

This note defines the minimum Mac-native protocol Android needs for the first convergence milestone.

## Canonical Contracts

- Auth contract: `packages/contracts/src/auth.ts`
- Orchestration contract: `packages/contracts/src/orchestration.ts`
- WS method registry: `packages/contracts/src/rpc.ts`

## Required HTTP Endpoints

### Preflight discovery

- `GET /.well-known/t3/environment`
  - Purpose: identify the execution environment before pairing.
  - Contract: `ExecutionEnvironmentDescriptor`
  - Source: `apps/server/src/http.ts`

### Auth

- `POST /api/auth/bootstrap/bearer`
  - Purpose: exchange a pairing/bootstrap credential for a bearer session.
  - Request: `AuthBootstrapInput`
  - Response: `AuthBearerBootstrapResult`
  - Source: `apps/server/src/auth/http.ts`

- `GET /api/auth/session`
  - Purpose: validate the stored bearer token and load current auth posture.
  - Response: `AuthSessionState`
  - Source: `apps/server/src/auth/http.ts`

- `POST /api/auth/ws-token`
  - Purpose: mint a short-lived WebSocket token from the current authenticated session.
  - Response: `AuthWebSocketTokenResult`
  - Source: `apps/server/src/auth/http.ts`

### Orchestration

- `GET /api/orchestration/snapshot`
  - Purpose: load the canonical read model.
  - Response: `OrchestrationReadModel`
  - Source: `apps/server/src/orchestration/http.ts`

- `POST /api/orchestration/dispatch`
  - Purpose: dispatch canonical mutating actions from Android.
  - Request: `ClientOrchestrationCommand`
  - Response: `DispatchResult`
  - Source: `apps/server/src/orchestration/http.ts`

## Required WebSocket RPC Surface

### Required for v1

- `subscribeOrchestrationDomainEvents`
  - Purpose: receive live `OrchestrationEvent` updates after the initial snapshot load.
  - Input: `{}`
  - Event: `OrchestrationEvent`

- `orchestration.replayEvents`
  - Purpose: recover missed events after reconnect, sequence gap, or resubscribe.
  - Input: `OrchestrationReplayEventsInput`
  - Output: `OrchestrationEvent[]`

### Exposed by the Mac server but not required for Android v1

- `orchestration.getSnapshot`
- `orchestration.dispatchCommand`
- `orchestration.getTurnDiff`
- `orchestration.getFullThreadDiff`
- `subscribeServerConfig`
- `subscribeServerLifecycle`
- `subscribeAuthAccess`
- project, terminal, shell, and git RPC methods

Android can add support for some of these later, but they are not required to prove canonical sync.

## Recovery Model

Android should mirror the web client recovery pattern:

1. Load `GET /api/orchestration/snapshot`.
2. Persist the returned `snapshotSequence`.
3. Open WebSocket transport using `POST /api/auth/ws-token`.
4. Subscribe to `subscribeOrchestrationDomainEvents`.
5. Apply in-order events by `sequence`.
6. If a gap or reconnect happens, call `orchestration.replayEvents({ fromSequenceExclusive })`.
7. If replay fails or cannot make progress, reload the snapshot and resume from its `snapshotSequence`.

Relevant reference implementation:

- `apps/web/src/environments/runtime/connection.ts`

## V1 Feature Scope

In scope:

- thread list from the canonical read model
- open thread and hydrate from snapshot state
- live orchestration updates
- replay recovery after reconnect or sequence gap
- send turn
- interrupt
- approval responses
- user-input responses
- checkpoint revert
- session stop

Out of scope for the first cutover:

- browser-cookie bootstrap flows
- owner-side pairing-link management UI
- auth access management streams
- server lifecycle/config streams
- git, terminal, and workspace RPCs
- checkpoint diff and full-thread diff RPCs
- relay-owned thread summaries or replay semantics

## Recommended Android Layering

- auth HTTP layer
  - `/.well-known/t3/environment`
  - `/api/auth/bootstrap/bearer`
  - `/api/auth/session`
  - `/api/auth/ws-token`
- orchestration HTTP layer
  - `/api/orchestration/snapshot`
  - `/api/orchestration/dispatch`
- WebSocket orchestration layer
  - `subscribeOrchestrationDomainEvents`
  - `orchestration.replayEvents`

This matches the intended split in the migration checklist and keeps Android transport simple.
