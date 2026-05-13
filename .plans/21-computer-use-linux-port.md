# Plan: Bring Codex Computer Use to Linux Androdex

## Core Decision

Do **not** try to directly port the macOS plugin implementation. The Codex macOS Computer Use feature depends on macOS-specific Screen Recording and Accessibility permissions, plus app-level permission prompts. On Linux, build an **Androdex Computer Use runtime** that recreates the behavior: scoped target selection, screenshots, action execution, approvals, audit logs, and provider integration.

The safest first version should run inside an **isolated browser, container, or virtual display**, not the host Linux desktop. OpenAI’s Computer Use guidance emphasizes a loop where the model inspects screenshots, returns actions, the harness executes them, then sends back updated screenshots. It also recommends isolated browsers, VMs, containers, and human review for sensitive actions.

This plan assumes “Linux Androdex app” means your Linux Androdex Desktop/server build. Your Android app should remain a **remote client**, not a second source of truth, which matches the Androdex Android architecture docs.

---

## 1. Success Criteria

A complete Linux Computer Use port is done when:

1. Androdex can start a scoped computer-use session against a target:
   - isolated browser
   - isolated Linux display/container
   - optionally a real host desktop window

2. The server can:
   - capture screenshots
   - execute click/type/scroll/drag/key/wait actions
   - stream session events
   - request and enforce approvals
   - block unsafe targets/actions

3. The Codex provider can invoke computer use from a thread, ideally through:
   - `@Computer`
   - `@AppName`
   - or an equivalent Androdex tool/capability

4. The web/desktop UI can show:
   - current target
   - screenshot preview
   - action log
   - approval prompts
   - kill switch

5. Android can view and control the session through canonical Androdex server APIs, without owning the state itself.

---

## 2. Where This Belongs in Androdex

Androdex already has a server/web/desktop split. The architecture docs say `apps/server` owns orchestration, provider integration, persistence, HTTP/WS transport, and runtime logic, while `apps/web` owns presentation and `apps/desktop` owns Electron shell concerns like lifecycle, updates, windows, IPC, and local persistence.

So the Computer Use runtime should be placed like this:

| Area | Path | Responsibility |
|---|---|---|
| Shared contracts | `packages/contracts/src/computerUse.ts` | Types, schemas, commands, events |
| Server runtime | `apps/server/src/computerUse/` | Sessions, drivers, safety policy, screenshots, action executor |
| Provider bridge | `apps/server/src/provider/...` | Let Codex request computer-use sessions/actions |
| Web UI | `apps/web/src/features/computer-use/` | Viewer, approvals, target picker, action log |
| Desktop shell | `apps/desktop/src/...` | Optional local permission/dependency checks only |
| Android client | Android app | Remote UI using canonical server state/events |

Do **not** put the main computer-use engine in `apps/desktop`. The desktop app can expose shell-level helpers, but the canonical runtime should live in `apps/server`.

---

## 3. What Gets “Ported” From macOS

The macOS plugin’s **product behavior** should be ported, not its platform-specific implementation.

Port these concepts:

| macOS Computer Use concept | Linux Androdex equivalent |
|---|---|
| Screen Recording permission | Screenshot/capture driver permission |
| Accessibility permission | Action executor permission |
| App allow prompts | Androdex target allowlist |
| `@Computer` invocation | Provider capability / tool trigger |
| `@AppName` targeting | Target registry: app/window/container/browser |
| Sensitive-action prompts | Androdex approval policy |
| App/window scoping | Target lock + stale-window protection |
| User present guidance | Human-in-loop approvals and kill switch |
| Auditability | Session event log |

Do not try to reproduce Apple-specific permission flows. On Linux, permission mechanics differ across X11, Wayland, containers, and desktop environments.

---

## 4. Recommended Architecture

### 4.1 High-Level Flow

