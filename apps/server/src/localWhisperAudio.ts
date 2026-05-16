const MIN_PROMPT_AUDIO_DURATION_MS = 300;
const MIN_PROMPT_SPEECH_ACTIVE_MS = 120;
const MIN_PROMPT_PEAK = 0.012;
const MIN_PROMPT_RMS = 0.0018;
const PROMPT_SPEECH_FRAME_MS = 20;
const PROMPT_SPEECH_FRAME_PEAK = 0.025;
const PROMPT_SPEECH_FRAME_RMS = 0.006;

export interface PromptSpeechAnalysis {
  readonly durationMs: number;
  readonly peak: number;
  readonly rms: number;
  readonly activeMs: number;
  readonly hasSpeech: boolean;
}

export function analyzePcmPromptSpeech(
  samples: Float32Array,
  sampleRate: number,
): PromptSpeechAnalysis {
  if (samples.length === 0 || sampleRate <= 0) {
    return {
      durationMs: 0,
      peak: 0,
      rms: 0,
      activeMs: 0,
      hasSpeech: false,
    };
  }

  let peak = 0;
  let squareSum = 0;
  const frameSize = Math.max(1, Math.round((sampleRate * PROMPT_SPEECH_FRAME_MS) / 1000));
  let activeFrames = 0;

  for (let offset = 0; offset < samples.length; offset += frameSize) {
    let framePeak = 0;
    let frameSquareSum = 0;
    const frameEnd = Math.min(samples.length, offset + frameSize);
    const frameLength = frameEnd - offset;
    for (let index = offset; index < frameEnd; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
      const abs = Math.abs(sample);
      framePeak = Math.max(framePeak, abs);
      frameSquareSum += sample * sample;
    }
    peak = Math.max(peak, framePeak);
    squareSum += frameSquareSum;

    const frameRms = frameLength > 0 ? Math.sqrt(frameSquareSum / frameLength) : 0;
    if (framePeak >= PROMPT_SPEECH_FRAME_PEAK || frameRms >= PROMPT_SPEECH_FRAME_RMS) {
      activeFrames += 1;
    }
  }

  const durationMs = (samples.length / sampleRate) * 1000;
  const rms = Math.sqrt(squareSum / samples.length);
  const activeMs = activeFrames * PROMPT_SPEECH_FRAME_MS;
  return {
    durationMs,
    peak,
    rms,
    activeMs,
    hasSpeech:
      durationMs >= MIN_PROMPT_AUDIO_DURATION_MS &&
      peak >= MIN_PROMPT_PEAK &&
      rms >= MIN_PROMPT_RMS &&
      activeMs >= MIN_PROMPT_SPEECH_ACTIVE_MS,
  };
}

function readAscii(buffer: Buffer, offset: number, length: number): string {
  if (offset < 0 || offset + length > buffer.byteLength) {
    return "";
  }
  return buffer.subarray(offset, offset + length).toString("ascii");
}

export function analyzeWavPromptSpeech(audio: Buffer): PromptSpeechAnalysis {
  if (
    audio.byteLength < 44 ||
    readAscii(audio, 0, 4) !== "RIFF" ||
    readAscii(audio, 8, 4) !== "WAVE"
  ) {
    throw new Error("Recorded audio was not encoded as WAV.");
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= audio.byteLength) {
    const chunkId = readAscii(audio, offset, 4);
    const chunkSize = audio.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    if (chunkDataOffset + chunkSize > audio.byteLength) {
      break;
    }

    if (chunkId === "fmt ") {
      audioFormat = audio.readUInt16LE(chunkDataOffset);
      channels = audio.readUInt16LE(chunkDataOffset + 2);
      sampleRate = audio.readUInt32LE(chunkDataOffset + 4);
      bitsPerSample = audio.readUInt16LE(chunkDataOffset + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== 1 || channels < 1 || sampleRate <= 0 || bitsPerSample !== 16) {
    throw new Error("Recorded WAV audio must be 16-bit PCM.");
  }
  if (dataOffset < 0 || dataSize <= 0) {
    throw new Error("Recorded WAV audio did not contain samples.");
  }

  const frameCount = Math.floor(dataSize / (channels * 2));
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = dataOffset + (frame * channels + channel) * 2;
      mixed += audio.readInt16LE(sampleOffset) / 0x8000;
    }
    samples[frame] = mixed / channels;
  }

  return analyzePcmPromptSpeech(samples, sampleRate);
}

export function assertPromptSpeechDetected(analysis: PromptSpeechAnalysis): void {
  if (analysis.hasSpeech) {
    return;
  }
  throw new Error("No speech detected. Try speaking closer to the microphone.");
}
