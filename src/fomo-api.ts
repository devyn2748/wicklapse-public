import Decimal from "decimal.js";
import { canonicalChainId } from "./chains";
import { ShareContextSchema, TradeExecutionSchema, type ReplayCandle, type ShareContext, type TradeExecution } from "./domain";

export const FOMO_API_ORIGIN = "https://prod-api.fomo.family";

export interface FomoCapturedResponse {
  url: string;
  payload: unknown;
  capturedAt: number;
  requestBody?: unknown;
}

const FOMO_CANDLE_PERIODS = [
  { period: "1s", seconds: 1 },
  { period: "5s", seconds: 5 },
  { period: "15s", seconds: 15 },
  { period: "30s", seconds: 30 },
  { period: "1m", seconds: 60 },
  { period: "5m", seconds: 300 },
  { period: "15m", seconds: 900 },
  { period: "30m", seconds: 1_800 },
  { period: "1h", seconds: 3_600 },
  { period: "4h", seconds: 14_400 },
  { period: "12h", seconds: 43_200 },
  { period: "1d", seconds: 86_400 },
  { period: "1w", seconds: 604_800 },
] as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function identifierValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
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

function fieldStrings(value: unknown, names: Set<string>): string[] {
  return collectRecords(value).flatMap((item) => Object.entries(item).flatMap(([key, raw]) => (
    names.has(key.toLowerCase()) && (typeof raw === "string" || typeof raw === "number")
      ? [String(raw)]
      : []
  )));
}

const TOKEN_FIELDS = new Set(["address", "token", "tokenaddress", "tokenmint", "mint", "baseaddress"]);
const CHAIN_FIELDS = new Set(["chain", "chainid", "chain_id", "network", "networkid", "network_id"]);

