import { browser } from "wxt/browser";

export interface PublicMarketResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

interface PublicMarketFetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function runsInsideWebPage(): boolean {
  return typeof window !== "undefined" && (window.location.protocol === "http:" || window.location.protocol === "https:");
}

export async function fetchPublicMarketJson(
  url: string,
  options: PublicMarketFetchOptions = {},
): Promise<PublicMarketResponse> {
  if (!runsInsideWebPage()) {
    const response = await fetch(url, { headers: options.headers, signal: options.signal });
    return { ok: response.ok, status: response.status, payload: await response.json() };
  }

  if (options.signal?.aborted) throw new DOMException("Market request aborted", "AbortError");
  const requestId = crypto.randomUUID();
  return new Promise<PublicMarketResponse>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      void browser.runtime.sendMessage({ type: "WICKLAPSE_ABORT_MARKET_REQUEST", requestId });
      finish(() => reject(new DOMException("Market request aborted", "AbortError")));
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    void browser.runtime.sendMessage({
      type: "WICKLAPSE_FETCH_MARKET_JSON",
      requestId,
      url,
      headers: options.headers ?? {},
    }).then((response: unknown) => {
      finish(() => {
        if (!response || typeof response !== "object") {
          reject(new Error("The extension background returned no market data."));
          return;
        }
        const result = response as Partial<PublicMarketResponse> & { error?: string };
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        resolve({
          ok: result.ok === true,
          status: typeof result.status === "number" ? result.status : 0,
          payload: result.payload,
        });
      });
    }, (error: unknown) => {
      finish(() => reject(error));
    });
  });
}
