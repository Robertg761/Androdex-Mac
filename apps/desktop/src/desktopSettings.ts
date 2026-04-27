import * as FS from "node:fs";
import * as Path from "node:path";
import type { DesktopServerExposureMode, DesktopUpdateChannel } from "@t3tools/contracts";

import { resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

export interface DesktopSettings {
  readonly serverExposureMode: DesktopServerExposureMode;
  readonly updateChannel: DesktopUpdateChannel;
  readonly updateChannelConfiguredByUser: boolean;
}

export type DesktopSettingsSource = "default" | "persisted";

export interface LoadedDesktopSettings {
  readonly settings: DesktopSettings;
  readonly source: DesktopSettingsSource;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  serverExposureMode: "local-only",
  updateChannel: "latest",
  updateChannelConfiguredByUser: false,
};

type DesktopSettingsDefaultsInput = string | Partial<DesktopSettings> | DesktopSettings | undefined;

export function resolveDefaultDesktopSettings(appVersion: string): DesktopSettings {
  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    updateChannel: resolveDefaultDesktopUpdateChannel(appVersion),
  };
}

function resolveDesktopSettingsDefaults(input: DesktopSettingsDefaultsInput): DesktopSettings {
  if (typeof input === "string") {
    return resolveDefaultDesktopSettings(input);
  }

  return {
    ...DEFAULT_DESKTOP_SETTINGS,
    ...(input ?? {}),
  };
}

export function setDesktopServerExposurePreference(
  settings: DesktopSettings,
  requestedMode: DesktopServerExposureMode,
): DesktopSettings {
  return settings.serverExposureMode === requestedMode
    ? settings
    : {
        ...settings,
        serverExposureMode: requestedMode,
      };
}

export function setDesktopUpdateChannelPreference(
  settings: DesktopSettings,
  requestedChannel: DesktopUpdateChannel,
): DesktopSettings {
  return {
    ...settings,
    updateChannel: requestedChannel,
    updateChannelConfiguredByUser: true,
  };
}

export function loadDesktopSettings(
  settingsPath: string,
  defaultsInput: DesktopSettingsDefaultsInput = DEFAULT_DESKTOP_SETTINGS,
): LoadedDesktopSettings {
  const defaults = resolveDesktopSettingsDefaults(defaultsInput);

  try {
    if (!FS.existsSync(settingsPath)) {
      return {
        settings: defaults,
        source: "default",
      };
    }

    const raw = FS.readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      readonly serverExposureMode?: unknown;
      readonly updateChannel?: unknown;
      readonly updateChannelConfiguredByUser?: unknown;
    };
    const parsedUpdateChannel =
      parsed.updateChannel === "nightly" || parsed.updateChannel === "latest"
        ? parsed.updateChannel
        : null;
    const isLegacySettings = parsed.updateChannelConfiguredByUser === undefined;
    const updateChannelConfiguredByUser =
      parsed.updateChannelConfiguredByUser === true ||
      (isLegacySettings && parsedUpdateChannel === "nightly");

    return {
      settings: {
        serverExposureMode:
          parsed.serverExposureMode === "network-accessible" ? "network-accessible" : "local-only",
        updateChannel:
          updateChannelConfiguredByUser && parsedUpdateChannel !== null
            ? parsedUpdateChannel
            : defaults.updateChannel,
        updateChannelConfiguredByUser,
      },
      source: "persisted",
    };
  } catch {
    return {
      settings: defaults,
      source: "default",
    };
  }
}

export function readDesktopSettings(
  settingsPath: string,
  defaultsInput: DesktopSettingsDefaultsInput = DEFAULT_DESKTOP_SETTINGS,
): DesktopSettings {
  return loadDesktopSettings(settingsPath, defaultsInput).settings;
}

export function writeDesktopSettings(settingsPath: string, settings: DesktopSettings): void {
  const directory = Path.dirname(settingsPath);
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, settingsPath);
}
