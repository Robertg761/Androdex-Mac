# Linux Computer Use

Androdex Computer Use is a server-owned runtime for scoped screen capture and input automation on Linux. It is disabled by default and requires both:

```sh
ANDRODEX_COMPUTER_USE=1
```

and the persisted Computer Use setting to be enabled.

The canonical state lives in `apps/server/src/computerUse`. Web, desktop, and Android clients should use the server snapshot, events, and commands rather than owning their own session state.

## Architecture

- `packages/contracts/src/computerUse.ts` defines the shared schemas for targets, sessions, screenshots, approvals, actions, status, snapshots, events, and RPC methods.
- `apps/server/src/computerUse/Layers/ComputerUseManager.ts` owns in-memory sessions, approvals, screenshot retention, policy checks, event publishing, and the audit log.
- `apps/server/src/computerUse/Drivers/VirtualDisplayDriver.ts` runs the default isolated Xvfb target for `container` and `browser` modes.
- `apps/server/src/computerUse/Drivers/LinuxX11Driver.ts` supports opt-in host X11 window control with stricter policy gates.
- `apps/server/src/computerUse/Drivers/LinuxWaylandDriver.ts` supports opt-in host Wayland display control using KDE Spectacle or grim for screenshots and ydotool for visible pointer/keyboard input.
- `apps/web/src/components/settings/ComputerUseSettings.tsx` exposes status, settings, session controls, screenshots, approvals, and audit visibility.

The default loop is:

1. Start a target-scoped session.
2. Capture a screenshot.
3. Validate requested actions through policy.
4. Ask for approval where required.
5. Execute actions through the active driver.
6. Capture a post-action screenshot.
7. Publish events and append audit entries.

## API Surface

HTTP:

```text
GET    /api/computer-use/status
GET    /api/computer-use/targets
GET    /api/computer-use/sessions
POST   /api/computer-use/sessions
GET    /api/computer-use/sessions/:sessionId
DELETE /api/computer-use/sessions/:sessionId
POST   /api/computer-use/sessions/:sessionId/screenshot
POST   /api/computer-use/sessions/:sessionId/actions
POST   /api/computer-use/approvals/:approvalId/respond
```

WebSocket RPC:

```text
computerUse.getStatus
computerUse.getSnapshot
computerUse.listTargets
computerUse.startSession
computerUse.stopSession
computerUse.captureScreenshot
computerUse.executeActions
computerUse.respondToApproval
computerUse.subscribeEvents
```

Android should use the same snapshot and event stream model as the rest of Androdex: fetch a snapshot, subscribe to events, replay on reconnect gaps, and dispatch mutations through canonical commands.

## Safety Model

Computer Use is default-deny:

- Host desktop control is disabled unless `hostDesktopEnabled` is true.
- Sensitive targets are blocked by title and trust level.
- Terminal, shell, password manager, settings, package manager, admin, banking, and payment targets are blocked.
- New targets require approval when `askBeforeNewTarget` is enabled.
- Large or secret-looking text input requires approval.
- Clipboard paste is blocked unless clipboard access is enabled.
- Host desktop typing requires explicit sensitive-action review when that safety gate is enabled.
- X11 sessions verify the focused window before each action.

The audit log is written to:

```text
<logsDir>/computer-use-audit.ndjson
```

and retained in the live snapshot for UI inspection.

## Linux Dependencies

Isolated display/browser:

```text
Xvfb
xdotool
import or scrot
chromium, chromium-browser, google-chrome, or firefox for browser mode
```

Host X11:

```text
xdotool
wmctrl
import or scrot
DISPLAY must be set
```

Wayland:

```text
xdg-desktop-portal
spectacle or grim
ydotool
```

Wayland support is enabled only when the session is Wayland and the screenshot and input dependencies are present. On KDE, Spectacle is preferred because it can capture the full desktop with the pointer visible. `ydotool` must be installed and usable by the current user, including any daemon/uinput permissions required by the distro. Wayland must never silently fall back to unsafe host automation.
