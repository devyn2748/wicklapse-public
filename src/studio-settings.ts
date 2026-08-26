import type { Currency } from "./domain";
import type { SoundName } from "./export-video";
import type { ThemeName, WalletVisibility } from "./renderer";

export interface StudioSettings {
  duration: number;
  theme: ThemeName;
  currency: Currency;
  buySound: SoundName;
  sellSound: SoundName;
  exactValues: boolean;
  walletVisibility: WalletVisibility;
  width: number;
  height: number;
  fps: 30 | 60;
  chartMetric: "marketCap" | "price";
  marketCapFormat: "auto" | "thousands" | "millions";
  marketCapThreshold: number;
  candleInterval: "auto" | "1s" | "5s" | "1m";
}

export const DEFAULT_STUDIO_SETTINGS: StudioSettings = {
  duration: 8,
  theme: "obsidian",
  currency: "SOL",
  buySound: "pulse",
  sellSound: "confirm",
  exactValues: false,
  walletVisibility: "hidden",
  width: 1920,
  height: 1080,
  fps: 30,
  chartMetric: "marketCap",
  marketCapFormat: "auto",
  marketCapThreshold: 1_000_000,
  candleInterval: "auto",
};

export const ASPECT_PRESETS = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "4:5", width: 1080, height: 1350 },
] as const;
