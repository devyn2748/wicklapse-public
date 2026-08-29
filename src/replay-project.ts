import Decimal from "decimal.js";
import type { ReplayCandle, ReplayPoint, ReplaySpec, ShareContext, TradeEpisode } from "./domain";
import { buildReplayPoints } from "./episodes";
import { fetchPublicMarketJson } from "./market-data";
import {
  fetchAxiomCandles,
  intervalSeconds,
  selectAxiomInterval,
  type CandleIntervalPreference,
  type CandleTimeWindow,
} from "./axiom-candles";

export type { CandleIntervalPreference } from "./axiom-candles";

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
  interval: number;
  source: "axiom" | "fomo" | "gecko";
}

export interface ReplayTimelineOptions {
  duration: number;
  leadSeconds: number | null;
  trailSeconds: number | null;
}

export function calculateReplayTimeWindow(
  episode: TradeEpisode,
  options?: ReplayTimelineOptions,
): CandleTimeWindow | undefined {
  if (!options || (options.leadSeconds == null && options.trailSeconds == null)) return undefined;
  const duration = Math.max(1, options.duration);
  const lead = Math.max(0, options.leadSeconds ?? 0.12);
  const trail = Math.max(0, options.trailSeconds ?? 0.65);
  const activeVideoSeconds = duration - lead - trail;
  if (activeVideoSeconds < 0.25) throw new Error("Chart lead-in and tail must leave at least 0.25 seconds for the trade replay.");
  const tradeSpan = Math.max(1, episode.endTimestamp - episode.startTimestamp);
  return {
    fromSeconds: Math.max(0, episode.startTimestamp - tradeSpan * lead / activeVideoSeconds),
    toSeconds: episode.endTimestamp + tradeSpan * trail / activeVideoSeconds,
  };
}

const LAMPORTS = new Decimal(1_000_000_000);

type CandleRequest = { timeframe: "second" | "minute" | "hour" | "day"; aggregate: number; interval: number; sourceInterval: number };

const CANDLE_REQUESTS: CandleRequest[] = [
  { timeframe: "second", aggregate: 1, interval: 1, sourceInterval: 1 },
  // GeckoTerminal has no native 5-second aggregate. Build exact 5s OHLC bars
  // client-side from its supported 1-second response.
  { timeframe: "second", aggregate: 1, interval: 5, sourceInterval: 1 },
  { timeframe: "second", aggregate: 15, interval: 15, sourceInterval: 15 },
  { timeframe: "second", aggregate: 30, interval: 30, sourceInterval: 30 },
  { timeframe: "minute", aggregate: 1, interval: 60, sourceInterval: 60 },
  { timeframe: "minute", aggregate: 3, interval: 180, sourceInterval: 180 },
  { timeframe: "minute", aggregate: 5, interval: 300, sourceInterval: 300 },
  { timeframe: "minute", aggregate: 15, interval: 900, sourceInterval: 900 },
  { timeframe: "minute", aggregate: 30, interval: 1_800, sourceInterval: 1_800 },
  { timeframe: "hour", aggregate: 1, interval: 3_600, sourceInterval: 3_600 },
  { timeframe: "hour", aggregate: 4, interval: 14_400, sourceInterval: 14_400 },
  { timeframe: "hour", aggregate: 12, interval: 43_200, sourceInterval: 43_200 },
  { timeframe: "day", aggregate: 1, interval: 86_400, sourceInterval: 86_400 },
];

