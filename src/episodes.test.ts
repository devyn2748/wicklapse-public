import { describe, expect, it } from "vitest";
import { buildTradeEpisodes } from "./episodes";
import type { ShareContext, TradeFill } from "./domain";

const context: ShareContext = {
  id: "capture-1",
  capturedAt: 1_700_000_200_000,
  pageUrl: "https://axiom.trade/t/TokenMint111111111111111111111111111111",
  tokenMint: "TokenMint111111111111111111111111111111",
  pairAddress: null,
  symbol: "TEST",
  tokenName: "Test Token",
  walletAddress: null,
  walletLabel: null,
  boughtSol: "1",
  soldSol: "3",
  holdingSol: "0",
  pnlSol: "2",
  roiPercent: "200",
  positionStatus: "closed",
  sourceText: "",
};

function fill(partial: Partial<TradeFill>): TradeFill {
  return {
    signature: "signature-000000000000000000000000000000",
    slot: 1,
    timestamp: 1_700_000_000,
    side: "buy",
    tokenMint: context.tokenMint!,
    tokenDecimals: 6,
    tokenAmountRaw: "1000000",
    quoteLamports: "1000000000",
    networkFeeLamports: "0",
    walletPostTokenRaw: "1000000",
    estimatedPriceSol: "1",
    ...partial,
  };
}

describe("buildTradeEpisodes", () => {
  it("splits a later rebuy into a second episode", () => {
    const episodes = buildTradeEpisodes(
      [
        fill({ signature: "first-buy-000000000", side: "buy" }),
        fill({ signature: "first-sell-00000000", side: "sell", quoteLamports: "3000000000", walletPostTokenRaw: "0" }),
        fill({ signature: "second-buy-00000000", side: "buy", timestamp: 1_700_000_300 }),
      ],
      context,
    );
    expect(episodes).toHaveLength(2);
    expect(episodes.some((episode) => episode.status === "closed")).toBe(true);
    expect(episodes.some((episode) => episode.status === "open")).toBe(true);
  });

  it("gives the reconciled episode an exact-match score", () => {
    const [episode] = buildTradeEpisodes(
      [
        fill({ side: "buy" }),
        fill({ side: "sell", quoteLamports: "3000000000", walletPostTokenRaw: "0" }),
      ],
      context,
    );
    expect(episode?.matchLabel).toBe("Exact match");
    expect(episode?.matchScore).toBeGreaterThanOrEqual(90);
  });
});
