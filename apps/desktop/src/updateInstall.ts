export interface DesktopUpdateInstaller {
  autoInstallOnAppQuit: boolean;
  autoRunAppAfterInstall: boolean;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

/**
 * Configure electron-updater for an explicit install request and let it drive
 * the shutdown sequence. This keeps a downloaded update installable on app quit
 * even if the explicit handoff needs Electron's normal quit flow to complete.
 */
export function triggerDownloadedUpdateInstall(updater: DesktopUpdateInstaller): void {
  updater.autoInstallOnAppQuit = true;
  updater.autoRunAppAfterInstall = true;
  updater.quitAndInstall(true, true);
}
