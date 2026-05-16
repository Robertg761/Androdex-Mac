import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const LocalWhisperModelId = TrimmedNonEmptyString.pipe(Schema.brand("LocalWhisperModelId"));
export type LocalWhisperModelId = typeof LocalWhisperModelId.Type;

export const LocalWhisperModelLanguage = Schema.Literals(["english", "multilingual"]);
export type LocalWhisperModelLanguage = typeof LocalWhisperModelLanguage.Type;

export const LocalWhisperModelQuantization = Schema.NullOr(Schema.Literals(["Q5", "Q8"]));
export type LocalWhisperModelQuantization = typeof LocalWhisperModelQuantization.Type;

export const LocalWhisperRuntimeStatus = Schema.Struct({
  available: Schema.Boolean,
  binaryPath: Schema.NullOr(Schema.String),
  installHint: Schema.NullOr(Schema.String),
});
export type LocalWhisperRuntimeStatus = typeof LocalWhisperRuntimeStatus.Type;

export const LocalWhisperModel = Schema.Struct({
  id: LocalWhisperModelId,
  name: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  language: LocalWhisperModelLanguage,
  diskBytes: PositiveInt,
  diskLabel: TrimmedNonEmptyString,
  sha1: Schema.NullOr(TrimmedNonEmptyString),
  quantized: Schema.Boolean,
  quantization: LocalWhisperModelQuantization,
  recommended: Schema.Boolean,
  installed: Schema.Boolean,
  path: Schema.NullOr(Schema.String),
});
export type LocalWhisperModel = typeof LocalWhisperModel.Type;

export const ServerLocalWhisperModelsResult = Schema.Struct({
  runtime: LocalWhisperRuntimeStatus,
  models: Schema.Array(LocalWhisperModel),
});
export type ServerLocalWhisperModelsResult = typeof ServerLocalWhisperModelsResult.Type;

export const ServerLocalWhisperDownloadInput = Schema.Struct({
  modelId: LocalWhisperModelId,
});
export type ServerLocalWhisperDownloadInput = typeof ServerLocalWhisperDownloadInput.Type;

export const ServerLocalWhisperDownloadStartedEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("started"),
  model: LocalWhisperModel,
});
export type ServerLocalWhisperDownloadStartedEvent =
  typeof ServerLocalWhisperDownloadStartedEvent.Type;

export const ServerLocalWhisperDownloadProgressEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("progress"),
  modelId: LocalWhisperModelId,
  downloadedBytes: NonNegativeInt,
  totalBytes: PositiveInt,
  percent: Schema.Number,
});
export type ServerLocalWhisperDownloadProgressEvent =
  typeof ServerLocalWhisperDownloadProgressEvent.Type;

export const ServerLocalWhisperDownloadCompleteEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("complete"),
  model: LocalWhisperModel,
});
export type ServerLocalWhisperDownloadCompleteEvent =
  typeof ServerLocalWhisperDownloadCompleteEvent.Type;

export const ServerLocalWhisperDownloadErrorEvent = Schema.Struct({
  version: Schema.Literal(1),
  type: Schema.Literal("error"),
  modelId: LocalWhisperModelId,
  message: TrimmedNonEmptyString,
});
export type ServerLocalWhisperDownloadErrorEvent = typeof ServerLocalWhisperDownloadErrorEvent.Type;

export const ServerLocalWhisperDownloadEvent = Schema.Union([
  ServerLocalWhisperDownloadStartedEvent,
  ServerLocalWhisperDownloadProgressEvent,
  ServerLocalWhisperDownloadCompleteEvent,
  ServerLocalWhisperDownloadErrorEvent,
]);
export type ServerLocalWhisperDownloadEvent = typeof ServerLocalWhisperDownloadEvent.Type;

export const ServerLocalWhisperTranscribeInput = Schema.Struct({
  modelId: LocalWhisperModelId,
  audioWavBase64: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64 * 1024 * 1024)),
  durationMs: Schema.optionalKey(PositiveInt),
});
export type ServerLocalWhisperTranscribeInput = typeof ServerLocalWhisperTranscribeInput.Type;

export const ServerLocalWhisperTranscribeResult = Schema.Struct({
  model: LocalWhisperModel,
  text: Schema.String,
  durationMs: NonNegativeInt,
});
export type ServerLocalWhisperTranscribeResult = typeof ServerLocalWhisperTranscribeResult.Type;

export class ServerLocalWhisperError extends Schema.TaggedErrorClass<ServerLocalWhisperError>()(
  "ServerLocalWhisperError",
  {
    detail: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Local Whisper failed: ${this.detail}`;
  }
}
