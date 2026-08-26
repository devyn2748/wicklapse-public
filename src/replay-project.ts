import Decimal from "decimal.js";
import type { ReplayPoint, ReplaySpec, ShareContext, TradeEpisode } from "./domain";
import { buildReplayPoints } from "./episodes";

interface OhlcvPayload {
  data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } };
}

function interpolatePnl(points: ReplayPoint[], timestamp: number): string {
  if (!points.length) return "0";
  if (timestamp <= points[0]!.timestamp) return points[0]!.pnlSol;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const next = points[index]!;
    if (timestamp <= next.timestamp) {
      const ratio = (timestamp - previous.timestamp) / Math.max(1, next.timestamp - previous.timestamp);
      return new Decimal(previous.pnlSol)
        .plus(new Decimal(next.pnlSol).minus(previous.pnlSol).mul(ratio))
        .toString();
    }
  }
  return points.at(-1)!.pnlSol;
}

async function getUsdPerSol(): Promise<string | null> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.solana?.usd ? String(payload.solana.usd) : null;
  } catch {
    return null;
  }
}

async function getMarketReplayPoints(
  context: ShareContext,
  episode: TradeEpisode,
  fillPoints: ReplayPoint[],
): Promise<ReplayPoint[] | null> {
  if (!context.pairAddress) return null;
  const before = episode.endTimestamp + 120;
  const spanMinutes = Math.max(1, Math.ceil((episode.endTimestamp - episode.startTimestamp) / 60));
  const limit = Math.min(1_000, Math.max(40, spanMinutes + 6));
  const params = new URLSearchParams({
    aggregate: "1",
    before_timestamp: String(before),
    limit: String(limit),
    currency: "usd",
    token: "base",
  });
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(context.pairAddress)}/ohlcv/minute?${params}`,
      { headers: { accept: "application/json;version=20230203" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as OhlcvPayload;
    const candles = payload.data?.attributes?.ohlcv_list ?? [];
    const points = candles
      .filter(([timestamp]) => timestamp >= episode.startTimestamp - 120 && timestamp <= episode.endTimestamp + 120)
      .map(([timestamp, , , , close]) => ({
        timestamp,
        priceSol: String(close),
        pnlSol: interpolatePnl(fillPoints, timestamp),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    return points.length >= 4 ? points : null;
  } catch {
    return null;
  }
}

export async function createReplaySpec(
  episode: TradeEpisode,
  context: ShareContext,
  walletAddress: string,
): Promise<ReplaySpec> {
  const fillPoints = buildReplayPoints(episode);
  const tradeDataSource = episode.fills.some((fill) => fill.source === "axiom") ? "axiom" : "rpc";
  const [usdPerSol, marketPoints] = await Promise.all([
    getUsdPerSol(),
    getMarketReplayPoints(context, episode, fillPoints),
  ]);
  return {
    id: crypto.randomUUID(),
    symbol: context.symbol || "TOKEN",
    tokenMint: episode.tokenMint,
    walletAddress,
    walletAddresses: context.walletAddresses,
    capturedAt: context.capturedAt,
    episode,
    points: marketPoints ?? fillPoints,
    currency: "SOL",
    usdPerSol,
    verified: tradeDataSource === "rpc" && episode.matchScore >= 90,
    marketDataSource: marketPoints ? "ohlcv" : "fills",
    tradeDataSource,
  };
}
