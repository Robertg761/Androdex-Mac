import * as FS from "node:fs";
import * as Path from "node:path";
import type { DesktopServerExposureMode } from "@t3tools/contracts";

export interface DesktopSettings {
  readonly serverExposureMode: DesktopServerExposureMode;
}

export type DesktopSettingsSource = "default" | "persisted";

export interface LoadedDesktopSettings {
  readonly settings: DesktopSettings;
  readonly source: DesktopSettingsSource;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  serverExposureMode: "local-only",
};

function normalizeDesktopSettings(
  parsed: {
    readonly serverExposureMode?: unknown;
  },
  defaults: DesktopSettings,
): DesktopSettings {
  if (parsed.serverExposureMode === undefined) {
    return defaults;
  }

  return {
    serverExposureMode:
      parsed.serverExposureMode === "network-accessible" ? "network-accessible" : "local-only",
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

export function loadDesktopSettings(
  settingsPath: string,
  defaults: DesktopSettings = DEFAULT_DESKTOP_SETTINGS,
): LoadedDesktopSettings {
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
    };

    return {
      settings: normalizeDesktopSettings(parsed, defaults),
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
  defaults: DesktopSettings = DEFAULT_DESKTOP_SETTINGS,
): DesktopSettings {
  return loadDesktopSettings(settingsPath, defaults).settings;
}

export function writeDesktopSettings(settingsPath: string, settings: DesktopSettings): void {
  const directory = Path.dirname(settingsPath);
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, settingsPath);
}
