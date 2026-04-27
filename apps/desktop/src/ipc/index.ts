import { BrowserWindow, dialog, ipcMain, Menu, nativeTheme, Notification, shell } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import type {
  ClientSettings,
  ContextMenuItem,
  DesktopAppBranding,
  DesktopServerExposureMode,
  DesktopServerExposureState,
  DesktopThreadNotification,
  DesktopTheme,
  DesktopUpdateChannel,
  DesktopUpdateActionResult,
  DesktopUpdateCheckResult,
  DesktopUpdateState,
  PersistedSavedEnvironmentRecord,
} from "@t3tools/contracts";
import {
  readClientSettings,
  readSavedEnvironmentRegistry,
  readSavedEnvironmentSecret,
  removeSavedEnvironmentSecret,
  writeClientSettings,
  writeSavedEnvironmentRegistry,
  writeSavedEnvironmentSecret,
} from "../clientPersistence";
import { showDesktopThreadNotification } from "../threadNotifications";
import {
  CONFIRM_CHANNEL,
  CONTEXT_MENU_CHANNEL,
  GET_APP_BRANDING_CHANNEL,
  GET_CLIENT_SETTINGS_CHANNEL,
  GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL,
  GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL,
  GET_SAVED_ENVIRONMENT_SECRET_CHANNEL,
  GET_SERVER_EXPOSURE_STATE_CHANNEL,
  OPEN_EXTERNAL_CHANNEL,
  PICK_FOLDER_CHANNEL,
  REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL,
  SET_CLIENT_SETTINGS_CHANNEL,
  SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL,
  SET_SAVED_ENVIRONMENT_SECRET_CHANNEL,
  SET_SERVER_EXPOSURE_MODE_CHANNEL,
  SET_THEME_CHANNEL,
  SHOW_THREAD_NOTIFICATION_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_SET_CHANNEL_CHANNEL,
} from "./channels";

