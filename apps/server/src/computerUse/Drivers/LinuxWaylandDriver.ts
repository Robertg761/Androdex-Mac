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
} from "./processUtils.ts";

interface WaylandSession extends ComputerUseDriverSession {
  readonly screenshotCommand: "spectacle" | "grim";
}

const DEFAULT_WIDTH = 0;
const DEFAULT_HEIGHT = 0;

const KEY_CODES: Readonly<Record<string, number>> = {
  alt: 56,
  backspace: 14,
  ctrl: 29,
  delete: 111,
  down: 108,
  end: 107,
  enter: 28,
  esc: 1,
  escape: 1,
  home: 102,
  left: 105,
  meta: 125,
  pagedown: 109,
  pageup: 104,
  return: 28,
  right: 106,
  shift: 42,
  space: 57,
  super: 125,
  tab: 15,
  up: 103,
  a: 30,
  b: 48,
  c: 46,
  d: 32,
  e: 18,
  f: 33,
  g: 34,
  h: 35,
  i: 23,
  j: 36,
  k: 37,
  l: 38,
  m: 50,
  n: 49,
  o: 24,
  p: 25,
  q: 16,
  r: 19,
  s: 31,
  t: 20,
  u: 22,
  v: 47,
  w: 17,
  x: 45,
  y: 21,
  z: 44,
  "0": 11,
  "1": 2,
  "2": 3,
  "3": 4,
  "4": 5,
  "5": 6,
  "6": 7,
  "7": 8,
  "8": 9,
  "9": 10,
};

function isWaylandSession(): boolean {
  return Boolean(process.env.WAYLAND_DISPLAY) || process.env.XDG_SESSION_TYPE === "wayland";
}

