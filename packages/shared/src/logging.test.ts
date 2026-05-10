import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { type CapturableStdIoStream, installStdIoLogCapture } from "./logging.ts";

class FakeStdIoStream extends EventEmitter implements CapturableStdIoStream {
  forwardedChunks: Array<string | Uint8Array> = [];
  writeCalls = 0;
  writeError: Error | null = null;

  write = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean => {
    this.writeCalls += 1;
    if (this.writeError !== null) {
      throw this.writeError;
    }

    this.forwardedChunks.push(chunk);
    const writeCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    writeCallback?.();
    return true;
  }) as typeof process.stdout.write;
}

function makeEpipeError(): Error {
  return Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
}

describe("installStdIoLogCapture", () => {
  it("captures and forwards stdio writes", () => {
    const stdout = new FakeStdIoStream();
    const stderr = new FakeStdIoStream();
    const captured: Array<{
      streamName: "stdout" | "stderr";
      chunk: unknown;
      encoding: BufferEncoding | undefined;
    }> = [];

    const restore = installStdIoLogCapture({
      stdout,
      stderr,
      writeCapturedChunk: (streamName, chunk, encoding) => {
        captured.push({ streamName, chunk, encoding });
      },
    });

    expect(stdout.write("hello")).toBe(true);
    expect(stderr.write("warn", "utf8")).toBe(true);

    expect(stdout.forwardedChunks).toEqual(["hello"]);
    expect(stderr.forwardedChunks).toEqual(["warn"]);
    expect(captured).toEqual([
      { streamName: "stdout", chunk: "hello", encoding: undefined },
      { streamName: "stderr", chunk: "warn", encoding: "utf8" },
    ]);

    restore();
  });

  it("captures but stops forwarding after the original stream raises EPIPE", () => {
    const stdout = new FakeStdIoStream();
    const stderr = new FakeStdIoStream();
    const epipeError = makeEpipeError();
    const captured: Array<string> = [];
    let callbackError: Error | null | undefined;

    const restore = installStdIoLogCapture({
      stdout,
      stderr,
      writeCapturedChunk: (_streamName, chunk) => {
        captured.push(String(chunk));
      },
    });

    stderr.writeError = epipeError;

    expect(() => {
      expect(
        stderr.write("first", (error) => {
          callbackError = error ?? null;
        }),
      ).toBe(false);
    }).not.toThrow();
    stderr.writeError = null;

    expect(callbackError).toBe(epipeError);
    expect(stderr.writeCalls).toBe(1);
    expect(stderr.write("second")).toBe(false);
    expect(stderr.writeCalls).toBe(1);
    expect(captured).toEqual(["first", "second"]);

    restore();
  });

  it("treats emitted EPIPE as terminal for later forwarding and restores handlers", () => {
    const stdout = new FakeStdIoStream();
    const stderr = new FakeStdIoStream();
    const originalStdoutWrite = stdout.write;
    const captured: Array<string> = [];

    const restore = installStdIoLogCapture({
      stdout,
      stderr,
      writeCapturedChunk: (_streamName, chunk) => {
        captured.push(String(chunk));
      },
    });

    stdout.emit("error", makeEpipeError());

    expect(stdout.write("after-error")).toBe(false);
    expect(stdout.writeCalls).toBe(0);
    expect(captured).toEqual(["after-error"]);

    restore();

    expect(stdout.write).toBe(originalStdoutWrite);
    expect(stdout.listenerCount("error")).toBe(0);
    expect(stderr.listenerCount("error")).toBe(0);
  });
});