export function selectCandleRequest(spanSeconds: number, preference: CandleIntervalPreference = "auto"): CandleRequest {
  const selected = selectAxiomInterval(spanSeconds, preference);
  const targetInterval = CANDLE_REQUESTS.find((request) => request.interval === intervalSeconds(selected));
  return targetInterval ?? CANDLE_REQUESTS.at(-1)!;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export class LatestReplayRequest {
  private requestId = 0;
  private controller: AbortController | null = null;

  begin(): { id: number; signal: AbortSignal } {
    this.controller?.abort();
    this.controller = new AbortController();
    return { id: ++this.requestId, signal: this.controller.signal };
  }

  isLatest(id: number): boolean {
    return id === this.requestId && !this.controller?.signal.aborted;
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.requestId += 1;
  }
}

async function getMarketCapMultiplier(context: ShareContext, signal?: AbortSignal): Promise<string | null> {
  if (!context.pairAddress || context.provider === "fomo") return null;
  try {
    const response = await fetchPublicMarketJson(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(context.pairAddress)}`,
      { headers: { accept: "application/json;version=20230203" }, signal },
    );
    if (!response.ok) return null;
    const attributes = (response.payload as PoolPayload).data?.attributes;
    const nativePrice = new Decimal(attributes?.base_token_price_native_currency ?? 0);
    const marketCap = new Decimal(attributes?.market_cap_usd ?? attributes?.fdv_usd ?? 0);
    if (!nativePrice.isFinite() || !marketCap.isFinite() || nativePrice.lte(0) || marketCap.lte(0)) return null;
    return marketCap.div(nativePrice).toString();
  } catch (error) {
    if (isAbortError(error)) throw error;
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
  const fills = [...episode.fills].sort((left, right) => left.timestamp - right.timestamp || left.slot - right.slot || left.signature.localeCompare(right.signature));
  const timeline = [
    ...candles.map((candle) => ({ timestamp: candle.timestamp, priceSol: candle.closeSol, order: 0 })),
    ...fills.map((fill) => ({ timestamp: fill.timestamp, priceSol: fill.estimatedPriceSol, order: 1 })),
  ].sort((left, right) => left.timestamp - right.timestamp || left.order - right.order);
  let fillIndex = 0;
  let cashFlow = new Decimal(0);
  let holdings = new Decimal(0);
  let fees = new Decimal(0);
  const points: ReplayPoint[] = [];
  for (const item of timeline) {
    while (fillIndex < fills.length && fills[fillIndex]!.timestamp <= item.timestamp) {
      const fill = fills[fillIndex]!;
      const quoteScale = new Decimal(fill.quoteScale ?? LAMPORTS);
      const quote = new Decimal(fill.quoteLamports).div(quoteScale);
      const amount = new Decimal(fill.tokenAmountRaw).div(new Decimal(10).pow(fill.tokenDecimals));
      if (fill.side === "buy") {
        cashFlow = cashFlow.minus(quote);
        holdings = holdings.plus(amount);
      } else {
        cashFlow = cashFlow.plus(quote);
        holdings = Decimal.max(0, holdings.minus(amount));
      }
      fees = fees.plus(new Decimal(fill.networkFeeLamports).div(quoteScale));
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

function aggregateCandles(candles: ReplayCandle[], interval: number): ReplayCandle[] {
  if (interval <= 1) return candles;
  const groups = new Map<number, ReplayCandle[]>();
  for (const candle of candles) {
    const timestamp = Math.floor(candle.timestamp / interval) * interval;
    const group = groups.get(timestamp) ?? [];
    group.push(candle);
    groups.set(timestamp, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left - right).map(([timestamp, group]) => ({
    timestamp,
    openSol: group[0]!.openSol,
    highSol: String(Math.max(...group.map((candle) => Number(candle.highSol)))),
    lowSol: String(Math.min(...group.map((candle) => Number(candle.lowSol)))),
    closeSol: group.at(-1)!.closeSol,
    volume: group.reduce((total, candle) => total.plus(candle.volume), new Decimal(0)).toString(),
  }));
}

/** Selects only candles adjacent to the replay, never Fomo's complete UI chart range. */
export function selectFocusedFomoCandles(candles: ReplayCandle[], windowStart: number, windowEnd: number): ReplayCandle[] {
  const sorted = [...candles]
    .sort((left, right) => left.timestamp - right.timestamp)
    .filter((candle, index, source) => index === 0 || candle.timestamp !== source[index - 1]!.timestamp);
  const inside = sorted.filter((candle) => candle.timestamp >= windowStart && candle.timestamp <= windowEnd);
  if (inside.length >= 2) return inside;
  return sorted
    .map((candle) => ({
      candle,
      distance: candle.timestamp < windowStart
        ? windowStart - candle.timestamp
        : candle.timestamp > windowEnd ? candle.timestamp - windowEnd : 0,
    }))
    .sort((left, right) => left.distance - right.distance || left.candle.timestamp - right.candle.timestamp)
    .slice(0, Math.min(4, sorted.length))
    .map(({ candle }) => candle)
    .sort((left, right) => left.timestamp - right.timestamp);
}

async function getUsdPerSol(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await fetchPublicMarketJson("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { signal });
    if (!response.ok) return null;
    const payload = response.payload as { solana?: { usd?: string | number } };
    return payload?.solana?.usd ? String(payload.solana.usd) : null;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

async function getMarketHistory(
  context: ShareContext,
  episode: TradeEpisode,
  candleInterval: CandleIntervalPreference,
  signal?: AbortSignal,
  timeWindow?: CandleTimeWindow,
): Promise<MarketHistory | null> {
  if (!context.pairAddress) return null;
  const tradeSpan = Math.max(1, episode.endTimestamp - episode.startTimestamp);
  const fomoPadding = context.provider === "fomo" && !timeWindow ? Math.max(30, tradeSpan * 0.15) : 0;
  const windowStart = timeWindow?.fromSeconds ?? Math.max(0, episode.startTimestamp - fomoPadding);
  const windowEnd = timeWindow?.toSeconds ?? episode.endTimestamp + fomoPadding;
  const spanSeconds = Math.max(1, windowEnd - windowStart);
  if (context.provider === "fomo" && context.capturedCandles && context.capturedCandles.length >= 2) {
    const source = selectFocusedFomoCandles(context.capturedCandles, windowStart, windowEnd);
    const request = selectCandleRequest(spanSeconds, candleInterval);
    const sourceInterval = Math.max(1, Math.min(...source.slice(1).map((candle, index) => candle.timestamp - source[index]!.timestamp).filter((value) => value > 0)));
    const candles = request.interval > sourceInterval ? aggregateCandles(source, request.interval) : source;
    if (candles.length >= 2) {
      return { candles, points: buildMarkToMarketPoints(episode, candles), interval: Math.max(sourceInterval, request.interval), source: "fomo" };
    }
  }
  if (episode.fills.some((fill) => fill.source === "axiom")) {
    try {
      const axiom = await fetchAxiomCandles(context, episode, candleInterval, { signal }, timeWindow);
      if (axiom) {
        return {
          ...axiom,
          points: buildMarkToMarketPoints(episode, axiom.candles),
          source: "axiom",
        };
      }
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }
  const preferredRequest = selectCandleRequest(spanSeconds, candleInterval);
  const preferredIndex = CANDLE_REQUESTS.indexOf(preferredRequest);
  const seenSources = new Set<string>();
  const requests = CANDLE_REQUESTS.slice(preferredIndex).filter((request) => {
    const source = `${request.timeframe}:${request.aggregate}`;
    if (seenSources.has(source)) return false;
    seenSources.add(source);
    return true;
  }).slice(0, 3);
  for (const request of requests) {
    const result = await getMarketHistoryAtInterval(context.pairAddress, episode, spanSeconds, request, signal, timeWindow);
    if (result) return result;
  }
  return null;
}

async function getMarketHistoryAtInterval(
  pairAddress: string,
  episode: TradeEpisode,
  spanSeconds: number,
  request: CandleRequest,
  signal?: AbortSignal,
  timeWindow?: CandleTimeWindow,
): Promise<MarketHistory | null> {
  const windowStart = timeWindow?.fromSeconds ?? episode.startTimestamp - request.interval;
  const windowEnd = timeWindow?.toSeconds ?? episode.endTimestamp + request.interval;
  const before = windowEnd + request.interval;
  const limit = Math.min(1_000, Math.max(24, Math.ceil(spanSeconds / request.sourceInterval) + 4));
  const params = new URLSearchParams({
    aggregate: String(request.aggregate),
    before_timestamp: String(before),
    limit: String(limit),
    currency: "token",
    token: "base",
    include_empty_intervals: "true",
  });
  try {
    const response = await fetchPublicMarketJson(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(pairAddress)}/ohlcv/${request.timeframe}?${params}`,
      { headers: { accept: "application/json;version=20230203" }, signal },
    );
    if (!response.ok) return null;
    const payload = response.payload as OhlcvPayload;
    const sourceCandles = (payload.data?.attributes?.ohlcv_list ?? [])
      .filter(isFiniteCandle)
      .filter(([timestamp]) => timestamp >= windowStart && timestamp <= windowEnd)
      .map(([timestamp, open, high, low, close, volume]): ReplayCandle => ({
        timestamp: Number(timestamp),
        openSol: String(open),
        highSol: String(high),
        lowSol: String(low),
        closeSol: String(close),
        volume: String(volume),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
    const candles = request.interval === request.sourceInterval
      ? sourceCandles
      : aggregateCandles(sourceCandles, request.interval);
    if (candles.length < 2) return null;
    return { candles, points: buildMarkToMarketPoints(episode, candles), interval: request.interval, source: "gecko" };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return null;
  }
}

export async function createReplaySpec(
  episode: TradeEpisode,
  context: ShareContext,
  walletAddress: string,
  candleInterval: CandleIntervalPreference = "auto",
  signal?: AbortSignal,
  timelineOptions?: ReplayTimelineOptions,
): Promise<ReplaySpec> {
  if (signal?.aborted) throw new DOMException("Replay request aborted", "AbortError");
  const fillPoints = buildReplayPoints(episode);
  const tradeDataSource = episode.fills.some((fill) => fill.source === "fomo")
    ? "fomo"
    : episode.fills.some((fill) => fill.source === "axiom") ? "axiom" : "rpc";
  const timeWindow = calculateReplayTimeWindow(episode, timelineOptions);
  const [usdPerSol, marketHistory, marketCapMultiplier] = await Promise.all([
    getUsdPerSol(signal),
    getMarketHistory(context, episode, candleInterval, signal, timeWindow),
    getMarketCapMultiplier(context, signal),
  ]);
  if (signal?.aborted) throw new DOMException("Replay request aborted", "AbortError");
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
    athMarketCapUsd: context.athMarketCapUsd ?? null,
    currency: episode.quoteCurrency ?? "SOL",
    usdPerSol,
    verified: tradeDataSource === "rpc" && episode.matchScore >= 90,
    marketDataSource: marketHistory?.source ?? "fills",
    candleIntervalSeconds: marketHistory?.interval,
    chartStartTimestamp: timeWindow?.fromSeconds,
    chartEndTimestamp: timeWindow?.toSeconds,
    tradeDataSource,
    accountingCurrency: episode.quoteCurrency ?? "SOL",
    provider: context.provider ?? "axiom",
  };
}
