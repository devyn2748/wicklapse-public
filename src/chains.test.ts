import { describe, expect, it } from "vitest";
import { canonicalChainId, geckoNetworkForChainId } from "./chains";

describe("chain normalization", () => {
  it("normalizes Fomo and Mobula identifiers to the same chain", () => {
    expect(canonicalChainId("base")).toBe("evm:8453");
    expect(canonicalChainId("evm:8453")).toBe("evm:8453");
    expect(canonicalChainId("8453")).toBe("evm:8453");
    expect(canonicalChainId("sol")).toBe("solana");
    expect(canonicalChainId("1399811149")).toBe("solana");
  });

  it("maps supported chains to GeckoTerminal network slugs", () => {
    expect(geckoNetworkForChainId("base")).toBe("base");
    expect(geckoNetworkForChainId("ethereum")).toBe("eth");
    expect(geckoNetworkForChainId("evm:42161")).toBe("arbitrum");
    expect(geckoNetworkForChainId("solana")).toBe("solana");
    expect(geckoNetworkForChainId("unsupported-chain")).toBeNull();
  });
});
