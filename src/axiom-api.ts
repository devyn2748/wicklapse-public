import Decimal from "decimal.js";
import { SolanaAddressSchema, TradeExecutionSchema, type TradeExecution } from "./domain";

export const AXIOM_TRANSACTIONS_FEED_URL = "https://api3.axiom.trade/transactions-feed-v4";

export interface AxiomTransactionsRequest {
  pairAddress: string;
  walletAddresses: string[];
}

export function pairAddressFromAxiomUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.hostname !== "axiom.trade" && !url.hostname.endsWith(".axiom.trade")) return null;
    const candidate = url.pathname.match(/^\/meme\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\/|$)/)?.[1];
    return candidate && SolanaAddressSchema.safeParse(candidate).success ? candidate : null;
  } catch {
    return null;
  }
}

interface FetchOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function decimalString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  try {
    const parsed = new Decimal(String(value).trim());
    if (!parsed.isFinite() || parsed.isNegative()) return null;
    return parsed.toFixed();
  } catch {
    return null;
  }
}

export function normalizeWalletAddresses(values: readonly string[]): string[] {
  const candidates = values.flatMap((value) => value.split(/[\s,]+/)).map((value) => value.trim()).filter(Boolean);
  return [...new Set(candidates)].filter((value) => SolanaAddressSchema.safeParse(value).success);
}

export function parseAxiomTransactionRow(
  row: unknown,
  expectedPairAddress?: string,
  expectedWallets?: ReadonlySet<string>,
): TradeExecution | null {
  if (!Array.isArray(row) || row.length < 12) return null;
  const signature = row[0];
  const pairAddress = row[1];
  const rawSide = row[2];
  const rawTimestamp = row[3];
  const wallet = row[6];
  if (
    typeof signature !== "string" ||
    typeof pairAddress !== "string" ||
    typeof rawSide !== "string" ||
    typeof rawTimestamp !== "string" ||
    typeof wallet !== "string"
  ) return null;

  const side = rawSide.toLowerCase();
  const isIsoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(rawTimestamp);
  const timestampMs = Date.parse(rawTimestamp);
  if ((side !== "buy" && side !== "sell") || !isIsoTimestamp || !Number.isFinite(timestampMs) || timestampMs <= 0) return null;
  if (expectedPairAddress && pairAddress !== expectedPairAddress) return null;
  if (expectedWallets?.size && !expectedWallets.has(wallet)) return null;

  const tokenAmount = decimalString(row[9]);
  const priceSol = decimalString(row[7]);
  const priceUsd = decimalString(row[8]);
  const totalSol = decimalString(row[10]);
  const totalUsd = decimalString(row[11]);
  if (!tokenAmount || new Decimal(tokenAmount).isZero() || priceSol === null || priceUsd === null || totalSol === null || totalUsd === null) {
    return null;
  }

  const parsed = TradeExecutionSchema.safeParse({
    side,
    timestamp: timestampMs / 1_000,
    tokenAmount,
    priceSol,
    priceUsd,
    totalSol,
    totalUsd,
    wallet,
    signature,
    pairAddress,
    source: "axiom",
  });
  return parsed.success ? parsed.data : null;
}

function responseRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["transactions", "rows", "results", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  if (record.data && typeof record.data === "object") return responseRows(record.data);
  return [];
}

export function parseAxiomTransactionsResponse(
  payload: unknown,
  request: AxiomTransactionsRequest,
): TradeExecution[] {
  const wallets = new Set(normalizeWalletAddresses(request.walletAddresses));
  if (!wallets.size) return [];
  const bySignature = new Map<string, TradeExecution>();
  for (const row of responseRows(payload)) {
    const execution = parseAxiomTransactionRow(row, request.pairAddress, wallets);
    if (execution && !bySignature.has(execution.signature)) bySignature.set(execution.signature, execution);
  }
  return [...bySignature.values()].sort((left, right) =>
    left.timestamp - right.timestamp || left.signature.localeCompare(right.signature));
}

export async function fetchAxiomExecutions(
  request: AxiomTransactionsRequest,
  options: FetchOptions = {},
): Promise<TradeExecution[]> {
  const pairAddress = SolanaAddressSchema.parse(request.pairAddress);
  const walletAddresses = normalizeWalletAddresses(request.walletAddresses);
  if (!walletAddresses.length) throw new Error("Add at least one public Axiom trading wallet in Advanced settings.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await (options.fetchImpl ?? fetch)(AXIOM_TRANSACTIONS_FEED_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pairAddress,
        orderBy: "DESC",
        makerAddress: walletAddresses.join(","),
        v: (options.now ?? Date.now)(),
      }),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Axiom rejected the trade lookup. Sign in to Axiom again and retry.");
    }
    if (response.status === 429) throw new Error("Axiom is rate-limiting trade lookups. Wait a moment and retry.");
    if (!response.ok) throw new Error(`Axiom trade lookup returned HTTP ${response.status}.`);
    return parseAxiomTransactionsResponse(await response.json(), { pairAddress, walletAddresses });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Axiom trade lookup timed out after 20 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
