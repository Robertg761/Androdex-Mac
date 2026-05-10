import fs from "node:fs";
import path from "node:path";

export type CapturedStdIoStreamName = "stdout" | "stderr";

export interface CapturableStdIoStream {
  write: typeof process.stdout.write;
  on(event: "error", listener: (error: Error) => void): this;
  removeListener(event: "error", listener: (error: Error) => void): this;
}

export interface StdIoLogCaptureOptions {
  readonly stdout: CapturableStdIoStream;
  readonly stderr: CapturableStdIoStream;
  readonly writeCapturedChunk: (
    streamName: CapturedStdIoStreamName,
    chunk: unknown,
    encoding: BufferEncoding | undefined,
  ) => void;
}

export interface RotatingFileSinkOptions {
  readonly filePath: string;
  readonly maxBytes: number;
  readonly maxFiles: number;
  readonly throwOnError?: boolean;
}

export class RotatingFileSink {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly throwOnError: boolean;
  private currentSize = 0;

  constructor(options: RotatingFileSinkOptions) {
    if (options.maxBytes < 1) {
      throw new Error(`maxBytes must be >= 1 (received ${options.maxBytes})`);
    }
    if (options.maxFiles < 1) {
      throw new Error(`maxFiles must be >= 1 (received ${options.maxFiles})`);
    }

    this.filePath = options.filePath;
    this.maxBytes = options.maxBytes;
    this.maxFiles = options.maxFiles;
    this.throwOnError = options.throwOnError ?? false;

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.pruneOverflowBackups();
    this.currentSize = this.readCurrentSize();
  }

  write(chunk: string | Buffer): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (buffer.length === 0) return;

    try {
      if (this.currentSize > 0 && this.currentSize + buffer.length > this.maxBytes) {
        this.rotate();
      }

      fs.appendFileSync(this.filePath, buffer);
      this.currentSize += buffer.length;

      if (this.currentSize > this.maxBytes) {
        this.rotate();
      }
    } catch {
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to write log chunk to ${this.filePath}`);
      }
    }
  }

  private rotate(): void {
    try {
      const oldest = this.withSuffix(this.maxFiles);
      if (fs.existsSync(oldest)) {
        fs.rmSync(oldest, { force: true });
      }

      for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
        const source = this.withSuffix(index);
        const target = this.withSuffix(index + 1);
        if (fs.existsSync(source)) {
          fs.renameSync(source, target);
        }
      }

      if (fs.existsSync(this.filePath)) {
        fs.renameSync(this.filePath, this.withSuffix(1));
      }

      this.currentSize = 0;
    } catch {
      this.currentSize = this.readCurrentSize();
      if (this.throwOnError) {
        throw new Error(`Failed to rotate log file ${this.filePath}`);
      }
    }
  }

  private pruneOverflowBackups(): void {
    try {
      const dir = path.dirname(this.filePath);
      const baseName = path.basename(this.filePath);
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.startsWith(`${baseName}.`)) continue;
        const suffix = Number(entry.slice(baseName.length + 1));
        if (!Number.isInteger(suffix) || suffix <= this.maxFiles) continue;
        fs.rmSync(path.join(dir, entry), { force: true });
      }
    } catch {
      if (this.throwOnError) {
        throw new Error(`Failed to prune log backups for ${this.filePath}`);
      }
    }
  }

  private readCurrentSize(): number {
    try {
      return fs.statSync(this.filePath).size;
    } catch {
      return 0;
    }
  }

  private withSuffix(index: number): string {
    return `${this.filePath}.${index}`;
  }
}

interface PatchedStreamState {
  forwardingError: Error | null;
}

function isTerminalStdIoWriteError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END"
  );
}

function invokeWriteCallback(
  encodingOrCallback: BufferEncoding | ((error?: Error | null) => void) | undefined,
  callback: ((error?: Error | null) => void) | undefined,
  error: Error,
): void {
  const writeCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
  writeCallback?.(error);
}

function callOriginalWrite(
  stream: CapturableStdIoStream,
  originalWrite: typeof process.stdout.write,
  chunk: string | Uint8Array,
  encodingOrCallback: BufferEncoding | ((error?: Error | null) => void) | undefined,
  callback: ((error?: Error | null) => void) | undefined,
): boolean {
  const write = originalWrite as unknown as {
    call: (thisArg: CapturableStdIoStream, ...args: unknown[]) => boolean;
  };
  if (typeof encodingOrCallback === "function") {
    return write.call(stream, chunk, encodingOrCallback);
  }
  if (callback !== undefined) {
    return write.call(stream, chunk, encodingOrCallback, callback);
  }
  if (encodingOrCallback !== undefined) {
    return write.call(stream, chunk, encodingOrCallback);
  }
  return write.call(stream, chunk);
}

function patchStdIoWrite(
  streamName: CapturedStdIoStreamName,
  stream: CapturableStdIoStream,
  originalWrite: typeof process.stdout.write,
  state: PatchedStreamState,
  writeCapturedChunk: StdIoLogCaptureOptions["writeCapturedChunk"],
): typeof process.stdout.write {
  return ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
    writeCapturedChunk(streamName, chunk, encoding);

    if (state.forwardingError !== null) {
      invokeWriteCallback(encodingOrCallback, callback, state.forwardingError);
      return false;
    }

    try {
      return callOriginalWrite(stream, originalWrite, chunk, encodingOrCallback, callback);
    } catch (error) {
      if (!isTerminalStdIoWriteError(error)) {
        throw error;
      }
      state.forwardingError = error;
      invokeWriteCallback(encodingOrCallback, callback, error);
      return false;
    }
  }) as typeof process.stdout.write;
}

export function installStdIoLogCapture(options: StdIoLogCaptureOptions): () => void {
  const stdoutOriginalWrite = options.stdout.write;
  const stderrOriginalWrite = options.stderr.write;
  const stdoutState: PatchedStreamState = { forwardingError: null };
  const stderrState: PatchedStreamState = { forwardingError: null };

  const makeErrorListener =
    (state: PatchedStreamState) =>
    (error: Error): void => {
      if (!isTerminalStdIoWriteError(error)) {
        throw error;
      }
      state.forwardingError = error;
    };

  const stdoutErrorListener = makeErrorListener(stdoutState);
  const stderrErrorListener = makeErrorListener(stderrState);

  options.stdout.write = patchStdIoWrite(
    "stdout",
    options.stdout,
    stdoutOriginalWrite,
    stdoutState,
    options.writeCapturedChunk,
  );
  options.stderr.write = patchStdIoWrite(
    "stderr",
    options.stderr,
    stderrOriginalWrite,
    stderrState,
    options.writeCapturedChunk,
  );
  options.stdout.on("error", stdoutErrorListener);
  options.stderr.on("error", stderrErrorListener);

  return () => {
    options.stdout.write = stdoutOriginalWrite;
    options.stderr.write = stderrOriginalWrite;
    options.stdout.removeListener("error", stdoutErrorListener);
    options.stderr.removeListener("error", stderrErrorListener);
  };
}
