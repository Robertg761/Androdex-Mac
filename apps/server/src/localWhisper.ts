// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";

import {
  ServerLocalWhisperError,
  type LocalWhisperModel,
  type LocalWhisperModelId,
  type ServerLocalWhisperDownloadEvent,
  type ServerLocalWhisperDownloadInput,
  type ServerLocalWhisperModelsResult,
  type ServerLocalWhisperTranscribeInput,
  type ServerLocalWhisperTranscribeResult,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import type { ServerConfigShape } from "./config.ts";
import { analyzeWavPromptSpeech, assertPromptSpeechDetected } from "./localWhisperAudio.ts";
import { WHISPER_MODELS, type WhisperModelDefinition } from "./localWhisperModels.ts";
import { runProcess } from "./processRunner.ts";

const DOWNLOAD_PROGRESS_MIN_INTERVAL_MS = 120;
const TRANSCRIBE_MAX_AUDIO_BYTES = 48 * 1024 * 1024;
const TRANSCRIBE_MIN_TIMEOUT_MS = 90_000;
const TRANSCRIBE_MAX_TIMEOUT_MS = 10 * 60_000;
const TRANSCRIBE_MAX_THREADS = 8;
const MODEL_INTEGRITY_VERSION = 1;
const SERVER_MODULE_DIR = NodePath.dirname(fileURLToPath(import.meta.url));

interface FileStatSummary {
  readonly size: number;
  readonly mtimeMs: number;
}

interface ModelIntegrityMetadata {
  readonly version: 1;
  readonly valid: boolean;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha1: string | null;
}

type ModelFileInspection =
  | {
      readonly state: "missing";
      readonly path: string;
    }
  | {
      readonly state: "ready" | "unchecked";
      readonly path: string;
      readonly stat: FileStatSummary;
    }
  | {
      readonly state: "invalid";
      readonly path: string;
      readonly stat: FileStatSummary;
      readonly message: string;
    };

const event = <T extends Omit<ServerLocalWhisperDownloadEvent, "version">>(
  value: T,
): ServerLocalWhisperDownloadEvent =>
  ({ version: 1, ...value }) as unknown as ServerLocalWhisperDownloadEvent;

function localWhisperError(detail: string, cause?: unknown): ServerLocalWhisperError {
  return new ServerLocalWhisperError({
    detail: detail.trim() || "Local Whisper operation failed.",
    ...(cause !== undefined ? { cause } : {}),
  });
}

function errorDetail(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.trim()) {
    return cause.message;
  }
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string" &&
    cause.message.trim()
  ) {
    return cause.message;
  }
  const detail = String(cause);
  return detail && detail !== "[object Object]" ? detail : fallback;
}

function modelDirectory(config: ServerConfigShape): string {
  return NodePath.join(config.baseDir, "models", "whisper");
}

function tempDirectory(config: ServerConfigShape): string {
  return NodePath.join(config.stateDir, "tmp", "whisper");
}

function modelPath(config: ServerConfigShape, model: WhisperModelDefinition): string {
  return NodePath.join(modelDirectory(config), `ggml-${model.id}.bin`);
}

function modelIntegrityMetadataPath(path: string): string {
  return `${path}.androdex-integrity.json`;
}

function formatDiskLabel(bytes: number): string {
  const mib = bytes / 1024 / 1024;
  if (mib < 1024) {
    return `${Math.round(mib)} MiB`;
  }
  return `${(mib / 1024).toFixed(1)} GiB`;
}

function getModelDefinition(modelId: LocalWhisperModelId | string): WhisperModelDefinition {
  const model = WHISPER_MODELS.find((entry) => entry.id === modelId);
  if (!model) {
    throw new Error(`Unknown Whisper model: ${modelId}`);
  }
  return model;
}

