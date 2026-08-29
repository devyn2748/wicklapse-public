import { z } from "zod";
import type { Currency } from "./domain";
import type { CandleIntervalPreference } from "./axiom-candles";
import { BUNDLED_SOUND_PRESETS, type SoundName } from "./export-video";
import type { ChartAnimation, ThemeName, WalletVisibility } from "./renderer";

export type CardAspectRatio = "16:9" | "9:16";
export type BackgroundStyle = "glow" | "solid" | "grid" | "particles" | "aurora" | "cyberpunk-scene";
export type ChartStyle = "candlestick" | "line" | "area" | "bar";

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
  candleInterval: CandleIntervalPreference;
  aspectRatio: CardAspectRatio;
  backgroundStyle: BackgroundStyle;
  chartAnimation: ChartAnimation;
  chartStyle: ChartStyle;
  chartLeadSeconds: number | null;
  chartTrailSeconds: number | null;
  showAverageBuyLine: boolean;
  showAverageSellLine: boolean;
  showAthLine: boolean;
  affiliateLink: string;
  speedrunMode: boolean;
}

const soundNames = new Set<string>([
  "pulse", "chime", "click", "confirm", "cash", "snap", "custom", "off",
  ...BUNDLED_SOUND_PRESETS.map((preset) => preset.value),
]);

export const StudioSettingsSchema = z.object({
  duration: z.number().finite().min(1).max(60),
  theme: z.enum(["obsidian", "neon", "minimal", "cyberpunk", "sunset", "matrix", "hacker"]),
  currency: z.enum(["SOL", "USD"]),
  buySound: z.custom<SoundName>((value) => typeof value === "string" && soundNames.has(value)),
  sellSound: z.custom<SoundName>((value) => typeof value === "string" && soundNames.has(value)),
  exactValues: z.boolean(),
  walletVisibility: z.enum(["hidden", "short", "full"]),
  width: z.number().int().min(320).max(3_840),
  height: z.number().int().min(320).max(3_840),
  fps: z.union([z.literal(30), z.literal(60)]),
  chartMetric: z.enum(["marketCap", "price"]),
  marketCapFormat: z.enum(["auto", "thousands", "millions"]),
  marketCapThreshold: z.number().finite().min(1_000).max(1_000_000_000),
  candleInterval: z.enum(["auto", "1s", "5s", "15s", "30s", "1m", "3m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  backgroundStyle: z.enum(["glow", "solid", "grid", "particles", "aurora", "cyberpunk-scene"]),
  chartAnimation: z.enum(["progressive", "follow", "fixed"]),
  chartStyle: z.enum(["candlestick", "line", "area", "bar"]),
  chartLeadSeconds: z.number().finite().min(0).max(60).nullable(),
  chartTrailSeconds: z.number().finite().min(0).max(60).nullable(),
  showAverageBuyLine: z.boolean(),
  showAverageSellLine: z.boolean(),
  showAthLine: z.boolean(),
  affiliateLink: z.string(),
  speedrunMode: z.boolean(),
});

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
  aspectRatio: "16:9",
  backgroundStyle: "glow",
  chartAnimation: "fixed",
  chartStyle: "candlestick",
  chartLeadSeconds: null,
  chartTrailSeconds: null,
  showAverageBuyLine: false,
  showAverageSellLine: false,
  showAthLine: false,
  affiliateLink: "",
  speedrunMode: false,
};

export const ASPECT_PRESETS = [
  { label: "16:9", width: 1920, height: 1080 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "9:16", width: 1080, height: 1920 },
  { label: "4:5", width: 1080, height: 1350 },
] as const;
