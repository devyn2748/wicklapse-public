import Decimal from "decimal.js";
import type { ShareContext, TradeEpisode, TradeExecution, TradeFill } from "./domain";
import { buildTradeEpisodes } from "./episodes";

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const SUFFIX_MULTIPLIERS: Record<string, Decimal> = {
  K: new Decimal(1_000),
  M: new Decimal(1_000_000),
  B: new Decimal(1_000_000_000),
  T: new Decimal(1_000_000_000_000),
};
const TOKEN_DECIMALS = 9;
const TOKEN_SCALE = new Decimal(10).pow(TOKEN_DECIMALS);
const LAMPORTS = new Decimal(1_000_000_000);

export function normalizeAxiomNumber(input: string): string | null {
  const cleaned = input
    .trim()
    .toUpperCase()
    .replaceAll(",", "")
    .replace(/[$€£¥Ξ]/g, "")
    .replace(/\s+/g, "");
  if (!cleaned) return null;

  const compactZero = cleaned.match(/^([+-]?)0\.0([₀-₉]+)(\d+(?:\.\d+)?)([KMBT])?$/);
  let normalized = cleaned;
  if (compactZero) {
    const zeroCount = Number([...compactZero[2]!].map((digit) => SUBSCRIPT_DIGITS[digit] ?? "").join(""));
    if (!Number.isInteger(zeroCount) || zeroCount < 1 || zeroCount > 30) return null;
    normalized = `${compactZero[1]}0.${"0".repeat(zeroCount)}${compactZero[3]}${compactZero[4] ?? ""}`;
  }

  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([KMBT])?$/);
  if (!match?.[1]) return null;
  try {
    const value = new Decimal(match[1]).mul(match[2] ? SUFFIX_MULTIPLIERS[match[2]]! : 1);
    if (!value.isFinite()) return null;
    return value.toFixed();
  } catch {
    return null;
  }
}

export function ageToSeconds(age: string | null): number | null {
  if (!age) return null;
  const match = age.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w|mo|y)$/);
  if (!match?.[1] || !match[2]) return null;
  const unitSeconds: Record<string, number> = {
    s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800, mo: 2_592_000, y: 31_536_000,
  };
  return Math.round(Number(match[1]) * unitSeconds[match[2]]!);
}

export function buildAxiomExecutionEpisodes(context: ShareContext): TradeEpisode[] {
  const tokenMint = context.tokenMint ?? context.pairAddress;
  if (!tokenMint || !context.tradeExecutions?.length) return [];

  const chronological = [...context.tradeExecutions]
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  let lastTimestamp = 0;
  let tokenPosition = new Decimal(0);
  const fills: TradeFill[] = chronological.map((execution: TradeExecution) => {
    const tokenAmount = new Decimal(execution.tokenAmount);
    const quoteSol = new Decimal(execution.totalSol);
    tokenPosition = execution.side === "buy" ? tokenPosition.plus(tokenAmount) : tokenPosition.minus(tokenAmount);
    if (tokenPosition.isNegative()) tokenPosition = new Decimal(0);
    const rawPosition = tokenPosition.mul(TOKEN_SCALE).toDecimalPlaces(0).toFixed(0);
    const rawAmount = tokenAmount.mul(TOKEN_SCALE).toDecimalPlaces(0).toFixed(0);
    const timestamp = Math.max(execution.timestamp, lastTimestamp + 1);
    lastTimestamp = timestamp;
    return {
      signature: execution.signature,
      slot: 0,
      timestamp,
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
    };
  });

  if (context.positionStatus === "closed" && fills.length) fills[fills.length - 1]!.walletPostTokenRaw = "0";
  return buildTradeEpisodes(fills, context).map((episode) => ({
    ...episode,
    matchLabel: "Axiom capture",
  }));
}

/** @deprecated Kept for stored projects and callers from the 0.3 test build. */
export const buildAxiomCaptureEpisodes = buildAxiomExecutionEpisodes;
