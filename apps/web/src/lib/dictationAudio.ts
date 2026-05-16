export const DICTATION_METER_IDLE_TEXT = "⠤⠤⠤⠤";

const DICTATION_METER_INTERVAL_MS = 60;
const DICTATION_METER_SYMBOLS = ["⠤", "⠴", "⠶", "⠷", "⡷", "⡿", "⣿"] as const;
const TARGET_SAMPLE_RATE = 16_000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const MIN_PROMPT_AUDIO_DURATION_MS = 300;
const MIN_PROMPT_SPEECH_ACTIVE_MS = 120;
const MIN_PROMPT_PEAK = 0.012;
const MIN_PROMPT_RMS = 0.0018;
const PROMPT_SPEECH_FRAME_MS = 20;
const PROMPT_SPEECH_FRAME_PEAK = 0.025;
const PROMPT_SPEECH_FRAME_RMS = 0.006;

interface ComposerDictationMeterState {
  readonly history: string[];
  noiseEma: number;
  env: number;
}

export interface WavDictationRecordingResult {
  readonly wavBase64: string;
  readonly durationMs: number;
}

export interface WavDictationRecorder {
  readonly stop: () => Promise<WavDictationRecordingResult>;
  readonly cancel: () => void;
}

function createComposerDictationMeterState(): ComposerDictationMeterState {
  return {
    history: Array.from({ length: 4 }, () => DICTATION_METER_IDLE_TEXT[0] ?? "⠤"),
    noiseEma: 0.02,
    env: 0,
  };
}

function nextComposerDictationMeterText(state: ComposerDictationMeterState, peak: number): string {
  const latestPeak = Math.max(0, Math.min(1, peak));
  const attack = 0.8;
  const release = 0.25;

  if (latestPeak > state.env) {
    state.env = attack * latestPeak + (1 - attack) * state.env;
  } else {
    state.env = release * latestPeak + (1 - release) * state.env;
  }

  const rmsApprox = state.env * 0.7;
  state.noiseEma = 0.95 * state.noiseEma + 0.05 * rmsApprox;
  const refLevel = Math.max(state.noiseEma, 0.01);
  const fastSignal = 0.8 * latestPeak + 0.2 * state.env;
  const raw = Math.max(0, fastSignal / (refLevel * 2));
  const compressed = Math.min(1, Math.log1p(raw) / Math.log1p(1.6));
  const symbolIndex = Math.max(
    0,
    Math.min(
      DICTATION_METER_SYMBOLS.length - 1,
      Math.round(compressed * (DICTATION_METER_SYMBOLS.length - 1)),
    ),
  );

  state.history.push(DICTATION_METER_SYMBOLS[symbolIndex] ?? "⠤");
  while (state.history.length > 4) {
    state.history.shift();
  }

  return state.history.join("");
}

function readTimeDomainPeak(samples: Uint8Array): number {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample - 128) / 128);
  }
  return peak;
}

function mergePcmChunks(chunks: readonly Float32Array[], totalSamples: number): Float32Array {
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resampleLinear(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate) {
    return samples;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < output.length; i += 1) {
    const sourceIndex = i * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(samples.length - 1, leftIndex + 1);
    const weight = sourceIndex - leftIndex;
    const left = samples[leftIndex] ?? 0;
    const right = samples[rightIndex] ?? left;
    output[i] = left + (right - left) * weight;
  }

  return output;
}

function normalizePromptAudio(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  if (peak < 0.01) {
    return samples;
  }

  const gain = Math.min(12, 0.95 / peak);
  if (gain <= 1.05) {
    return samples;
  }

  const normalized = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    normalized[index] = (samples[index] ?? 0) * gain;
  }
  return normalized;
}

function hasPromptSpeech(samples: Float32Array, sampleRate: number): boolean {
  if (samples.length === 0 || sampleRate <= 0) {
    return false;
  }

  let peak = 0;
  let squareSum = 0;
  let activeFrames = 0;
  const frameSize = Math.max(1, Math.round((sampleRate * PROMPT_SPEECH_FRAME_MS) / 1000));
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
  return (
    durationMs >= MIN_PROMPT_AUDIO_DURATION_MS &&
    peak >= MIN_PROMPT_PEAK &&
    rms >= MIN_PROMPT_RMS &&
    activeMs >= MIN_PROMPT_SPEECH_ACTIVE_MS
  );
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const headerBytes = 44;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(headerBytes + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = headerBytes;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Uint8Array(buffer);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function startWavDictationRecorder(input: {
  readonly onMeterText: (text: string) => void;
}): Promise<WavDictationRecorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === "undefined") {
    throw new Error("Microphone capture is unavailable in this runtime.");
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const audioContext = new window.AudioContext();
  await audioContext.resume().catch(() => undefined);

  const source = audioContext.createMediaStreamSource(mediaStream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  const processor = audioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;

  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let recording = true;
  let cleanedUp = false;

  processor.onaudioprocess = (event) => {
    if (!recording) {
      return;
    }

    const inputBuffer = event.inputBuffer;
    const channels = Math.max(1, inputBuffer.numberOfChannels);
    const frameCount = inputBuffer.length;
    const chunk = new Float32Array(frameCount);
    for (let channelIndex = 0; channelIndex < channels; channelIndex += 1) {
      const channel = inputBuffer.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < frameCount; sampleIndex += 1) {
        chunk[sampleIndex] = (chunk[sampleIndex] ?? 0) + (channel[sampleIndex] ?? 0) / channels;
      }
    }
    chunks.push(chunk);
    totalSamples += chunk.length;
  };

  source.connect(analyser);
  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(audioContext.destination);

  const samples = new Uint8Array(analyser.fftSize);
  const meterState = createComposerDictationMeterState();
  const tick = () => {
    analyser.getByteTimeDomainData(samples);
    input.onMeterText(nextComposerDictationMeterText(meterState, readTimeDomainPeak(samples)));
  };
  const intervalId = window.setInterval(tick, DICTATION_METER_INTERVAL_MS);
  tick();

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    window.clearInterval(intervalId);
    recording = false;
    try {
      source.disconnect();
      analyser.disconnect();
      processor.disconnect();
      silentOutput.disconnect();
    } catch {
      // Audio nodes can already be disconnected when the runtime tears down.
    }
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
    if (audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  };

  return {
    cancel: cleanup,
    stop: async () => {
      const durationMs = Math.round((totalSamples / audioContext.sampleRate) * 1000);
      cleanup();
      if (totalSamples === 0) {
        throw new Error("No microphone audio was captured.");
      }

      const merged = mergePcmChunks(chunks, totalSamples);
      const resampled = resampleLinear(merged, audioContext.sampleRate, TARGET_SAMPLE_RATE);
      if (!hasPromptSpeech(resampled, TARGET_SAMPLE_RATE)) {
        throw new Error("No speech detected. Try speaking closer to the microphone.");
      }
      const normalized = normalizePromptAudio(resampled);
      return {
        wavBase64: bytesToBase64(encodePcm16Wav(normalized, TARGET_SAMPLE_RATE)),
        durationMs,
      };
    },
  };
}
