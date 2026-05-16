// @effect-diagnostics nodeBuiltinImport:off
import * as NodeTimers from "node:timers/promises";

import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseTarget,
} from "@t3tools/contracts";

import type {
  ComputerUseDriver,
  ComputerUseDriverSession,
  ComputerUseScreenshotBytes,
} from "./ComputerUseDriver.ts";
import {
  findCommand,
  findFirstCommand,
  hasCommand,
  readPngFromTempFile,
  runChecked,
  runWithDisplay,
} from "./processUtils.ts";

interface X11Session extends ComputerUseDriverSession {
  readonly windowId: string;
  readonly display: string;
}

const BLOCKED_WINDOW_PATTERNS = [
  /terminal/i,
  /\bconsole\b/i,
  /\bshell\b/i,
  /password/i,
  /keychain/i,
  /keepass/i,
  /1password/i,
  /bitwarden/i,
  /settings/i,
  /software/i,
  /package/i,
  /sudo/i,
  /admin/i,
] as const;

function displayEnv(): string | undefined {
  return process.env.DISPLAY;
}

function parseWmctrlLine(line: string): ComputerUseTarget | null {
  const columns = line.trim().split(/\s+/);
  if (columns.length < 4) return null;
  const windowId = columns[0];
  const title = columns.slice(3).join(" ").trim();
  if (!windowId || title.length === 0) return null;
  const sensitive = BLOCKED_WINDOW_PATTERNS.some((pattern) => pattern.test(title));
  const appName = title.split(/\s+-\s+/)[0] || title;
  const display = displayEnv();
  return {
    id: `x11:${windowId}` as ComputerUseTarget["id"],
    kind: "desktop-window",
    title,
    appName,
    ...(display ? { display } : {}),
    allowed: false,
    trustLevel: sensitive ? "sensitive" : "host-desktop",
    driver: "linux-x11",
    ...(sensitive
      ? { reason: "Blocked by the host-desktop safety policy." }
      : { reason: "Host desktop targets require explicit approval." }),
  };
}

function normalizeWindowId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("0x")) {
    return String(Number.parseInt(trimmed.slice(2), 16));
  }
  return trimmed.replace(/^0+/, "") || "0";
}

function getPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) {
    return { width: 0, height: 0 };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function mouseButton(button: Extract<ComputerUseAction, { type: "click" }>["button"]): string {
  switch (button) {
    case "right":
      return "3";
    case "middle":
      return "2";
    default:
      return "1";
  }
}

function normalizeKey(key: string): string {
  const lowered = key.toLowerCase();
  switch (lowered) {
    case "ctrl":
    case "control":
      return "ctrl";
    case "cmd":
    case "command":
    case "meta":
      return "super";
    case "option":
    case "alt":
      return "alt";
    case "return":
      return "Return";
    case "escape":
    case "esc":
      return "Escape";
    case "backspace":
      return "BackSpace";
    case "delete":
      return "Delete";
    case "tab":
      return "Tab";
    case "space":
      return "space";
    default:
      return key.length === 1 ? key : lowered;
  }
}

async function clickScroll(
  runXdotool: (args: readonly string[]) => Promise<unknown>,
  delta: number,
  negativeButton: string,
  positiveButton: string,
): Promise<void> {
  if (delta === 0) return;
  const button = delta > 0 ? positiveButton : negativeButton;
  const count = Math.max(1, Math.min(12, Math.ceil(Math.abs(delta) / 120)));
  for (let index = 0; index < count; index += 1) {
    await runXdotool(["click", button]);
  }
}

export class LinuxX11Driver implements ComputerUseDriver {
  readonly kind = "linux-x11" as const;

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const dependencies = [
      findCommand("xdotool"),
      findCommand("wmctrl"),
      findFirstCommand(["import", "scrot"]),
    ];
    const missing = dependencies.filter((dependency) => !dependency.found);
    if (process.platform !== "linux" || !displayEnv()) {
      return {
        driver: this.kind,
        status: "unsupported",
        message: "Host X11 control requires Linux with DISPLAY set.",
        dependencies,
      };
    }
    return {
      driver: this.kind,
      status: missing.length === 0 ? "available" : "missing-dependencies",
      message:
        missing.length === 0
          ? "Host X11 control is available but requires explicit opt-in."
          : `Missing ${missing.map((dependency) => dependency.name).join(", ")}.`,
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return [];
    }
    const result = await runChecked("wmctrl", ["-l"], {
      env: { ...process.env },
      timeoutMs: 5_000,
      allowNonZeroExit: true,
    });
    return result.stdout
      .split(/\r?\n/g)
      .map(parseWmctrlLine)
      .filter((target): target is ComputerUseTarget => target !== null);
  }

  async startSession(target: ComputerUseTarget): Promise<X11Session> {
    const windowId = target.id.replace(/^x11:/, "");
    if (target.trustLevel === "sensitive") {
      throw new Error("Sensitive host desktop targets are blocked.");
    }
    const display = displayEnv();
    if (!display) {
      throw new Error("DISPLAY is not set.");
    }
    await runWithDisplay(display, "xdotool", ["windowactivate", "--sync", windowId]);
    return {
      id: `driver:linux-x11:${windowId}`,
      target,
      windowId,
      display,
    };
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const x11Session = session as X11Session;
    const pngBytes = await readPngFromTempFile(async (filePath) => {
      if (hasCommand("import")) {
        await runWithDisplay(x11Session.display, "import", [
          "-window",
          x11Session.windowId,
          filePath,
        ]);
        return;
      }
      await runWithDisplay(x11Session.display, "scrot", ["-u", filePath]);
    });
    const size = getPngSize(pngBytes);
    return { pngBytes, width: size.width, height: size.height };
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    const x11Session = session as X11Session;
    const active = await runWithDisplay(x11Session.display, "xdotool", ["getactivewindow"]);
    if (normalizeWindowId(active.stdout) !== normalizeWindowId(x11Session.windowId)) {
      throw new Error("Target window lost focus before action execution.");
    }
    const runXdotool = (args: readonly string[]) =>
      runWithDisplay(x11Session.display, "xdotool", args);
    switch (action.type) {
      case "click":
        await runXdotool([
          "mousemove",
          String(action.x),
          String(action.y),
          "click",
          mouseButton(action.button),
        ]);
        return;
      case "double_click":
        await runXdotool([
          "mousemove",
          String(action.x),
          String(action.y),
          "click",
          "--repeat",
          "2",
          "1",
        ]);
        return;
      case "move":
        await runXdotool(["mousemove", String(action.x), String(action.y)]);
        return;
      case "drag": {
        const [first, ...rest] = action.path;
        if (!first) return;
        await runXdotool(["mousemove", String(first.x), String(first.y), "mousedown", "1"]);
        for (const point of rest) {
          await runXdotool(["mousemove", String(point.x), String(point.y)]);
        }
        await runXdotool(["mouseup", "1"]);
        return;
      }
      case "scroll": {
        const scrollX = action.scrollX ?? 0;
        const scrollY = action.scrollY ?? 0;
        if (scrollX === 0 && scrollY === 0) {
          return;
        }
        await runXdotool(["mousemove", String(action.x), String(action.y)]);
        await clickScroll(runXdotool, scrollY, "4", "5");
        await clickScroll(runXdotool, scrollX, "6", "7");
        return;
      }
      case "type":
        await runXdotool(["type", "--clearmodifiers", "--delay", "1", "--", action.text]);
        return;
      case "keypress":
        await runXdotool(["key", action.keys.map(normalizeKey).join("+")]);
        return;
      case "wait":
        await NodeTimers.setTimeout(action.ms ?? 1_000);
        return;
      case "screenshot":
        await this.captureScreenshot(session);
        return;
    }
  }

  async stopSession(_session: ComputerUseDriverSession): Promise<void> {}
}