```text
Codex / Provider
      |
      v
Androdex Provider Driver
      |
      v
ComputerUseManager
      |
      +--> TargetRegistry
      +--> ScreenshotCapture
      +--> ActionExecutor
      +--> ApprovalPolicy
      +--> AuditLog
      +--> ComputerUseDriver
                |
                +--> ContainerDriver
                +--> BrowserDriver
                +--> LinuxX11Driver
                +--> LinuxWaylandDriver
```

### 4.2 Runtime Loop

The runtime should support the same basic loop OpenAI documents for computer use:

1. Capture screenshot from target.
2. Send screenshot/context to provider.
3. Provider/model returns one or more actions.
4. Validate actions against policy.
5. Ask user for approval if needed.
6. Execute actions through the active driver.
7. Capture new screenshot.
8. Stream resulting events to clients.
9. Repeat until stopped.

Computer actions should support at least:

```ts
type ComputerUseAction =
  | { type: "click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "double_click"; x: number; y: number }
  | { type: "move"; x: number; y: number }
  | { type: "drag"; path: Array<{ x: number; y: number }> }
  | { type: "scroll"; x: number; y: number; scrollX?: number; scrollY?: number }
  | { type: "type"; text: string }
  | { type: "keypress"; keys: string[] }
  | { type: "wait"; ms?: number }
  | { type: "screenshot" };
```

OpenAI’s current Computer Use action set includes actions like click, double click, scroll, type, wait, keypress, drag, move, and screenshot, so this maps cleanly.

---

## 5. New Contracts

Create:

```text
packages/contracts/src/computerUse.ts
```

Define:

```ts
export type ComputerUseDriverKind =
  | "container"
  | "browser"
  | "linux-x11"
  | "linux-wayland";

export type ComputerUseTargetKind =
  | "browser"
  | "container"
  | "desktop-window"
  | "desktop-display";

export interface ComputerUseTarget {
  id: string;
  kind: ComputerUseTargetKind;
  title: string;
  appName?: string;
  pid?: number;
  display?: string;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  allowed: boolean;
  trustLevel: "isolated" | "host-desktop" | "sensitive";
}

export interface ComputerUseSession {
  id: string;
  threadId: string;
  providerId: string;
  targetId: string;
  driver: ComputerUseDriverKind;
  status: "starting" | "active" | "paused" | "stopped" | "failed";
  displaySize: {
    width: number;
    height: number;
  };
  lastScreenshotId?: string;
  createdAt: string;
  updatedAt: string;
}

export type ComputerUseApprovalKind =
  | "allow-target"
  | "execute-action"
  | "sensitive-action"
  | "clipboard-access"
  | "host-desktop-access";

export interface ComputerUseApprovalRequest {
  id: string;
  sessionId: string;
  kind: ComputerUseApprovalKind;
  title: string;
  description: string;
  screenshotId?: string;
  requestedAction?: ComputerUseAction;
  defaultDecision: "deny" | "ask" | "allow";
}
```

Also define event types:

```ts
export type ComputerUseEvent =
  | { type: "computer.session.started"; session: ComputerUseSession }
  | { type: "computer.session.stopped"; sessionId: string; reason?: string }
  | { type: "computer.screenshot.captured"; sessionId: string; screenshotId: string }
  | { type: "computer.action.requested"; sessionId: string; action: ComputerUseAction }
  | { type: "computer.action.executed"; sessionId: string; action: ComputerUseAction }
  | { type: "computer.action.failed"; sessionId: string; action: ComputerUseAction; error: string }
  | { type: "computer.approval.requested"; request: ComputerUseApprovalRequest }
  | { type: "computer.approval.resolved"; requestId: string; decision: "allow" | "deny" }
  | { type: "computer.policy.blocked"; sessionId: string; reason: string };
```

---

## 6. Server Implementation

Create:

```text
apps/server/src/computerUse/
  Drivers/
    ComputerUseDriver.ts
    ContainerDriver.ts
    BrowserDriver.ts
    LinuxX11Driver.ts
    LinuxWaylandDriver.ts
  Services/
    ComputerUseManager.ts
    ComputerUsePolicy.ts
    ComputerUseTargetRegistry.ts
    ComputerUseScreenshotStore.ts
    ComputerUseAuditLog.ts
  http.ts
  rpc.ts
  Layers.ts
  index.ts
```

