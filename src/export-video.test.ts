import { describe, expect, it } from "vitest";
import type { ReplaySpec, TradeFill } from "./domain";
import { replayEventOffset, replaySoundEvents } from "./export-video";

const fill = (signature: string, timestamp: number, side: "buy" | "sell"): TradeFill => ({
  signature,
  slot: timestamp,
  timestamp,
  side,
  tokenMint: "Token1111111111111111111111111111111111111",
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
  episode: {
    startTimestamp: 100,
    endTimestamp: 200,
    fills: [buy, sell],
  },
} as ReplaySpec;

describe("replay audio timing", () => {
  it("uses the same eased landscape timeline as the visible execution marker", () => {
    const config = { duration: 8, width: 1920, height: 1080 };
    expect(replayEventOffset(buy, spec, config)).toBeGreaterThan(0.1);
    expect(replayEventOffset(buy, spec, config)).toBeLessThan(0.2);
    expect(replayEventOffset(sell, spec, config)).toBeCloseTo(6.4, 5);
  });

  it("consolidates same-side partial fills that share a visible marker window", () => {
    const partial = fill("buy-partial", 101, "buy");
    expect(replaySoundEvents({ ...spec, episode: { ...spec.episode, fills: [buy, partial, sell] } }).map((event) => event.signature)).toEqual(["buy", "sell"]);
  });
});
