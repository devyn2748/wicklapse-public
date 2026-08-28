import { describe, expect, it } from "vitest";
import type { ReplaySpec, TradeFill } from "./domain";
import { chartReferenceLines } from "./renderer";

function fill(signature: string, side: "buy" | "sell", timestamp: number, amount: string, price: string): TradeFill {
  return {
    signature,
    slot: timestamp,
    timestamp,
    side,
    tokenMint: "3".repeat(44),
    tokenDecimals: 0,
    tokenAmountRaw: amount,
    quoteLamports: "1",
    networkFeeLamports: "0",
    walletPostTokenRaw: "0",
    estimatedPriceSol: price,
  };
}

const fills = [
  fill("buy-1", "buy", 100, "1", "1"),
  fill("buy-2", "buy", 120, "3", "3"),
  fill("sell-1", "sell", 140, "1", "4"),
  fill("sell-2", "sell", 150, "3", "2"),
];

const spec = {
  episode: { fills, startTimestamp: 100, endTimestamp: 150 },
  candles: [{ timestamp: 100, openSol: "1", highSol: "9.96", lowSol: "0.9", closeSol: "2", volume: "1" }],
  marketCapMultiplier: "10",
  athMarketCapUsd: "100",
} as ReplaySpec;

describe("chartReferenceLines", () => {
  it("updates volume-weighted buy and sell averages as executions occur", () => {
    const config = { showAverageBuyLine: true, showAverageSellLine: true, showAthLine: false };
    expect(chartReferenceLines(spec, config, 110).map((line) => [line.kind, line.priceSol])).toEqual([["averageBuy", 1]]);
    expect(chartReferenceLines(spec, config, 130).map((line) => [line.kind, line.priceSol])).toEqual([["averageBuy", 2.5]]);
    expect(chartReferenceLines(spec, config, 145).map((line) => [line.kind, line.priceSol])).toEqual([["averageBuy", 2.5], ["averageSell", 4]]);
    expect(chartReferenceLines(spec, config, 160).map((line) => [line.kind, line.priceSol])).toEqual([["averageBuy", 2.5], ["averageSell", 2.5]]);
  });

  it("draws a true ATH line only when the clip reaches it", () => {
    const config = { showAverageBuyLine: false, showAverageSellLine: false, showAthLine: true };
    expect(chartReferenceLines(spec, config)[0]).toMatchObject({ kind: "ath", priceSol: 10, placement: "line", marketCapUsd: 100 });
    const belowAth = { ...spec, candles: [{ ...spec.candles![0]!, highSol: "9" }] };
    expect(chartReferenceLines(belowAth, config)[0]).toMatchObject({ kind: "ath", placement: "top", marketCapUsd: 100 });
  });

  it("does not invent an ATH when Axiom did not provide one", () => {
    expect(chartReferenceLines({ ...spec, athMarketCapUsd: null }, { showAthLine: true })).toEqual([]);
  });
});
