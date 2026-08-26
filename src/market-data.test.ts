import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicMarketJson } from "./market-data";

afterEach(() => vi.unstubAllGlobals());

describe("fetchPublicMarketJson", () => {
  it("uses direct extension-safe fetch outside an injected web page", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => (
      new Response(JSON.stringify({ data: "candles" }), { status: 200 })
    ));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const result = await fetchPublicMarketJson("https://api.geckoterminal.com/example", {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    expect(result).toEqual({ ok: true, status: 200, payload: { data: "candles" } });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  });

  it("preserves AbortError so stale replay requests stop immediately", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const controller = new AbortController();
    const pending = fetchPublicMarketJson("https://api.coingecko.com/example", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
