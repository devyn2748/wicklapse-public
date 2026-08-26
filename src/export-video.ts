import type { ReplaySpec, TradeFill } from "./domain";
import { drawReplayFrame, replayEventVisualProgress, type RenderConfig } from "./renderer";

export type SoundName = "pulse" | "chime" | "click" | "confirm" | "cash" | "snap" | "custom" | "off";

export interface ExportAudioOptions {
  buySound: SoundName;
  sellSound: SoundName;
  buyCustomBuffer?: AudioBuffer | null;
  sellCustomBuffer?: AudioBuffer | null;
  musicBuffer?: AudioBuffer | null;
  musicStart?: number;
  musicVolume?: number;
  eventVolume?: number;
}

function scheduleTone(
  audio: AudioContext,
  destination: AudioNode,
  when: number,
  sound: SoundName,
  volume: number,
  side: TradeFill["side"],
): void {
  if (sound === "off" || sound === "custom") return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const base = side === "buy" ? 620 : 330;
  const multiplier = sound === "chime" || sound === "confirm" ? 1.35 : sound === "cash" ? 0.82 : 1;
  oscillator.type = sound === "click" || sound === "snap" ? "square" : "sine";
  oscillator.frequency.setValueAtTime(base * multiplier, when);
  oscillator.frequency.exponentialRampToValueAtTime(base * multiplier * (side === "buy" ? 1.22 : 0.78), when + 0.12);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.22), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (sound === "click" || sound === "snap" ? 0.09 : 0.28));
  oscillator.connect(gain).connect(destination);
  oscillator.start(when);
  oscillator.stop(when + 0.32);
}

function scheduleBuffer(
  audio: AudioContext,
  destination: AudioNode,
  when: number,
  buffer: AudioBuffer,
  volume: number,
): void {
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = buffer;
  gain.gain.value = Math.max(0, Math.min(1, volume));
  source.connect(gain).connect(destination);
  source.start(when, 0, Math.min(buffer.duration, 5));
}

function scheduleReplaySound(
  audio: AudioContext,
  destination: AudioNode,
  when: number,
  sound: SoundName,
  customBuffer: AudioBuffer | null | undefined,
  volume: number,
  side: TradeFill["side"],
): void {
  if (sound === "custom") {
    if (customBuffer) scheduleBuffer(audio, destination, when, customBuffer, volume);
    return;
  }
  scheduleTone(audio, destination, when, sound, volume, side);
}

export function playReplaySound(
  audio: AudioContext,
  sound: SoundName,
  side: TradeFill["side"],
  customBuffer?: AudioBuffer | null,
  volume = 0.8,
): void {
  scheduleReplaySound(audio, audio.destination, audio.currentTime + 0.015, sound, customBuffer, volume, side);
}

export function replayEventOffset(
  fill: TradeFill,
  spec: ReplaySpec,
  config: Pick<RenderConfig, "duration" | "width" | "height">,
): number {
  const offset = replayEventVisualProgress(fill, spec, config.width, config.height) * config.duration;
  return Math.max(0.01, Math.min(config.duration - 0.01, offset));
}

/** Mirrors the renderer's consolidated marker behavior so partial fills do not create stacked sounds. */
export function replaySoundEvents(spec: ReplaySpec): TradeFill[] {
  const fills = [...spec.episode.fills].sort((left, right) => left.timestamp - right.timestamp);
  const candles = [...(spec.candles ?? [])].sort((left, right) => left.timestamp - right.timestamp);
  const middle = Math.floor(candles.length / 2);
  const interval = candles.length > 1
    ? Math.max(1, candles[middle]!.timestamp - candles[middle - 1]!.timestamp)
    : Math.max(1, Math.round(Math.max(1, spec.episode.endTimestamp - spec.episode.startTimestamp) / 60));
  const markerWindow = Math.max(2, interval);
  return fills.filter((fill, index) => {
    const previous = fills[index - 1];
    return !previous || previous.side !== fill.side || fill.timestamp - previous.timestamp > markerWindow;
  });
}

export async function exportReplayVideo(
  spec: ReplaySpec,
  config: RenderConfig,
  audioOptions: ExportAudioOptions,
  onProgress?: (progress: number) => void,
): Promise<{ blob: Blob; extension: "mp4" | "webm" }> {
  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");

  const audio = new AudioContext();
  await audio.resume();
  const destination = audio.createMediaStreamDestination();

  const canvasStream = canvas.captureStream(config.fps ?? 30);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const mp4Type = "video/mp4;codecs=avc1.42001E,mp4a.40.2";
  const webmType = "video/webm;codecs=vp9,opus";
  const mimeType = MediaRecorder.isTypeSupported(mp4Type) ? mp4Type : webmType;
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  const pixels = config.width * config.height;
  const videoBitsPerSecond = Math.max(8_000_000, Math.min(28_000_000, Math.round(pixels * (config.fps ?? 30) * 0.32)));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
    recorder.addEventListener("error", () => reject(new Error("The browser could not encode this video.")), { once: true });
  });

  drawReplayFrame(context, spec, config, 0);
  recorder.start(250);
  const leadIn = 0.03;
  const now = audio.currentTime + leadIn;
  for (const fill of replaySoundEvents(spec)) {
    const customBuffer = fill.side === "buy" ? audioOptions.buyCustomBuffer : audioOptions.sellCustomBuffer;
    scheduleReplaySound(
      audio,
      destination,
      now + replayEventOffset(fill, spec, config),
      fill.side === "buy" ? audioOptions.buySound : audioOptions.sellSound,
      customBuffer,
      audioOptions.eventVolume ?? 0.8,
      fill.side,
    );
  }
  if (audioOptions.musicBuffer) {
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    source.buffer = audioOptions.musicBuffer;
    gain.gain.value = audioOptions.musicVolume ?? 0.35;
    source.connect(gain).connect(destination);
    const offset = Math.min(audioOptions.musicStart ?? 0, Math.max(0, source.buffer.duration - 0.05));
    source.start(now, offset, Math.min(config.duration, source.buffer.duration - offset));
  }
  const start = performance.now() + leadIn * 1_000;
  await new Promise<void>((resolve) => {
    const frame = (time: number) => {
      const elapsed = (time - start) / 1_000;
      const progress = Math.max(0, Math.min(1, elapsed / config.duration));
      drawReplayFrame(context, spec, config, progress);
      onProgress?.(progress);
      if (progress >= 1) {
        recorder.stop();
        resolve();
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  const blob = await finished;
  stream.getTracks().forEach((track) => track.stop());
  await audio.close();
  return { blob, extension };
}
