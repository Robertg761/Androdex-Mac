// @effect-diagnostics nodeBuiltinImport:off
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimers from "node:timers/promises";

import { runProcess, type ProcessRunResult } from "../../processRunner.ts";

export interface DependencyStatus {
  readonly name: string;
  readonly found: boolean;
  readonly detail?: string;
}

export function findCommand(command: string): DependencyStatus {
  const result = spawnSync("sh", ["-lc", `command -v ${quoteShell(command)}`], {
    encoding: "utf8",
  });
  const detail = result.status === 0 ? result.stdout.trim() : undefined;
  return {
    name: command,
    found: result.status === 0,
    ...(detail ? { detail } : {}),
  };
}

export function findFirstCommand(commands: readonly string[]): DependencyStatus {
  for (const command of commands) {
    const found = findCommand(command);
    if (found.found) {
      return { ...found, name: commands.join("|") };
    }
  }
  return { name: commands.join("|"), found: false };
}

export function hasCommand(command: string): boolean {
  return findCommand(command).found;
}

export function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function runChecked(
  command: string,
  args: readonly string[],
  options: Parameters<typeof runProcess>[2] = {},
): Promise<ProcessRunResult> {
  return runProcess(command, args, { timeoutMs: 10_000, ...options });
}

export async function runWithDisplay(
  display: string,
  command: string,
  args: readonly string[],
): Promise<ProcessRunResult> {
  return runChecked(command, args, {
    env: { ...process.env, DISPLAY: display },
    timeoutMs: 15_000,
  });
}

export function spawnDetached(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  const child = spawn(command, args, {
    env,
    stdio: "ignore",
    detached: false,
  });
  child.unref();
  return child;
}

export async function terminateProcess(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await NodeTimers.setTimeout(400);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

export async function readPngFromTempFile(
  writeFile: (filePath: string) => Promise<void>,
): Promise<Uint8Array> {
  const dir = await NodeFS.mkdtemp(NodePath.join(NodeOS.tmpdir(), "androdex-computer-use-"));
  const filePath = NodePath.join(dir, "screenshot.png");
  try {
    await writeFile(filePath);
    return await NodeFS.readFile(filePath);
  } finally {
    await NodeFS.rm(dir, { recursive: true, force: true });
  }
}
