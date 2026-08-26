import { SolanaAddressSchema } from "./domain";
import { normalizeWalletAddresses } from "./axiom-api";

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
  return Array.isArray(wallets) ? wallets : [];
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
    if (record.network !== "sol" || record.isArchived === true) continue;
    const candidate = typeof record.walletAddress === "string"
      ? record.walletAddress
      : typeof record.publicKey === "string"
        ? record.publicKey
        : null;
    if (!candidate || !SolanaAddressSchema.safeParse(candidate).success) continue;
    if (!byAddress.has(candidate)) {
      byAddress.set(candidate, {
        address: candidate,
        isPrimary: record.isPrimary === true,
        name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 80) : null,
      });
    }
  }
  return [...byAddress.values()].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
}

export async function fetchAxiomWalletAddresses(
  options: FetchAxiomWalletOptions = {},
): Promise<string[]> {
  const response = await (options.fetchImpl ?? fetch)(AXIOM_WALLETS_URL, {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    signal: options.signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Axiom could not identify the signed-in trading wallets. Sign in again and retry.");
  }
  if (!response.ok) throw new Error(`Axiom wallet lookup returned HTTP ${response.status}.`);
  return normalizeWalletAddresses(parseAxiomPublicWallets(await response.json()).map((wallet) => wallet.address));
}