interface DesktopSecretStorage {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface DesktopIpcRuntime {
  readonly clientSettingsPath: string;
  readonly savedEnvironmentRegistryPath: string;
  readonly getAppBranding: () => DesktopAppBranding;
  readonly getBootstrapPayload: () => {
    readonly label: string;
    readonly httpBaseUrl: string | null;
    readonly wsBaseUrl: string | null;
    readonly bootstrapToken?: string;
  };
  readonly getDesktopSecretStorage: () => DesktopSecretStorage;
  readonly getServerExposureState: () => DesktopServerExposureState;
  readonly getDesktopServerExposureMode: () => DesktopServerExposureMode;
  readonly applyDesktopServerExposureMode: (
    mode: DesktopServerExposureMode,
    options?: { readonly persist?: boolean; readonly rejectIfUnavailable?: boolean },
  ) => Promise<DesktopServerExposureState>;
  readonly relaunchDesktopApp: (reason: string) => void;
  readonly getMainWindow: () => BrowserWindow | null;
  readonly showConfirmDialog: (message: string, owner: BrowserWindow | null) => Promise<boolean>;
  readonly resolvePickFolderDefaultPath: (rawOptions: unknown) => string | undefined;
  readonly getSafeTheme: (rawTheme: unknown) => DesktopTheme | null;
  readonly getSafeExternalUrl: (rawUrl: unknown) => string | null;
  readonly getDesktopThreadNotification: (
    rawNotification: unknown,
  ) => DesktopThreadNotification | null;
  readonly revealWindow: (window: BrowserWindow) => void;
  readonly getDestructiveMenuIcon: () => Electron.NativeImage | undefined;
  readonly getUpdateState: () => DesktopUpdateState;
  readonly setDesktopUpdateChannel: (channel: DesktopUpdateChannel) => Promise<DesktopUpdateState>;
  readonly downloadAvailableUpdate: () => Promise<{ accepted: boolean; completed: boolean }>;
  readonly installDownloadedUpdate: () => Promise<{ accepted: boolean; completed: boolean }>;
  readonly isQuitting: () => boolean;
  readonly isUpdaterConfigured: () => boolean;
  readonly checkForUpdates: (reason: string) => Promise<boolean>;
}

export function registerDesktopIpcHandlers(runtime: DesktopIpcRuntime): void {
  ipcMain.removeAllListeners(GET_APP_BRANDING_CHANNEL);
  ipcMain.on(GET_APP_BRANDING_CHANNEL, (event) => {
    event.returnValue = runtime.getAppBranding();
  });

  ipcMain.removeAllListeners(GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
  ipcMain.on(GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL, (event) => {
    event.returnValue = runtime.getBootstrapPayload();
  });

  ipcMain.removeHandler(GET_CLIENT_SETTINGS_CHANNEL);
  ipcMain.handle(GET_CLIENT_SETTINGS_CHANNEL, async () =>
    readClientSettings(runtime.clientSettingsPath),
  );

  ipcMain.removeHandler(SET_CLIENT_SETTINGS_CHANNEL);
  ipcMain.handle(SET_CLIENT_SETTINGS_CHANNEL, async (_event, rawSettings: unknown) => {
    if (typeof rawSettings !== "object" || rawSettings === null) {
      throw new Error("Invalid client settings payload.");
    }

    writeClientSettings(runtime.clientSettingsPath, rawSettings as ClientSettings);
  });

  ipcMain.removeHandler(GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL);
  ipcMain.handle(GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, async () =>
    readSavedEnvironmentRegistry(runtime.savedEnvironmentRegistryPath),
  );

  ipcMain.removeHandler(SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL);
  ipcMain.handle(SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, async (_event, rawRecords: unknown) => {
    if (!Array.isArray(rawRecords)) {
      throw new Error("Invalid saved environment registry payload.");
    }

    writeSavedEnvironmentRegistry(
      runtime.savedEnvironmentRegistryPath,
      rawRecords as readonly PersistedSavedEnvironmentRecord[],
    );
  });

  ipcMain.removeHandler(GET_SAVED_ENVIRONMENT_SECRET_CHANNEL);
  ipcMain.handle(
    GET_SAVED_ENVIRONMENT_SECRET_CHANNEL,
    async (_event, rawEnvironmentId: unknown) => {
      if (typeof rawEnvironmentId !== "string" || rawEnvironmentId.trim().length === 0) {
        return null;
      }

      return readSavedEnvironmentSecret({
        registryPath: runtime.savedEnvironmentRegistryPath,
        environmentId: rawEnvironmentId,
        secretStorage: runtime.getDesktopSecretStorage(),
      });
    },
  );

  ipcMain.removeHandler(SET_SAVED_ENVIRONMENT_SECRET_CHANNEL);
  ipcMain.handle(
    SET_SAVED_ENVIRONMENT_SECRET_CHANNEL,
    async (_event, rawEnvironmentId: unknown, rawSecret: unknown) => {
      if (typeof rawEnvironmentId !== "string" || rawEnvironmentId.trim().length === 0) {
        throw new Error("Invalid saved environment id.");
      }
      if (typeof rawSecret !== "string" || rawSecret.trim().length === 0) {
        throw new Error("Invalid saved environment secret.");
      }

      return writeSavedEnvironmentSecret({
        registryPath: runtime.savedEnvironmentRegistryPath,
        environmentId: rawEnvironmentId,
        secret: rawSecret,
        secretStorage: runtime.getDesktopSecretStorage(),
      });
    },
  );

  ipcMain.removeHandler(REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL);
  ipcMain.handle(
    REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL,
    async (_event, rawEnvironmentId: unknown) => {
      if (typeof rawEnvironmentId !== "string" || rawEnvironmentId.trim().length === 0) {
        return;
      }

      removeSavedEnvironmentSecret({
        registryPath: runtime.savedEnvironmentRegistryPath,
        environmentId: rawEnvironmentId,
      });
    },
  );

  ipcMain.removeHandler(GET_SERVER_EXPOSURE_STATE_CHANNEL);
  ipcMain.handle(GET_SERVER_EXPOSURE_STATE_CHANNEL, async () => runtime.getServerExposureState());

  ipcMain.removeHandler(SET_SERVER_EXPOSURE_MODE_CHANNEL);
  ipcMain.handle(SET_SERVER_EXPOSURE_MODE_CHANNEL, async (_event, rawMode: unknown) => {
    if (rawMode !== "local-only" && rawMode !== "network-accessible") {
      throw new Error("Invalid desktop server exposure input.");
    }

    const nextMode = rawMode as DesktopServerExposureMode;
    if (nextMode === runtime.getDesktopServerExposureMode()) {
      return runtime.getServerExposureState();
    }

    const nextState = await runtime.applyDesktopServerExposureMode(nextMode, {
      persist: true,
      rejectIfUnavailable: true,
    });
    runtime.relaunchDesktopApp(`serverExposureMode=${nextMode}`);
    return nextState;
  });

  ipcMain.removeHandler(PICK_FOLDER_CHANNEL);
  ipcMain.handle(PICK_FOLDER_CHANNEL, async (_event, rawOptions: unknown) => {
    const owner = BrowserWindow.getFocusedWindow() ?? runtime.getMainWindow();
    const defaultPath = runtime.resolvePickFolderDefaultPath(rawOptions);
    const result = owner
      ? await dialog.showOpenDialog(owner, {
          properties: ["openDirectory", "createDirectory"],
          ...(defaultPath ? { defaultPath } : {}),
        })
      : await dialog.showOpenDialog({
          properties: ["openDirectory", "createDirectory"],
          ...(defaultPath ? { defaultPath } : {}),
        });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.removeHandler(CONFIRM_CHANNEL);
  ipcMain.handle(CONFIRM_CHANNEL, async (_event, message: unknown) => {
    if (typeof message !== "string") {
      return false;
    }

    const owner = BrowserWindow.getFocusedWindow() ?? runtime.getMainWindow();
    return runtime.showConfirmDialog(message, owner);
  });

  ipcMain.removeHandler(SET_THEME_CHANNEL);
  ipcMain.handle(SET_THEME_CHANNEL, async (_event, rawTheme: unknown) => {
    const theme = runtime.getSafeTheme(rawTheme);
    if (!theme) {
      return;
    }

    nativeTheme.themeSource = theme;
  });

  ipcMain.removeHandler(CONTEXT_MENU_CHANNEL);
  ipcMain.handle(
    CONTEXT_MENU_CHANNEL,
    async (_event, items: ContextMenuItem[], position?: { x: number; y: number }) => {
      const normalizeItems = (source: readonly ContextMenuItem[]): ContextMenuItem[] => {
        const normalizedItems: ContextMenuItem[] = [];
        for (const item of source) {
          if (typeof item.id !== "string" || typeof item.label !== "string") {
            continue;
          }
          const normalizedItem: ContextMenuItem = {
            id: item.id,
            label: item.label,
            destructive: item.destructive === true,
            disabled: item.disabled === true,
          };
          if (item.children) {
            const normalizedChildren = normalizeItems(item.children);
            if (normalizedChildren.length === 0) {
              continue;
            }
            normalizedItem.children = normalizedChildren;
          }
          normalizedItems.push(normalizedItem);
        }
        return normalizedItems;
      };
      const normalizedItems = normalizeItems(items);
      if (normalizedItems.length === 0) {
        return null;
      }

      const popupPosition =
        position &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        position.x >= 0 &&
        position.y >= 0
          ? {
              x: Math.floor(position.x),
              y: Math.floor(position.y),
            }
          : null;

      const window = BrowserWindow.getFocusedWindow() ?? runtime.getMainWindow();
      if (!window) return null;

      return new Promise<string | null>((resolve) => {
        const buildTemplate = (
          entries: readonly ContextMenuItem[],
        ): MenuItemConstructorOptions[] => {
          const template: MenuItemConstructorOptions[] = [];
          let hasInsertedDestructiveSeparator = false;
          for (const item of entries) {
            if (item.destructive && !hasInsertedDestructiveSeparator && template.length > 0) {
              template.push({ type: "separator" });
              hasInsertedDestructiveSeparator = true;
            }
            const itemOption: MenuItemConstructorOptions = {
              label: item.label,
              enabled: !item.disabled,
            };
            if (item.children && item.children.length > 0) {
              itemOption.submenu = buildTemplate(item.children);
            } else {
              itemOption.click = () => resolve(item.id);
            }
            if (item.destructive && (!item.children || item.children.length === 0)) {
              const destructiveIcon = runtime.getDestructiveMenuIcon();
              if (destructiveIcon) {
                itemOption.icon = destructiveIcon;
              }
            }
            template.push(itemOption);
          }
          return template;
        };

        const menu = Menu.buildFromTemplate(buildTemplate(normalizedItems));
        menu.popup({
          window,
          ...popupPosition,
          callback: () => resolve(null),
        });
      });
    },
  );

  ipcMain.removeHandler(OPEN_EXTERNAL_CHANNEL);
  ipcMain.handle(OPEN_EXTERNAL_CHANNEL, async (_event, rawUrl: unknown) => {
    const externalUrl = runtime.getSafeExternalUrl(rawUrl);
    if (!externalUrl) {
      return false;
    }

    try {
      await shell.openExternal(externalUrl);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.removeHandler(SHOW_THREAD_NOTIFICATION_CHANNEL);
  ipcMain.handle(SHOW_THREAD_NOTIFICATION_CHANNEL, async (_event, rawNotification: unknown) => {
    const notification = runtime.getDesktopThreadNotification(rawNotification);
    if (!notification) {
      return false;
    }

    return showDesktopThreadNotification({
      notification,
      windows: BrowserWindow.getAllWindows(),
      isNotificationSupported: () => Notification.isSupported(),
      createNotification: (options) => new Notification(options),
      onClick: () => {
        const window = runtime.getMainWindow() ?? BrowserWindow.getAllWindows()[0];
        if (window) {
          runtime.revealWindow(window);
        }
      },
    });
  });

  ipcMain.removeHandler(UPDATE_GET_STATE_CHANNEL);
  ipcMain.handle(UPDATE_GET_STATE_CHANNEL, async () => runtime.getUpdateState());

  ipcMain.removeHandler(UPDATE_SET_CHANNEL_CHANNEL);
  ipcMain.handle(UPDATE_SET_CHANNEL_CHANNEL, async (_event, rawChannel: unknown) => {
    if (rawChannel !== "latest" && rawChannel !== "nightly") {
      throw new Error("Invalid desktop update channel input.");
    }
    return runtime.setDesktopUpdateChannel(rawChannel);
  });

  ipcMain.removeHandler(UPDATE_DOWNLOAD_CHANNEL);
  ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async () => {
    const result = await runtime.downloadAvailableUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: runtime.getUpdateState(),
    } satisfies DesktopUpdateActionResult;
  });

  ipcMain.removeHandler(UPDATE_INSTALL_CHANNEL);
  ipcMain.handle(UPDATE_INSTALL_CHANNEL, async () => {
    if (runtime.isQuitting()) {
      return {
        accepted: false,
        completed: false,
        state: runtime.getUpdateState(),
      } satisfies DesktopUpdateActionResult;
    }
    const result = await runtime.installDownloadedUpdate();
    return {
      accepted: result.accepted,
      completed: result.completed,
      state: runtime.getUpdateState(),
    } satisfies DesktopUpdateActionResult;
  });

  ipcMain.removeHandler(UPDATE_CHECK_CHANNEL);
  ipcMain.handle(UPDATE_CHECK_CHANNEL, async () => {
    if (!runtime.isUpdaterConfigured()) {
      return {
        checked: false,
        state: runtime.getUpdateState(),
      } satisfies DesktopUpdateCheckResult;
    }
    const checked = await runtime.checkForUpdates("web-ui");
    return {
      checked,
      state: runtime.getUpdateState(),
    } satisfies DesktopUpdateCheckResult;
  });
}
