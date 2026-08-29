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
  return buildTradeEpisodes(fills, context).map((episode) => ({
    ...episode,
    endTimestamp: episode.status === "open" ? Math.max(episode.endTimestamp, context.capturedAt / 1_000) : episode.endTimestamp,
    matchScore: 100,
    matchLabel: "Fomo capture",
  }));
}
