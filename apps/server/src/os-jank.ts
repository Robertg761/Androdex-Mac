import * as FS from "node:fs";
import * as OS from "node:os";
import { Effect, Path } from "effect";
import { DEFAULT_BASE_DIR_NAME, LEGACY_BASE_DIR_NAME } from "@t3tools/shared/branding";
import { readPathFromLoginShell, resolveLoginShell } from "@t3tools/shared/shell";

export function fixPath(
  options: {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    readPath?: typeof readPathFromLoginShell;
  } = {},
): void {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "linux") return;

  const env = options.env ?? process.env;

  try {
    const shell = resolveLoginShell(platform, env.SHELL);
    if (!shell) return;
    const result = (options.readPath ?? readPathFromLoginShell)(shell);
    if (result) {
      env.PATH = result;
    }
  } catch {
    // Silently ignore — keep default PATH
  }
}

export const expandHomePath = Effect.fn(function* (input: string) {
  const { join } = yield* Path.Path;
  if (input === "~") {
    return OS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(OS.homedir(), input.slice(2));
  }
  return input;
});

export const resolveBaseDir = Effect.fn(function* (raw: string | undefined) {
  const { join, resolve } = yield* Path.Path;
  if (!raw || raw.trim().length === 0) {
    const preferredBaseDir = join(OS.homedir(), DEFAULT_BASE_DIR_NAME);
    const legacyBaseDir = join(OS.homedir(), LEGACY_BASE_DIR_NAME);
    if (FS.existsSync(preferredBaseDir)) {
      return preferredBaseDir;
    }
    if (FS.existsSync(legacyBaseDir)) {
      return legacyBaseDir;
    }
    return preferredBaseDir;
  }
  return resolve(yield* expandHomePath(raw.trim()));
});
