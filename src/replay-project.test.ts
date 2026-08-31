import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShareContext, TradeEpisode, TradeFill } from "./domain";
import { buildMarkToMarketPoints, calculateReplayTimeWindow, createReplaySpec, geckoFallbackWarning, LatestReplayRequest, selectCandleRequest, selectFocusedFomoCandles } from "./replay-project";

const testTokenMint = "3".repeat(44);

const fills: TradeFill[] = [
  {
    signature: "buy-signature",
    slot: 1,
    timestamp: 1_700_000_000,
    side: "buy",
    tokenMint: testTokenMint,
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
    tokenMint: testTokenMint,
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
  athMarketCapUsd: "34500000",
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
  it("maps requested video lead and tail seconds onto real market history", () => {
    const window = calculateReplayTimeWindow(episode, { duration: 10, leadSeconds: 3, trailSeconds: 3 });
    expect(window?.fromSeconds).toBe(episode.startTimestamp - 225);
    expect(window?.toSeconds).toBe(episode.endTimestamp + 225);
    expect((episode.startTimestamp - window!.fromSeconds) / (window!.toSeconds - window!.fromSeconds)).toBeCloseTo(0.3, 8);
    expect((episode.endTimestamp - window!.fromSeconds) / (window!.toSeconds - window!.fromSeconds)).toBeCloseTo(0.7, 8);
  });

  it("rejects video margins that leave no meaningful trade playback", () => {
    expect(() => calculateReplayTimeWindow(episode, { duration: 6, leadSeconds: 3, trailSeconds: 3 }))
      .toThrow("leave at least 0.25 seconds");
  });

  it("keeps auto charts readable and honors supported candle overrides", () => {
    expect(selectCandleRequest(120, "auto").interval).toBe(1);
    expect(selectCandleRequest(10 * 60, "auto").interval).toBe(5);
    expect(selectCandleRequest(30 * 60, "auto").interval).toBe(15);
    expect(selectCandleRequest(300, "5s").interval).toBe(5);
    expect(selectCandleRequest(3_600, "1m").interval).toBe(60);
  });

  it("never falls back to Fomo's complete UI chart range", () => {
    const candle = (timestamp: number) => ({ timestamp, openSol: "1", highSol: "2", lowSol: "0.5", closeSol: "1", volume: "1" });
    const allRange = [candle(100), candle(200), candle(300), candle(400), candle(500), candle(600), candle(700)];
    expect(selectFocusedFomoCandles(allRange, 390, 410).map((item) => item.timestamp)).toEqual([200, 300, 400, 500]);
    expect(selectFocusedFomoCandles(allRange, 190, 510).map((item) => item.timestamp)).toEqual([200, 300, 400, 500]);
  });

  it("safely coarsens an override that would truncate a long position", () => {
    expect(selectCandleRequest(2 * 3_600, "1s").interval).toBeGreaterThanOrEqual(8);
  });

  it("builds requested five-second candles from supported one-second OHLCV", async () => {
    const shortEpisode = { ...episode, endTimestamp: episode.startTimestamp + 200 };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (!url.includes("/ohlcv/")) return new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 });
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [episode.startTimestamp + 6, 4, 7, 3, 6, 2],
              [episode.startTimestamp + 5, 3, 5, 2, 4, 1],
              [episode.startTimestamp + 1, 1, 3, 0.5, 2, 4],
              [episode.startTimestamp, 1, 2, 0.8, 1, 3],
            ]
          }
        }
      }), { status: 200 });
    }));
    const replay = await createReplaySpec(shortEpisode, context, context.walletAddress ?? "", "5s");
    expect(replay.candleIntervalSeconds).toBe(5);
    expect(replay.athMarketCapUsd).toBe("34500000");
    expect(replay.candles).toHaveLength(2);
    expect(replay.candles?.[0]).toMatchObject({ openSol: "1", highSol: "3", lowSol: "0.5", closeSol: "2", volume: "7" });
    expect(replay.candles?.[1]).toMatchObject({ openSol: "3", highSol: "7", lowSol: "2", closeSol: "6", volume: "3" });
  });

  it("retries at a coarser interval when the preferred OHLCV is sparse", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (!url.includes("/ohlcv/")) return new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 });
      const rows = url.includes("aggregate=15") ? [
        [episode.startTimestamp + 30, 2, 3, 1.5, 2.5, 4],
        [episode.startTimestamp + 15, 1, 2.2, 0.8, 2, 3],
      ] : [];
      return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: rows } } }), { status: 200 });
    }));
    const replay = await createReplaySpec(episode, context, context.walletAddress ?? "", "1s");
    expect(replay.marketDataSource).toBe("gecko");
    expect(replay.candleIntervalSeconds).toBe(15);
    expect(requestedUrls.some((url) => url.includes("aggregate=1"))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("aggregate=15"))).toBe(true);
  });

  it("uses market candles when the captured pool returns enough history", async () => {
    const hourEpisode = {
      ...episode,
      fills: [fills[0]!, { ...fills[1]!, timestamp: fills[0]!.timestamp + 3_600 }],
      endTimestamp: fills[0]!.timestamp + 3_600,
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response(JSON.stringify({ solana: { usd: 180 } }), { status: 200 });
      if (!url.includes("/ohlcv/")) return new Response(JSON.stringify({
        data: {
          attributes: {
            base_token_price_native_currency: "2",
            market_cap_usd: "800000",
          }
        }
      }), { status: 200 });
      return new Response(JSON.stringify({
        data: {
          attributes: {
            ohlcv_list: [
              [1_700_000_240, 2.4, 2.8, 2.3, 2.7, 10],
              [1_700_000_180, 2.0, 2.5, 1.9, 2.4, 10],
              [1_700_000_120, 1.5, 2.1, 1.4, 2.0, 10],
              [1_700_000_060, 1.0, 1.6, 0.9, 1.5, 10],
            ]
          }
        }
      }), { status: 200 });
    }));

    const spec = await createReplaySpec(hourEpisode, context, "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY", "1m");
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
    expect(geckoFallbackWarning(spec)).toContain("execution points only");
  });

  it("resolves a Base token pool before using chain-specific GeckoTerminal candles", async () => {
    const tokenAddress = "0x1111111111111111111111111111111111111111";
    const poolAddress = "0x2222222222222222222222222222222222222222";
    const baseContext: ShareContext = {
      ...context,
      provider: "fomo",
      chainId: "base",
      tokenMint: tokenAddress,
      pairAddress: tokenAddress,
    };
    const baseEpisode: TradeEpisode = {
      ...episode,
      tokenMint: tokenAddress,
      quoteCurrency: "USD",
      quoteScale: "1000000",
      fills: episode.fills.map((fill) => ({
        ...fill,
        tokenMint: tokenAddress,
        source: "fomo" as const,
        chainId: "base",
        quoteCurrency: "USD" as const,
        quoteScale: "1000000",
      })),
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (url.includes(`/tokens/${tokenAddress}/pools`)) return new Response(JSON.stringify({ data: [{
        id: `base_${poolAddress}`,
        attributes: { address: poolAddress, reserve_in_usd: "250000" },
      }] }), { status: 200 });
      if (url.includes(`/networks/base/pools/${poolAddress}/ohlcv/`)) return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
        [episode.startTimestamp + 240, 2, 3, 1.8, 2.8, 4],
        [episode.startTimestamp + 120, 1, 2.2, 0.8, 2, 3],
      ] } } }), { status: 200 });
      return new Response("not found", { status: 404 });
    }));

    const spec = await createReplaySpec(baseEpisode, baseContext, "", "auto");
    expect(spec.marketDataSource).toBe("gecko");
    expect(geckoFallbackWarning(spec)).toContain("fallback candles");
    expect(requestedUrls.some((url) => url.includes(`/networks/base/tokens/${tokenAddress}/pools`))).toBe(true);
    expect(requestedUrls.some((url) => url.includes(`/networks/base/pools/${poolAddress}/ohlcv/`))).toBe(true);
    expect(requestedUrls.some((url) => url.includes("/networks/solana/"))).toBe(false);
  });

  it("retries a transient GeckoTerminal candle failure before using execution points", async () => {
    const tokenAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const poolAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const retryStatuses: string[] = [];
    let candleAttempts = 0;
    const baseContext: ShareContext = {
      ...context,
      provider: "fomo",
      chainId: "base",
      tokenMint: tokenAddress,
      pairAddress: tokenAddress,
    };
    const baseEpisode: TradeEpisode = {
      ...episode,
      tokenMint: tokenAddress,
      quoteCurrency: "USD",
      quoteScale: "1000000",
      fills: episode.fills.map((fill) => ({
        ...fill,
        tokenMint: tokenAddress,
        source: "fomo" as const,
        chainId: "base",
        quoteCurrency: "USD" as const,
        quoteScale: "1000000",
      })),
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (url.includes(`/tokens/${tokenAddress}/pools`)) return new Response(JSON.stringify({ data: [{
        id: `base_${poolAddress}`,
        attributes: { address: poolAddress, reserve_in_usd: "250000" },
      }] }), { status: 200 });
      if (url.includes(`/networks/base/pools/${poolAddress}/ohlcv/`)) {
        candleAttempts += 1;
        if (candleAttempts === 1) return new Response("temporarily unavailable", { status: 503 });
        return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
          [episode.startTimestamp + 240, 2, 3, 1.8, 2.8, 4],
          [episode.startTimestamp + 120, 1, 2.2, 0.8, 2, 3],
        ] } } }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));

    const spec = await createReplaySpec(baseEpisode, baseContext, "", "auto", undefined, undefined, (message) => retryStatuses.push(message));
    expect(spec.marketDataSource).toBe("gecko");
    expect(candleAttempts).toBe(2);
    expect(retryStatuses).toContain("Loading fallback candles — retrying (2/3)…");
  });
});

