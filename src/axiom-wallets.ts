import { SolanaAddressSchema } from "./domain";
import { normalizeWalletAddresses } from "./axiom-api";
import { browser } from "wxt/browser";

export const AXIOM_WALLETS_URL = "https://api.axiom.trade/bundle-key-and-wallets-v2";

interface FetchAxiomWalletOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

interface AxiomPublicWallet {
  address: string;
  isPrimary: boolean;
  name: string | null;
}

function walletRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  const wallets = (payload as Record<string, unknown>).wallets;
  if (Array.isArray(wallets)) return wallets;
  const data = (payload as Record<string, unknown>).data;
  return data && typeof data === "object" ? walletRows(data) : [];
}

/**
 * Extracts only public Solana wallet metadata. Other response fields (including
 * Axiom's authentication bundle) are deliberately never returned or stored.
 */
export function parseAxiomPublicWallets(payload: unknown): AxiomPublicWallet[] {
  const byAddress = new Map<string, AxiomPublicWallet>();
  for (const row of walletRows(payload)) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const compact = Array.isArray(row) ? row : null;
    const network = compact ? compact[1] : record.network;
    const isArchived = compact ? compact[3] === 1 : record.isArchived === true;
    if (network !== "sol" || isArchived) continue;
    const candidate = compact && typeof compact[0] === "string"
      ? compact[0]
      : typeof record.walletAddress === "string"
        ? record.walletAddress
        : typeof record.publicKey === "string"
          ? record.publicKey
          : null;
    if (!candidate || !SolanaAddressSchema.safeParse(candidate).success) continue;
    if (!byAddress.has(candidate)) {
      byAddress.set(candidate, {
        address: candidate,
        isPrimary: compact ? compact[2] === 1 : record.isPrimary === true,
        name: compact && typeof compact[5] === "string" && compact[5].trim()
          ? compact[5].trim().slice(0, 80)
          : typeof record.name === "string" && record.name.trim()
            ? record.name.trim().slice(0, 80)
            : null,
      });
    }
  }
  return [...byAddress.values()].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

export async function fetchAxiomWalletAddresses(
  options: FetchAxiomWalletOptions = {},
): Promise<string[]> {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const runsInAxiomPage = !options.fetchImpl && typeof window !== "undefined" && window.location.protocol.startsWith("http");
    const result: { ok?: boolean; status?: number; payload?: unknown; error?: string } | undefined = runsInAxiomPage
      ? await browser.runtime.sendMessage({ type: "WICKLAPSE_FETCH_AXIOM_WALLETS" }) as { ok?: boolean; status?: number; payload?: unknown; error?: string } | undefined
      : await (options.fetchImpl ?? fetch)(AXIOM_WALLETS_URL, {
          method: "POST",
          credentials: "include",
          headers: { accept: "application/json", "content-type": "application/json" },
          signal: controller.signal,
        }).then(async (response) => ({ ok: response.ok, status: response.status, payload: await response.json() }));
    if (!result) throw new Error("The extension background returned no wallet data.");
    if (result.error) throw new Error(`Axiom wallet lookup failed: ${result.error}`);
    if (result.status === 401 || result.status === 403) {
      throw new Error("Axiom could not identify the signed-in trading wallets. Sign in again and retry.");
    }
    if (result.status === 429) throw new Error("Axiom is rate-limiting wallet detection. Wait a moment and retry.");
    if (!result.ok) throw new Error(`Axiom wallet lookup returned HTTP ${result.status ?? 0}.`);
    return normalizeWalletAddresses(parseAxiomPublicWallets(result.payload).map((wallet) => wallet.address));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && !options.signal?.aborted) {
      throw new Error("Axiom wallet detection timed out after 15 seconds.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
}
