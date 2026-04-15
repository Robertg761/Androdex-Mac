import { describe, expect, it, vi } from "vitest";
import {
  ANDRODEX_ACTIVE_THREAD_SELECTOR,
  ANDRODEX_ANDROID_BRIDGE_VERSION,
  createAndrodexAndroidBridge,
  documentHasAndrodexActiveThread,
} from "./androdexAndroidBridge";

describe("androdexAndroidBridge", () => {
  it("reads the explicit active-thread marker", () => {
    const querySelector = vi.fn((selector: string) => {
      if (selector !== ANDRODEX_ACTIVE_THREAD_SELECTOR) {
        return null;
      }

      return {
        dataset: {
          androdexActiveThread: "true",
        },
      };
    });

    expect(documentHasAndrodexActiveThread({ querySelector })).toBe(true);
  });

  it("closes an open mobile sidebar through the contract", () => {
    const setOpenMobile = vi.fn();
    const bridge = createAndrodexAndroidBridge({
      isMobile: true,
      open: true,
      openMobile: true,
      readHasActiveThread: () => true,
      setOpen: vi.fn(),
      setOpenMobile,
      toggleSidebar: vi.fn(),
    });

    expect(bridge.version).toBe(ANDRODEX_ANDROID_BRIDGE_VERSION);
    expect(bridge.closeSidebar()).toBe(true);
    expect(setOpenMobile).toHaveBeenCalledWith(false);
    expect(bridge.getState()).toEqual({
      version: ANDRODEX_ANDROID_BRIDGE_VERSION,
      hasActiveThread: true,
      isSidebarOpen: true,
      isMobile: true,
    });
  });

  it("reports false when the sidebar is already closed", () => {
    const bridge = createAndrodexAndroidBridge({
      isMobile: true,
      open: true,
      openMobile: false,
      readHasActiveThread: () => false,
      setOpen: vi.fn(),
      setOpenMobile: vi.fn(),
      toggleSidebar: vi.fn(),
    });

    expect(bridge.closeSidebar()).toBe(false);
    expect(bridge.hasActiveThread()).toBe(false);
  });
});
