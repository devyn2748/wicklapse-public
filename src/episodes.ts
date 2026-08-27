import Decimal from "decimal.js";
import type { ReplayPoint, ShareContext, TradeEpisode, TradeFill } from "./domain";

const LAMPORTS = new Decimal(1_000_000_000);

function sumLamports(fills: TradeFill[], side: "buy" | "sell"): Decimal {
  return fills
    .filter((fill) => fill.side === side)
    .reduce((total, fill) => total.plus(fill.quoteLamports), new Decimal(0));
}

function labelForScore(score: number): TradeEpisode["matchLabel"] {
  if (score >= 90) return "Exact match";
  if (score >= 65) return "Likely match";
  return "Possible match";
}

function relativeMatch(actual: Decimal, expectedText: string | null, weight: number): number {
  if (!expectedText) return 0;
  const expected = new Decimal(expectedText);
  if (expected.isZero()) return actual.abs().lte(0.000_01) ? weight : 0;
  const difference = actual.minus(expected).abs().div(expected.abs());
  if (difference.lte(0.005)) return weight;
  if (difference.lte(0.03)) return weight * 0.65;
  if (difference.lte(0.1)) return weight * 0.25;
  return 0;
}

export function scoreEpisode(episode: TradeEpisode, context: ShareContext): number {
  const bought = new Decimal(episode.totalBoughtLamports).div(LAMPORTS);
  const sold = new Decimal(episode.totalSoldLamports).div(LAMPORTS);
  const pnl = new Decimal(episode.approximatePnlLamports).div(LAMPORTS);
  let score = 20; // Exact mint is required before an episode reaches this function.
  score += relativeMatch(bought, context.boughtSol, 24);
  score += relativeMatch(sold, context.soldSol, 24);
  score += relativeMatch(pnl, context.pnlSol, 18);
  if (context.positionStatus !== "unknown" && context.positionStatus === episode.status) score += 10;
  const ageHours = Math.abs(context.capturedAt / 1_000 - episode.endTimestamp) / 3_600;
  if (ageHours <= 1) score += 4;
  else if (ageHours <= 24) score += 2;
  return Math.min(100, Math.round(score));
}

export function buildTradeEpisodes(fills: TradeFill[], context: ShareContext): TradeEpisode[] {
  if (!fills.length) return [];
  const chronological = [...fills].sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot || left.signature.localeCompare(right.signature));
  const groups: TradeFill[][] = [];
  let current: TradeFill[] = [];

  for (const fill of chronological) {
    if (current.length === 0) current.push(fill);
    else {
      const previous = current.at(-1);
      if (previous?.walletPostTokenRaw === "0" && fill.side === "buy") {
        groups.push(current);
        current = [fill];
      } else current.push(fill);
    }
  }
  if (current.length) groups.push(current);

  return groups
    .map((episodeFills, index): TradeEpisode => {
      const bought = sumLamports(episodeFills, "buy");
      const sold = sumLamports(episodeFills, "sell");
      const fees = episodeFills.reduce(
        (total, fill) => total.plus(fill.networkFeeLamports),
        new Decimal(0),
      );
      const last = episodeFills.at(-1)!;
      const status = last.walletPostTokenRaw === "0" ? "closed" : "open";
      const approximatePnl = sold.minus(bought).minus(fees);
      const episode: TradeEpisode = {
        id: `${episodeFills[0]!.signature.slice(0, 12)}-${index}`,
        tokenMint: episodeFills[0]!.tokenMint,
        fills: episodeFills,
        startTimestamp: episodeFills[0]!.timestamp,
        endTimestamp: last.timestamp,
        status,
        totalBoughtLamports: bought.toFixed(0),
        totalSoldLamports: sold.toFixed(0),
        networkFeesLamports: fees.toFixed(0),
        remainingTokenRaw: last.walletPostTokenRaw,
        tokenDecimals: last.tokenDecimals,
        approximatePnlLamports: approximatePnl.toFixed(0),
        matchScore: 0,
        matchLabel: "Possible match",
      };
      episode.matchScore = scoreEpisode(episode, context);
      episode.matchLabel = labelForScore(episode.matchScore);
      return episode;
    })
    .sort((a, b) => b.matchScore - a.matchScore || b.endTimestamp - a.endTimestamp);
}

export function buildReplayPoints(episode: TradeEpisode): ReplayPoint[] {
  const points: ReplayPoint[] = [];
  let cashFlow = new Decimal(0);
  let holdings = new Decimal(0);
  let fees = new Decimal(0);
  const chronological = [...episode.fills].sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot || left.signature.localeCompare(right.signature));
  for (const fill of chronological) {
    const quote = new Decimal(fill.quoteLamports).div(LAMPORTS);
    const tokenAmount = new Decimal(fill.tokenAmountRaw).div(new Decimal(10).pow(fill.tokenDecimals));
    if (fill.side === "buy") {
      cashFlow = cashFlow.minus(quote);
      holdings = holdings.plus(tokenAmount);
    } else {
      cashFlow = cashFlow.plus(quote);
      holdings = Decimal.max(0, holdings.minus(tokenAmount));
    }
    fees = fees.plus(new Decimal(fill.networkFeeLamports).div(LAMPORTS));
    const executionPrice = new Decimal(fill.estimatedPriceSol || 0);
    points.push({
      timestamp: fill.timestamp,
      priceSol: fill.estimatedPriceSol,
      pnlSol: cashFlow.plus(holdings.mul(executionPrice)).minus(fees).toString(),
    });
  }
  return points;
}

export function solFromLamports(value: string): string {
  return new Decimal(value).div(LAMPORTS).toFixed(4);
}
