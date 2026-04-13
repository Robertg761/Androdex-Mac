import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ConfigProvider, Effect, Option } from "effect";

import {
  isLegacyDesktopArtifactEntry,
  parseGitHubRepositorySlug,
  resolveBuildOptions,
  resolveGitHubRepositorySlug,
} from "./build-desktop-artifact.ts";

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it.effect("identifies stale legacy release artifacts for cleanup", () =>
    Effect.sync(() => {
      assert.equal(isLegacyDesktopArtifactEntry("T3-Code-0.0.17-arm64.dmg"), true);
      assert.equal(isLegacyDesktopArtifactEntry("T3-Code-0.0.17-arm64.zip.blockmap"), true);
      assert.equal(isLegacyDesktopArtifactEntry("Androdex-0.0.17-arm64.dmg"), false);
      assert.equal(isLegacyDesktopArtifactEntry("builder-debug.yml"), false);
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