Your server already has provider, orchestration, terminal, workspace, auth, persistence, and websocket areas, so this should be a sibling domain rather than a provider-only feature.

### `ComputerUseManager`

Responsibilities:

```ts
interface ComputerUseManager {
  listTargets(): Effect.Effect<ComputerUseTarget[]>;
  startSession(input: StartComputerUseSessionInput): Effect.Effect<ComputerUseSession>;
  stopSession(sessionId: string): Effect.Effect<void>;
  getSnapshot(sessionId: string): Effect.Effect<ComputerUseSnapshot>;
  captureScreenshot(sessionId: string): Effect.Effect<ComputerUseScreenshot>;
  requestActions(sessionId: string, actions: ComputerUseAction[]): Effect.Effect<void>;
  approve(requestId: string, decision: "allow" | "deny"): Effect.Effect<void>;
}
```

### `ComputerUseDriver`

Each Linux mode implements the same interface:

```ts
interface ComputerUseDriver {
  kind: ComputerUseDriverKind;

  healthCheck(): Promise<ComputerUseDriverHealth>;

  listTargets(): Promise<ComputerUseTarget[]>;

  startSession(target: ComputerUseTarget): Promise<DriverSession>;

  captureScreenshot(session: DriverSession): Promise<{
    pngBytes: Uint8Array;
    width: number;
    height: number;
  }>;

  executeAction(
    session: DriverSession,
    action: ComputerUseAction
  ): Promise<void>;

  stopSession(session: DriverSession): Promise<void>;
}
```

---

## 7. Linux Driver Strategy

### Phase 1 Default: `ContainerDriver`

This should be the first shippable driver.

It runs a controlled Linux desktop or browser inside:

- Docker or Podman container
- Xvfb/Xephyr virtual display
- Chromium/Firefox
- optional noVNC/x11vnc stream
- `xdotool` or equivalent inside the container
- screenshot capture inside the isolated display

Why this first:

- safer than controlling the real desktop
- repeatable in CI
- less Wayland pain
- easier screenshots and coordinates
- aligns with OpenAI guidance to isolate computer-use environments

Example dependencies:

```text
xvfb
xdotool
scrot or imagemagick
chromium or firefox
x11vnc / noVNC optional
docker or podman optional
```

The driver should expose only the virtual display to the model. Host filesystem access should be opt-in and mounted read-only unless the user approves write access.

### Phase 2: `BrowserDriver`

Use Playwright or a similar browser automation layer for web-first tasks.

This is useful for:

- testing Androdex web UI
- reproducing browser bugs
- interacting with local web apps
- avoiding host desktop control

Even though this is not “full desktop” computer use, it gives a high-value safe mode.

### Phase 3: `LinuxX11Driver`

Host X11 control can use:

```text
xdotool      keyboard/mouse/window control
wmctrl       window listing/focus
xwd/import   screenshots
scrot        screenshots
xclip        clipboard, gated
```

This should be opt-in because X11 desktop automation can affect the full desktop. Require explicit user approval before enabling.

Add protections:

- lock session to one window ID
- verify active window before every action
- block if target bounds changed unexpectedly
- block password managers and system dialogs
- never type into unexpected focused windows
- capture screenshot after every action batch

### Phase 4: `LinuxWaylandDriver`

Wayland support should be marked experimental at first.

Wayland is fragmented by compositor. Possible tools:

```text
xdg-desktop-portal   screenshot / screencast permissions
grim + slurp         wlroots screenshots
ydotool              input through uinput
wlrctl               wlroots window/control helper
dbus                 desktop-specific integrations
```

Caveat: Wayland intentionally restricts global screen capture and input injection. Some functionality may require compositor-specific support or elevated local setup. This is exactly why the container driver should ship first.

---

## 8. API Surface

Add HTTP endpoints:

