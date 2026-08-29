import { describe, expect, it } from "vitest";
import { buildFomoExecutionEpisodes } from "./fomo-capture";
import { fomoHandleFromUrl, fomoTradeIdFromUrl, parseFomoCandles, parseFomoTradeResponse } from "./fomo-api";
import { buildReplayPoints } from "./episodes";

const tradeId = "0244bb85-1d2e-444e-ba64-a532a7ccaccc";
const tokenAddress = "0x1111111111111111111111111111111111111111";
const pageUrl = `https://fomo.family/profile/ClearThaWorld?tradeId=${tradeId}`;

const payload = {
  success: true,
  responseObject: {
    trade: {
      id: tradeId,
      userId: "fomo-user-1",
      tokenAddress,
      createdAt: "2026-08-28T16:00:00.000Z",
      closedAt: "2026-08-28T16:05:00.000Z",
      tokenMetadata: {
        networkId: "base",
        symbol: "CLEAR",
        name: "Clear Token",
        token: { address: tokenAddress, decimals: 18, networkId: "base", info: { imageThumbUrl: "https://example.com/clear.png" } },
      },
    },
    swaps: [
      {
        id: "buy-swap",
        createdAt: "2026-08-28T16:00:00.000Z",
        inTokenAddress: "0x0000000000000000000000000000000000000000",
        outTokenAddress: tokenAddress,
        inNetworkId: "base",
        outNetworkId: "base",
        outTradeId: tradeId,
        inHumanAmount: 100,
        outHumanAmount: 1_000,
        humanUsdAmountIn: 100,
      },
      {
        id: "sell-swap",
        createdAt: "2026-08-28T16:05:00.000Z",
        inTokenAddress: tokenAddress,
        outTokenAddress: "0x0000000000000000000000000000000000000000",
        inNetworkId: "base",
        outNetworkId: "base",
        inTradeId: tradeId,
        inHumanAmount: 1_000,
        outHumanAmount: 125,
        humanUsdAmountOut: 125,
      },
    ],
  },
};

describe("Fomo capture", () => {
  it("extracts the profile handle and exact trade id from a Fomo URL", () => {
    expect(fomoHandleFromUrl(pageUrl)).toBe("ClearThaWorld");
    expect(fomoTradeIdFromUrl(pageUrl)).toBe(tradeId);
  });

  it("normalizes authenticated Fomo swaps into provider-neutral executions", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl, capturedAt: 1_777_000_000_000 });
    expect(context).toMatchObject({
      provider: "fomo",
      chainId: "base",
      providerTradeId: tradeId,
      profileHandle: "ClearThaWorld",
      tokenMint: tokenAddress,
      symbol: "CLEAR",
      positionStatus: "closed",
    });
    expect(context?.tradeExecutions).toMatchObject([
      { side: "buy", tokenAmount: "1000", totalUsd: "100", priceUsd: "0.1", source: "fomo", quoteCurrency: "USD" },
      { side: "sell", tokenAmount: "1000", totalUsd: "125", priceUsd: "0.125", source: "fomo", quoteCurrency: "USD" },
    ]);
    const episodes = buildFomoExecutionEpisodes(context!);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      status: "closed",
      quoteCurrency: "USD",
      quoteScale: "1000000",
      approximatePnlLamports: "25000000",
      matchLabel: "Fomo capture",
      matchScore: 100,
    });
    expect(buildReplayPoints(episodes[0]!).at(-1)?.pnlSol).toBe("25");
  });

  it("normalizes Fomo chart arrays without accepting invalid bars", () => {
    expect(parseFomoCandles({ responseObject: {
      t: [1_777_000_000, 1_777_000_001, 1_777_000_002],
      o: [0.1, 0.11, 0], h: [0.12, 0.13, 0.2], l: [0.09, 0.1, 0.1], c: [0.11, 0.12, 0.15], volume: [10, 20, 30],
    } })).toEqual([
      { timestamp: 1_777_000_000, openSol: "0.1", highSol: "0.12", lowSol: "0.09", closeSol: "0.11", volume: "10" },
      { timestamp: 1_777_000_001, openSol: "0.11", highSol: "0.13", lowSol: "0.1", closeSol: "0.12", volume: "20" },
    ]);
    expect(parseFomoCandles({ data: [
      [1_777_000_000_000, 0.1, 0.12, 0.09, 0.11, 10],
      { time: 1_777_000_001_000, open: 0.11, high: 0.13, low: 0.1, close: 0.12, volume: 20 },
    ] })).toEqual([
      { timestamp: 1_777_000_000, openSol: "0.1", highSol: "0.12", lowSol: "0.09", closeSol: "0.11", volume: "10" },
      { timestamp: 1_777_000_001, openSol: "0.11", highSol: "0.13", lowSol: "0.1", closeSol: "0.12", volume: "20" },
    ]);
  });

  it("rejects responses that do not contain the requested trade", () => {
    expect(parseFomoTradeResponse({ responseObject: { trade: { id: "different" }, swaps: [] } }, { tradeId, pageUrl })).toBeNull();
  });
});
