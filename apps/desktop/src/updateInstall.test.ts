import { describe, expect, it, vi } from "vitest";

import { triggerDownloadedUpdateInstall } from "./updateInstall";

describe("triggerDownloadedUpdateInstall", () => {
  it("arms install-on-quit fallback and delegates to electron-updater", () => {
    const quitAndInstall = vi.fn();
    const updater = {
      autoInstallOnAppQuit: false,
      autoRunAppAfterInstall: false,
      quitAndInstall,
    };

    triggerDownloadedUpdateInstall(updater);

    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(updater.autoRunAppAfterInstall).toBe(true);
    expect(quitAndInstall).toHaveBeenCalledWith(true, true);
  });
});
