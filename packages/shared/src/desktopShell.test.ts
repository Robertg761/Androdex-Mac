import { describe, expect, it } from "vitest";

import {
  DESKTOP_MAC_TRAFFIC_LIGHT_POSITION,
  DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX,
  DESKTOP_TITLEBAR_HEIGHT_PX,
} from "./desktopShell.ts";

describe("desktopShell metrics", () => {
  it("keeps the shared titlebar height aligned to the desktop shell chrome", () => {
    expect(DESKTOP_TITLEBAR_HEIGHT_PX).toBe(52);
  });

  it("reserves room to the right of the macOS traffic lights", () => {
    expect(DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX).toBeGreaterThan(
      DESKTOP_MAC_TRAFFIC_LIGHT_POSITION.x,
    );
    expect(DESKTOP_MAC_TRAFFIC_LIGHT_SAFE_AREA_LEFT_PX).toBe(90);
  });
});
