import { assert, it } from "@effect/vitest";

import {
  normalizeWhisperRuntimeArch,
  resolveWhisperExecutableName,
  resolveWhisperRuntimeTargets,
  resolveWindowsReleaseAssetUrl,
} from "./prepare-whisper-runtime.ts";

it("resolves concrete voice runtime resource targets", () => {
  assert.deepStrictEqual(
    resolveWhisperRuntimeTargets({
      platform: "linux",
      arch: "x64",
      outputDir: "/tmp/voice",
    }),
    [
      {
        platform: "linux",
        arch: "x64",
        executableName: "whisper-cli",
        directoryName: "linux-x64",
        directoryPath: "/tmp/voice/whisper/linux-x64",
        executablePath: "/tmp/voice/whisper/linux-x64/whisper-cli",
      },
    ],
  );
});

it("expands universal mac voice runtime targets to both packaged app architectures", () => {
  assert.deepStrictEqual(
    resolveWhisperRuntimeTargets({
      platform: "darwin",
      arch: "universal",
      outputDir: "/tmp/voice",
    }).map((target) => target.directoryName),
    ["darwin-arm64", "darwin-x64"],
  );
});

it("normalizes amd64 to the app runtime x64 arch name", () => {
  assert.equal(normalizeWhisperRuntimeArch("amd64"), "x64");
});

it("uses the expected executable names per platform", () => {
  assert.equal(resolveWhisperExecutableName("linux"), "whisper-cli");
  assert.equal(resolveWhisperExecutableName("darwin"), "whisper-cli");
  assert.equal(resolveWhisperExecutableName("win32"), "whisper-cli.exe");
});

it("uses the official Windows x64 release asset and rejects missing Windows ARM assets", () => {
  assert.equal(
    resolveWindowsReleaseAssetUrl("v1.8.4", "x64"),
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.4/whisper-bin-x64.zip",
  );
  assert.equal(resolveWindowsReleaseAssetUrl("v1.8.4", "arm64"), undefined);
});
