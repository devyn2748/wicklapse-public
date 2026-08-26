import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShareContext, TradeEpisode, TradeFill } from "./domain";
import { buildMarkToMarketPoints, createReplaySpec } from "./replay-project";

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
  it("uses market candles when the captured pool returns enough history", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response(JSON.stringify({ solana: { usd: 180 } }), { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
        [1_700_000_240, 2.4, 2.8, 2.3, 2.7, 10],
        [1_700_000_180, 2.0, 2.5, 1.9, 2.4, 10],
        [1_700_000_120, 1.5, 2.1, 1.4, 2.0, 10],
        [1_700_000_060, 1.0, 1.6, 0.9, 1.5, 10],
      ] } } }), { status: 200 });
    }));

    const spec = await createReplaySpec(episode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY");
    expect(spec.usdPerSol).toBe("180");
    expect(spec.candles).toHaveLength(4);
    expect(spec.candles?.[0]?.timestamp).toBe(1_700_000_060);
    expect(spec.candles?.at(-1)?.closeSol).toBe("2.7");
    expect(spec.points[0]?.pnlSol).toBe("-0.000005");
    expect(spec.points.at(-1)?.pnlSol).toBe("1.99999");
    expect(requestedUrls.some((url) => url.includes("/ohlcv/minute?") && url.includes("currency=token"))).toBe(true);
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
