import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option } from "effect";

import {
  isLegacyDesktopArtifactEntry,
  parseGitHubRepositorySlug,
  resolveBuildOptions,
  resolveGitHubRepositorySlug,
  resolveDesktopBuildIconAssets,
  resolveDesktopProductName,
  resolveDesktopUpdateChannel,
  resolveMockUpdateServerPort,
  resolveMockUpdateServerUrl,
} from "./build-desktop-artifact.ts";
import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it.effect("identifies stale legacy release artifacts for cleanup", () =>
    Effect.sync(() => {
      assert.equal(isLegacyDesktopArtifactEntry("T3-Code-0.0.17-arm64.dmg"), true);
      assert.equal(isLegacyDesktopArtifactEntry("T3-Code-0.0.17-arm64.zip.blockmap"), true);
      assert.equal(isLegacyDesktopArtifactEntry("Androdex-0.0.17-arm64.dmg"), false);
      assert.equal(isLegacyDesktopArtifactEntry("builder-debug.yml"), false);
    }),
  );

  it("resolves the dedicated nightly updater channel from nightly versions", () => {
    assert.equal(resolveDesktopUpdateChannel("0.0.17-nightly.20260413.42"), "nightly");
    assert.equal(resolveDesktopUpdateChannel("0.0.17"), "latest");
  });

  it("switches desktop packaging product names to nightly for nightly builds", () => {
    assert.equal(resolveDesktopProductName("0.0.17"), "T3 Code (Alpha)");
    assert.equal(resolveDesktopProductName("0.0.17-nightly.20260413.42"), "T3 Code (Nightly)");
  });

  it("switches desktop packaging icons to the nightly artwork for nightly versions", () => {
    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17"), {
      macIconPng: BRAND_ASSET_PATHS.productionMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.productionLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
    });

    assert.deepStrictEqual(resolveDesktopBuildIconAssets("0.0.17-nightly.20260413.42"), {
      macIconPng: BRAND_ASSET_PATHS.nightlyMacIconPng,
      linuxIconPng: BRAND_ASSET_PATHS.nightlyLinuxIconPng,
      windowsIconIco: BRAND_ASSET_PATHS.nightlyWindowsIconIco,
    });
  });

  it("falls back to the default mock update port when the configured port is blank", () => {
    assert.equal(resolveMockUpdateServerUrl(undefined), "http://localhost:3000");
    assert.equal(resolveMockUpdateServerUrl(4123), "http://localhost:4123");
  });

  it.effect("normalizes mock update server ports from env-style strings", () =>
    Effect.gen(function* () {
      assert.equal(yield* resolveMockUpdateServerPort(undefined), undefined);
      assert.equal(yield* resolveMockUpdateServerPort(""), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("   "), undefined);
      assert.equal(yield* resolveMockUpdateServerPort("4123"), 4123);
    }),
  );

  it.effect("rejects non-numeric or out-of-range mock update ports", () =>
    Effect.gen(function* () {
      const invalidPorts = ["abc", "12.5", "0", "65536"];
      for (const port of invalidPorts) {
        const exit = yield* Effect.exit(resolveMockUpdateServerPort(port));
        assert.equal(exit._tag, "Failure");
      }
    }),
  );

  it.effect("preserves explicit false boolean flags over true env defaults", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveBuildOptions({
        platform: Option.some("mac"),
        target: Option.none(),
        arch: Option.some("arm64"),
        buildVersion: Option.none(),
        outputDir: Option.some("release-test"),
        skipBuild: Option.some(false),
        keepStage: Option.some(false),
        signed: Option.some(false),
        verbose: Option.some(false),
        mockUpdates: Option.some(false),
        mockUpdateServerPort: Option.none(),
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                ANDRODEX_DESKTOP_SKIP_BUILD: "true",
                ANDRODEX_DESKTOP_KEEP_STAGE: "true",
                ANDRODEX_DESKTOP_SIGNED: "true",
                ANDRODEX_DESKTOP_VERBOSE: "true",
                ANDRODEX_DESKTOP_MOCK_UPDATES: "true",
              },
            }),
          ),
        ),
      );

      assert.equal(resolved.skipBuild, false);
      assert.equal(resolved.keepStage, false);
      assert.equal(resolved.signed, false);
      assert.equal(resolved.verbose, false);
      assert.equal(resolved.mockUpdates, false);
    }),
  );

  it.effect("prefers explicit update repository configuration over inferred values", () =>
    Effect.sync(() => {
      assert.equal(
        resolveGitHubRepositorySlug({
          configuredRepo: "pingdotgg/t3code",
          githubRepository: "wrong/ci",
          originRepo: "wrong/origin",
        }),
        "pingdotgg/t3code",
      );
    }),
  );

  it.effect("falls back to the origin GitHub remote for local builds", () =>
    Effect.sync(() => {
      assert.equal(
        resolveGitHubRepositorySlug({
          originRepo: "https://github.com/Robertg761/Androdex-Desktop.git",
        }),
        "Robertg761/Androdex-Desktop",
      );
      assert.deepStrictEqual(
        parseGitHubRepositorySlug("git@github.com:Robertg761/Androdex-Desktop.git"),
        {
          owner: "Robertg761",
          repo: "Androdex-Desktop",
        },
      );
    }),
  );

  it.effect("rejects non-GitHub or malformed repository slugs", () =>
    Effect.sync(() => {
      assert.equal(parseGitHubRepositorySlug(""), undefined);
      assert.equal(parseGitHubRepositorySlug("git@gitlab.com:owner/repo.git"), undefined);
      assert.equal(parseGitHubRepositorySlug("owner/repo/extra"), undefined);
    }),
  );
});
