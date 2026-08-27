import { AxiomPairContextSchema, SolanaAddressSchema, type AxiomPairContext, type ReplayCandle, type ShareContext, type TradeEpisode } from "./domain";

export const AXIOM_CANDLE_INTERVALS = [
  { value: "1s", seconds: 1 },
  { value: "5s", seconds: 5 },
  { value: "15s", seconds: 15 },
  { value: "30s", seconds: 30 },
  { value: "1m", seconds: 60 },
  { value: "3m", seconds: 180 },
  { value: "5m", seconds: 300 },
  { value: "15m", seconds: 900 },
  { value: "30m", seconds: 1_800 },
  { value: "1h", seconds: 3_600 },
  { value: "4h", seconds: 14_400 },
  { value: "12h", seconds: 43_200 },
  { value: "1d", seconds: 86_400 },
] as const;

export type AxiomInterval = typeof AXIOM_CANDLE_INTERVALS[number]["value"];
export type CandleIntervalPreference = "auto" | AxiomInterval;

export interface AxiomCandleRequest {
  url: string;
  fromSeconds: number;
  toSeconds: number;
  interval: AxiomInterval;
  intervalSeconds: number;
  countBars: number;
}

interface AxiomBarsPayload {
  bars?: unknown;
}

interface FetchAxiomCandleOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  fillMissing?: boolean;
}

const FALLBACK_PAIR_CHART_URL = "https://api.axiom.trade/pair-chart-v3";
const SAFE_AXIOM_CHART_PARAMS = new Set([
  "pairAddress", "from", "to", "currency", "interval", "countBars", "showOutliers",
  "openTrading", "pairCreatedAt", "lastTransactionTime", "isNew", "isMigrated", "tokenAddress", "v",
]);
const MIN_CANDLES = 30;
const IDEAL_CANDLES = 150;
const MAX_CANDLES = 400;

function isAxiomChartUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.hostname === "axiom.trade" || url.hostname.endsWith(".axiom.trade"))
      && url.pathname.endsWith("/pair-chart-v3");
  } catch {
    return false;
  }
}

