import { describe, expect, it } from "vitest";
import type { ReplaySpec, TradeFill } from "./domain";
import { calculateSpeedrunProgressAtTimestamp, calculateSpeedrunReveal, chartReferenceLines, drawExecutionIndicators, replayEventVisualProgress } from "./renderer";

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

describe("cinematic speedrun timing", () => {
  const start = 1_000;
  const end = start + 4 * 3_600;
  const trades = [start, start + 30, start + 60, start + 90, start + 120, start + 180, start + 240, end];

  it("expands a dense opening trade cluster and compresses the idle hold", () => {
    const finalOpeningTrade = calculateSpeedrunProgressAtTimestamp(start + 240, start, end, trades, 60);
    expect(finalOpeningTrade).toBeGreaterThan(0.5);
    expect(finalOpeningTrade).toBeLessThan(0.75);
    expect(calculateSpeedrunProgressAtTimestamp(end, start, end, trades, 60)).toBe(1);
  });

  it("keeps the forward and inverse activity mappings synchronized", () => {
    for (const timestamp of trades) {
      const videoProgress = calculateSpeedrunProgressAtTimestamp(timestamp, start, end, trades, 60);
      const marketProgress = calculateSpeedrunReveal(videoProgress, start, end, trades, 60);
      expect(start + marketProgress * (end - start)).toBeCloseTo(timestamp, 6);
    }
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
        calls.push({ method: `set:${String(property)}`, args: [value] });
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

  it("uses matching permanent circle markers with + for buys and - for sells", () => {
    const markerSpec = {
      ...spec,
      episode: { ...spec.episode, fills: [fill("marker-buy", "buy", 120, "1", "3"), fill("marker-sell", "sell", 121, "1", "3")] },
    } as ReplaySpec;
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, markerSpec, "feed", 0.8, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 130, xForTime, yForPrice, plot, 1, theme);
    const markerArcs = calls.filter((call) => call.method === "arc" && Number(call.args[2]) === 11.9);
    expect(markerArcs).toHaveLength(2);
    // Two horizontal glyph strokes (+ and -), but only the buy has a vertical arm.
    const moveCalls = calls.filter((call) => call.method === "moveTo");
    expect(moveCalls).toHaveLength(3);
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

  it("shows at most three feed labels and pre-fades the oldest before replacement", () => {
    const queueFills = [120, 120.5, 121, 122].map((timestamp, index) => ({
      ...fill(`sell-queue-${index}`, "sell", timestamp, "1", String(3 + index * 0.1)),
      quoteLamports: String((index + 1) * 1_000_000_000),
    }));
    const queueSpec = { ...spec, episode: { ...spec.episode, fills: queueFills } } as ReplaySpec;
    const before = recordedContext();
    drawExecutionIndicators(before.context, queueSpec, "feed", 0.4275, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 121.5, xForTime, yForPrice, plot, 1, theme);
    expect(before.calls.filter((call) => call.method === "fillText")).toHaveLength(3);
    const opacities = before.calls.filter((call) => call.method === "set:globalAlpha").map((call) => Number(call.args[0]));
    expect(opacities[0]).toBeLessThan(0.6);
    expect(opacities[1]).toBeGreaterThan(0.9);
    expect(opacities[2]).toBeGreaterThan(0);

    const after = recordedContext();
    drawExecutionIndicators(after.context, queueSpec, "feed", 0.44, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 122, xForTime, yForPrice, plot, 1, theme);
    expect(after.calls.filter((call) => call.method === "fillText")).toHaveLength(3);
  });

  it.each([
    ["detailed", 6],
    ["hype", 2],
  ] as const)("limits on-screen indicator text for the %s style", (style, expectedTextCalls) => {
    const queueFills = [120, 120.5, 121, 122].map((timestamp, index) => ({
      ...fill(`queue-${index}`, "sell", timestamp, "1", String(3 + index * 0.1)),
      quoteLamports: String((index + 1) * 1_000_000_000),
    }));
    const queueSpec = { ...spec, episode: { ...spec.episode, fills: queueFills } } as ReplaySpec;
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, queueSpec, style, 0.44, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 122, xForTime, yForPrice, plot, 1, theme);
    const labels = calls.filter((call) => call.method === "fillText").map((call) => String(call.args[0]));
    expect(labels).toHaveLength(expectedTextCalls);
    if (style === "hype") {
      expect(labels.filter((label) => label.startsWith("SELLS "))).toHaveLength(labels.length / 2);
      expect(labels.filter((label) => label.endsWith("%"))).toHaveLength(labels.length / 2);
    }
  });

  it("anchors a fill before the first candle to the nearest candle in candlestick mode", () => {
    const early = { ...spec, episode: { ...spec.episode, fills: [fill("early", "buy", 90, "1", "0.1")] } } as ReplaySpec;
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, early, "feed", 0.5, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null, chartStyle: "candlestick",
    }, 130, xForTime, yForPrice, plot, 1, theme);
    const arcYs = calls.filter((call) => call.method === "arc").map((call) => Number(call.args[1]));
    expect(arcYs.length).toBeGreaterThan(0);
    // yForPrice = 400 - price*20 -> raw 0.1 => 398 (floating); clamped low 0.9 => 382.
    expect(arcYs.every((y) => Math.abs(y - 398) > 1)).toBe(true);
    expect(arcYs.some((y) => Math.abs(y - 382) < 1)).toBe(true);
  });

  it("never inserts the coin name into Hype indicators", () => {
    const hypeSpec = {
      ...spec,
      symbol: "TESTCOIN",
      marketCapMultiplier: null,
      episode: { ...spec.episode, fills: [fill("hype-buy", "buy", 120, "1", "3")] },
    } as ReplaySpec;
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, hypeSpec, "hype", 0.45, {
      duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 130, xForTime, yForPrice, plot, 1, theme);
    const labels = calls.filter((call) => call.method === "fillText").map((call) => String(call.args[0]));
    expect(labels.some((label) => label.startsWith("BUYS "))).toBe(true);
    expect(labels.some((label) => label.includes("ENTRY"))).toBe(false);
    expect(labels.some((label) => label.includes("TESTCOIN"))).toBe(false);
  });

  it.each([
    [1920, 1080],
    [1080, 1920],
  ])("centers Hype text on the %sx%s card with a stronger shadow", (width, height) => {
    const { context, calls } = recordedContext();
    drawExecutionIndicators(context, spec, "hype", 0.45, {
      duration: 8, width, height, chartLeadSeconds: 0, chartTrailSeconds: null,
    }, 130, xForTime, yForPrice, plot, 1, theme);
    const translations = calls.filter((call) => call.method === "translate");
    expect(translations.some((call) => call.args[0] === width / 2 && call.args[1] === height / 2)).toBe(true);
    expect(calls.some((call) => call.method === "set:shadowBlur" && call.args[0] === 48)).toBe(true);
    expect(calls.some((call) => call.method === "set:shadowOffsetY" && call.args[0] === 8)).toBe(true);
  });

  it("scales Hype text up from a subtle smaller entrance size", () => {
    const entranceSpec = {
      ...spec,
      episode: { ...spec.episode, fills: [fill("hype-scale", "buy", 120, "1", "3")] },
    } as ReplaySpec;
    const renderScale = (ageSeconds: number) => {
      const { context, calls } = recordedContext();
      const eventAt = replayEventVisualProgress(entranceSpec.episode.fills[0]!, entranceSpec, 1920, 1080, 8, 0, null, false);
      drawExecutionIndicators(context, entranceSpec, "hype", eventAt + ageSeconds / 8, {
        duration: 8, width: 1920, height: 1080, chartLeadSeconds: 0, chartTrailSeconds: null,
      }, 120 + ageSeconds, xForTime, yForPrice, plot, 1, theme);
      return Number(calls.find((call) => call.method === "scale")?.args[0]);
    };
    const enteringScale = renderScale(0.02);
    const settledScale = renderScale(0.2);
    expect(enteringScale).toBeGreaterThanOrEqual(0.86);
    expect(enteringScale).toBeLessThan(1);
    expect(settledScale).toBe(1);
  });

});