describe("Axiom candle waterfall and cancellation", () => {
  const axiomEpisode: TradeEpisode = {
    ...episode,
    fills: episode.fills.map((fill) => ({ ...fill, source: "axiom" as const })),
  };

  it("uses pair-chart-v3 before GeckoTerminal for an Axiom-captured trade", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("pair-chart-v3")) return new Response(JSON.stringify({ bars: [
        [(episode.startTimestamp - 1) * 1_000, 1, 1.2, 0.9, 1.1, 2],
        [(episode.startTimestamp + 60) * 1_000, 1.1, 1.5, 1, 1.4, 3],
        [(episode.startTimestamp + 120) * 1_000, 1.4, 2, 1.3, 1.9, 4],
      ] }), { status: 200 });
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 });
    }));

    const spec = await createReplaySpec(axiomEpisode, context, "", "auto");
    expect(spec.marketDataSource).toBe("axiom");
    expect(spec.candles?.length).toBeGreaterThan(2);
    expect(requestedUrls.some((url) => url.includes("api.geckoterminal.com") && url.includes("/ohlcv/"))).toBe(false);
  });

  it("falls back from Axiom to GeckoTerminal before using execution points", async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("pair-chart-v3")) return new Response("unavailable", { status: 503 });
      if (url.includes("simple/price")) return new Response("{}", { status: 200 });
      if (url.includes("/ohlcv/")) return new Response(JSON.stringify({ data: { attributes: { ohlcv_list: [
        [episode.startTimestamp + 240, 2, 3, 1.8, 2.8, 4],
        [episode.startTimestamp + 120, 1, 2.2, 0.8, 2, 3],
      ] } } }), { status: 200 });
      return new Response(JSON.stringify({ data: { attributes: {} } }), { status: 200 });
    }));

    const spec = await createReplaySpec(axiomEpisode, context, "", "auto");
    expect(spec.marketDataSource).toBe("gecko");
    expect(requestedUrls.findIndex((url) => url.includes("pair-chart-v3")))
      .toBeLessThan(requestedUrls.findIndex((url) => url.includes("/ohlcv/")));
  });

  it("uses the execution path only after both candle providers fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("simple/price")) return new Response("{}", { status: 200 });
      return new Response("unavailable", { status: 503 });
    }));
    const spec = await createReplaySpec(axiomEpisode, context, "", "auto");
    expect(spec.marketDataSource).toBe("fills");
    expect(spec.candles).toBeUndefined();
    expect(spec.points.map((point) => point.priceSol)).toEqual(["1", "3"]);
  });

  it("aborts in-flight replay fetches and rejects stale requests", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const pending = createReplaySpec(axiomEpisode, context, "", "auto", controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });

    const requests = new LatestReplayRequest();
    const first = requests.begin();
    const second = requests.begin();
    expect(first.signal.aborted).toBe(true);
    expect(requests.isLatest(first.id)).toBe(false);
    expect(requests.isLatest(second.id)).toBe(true);
  });
});
