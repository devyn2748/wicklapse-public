import { describe, expect, it } from "vitest";
import type { ReplaySpec, TradeFill } from "./domain";
import { BUNDLED_SOUND_PRESETS, replayEventOffset, replaySoundEvents } from "./export-video";

const fill = (signature: string, timestamp: number, side: "buy" | "sell"): TradeFill => ({
  signature,
  slot: timestamp,
  timestamp,
  side,
  tokenMint: "3".repeat(44),
  tokenDecimals: 6,
  tokenAmountRaw: "1000000",
  quoteLamports: "10000000",
  networkFeeLamports: "0",
  walletPostTokenRaw: side === "buy" ? "1000000" : "0",
  estimatedPriceSol: "0.00001",
});

const buy = fill("buy", 100, "buy");
const sell = fill("sell", 200, "sell");
const spec = {
  points: [
    { timestamp: 100, priceSol: "0.00001", pnlSol: "0" },
    { timestamp: 200, priceSol: "0.00002", pnlSol: "1" },
  ],
  candles: Array.from({ length: 101 }, (_, index) => ({
    timestamp: 99 + index,
    openSol: "0.00001",
    highSol: "0.00002",
    lowSol: "0.000009",
    closeSol: "0.000015",
    volume: "1",
  })),
  candleIntervalSeconds: 1,
  episode: {
    startTimestamp: 100,
    endTimestamp: 200,
    fills: [buy, sell],
  },
} as ReplaySpec;

describe("replay audio timing", () => {
  it("exposes the complete bundled sound pack with unique stable identifiers", () => {
    expect(BUNDLED_SOUND_PRESETS).toHaveLength(13);
    expect(new Set(BUNDLED_SOUND_PRESETS.map((preset) => preset.value)).size).toBe(13);
    expect(new Set(BUNDLED_SOUND_PRESETS.map((preset) => preset.file)).size).toBe(13);
  });

  it("uses the same duration-aware landscape timeline as the visible execution marker", () => {
    const config = { duration: 8, width: 1920, height: 1080 };
    expect(replayEventOffset(buy, spec, config)).toBeGreaterThan(0.1);
    expect(replayEventOffset(buy, spec, config)).toBeLessThan(0.25);
    expect(replayEventOffset(sell, spec, config)).toBeCloseTo(7.35, 4);
  });

  it("slows the replay for longer clips while keeping a fixed short final hold", () => {
    const middle = fill("middle", 150, "buy");
    const offset6 = replayEventOffset(middle, spec, { duration: 6, width: 1920, height: 1080 });
    const offset12 = replayEventOffset(middle, spec, { duration: 12, width: 1920, height: 1080 });
    expect(offset12).toBeGreaterThan(offset6 + 2.5);
    expect(6 - replayEventOffset(sell, spec, { duration: 6, width: 1920, height: 1080 })).toBeCloseTo(0.65, 4);
    expect(12 - replayEventOffset(sell, spec, { duration: 12, width: 1920, height: 1080 })).toBeCloseTo(0.65, 4);
  });

  it("consolidates same-side partial fills that share a visible marker window", () => {
    const partial = fill("buy-partial", 101, "buy");
    expect(replaySoundEvents({ ...spec, episode: { ...spec.episode, fills: [buy, partial, sell] } }).map((event) => event.signature)).toEqual(["buy", "sell"]);
  });

  it("uses the declared candle interval when sparse source timestamps have gaps", () => {
    const partial = fill("buy-partial", 104, "buy");
    const sparseSpec = {
      ...spec,
      candleIntervalSeconds: 1,
      candles: spec.candles?.filter((_, index) => index % 10 === 0),
      episode: { ...spec.episode, fills: [buy, partial, sell] },
    };
    expect(replaySoundEvents(sparseSpec).map((event) => event.signature)).toEqual(["buy", "buy-partial", "sell"]);
  });

  it("places the first buy and final sell at explicit video times", () => {
    const timedSpec = { ...spec, chartStartTimestamp: 25, chartEndTimestamp: 275 };
    const config = {
      duration: 10,
      width: 1920,
      height: 1080,
      chartLeadSeconds: 3,
      chartTrailSeconds: 3,
    };
    expect(replayEventOffset(buy, timedSpec, config)).toBeCloseTo(3, 8);
    expect(replayEventOffset(sell, timedSpec, config)).toBeCloseTo(7, 8);
  });

  it("spreads an opening trade burst across a speedrun before compressing a long hold", () => {
    const start = 1_000;
    const end = start + 4 * 3_600;
    const burstTimes = [start, start + 30, start + 60, start + 90, start + 120, start + 180, start + 240];
    const speedrunFills = [
      ...burstTimes.map((timestamp, index) => fill(`burst-${index}`, timestamp, index % 2 ? "sell" : "buy")),
      fill("final-exit", end, "sell"),
    ];
    const speedrunSpec = {
      ...spec,
      points: speedrunFills.map((event, index) => ({ timestamp: event.timestamp, priceSol: "0.00001", pnlSol: String(index) })),
      candles: [
        { ...spec.candles![0]!, timestamp: start },
        { ...spec.candles![0]!, timestamp: end - 60 },
      ],
      candleIntervalSeconds: 60,
      episode: { ...spec.episode, startTimestamp: start, endTimestamp: end, fills: speedrunFills },
    } as ReplaySpec;
    const config = { duration: 8, width: 1920, height: 1080, speedrunMode: true };
    const finalBurstOffset = replayEventOffset(speedrunFills[6]!, speedrunSpec, config);
    expect(finalBurstOffset).toBeGreaterThan(3.5);
    expect(finalBurstOffset).toBeLessThan(5.5);
    expect(replayEventOffset(speedrunFills.at(-1)!, speedrunSpec, config)).toBeCloseTo(7.35, 4);
  });
});
