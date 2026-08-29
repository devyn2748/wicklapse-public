import Decimal from "decimal.js";
import { ShareContextSchema, TradeExecutionSchema, type ReplayCandle, type ShareContext, type TradeExecution } from "./domain";

export const FOMO_API_ORIGIN = "https://prod-api.fomo.family";

export interface FomoCapturedResponse {
  url: string;
  payload: unknown;
  capturedAt: number;
  requestBody?: unknown;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function decimalString(value: number): string {
  return new Decimal(value).abs().toString();
}

function unixSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e11 ? value / 1_000 : value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric > 1e11 ? numeric / 1_000 : numeric;
    const milliseconds = Date.parse(value);
    if (Number.isFinite(milliseconds)) return milliseconds / 1_000;
  }
  return null;
}

function responseObject(payload: unknown): unknown {
  const root = record(payload);
  return root?.responseObject ?? root?.data ?? payload;
}

function collectRecords(value: unknown, maximum = 20_000): JsonRecord[] {
  const results: JsonRecord[] = [];
  const queue: unknown[] = [value];
  const seen = new Set<object>();
  while (queue.length && results.length < maximum) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const item = current as JsonRecord;
    results.push(item);
    queue.push(...Object.values(item));
  }
  return results;
}

export function fomoTradeIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("tradeId")?.trim() || null;
  } catch {
    return null;
  }
}

export function fomoHandleFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/^\/profile\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function tradeRecord(payload: unknown, tradeId: string): JsonRecord | null {
  for (const candidate of collectRecords(responseObject(payload))) {
    if (candidate.id === tradeId) return candidate;
    const nested = record(candidate.trade);
    if (nested?.id === tradeId) return nested;
  }
  const root = record(responseObject(payload));
  return record(root?.trade) ?? root;
}

function nestedMetadata(trade: JsonRecord | null): JsonRecord | null {
  const direct = record(trade?.tokenMetadata);
  return direct ?? record(record(trade?.token)?.metadata) ?? record(trade?.token);
}

function tokenInfo(metadata: JsonRecord | null): JsonRecord | null {
  return record(metadata?.token) ?? metadata;
}

function swapRecords(payload: unknown): JsonRecord[] {
  return collectRecords(responseObject(payload)).filter((candidate) => (
    stringValue(candidate.inTokenAddress) !== null &&
    stringValue(candidate.outTokenAddress) !== null &&
    (candidate.inHumanAmount !== undefined || candidate.outHumanAmount !== undefined)
  ));
}

function inferTokenAddress(trade: JsonRecord | null, swaps: JsonRecord[], tradeId: string): string | null {
  const metadata = nestedMetadata(trade);
  const token = tokenInfo(metadata);
  const explicit = stringValue(trade?.tokenAddress, token?.address, metadata?.tokenAddress);
  if (explicit) return explicit;
  for (const swap of swaps) {
    if (swap.outTradeId === tradeId) return stringValue(swap.outTokenAddress);
    if (swap.inTradeId === tradeId) return stringValue(swap.inTokenAddress);
  }
  return null;
}

function executionFromSwap(
  swap: JsonRecord,
  index: number,
  tradeId: string,
  tokenAddress: string,
  chainId: string,
  tokenDecimals: number,
  wallet: string,
): TradeExecution | null {
  const inAddress = stringValue(swap.inTokenAddress);
  const outAddress = stringValue(swap.outTokenAddress);
  const buysTarget = swap.outTradeId === tradeId || outAddress === tokenAddress;
  const sellsTarget = swap.inTradeId === tradeId || inAddress === tokenAddress;
  if (buysTarget === sellsTarget) return null;
  const side = buysTarget ? "buy" : "sell";
  const tokenAmount = numberValue(buysTarget ? swap.outHumanAmount : swap.inHumanAmount);
  const totalUsd = numberValue(
    buysTarget ? swap.humanUsdAmountIn : swap.humanUsdAmountOut,
    swap.usdAmount,
    swap.humanUsdAmount,
  );
  const timestamp = unixSeconds(swap.createdAt ?? swap.timestamp ?? swap.executedAt);
  if (!tokenAmount || tokenAmount <= 0 || totalUsd === null || totalUsd < 0 || !timestamp) return null;
  const priceUsd = totalUsd / tokenAmount;
  const signature = stringValue(swap.id, swap.transactionHash, swap.txHash, swap.signature)
    ?? `${tradeId}:${timestamp}:${index}`;
  return TradeExecutionSchema.parse({
    side,
    timestamp,
    tokenAmount: decimalString(tokenAmount),
    priceSol: decimalString(priceUsd),
    priceUsd: decimalString(priceUsd),
    totalSol: decimalString(totalUsd),
    totalUsd: decimalString(totalUsd),
    wallet,
    signature,
    pairAddress: tokenAddress,
    source: "fomo",
    chainId,
    providerTradeId: tradeId,
    tokenDecimals,
    quoteCurrency: "USD",
    quoteScale: "1000000",
  });
}

