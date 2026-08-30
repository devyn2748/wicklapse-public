import { describe, expect, it } from "vitest";
import type { ReplaySpec, TradeFill } from "./domain";
import { chartReferenceLines, drawExecutionIndicators } from "./renderer";

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
  chartStartTimestamp: 100,
  chartEndTimestamp: 150,
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

describe("trade indicator visibility", () => {
  function recordedContext() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const target = {
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (...args: unknown[]) => calls.push({ method: "fillText", args }),
      arc: (...args: unknown[]) => calls.push({ method: "arc", args }),
      stroke: (...args: unknown[]) => calls.push({ method: "stroke", args }),
      fill: (...args: unknown[]) => calls.push({ method: "fill", args }),
    };
    const context = new Proxy(target, {
      get(object, property) {
        if (property in object) return object[property as keyof typeof object];
        return (...args: unknown[]) => calls.push({ method: String(property), args });
      },
      set(object, property, value) {
        (object as Record<PropertyKey, unknown>)[property] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { context, calls };
  }

  const theme = {
    background: "#000000", panelStrong: "rgba(0,0,0,.95)", text: "#ffffff",
    positive: "#00ff99", negative: "#ff3366",
  } as any;
  const plot = { x: 0, y: 0, width: 800, height: 500 };
  const xForTime = (timestamp: number) => 100 + timestamp;
  const yForPrice = (price: number) => 400 - price * 20;

  it("renders feed text at execution time with a large outlined treatment", () => {
    const { context, calls } = recordedContext();
    const fillProgress = 0.5;
    drawExecutionIndicators(context, spec, "feed", fillProgress, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 130, xForTime, yForPrice, plot, 1, theme);
    expect(calls.some((call) => call.method === "fillText")).toBe(true);
    expect(calls.some((call) => call.method === "strokeText")).toBe(true);
  });

  it("keeps rapid same-side executions separate without overlapping", () => {
    const burstFills = [
      fill("sell-burst-1", "sell", 120, "1", "3"),
      fill("sell-burst-2", "sell", 120.5, "1", "3.1"),
    ];
    const burstSpec = { ...spec, episode: { ...spec.episode, fills: burstFills } } as ReplaySpec;
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, burstSpec, "feed", 0.5, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 130, xForTime, yForPrice, plot, 1, theme);
    const labels = calls.filter((call) => call.method === "fillText");
    expect(labels).toHaveLength(2);
    expect(labels.every((call) => String(call.args[0]).startsWith("SELL "))).toBe(true);
    expect(labels.every((call) => !String(call.args[0]).includes("×"))).toBe(true);
    const [first, second] = labels.map((call) => ({
      x: Number(call.args[1]), y: Number(call.args[2]), width: String(call.args[0]).length * 10,
    }));
    const overlaps = first!.x < second!.x + second!.width + 18
      && first!.x + first!.width + 18 > second!.x
      && first!.y - 35 < second!.y + 35
      && first!.y + 35 > second!.y - 35;
    expect(overlaps).toBe(false);
  });

  it("keeps marker labels visible after executions", () => {
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, spec, "markers", 1, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: null, chartTrailSeconds: null,
    }, 10_000, xForTime, yForPrice, plot, 1, theme);
    expect(calls.some((call) => call.method === "fillText")).toBe(true);
  });

  it("keeps minimal markers large, outlined, and guided after executions", () => {
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, spec, "minimal", 1, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: null, chartTrailSeconds: null,
    }, 10_000, xForTime, yForPrice, plot, 1, theme);
    const radii = calls.filter((call) => call.method === "arc").map((call) => Number(call.args[2]));
    expect(Math.max(...radii)).toBeGreaterThanOrEqual(8);
    expect(calls.some((call) => call.method === "stroke")).toBe(true);
  });
});
