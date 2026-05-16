import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPUTER_USE_SETTINGS,
  type ComputerUseSettings,
  type ComputerUseTarget,
} from "@t3tools/contracts";

import { evaluateActionPolicy, evaluateTargetPolicy } from "./ComputerUsePolicy.ts";

const settings: ComputerUseSettings = DEFAULT_COMPUTER_USE_SETTINGS;

const isolatedTarget = {
  id: "target:browser" as ComputerUseTarget["id"],
  kind: "browser",
  title: "Isolated browser",
  allowed: true,
  trustLevel: "isolated",
  driver: "browser",
} as const satisfies ComputerUseTarget;

describe("ComputerUsePolicy", () => {
  it("allows an already-approved isolated target", () => {
    expect(evaluateTargetPolicy(isolatedTarget, settings)).toEqual({ type: "allow" });
  });

  it("requires approval for a new non-sensitive target when the safety gate is enabled", () => {
    expect(evaluateTargetPolicy({ ...isolatedTarget, allowed: false }, settings)).toMatchObject({
      type: "approval-required",
    });
  });

  it("blocks sensitive and host-desktop targets by default", () => {
    expect(
      evaluateTargetPolicy(
        {
          ...isolatedTarget,
          id: "target:terminal" as ComputerUseTarget["id"],
          kind: "desktop-window",
          title: "Terminal",
          trustLevel: "sensitive",
          driver: "linux-x11",
        },
        settings,
      ),
    ).toMatchObject({ type: "block" });

    expect(
      evaluateTargetPolicy(
        {
          ...isolatedTarget,
          id: "target:x11" as ComputerUseTarget["id"],
          kind: "desktop-window",
          title: "Firefox",
          trustLevel: "host-desktop",
          driver: "linux-x11",
        },
        settings,
      ),
    ).toEqual({ type: "block", reason: "Host desktop control is disabled." });
  });

  it("allows approved X11 and Wayland host-desktop targets when host control is enabled", () => {
    for (const driver of ["linux-x11", "linux-wayland"] as const) {
      expect(
        evaluateTargetPolicy(
          {
            ...isolatedTarget,
            id: `target:${driver}` as ComputerUseTarget["id"],
            kind: "desktop-display",
            title: "Desktop",
            allowed: true,
            trustLevel: "host-desktop",
            driver,
          },
          {
            ...settings,
            hostDesktopEnabled: true,
          },
        ),
      ).toEqual({ type: "allow" });
    }
  });

  it("requires approval for sensitive-looking typed text", () => {
    expect(
      evaluateActionPolicy({ type: "type", text: "api_key=sk-example" }, isolatedTarget, settings),
    ).toMatchObject({ type: "approval-required" });
  });

  it("blocks clipboard paste and requires review for host-desktop typing by default", () => {
    expect(
      evaluateActionPolicy({ type: "keypress", keys: ["ctrl", "v"] }, isolatedTarget, settings),
    ).toEqual({ type: "block", reason: "Clipboard paste is disabled." });

    expect(
      evaluateActionPolicy(
        { type: "type", text: "hello" },
        {
          ...isolatedTarget,
          id: "target:x11" as ComputerUseTarget["id"],
          kind: "desktop-window",
          trustLevel: "host-desktop",
          driver: "linux-x11",
        },
        {
          ...settings,
          hostDesktopEnabled: true,
        },
      ),
    ).toEqual({
      type: "approval-required",
      reason: "Typing into a host desktop target requires review.",
    });
  });
});
