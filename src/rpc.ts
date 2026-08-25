import Decimal from "decimal.js";
import { browser } from "wxt/browser";
import type { RpcSettings, TradeFill } from "./domain";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = new Decimal(1_000_000_000);
const RPC_START_INTERVAL_MS = 275;
let rpcStartQueue = Promise.resolve();
let lastRpcStart = 0;

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown | null;
  blockTime: number | null;
  confirmationStatus?: string | null;
}

type JsonRecord = Record<string, any>;

interface TransactionLoadResult {
  transactions: JsonRecord[];
  failed: number;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function waitForRpcTurn(): Promise<void> {
  const turn = rpcStartQueue.then(async () => {
    const remaining = RPC_START_INTERVAL_MS - (Date.now() - lastRpcStart);
    if (remaining > 0) await wait(remaining);
    lastRpcStart = Date.now();
  });
  rpcStartQueue = turn.catch(() => undefined);
  await turn;
}

export function resolveRpcEndpoint(settings: RpcSettings): string {
  if (settings.provider === "helius") {
    return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(settings.apiKey ?? "")}`;
  }
  return settings.endpoint ?? "";
}

export async function ensureRpcPermission(settings: RpcSettings): Promise<void> {
  if (settings.provider !== "custom" || !settings.endpoint) return;
  const response = await browser.runtime.sendMessage({
    type: "WICKLAPSE_ENSURE_RPC_PERMISSION",
    endpoint: settings.endpoint,
  }) as { ok?: boolean; error?: string } | undefined;
  if (!response?.ok) {
    throw new Error(response?.error ?? "Chrome needs permission to connect to this custom RPC host.");
  }
}

async function directRpcRequest<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
    const payload = (await response.json()) as RpcResponse<T>;
    if (payload.error) throw new Error(payload.error.message);
    if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
    return payload.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function rpcRequest<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
  // Cross-origin requests made by content scripts inherit the page's CORS rules. Route them through
  // the extension service worker, where the granted host permission is applied. Vitest has no Chrome
  // runtime, so the direct path remains available for deterministic unit tests.
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    return directRpcRequest<T>(endpoint, method, params);
  }
  await waitForRpcTurn();
  const response = await browser.runtime.sendMessage({
    type: "WICKLAPSE_RPC_REQUEST",
    endpoint,
    method,
    params,
  }) as { ok?: boolean; result?: T; error?: string } | undefined;
  if (!response?.ok) throw new Error(response?.error ?? `RPC ${method} failed.`);
  return response.result as T;
}

export async function testRpcConnection(settings: RpcSettings): Promise<number> {
  return rpcRequest<number>(resolveRpcEndpoint(settings), "getSlot", [{ commitment: "finalized" }]);
}

async function getAddressSignatures(
  settings: RpcSettings,
  address: string,
  options: { pageSize?: number; pages?: number } = {},
): Promise<SignatureInfo[]> {
  const endpoint = resolveRpcEndpoint(settings);
  const pageSize = Math.min(options.pageSize ?? 100, 1_000);
  const pages = Math.min(options.pages ?? 3, 10);
  const signatures: SignatureInfo[] = [];
  let before: string | undefined;

  for (let page = 0; page < pages; page += 1) {
    const config: Record<string, unknown> = { commitment: "finalized", limit: pageSize };
    if (before) config.before = before;
    const batch = await rpcRequest<SignatureInfo[]>(endpoint, "getSignaturesForAddress", [
      address,
      config,
    ]);
    signatures.push(...batch.filter((item) => item.err === null));
    if (batch.length < pageSize) break;
    before = batch.at(-1)?.signature;
  }
  return signatures;
}

export async function getWalletSignatures(
  settings: RpcSettings,
  options: { pageSize?: number; pages?: number } = {},
): Promise<SignatureInfo[]> {
  return getAddressSignatures(settings, settings.walletAddress, options);
}

async function getOwnedTokenAccounts(settings: RpcSettings, tokenMint: string): Promise<string[]> {
  const result = await rpcRequest<{ value: Array<{ pubkey: string }> }>(
    resolveRpcEndpoint(settings),
    "getTokenAccountsByOwner",
    [
      settings.walletAddress,
      { mint: tokenMint },
      { commitment: "finalized", encoding: "jsonParsed" },
    ],
  );
  return result.value.map((account) => account.pubkey).filter(Boolean);
}

function deduplicateSignatures(signatures: SignatureInfo[]): SignatureInfo[] {
  const unique = new Map<string, SignatureInfo>();
  for (const signature of signatures) unique.set(signature.signature, signature);
  return [...unique.values()].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
}

async function getTransactionWithRetry(
  endpoint: string,
  signature: SignatureInfo,
): Promise<JsonRecord | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await rpcRequest<JsonRecord | null>(endpoint, "getTransaction", [
        signature.signature,
        {
          commitment: "finalized",
          encoding: "jsonParsed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(350 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function getTransactions(settings: RpcSettings, signatures: SignatureInfo[]): Promise<TransactionLoadResult> {
  const endpoint = resolveRpcEndpoint(settings);
  const transactions: JsonRecord[] = [];
  let failed = 0;
  const concurrency = 3;
  for (let index = 0; index < signatures.length; index += concurrency) {
    const batch = signatures.slice(index, index + concurrency);
    const results = await Promise.all(
      batch.map(async (signature) => {
        try {
          const transaction = await getTransactionWithRetry(endpoint, signature);
          if (!transaction) {
            failed += 1;
            return null;
          }
          return { ...transaction, _signature: signature.signature };
        } catch {
          failed += 1;
          return null;
        }
      }),
    );
    for (const item of results) {
      if (item) transactions.push(item);
    }
  }
  return { transactions, failed };
}

function accountKey(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "pubkey" in value) return String((value as JsonRecord).pubkey);
  return "";
}

function tokenBalanceMap(entries: JsonRecord[] | undefined, owner: string, mint: string): Map<number, JsonRecord> {
  const result = new Map<number, JsonRecord>();
  for (const entry of entries ?? []) {
    if (entry?.mint !== mint || (entry?.owner && entry.owner !== owner)) continue;
    result.set(Number(entry.accountIndex), entry);
  }
  return result;
}

function sumTokenRaw(entries: Map<number, JsonRecord>): bigint {
  let total = 0n;
  for (const entry of entries.values()) {
    total += BigInt(entry.uiTokenAmount?.amount ?? "0");
  }
  return total;
}

function tokenDecimals(entries: Map<number, JsonRecord>): number {
  return Number(entries.values().next().value?.uiTokenAmount?.decimals ?? 0);
}

function hasWalletTokenChange(transaction: JsonRecord, walletAddress: string, tokenMint: string): boolean {
  if (!transaction?.meta || transaction.meta.err) return false;
  const preToken = tokenBalanceMap(transaction.meta.preTokenBalances, walletAddress, tokenMint);
  const postToken = tokenBalanceMap(transaction.meta.postTokenBalances, walletAddress, tokenMint);
  return sumTokenRaw(preToken) !== sumTokenRaw(postToken);
}

export function parseTradeFill(transaction: JsonRecord, walletAddress: string, tokenMint: string): TradeFill | null {
  if (!transaction?.meta || transaction.meta.err) return null;
  const keys = transaction.transaction?.message?.accountKeys ?? [];
  const walletIndex = keys.findIndex((key: unknown) => accountKey(key) === walletAddress);
  if (walletIndex < 0) return null;

  const preToken = tokenBalanceMap(transaction.meta.preTokenBalances, walletAddress, tokenMint);
  const postToken = tokenBalanceMap(transaction.meta.postTokenBalances, walletAddress, tokenMint);
  const preRaw = sumTokenRaw(preToken);
  const postRaw = sumTokenRaw(postToken);
  const tokenDelta = postRaw - preRaw;
  if (tokenDelta === 0n) return null;

  const preWrapped = tokenBalanceMap(transaction.meta.preTokenBalances, walletAddress, WRAPPED_SOL_MINT);
  const postWrapped = tokenBalanceMap(transaction.meta.postTokenBalances, walletAddress, WRAPPED_SOL_MINT);
  const wrappedDelta = sumTokenRaw(postWrapped) - sumTokenRaw(preWrapped);
  const nativeDelta =
    BigInt(transaction.meta.postBalances?.[walletIndex] ?? 0) -
    BigInt(transaction.meta.preBalances?.[walletIndex] ?? 0);
  const fee = BigInt(transaction.meta.fee ?? 0);
  const combinedDelta = nativeDelta + wrappedDelta;
  const side = tokenDelta > 0n ? "buy" : "sell";
  const quoteLamports = side === "buy" ? -combinedDelta - fee : combinedDelta + fee;

  // A token-only transfer has no meaningful opposite SOL movement and is not a trade fill.
  if (quoteLamports <= 5_000n) return null;

  const decimals = tokenDecimals(postToken.size ? postToken : preToken);
  const tokenAbsolute = new Decimal(tokenDelta < 0n ? -tokenDelta : tokenDelta).div(
    new Decimal(10).pow(decimals),
  );
  const quoteSol = new Decimal(quoteLamports.toString()).div(LAMPORTS_PER_SOL);
  const estimatedPriceSol = tokenAbsolute.isZero() ? new Decimal(0) : quoteSol.div(tokenAbsolute);

  return {
    signature: String(transaction._signature ?? transaction.transaction.signatures?.[0] ?? ""),
    slot: Number(transaction.slot ?? 0),
    timestamp: Number(transaction.blockTime ?? 0),
    side,
    tokenMint,
    tokenDecimals: decimals,
    tokenAmountRaw: (tokenDelta < 0n ? -tokenDelta : tokenDelta).toString(),
    quoteLamports: quoteLamports.toString(),
    networkFeeLamports: fee.toString(),
    walletPostTokenRaw: postRaw.toString(),
    estimatedPriceSol: estimatedPriceSol.toString(),
  };
}

export async function findWalletTradeFills(
  settings: RpcSettings,
  tokenMint: string,
  onProgress?: (message: string) => void,
): Promise<TradeFill[]> {
  onProgress?.("Locating the wallet's token account…");
  let signatures: SignatureInfo[] = [];
  try {
    const tokenAccounts = await getOwnedTokenAccounts(settings, tokenMint);
    const tokenSignaturePages = await Promise.all(
      tokenAccounts.slice(0, 4).map((address) =>
        getAddressSignatures(settings, address, { pageSize: 50, pages: 2 }),
      ),
    );
    signatures = deduplicateSignatures(tokenSignaturePages.flat());
  } catch {
    // Some RPC providers restrict token-account discovery. The broader wallet scan remains available below.
  }

  if (!signatures.length) {
    onProgress?.("No active token-account history found; scanning recent wallet signatures…");
    signatures = await getWalletSignatures(settings);
  } else {
    onProgress?.(`Found ${signatures.length} token-specific transactions…`);
  }

  if (!signatures.length) {
    throw new Error(
      "This address has no finalized transactions in the loaded history. Confirm that it is the active Axiom trading wallet.",
    );
  }
  onProgress?.(`Inspecting ${signatures.length} finalized transactions…`);
  const { transactions, failed } = await getTransactions(settings, signatures);
  const failureRatio = failed / signatures.length;
  if (!transactions.length || failureRatio >= 0.25) {
    throw new Error(
      `The RPC returned ${transactions.length} of ${signatures.length} requested transactions. ` +
        "It is rate-limiting or rejecting history requests; wait briefly and retry, or use a higher-throughput RPC plan.",
    );
  }

  const tokenChanges = transactions.filter((transaction) =>
    hasWalletTokenChange(transaction, settings.walletAddress, tokenMint),
  ).length;
  const fills = transactions
    .map((transaction) => parseTradeFill(transaction, settings.walletAddress, tokenMint))
    .filter((fill): fill is TradeFill => fill !== null)
    .sort((a, b) => a.timestamp - b.timestamp || a.slot - b.slot);

  if (!fills.length && tokenChanges === 0) {
    throw new Error(
      `No balance changes for this mint were found in the ${transactions.length} loaded transactions. ` +
        "Confirm that this is the active Axiom trading wallet—not a funding or withdrawal wallet—and that the token CA is correct.",
    );
  }
  if (!fills.length) {
    throw new Error(
      `Found ${tokenChanges} token balance change${tokenChanges === 1 ? "" : "s"}, but no corresponding SOL leg. ` +
        "This swap route is not supported by the first-build parser yet.",
    );
  }

  onProgress?.(`Found ${fills.length} matching trade fills from ${transactions.length} transactions.`);
  return fills;
}
