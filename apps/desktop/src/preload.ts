import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";
import {
  CONFIRM_CHANNEL,
  CONTEXT_MENU_CHANNEL,
  GET_CLIENT_SETTINGS_CHANNEL,
  GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL,
  GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL,
  GET_SAVED_ENVIRONMENT_SECRET_CHANNEL,
  GET_SERVER_EXPOSURE_STATE_CHANNEL,
  MENU_ACTION_CHANNEL,
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
  UPDATE_STATE_CHANNEL,
} from "./ipc/channels";

contextBridge.exposeInMainWorld("desktopBridge", {
  getLocalEnvironmentBootstrap: () => {
    const result = ipcRenderer.sendSync(GET_LOCAL_ENVIRONMENT_BOOTSTRAP_CHANNEL);
    if (typeof result !== "object" || result === null) {
      return null;
    }
    return result as ReturnType<DesktopBridge["getLocalEnvironmentBootstrap"]>;
  },
  getClientSettings: () => ipcRenderer.invoke(GET_CLIENT_SETTINGS_CHANNEL),
  setClientSettings: (settings) => ipcRenderer.invoke(SET_CLIENT_SETTINGS_CHANNEL, settings),
  getSavedEnvironmentRegistry: () => ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL),
  setSavedEnvironmentRegistry: (records) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_REGISTRY_CHANNEL, records),
  getSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(GET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  setSavedEnvironmentSecret: (environmentId, secret) =>
    ipcRenderer.invoke(SET_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId, secret),
  removeSavedEnvironmentSecret: (environmentId) =>
    ipcRenderer.invoke(REMOVE_SAVED_ENVIRONMENT_SECRET_CHANNEL, environmentId),
  getServerExposureState: () => ipcRenderer.invoke(GET_SERVER_EXPOSURE_STATE_CHANNEL),
  setServerExposureMode: (mode) => ipcRenderer.invoke(SET_SERVER_EXPOSURE_MODE_CHANNEL, mode),
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  showThreadNotification: (notification) =>
    ipcRenderer.invoke(SHOW_THREAD_NOTIFICATION_CHANNEL, notification),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  checkForUpdate: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
