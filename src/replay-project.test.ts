import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShareContext, TradeEpisode, TradeFill } from "./domain";
import { buildMarkToMarketPoints, createReplaySpec, selectCandleRequest } from "./replay-project";

const fills: TradeFill[] = [
  {
    signature: "buy-signature",
    slot: 1,
    timestamp: 1_700_000_000,
    side: "buy",
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6wk43kshGZgFhAM",
    tokenDecimals: 6,
    tokenAmountRaw: "1000000",
    quoteLamports: "1000000000",
    networkFeeLamports: "5000",
    walletPostTokenRaw: "1000000",
    estimatedPriceSol: "1",
  },
  {
    signature: "sell-signature",
    slot: 2,
    timestamp: 1_700_000_300,
    side: "sell",
    tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6wk43kshGZgFhAM",
    tokenDecimals: 6,
    tokenAmountRaw: "1000000",
    quoteLamports: "3000000000",
    networkFeeLamports: "5000",
    walletPostTokenRaw: "0",
    estimatedPriceSol: "3",
  },
];

const episode: TradeEpisode = {
  id: "episode",
  tokenMint: fills[0]!.tokenMint,
  fills,
  startTimestamp: fills[0]!.timestamp,
  endTimestamp: fills[1]!.timestamp,
  status: "closed",
  totalBoughtLamports: "1000000000",
  totalSoldLamports: "3000000000",
  networkFeesLamports: "10000",
  remainingTokenRaw: "0",
  tokenDecimals: 6,
  approximatePnlLamports: "1999990000",
  matchScore: 100,
  matchLabel: "Exact match",
};

const context: ShareContext = {
  id: "capture",
  capturedAt: 1_700_000_400_000,
  pageUrl: "https://axiom.trade/meme/Pool1111111111111111111111111111111111111",
  tokenMint: episode.tokenMint,
  pairAddress: "Pool1111111111111111111111111111111111111",
  symbol: "TEST",
  tokenName: null,
  walletAddress: null,
  walletLabel: null,
  boughtSol: "1",
  soldSol: "3",
  holdingSol: "0",
  pnlSol: "2",
  roiPercent: "200",
  positionStatus: "closed",
  sourceText: "",
};

afterEach(() => vi.unstubAllGlobals());

describe("createReplaySpec", () => {
  it("keeps auto charts readable and honors supported candle overrides", () => {
    expect(selectCandleRequest(120, "auto").interval).toBe(1);
    expect(selectCandleRequest(10 * 60, "auto").interval).toBe(5);
    expect(selectCandleRequest(30 * 60, "auto").interval).toBe(60);
    expect(selectCandleRequest(120, "5s").interval).toBe(5);
    expect(selectCandleRequest(120, "1m").interval).toBe(60);
  });

  it("safely coarsens an override that would truncate a long position", () => {
    expect(selectCandleRequest(2 * 3_600, "1s").interval).toBeGreaterThanOrEqual(8);
  });

  it("builds requested five-second candles from supported one-second OHLCV", async () => {
    const shortEpisode = { ...episode, endTimestamp: episode.startTimestamp + 9 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (!url.includes("/ohlcv/")) return new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
        [episode.startTimestamp + 6, 4, 7, 3, 6, 2],
        [episode.startTimestamp + 5, 3, 5, 2, 4, 1],
        [episode.startTimestamp + 1, 1, 3, 0.5, 2, 4],
        [episode.startTimestamp, 1, 2, 0.8, 1, 3],
      ] } } }), { status: 200 });
    }));
    const replay = await createReplaySpec(shortEpisode, context, context.walletAddress ?? "", "5s");
    expect(replay.candleIntervalSeconds).toBe(5);
    expect(replay.candles).toHaveLength(2);
    expect(replay.candles?.[0]).toMatchObject({ openSol: "1", highSol: "3", lowSol: "0.5", closeSol: "2", volume: "7" });
    expect(replay.candles?.[1]).toMatchObject({ openSol: "3", highSol: "7", lowSol: "2", closeSol: "6", volume: "3" });
  });

  it("uses market candles when the captured pool returns enough history", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response(JSON.stringify({ solana: { usd: 180 } }), { status: 200 });
      if (!url.includes("/ohlcv/")) return new Response(JSON.stringify({ data: { attributes: {
        base_token_price_native_currency: "2",
        market_cap_usd: "800000",
      } } }), { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
        [1_700_000_240, 2.4, 2.8, 2.3, 2.7, 10],
        [1_700_000_180, 2.0, 2.5, 1.9, 2.4, 10],
        [1_700_000_120, 1.5, 2.1, 1.4, 2.0, 10],
        [1_700_000_060, 1.0, 1.6, 0.9, 1.5, 10],
      ] } } }), { status: 200 });
    }));

    const spec = await createReplaySpec(episode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY", "1m");
    expect(spec.usdPerSol).toBe("180");
    expect(spec.candles).toHaveLength(4);
    expect(spec.candles?.[0]?.timestamp).toBe(1_700_000_060);
    expect(spec.candles?.at(-1)?.closeSol).toBe("2.7");
    expect(spec.points[0]?.pnlSol).toBe("-0.000005");
    expect(spec.points.at(-1)?.pnlSol).toBe("1.99999");
    expect(spec.marketCapMultiplier).toBe("400000");
    expect(requestedUrls.some((url) => url.includes("/ohlcv/minute?") && url.includes("aggregate=1") && url.includes("currency=token"))).toBe(true);
  });

  it("marks the position to market instead of showing the initial buy as a loss", () => {
    const points = buildMarkToMarketPoints(episode, [{
      timestamp: fills[0]!.timestamp,
      openSol: "1",
      highSol: "1",
      lowSol: "1",
      closeSol: "1",
      volume: "10",
    }]);
    expect(Number(points[0]?.pnlSol)).toBeCloseTo(-0.000005, 9);
  });

  it("chooses hourly candles for a multi-day trade so the entry is not truncated", async () => {
    const longEpisode: TradeEpisode = {
      ...episode,
      fills: [fills[0]!, { ...fills[1]!, timestamp: fills[0]!.timestamp + 5 * 86_400 }],
      endTimestamp: fills[0]!.timestamp + 5 * 86_400,
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [] } } }), { status: 200 });
    }));
    await createReplaySpec(longEpisode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY");
    expect(requestedUrls.some((url) => url.includes("/ohlcv/hour?") && url.includes("aggregate=1"))).toBe(true);
  });

  it("chooses five-second candles for a ten-minute trade", async () => {
    const mediumEpisode: TradeEpisode = {
      ...episode,
      fills: [fills[0]!, { ...fills[1]!, timestamp: fills[0]!.timestamp + 10 * 60 }],
      endTimestamp: fills[0]!.timestamp + 10 * 60,
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [] } } }), { status: 200 });
    }));
    await createReplaySpec(mediumEpisode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY");
    expect(requestedUrls.some((url) => url.includes("/ohlcv/second?") && url.includes("aggregate=1"))).toBe(true);
  });

  it("falls back to wallet fills when market history is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("simple/price")) return new Response("{}", { status: 200 });
      return new Response("not found", { status: 404 });
    }));

    const spec = await createReplaySpec(episode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY");
    expect(spec.points).toHaveLength(2);
    expect(spec.points.map((point) => point.priceSol)).toEqual(["1", "3"]);
  });
});
