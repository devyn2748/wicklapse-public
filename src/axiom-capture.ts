import Decimal from "decimal.js";
import type { ShareContext, TradeEpisode, TradeExecution, TradeFill } from "./domain";
import { buildTradeEpisodes } from "./episodes";

const TOKEN_DECIMALS = 9;
const TOKEN_SCALE = new Decimal(10).pow(TOKEN_DECIMALS);
const LAMPORTS = new Decimal(1_000_000_000);

export function parseAxiomAthMarketCap(text: string): string | null {
  const match = text.replace(/\s+/g, " ").match(/\bATH\b[^$0-9]{0,24}\$?\s*([0-9][0-9,.]*)([KMB])?\b/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  const scale = match[2]?.toUpperCase() === "B" ? 1_000_000_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "K" ? 1_000 : 1;
  const value = amount * scale;
  return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : null;
}

export function buildAxiomExecutionEpisodes(context: ShareContext): TradeEpisode[] {
  const tokenMint = context.tokenMint ?? context.pairAddress;
  if (!tokenMint || !context.tradeExecutions?.length) return [];

  const chronological = [...context.tradeExecutions]
    .sort((left, right) => left.timestamp - right.timestamp
      || (left.side === right.side ? 0 : left.side === "buy" ? -1 : 1)
      || left.signature.localeCompare(right.signature));
  const firstBuy = chronological.findIndex((execution) => execution.side === "buy");
  if (firstBuy < 0) return [];
  // A feed beginning with a sell is missing its acquisition cost. Replaying it
  // would fabricate the initial investment and P&L, so start at the first
  // complete episode whose acquisition is present.
  const completeExecutions = chronological.slice(firstBuy);
  let tokenPosition = new Decimal(0);
  const fills: TradeFill[] = completeExecutions.map((execution: TradeExecution) => {
    const tokenAmount = new Decimal(execution.tokenAmount);
    const quoteSol = new Decimal(execution.totalSol);
    tokenPosition = execution.side === "buy" ? tokenPosition.plus(tokenAmount) : tokenPosition.minus(tokenAmount);
    if (tokenPosition.isNegative()) tokenPosition = new Decimal(0);
    const rawPosition = tokenPosition.mul(TOKEN_SCALE).toDecimalPlaces(0).toFixed(0);
    const rawAmount = tokenAmount.mul(TOKEN_SCALE).toDecimalPlaces(0).toFixed(0);
    return {
      signature: execution.signature,
      slot: 0,
      timestamp: execution.timestamp,
      side: execution.side,
      tokenMint,
      tokenDecimals: TOKEN_DECIMALS,
      tokenAmountRaw: rawAmount,
      quoteLamports: quoteSol.mul(LAMPORTS).toDecimalPlaces(0).toFixed(0),
      networkFeeLamports: "0",
      walletPostTokenRaw: rawPosition,
      estimatedPriceSol: execution.priceSol,
      executionPriceUsd: execution.priceUsd,
      totalUsd: execution.totalUsd,
      wallet: execution.wallet,
      pairAddress: execution.pairAddress,
      source: "axiom",
      chainId: execution.chainId ?? "solana",
      providerTradeId: execution.providerTradeId,
      quoteCurrency: execution.quoteCurrency ?? "SOL",
      quoteScale: execution.quoteScale ?? LAMPORTS.toFixed(0),
    };
  });

  return buildTradeEpisodes(fills, context).map((episode) => ({
    ...episode,
    endTimestamp: episode.status === "open"
      ? Math.max(episode.endTimestamp, context.capturedAt / 1_000)
      : episode.endTimestamp,
    matchLabel: "Axiom capture",
  }));
}
