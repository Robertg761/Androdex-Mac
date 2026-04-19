import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_DESKTOP_SETTINGS,
  loadDesktopSettings,
  readDesktopSettings,
  setDesktopServerExposurePreference,
  writeDesktopSettings,
} from "./desktopSettings";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeSettingsPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t3-desktop-settings-test-"));
  tempDirectories.push(directory);
  return path.join(directory, "desktop-settings.json");
}

describe("desktopSettings", () => {
  it("returns defaults when no settings file exists", () => {
    expect(readDesktopSettings(makeSettingsPath())).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });

  it("supports caller-provided defaults when no settings file exists", () => {
    expect(
      readDesktopSettings(makeSettingsPath(), {
        serverExposureMode: "network-accessible",
      }),
    ).toEqual({
      serverExposureMode: "network-accessible",
    });
  });

  it("reports whether settings came from disk or defaults", () => {
    const settingsPath = makeSettingsPath();

    expect(
      loadDesktopSettings(settingsPath, {
        serverExposureMode: "network-accessible",
      }),
    ).toEqual({
      settings: {
        serverExposureMode: "network-accessible",
      },
      source: "default",
    });

    writeDesktopSettings(settingsPath, {
      serverExposureMode: "local-only",
    });

    expect(
      loadDesktopSettings(settingsPath, {
        serverExposureMode: "network-accessible",
      }),
    ).toEqual({
      settings: {
        serverExposureMode: "local-only",
      },
      source: "persisted",
    });
  });

  it("persists and reloads the configured server exposure mode", () => {
    const settingsPath = makeSettingsPath();

    writeDesktopSettings(settingsPath, {
      serverExposureMode: "network-accessible",
    });

    expect(readDesktopSettings(settingsPath)).toEqual({
      serverExposureMode: "network-accessible",
    });
  });

  it("preserves the requested network-accessible preference across temporary fallback", () => {
    expect(
      setDesktopServerExposurePreference(
        {
          serverExposureMode: "local-only",
        },
        "network-accessible",
      ),
    ).toEqual({
      serverExposureMode: "network-accessible",
    });
  });

  it("falls back to defaults when the settings file is malformed", () => {
    const settingsPath = makeSettingsPath();
    fs.writeFileSync(settingsPath, "{not-json", "utf8");

    expect(readDesktopSettings(settingsPath)).toEqual(DEFAULT_DESKTOP_SETTINGS);
  });
});