export function parseFomoCandles(payload: unknown): ReplayCandle[] {
  const root = record(payload);
  const unwrapped = responseObject(payload);
  const directBars = Array.isArray(root?.data)
    ? root.data
    : Array.isArray(unwrapped) ? unwrapped : null;
  if (directBars) {
    return directBars.flatMap((raw): ReplayCandle[] => {
      const item = Array.isArray(raw) ? null : record(raw);
      const values = Array.isArray(raw) ? raw : [];
      const timestamp = unixSeconds(values[0] ?? item?.t ?? item?.time);
      const open = numberValue(values[1] ?? item?.o ?? item?.open);
      const high = numberValue(values[2] ?? item?.h ?? item?.high);
      const low = numberValue(values[3] ?? item?.l ?? item?.low);
      const close = numberValue(values[4] ?? item?.c ?? item?.close);
      const volume = numberValue(values[5] ?? item?.v ?? item?.volume) ?? 0;
      if (!timestamp || open === null || high === null || low === null || close === null || open <= 0 || high <= 0 || low <= 0 || close <= 0) return [];
      return [{
        timestamp,
        openSol: decimalString(open),
        highSol: decimalString(high),
        lowSol: decimalString(low),
        closeSol: decimalString(close),
        volume: decimalString(Math.max(0, volume)),
      }];
    }).sort((left, right) => left.timestamp - right.timestamp);
  }
  const records = collectRecords(responseObject(payload));
  const series = records.find((candidate) => Array.isArray(candidate.t) && Array.isArray(candidate.c));
  if (!series) return [];
  const times = series.t as unknown[];
  const opens = Array.isArray(series.o) ? series.o : [];
  const highs = Array.isArray(series.h) ? series.h : [];
  const lows = Array.isArray(series.l) ? series.l : [];
  const closes = series.c as unknown[];
  const volumes = Array.isArray(series.volume) ? series.volume : Array.isArray(series.v) ? series.v : [];
  return times.flatMap((rawTime, index): ReplayCandle[] => {
    const timestamp = unixSeconds(rawTime);
    const open = numberValue(opens[index]);
    const high = numberValue(highs[index]);
    const low = numberValue(lows[index]);
    const close = numberValue(closes[index]);
    const volume = numberValue(volumes[index]) ?? 0;
    if (!timestamp || open === null || high === null || low === null || close === null || open <= 0 || high <= 0 || low <= 0 || close <= 0) return [];
    return [{
      timestamp,
      openSol: decimalString(open),
      highSol: decimalString(high),
      lowSol: decimalString(low),
      closeSol: decimalString(close),
      volume: decimalString(Math.max(0, volume)),
    }];
  }).sort((left, right) => left.timestamp - right.timestamp);
}

export function parseFomoTradeResponse(
  payload: unknown,
  options: { tradeId: string; pageUrl: string; profileHandle?: string | null; capturedAt?: number; candles?: ReplayCandle[] },
): ShareContext | null {
  const trade = tradeRecord(payload, options.tradeId);
  const swaps = swapRecords(payload);
  const tokenAddress = inferTokenAddress(trade, swaps, options.tradeId);
  if (!trade || !tokenAddress) return null;
  const metadata = nestedMetadata(trade);
  const token = tokenInfo(metadata);
  const chainId = stringValue(
    trade.networkId,
    metadata?.networkId,
    token?.networkId,
    swaps.find((swap) => swap.inTradeId === options.tradeId)?.inNetworkId,
    swaps.find((swap) => swap.outTradeId === options.tradeId)?.outNetworkId,
  ) ?? "unknown";
  const tokenDecimals = Math.max(0, Math.min(30, Math.trunc(numberValue(token?.decimals, metadata?.decimals) ?? 9)));
  const handle = options.profileHandle ?? fomoHandleFromUrl(options.pageUrl);
  const wallet = stringValue(trade.userId, record(trade.user)?.id, handle) ?? "fomo-user";
  const executions = swaps
    .map((swap, index) => executionFromSwap(swap, index, options.tradeId, tokenAddress, chainId, tokenDecimals, wallet))
    .filter((execution): execution is TradeExecution => execution !== null)
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  if (!executions.length) return null;
  const symbol = stringValue(metadata?.symbol, token?.symbol, trade.symbol) ?? "TOKEN";
  const tokenName = stringValue(metadata?.name, token?.name, trade.tokenName);
  const tokenImageUrl = stringValue(
    record(token?.info)?.imageThumbUrl,
    record(token?.info)?.imageUrl,
    metadata?.imageUrl,
    metadata?.image,
  );
  const remaining = numberValue(trade.humanAmountRemaining, trade.remainingAmount);
  const isClosed = trade.closedAt != null || trade.status === "closed" || remaining === 0;
  return ShareContextSchema.parse({
    id: crypto.randomUUID(),
    capturedAt: options.capturedAt ?? Date.now(),
    pageUrl: options.pageUrl,
    tokenMint: tokenAddress,
    pairAddress: tokenAddress,
    symbol: symbol.replace(/^\$/, "").slice(0, 32),
    tokenName,
    tokenImageUrl: tokenImageUrl && URL.canParse(tokenImageUrl) ? tokenImageUrl : null,
    walletAddress: null,
    walletLabel: handle ? `@${handle}` : "Fomo account",
    boughtSol: null,
    soldSol: null,
    holdingSol: null,
    pnlSol: null,
    roiPercent: null,
    positionStatus: isClosed ? "closed" : "open",
    sourceText: `Fomo trade ${options.tradeId}`,
    provider: "fomo",
    chainId,
    providerTradeId: options.tradeId,
    profileHandle: handle,
    tradeExecutions: executions,
    capturedCandles: options.candles?.slice(-10_000),
  });
}
