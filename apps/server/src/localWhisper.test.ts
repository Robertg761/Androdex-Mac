// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFs from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "vitest";
import * as Effect from "effect/Effect";

import type { ServerConfigShape } from "./config.ts";
import { analyzeWavPromptSpeech } from "./localWhisperAudio.ts";
import { listLocalWhisperModels } from "./localWhisper.ts";

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + index * 2);
  }
  return buffer;
}

it("rejects silent WAV audio before invoking Whisper", () => {
  const silence = encodePcm16Wav(new Float32Array(16_000 * 2), 16_000);

  expect(analyzeWavPromptSpeech(silence)).toMatchObject({
    peak: 0,
    rms: 0,
    activeMs: 0,
    hasSpeech: false,
  });
});

it("accepts speech-like WAV audio before invoking Whisper", () => {
  const sampleRate = 16_000;
  const samples = new Float32Array(sampleRate);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.2;
  }

  expect(analyzeWavPromptSpeech(encodePcm16Wav(samples, sampleRate)).hasSpeech).toBe(true);
});

it("does not mark truncated local model files as installed", async () => {
  const baseDir = await NodeFs.mkdtemp(NodePath.join(NodeOs.tmpdir(), "androdex-whisper-test-"));
  try {
    const modelDir = NodePath.join(baseDir, "models", "whisper");
    await NodeFs.mkdir(modelDir, { recursive: true });
    await NodeFs.writeFile(NodePath.join(modelDir, "ggml-tiny.bin"), Buffer.from([1, 2, 3]));

    const result = await Effect.runPromise(
      listLocalWhisperModels({
        baseDir,
        stateDir: baseDir,
      } as ServerConfigShape),
    );
    const tiny = result.models.find((model) => model.id === "tiny");

    expect(tiny?.installed).toBe(false);
    expect(tiny?.path).toBe(NodePath.join(modelDir, "ggml-tiny.bin"));
  } finally {
    await NodeFs.rm(baseDir, { recursive: true, force: true });
  }
});
