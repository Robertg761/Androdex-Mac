import { describe, expect, it, vi } from "vitest";

import type { DesktopThreadNotification } from "@t3tools/contracts";
import {
  createDesktopThreadNotificationOptions,
  shouldShowDesktopThreadNotification,
  showDesktopThreadNotification,
} from "./threadNotifications";

const baseNotification: DesktopThreadNotification = {
  kind: "thread-finished",
  environmentId: "environment-local" as DesktopThreadNotification["environmentId"],
  threadId: "thread-1" as DesktopThreadNotification["threadId"],
  title: "Thread finished",
  body: "Implement notifications",
};

describe("threadNotifications", () => {
  it("suppresses notifications while a desktop window is focused", () => {
    expect(
      shouldShowDesktopThreadNotification([
        {
          isDestroyed: () => false,
          isFocused: () => true,
        },
      ]),
    ).toBe(false);
  });

  it("allows notifications when no live window is focused", () => {
    expect(
      shouldShowDesktopThreadNotification([
        {
          isDestroyed: () => false,
          isFocused: () => false,
        },
        {
          isDestroyed: () => true,
          isFocused: () => true,
        },
      ]),
    ).toBe(true);
  });

  it("creates native notification options from the thread payload", () => {
    expect(createDesktopThreadNotificationOptions(baseNotification)).toEqual({
      title: "Thread finished",
      body: "Implement notifications",
    });
  });

  it("shows the notification and wires the click handler when eligible", () => {
    const onClick = vi.fn();
    const show = vi.fn();
    const on = vi.fn();

    const shown = showDesktopThreadNotification({
      notification: baseNotification,
      windows: [
        {
          isDestroyed: () => false,
          isFocused: () => false,
        },
      ],
      isNotificationSupported: () => true,
      createNotification: () => ({ show, on }),
      onClick,
    });

    expect(shown).toBe(true);
    expect(on).toHaveBeenCalledWith("click", onClick);
    expect(show).toHaveBeenCalledOnce();
  });

  it("returns false without creating a notification when support is unavailable", () => {
    const createNotification = vi.fn();

    const shown = showDesktopThreadNotification({
      notification: baseNotification,
      windows: [],
      isNotificationSupported: () => false,
      createNotification,
    });

    expect(shown).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
