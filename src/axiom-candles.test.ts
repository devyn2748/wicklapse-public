import { describe, expect, it, vi } from "vitest";
import type { ShareContext, TradeEpisode } from "./domain";
import {
  buildAxiomCandleRequest,
  fetchAxiomCandles,
  fillMissingCandleBuckets,
  parseAxiomCandles,
  selectAllowedIntervals,
  selectAxiomInterval,
} from "./axiom-candles";

const pairAddress = "4".repeat(44);
const tokenMint = "5".repeat(44);
const context: ShareContext = {
  id: "capture",
  capturedAt: 1_700_001_000_000,
  pageUrl: `https://axiom.trade/meme/${pairAddress}`,
  pairAddress,
  tokenMint,
  symbol: "TEST",
  tokenName: null,
  axiomChartUrl: `https://api2.axiom.trade/pair-chart-v3?pairAddress=${pairAddress}&openTrading=1699999000000&isMigrated=false&access_token=never-copy-this`,
  walletAddress: null,
  walletLabel: null,
  boughtSol: null,
  soldSol: null,
  holdingSol: null,
  pnlSol: null,
  roiPercent: null,
  positionStatus: "closed",
  sourceText: "",
};

function episode(duration: number): TradeEpisode {
  return {
    id: "episode",
    tokenMint,
    fills: [],
    startTimestamp: 1_700_000_000,
    endTimestamp: 1_700_000_000 + duration,
    status: "closed",
    totalBoughtLamports: "1",
    totalSoldLamports: "2",
    networkFeesLamports: "0",
    remainingTokenRaw: "0",
    tokenDecimals: 9,
    approximatePnlLamports: "1",
    matchScore: 100,
    matchLabel: "Axiom capture",
  };
}

describe("Axiom candle interval selection", () => {
  it("targets roughly 150 candles across short and multi-day trades", () => {
    expect(selectAxiomInterval(40)).toBe("1s");
    expect(selectAxiomInterval(10 * 60)).toBe("5s");
    expect(["15s", "30s"]).toContain(selectAxiomInterval(60 * 60));
    expect(["15m", "30m"]).toContain(selectAxiomInterval(3 * 86_400));
  });

  it("only exposes intervals producing a sensible candle count", () => {
    expect(selectAllowedIntervals(40)).toEqual(["1s"]);
    expect(selectAllowedIntervals(10 * 60)).toEqual(["5s", "15s"]);
    expect(selectAxiomInterval(40, "1m")).toBe("1s");
  });

  it("reuses the observed Axiom host and preserved token metadata", () => {
    const request = buildAxiomCandleRequest(context, episode(600), "auto")!;
    const url = new URL(request.url);
    expect(url.hostname).toBe("api2.axiom.trade");
    expect(url.searchParams.get("openTrading")).toBe("1699999000000");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.searchParams.get("pairAddress")).toBe(pairAddress);
    expect(url.searchParams.get("currency")).toBe("SOL");
    expect(url.searchParams.get("interval")).toBe("5s");
    expect(Number(url.searchParams.get("countBars"))).toBeGreaterThan(120);
  });
});

describe("Axiom candle parsing", () => {
  it("converts milliseconds to seconds and filters malformed or backfilled bars", () => {
    const parsed = parseAxiomCandles({ bars: [
      [999_000, 1, 2, 0.5, 1.5, 3],
      [1_000_000, 1, 2, 0.5, 1.5, 3],
      [1_005_000, 1.5, 1.2, 1.1, 1.3, 4],
      [1_006_000, "bad", 2, 1, 1.5, 3],
      [1_021_000, 1, 2, 0.5, 1.5, 3],
    ] }, 1_000, 1_020);
    expect(parsed.map((candle) => candle.timestamp)).toEqual([1_000, 1_005]);
    expect(parsed[1]).toMatchObject({ openSol: "1.5", highSol: "1.5", lowSol: "1.1", closeSol: "1.3" });
  });

  it("fills sparse timestamps without changing the requested interval", () => {
    const sparse = parseAxiomCandles({ bars: [
      [1_000_000, 1, 1, 1, 1, 2],
      [1_015_000, 2, 2, 2, 2, 3],
    ] }, 1_000, 1_020);
    const filled = fillMissingCandleBuckets(sparse, 5);
    expect(filled.map((candle) => candle.timestamp)).toEqual([1_000, 1_005, 1_010, 1_015]);
    expect(filled[1]).toMatchObject({ openSol: "1", closeSol: "1", volume: "0" });
  });

  it("fetches with credentials and returns the known request interval", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ bars: [
      [1_699_999_999_000, 1, 1.2, 0.9, 1.1, 2],
      [1_700_000_000_000, 1.1, 1.4, 1, 1.3, 3],
    ] }), { status: 200 }));
    const result = await fetchAxiomCandles(context, episode(40), "1s", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      fillMissing: false,
    });
    expect(result?.interval).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET", credentials: "include" });
  });
});
