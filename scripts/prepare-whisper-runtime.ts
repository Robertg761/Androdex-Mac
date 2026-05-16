#!/usr/bin/env node

// @effect-diagnostics nodeBuiltinImport:off
import { spawnSync } from "node:child_process";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_WHISPER_CPP_VERSION = "v1.8.4";
const DEFAULT_LINUX_CONTAINER_IMAGE = "ghcr.io/ggml-org/whisper.cpp:main";
const REPO_ROOT = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "..");

const SUPPORTED_PLATFORMS = ["darwin", "linux", "win32"] as const;
const SUPPORTED_ARCHES = ["arm64", "x64", "universal"] as const;

export type WhisperRuntimePlatform = (typeof SUPPORTED_PLATFORMS)[number];
export type WhisperRuntimeArch = (typeof SUPPORTED_ARCHES)[number];
type ConcreteWhisperRuntimeArch = Exclude<WhisperRuntimeArch, "universal">;

export interface WhisperRuntimeTarget {
  readonly platform: WhisperRuntimePlatform;
  readonly arch: ConcreteWhisperRuntimeArch;
  readonly executableName: string;
  readonly directoryName: string;
  readonly directoryPath: string;
  readonly executablePath: string;
}

interface CliOptions {
  readonly platform: WhisperRuntimePlatform;
  readonly arch: WhisperRuntimeArch;
  readonly outputDir: string;
  readonly version: string;
  readonly containerImage: string;
  readonly sourceDir: string | undefined;
  readonly binaryPath: string | undefined;
  readonly force: boolean;
  readonly verbose: boolean;
}

interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

class PrepareWhisperRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrepareWhisperRuntimeError";
  }
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function writeErrorLine(message: string): void {
  process.stderr.write(`${message}\n`);
}

function usage(): string {
  return `
Usage: node scripts/prepare-whisper-runtime.ts [options]

Populates desktop app-update resources with a local whisper.cpp runtime.

Options:
  --platform <darwin|linux|win32>   Target runtime platform. Defaults to this host.
  --arch <x64|arm64|universal>      Target runtime arch. Defaults to this host.
  --output-dir <path>               Voice resource root. Defaults to apps/desktop/resources/voice.
  --version <tag>                   whisper.cpp release tag for source/Windows downloads. Defaults to ${DEFAULT_WHISPER_CPP_VERSION}.
  --container-image <image>         Linux source image. Defaults to ${DEFAULT_LINUX_CONTAINER_IMAGE}.
  --source-dir <path>               Existing whisper.cpp checkout for native CMake builds.
  --binary <path>                   Copy an already-built whisper-cli for a single platform/arch target.
  --force                           Replace an existing target runtime.
  --verbose                         Stream subprocess output.
  --help                            Show this message.
`.trim();
}

function parseOptionValue(args: readonly string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new PrepareWhisperRuntimeError(`Missing value for ${name}.`);
  }
  return value;
}

