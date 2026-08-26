import { describe, expect, it } from "vitest";
import type { ShareContext } from "./domain";
import { ageToSeconds, buildAxiomExecutionEpisodes, normalizeAxiomNumber } from "./axiom-capture";

describe("normalizeAxiomNumber", () => {
  it("expands suffixes and Axiom compact-zero notation", () => {
    expect(normalizeAxiomNumber("$23.8M")).toBe("23800000");
    expect(normalizeAxiomNumber("0.0₂5")).toBe("0.005");
    expect(normalizeAxiomNumber("643.2")).toBe("643.2");
  });

  it("parses displayed ages", () => {
    expect(ageToSeconds("5d")).toBe(432_000);
    expect(ageToSeconds("2h")).toBe(7_200);
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
});