/** Requires both token and chain identity when associating captured Fomo candles with a trade. */
export function fomoCandleCaptureMatches(
  capture: Pick<FomoCapturedResponse, "url" | "requestBody">,
  tokenAddress: string,
  chainId: string | null | undefined,
): boolean {
  try {
    const url = new URL(capture.url);
    const expectedToken = tokenAddress.toLowerCase();
    const expectedChain = canonicalChainId(chainId);
    const tokenCandidates = [
      url.searchParams.get("address"),
      url.searchParams.get("tokenAddress"),
      url.searchParams.get("token"),
      url.searchParams.get("mint"),
      ...fieldStrings(capture.requestBody, TOKEN_FIELDS),
    ].filter((value): value is string => Boolean(value));
    if (!tokenCandidates.some((value) => value.toLowerCase() === expectedToken)) return false;
    const chainCandidates = [
      url.searchParams.get("chainId"),
      url.searchParams.get("networkId"),
      url.searchParams.get("network"),
      url.searchParams.get("chain"),
      ...fieldStrings(capture.requestBody, CHAIN_FIELDS),
    ].filter((value): value is string => Boolean(value));
    if (!expectedChain) return chainCandidates.length === 0;
    return chainCandidates.some((value) => canonicalChainId(value) === expectedChain);
  } catch {
    return false;
  }
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

function transferRecords(payload: unknown): JsonRecord[] {
  return collectRecords(responseObject(payload)).filter((candidate) => (
    identifierValue(candidate.fromTradeId, candidate.toTradeId) !== null &&
    candidate.humanAmount !== undefined &&
    candidate.usdAmount !== undefined
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

function targetTradeIdForSwap(swap: JsonRecord, tokenAddress: string): string | null {
  const normalizedToken = tokenAddress.toLowerCase();
  const inAddress = stringValue(swap.inTokenAddress)?.toLowerCase();
  const outAddress = stringValue(swap.outTokenAddress)?.toLowerCase();
  if (outAddress === normalizedToken) return identifierValue(swap.outTradeId);
  if (inAddress === normalizedToken) return identifierValue(swap.inTradeId);
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
  const hasTradeIdentity = identifierValue(swap.inTradeId, swap.outTradeId) !== null;
  const buysTarget = swap.outTradeId === tradeId || (!hasTradeIdentity && outAddress === tokenAddress);
  const sellsTarget = swap.inTradeId === tradeId || (!hasTradeIdentity && inAddress === tokenAddress);
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

/** Treats a priced token withdrawal from a Fomo trade as its closing execution. */
function executionFromTransferExit(
  transfer: JsonRecord,
  index: number,
  tradeId: string,
  tokenAddress: string,
  chainId: string,
  tokenDecimals: number,
  wallet: string,
): TradeExecution | null {
  if (identifierValue(transfer.fromTradeId) !== tradeId) return null;
  const transferToken = stringValue(transfer.tokenAddress);
  if (transferToken && transferToken.toLowerCase() !== tokenAddress.toLowerCase()) return null;
  const transferChain = identifierValue(transfer.networkId);
  if (transferChain && canonicalChainId(transferChain) !== canonicalChainId(chainId)) return null;
  const tokenAmount = numberValue(transfer.humanAmount);
  const totalUsd = numberValue(transfer.usdAmount);
  const timestamp = unixSeconds(transfer.createdAt ?? transfer.timestamp);
  if (!tokenAmount || tokenAmount <= 0 || totalUsd === null || totalUsd <= 0 || !timestamp) return null;
  const priceUsd = totalUsd / tokenAmount;
  const signature = stringValue(transfer.id, transfer.transactionHash, transfer.txHash)
    ?? `${tradeId}:transfer-out:${timestamp}:${index}`;
  return TradeExecutionSchema.parse({
    side: "sell",
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

/** Returns only a candle capture that materially overlaps the selected Fomo trade. */
export function selectFomoCandlesForTrade(
  captures: FomoCapturedResponse[],
  executions: TradeExecution[],
  tokenAddress: string,
  chainId: string | null | undefined,
): ReplayCandle[] {
  const timestamps = executions.map((execution) => execution.timestamp).filter(Number.isFinite);
  if (!timestamps.length) return [];
  const tradeStart = Math.min(...timestamps);
  const tradeEnd = Math.max(...timestamps);
  const tradeSpan = Math.max(1, tradeEnd - tradeStart);
  const padding = Math.max(30, tradeSpan * 0.15);
  const windowStart = tradeStart - padding;
  const windowEnd = tradeEnd + padding;
  return captures
    .filter((capture) => fomoCandleCaptureMatches(capture, tokenAddress, chainId))
    .map((capture) => {
      const candles = parseFomoCandles(capture.payload)
        .filter((candle) => candle.timestamp >= windowStart && candle.timestamp <= windowEnd)
        .filter((candle, index, source) => index === 0 || candle.timestamp !== source[index - 1]!.timestamp);
      const intervals = candles.slice(1).map((candle, index) => candle.timestamp - candles[index]!.timestamp).filter((value) => value > 0);
      // Mobula omits empty intervals instead of emitting flat candles. Sparse
      // tokens can therefore return their first valid bar a few minutes after
      // the first execution even though the requested window is correct.
      const tolerance = Math.max(300, intervals.length ? Math.min(...intervals) * 2 : 30);
      const coversTrade = Boolean(candles[0] && candles.at(-1)
        && candles[0].timestamp <= tradeStart + tolerance
        && candles.at(-1)!.timestamp >= tradeEnd - tolerance);
      return { capturedAt: capture.capturedAt, candles: coversTrade ? candles : [] };
    })
    .filter((candidate) => candidate.candles.length >= 2)
    .sort((left, right) => right.candles.length - left.candles.length || right.capturedAt - left.capturedAt)[0]?.candles ?? [];
}

/** Builds a bounded Mobula request around the selected trade without changing its token or chain. */
export function focusedFomoCandleUrl(
  capturedUrl: string,
  executions: TradeExecution[],
  openPositionEndTimestamp?: number,
): string | null {
  let url: URL;
  try {
    url = new URL(capturedUrl);
  } catch {
    return null;
  }
  if (url.origin !== "https://fomo-api.mobula.io" || url.pathname !== "/api/2/token/ohlcv-history") return null;
  if (!url.searchParams.get("address") || !url.searchParams.get("chainId") || !executions.length) return null;
  const capturedChain = canonicalChainId(url.searchParams.get("chainId"));
  const executionChains = new Set(executions.map((execution) => canonicalChainId(execution.chainId)).filter(Boolean));
  if (executionChains.size !== 1 || !capturedChain || !executionChains.has(capturedChain)) return null;
  const timestamps = executions.map((execution) => execution.timestamp).filter(Number.isFinite);
  if (!timestamps.length) return null;
  const tradeStart = Math.min(...timestamps);
  const latestExecution = Math.max(...timestamps);
  const tradeEnd = Math.max(latestExecution, openPositionEndTimestamp ?? latestExecution);
  const tradeSpan = Math.max(1, tradeEnd - tradeStart);
  const padding = Math.max(30, tradeSpan * 0.15);
  const fromSeconds = Math.max(0, Math.floor(tradeStart - padding));
  const toSeconds = Math.ceil(tradeEnd + padding);
  const windowSeconds = Math.max(1, toSeconds - fromSeconds);
  const targetPeriod = FOMO_CANDLE_PERIODS.find((candidate) => windowSeconds / candidate.seconds <= 240)
    ?? FOMO_CANDLE_PERIODS.at(-1)!;
  url.searchParams.set("period", targetPeriod.period);
  url.searchParams.set("usd", "true");
  url.searchParams.set("from", String(fromSeconds * 1_000));
  url.searchParams.set("to", String(toSeconds * 1_000));
  url.searchParams.set("amount", "1000");
  return url.toString();
}

export function parseFomoTradeResponse(
  payload: unknown,
  options: {
    tradeId: string;
    pageUrl: string;
    profileHandle?: string | null;
    capturedAt?: number;
    candles?: ReplayCandle[];
    relatedPayloads?: unknown[];
    relatedTradeGapSeconds?: number;
  },
): ShareContext | null {
  const trade = tradeRecord(payload, options.tradeId);
  const swaps = swapRecords(payload);
  const tokenAddress = inferTokenAddress(trade, swaps, options.tradeId);
  if (!trade || !tokenAddress) return null;
  const metadata = nestedMetadata(trade);
  const token = tokenInfo(metadata);
  const chainId = identifierValue(
    trade.networkId,
    metadata?.networkId,
    token?.networkId,
    swaps.find((swap) => swap.inTradeId === options.tradeId)?.inNetworkId,
    swaps.find((swap) => swap.outTradeId === options.tradeId)?.outNetworkId,
  ) ?? "unknown";
  const tokenDecimals = Math.max(0, Math.min(30, Math.trunc(numberValue(token?.decimals, metadata?.decimals) ?? 9)));
  const handle = options.profileHandle ?? fomoHandleFromUrl(options.pageUrl);
  const wallet = stringValue(trade.userId, record(trade.user)?.id, handle) ?? "fomo-user";
  const swapExecutions = swaps
    .map((swap, index) => executionFromSwap(swap, index, options.tradeId, tokenAddress, chainId, tokenDecimals, wallet))
    .filter((execution): execution is TradeExecution => execution !== null);
  const transferExecutions = transferRecords(payload)
    .map((transfer, index) => executionFromTransferExit(transfer, index, options.tradeId, tokenAddress, chainId, tokenDecimals, wallet))
    .filter((execution): execution is TradeExecution => execution !== null);
  const exactExecutions = [...swapExecutions, ...transferExecutions]
    .filter((execution, index, source) => source.findIndex((candidate) => candidate.signature === execution.signature) === index)
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  if (!exactExecutions.length) return null;
  const currentStart = exactExecutions[0]!.timestamp;
  const currentEnd = exactExecutions.at(-1)!.timestamp;
  const currentSwapWallet = stringValue(swaps.find((swap) => targetTradeIdForSwap(swap, tokenAddress) === options.tradeId)?.address);
  const relatedGroups = new Map<string, TradeExecution[]>();
  const relatedSwaps = (options.relatedPayloads ?? []).flatMap((relatedPayload) => swapRecords(relatedPayload));
  for (const [index, swap] of relatedSwaps.entries()) {
    const relatedTradeId = targetTradeIdForSwap(swap, tokenAddress);
    if (!relatedTradeId || relatedTradeId === options.tradeId) continue;
    const targetIsOutput = stringValue(swap.outTokenAddress)?.toLowerCase() === tokenAddress.toLowerCase();
    const swapChainId = identifierValue(targetIsOutput ? swap.outNetworkId : swap.inNetworkId, swap.networkId);
    if (swapChainId && canonicalChainId(swapChainId) !== canonicalChainId(chainId)) continue;
    const swapWallet = stringValue(swap.address);
    if (currentSwapWallet && swapWallet && currentSwapWallet.toLowerCase() !== swapWallet.toLowerCase()) continue;
    const execution = executionFromSwap(swap, index, relatedTradeId, tokenAddress, chainId, tokenDecimals, wallet);
    if (!execution) continue;
    const group = relatedGroups.get(relatedTradeId) ?? [];
    group.push(execution);
    relatedGroups.set(relatedTradeId, group);
  }
  const relatedGap = Math.max(0, options.relatedTradeGapSeconds ?? 3_600);
  const relatedExecutions = [...relatedGroups.values()].flatMap((group) => {
    const boughtTokens = group.filter((execution) => execution.side === "buy")
      .reduce((total, execution) => total.plus(execution.tokenAmount), new Decimal(0));
    const soldTokens = group.filter((execution) => execution.side === "sell")
      .reduce((total, execution) => total.plus(execution.tokenAmount), new Decimal(0));
    // Do not let a later dust buy or partially open position turn a completed
    // replay into a multi-hour open chart. Only completed sibling cycles merge.
    if (boughtTokens.lte(0) || soldTokens.lt(boughtTokens.mul("0.999"))) return [];
    const timestamps = group.map((execution) => execution.timestamp);
    const groupStart = Math.min(...timestamps);
    const groupEnd = Math.max(...timestamps);
    return groupStart <= currentEnd + relatedGap && groupEnd >= currentStart - relatedGap ? group : [];
  });
  const executions = [...exactExecutions, ...relatedExecutions]
    .filter((execution, index, source) => source.findIndex((candidate) => candidate.signature === execution.signature) === index)
    .sort((left, right) => left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
  const relatedTradeCount = new Set(executions.map((execution) => execution.providerTradeId).filter(Boolean)).size;
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
  const providerClosedAt = isClosed ? unixSeconds(trade.closedAt ?? trade.updatedAt) : null;
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
    sourceText: relatedTradeCount > 1 ? `Fomo trade ${options.tradeId} with ${relatedTradeCount - 1} nearby same-token trade${relatedTradeCount === 2 ? "" : "s"}` : `Fomo trade ${options.tradeId}`,
    provider: "fomo",
    chainId,
    providerTradeId: options.tradeId,
    providerClosedAt,
    profileHandle: handle,
    tradeExecutions: executions,
    primaryTradeExecutions: exactExecutions,
    capturedCandles: options.candles?.slice(-10_000),
  });
}