function parseCliOptions(args: readonly string[]): CliOptions {
  let platform = normalizeWhisperRuntimePlatform(process.platform);
  let arch = normalizeWhisperRuntimeArch(process.arch);
  let outputDir = NodePath.join(REPO_ROOT, "apps/desktop/resources/voice");
  let version = process.env.ANDRODEX_WHISPER_CPP_VERSION?.trim() || DEFAULT_WHISPER_CPP_VERSION;
  let containerImage =
    process.env.ANDRODEX_WHISPER_CPP_CONTAINER_IMAGE?.trim() || DEFAULT_LINUX_CONTAINER_IMAGE;
  let sourceDir = process.env.ANDRODEX_WHISPER_CPP_SOURCE_DIR?.trim() || undefined;
  let binaryPath = process.env.ANDRODEX_WHISPER_CPP_BINARY_SOURCE?.trim() || undefined;
  let force = false;
  let verbose = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      writeLine(usage());
      process.exit(0);
    }
    if (arg === "--force") {
      force = true;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    if (arg === "--platform") {
      platform = normalizeWhisperRuntimePlatform(parseOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--arch") {
      arch = normalizeWhisperRuntimeArch(parseOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = NodePath.resolve(parseOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--version") {
      version = parseOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--container-image") {
      containerImage = parseOptionValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--source-dir") {
      sourceDir = NodePath.resolve(parseOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--binary") {
      binaryPath = NodePath.resolve(parseOptionValue(args, index, arg));
      index += 1;
      continue;
    }
    throw new PrepareWhisperRuntimeError(`Unknown option: ${arg}`);
  }

  return {
    platform,
    arch,
    outputDir,
    version,
    containerImage,
    sourceDir,
    binaryPath,
    force,
    verbose,
  };
}

export function normalizeWhisperRuntimePlatform(raw: string): WhisperRuntimePlatform {
  if (raw === "darwin" || raw === "linux" || raw === "win32") {
    return raw;
  }
  throw new PrepareWhisperRuntimeError(`Unsupported Whisper runtime platform: ${raw}`);
}

export function normalizeWhisperRuntimeArch(raw: string): WhisperRuntimeArch {
  if (raw === "arm64" || raw === "x64" || raw === "universal") {
    return raw;
  }
  if (raw === "amd64") {
    return "x64";
  }
  throw new PrepareWhisperRuntimeError(`Unsupported Whisper runtime arch: ${raw}`);
}

export function resolveWhisperExecutableName(platform: WhisperRuntimePlatform): string {
  return platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
}

export function resolveWhisperRuntimeTargets(input: {
  readonly platform: WhisperRuntimePlatform;
  readonly arch: WhisperRuntimeArch;
  readonly outputDir: string;
}): readonly WhisperRuntimeTarget[] {
  const arches: readonly ConcreteWhisperRuntimeArch[] =
    input.arch === "universal" ? (["arm64", "x64"] as const) : [input.arch];
  const executableName = resolveWhisperExecutableName(input.platform);
  return arches.map((arch) => {
    const directoryName = `${input.platform}-${arch}`;
    const directoryPath = NodePath.join(input.outputDir, "whisper", directoryName);
    return {
      platform: input.platform,
      arch,
      executableName,
      directoryName,
      directoryPath,
      executablePath: NodePath.join(directoryPath, executableName),
    };
  });
}

export function resolveWindowsReleaseAssetUrl(version: string, arch: ConcreteWhisperRuntimeArch) {
  if (arch !== "x64") {
    return undefined;
  }
  return `https://github.com/ggml-org/whisper.cpp/releases/download/${version}/whisper-bin-x64.zip`;
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd?: string | undefined;
    readonly verbose?: boolean | undefined;
    readonly allowFailure?: boolean | undefined;
  } = {},
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    stdio: options.verbose ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (!options.allowFailure && result.status !== 0) {
    const detail = stderr.trim() || stdout.trim();
    throw new PrepareWhisperRuntimeError(
      `${[command, ...args].join(" ")} failed with exit code ${result.status ?? "null"}${detail ? `: ${detail}` : ""}`,
    );
  }
  return { status: result.status, stdout, stderr };
}

function commandExists(command: string): boolean {
  const probe =
    process.platform === "win32"
      ? runCommand("where", [command], { allowFailure: true })
      : runCommand("sh", ["-lc", `command -v ${command}`], { allowFailure: true });
  return probe.status === 0;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await NodeFs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyFileEnsuringDirectory(from: string, to: string): Promise<void> {
  await NodeFs.mkdir(NodePath.dirname(to), { recursive: true });
  await NodeFs.copyFile(from, to);
}

async function makeExecutableIfNeeded(target: WhisperRuntimeTarget): Promise<void> {
  if (target.platform === "win32") {
    return;
  }
  await NodeFs.chmod(target.executablePath, 0o755);
}

function linuxContainerPlatform(arch: ConcreteWhisperRuntimeArch): string {
  return arch === "x64" ? "linux/amd64" : "linux/arm64";
}

function debianLinuxLibraryArch(arch: ConcreteWhisperRuntimeArch): string {
  return arch === "x64" ? "x86_64-linux-gnu" : "aarch64-linux-gnu";
}

function findContainerRuntime(): "podman" | "docker" | undefined {
  if (commandExists("podman")) return "podman";
  if (commandExists("docker")) return "docker";
  return undefined;
}

async function copyFromContainer(input: {
  readonly containerRuntime: "podman" | "docker";
  readonly containerId: string;
  readonly from: string;
  readonly to: string;
  readonly required: boolean;
  readonly verbose: boolean;
}): Promise<void> {
  const result = runCommand(
    input.containerRuntime,
    ["cp", `${input.containerId}:${input.from}`, input.to],
    {
      allowFailure: !input.required,
      verbose: input.verbose,
    },
  );
  if (result.status !== 0 && !input.required) {
    writeErrorLine(`[whisper-runtime] Optional container file not present: ${input.from}`);
  }
}

async function prepareLinuxFromContainer(
  target: WhisperRuntimeTarget,
  options: CliOptions,
): Promise<void> {
  const containerRuntime = findContainerRuntime();
  if (!containerRuntime) {
    throw new PrepareWhisperRuntimeError(
      "Linux Whisper runtime preparation needs podman or docker, or use --binary with a prebuilt whisper-cli.",
    );
  }

  await NodeFs.rm(target.directoryPath, { force: true, recursive: true });
  await NodeFs.mkdir(target.directoryPath, { recursive: true });

  const create = runCommand(
    containerRuntime,
    ["create", "--platform", linuxContainerPlatform(target.arch), options.containerImage],
    { verbose: options.verbose },
  );
  const containerId = create.stdout.trim().split(/\s+/)[0];
  if (!containerId) {
    throw new PrepareWhisperRuntimeError(
      `Could not create ${options.containerImage} container for ${target.directoryName}.`,
    );
  }

  try {
    const debianArch = debianLinuxLibraryArch(target.arch);
    const files = [
      {
        from: "/app/build/bin/whisper-cli",
        to: target.executablePath,
        required: true,
      },
      {
        from: "/app/build/src/libwhisper.so.1",
        to: NodePath.join(target.directoryPath, "libwhisper.so.1"),
        required: true,
      },
      {
        from: "/app/build/ggml/src/libggml.so.0",
        to: NodePath.join(target.directoryPath, "libggml.so.0"),
        required: true,
      },
      {
        from: "/app/build/ggml/src/libggml-base.so.0",
        to: NodePath.join(target.directoryPath, "libggml-base.so.0"),
        required: true,
      },
      {
        from: "/app/build/ggml/src/libggml-cpu.so.0",
        to: NodePath.join(target.directoryPath, "libggml-cpu.so.0"),
        required: true,
      },
      {
        from: `/lib/${debianArch}/libstdc++.so.6`,
        to: NodePath.join(target.directoryPath, "libstdc++.so.6"),
        required: false,
      },
      {
        from: `/lib/${debianArch}/libgcc_s.so.1`,
        to: NodePath.join(target.directoryPath, "libgcc_s.so.1"),
        required: false,
      },
      {
        from: `/lib/${debianArch}/libgomp.so.1`,
        to: NodePath.join(target.directoryPath, "libgomp.so.1"),
        required: false,
      },
    ] as const;

    for (const file of files) {
      await copyFromContainer({
        containerRuntime,
        containerId,
        from: file.from,
        to: file.to,
        required: file.required,
        verbose: options.verbose,
      });
    }
  } finally {
    runCommand(containerRuntime, ["rm", "-f", containerId], {
      allowFailure: true,
      verbose: options.verbose,
    });
  }

  await makeExecutableIfNeeded(target);
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new PrepareWhisperRuntimeError(
      `Download failed for ${url}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const data = Buffer.from(await response.arrayBuffer());
  await NodeFs.mkdir(NodePath.dirname(outputPath), { recursive: true });
  await NodeFs.writeFile(outputPath, data);
}

async function walkFiles(root: string): Promise<readonly string[]> {
  const entries = await NodeFs.readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = NodePath.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(child)));
      continue;
    }
    if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

async function extractZip(zipPath: string, outputDir: string, verbose: boolean): Promise<void> {
  if (commandExists("unzip")) {
    runCommand("unzip", ["-q", "-o", zipPath, "-d", outputDir], { verbose });
    return;
  }
  if (commandExists("tar")) {
    runCommand("tar", ["-xf", zipPath, "-C", outputDir], { verbose });
    return;
  }
  throw new PrepareWhisperRuntimeError("Extracting Windows Whisper releases needs unzip or tar.");
}

async function prepareWindowsFromRelease(
  target: WhisperRuntimeTarget,
  options: CliOptions,
): Promise<void> {
  const url = resolveWindowsReleaseAssetUrl(options.version, target.arch);
  if (!url) {
    throw new PrepareWhisperRuntimeError(
      `No official whisper.cpp Windows release asset is available for ${target.arch}; run this script on Windows ${target.arch} with CMake or pass --binary.`,
    );
  }

  const tempDir = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "androdex-whisper-win-"));
  try {
    const zipPath = NodePath.join(tempDir, "whisper.zip");
    const extractDir = NodePath.join(tempDir, "extract");
    await downloadFile(url, zipPath);
    await NodeFs.mkdir(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir, options.verbose);

    const files = await walkFiles(extractDir);
    const executable = files.find((file) => NodePath.basename(file) === "whisper-cli.exe");
    if (!executable) {
      throw new PrepareWhisperRuntimeError(
        `Downloaded ${url}, but it did not contain whisper-cli.exe.`,
      );
    }

    await NodeFs.rm(target.directoryPath, { force: true, recursive: true });
    await NodeFs.mkdir(target.directoryPath, { recursive: true });
    await NodeFs.copyFile(executable, target.executablePath);

    for (const file of files) {
      if (NodePath.extname(file).toLowerCase() !== ".dll") continue;
      await NodeFs.copyFile(file, NodePath.join(target.directoryPath, NodePath.basename(file)));
    }
  } finally {
    await NodeFs.rm(tempDir, { force: true, recursive: true });
  }
}

async function cloneWhisperSource(version: string, verbose: boolean): Promise<string> {
  if (!commandExists("git")) {
    throw new PrepareWhisperRuntimeError("Native Whisper runtime builds need git.");
  }
  const tempDir = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "androdex-whisper-src-"));
  const sourceDir = NodePath.join(tempDir, "whisper.cpp");
  runCommand(
    "git",
    [
      "clone",
      "--depth",
      "1",
      "--branch",
      version,
      "https://github.com/ggml-org/whisper.cpp.git",
      sourceDir,
    ],
    { verbose },
  );
  return sourceDir;
}

function sourceBuildBinaryCandidates(
  sourceDir: string,
  target: WhisperRuntimeTarget,
): readonly string[] {
  const releaseName = target.platform === "win32" ? "Release" : "";
  const names = [target.executableName, "main.exe", "main"].filter(Boolean);
  const buildDir = NodePath.join(sourceDir, "build-androdex-runtime");
  const candidates: string[] = [];
  for (const name of names) {
    candidates.push(NodePath.join(buildDir, "bin", name));
    if (releaseName) {
      candidates.push(NodePath.join(buildDir, "bin", releaseName, name));
    }
  }
  return candidates;
}

async function prepareFromSource(target: WhisperRuntimeTarget, options: CliOptions): Promise<void> {
  if (target.platform !== process.platform) {
    throw new PrepareWhisperRuntimeError(
      `Native Whisper runtime build for ${target.directoryName} must run on ${target.platform}, or pass --binary.`,
    );
  }

  if (target.platform !== "darwin" && target.arch !== normalizeWhisperRuntimeArch(process.arch)) {
    throw new PrepareWhisperRuntimeError(
      `Native Whisper runtime build for ${target.directoryName} must run on ${target.arch}, or pass --binary.`,
    );
  }

  if (!commandExists("cmake")) {
    throw new PrepareWhisperRuntimeError(
      "Native Whisper runtime builds need cmake. Install cmake, use Linux podman/docker extraction, or pass --binary.",
    );
  }

  const clonedSourceDir = options.sourceDir
    ? undefined
    : await cloneWhisperSource(options.version, options.verbose);
  const sourceDir = options.sourceDir ?? clonedSourceDir;
  if (!sourceDir) {
    throw new PrepareWhisperRuntimeError("Could not resolve whisper.cpp source directory.");
  }
  const buildDir = NodePath.join(sourceDir, "build-androdex-runtime");

  try {
    await NodeFs.rm(buildDir, { force: true, recursive: true });

    const configureArgs = [
      "-S",
      sourceDir,
      "-B",
      buildDir,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_SHARED_LIBS=OFF",
    ];
    if (target.platform === "darwin") {
      configureArgs.push(`-DCMAKE_OSX_ARCHITECTURES=${target.arch === "x64" ? "x86_64" : "arm64"}`);
    }

    runCommand("cmake", configureArgs, { verbose: options.verbose });
    runCommand(
      "cmake",
      ["--build", buildDir, "--config", "Release", "--target", "whisper-cli", "-j"],
      {
        verbose: options.verbose,
      },
    );

    let binary: string | undefined;
    for (const candidate of sourceBuildBinaryCandidates(sourceDir, target)) {
      if (await fileExists(candidate)) {
        binary = candidate;
        break;
      }
    }
    if (!binary) {
      throw new PrepareWhisperRuntimeError(
        `CMake build completed, but ${target.executableName} was not found in ${buildDir}.`,
      );
    }

    await NodeFs.rm(target.directoryPath, { force: true, recursive: true });
    await copyFileEnsuringDirectory(binary, target.executablePath);
    await makeExecutableIfNeeded(target);
  } finally {
    if (clonedSourceDir) {
      await NodeFs.rm(NodePath.dirname(clonedSourceDir), { force: true, recursive: true });
    }
  }
}

async function prepareFromBinary(target: WhisperRuntimeTarget, binaryPath: string): Promise<void> {
  if (!(await fileExists(binaryPath))) {
    throw new PrepareWhisperRuntimeError(`Configured Whisper binary does not exist: ${binaryPath}`);
  }
  await NodeFs.rm(target.directoryPath, { force: true, recursive: true });
  await copyFileEnsuringDirectory(binaryPath, target.executablePath);
  await makeExecutableIfNeeded(target);
}

async function prepareTarget(target: WhisperRuntimeTarget, options: CliOptions): Promise<void> {
  if (!options.force && (await fileExists(target.executablePath))) {
    writeLine(`[whisper-runtime] ${target.directoryName} already exists: ${target.executablePath}`);
    return;
  }

  writeLine(`[whisper-runtime] Preparing ${target.directoryName}...`);

  if (options.binaryPath) {
    await prepareFromBinary(target, options.binaryPath);
  } else if (target.platform === "linux") {
    await prepareLinuxFromContainer(target, options);
  } else if (target.platform === "win32") {
    await prepareWindowsFromRelease(target, options);
  } else {
    await prepareFromSource(target, options);
  }

  writeLine(`[whisper-runtime] Installed ${target.executablePath}`);
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const targets = resolveWhisperRuntimeTargets(options);
  if (options.binaryPath && targets.length !== 1) {
    throw new PrepareWhisperRuntimeError("--binary can only be used with a single concrete arch.");
  }

  for (const target of targets) {
    await prepareTarget(target, options);
  }
}

if (import.meta.main) {
  main().catch((cause) => {
    const detail = cause instanceof Error ? cause.message : String(cause);
    writeErrorLine(`[whisper-runtime] ${detail}`);
    process.exitCode = 1;
  });
}