```text
GET    /api/computer-use/status
GET    /api/computer-use/targets
POST   /api/computer-use/sessions
GET    /api/computer-use/sessions/:sessionId
DELETE /api/computer-use/sessions/:sessionId
POST   /api/computer-use/sessions/:sessionId/screenshot
POST   /api/computer-use/sessions/:sessionId/actions
POST   /api/computer-use/approvals/:approvalId/respond
```

Add websocket/RPC methods:

```text
computerUse.getSnapshot
computerUse.listTargets
computerUse.startSession
computerUse.stopSession
computerUse.captureScreenshot
computerUse.executeActions
computerUse.respondToApproval
computerUse.subscribeEvents
```

For Android, reuse the existing canonical backend pattern: load snapshot, subscribe to domain events, replay on gaps, and dispatch mutations through canonical commands. The Android protocol docs already define this model for orchestration state, websocket auth, snapshots, dispatch, replay, and recovery.

---

## 9. Codex Integration

There are three viable integration tracks.

### Track A: Codex Provider Capability Inside Androdex

This is the best Androdex-native path.

Add a provider capability:

```ts
interface ProviderComputerUseCapability {
  available: boolean;
  startComputerUseSession(input: {
    threadId: string;
    targetHint?: string;
    reason: string;
  }): Promise<ComputerUseSession>;

  submitScreenshot(input: {
    sessionId: string;
    screenshotId: string;
  }): Promise<void>;

  handleComputerUseActions(input: {
    sessionId: string;
    actions: ComputerUseAction[];
  }): Promise<void>;
}
```

Then expose it through the Codex provider driver. Your repo already includes an `effect-codex-app-server` package that exports generated client/protocol/schema/rpc surfaces, and Codex’s app-server interface is intended for rich clients with auth, conversations, approvals, and streamed agent events.

This track lets Androdex keep using its existing provider/orchestration model.

### Track B: OpenAI Responses API Computer Tool

For direct OpenAI Computer Use integration, use the current GA-style `computer` tool rather than the deprecated `computer-use-preview` path. OpenAI’s migration notes describe the move to the GA computer tool, batched `actions[]`, and newer model/tool behavior.

The loop would be:

```text
Androdex captures screenshot
  -> send screenshot to model with computer tool
  -> model returns actions[]
  -> Androdex validates and executes actions
  -> Androdex sends updated screenshot
  -> repeat
```

This track is useful if Androdex wants computer use beyond Codex.

### Track C: Codex Plugin Compatibility Layer

Codex plugins use `.codex-plugin/plugin.json`, skills, optional app/MCP definitions, lifecycle hooks, and metadata.

However, the macOS Computer Use plugin is not something you should assume can be copied into Linux unchanged. Instead, create an Androdex-native “Computer Use capability” and optionally expose a plugin-like descriptor for compatibility:

```text
.codex-plugin/
  plugin.json
skills/
  computer-use/SKILL.md
```

The skill can teach Codex how to call Androdex’s computer-use tool, but the actual execution remains in `apps/server/src/computerUse`.

---

## 10. Web and Desktop UX

### Settings Page

Add a Computer Use settings panel:

```text
Computer Use
  [ ] Enable Computer Use
  Mode:
    (•) Isolated browser/container
    ( ) Host X11 desktop
    ( ) Host Wayland desktop - experimental

  Dependency status:
    Xvfb: found/missing
    xdotool: found/missing
    scrot/import: found/missing
    Docker/Podman: found/missing
    xdg-desktop-portal: found/missing

  Safety:
    [x] Ask before using a new target
    [x] Ask before sensitive actions
    [x] Disable clipboard access by default
    [x] Block terminal/system settings/password managers
```

### Session Viewer

Add a panel with:

```text
Current target
Current screenshot
Last action
Action history
Approval requests
Stop button
Emergency kill switch
```

### Approval Prompt

Example:

```text
Codex wants to control: Firefox - localhost:3000

Reason:
"Reproduce the UI bug in the Androdex web app."

Actions allowed:
- click
- type
- scroll
- screenshot

[Allow once] [Always allow this target] [Deny]
```

### Desktop Shell

