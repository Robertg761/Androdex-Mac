import { describe, expect, it } from "vitest";

import {
  compareSemanticVersions,
  isSemanticVersionNewer,
  parseLatestMacUpdateManifest,
  resolveCurrentAppBundlePath,
  resolveMacAvailableUpdate,
  resolveTargetAppBundlePath,
} from "./macManualUpdate";

describe("parseLatestMacUpdateManifest", () => {
  it("parses the latest-mac manifest emitted by electron-builder", () => {
    const manifest = parseLatestMacUpdateManifest(`version: 0.0.20
files:
  - url: Androdex-0.0.20-arm64.zip
    sha512: zipsha
    size: 123
  - url: Androdex-0.0.20-arm64.dmg
    sha512: dmgsha
    size: 456
path: Androdex-0.0.20-arm64.zip
sha512: zipsha
releaseDate: '2026-04-13T12:38:17.013Z'
`);

    expect(manifest.version).toBe("0.0.20");
    expect(manifest.path).toBe("Androdex-0.0.20-arm64.zip");
    expect(manifest.sha512).toBe("zipsha");
    expect(manifest.files).toEqual([
      {
        url: "Androdex-0.0.20-arm64.zip",
        sha512: "zipsha",
        size: 123,
      },
      {
        url: "Androdex-0.0.20-arm64.dmg",
        sha512: "dmgsha",
        size: 456,
      },
    ]);
  });

  it("accepts merged manifests that omit top-level path and sha512", () => {
    const manifest = parseLatestMacUpdateManifest(`version: 0.0.20
files:
  - url: Androdex-0.0.20-arm64.zip
    sha512: zipsha
    size: 123
  - url: Androdex-0.0.20-x64.zip
    sha512: x64zipsha
    size: 456
releaseDate: '2026-04-13T12:38:17.013Z'
`);

    expect(manifest.path).toBeNull();
    expect(manifest.sha512).toBeNull();
    expect(manifest.files).toHaveLength(2);
  });
});

describe("compareSemanticVersions", () => {
  it("orders stable releases numerically", () => {
    expect(compareSemanticVersions("0.0.21", "0.0.20")).toBeGreaterThan(0);
    expect(compareSemanticVersions("1.2.3", "1.10.0")).toBeLessThan(0);
  });

  it("treats stable releases as newer than prereleases", () => {
    expect(compareSemanticVersions("0.0.20", "0.0.20-alpha.1")).toBeGreaterThan(0);
    expect(isSemanticVersionNewer("0.0.20", "0.0.19")).toBe(true);
    expect(isSemanticVersionNewer("0.0.20-alpha.1", "0.0.20")).toBe(false);
  });
});

describe("resolveMacAvailableUpdate", () => {
  it("prefers the zip asset referenced by the manifest path", () => {
    const update = resolveMacAvailableUpdate(
      {
        version: "0.0.20",
        path: "Androdex-0.0.20-arm64.zip",
        sha512: "fallback-sha",
        files: [
          {
            url: "Androdex-0.0.20-arm64.zip",
            sha512: "zip-sha",
            size: 123,
          },
          {
            url: "Androdex-0.0.20-arm64.dmg",
            sha512: "dmg-sha",
            size: 456,
          },
        ],
      },
      {
        owner: "Robertg761",
        repo: "Androdex-Desktop",
      },
    );

    expect(update.archiveName).toBe("Androdex-0.0.20-arm64.zip");
    expect(update.sha512).toBe("zip-sha");
    expect(update.archiveUrl).toContain("/releases/latest/download/Androdex-0.0.20-arm64.zip");
  });
});

describe("resolve app bundle paths", () => {
  it("finds the current app bundle from the executable path", () => {
    expect(
      resolveCurrentAppBundlePath(
        "/Applications/Androdex (Alpha).app/Contents/MacOS/Androdex (Alpha)",
      ),
    ).toBe("/Applications/Androdex (Alpha).app");
  });

  it("falls back to Applications when running from a mounted DMG", () => {
    expect(resolveTargetAppBundlePath("/Volumes/Androdex/Androdex (Alpha).app")).toBe(
      "/Applications/Androdex (Alpha).app",
    );
  });
});
