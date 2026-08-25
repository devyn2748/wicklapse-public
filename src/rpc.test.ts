import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpcSettings } from "./domain";
import { findWalletTradeFills, parseTradeFill } from "./rpc";

const wallet = "7YWHMfk9JZe0LMjUW4wNVe2xfqPTiyecVji4tYdLu2iY";
const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6wk43kshGZJgFhAM";

function transaction(options: {
  preLamports: number;
  postLamports: number;
  preTokens: string;
  postTokens: string;
  fee?: number;
}) {
  return {
    _signature: "5mR7testSignature",
    slot: 123,
    blockTime: 1_700_000_000,
    transaction: {
      message: { accountKeys: [{ pubkey: wallet, signer: true, writable: true }] },
      signatures: ["5mR7testSignature"],
    },
    meta: {
      err: null,
      fee: options.fee ?? 5_000,
      preBalances: [options.preLamports],
      postBalances: [options.postLamports],
      preTokenBalances: [
        {
          accountIndex: 1,
          mint,
          owner: wallet,
          uiTokenAmount: { amount: options.preTokens, decimals: 6 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint,
          owner: wallet,
          uiTokenAmount: { amount: options.postTokens, decimals: 6 },
        },
      ],
    },
  };
}

describe("parseTradeFill", () => {
  it("removes the network fee from the SOL cost of a buy", () => {
    const fill = parseTradeFill(
      transaction({
        preLamports: 2_000_000_000,
        postLamports: 1_099_995_000,
        preTokens: "0",
        postTokens: "1000000",
      }),
      wallet,
      mint,
    );

    expect(fill).toMatchObject({
      side: "buy",
      quoteLamports: "900000000",
      tokenAmountRaw: "1000000",
      estimatedPriceSol: "0.9",
    });
  });

  it("adds the network fee back to the SOL proceeds of a sell", () => {
    const fill = parseTradeFill(
      transaction({
        preLamports: 1_000_000_000,
        postLamports: 2_199_995_000,
        preTokens: "1000000",
        postTokens: "0",
      }),
      wallet,
      mint,
    );

    expect(fill).toMatchObject({
      side: "sell",
      quoteLamports: "1200000000",
      tokenAmountRaw: "1000000",
      estimatedPriceSol: "1.2",
    });
  });

  it("ignores a token transfer that only spends the network fee", () => {
    const fill = parseTradeFill(
      transaction({
        preLamports: 2_000_000_000,
        postLamports: 1_999_995_000,
        preTokens: "0",
        postTokens: "1000000",
      }),
      wallet,
      mint,
    );

    expect(fill).toBeNull();
  });
});

describe("findWalletTradeFills", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses token-account signatures instead of scanning unrelated wallet history", async () => {
    const methods: Array<{ method: string; address?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          method: string;
          params: any[];
        };
        methods.push({ method: request.method, address: request.params[0] });

        let result: unknown;
        if (request.method === "getTokenAccountsByOwner") {
          result = { value: [{ pubkey: "TokenAccount11111111111111111111111111111" }] };
        } else if (request.method === "getSignaturesForAddress") {
          result = [
            { signature: "buy-signature", slot: 1, err: null, blockTime: 1_700_000_000 },
            { signature: "sell-signature", slot: 2, err: null, blockTime: 1_700_000_010 },
          ];
        } else if (request.method === "getTransaction") {
          const isBuy = request.params[0] === "buy-signature";
          result = isBuy
            ? transaction({
                preLamports: 2_000_000_000,
                postLamports: 1_099_995_000,
                preTokens: "0",
                postTokens: "1000000",
              })
            : transaction({
                preLamports: 1_000_000_000,
                postLamports: 2_199_995_000,
                preTokens: "1000000",
                postTokens: "0",
              });
          (result as Record<string, unknown>).blockTime = isBuy ? 1_700_000_000 : 1_700_000_010;
        }

        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: "test", result }),
        } as Response;
      }),
    );

    const settings: RpcSettings = {
      walletAddress: wallet,
      provider: "custom",
      endpoint: "https://rpc.example.test",
      remember: false,
    };
    const fills = await findWalletTradeFills(settings, mint);

    expect(fills.map((fill) => fill.side)).toEqual(["buy", "sell"]);
    expect(methods.some(({ method, address }) => method === "getSignaturesForAddress" && address === wallet)).toBe(false);
    expect(methods.some(({ method, address }) => method === "getSignaturesForAddress" && address?.startsWith("TokenAccount"))).toBe(true);
  });
});
