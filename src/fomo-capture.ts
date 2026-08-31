import Decimal from "decimal.js";
import type { ShareContext, TradeEpisode, TradeFill } from "./domain";
import { buildTradeEpisodes } from "./episodes";

export function buildFomoExecutionEpisodes(context: ShareContext): TradeEpisode[] {
  const tokenMint = context.tokenMint ?? context.pairAddress;
  if (!tokenMint || !context.tradeExecutions?.length) return [];
  const chronological = [...context.tradeExecutions]
    .filter((execution) => execution.source === "fomo")
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  const firstBuy = chronological.findIndex((execution) => execution.side === "buy");
  if (firstBuy < 0) return [];
  let tokenPosition = new Decimal(0);
  const fills: TradeFill[] = chronological.slice(firstBuy).map((execution) => {
    const decimals = execution.tokenDecimals ?? 9;
    const tokenScale = new Decimal(10).pow(decimals);
    const quoteScale = new Decimal(execution.quoteScale ?? "1000000");
    const tokenAmount = new Decimal(execution.tokenAmount);
    const totalQuote = new Decimal(execution.totalUsd);
    tokenPosition = execution.side === "buy" ? tokenPosition.plus(tokenAmount) : Decimal.max(0, tokenPosition.minus(tokenAmount));
    return {
      signature: execution.signature,
      slot: 0,
      timestamp: execution.timestamp,
      side: execution.side,
      tokenMint,
      tokenDecimals: decimals,
      tokenAmountRaw: tokenAmount.mul(tokenScale).toDecimalPlaces(0).toFixed(0),
      quoteLamports: totalQuote.mul(quoteScale).toDecimalPlaces(0).toFixed(0),
      networkFeeLamports: "0",
      walletPostTokenRaw: tokenPosition.mul(tokenScale).toDecimalPlaces(0).toFixed(0),
      estimatedPriceSol: execution.priceUsd,
      executionPriceUsd: execution.priceUsd,
      totalUsd: execution.totalUsd,
      wallet: execution.wallet,
      pairAddress: execution.pairAddress,
      source: "fomo",
      chainId: execution.chainId,
      providerTradeId: execution.providerTradeId,
      quoteCurrency: "USD",
      quoteScale: quoteScale.toFixed(0),
    };
  });
  const builtEpisodes = buildTradeEpisodes(fills, context);
  const episodes = builtEpisodes.map((episode, index) => {
    const providerClosed = context.positionStatus === "closed" && index === builtEpisodes.length - 1;
    return {
      ...episode,
      endTimestamp: providerClosed
        ? Math.max(episode.endTimestamp, context.providerClosedAt ?? episode.endTimestamp)
        : episode.status === "open" ? Math.max(episode.endTimestamp, context.capturedAt / 1_000) : episode.endTimestamp,
      status: providerClosed ? "closed" as const : episode.status,
      remainingTokenRaw: providerClosed ? "0" : episode.remainingTokenRaw,
      matchScore: 100,
      matchLabel: "Fomo capture" as const,
    };
  });
  const providerTradeIds = new Set(chronological.map((execution) => execution.providerTradeId).filter(Boolean));
  if (providerTradeIds.size <= 1 || episodes.length <= 1) return episodes;
  const allFills = episodes.flatMap((episode) => episode.fills)
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  const quoteScale = new Decimal(allFills[0]!.quoteScale ?? "1000000");
  const bought = allFills.filter((fill) => fill.side === "buy").reduce((total, fill) => total.plus(fill.quoteLamports), new Decimal(0));
  const sold = allFills.filter((fill) => fill.side === "sell").reduce((total, fill) => total.plus(fill.quoteLamports), new Decimal(0));
  const fees = allFills.reduce((total, fill) => total.plus(fill.networkFeeLamports), new Decimal(0));
  const last = allFills.at(-1)!;
  const providerClosed = context.positionStatus === "closed";
  return [{
    id: `fomo-combined-${context.providerTradeId ?? allFills[0]!.signature.slice(0, 12)}`,
    tokenMint,
    fills: allFills,
    startTimestamp: allFills[0]!.timestamp,
    endTimestamp: providerClosed
      ? Math.max(last.timestamp, context.providerClosedAt ?? last.timestamp)
      : last.walletPostTokenRaw === "0" ? last.timestamp : Math.max(last.timestamp, context.capturedAt / 1_000),
    status: providerClosed || last.walletPostTokenRaw === "0" ? "closed" : "open",
    totalBoughtLamports: bought.toFixed(0),
    totalSoldLamports: sold.toFixed(0),
    networkFeesLamports: fees.toFixed(0),
    remainingTokenRaw: providerClosed ? "0" : last.walletPostTokenRaw,
    tokenDecimals: last.tokenDecimals,
    approximatePnlLamports: sold.minus(bought).minus(fees).toFixed(0),
    quoteCurrency: allFills[0]!.quoteCurrency ?? "USD",
    quoteScale: quoteScale.toFixed(0),
    matchScore: 100,
    matchLabel: "Fomo capture",
  }];
}
