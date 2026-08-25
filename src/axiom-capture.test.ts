import { describe, expect, it } from "vitest";
import type { ShareContext } from "./domain";
import { ageToSeconds, buildAxiomCaptureEpisodes, normalizeAxiomNumber } from "./axiom-capture";

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
  it("turns newest-first Axiom rows into a chronological captured episode", () => {
    const context: ShareContext = {
      id: "axiom-capture",
      capturedAt: 1_800_000_000_000,
      pageUrl: "https://axiom.trade/meme/Pair1111111111111111111111111111111111111",
      tokenMint: "Mint1111111111111111111111111111111111111",
      pairAddress: "Pair1111111111111111111111111111111111111",
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
      tradeEvents: [
        {
          id: "sell",
          side: "sell",
          tokenAmount: "100",
          quoteSol: "3",
          marketCapUsd: "3000000",
          timestamp: null,
          displayAge: "2d",
          signature: null,
          rowIndex: 0,
        },
        {
          id: "buy",
          side: "buy",
          tokenAmount: "100",
          quoteSol: "1",
          marketCapUsd: "1000000",
          timestamp: null,
          displayAge: "5d",
          signature: null,
          rowIndex: 1,
        },
      ],
    };

    const [episode] = buildAxiomCaptureEpisodes(context);
    expect(episode?.fills.map((fill) => fill.side)).toEqual(["buy", "sell"]);
    expect(episode?.fills.every((fill) => fill.source === "axiom")).toBe(true);
    expect(episode?.status).toBe("closed");
    expect(episode?.approximatePnlLamports).toBe("2000000000");
    expect(episode?.matchLabel).toBe("Axiom capture");
  });
});