The Electron desktop app should only help with:

- checking local dependencies
- showing native notifications
- surfacing kill switch
- possibly opening a local isolated display viewer

The runtime stays server-side.

---

## 11. Safety Policy

Computer Use needs strict defaults.

### Default Deny

Block by default:

```text
terminal emulators
Androdex/Codex app windows
password managers
system settings
package managers
sudo/admin prompts
SSH prompts
banking/payment pages
unknown windows after focus change
clipboard read/write
file picker uploads unless approved
```

The Codex macOS docs warn that Computer Use can view screen contents, interact with windows/menus/keyboard/clipboard, and should be used with narrow tasks, sensitive apps closed, and review of permission prompts. They also note limits around terminal apps, Codex itself, and admin/security prompts.

### Human-in-Loop

Require explicit approval for:

```text
first use of target
typing credentials
submitting forms
deleting files
installing packages
changing settings
copying clipboard
uploading files
opening host filesystem
moving outside target window
```

### Prompt Injection Defense

When browsing or using arbitrary UI, treat screen/page content as untrusted. The model should not follow instructions from a webpage that conflict with the user’s task or Androdex policy. OpenAI’s Computer Use docs also call out prompt injection and recommend isolation and explicit safety checks.

### Audit Log

Persist:

```text
session started/stopped
target selected
approval requested/resolved
screenshot captured
action requested
action executed
action blocked
driver error
policy error
```

Make the audit log visible in the UI.

---

## 12. Implementation Milestones

### Milestone 0 — Repo Audit and Feature Flag

Deliverables:

```text
ANDRODEX_COMPUTER_USE=1
packages/contracts/src/computerUse.ts
apps/server/src/computerUse/index.ts
docs/computer-use-linux.md
```

Acceptance:

- feature is fully disabled unless flag is set
- contracts compile
- docs explain architecture and safety model

---

### Milestone 1 — Contracts and Event Model

Deliverables:

```text
ComputerUseAction
ComputerUseTarget
ComputerUseSession
ComputerUseEvent
ComputerUseApprovalRequest
ComputerUseSnapshot
```

Acceptance:

- shared contracts build
- server, web, and Android can import the same schemas
- snapshot/event model is compatible with Androdex’s canonical server-state approach

---

### Milestone 2 — Container Driver

Deliverables:

```text
ContainerDriver
Screenshot capture
Action execution
Dependency health check
Session start/stop
```

Acceptance:

- starts isolated display
- opens browser or demo app
- captures PNG screenshot
- executes click/type/scroll/wait
- stops cleanly
- no host desktop control required

---

### Milestone 3 — Server Manager and APIs

Deliverables:

```text
ComputerUseManager
TargetRegistry
ScreenshotStore
Policy engine
HTTP endpoints
WS/RPC events
Audit log
```

Acceptance:

- web client can start a session
- screenshots stream to UI
- actions are policy-checked
- approval requests pause execution
- stop button kills session

---

### Milestone 4 — Web UI

Deliverables:

```text
Computer Use settings page
Target picker
Session viewer
Approval prompt
Action log
Kill switch
```

Acceptance:

- user can enable isolated mode
- user can start and stop a session
- user can approve or deny a target
- user can inspect actions after the fact

---

### Milestone 5 — Codex Provider Bridge

Deliverables:

```text
Provider computer-use capability
Codex driver integration
@Computer target hint support
Provider event mapping
Approval handoff
```

Acceptance:

- Codex can request a computer-use session
- Androdex asks user for target approval
- Codex receives screenshots/action results
- session events appear in thread UI

---

### Milestone 6 — Linux X11 Host Driver

Deliverables:

```text
LinuxX11Driver
Window listing
Window focus validation
Host screenshot capture
Host action execution
Strict policy gates
```

Acceptance:

- user can opt into host desktop control
- target window is locked
- actions stop if focus changes unexpectedly
- terminal/system windows are blocked
- every new target requires approval

---

### Milestone 7 — Wayland Experimental Driver

Deliverables:

