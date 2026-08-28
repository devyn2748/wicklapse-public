import { describe, expect, it, vi } from "vitest";
import {
  AXIOM_TRANSACTIONS_FEED_URL,
  fetchAxiomExecutions,
  normalizeWalletAddresses,
  pairAddressFromAxiomUrl,
  parseAxiomTransactionsResponse,
} from "./axiom-api";

const pairAddress = "4".repeat(44);
const firstWallet = "5".repeat(44);
const secondWallet = "6".repeat(44);

function row(
  signature: string,
  side: "buy" | "sell",
  timestamp: string,
  wallet = firstWallet,
  pair = pairAddress,
): unknown[] {
  return [signature, pair, side, timestamp, null, null, wallet, 0.0000145, 0.0012549, 310.253, 0.0045, 0.389];
}

describe("parseAxiomTransactionsResponse", () => {
  it("validates, filters, deduplicates, and chronologically sorts compact rows", () => {
    const firstSignature = "7".repeat(88);
    const secondSignature = "8".repeat(88);
    const executions = parseAxiomTransactionsResponse({ data: { transactions: [
      row(secondSignature, "sell", "2026-08-25T12:05:00.000Z", secondWallet),
      ["malformed"],
      row(firstSignature, "buy", "2026-08-25T12:00:00.000Z"),
      row(firstSignature, "buy", "2026-08-25T12:00:00.000Z"),
      row("9".repeat(88), "buy", "not-a-date"),
      row("A".repeat(88), "buy", "2026-08-25T12:01:00.000Z", "B".repeat(44)),
      row("C".repeat(88), "buy", "2026-08-25T12:01:00.000Z", firstWallet, "D".repeat(44)),
    ] } }, { pairAddress, walletAddresses: [firstWallet, secondWallet] });

    expect(executions.map((execution) => execution.signature)).toEqual([firstSignature, secondSignature]);
    expect(executions[0]).toMatchObject({
      side: "buy",
      tokenAmount: "310.253",
      priceSol: "0.0000145",
      priceUsd: "0.0012549",
      totalSol: "0.0045",
      totalUsd: "0.389",
      wallet: firstWallet,
      pairAddress,
    });
  });

  it("ignores malformed numeric rows and returns an empty array when none are valid", () => {
    const invalid = row("7".repeat(88), "buy", "2026-08-25T12:00:00.000Z");
    invalid[9] = "not-a-number";
    expect(parseAxiomTransactionsResponse([invalid], { pairAddress, walletAddresses: [firstWallet] })).toEqual([]);
    expect(parseAxiomTransactionsResponse({ data: [] }, { pairAddress, walletAddresses: [firstWallet] })).toEqual([]);
  });
});

describe("pairAddressFromAxiomUrl", () => {
  it("extracts only a valid pair from an Axiom meme page", () => {
    expect(pairAddressFromAxiomUrl(`https://axiom.trade/meme/${pairAddress}?chain=sol`)).toBe(pairAddress);
    expect(pairAddressFromAxiomUrl(`https://example.com/meme/${pairAddress}`)).toBeNull();
    expect(pairAddressFromAxiomUrl("https://axiom.trade/discover")).toBeNull();
  });
});

describe("fetchAxiomExecutions", () => {
  it("posts the current pair and comma-joined unique wallets with Axiom credentials", async () => {
    const signature = "7".repeat(88);
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify([row(signature, "buy", "2026-08-25T12:00:00.000Z")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const executions = await fetchAxiomExecutions({
      pairAddress,
      walletAddresses: [firstWallet, `${firstWallet},${secondWallet}`],
    }, { fetchImpl, now: () => 1_777_000_000_000 });

    expect(executions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(AXIOM_TRANSACTIONS_FEED_URL);
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({
      pairAddress,
      orderBy: "DESC",
      makerAddress: `${firstWallet},${secondWallet}`,
      v: 1_777_000_000_000,
    });
  });

  it("normalizes comma-separated wallets and rejects an empty configuration", async () => {
    expect(normalizeWalletAddresses([`${firstWallet}, ${secondWallet}`, firstWallet])).toEqual([firstWallet, secondWallet]);
    await expect(fetchAxiomExecutions({ pairAddress, walletAddresses: [] })).rejects.toThrow("public Axiom trading wallet");
  });

  it("batches large multi-wallet lookups and merges the results chronologically", async () => {
    const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const wallets = Array.from({ length: 101 }, (_, index) => {
      return `${base58[Math.floor(index / base58.length)]}${base58[index % base58.length]}${"5".repeat(42)}`;
    });
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (_input, init) => {
      const makerAddress = JSON.parse(String(init?.body)).makerAddress as string;
      const wallet = makerAddress.split(",")[0]!;
      const isLastBatch = makerAddress.split(",").length === 1;
      return new Response(JSON.stringify([
        row(isLastBatch ? "8".repeat(88) : "7".repeat(88), "buy", isLastBatch ? "2026-08-25T12:01:00.000Z" : "2026-08-25T12:00:00.000Z", wallet),
      ]), { status: 200, headers: { "content-type": "application/json" } });
    });

    const executions = await fetchAxiomExecutions(
      { pairAddress, walletAddresses: wallets },
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(executions.map((execution) => execution.signature)).toEqual(["7".repeat(88), "8".repeat(88)]);
  });

  it("propagates caller cancellation instead of reporting it as a timeout", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const pending = fetchAxiomExecutions(
      { pairAddress, walletAddresses: [firstWallet] },
      { fetchImpl: fetchMock as unknown as typeof fetch, signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
