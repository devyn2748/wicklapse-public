import { describe, expect, it } from "vitest";
import type { ShareContext } from "./domain";
import { buildAxiomExecutionEpisodes, parseAxiomAthMarketCap } from "./axiom-capture";

describe("parseAxiomAthMarketCap", () => {
  it("normalizes Axiom ATH labels with compact suffixes", () => {
    expect(parseAxiomAthMarketCap("ATH $34.5M")).toBe("34500000");
    expect(parseAxiomAthMarketCap("ATH\n$1.25B")).toBe("1250000000");
    expect(parseAxiomAthMarketCap("ATH $251,659")).toBe("251659");
    expect(parseAxiomAthMarketCap("Price $0.03")).toBeNull();
  });
});

describe("buildAxiomCaptureEpisodes", () => {
  it("turns multiple-wallet buys and partial sells into a chronological episode", () => {
    const pairAddress = "4".repeat(44);
    const firstWallet = "5".repeat(44);
    const secondWallet = "6".repeat(44);
    const context: ShareContext = {
      id: "axiom-capture",
      capturedAt: 1_800_000_000_000,
      pageUrl: "https://axiom.trade/meme/Pair1111111111111111111111111111111111111",
      tokenMint: "Mint1111111111111111111111111111111111111",
      pairAddress,
      symbol: "TEST",
      tokenName: "Test",
      walletAddress: null,
      walletLabel: null,
      boughtSol: "1",
      soldSol: "3",
      holdingSol: "0",
      pnlSol: "2",
      roiPercent: "200",
      positionStatus: "closed",
      sourceText: "",
      walletAddresses: [firstWallet, secondWallet],
      tradeExecutions: [
        {
          signature: "9".repeat(88),
          side: "sell",
          tokenAmount: "110",
          priceSol: "0.03",
          priceUsd: "4.5",
          totalSol: "3.3",
          totalUsd: "495",
          timestamp: 1_799_000_300,
          wallet: secondWallet,
          pairAddress,
          source: "axiom",
        },
        {
          signature: "7".repeat(88),
          side: "buy",
          tokenAmount: "100",
          priceSol: "0.01",
          priceUsd: "1.5",
          totalSol: "1",
          totalUsd: "150",
          timestamp: 1_799_000_000,
          wallet: firstWallet,
          pairAddress,
          source: "axiom",
        },
        {
          signature: "8".repeat(88),
          side: "buy",
          tokenAmount: "50",
          priceSol: "0.012",
          priceUsd: "1.8",
          totalSol: "0.6",
          totalUsd: "90",
          timestamp: 1_799_000_100,
          wallet: secondWallet,
          pairAddress,
          source: "axiom",
        },
        {
          signature: "A".repeat(88),
          side: "sell",
          tokenAmount: "40",
          priceSol: "0.02",
          priceUsd: "3",
          totalSol: "0.8",
          totalUsd: "120",
          timestamp: 1_799_000_200,
          wallet: firstWallet,
          pairAddress,
          source: "axiom",
        },
      ],
    };

    const [episode] = buildAxiomExecutionEpisodes(context);
    expect(episode?.fills.map((fill) => fill.side)).toEqual(["buy", "buy", "sell", "sell"]);
    expect(episode?.fills.every((fill) => fill.source === "axiom")).toBe(true);
    expect(new Set(episode?.fills.map((fill) => fill.wallet))).toEqual(new Set([firstWallet, secondWallet]));
    expect(episode?.status).toBe("closed");
    expect(episode?.approximatePnlLamports).toBe("2500000000");
    expect(episode?.matchLabel).toBe("Axiom capture");
  });

  it("preserves sub-second timing and splits a re-entry after a full exit", () => {
    const pairAddress = "4".repeat(44);
    const wallet = "5".repeat(44);
    const execution = (
      signature: string,
      side: "buy" | "sell",
      timestamp: number,
      tokenAmount: string,
    ) => ({
      signature,
      side,
      timestamp,
      tokenAmount,
      priceSol: "0.01",
      priceUsd: "1",
      totalSol: "1",
      totalUsd: "100",
      wallet,
      pairAddress,
      source: "axiom" as const,
    });
    const context: ShareContext = {
      id: "re-entry",
      capturedAt: 1_800_000_000_000,
      pageUrl: `https://axiom.trade/meme/${pairAddress}`,
      tokenMint: "6".repeat(44),
      pairAddress,
      symbol: "TEST",
      tokenName: null,
      walletAddress: wallet,
      walletLabel: null,
      boughtSol: null,
      soldSol: null,
      holdingSol: null,
      pnlSol: null,
      roiPercent: null,
      positionStatus: "unknown",
      sourceText: "",
      tradeExecutions: [
        execution("7".repeat(88), "buy", 1_799_000_000.1, "100"),
        execution("8".repeat(88), "sell", 1_799_000_000.7, "100"),
        execution("9".repeat(88), "buy", 1_799_000_001.2, "50"),
      ],
    };

    const episodes = buildAxiomExecutionEpisodes(context);
    expect(episodes).toHaveLength(2);
    expect(episodes.flatMap((item) => item.fills.map((fill) => fill.timestamp)).sort())
      .toEqual([1_799_000_000.1, 1_799_000_000.7, 1_799_000_001.2]);
    expect(episodes.map((item) => item.status).sort()).toEqual(["closed", "open"]);
  });

  it("ignores leading sells whose acquisition cost is absent from a truncated feed", () => {
    const pairAddress = "4".repeat(44);
    const wallet = "5".repeat(44);
    const context: ShareContext = {
      id: "truncated",
      capturedAt: 1_800_000_000_000,
      pageUrl: `https://axiom.trade/meme/${pairAddress}`,
      tokenMint: "6".repeat(44),
      pairAddress,
      symbol: "TEST",
      tokenName: null,
      walletAddress: wallet,
      walletLabel: null,
      boughtSol: null,
      soldSol: null,
      holdingSol: null,
      pnlSol: null,
      roiPercent: null,
      positionStatus: "unknown",
      sourceText: "",
      tradeExecutions: [
        { signature: "7".repeat(88), side: "sell", timestamp: 10, tokenAmount: "10", priceSol: "1", priceUsd: "1", totalSol: "10", totalUsd: "10", wallet, pairAddress, source: "axiom" },
        { signature: "8".repeat(88), side: "buy", timestamp: 20, tokenAmount: "5", priceSol: "2", priceUsd: "2", totalSol: "10", totalUsd: "10", wallet, pairAddress, source: "axiom" },
      ],
    };

    const episodes = buildAxiomExecutionEpisodes(context);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.fills.map((fill) => fill.signature)).toEqual(["8".repeat(88)]);
    expect(episodes[0]?.totalBoughtLamports).toBe("10000000000");
  });
});