export function sanitizeAxiomChartUrl(value: string, pairAddress?: string | null): string | null {
  if (!isAxiomChartUrl(value)) return null;
  const url = new URL(value);
  if (pairAddress && url.searchParams.get("pairAddress") !== pairAddress) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (!SAFE_AXIOM_CHART_PARAMS.has(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

export function extractAxiomPairContext(value: string, expectedPairAddress?: string | null): AxiomPairContext | null {
  const sanitized = sanitizeAxiomChartUrl(value, expectedPairAddress);
  if (!sanitized) return null;
  const url = new URL(sanitized);
  const pairAddress = url.searchParams.get("pairAddress");
  if (!pairAddress) return null;
  const rawTokenAddress = url.searchParams.get("tokenAddress");
  const tokenAddress = rawTokenAddress && SolanaAddressSchema.safeParse(rawTokenAddress).success ? rawTokenAddress : null;
  const parsed = AxiomPairContextSchema.safeParse({
    pairAddress,
    tokenAddress,
    chartBaseUrl: `${url.protocol}//${url.host}${url.pathname}`,
    metadata: {
      pairAddress,
      tokenAddress: tokenAddress ?? undefined,
      openTrading: url.searchParams.get("openTrading") ?? undefined,
      pairCreatedAt: url.searchParams.get("pairCreatedAt") ?? undefined,
      lastTransactionTime: url.searchParams.get("lastTransactionTime") ?? undefined,
      isNew: url.searchParams.get("isNew") ?? undefined,
      isMigrated: url.searchParams.get("isMigrated") ?? undefined,
      v: url.searchParams.get("v") ?? undefined,
      showOutliers: url.searchParams.get("showOutliers") ?? undefined,
    },
    capturedAt: Date.now(),
  });
  return parsed.success ? parsed.data : null;
}

export function intervalSeconds(interval: AxiomInterval): number {
  return AXIOM_CANDLE_INTERVALS.find((candidate) => candidate.value === interval)?.seconds ?? 1;
}

export function estimatedCandleCount(spanSeconds: number, interval: AxiomInterval): number {
  return Math.max(1, spanSeconds) / intervalSeconds(interval);
}

export function selectAllowedIntervals(spanSeconds: number): AxiomInterval[] {
  const sensible = AXIOM_CANDLE_INTERVALS
    .filter(({ seconds }) => {
      const count = Math.max(1, spanSeconds) / seconds;
      return count >= MIN_CANDLES && count <= MAX_CANDLES;
    })
    .map(({ value }) => value);
  if (sensible.length) return sensible;
  return [selectAxiomInterval(spanSeconds, "auto")];
}

export function selectAxiomInterval(
  spanSeconds: number,
  preference: CandleIntervalPreference = "auto",
): AxiomInterval {
  const allowed = selectAllowedIntervalsWithoutFallback(spanSeconds);
  if (preference !== "auto" && allowed.includes(preference)) return preference;
  const candidates = allowed.length ? allowed : AXIOM_CANDLE_INTERVALS.map(({ value }) => value);
  return [...candidates].sort((left, right) => {
    const leftDistance = Math.abs(estimatedCandleCount(spanSeconds, left) - IDEAL_CANDLES);
    const rightDistance = Math.abs(estimatedCandleCount(spanSeconds, right) - IDEAL_CANDLES);
    return leftDistance - rightDistance || intervalSeconds(left) - intervalSeconds(right);
  })[0]!;
}

function selectAllowedIntervalsWithoutFallback(spanSeconds: number): AxiomInterval[] {
  return AXIOM_CANDLE_INTERVALS
    .filter(({ seconds }) => {
      const count = Math.max(1, spanSeconds) / seconds;
      return count >= MIN_CANDLES && count <= MAX_CANDLES;
    })
    .map(({ value }) => value);
}

export function buildAxiomCandleRequest(
  context: ShareContext,
  episode: TradeEpisode,
  preference: CandleIntervalPreference = "auto",
): AxiomCandleRequest | null {
  if (!context.pairAddress) return null;

  let pairContext = context.axiomPairContext;
  if (pairContext && pairContext.pairAddress !== context.pairAddress) {
    return null; // Reject stale or mismatched context completely, forcing fallback
  }

  // Fallback to extraction from legacy `axiomChartUrl` string if atomic context is missing
  if (!pairContext && context.axiomChartUrl) {
    pairContext = extractAxiomPairContext(context.axiomChartUrl, context.pairAddress) ?? undefined;
  }

  const template = pairContext ? pairContext.chartBaseUrl : FALLBACK_PAIR_CHART_URL;
  const url = new URL(template);

  // Apply atomic metadata safely
  if (pairContext) {
    for (const [key, value] of Object.entries(pairContext.metadata)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const spanSeconds = Math.max(1, episode.endTimestamp - episode.startTimestamp);
  const interval = selectAxiomInterval(spanSeconds, preference);
  const seconds = intervalSeconds(interval);
  const padding = Math.max(seconds * 2, Math.min(spanSeconds * 0.05, seconds * 10));
  const fromSeconds = Math.max(0, episode.startTimestamp - padding);
  const toSeconds = episode.endTimestamp + padding;
  const requestedBuckets = Math.ceil((toSeconds - fromSeconds) / seconds) + 1;
  const countBars = Math.min(1_000, Math.max(30, requestedBuckets * 2));

  url.searchParams.set("pairAddress", context.pairAddress);
  url.searchParams.set("from", String(Math.floor(fromSeconds * 1_000)));
  url.searchParams.set("to", String(Math.ceil(toSeconds * 1_000)));
  url.searchParams.set("currency", "SOL");
  url.searchParams.set("interval", interval);
  url.searchParams.set("countBars", String(countBars));
  
  if (!url.searchParams.has("showOutliers")) url.searchParams.set("showOutliers", "false");
  if (!url.searchParams.has("v")) url.searchParams.set("v", "2");
  
  if (context.tokenMint && !url.searchParams.has("tokenAddress") && (!pairContext?.tokenAddress || pairContext.tokenAddress === context.tokenMint)) {
    url.searchParams.set("tokenAddress", context.tokenMint);
  }

  return { url: url.toString(), fromSeconds, toSeconds, interval, intervalSeconds: seconds, countBars };
}

export function parseAxiomCandles(
  payload: unknown,
  fromSeconds: number,
  toSeconds: number,
): ReplayCandle[] {
  const rows = payload && typeof payload === "object" ? (payload as AxiomBarsPayload).bars : null;
  if (!Array.isArray(rows)) return [];
  const byTimestamp = new Map<number, ReplayCandle>();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const values = row.slice(0, 6).map(Number);
    if (!values.every(Number.isFinite)) continue;
    const [timestampMs, open, rawHigh, rawLow, close, volume] = values as [number, number, number, number, number, number];
    const timestamp = timestampMs / 1_000;
    if (timestampMs <= 0 || timestamp < fromSeconds || timestamp > toSeconds) continue;
    if (open <= 0 || rawHigh <= 0 || rawLow <= 0 || close <= 0 || volume < 0) continue;
    const high = Math.max(open, rawHigh, rawLow, close);
    const low = Math.min(open, rawHigh, rawLow, close);
    byTimestamp.set(timestamp, {
      timestamp,
      openSol: String(open),
      highSol: String(high),
      lowSol: String(low),
      closeSol: String(close),
      volume: String(volume),
    });
  }
  return [...byTimestamp.values()].sort((left, right) => left.timestamp - right.timestamp);
}

export function fillMissingCandleBuckets(candles: ReplayCandle[], seconds: number): ReplayCandle[] {
  if (candles.length < 2 || seconds <= 0) return candles;
  const filled: ReplayCandle[] = [candles[0]!];
  for (const candle of candles.slice(1)) {
    if (filled.length >= 1_000) break;
    const previous = filled.at(-1)!;
    for (let timestamp = previous.timestamp + seconds; timestamp < candle.timestamp - seconds * 0.25; timestamp += seconds) {
      filled.push({
        timestamp,
        openSol: previous.closeSol,
        highSol: previous.closeSol,
        lowSol: previous.closeSol,
        closeSol: previous.closeSol,
        volume: "0",
      });
      if (filled.length >= 1_000) break;
    }
    if (filled.length < 1_000) filled.push(candle);
  }
  return filled;
}

export async function fetchAxiomCandles(
  context: ShareContext,
  episode: TradeEpisode,
  preference: CandleIntervalPreference = "auto",
  options: FetchAxiomCandleOptions = {},
): Promise<{ candles: ReplayCandle[]; interval: number } | null> {
  const request = buildAxiomCandleRequest(context, episode, preference);
  if (!request) return null;
  const response = await (options.fetchImpl ?? fetch)(request.url, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
    signal: options.signal,
  });
  if (!response.ok) return null;
  const parsed = parseAxiomCandles(await response.json(), request.fromSeconds, request.toSeconds);
  const candles = options.fillMissing === false
    ? parsed
    : fillMissingCandleBuckets(parsed, request.intervalSeconds);
  return candles.length >= 2 ? { candles, interval: request.intervalSeconds } : null;
}