```text
LinuxWaylandDriver
Portal-based screenshot attempt
Compositor capability detection
ydotool/uinput action support where available
Clear unsupported-state UI
```

Acceptance:

- detects GNOME/KDE/wlroots capabilities
- reports what is unsupported
- never silently falls back to unsafe behavior

---

### Milestone 8 — Android Remote Support

Deliverables:

```text
Computer Use snapshot view
Computer Use event subscription
Approval screen
Session stop control
Screenshot viewer
```

Acceptance:

- Android only consumes canonical server state
- approvals dispatch to Androdex backend
- reconnect/replay works
- Android does not own independent session state

---

### Milestone 9 — Hardening and Release

Deliverables:

```text
CI tests
xvfb integration tests
security regression tests
docs
release notes
dependency checker
```

Acceptance:

- feature can ship behind flag
- isolated mode is default
- host desktop mode is clearly experimental/opt-in
- audit logs are visible
- unsafe targets are blocked

---

## 13. Test Plan

### Unit Tests

Test:

```text
contract validation
action normalization
coordinate scaling
policy allow/deny decisions
approval lifecycle
target matching
stale screenshot rejection
driver health checks
```

### Integration Tests

Use `xvfb-run` or containerized X11:

```text
start isolated session
capture screenshot
click button
type into input
scroll page
drag element
block unsafe action
stop session
```

### Provider Tests

Test:

```text
Codex requests computer use
Androdex creates approval request
user approves target
screenshot sent to provider
actions returned
actions executed
result streamed back
```

### Security Tests

Test that Androdex blocks:

```text
terminal windows
password manager windows
system settings
unknown focus changes
clipboard access without approval
typing into wrong window
admin prompts
large coordinate drift
stale screenshots
```

### Android/Client Tests

Test:

```text
snapshot load
event subscription
replay after disconnect
approval response dispatch
session stop
screenshot rendering
```

---

## 14. First PR Checklist

The first PR should not attempt full desktop automation. It should establish the foundation.

Include:

```text
docs/computer-use-linux.md
packages/contracts/src/computerUse.ts
apps/server/src/computerUse/ComputerUseDriver.ts
apps/server/src/computerUse/ComputerUseManager.ts
apps/server/src/computerUse/Drivers/ContainerDriver.ts
apps/server/src/computerUse/Services/ComputerUsePolicy.ts
apps/server/src/computerUse/Services/ComputerUseAuditLog.ts
feature flag: ANDRODEX_COMPUTER_USE
basic server tests
```

Do **not** include yet:

```text
host desktop control
Wayland control
clipboard support
filesystem mounts
credential typing
admin prompt handling
```

---

## 15. Recommended Build Order

1. **Contracts first**
2. **Container driver second**
3. **Server manager and event stream third**
4. **Web approval/session UI fourth**
5. **Codex provider bridge fifth**
6. **Android remote view sixth**
7. **X11 host desktop driver seventh**
8. **Wayland experimental driver last**

That order gets you a safe, shippable Linux Computer Use feature before taking on the harder and riskier host desktop automation work.

---

## References

- [Codex Computer Use documentation](https://developers.openai.com/codex/app/computer-use)
- [OpenAI Computer Use guide](https://platform.openai.com/docs/guides/tools-computer-use)
- [Codex plugin build documentation](https://developers.openai.com/codex/plugins/build)
- [Androdex Desktop repository](https://github.com/Robertg761/Androdex-Desktop)
- [Androdex architecture docs](https://github.com/Robertg761/Androdex-Desktop/blob/main/docs/architecture.md)
- [Androdex Android canonical architecture](https://github.com/Robertg761/Androdex-Desktop/blob/main/docs/androdex-android-canonical-architecture.md)
- [Androdex Android client protocol surface](https://github.com/Robertg761/Androdex-Desktop/blob/main/docs/androdex-android-client-protocol-surface.md)
- [Androdex effect-codex-app-server package](https://github.com/Robertg761/Androdex-Desktop/blob/main/packages/effect-codex-app-server/package.json)
