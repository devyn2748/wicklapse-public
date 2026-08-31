import { describe, expect, it } from "vitest";
import { buildFomoExecutionEpisodes } from "./fomo-capture";
import { fomoCandleCaptureMatches, fomoHandleFromUrl, fomoTradeIdFromUrl, focusedFomoCandleUrl, parseFomoCandles, parseFomoTradeResponse, selectFomoCandlesForTrade } from "./fomo-api";
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
        networkId: 8453,
        symbol: "CLEAR",
        name: "Clear Token",
        token: { address: tokenAddress, decimals: 18, networkId: 8453, info: { imageThumbUrl: "https://example.com/clear.png" } },
      },
    },
    swaps: [
      {
        id: "buy-swap",
        createdAt: "2026-08-28T16:00:00.000Z",
        inTokenAddress: "0x0000000000000000000000000000000000000000",
        outTokenAddress: tokenAddress,
        inNetworkId: 1399811149,
        outNetworkId: 8453,
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
        inNetworkId: 8453,
        outNetworkId: 1399811149,
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
      chainId: "8453",
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

  it("uses priced Fomo withdrawals as the closing execution for sent positions", () => {
    const transferPayload = structuredClone(payload) as typeof payload & { responseObject: { transfers: Array<Record<string, unknown>> } };
    transferPayload.responseObject.swaps = transferPayload.responseObject.swaps.slice(0, 1);
    transferPayload.responseObject.transfers = [{
      id: "withdrawal-exit",
      type: "WITHDRAWAL",
      createdAt: "2026-08-28T16:05:00.000Z",
      tokenAddress,
      networkId: 8453,
      humanAmount: 1_000,
      usdAmount: 125,
      fromTradeId: tradeId,
      toTradeId: null,
    }];
    const context = parseFomoTradeResponse(transferPayload, { tradeId, pageUrl })!;
    expect(context.providerClosedAt).toBe(Date.parse("2026-08-28T16:05:00.000Z") / 1_000);
    expect(context.tradeExecutions).toMatchObject([
      { signature: "buy-swap", side: "buy", totalUsd: "100" },
      { signature: "withdrawal-exit", side: "sell", tokenAmount: "1000", totalUsd: "125" },
    ]);
    expect(buildFomoExecutionEpisodes(context)[0]).toMatchObject({
      status: "closed",
      remainingTokenRaw: "0",
      approximatePnlLamports: "25000000",
      endTimestamp: Date.parse("2026-08-28T16:05:00.000Z") / 1_000,
    });
  });

  it("ends a provider-closed trade at Fomo's close time when no priced exit is returned", () => {
    const incompletePayload = structuredClone(payload);
    incompletePayload.responseObject.swaps = incompletePayload.responseObject.swaps.slice(0, 1);
    const context = parseFomoTradeResponse(incompletePayload, { tradeId, pageUrl, capturedAt: Date.parse("2026-08-31T00:00:00.000Z") })!;
    const episode = buildFomoExecutionEpisodes(context)[0]!;
    expect(episode.status).toBe("closed");
    expect(episode.remainingTokenRaw).toBe("0");
    expect(episode.endTimestamp).toBe(Date.parse("2026-08-28T16:05:00.000Z") / 1_000);
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

  it("builds an automatic trade-scoped candle request from Fomo's session request", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    const focused = focusedFomoCandleUrl(
      `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=1d&usd=true&from=1&to=2&amount=10`,
      context.tradeExecutions!,
    );
    const url = new URL(focused!);
    expect(url.searchParams.get("address")).toBe(tokenAddress);
    expect(url.searchParams.get("chainId")).toBe("evm:8453");
    expect(url.searchParams.get("period")).toBe("5s");
    expect(url.searchParams.get("amount")).toBe("1000");
    expect(Number(url.searchParams.get("from"))).toBeLessThan(Date.parse("2026-08-28T16:00:00.000Z"));
    expect(Number(url.searchParams.get("to"))).toBeGreaterThan(Date.parse("2026-08-28T16:05:00.000Z"));
  });

  it("matches candle captures by token and chain instead of token alone", () => {
    const baseCapture = {
      url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=1m`,
    };
    expect(fomoCandleCaptureMatches(baseCapture, tokenAddress, "base")).toBe(true);
    expect(fomoCandleCaptureMatches(baseCapture, tokenAddress, "ethereum")).toBe(false);
    expect(fomoCandleCaptureMatches({
      url: "https://prod-api.fomo.family/proxy/getBarsNew",
      requestBody: { tokenAddress, networkId: "base" },
    }, tokenAddress, "evm:8453")).toBe(true);
  });

  it("rejects a focused request when the captured chart belongs to another chain", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    expect(focusedFomoCandleUrl(
      `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A1&period=1m&from=1&to=2&amount=10`,
      context.tradeExecutions!,
    )).toBeNull();
  });

  it("rejects responses that do not contain the requested trade", () => {
    expect(parseFomoTradeResponse({ responseObject: { trade: { id: "different" }, swaps: [] } }, { tradeId, pageUrl })).toBeNull();
  });

  it("does not mix executions from a second trade on the same token", () => {
    const otherTradeId = "other-trade-id";
    const mixedPayload = structuredClone(payload) as typeof payload & { responseObject: { swaps: Array<Record<string, unknown>> } };
    mixedPayload.responseObject.swaps.push({
      ...mixedPayload.responseObject.swaps[1],
      id: "other-sell",
      inTradeId: otherTradeId,
      createdAt: "2026-08-28T16:10:00.000Z",
    });
    const context = parseFomoTradeResponse(mixedPayload, { tradeId, pageUrl })!;
    expect(context.tradeExecutions?.map((execution) => execution.signature)).toEqual(["buy-swap", "sell-swap"]);
  });

  it("combines a nearby same-token Fomo trade from the profile swap feed", () => {
    const otherTradeId = "nearby-trade-id";
    const relatedPayload = { responseObject: { swaps: [
      {
        id: "nearby-buy",
        createdAt: "2026-08-28T16:10:00.000Z",
        inTokenAddress: "0x0000000000000000000000000000000000000000",
        outTokenAddress: tokenAddress,
        inNetworkId: 1399811149,
        outNetworkId: 8453,
        outTradeId: otherTradeId,
        inHumanAmount: 50,
        outHumanAmount: 500,
        humanUsdAmountIn: 50,
      },
      {
        id: "nearby-sell",
        createdAt: "2026-08-28T16:15:00.000Z",
        inTokenAddress: tokenAddress,
        outTokenAddress: "0x0000000000000000000000000000000000000000",
        inNetworkId: 8453,
        outNetworkId: 1399811149,
        inTradeId: otherTradeId,
        inHumanAmount: 500,
        outHumanAmount: 60,
        humanUsdAmountOut: 60,
      },
      {
        id: "dust-buy",
        createdAt: "2026-08-28T16:16:00.000Z",
        inTokenAddress: "0x0000000000000000000000000000000000000000",
        outTokenAddress: tokenAddress,
        inNetworkId: 1399811149,
        outNetworkId: 8453,
        outTradeId: "open-dust-trade",
        inHumanAmount: 1.9,
        outHumanAmount: 19,
        humanUsdAmountIn: 1.9,
      },
    ] } };
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl, relatedPayloads: [relatedPayload] })!;
    expect(new Set(context.tradeExecutions?.map((execution) => execution.providerTradeId))).toEqual(new Set([tradeId, otherTradeId]));
    expect(context.primaryTradeExecutions).toHaveLength(2);
    const episodes = buildFomoExecutionEpisodes(context);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      status: "closed",
      totalBoughtLamports: "150000000",
      totalSoldLamports: "185000000",
      approximatePnlLamports: "35000000",
    });
    expect(episodes[0]?.fills).toHaveLength(4);
  });

  it("rejects same-token candles captured for a different trade window", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    const capture = (capturedAt: number, timestamps: number[]) => ({
      url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=5s&from=1&to=2&amount=1000`,
      capturedAt,
      payload: { data: timestamps.map((timestamp) => [timestamp, 1, 2, 0.5, 1.5, 10]) },
    });
    const tradeStart = Date.parse("2026-08-28T16:00:00.000Z") / 1_000;
    const correct = capture(1, [tradeStart, tradeStart + 240, tradeStart + 300]);
    const newerWrongTrade = capture(2, [tradeStart + 3_600, tradeStart + 3_660]);
    expect(selectFomoCandlesForTrade([correct, newerWrongTrade], context.tradeExecutions!, tokenAddress, "base"))
      .toHaveLength(3);
    expect(selectFomoCandlesForTrade([newerWrongTrade], context.tradeExecutions!, tokenAddress, "base"))
      .toEqual([]);
  });

  it("accepts a bounded sparse response whose first candle follows the first execution", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    const start = Date.parse("2026-08-28T16:00:00.000Z") / 1_000;
    const sparseCapture = {
      url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=30s&from=${(start - 60) * 1_000}&to=${(start + 360) * 1_000}&amount=1000`,
      capturedAt: 1,
      payload: { data: [
        { t: (start + 97) * 1_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
        { t: (start + 240) * 1_000, o: 1.5, h: 2, l: 1, c: 1.8, v: 10 },
        { t: (start + 300) * 1_000, o: 1.8, h: 2.1, l: 1.7, c: 2, v: 10 },
      ] },
    };
    expect(selectFomoCandlesForTrade([sparseCapture], context.tradeExecutions!, tokenAddress, "base"))
      .toHaveLength(3);
  });

  it("keeps candles after the last fill when an open-position end is supplied", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    const start = Date.parse("2026-08-28T16:00:00.000Z") / 1_000;
    const end = Date.parse("2026-08-28T16:05:00.000Z") / 1_000;
    const capture = {
      url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=1m&from=1&to=2&amount=1000`,
      capturedAt: 1,
      payload: { data: [
        [start, 1, 2, 0.5, 1.5, 10],
        [end, 1.5, 2, 1, 1.8, 10],
        [end + 1_800, 1.8, 2.2, 1.6, 2.1, 10],
        [end + 3_600, 2.1, 2.4, 2, 2.3, 10],
      ] },
    };
    // Without an open end the tail past the last fill is trimmed.
    expect(selectFomoCandlesForTrade([capture], context.tradeExecutions!, tokenAddress, "base"))
      .toHaveLength(2);
    // With the open end, the tail candles survive for "P&L to date".
    expect(selectFomoCandlesForTrade([capture], context.tradeExecutions!, tokenAddress, "base", end + 3_600))
      .toHaveLength(4);
  });

  it("rejects a partial candle capture that covers only one of two combined trades", () => {
    const context = parseFomoTradeResponse(payload, { tradeId, pageUrl })!;
    const start = Date.parse("2026-08-28T16:00:00.000Z") / 1_000;
    const combinedExecutions = [
      ...context.tradeExecutions!,
      { ...context.tradeExecutions![0]!, timestamp: start + 3_000, signature: "later-buy", providerTradeId: "later-trade" },
      { ...context.tradeExecutions![1]!, timestamp: start + 3_300, signature: "later-sell", providerTradeId: "later-trade" },
    ];
    const firstTradeOnly = {
      url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${tokenAddress}&chainId=evm%3A8453&period=1m&from=1&to=2&amount=1000`,
      capturedAt: 1,
      payload: { data: [
        [start, 1, 2, 0.5, 1.5, 10],
        [start + 300, 1.5, 2, 1, 1.8, 10],
      ] },
    };
    expect(selectFomoCandlesForTrade([firstTradeOnly], combinedExecutions, tokenAddress, "base")).toEqual([]);
  });
});