async function fileStat(path: string): Promise<FileStatSummary | null> {
  try {
    const stat = await NodeFs.stat(path);
    return {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await NodeFs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha1File(path: string): Promise<string> {
  const hash = NodeCrypto.createHash("sha1");
  const handle = await NodeFs.open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const read = await handle.read(buffer, 0, buffer.length, null);
      if (read.bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, read.bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

function isModelIntegrityMetadata(value: unknown): value is ModelIntegrityMetadata {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === MODEL_INTEGRITY_VERSION &&
    typeof candidate.valid === "boolean" &&
    typeof candidate.size === "number" &&
    typeof candidate.mtimeMs === "number" &&
    (typeof candidate.sha1 === "string" || candidate.sha1 === null)
  );
}

async function readModelIntegrityMetadata(
  path: string,
  stat: FileStatSummary,
  definition: WhisperModelDefinition,
): Promise<ModelIntegrityMetadata | null> {
  try {
    const parsed = JSON.parse(await NodeFs.readFile(modelIntegrityMetadataPath(path), "utf8"));
    if (!isModelIntegrityMetadata(parsed)) {
      return null;
    }
    if (parsed.size !== stat.size || parsed.mtimeMs !== stat.mtimeMs) {
      return null;
    }
    if (definition.sha1 && parsed.sha1 !== definition.sha1 && parsed.valid) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeModelIntegrityMetadata(input: {
  readonly path: string;
  readonly stat: FileStatSummary;
  readonly valid: boolean;
  readonly sha1: string | null;
}): Promise<void> {
  const metadata: ModelIntegrityMetadata = {
    version: MODEL_INTEGRITY_VERSION,
    valid: input.valid,
    size: input.stat.size,
    mtimeMs: input.stat.mtimeMs,
    sha1: input.sha1,
  };
  await NodeFs.writeFile(modelIntegrityMetadataPath(input.path), `${JSON.stringify(metadata)}\n`);
}

async function inspectModelFile(
  config: ServerConfigShape,
  definition: WhisperModelDefinition,
  options?: { readonly verifyChecksum?: boolean },
): Promise<ModelFileInspection> {
  const path = modelPath(config, definition);
  const stat = await fileStat(path);
  if (!stat) {
    return { state: "missing", path };
  }

  if (stat.size !== definition.diskBytes) {
    return {
      state: "invalid",
      path,
      stat,
      message: `Local model file is incomplete. Expected ${definition.diskBytes} bytes, found ${stat.size}.`,
    };
  }

  if (!definition.sha1) {
    return { state: "ready", path, stat };
  }

  const metadata = await readModelIntegrityMetadata(path, stat, definition);
  if (metadata?.valid) {
    return { state: "ready", path, stat };
  }
  if (metadata && !metadata.valid) {
    return {
      state: "invalid",
      path,
      stat,
      message: "Local model checksum did not match the expected file.",
    };
  }
  if (!options?.verifyChecksum) {
    return { state: "unchecked", path, stat };
  }

  const digest = await sha1File(path);
  if (digest !== definition.sha1) {
    await writeModelIntegrityMetadata({
      path,
      stat,
      valid: false,
      sha1: digest,
    });
    return {
      state: "invalid",
      path,
      stat,
      message: `Local model checksum mismatch. Expected ${definition.sha1}, got ${digest}.`,
    };
  }

  await writeModelIntegrityMetadata({
    path,
    stat,
    valid: true,
    sha1: digest,
  });
  return { state: "ready", path, stat };
}

function isModelInstalled(inspection: ModelFileInspection): boolean {
  return inspection.state === "ready" || inspection.state === "unchecked";
}

async function toLocalWhisperModel(
  config: ServerConfigShape,
  definition: WhisperModelDefinition,
  inspection?: ModelFileInspection,
): Promise<LocalWhisperModel> {
  const inspected = inspection ?? (await inspectModelFile(config, definition));
  const installed = isModelInstalled(inspected);
  return {
    id: definition.id as LocalWhisperModelId,
    name: definition.name,
    description: definition.description,
    language: definition.language,
    diskBytes: definition.diskBytes,
    diskLabel: formatDiskLabel(definition.diskBytes),
    sha1: definition.sha1,
    quantized: definition.quantization !== null,
    quantization: definition.quantization,
    recommended: definition.recommended,
    installed,
    path: inspected.state === "missing" ? null : inspected.path,
  };
}

async function findPathCommand(command: string): Promise<string | null> {
  const result =
    process.platform === "win32"
      ? await runProcess("where", [command], { allowNonZeroExit: true, timeoutMs: 4_000 })
      : await runProcess("sh", ["-lc", `command -v ${command}`], {
          allowNonZeroExit: true,
          timeoutMs: 4_000,
        });
  if (result.code !== 0) {
    return null;
  }
  return (
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

async function resolveWhisperBinary(config: ServerConfigShape): Promise<string | null> {
  const configured = process.env.ANDRODEX_WHISPER_CPP_BINARY?.trim();
  if (configured && (await fileExists(configured))) {
    return configured;
  }

  const executableName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const resourceDirectoryName = `${process.platform}-${process.arch}`;
  const managedCandidates = [
    NodePath.join(
      process.cwd(),
      "apps/desktop/resources/voice/whisper",
      resourceDirectoryName,
      executableName,
    ),
    NodePath.resolve(
      SERVER_MODULE_DIR,
      "../../desktop/resources/voice/whisper",
      resourceDirectoryName,
      executableName,
    ),
    NodePath.join(config.baseDir, "tools", "whisper.cpp", "bin", executableName),
    NodePath.join(config.baseDir, "tools", "whisper.cpp", "build", "bin", executableName),
  ];
  for (const candidate of managedCandidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return await findPathCommand("whisper-cli");
}

function pathWithPrependedDirectory(name: string, directory: string): string {
  const existing = process.env[name]?.trim();
  return existing ? `${directory}${NodePath.delimiter}${existing}` : directory;
}

function whisperProcessEnv(binaryPath: string): NodeJS.ProcessEnv {
  const directory = NodePath.dirname(binaryPath);
  if (process.platform === "win32") {
    return {
      ...process.env,
      PATH: pathWithPrependedDirectory("PATH", directory),
    };
  }

  if (process.platform === "darwin") {
    return {
      ...process.env,
      DYLD_LIBRARY_PATH: pathWithPrependedDirectory("DYLD_LIBRARY_PATH", directory),
    };
  }

  return {
    ...process.env,
    LD_LIBRARY_PATH: pathWithPrependedDirectory("LD_LIBRARY_PATH", directory),
  };
}

async function readRuntimeStatus(config: ServerConfigShape) {
  const binaryPath = await resolveWhisperBinary(config);
  return {
    available: binaryPath !== null,
    binaryPath,
    installHint:
      binaryPath === null
        ? "The local voice engine is missing. Desktop updates can include it as a bundled app resource; otherwise set ANDRODEX_WHISPER_CPP_BINARY to a whisper-cli executable."
        : null,
  } satisfies ServerLocalWhisperModelsResult["runtime"];
}

export function listLocalWhisperModels(
  config: ServerConfigShape,
): Effect.Effect<ServerLocalWhisperModelsResult, ServerLocalWhisperError> {
  return Effect.tryPromise({
    try: async () => ({
      runtime: await readRuntimeStatus(config),
      models: await Promise.all(WHISPER_MODELS.map((model) => toLocalWhisperModel(config, model))),
    }),
    catch: (cause) =>
      localWhisperError(errorDetail(cause, "Failed to list local Whisper models."), cause),
  });
}

async function downloadModel(input: {
  readonly config: ServerConfigShape;
  readonly modelId: LocalWhisperModelId;
  readonly signal: AbortSignal;
  readonly publish: (event: ServerLocalWhisperDownloadEvent) => Promise<void>;
}): Promise<void> {
  const definition = getModelDefinition(input.modelId);
  const existingInspection = await inspectModelFile(input.config, definition, {
    verifyChecksum: true,
  });
  const existing = await toLocalWhisperModel(input.config, definition, existingInspection);
  await input.publish(event({ type: "started", model: existing }));

  if (existing.installed) {
    await input.publish(event({ type: "complete", model: existing }));
    return;
  }

  const directory = modelDirectory(input.config);
  await NodeFs.mkdir(directory, { recursive: true });

  const targetPath = modelPath(input.config, definition);
  const partialPath = `${targetPath}.part`;
  await NodeFs.rm(partialPath, { force: true });
  await NodeFs.rm(modelIntegrityMetadataPath(targetPath), { force: true });

  try {
    const response = await fetch(definition.url, { signal: input.signal });
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed with HTTP ${response.status} ${response.statusText}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    const totalBytes =
      Number.isFinite(contentLength) && contentLength > 0 ? contentLength : definition.diskBytes;
    const reader = response.body.getReader();
    const handle = await NodeFs.open(partialPath, "w");
    let downloadedBytes = 0;
    let lastProgressAt = 0;

    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) {
          break;
        }
        const chunk = Buffer.from(next.value);
        await handle.write(chunk);
        downloadedBytes += chunk.byteLength;
        const now = performance.now();
        if (now - lastProgressAt >= DOWNLOAD_PROGRESS_MIN_INTERVAL_MS) {
          lastProgressAt = now;
          await input.publish(
            event({
              type: "progress",
              modelId: definition.id as LocalWhisperModelId,
              downloadedBytes,
              totalBytes,
              percent: Math.max(0, Math.min(100, (downloadedBytes / totalBytes) * 100)),
            }),
          );
        }
      }
    } finally {
      await handle.close();
    }

    await input.publish(
      event({
        type: "progress",
        modelId: definition.id as LocalWhisperModelId,
        downloadedBytes,
        totalBytes,
        percent: 100,
      }),
    );

    if (contentLength > 0 && downloadedBytes !== contentLength) {
      throw new Error(
        `Downloaded model size mismatch for ${definition.id}. Expected ${contentLength} bytes, got ${downloadedBytes}.`,
      );
    }
    if (downloadedBytes !== definition.diskBytes) {
      throw new Error(
        `Downloaded model size mismatch for ${definition.id}. Expected ${definition.diskBytes} bytes, got ${downloadedBytes}.`,
      );
    }

    let digest: string | null = null;
    if (definition.sha1) {
      digest = await sha1File(partialPath);
      if (digest !== definition.sha1) {
        throw new Error(
          `Downloaded model checksum mismatch for ${definition.id}. Expected ${definition.sha1}, got ${digest}.`,
        );
      }
    }

    await NodeFs.rename(partialPath, targetPath);
    const stat = await fileStat(targetPath);
    if (stat) {
      await writeModelIntegrityMetadata({
        path: targetPath,
        stat,
        valid: true,
        sha1: digest,
      });
    }
  } catch (cause) {
    await NodeFs.rm(partialPath, { force: true });
    if (input.signal.aborted) {
      throw new Error("Model download cancelled.", { cause });
    }
    throw cause;
  }

  await input.publish(
    event({
      type: "complete",
      model: await toLocalWhisperModel(
        input.config,
        definition,
        await inspectModelFile(input.config, definition),
      ),
    }),
  );
}

export function downloadLocalWhisperModelStream(
  config: ServerConfigShape,
  input: ServerLocalWhisperDownloadInput,
): Stream.Stream<ServerLocalWhisperDownloadEvent, ServerLocalWhisperError> {
  return Stream.callback<ServerLocalWhisperDownloadEvent, ServerLocalWhisperError>((queue) => {
    const publish = (next: ServerLocalWhisperDownloadEvent) =>
      Effect.runPromise(Queue.offer(queue, next).pipe(Effect.asVoid));
    const abortController = new AbortController();

    void downloadModel({
      config,
      modelId: input.modelId,
      signal: abortController.signal,
      publish,
    })
      .catch(async (cause) => {
        const detail = errorDetail(cause, "Failed to download local Whisper model.");
        await publish(
          event({
            type: "error",
            modelId: input.modelId,
            message: detail,
          }),
        );
      })
      .finally(() => {
        void Effect.runPromise(Queue.end(queue));
      });

    return Effect.acquireRelease(Effect.succeed(abortController), (controller) =>
      Effect.sync(() => {
        controller.abort();
      }),
    );
  });
}

function cleanTranscript(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcribeTimeoutMs(durationMs: number | undefined): number {
  const requested = durationMs ? Math.ceil(durationMs * 12 + 30_000) : TRANSCRIBE_MIN_TIMEOUT_MS;
  return Math.max(TRANSCRIBE_MIN_TIMEOUT_MS, Math.min(TRANSCRIBE_MAX_TIMEOUT_MS, requested));
}

function transcribeThreadCount(): number {
  const available = NodeOs.availableParallelism?.() ?? NodeOs.cpus().length;
  return Math.max(2, Math.min(TRANSCRIBE_MAX_THREADS, available - 1));
}

async function transcribe(
  config: ServerConfigShape,
  input: ServerLocalWhisperTranscribeInput,
): Promise<ServerLocalWhisperTranscribeResult> {
  const definition = getModelDefinition(input.modelId);
  const audio = Buffer.from(input.audioWavBase64, "base64");
  if (audio.byteLength === 0) {
    throw new Error("Recorded audio was empty.");
  }
  if (audio.byteLength > TRANSCRIBE_MAX_AUDIO_BYTES) {
    throw new Error("Recorded audio is too large. Keep prompt dictation under a few minutes.");
  }
  if (audio.subarray(0, 4).toString("ascii") !== "RIFF") {
    throw new Error("Recorded audio was not encoded as WAV.");
  }
  assertPromptSpeechDetected(analyzeWavPromptSpeech(audio));

  const modelInspection = await inspectModelFile(config, definition, {
    verifyChecksum: true,
  });
  const model = await toLocalWhisperModel(config, definition, modelInspection);
  if (!model.installed || !model.path) {
    const suffix =
      modelInspection.state === "invalid"
        ? ` ${modelInspection.message} Download it again from the voice model menu.`
        : "";
    throw new Error(`Download the ${definition.name} model before dictating with it.${suffix}`);
  }

  const binaryPath = await resolveWhisperBinary(config);
  if (!binaryPath) {
    throw new Error((await readRuntimeStatus(config)).installHint ?? "whisper-cli is unavailable.");
  }

  const tempDir = tempDirectory(config);
  await NodeFs.mkdir(tempDir, { recursive: true });
  const id = NodeCrypto.randomUUID();
  const audioPath = NodePath.join(tempDir, `${id}.wav`);
  const outputStem = NodePath.join(tempDir, `${id}.transcript`);
  const outputPath = `${outputStem}.txt`;
  const startedAt = performance.now();

  try {
    await NodeFs.writeFile(audioPath, audio);
    const args = [
      "-m",
      model.path,
      "-f",
      audioPath,
      "-l",
      // Short coding prompts are too small for reliable language auto-detection.
      input.languageMode === "auto" && definition.language === "multilingual" ? "auto" : "en",
      "-t",
      String(transcribeThreadCount()),
      "-bo",
      "1",
      "-bs",
      "1",
      "-nt",
      "-np",
      "-otxt",
      "-of",
      outputStem,
    ];
    const result = await runProcess(binaryPath, args, {
      env: whisperProcessEnv(binaryPath),
      timeoutMs: transcribeTimeoutMs(input.durationMs),
      maxBufferBytes: 2 * 1024 * 1024,
      outputMode: "truncate",
    });
    const outputText = (await NodeFs.readFile(outputPath, "utf8").catch(() => "")) || result.stdout;
    const text = cleanTranscript(outputText);
    return {
      model,
      text,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await Promise.all([
      NodeFs.rm(audioPath, { force: true }),
      NodeFs.rm(outputPath, { force: true }),
    ]);
  }
}

export function transcribeLocalWhisperAudio(
  config: ServerConfigShape,
  input: ServerLocalWhisperTranscribeInput,
): Effect.Effect<ServerLocalWhisperTranscribeResult, ServerLocalWhisperError> {
  return Effect.tryPromise({
    try: () => transcribe(config, input),
    catch: (cause) =>
      localWhisperError(errorDetail(cause, "Failed to transcribe local Whisper audio."), cause),
  });
}
