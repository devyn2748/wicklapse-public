import { describe, expect, it, vi } from "vitest";
import { AXIOM_WALLETS_URL, fetchAxiomWalletAddresses, parseAxiomPublicWallets } from "./axiom-wallets";

const primaryWallet = "5".repeat(44);
const secondWallet = "7".repeat(44);
const archivedWallet = "8".repeat(44);
const evmWallet = `0x${"a".repeat(40)}`;

describe("Axiom wallet discovery", () => {
  it("keeps every non-archived Solana wallet, orders the primary first, and ignores unrelated response secrets", () => {
    const parsed = parseAxiomPublicWallets({
      bundleKey: "must-never-leave-the-parser",
      wallets: [
        { network: "sol", walletAddress: secondWallet, name: "Trading 2", isArchived: false },
        { network: "evm", walletAddress: evmWallet, name: "EVM", isArchived: false },
        { network: "sol", walletAddress: archivedWallet, name: "Old", isArchived: true },
        { network: "sol", walletAddress: primaryWallet, name: "Axiom Main", isPrimary: true, isArchived: false },
        { network: "sol", walletAddress: secondWallet, name: "Duplicate", isArchived: false },
        { network: "sol", walletAddress: "malformed", isArchived: false },
      ],
    });
    expect(parsed).toEqual([
      { address: primaryWallet, isPrimary: true, name: "Axiom Main" },
      { address: secondWallet, isPrimary: false, name: "Trading 2" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("bundleKey");
  });

  it("requests the signed-in Axiom wallet list without manually supplying credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      wallets: [
        { network: "sol", walletAddress: secondWallet, isArchived: false },
        { network: "sol", walletAddress: primaryWallet, isPrimary: true, isArchived: false },
      ],
    }), { status: 200 }));
    await expect(fetchAxiomWalletAddresses({ fetchImpl: fetchMock })).resolves.toEqual([primaryWallet, secondWallet]);
    expect(fetchMock).toHaveBeenCalledWith(AXIOM_WALLETS_URL, expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });
});

