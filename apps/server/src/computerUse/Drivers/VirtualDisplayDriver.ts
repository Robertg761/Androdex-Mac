// @effect-diagnostics nodeBuiltinImport:off
import type { ChildProcess } from "node:child_process";
import * as NodeTimers from "node:timers/promises";

import type {
  ComputerUseAction,
  ComputerUseDriverHealth,
  ComputerUseDriverKind,
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
  runWithDisplay,
  spawnDetached,
  terminateProcess,
} from "./processUtils.ts";

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;
const DEFAULT_DEPTH = 24;

let displayCounter = 90;

interface VirtualDisplaySession extends ComputerUseDriverSession {
  readonly display: string;
  readonly xvfb: ChildProcess;
  readonly browser?: ChildProcess | undefined;
  readonly width: number;
  readonly height: number;
}

function nextDisplay(): string {
  displayCounter = displayCounter >= 190 ? 90 : displayCounter + 1;
  return `:${displayCounter}`;
}

function getPngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 24) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
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

function scrollClicks(delta: number | undefined): number {
  if (delta === undefined || delta === 0) return 0;
  return Math.max(1, Math.min(12, Math.ceil(Math.abs(delta) / 120)));
}

function findBrowserCommand(): string | undefined {
  for (const candidate of ["chromium", "chromium-browser", "google-chrome", "firefox"]) {
    if (hasCommand(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export class VirtualDisplayDriver implements ComputerUseDriver {
  readonly kind: ComputerUseDriverKind;
  readonly #modeLabel: string;

  constructor(kind: "container" | "browser") {
    this.kind = kind;
    this.#modeLabel = kind === "container" ? "isolated display" : "isolated browser";
  }

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const dependencies = [
      findCommand("Xvfb"),
      findCommand("xdotool"),
      findFirstCommand(["import", "scrot"]),
      ...(this.kind === "browser"
        ? [findFirstCommand(["chromium", "chromium-browser", "google-chrome", "firefox"])]
        : []),
    ];
    const missing = dependencies.filter((dependency) => !dependency.found);
    return {
      driver: this.kind,
      status: missing.length === 0 ? "available" : "missing-dependencies",
      message:
        missing.length === 0
          ? `Ready to run an ${this.#modeLabel}.`
          : `Missing ${missing.map((dependency) => dependency.name).join(", ")}.`,
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const health = await this.healthCheck();
    return [
      {
        id: `virtual:${this.kind}` as ComputerUseTarget["id"],
        kind: this.kind === "browser" ? "browser" : "container",
        title: this.kind === "browser" ? "Isolated browser" : "Isolated Linux display",
        allowed: health.status === "available",
        trustLevel: "isolated",
        driver: this.kind,
        bounds: {
          x: 0,
          y: 0,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        },
        ...(health.status === "available" ? {} : { reason: health.message }),
      },
    ];
  }

  async startSession(target: ComputerUseTarget): Promise<VirtualDisplaySession> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      throw new Error(health.message);
    }

    const display = nextDisplay();
    const env = { ...process.env, DISPLAY: display };
    const xvfb = spawnDetached(
      "Xvfb",
      [display, "-screen", "0", `${DEFAULT_WIDTH}x${DEFAULT_HEIGHT}x${DEFAULT_DEPTH}`],
      env,
    );
    await NodeTimers.setTimeout(500);

    let browser: ChildProcess | undefined;
    if (this.kind === "browser") {
      const browserCommand = findBrowserCommand();
      if (browserCommand !== undefined) {
        browser = spawnDetached(
          browserCommand,
          ["--no-first-run", "--disable-gpu", "--window-size=1280,800", "about:blank"],
          env,
        );
        await NodeTimers.setTimeout(900);
      }
    }

    return {
      id: `driver:${this.kind}:${display}`,
      target,
      display,
      xvfb,
      ...(browser ? { browser } : {}),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    };
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const virtualSession = session as VirtualDisplaySession;
    const pngBytes = await readPngFromTempFile(async (filePath) => {
      if (hasCommand("import")) {
        await runWithDisplay(virtualSession.display, "import", ["-window", "root", filePath]);
        return;
      }
      await runWithDisplay(virtualSession.display, "scrot", [filePath]);
    });
    const size = getPngSize(pngBytes);
    return { pngBytes, width: size.width, height: size.height };
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    const virtualSession = session as VirtualDisplaySession;
    const runXdotool = (args: readonly string[]) =>
      runWithDisplay(virtualSession.display, "xdotool", args);

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
        await runXdotool(["mousemove", String(action.x), String(action.y)]);
        const verticalButton = (action.scrollY ?? 0) > 0 ? "5" : "4";
        for (let index = 0; index < scrollClicks(action.scrollY); index += 1) {
          await runXdotool(["click", verticalButton]);
        }
        const horizontalButton = (action.scrollX ?? 0) > 0 ? "7" : "6";
        for (let index = 0; index < scrollClicks(action.scrollX); index += 1) {
          await runXdotool(["click", horizontalButton]);
        }
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

  async stopSession(session: ComputerUseDriverSession): Promise<void> {
    const virtualSession = session as VirtualDisplaySession;
    await terminateProcess(virtualSession.browser);
    await terminateProcess(virtualSession.xvfb);
  }
}
