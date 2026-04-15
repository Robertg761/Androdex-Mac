import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import * as OS from "node:os";
import path from "node:path";

export function resolveCodexHomePath(homePath?: string): string {
  const normalizedHomePath = homePath?.trim();
  return normalizedHomePath && normalizedHomePath.length > 0
    ? normalizedHomePath
    : path.join(OS.homedir(), ".codex");
}

export function readCodexAuthSnapshotFingerprint(homePath?: string): string | undefined {
  const authPath = path.join(resolveCodexHomePath(homePath), "auth.json");
  if (!existsSync(authPath)) {
    return undefined;
  }

  try {
    return createHash("sha256").update(readFileSync(authPath, "utf8")).digest("hex");
  } catch {
    return undefined;
  }
}
