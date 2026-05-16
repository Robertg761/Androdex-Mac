import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import WebSocket, { type RawData } from "ws";

import * as CodexError from "../errors.ts";

export interface CodexAppServerWebSocketOptions {
  readonly url: string;
  readonly bearerToken?: string;
}

export interface CodexAppServerWebSocketStdio {
  readonly stdio: Stdio.Stdio;
  readonly terminationError: Effect.Effect<CodexError.CodexAppServerError>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function rawDataToString(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  return decoder.decode(data);
}

const transportError = (detail: string, cause: unknown) =>
  new CodexError.CodexAppServerTransportError({
    detail,
    cause,
  });

const waitForOpen = (socket: WebSocket, url: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          socket.off("open", handleOpen);
          socket.off("error", handleError);
        };
        const handleOpen = () => {
          cleanup();
          resolve();
        };
        const handleError = (error: Error) => {
          cleanup();
          reject(error);
        };
        socket.once("open", handleOpen);
        socket.once("error", handleError);
      }),
    catch: (cause) =>
      transportError(`Failed to connect to Codex App Server WebSocket: ${url}`, cause),
  });

const sendFrame = (socket: WebSocket, frame: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        socket.send(frame.replace(/\n$/u, ""), (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    catch: (cause) => transportError("Failed to write Codex App Server WebSocket frame", cause),
  });

export const makeWebSocketStdio = Effect.fn("makeWebSocketStdio")(function* (
  options: CodexAppServerWebSocketOptions,
) {
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done<void>>();
  const closeInfo = yield* Ref.make<{ readonly code?: number; readonly reason?: string } | null>(
    null,
  );
  const context = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(context);
  const socketOptions = options.bearerToken
    ? {
        headers: {
          Authorization: `Bearer ${options.bearerToken}`,
        },
      }
    : undefined;
  const socket = new WebSocket(options.url, socketOptions);

  yield* waitForOpen(socket, options.url);

  socket.on("message", (data: RawData) => {
    runFork(Queue.offer(input, encoder.encode(`${rawDataToString(data)}\n`)));
  });
  socket.on("close", (code: number, reason: Buffer) => {
    runFork(
      Ref.set(closeInfo, {
        code,
        ...(reason.length > 0 ? { reason: reason.toString("utf8") } : {}),
      }).pipe(Effect.andThen(Queue.end(input))),
    );
  });
  socket.on("error", (error: Error) => {
    runFork(Ref.set(closeInfo, { reason: error.message }).pipe(Effect.andThen(Queue.end(input))));
  });

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }),
  );

  return {
    stdio: Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.fromQueue(input),
      stdout: () =>
        Sink.forEach((chunk) =>
          sendFrame(socket, typeof chunk === "string" ? chunk : decoder.decode(chunk)).pipe(
            Effect.orDie,
          ),
        ),
      stderr: () => Sink.drain,
    }),
    terminationError: Ref.get(closeInfo).pipe(
      Effect.map((info) =>
        transportError(
          info?.reason
            ? `Codex App Server WebSocket closed: ${info.reason}`
            : info?.code !== undefined
              ? `Codex App Server WebSocket closed with code ${info.code}`
              : "Codex App Server WebSocket closed",
          info ?? new Error("Codex App Server WebSocket closed"),
        ),
      ),
    ),
  };
});
