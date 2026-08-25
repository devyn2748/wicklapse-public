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
  const groups: TradeFill[][] = [];
  let current: TradeFill[] = [];

  for (const fill of fills) {
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
  let spent = new Decimal(0);
  let received = new Decimal(0);
  for (const fill of episode.fills) {
    const quote = new Decimal(fill.quoteLamports).div(LAMPORTS);
    if (fill.side === "buy") spent = spent.plus(quote);
    else received = received.plus(quote);
    points.push({
      timestamp: fill.timestamp,
      priceSol: fill.estimatedPriceSol,
      pnlSol: received.minus(spent).toString(),
    });
  }
  return points;
}

export function solFromLamports(value: string): string {
  return new Decimal(value).div(LAMPORTS).toFixed(4);
}
