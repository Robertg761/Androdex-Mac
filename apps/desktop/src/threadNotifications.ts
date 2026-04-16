import type { DesktopThreadNotification } from "@t3tools/contracts";
import type { NotificationConstructorOptions } from "electron";

interface WindowLike {
  isDestroyed: () => boolean;
  isFocused: () => boolean;
}

interface NotificationLike {
  show: () => void;
  on?: (event: "click", listener: () => void) => void;
}

export function shouldShowDesktopThreadNotification(windows: readonly WindowLike[]): boolean {
  return windows.every((window) => window.isDestroyed() || !window.isFocused());
}

export function createDesktopThreadNotificationOptions(
  notification: DesktopThreadNotification,
): NotificationConstructorOptions {
  return {
    title: notification.title,
    body: notification.body,
  };
}

export function showDesktopThreadNotification(input: {
  notification: DesktopThreadNotification;
  windows: readonly WindowLike[];
  createNotification: (options: NotificationConstructorOptions) => NotificationLike;
  onClick?: () => void;
}): boolean {
  if (!shouldShowDesktopThreadNotification(input.windows)) {
    return false;
  }

  try {
    const desktopNotification = input.createNotification(
      createDesktopThreadNotificationOptions(input.notification),
    );
    if (input.onClick) {
      desktopNotification.on?.("click", input.onClick);
    }
    desktopNotification.show();
    return true;
  } catch {
    return false;
  }
}