function screenshotCommand(): "spectacle" | "grim" | undefined {
  if (hasCommand("spectacle")) return "spectacle";
  if (hasCommand("grim")) return "grim";
  return undefined;
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

function ydotoolButton(button: Extract<ComputerUseAction, { type: "click" }>["button"]): string {
  switch (button) {
    case "right":
      return "0xC1";
    case "middle":
      return "0xC2";
    default:
      return "0xC0";
  }
}

function normalizeKeyName(key: string): string {
  const lowered = key.toLowerCase();
  switch (lowered) {
    case "cmd":
    case "command":
      return "meta";
    case "control":
      return "ctrl";
    case "option":
      return "alt";
    default:
      return lowered;
  }
}

function keySequence(keys: readonly string[]): string[] {
  const codes = keys
    .map((key) => KEY_CODES[normalizeKeyName(key)])
    .filter((code): code is number => code !== undefined);
  if (codes.length !== keys.length) {
    const unsupported = keys.find((key) => KEY_CODES[normalizeKeyName(key)] === undefined);
    throw new Error(`Unsupported Wayland keypress key: ${unsupported ?? "unknown"}.`);
  }
  return [...codes.map((code) => `${code}:1`), ...codes.toReversed().map((code) => `${code}:0`)];
}

async function runYdotool(args: readonly string[]): Promise<void> {
  await runChecked("ydotool", args, { timeoutMs: 15_000 });
}

async function scrollWheel(delta: number, axis: "x" | "y"): Promise<void> {
  if (delta === 0) return;
  const wheel = delta > 0 ? "-120" : "120";
  const count = Math.max(1, Math.min(12, Math.ceil(Math.abs(delta) / 120)));
  for (let index = 0; index < count; index += 1) {
    await runYdotool([
      "mousemove",
      "--wheel",
      "--",
      axis === "x" ? wheel : "0",
      axis === "y" ? wheel : "0",
    ]);
  }
}

export class LinuxWaylandDriver implements ComputerUseDriver {
  readonly kind = "linux-wayland" as const;

  async healthCheck(): Promise<ComputerUseDriverHealth> {
    const dependencies = [
      findFirstCommand(["xdg-desktop-portal", "/usr/libexec/xdg-desktop-portal"]),
      findFirstCommand(["spectacle", "grim"]),
      findCommand("ydotool"),
    ];
    const missing = dependencies.filter((dependency) => !dependency.found);
    if (process.platform !== "linux" || !isWaylandSession()) {
      return {
        driver: this.kind,
        status: "unsupported",
        message: "Wayland computer-use control requires a Linux Wayland session.",
        dependencies,
      };
    }
    return {
      driver: this.kind,
      status: missing.length === 0 ? "available" : "missing-dependencies",
      message:
        missing.length === 0
          ? "Host Wayland desktop control is available but requires explicit opt-in."
          : `Missing ${missing.map((dependency) => dependency.name).join(", ")}.`,
      dependencies,
    };
  }

  async listTargets(): Promise<ReadonlyArray<ComputerUseTarget>> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      return [];
    }
    return [
      {
        id: "wayland:desktop" as ComputerUseTarget["id"],
        kind: "desktop-display",
        title: "Wayland desktop",
        ...(process.env.XDG_CURRENT_DESKTOP ? { appName: process.env.XDG_CURRENT_DESKTOP } : {}),
        ...(process.env.WAYLAND_DISPLAY ? { display: process.env.WAYLAND_DISPLAY } : {}),
        allowed: false,
        trustLevel: "host-desktop",
        driver: this.kind,
        reason: "Host desktop targets require explicit approval.",
      },
    ];
  }

  async startSession(target: ComputerUseTarget): Promise<ComputerUseDriverSession> {
    const health = await this.healthCheck();
    if (health.status !== "available") {
      throw new Error(health.message);
    }
    const command = screenshotCommand();
    if (!command) {
      throw new Error("No Wayland screenshot command is available.");
    }
    const session: WaylandSession = {
      id: `driver:linux-wayland:${target.id}`,
      target,
      screenshotCommand: command,
    };
    return session;
  }

  async captureScreenshot(session: ComputerUseDriverSession): Promise<ComputerUseScreenshotBytes> {
    const waylandSession = session as WaylandSession;
    const pngBytes = await readPngFromTempFile(async (filePath) => {
      if (waylandSession.screenshotCommand === "spectacle") {
        await runChecked("spectacle", [
          "--background",
          "--nonotify",
          "--fullscreen",
          "--pointer",
          "--output",
          filePath,
        ]);
        return;
      }
      await runChecked("grim", [filePath]);
    });
    const size = getPngSize(pngBytes);
    return { pngBytes, width: size.width, height: size.height };
  }

  async executeAction(session: ComputerUseDriverSession, action: ComputerUseAction): Promise<void> {
    switch (action.type) {
      case "click":
        await runYdotool(["mousemove", "--absolute", String(action.x), String(action.y)]);
        await runYdotool(["click", ydotoolButton(action.button)]);
        return;
      case "double_click":
        await runYdotool(["mousemove", "--absolute", String(action.x), String(action.y)]);
        await runYdotool(["click", "0xC0"]);
        await runYdotool(["click", "0xC0"]);
        return;
      case "move":
        await runYdotool(["mousemove", "--absolute", String(action.x), String(action.y)]);
        return;
      case "drag": {
        const [first, ...rest] = action.path;
        if (!first) return;
        await runYdotool(["mousemove", "--absolute", String(first.x), String(first.y)]);
        await runYdotool(["click", "0x40"]);
        for (const point of rest) {
          await runYdotool(["mousemove", "--absolute", String(point.x), String(point.y)]);
        }
        await runYdotool(["click", "0x80"]);
        return;
      }
      case "scroll": {
        const scrollX = action.scrollX ?? 0;
        const scrollY = action.scrollY ?? 0;
        if (scrollX === 0 && scrollY === 0) {
          return;
        }
        await runYdotool(["mousemove", "--absolute", String(action.x), String(action.y)]);
        await scrollWheel(scrollX, "x");
        await scrollWheel(scrollY, "y");
        return;
      }
      case "type":
        await runYdotool(["type", "--delay", "1", "--", action.text]);
        return;
      case "keypress":
        await runYdotool(["key", ...keySequence(action.keys)]);
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
