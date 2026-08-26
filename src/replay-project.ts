import Decimal from "decimal.js";
import type { ReplayCandle, ReplayPoint, ReplaySpec, ShareContext, TradeEpisode } from "./domain";
import { buildReplayPoints } from "./episodes";

interface OhlcvPayload {
  data?: { attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> } };
}

interface PoolPayload {
  data?: {
    attributes?: {
      base_token_price_native_currency?: string | number | null;
      market_cap_usd?: string | number | null;
      fdv_usd?: string | number | null;
    };
  };
}

interface MarketHistory {
  candles: ReplayCandle[];
  points: ReplayPoint[];
}

const LAMPORTS = new Decimal(1_000_000_000);

function selectCandleRequest(spanSeconds: number): { timeframe: "second" | "minute" | "hour" | "day"; aggregate: number; interval: number } {
  if (spanSeconds <= 5 * 60) return { timeframe: "second", aggregate: 1, interval: 1 };
  if (spanSeconds <= 3 * 3_600) return { timeframe: "minute", aggregate: 1, interval: 60 };
  if (spanSeconds <= 15 * 3_600) return { timeframe: "minute", aggregate: 5, interval: 300 };
  if (spanSeconds <= 2 * 86_400) return { timeframe: "minute", aggregate: 15, interval: 900 };
  if (spanSeconds <= 30 * 86_400) return { timeframe: "hour", aggregate: 1, interval: 3_600 };
  if (spanSeconds <= 120 * 86_400) return { timeframe: "hour", aggregate: 4, interval: 14_400 };
  if (spanSeconds <= 365 * 86_400) return { timeframe: "hour", aggregate: 12, interval: 43_200 };
  return { timeframe: "day", aggregate: 1, interval: 86_400 };
}

async function getMarketCapMultiplier(context: ShareContext): Promise<string | null> {
  if (!context.pairAddress) return null;
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(context.pairAddress)}`,
      { headers: { accept: "application/json;version=20230203" } },
    );
    if (!response.ok) return null;
    const attributes = ((await response.json()) as PoolPayload).data?.attributes;
    const nativePrice = new Decimal(attributes?.base_token_price_native_currency ?? 0);
    const marketCap = new Decimal(attributes?.market_cap_usd ?? attributes?.fdv_usd ?? 0);
    if (!nativePrice.isFinite() || !marketCap.isFinite() || nativePrice.lte(0) || marketCap.lte(0)) return null;
    return marketCap.div(nativePrice).toString();
  } catch {
    return null;
  }
}

function isFiniteCandle(row: unknown): row is [number, number, number, number, number, number] {
  return Array.isArray(row)
    && row.length >= 6
    && row.slice(0, 6).every((value) => Number.isFinite(Number(value)))
    && Number(row[0]) > 0
    && Number(row[2]) >= Number(row[3]);
}

export function buildMarkToMarketPoints(episode: TradeEpisode, candles: ReplayCandle[]): ReplayPoint[] {
  const timeline = [
    ...candles.map((candle) => ({ timestamp: candle.timestamp, priceSol: candle.closeSol, order: 0 })),
    ...episode.fills.map((fill) => ({ timestamp: fill.timestamp, priceSol: fill.estimatedPriceSol, order: 1 })),
  ].sort((left, right) => left.timestamp - right.timestamp || left.order - right.order);
  let fillIndex = 0;
  let cashFlow = new Decimal(0);
  let holdings = new Decimal(0);
  let fees = new Decimal(0);
  const points: ReplayPoint[] = [];
  for (const item of timeline) {
    while (fillIndex < episode.fills.length && episode.fills[fillIndex]!.timestamp <= item.timestamp) {
      const fill = episode.fills[fillIndex]!;
      const quote = new Decimal(fill.quoteLamports).div(LAMPORTS);
      const amount = new Decimal(fill.tokenAmountRaw).div(new Decimal(10).pow(fill.tokenDecimals));
      if (fill.side === "buy") {
        cashFlow = cashFlow.minus(quote);
        holdings = holdings.plus(amount);
      } else {
        cashFlow = cashFlow.plus(quote);
        holdings = Decimal.max(0, holdings.minus(amount));
      }
      fees = fees.plus(new Decimal(fill.networkFeeLamports).div(LAMPORTS));
      fillIndex += 1;
    }
    const price = new Decimal(item.priceSol || 0);
    points.push({
      timestamp: item.timestamp,
      priceSol: price.toString(),
      pnlSol: cashFlow.plus(holdings.mul(price)).minus(fees).toString(),
    });
  }
  return points.filter((point, index) => index === 0 || point.timestamp !== points[index - 1]!.timestamp);
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

async function getMarketHistory(
  context: ShareContext,
  episode: TradeEpisode,
): Promise<MarketHistory | null> {
  if (!context.pairAddress) return null;
  const spanSeconds = Math.max(1, episode.endTimestamp - episode.startTimestamp);
  const request = selectCandleRequest(spanSeconds);
  const before = episode.endTimestamp + request.interval * 2;
  const limit = Math.min(1_000, Math.max(24, Math.ceil(spanSeconds / request.interval) + 4));
  const params = new URLSearchParams({
    aggregate: String(request.aggregate),
    before_timestamp: String(before),
    limit: String(limit),
    currency: "token",
    token: "base",
  });
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(context.pairAddress)}/ohlcv/${request.timeframe}?${params}`,
      { headers: { accept: "application/json;version=20230203" } },
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as OhlcvPayload;
    const candles = (payload.data?.attributes?.ohlcv_list ?? [])
      .filter(isFiniteCandle)
      .filter(([timestamp]) => timestamp >= episode.startTimestamp - request.interval && timestamp <= episode.endTimestamp + request.interval)
      .map(([timestamp, open, high, low, close, volume]): ReplayCandle => ({
        timestamp: Number(timestamp),
        openSol: String(open),
        highSol: String(high),
        lowSol: String(low),
        closeSol: String(close),
        volume: String(volume),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    if (candles.length < 2) return null;
    return { candles, points: buildMarkToMarketPoints(episode, candles) };
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
  const [usdPerSol, marketHistory, marketCapMultiplier] = await Promise.all([
    getUsdPerSol(),
    getMarketHistory(context, episode),
    getMarketCapMultiplier(context),
  ]);
  return {
    id: crypto.randomUUID(),
    symbol: context.symbol || "TOKEN",
    tokenMint: episode.tokenMint,
    walletAddress,
    walletAddresses: context.walletAddresses,
    capturedAt: context.capturedAt,
    episode,
    points: marketHistory?.points ?? fillPoints,
    candles: marketHistory?.candles,
    marketCapMultiplier,
    currency: "SOL",
    usdPerSol,
    verified: tradeDataSource === "rpc" && episode.matchScore >= 90,
    marketDataSource: marketHistory ? "ohlcv" : "fills",
    tradeDataSource,
  };
}
