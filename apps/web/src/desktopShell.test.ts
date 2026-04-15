import { describe, expect, it } from "vitest";

import { getDesktopTitlebarStyle } from "./desktopShell";

describe("getDesktopTitlebarStyle", () => {
  it("returns the shared titlebar height", () => {
    expect(getDesktopTitlebarStyle()).toEqual({
      height: "52px",
    });
  });

  it("can reserve the macOS traffic-light safe area", () => {
    expect(getDesktopTitlebarStyle({ reserveMacTrafficLights: true })).toEqual({
      height: "52px",
      paddingInlineStart: "90px",
    });
  });
});
