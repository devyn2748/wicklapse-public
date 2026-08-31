import { describe, expect, it } from "vitest";
import { validatedFocusedUrl } from "./fomo-bridge";

const token = "0x1111111111111111111111111111111111111111";
const template = { url: `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${token}&chainId=evm%3A8453&period=1m&from=1&to=2&amount=1000` };

describe("Fomo focused candle bridge", () => {
  it("preserves the active token and chain while stripping unapproved parameters", () => {
    const safe = validatedFocusedUrl(
      `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${token}&chainId=evm%3A8453&period=5s&from=1000&to=2000&amount=1000&redirect=https%3A%2F%2Fexample.com&credential=synthetic-session-value`,
      template,
    );
    expect(safe?.searchParams.get("address")).toBe(token);
    expect(safe?.searchParams.get("chainId")).toBe("evm:8453");
    expect(safe?.searchParams.has("redirect")).toBe(false);
    expect(safe?.searchParams.has("credential")).toBe(false);
    expect(safe?.toString()).not.toContain("synthetic-session-value");
  });

  it("accepts equivalent numeric and canonical chain identifiers", () => {
    const safe = validatedFocusedUrl(
      `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${token}&chainId=8453&period=5s&from=1000&to=2000&amount=1000`,
      template,
    );
    expect(safe?.searchParams.get("chainId")).toBe("evm:8453");
  });

  it("rejects token changes, unsupported periods, and excessive candle counts", () => {
    const base = `https://fomo-api.mobula.io/api/2/token/ohlcv-history?chainId=evm%3A8453&from=1000&to=2000`;
    expect(validatedFocusedUrl(`${base}&address=0x2222222222222222222222222222222222222222&period=5s&amount=1000`, template)).toBeNull();
    expect(validatedFocusedUrl(`${base}&address=${token}&period=2s&amount=1000`, template)).toBeNull();
    expect(validatedFocusedUrl(`${base}&address=${token}&period=5s&amount=1001`, template)).toBeNull();
  });
});
