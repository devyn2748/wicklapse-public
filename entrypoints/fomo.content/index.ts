import { browser } from "wxt/browser";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareContextSchema, type ShareContext } from "../../src/domain";
import {
  fomoHandleFromUrl,
  fomoCandleCaptureMatches,
  fomoTradeIdFromUrl,
  focusedFomoCandleUrl,
  parseFomoTradeResponse,
  selectFomoCandlesForTrade,
  type FomoCapturedResponse,
} from "../../src/fomo-api";
import { FOMO_BRIDGE_MESSAGE_SOURCE } from "../../src/fomo-bridge";
import { InstantOverlay } from "../../src/instant-overlay";
import overlayStyles from "../../src/instant-overlay.css?inline";
import { saveShareContext } from "../../src/storage";

const captures: FomoCapturedResponse[] = [];
interface FocusedCandleResult {
  capture: FomoCapturedResponse | null;
  error: string | null;
}
const pendingCandleRequests = new Map<string, {
  resolve: (result: FocusedCandleResult) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

function retainCapture(capture: FomoCapturedResponse): void {
  const existing = captures.findIndex((item) => item.url === capture.url);
  if (existing >= 0) captures.splice(existing, 1);
  captures.push(capture);
  if (captures.length > 20) captures.splice(0, captures.length - 20);
}

function currentPlaceholderContext(): ShareContext {
  const tradeId = fomoTradeIdFromUrl(location.href);
  const handle = fomoHandleFromUrl(location.href);
  return ShareContextSchema.parse({
    id: crypto.randomUUID(),
    capturedAt: Date.now(),
    pageUrl: location.href,
    tokenMint: null,
    pairAddress: null,
    symbol: "FOMO",
    tokenName: null,
    walletAddress: null,
    walletLabel: handle ? `@${handle}` : "Fomo account",
    boughtSol: null,
    soldSol: null,
    holdingSol: null,
    pnlSol: null,
    roiPercent: null,
    positionStatus: "unknown",
    sourceText: tradeId ? `Fomo trade ${tradeId}` : "Fomo profile",
    provider: "fomo",
    providerTradeId: tradeId,
    profileHandle: handle,
  });
}

function capturedContext(pageUrl = location.href, explicitTradeId?: string): ShareContext | null {
  const tradeId = explicitTradeId ?? fomoTradeIdFromUrl(pageUrl);
  if (!tradeId) return null;
  const exact = [...captures].reverse().find((capture) => {
    try {
      const url = new URL(capture.url);
      return url.pathname === `/trades/${tradeId}`;
    } catch {
      return false;
    }
  });
  if (!exact) return null;
  const relatedPayloads = captures.flatMap((capture) => {
    try {
      return /^\/v2\/users\/[^/]+\/swaps$/.test(new URL(capture.url).pathname) ? [capture.payload] : [];
    } catch {
      return [];
    }
  });
  const baseContext = parseFomoTradeResponse(exact.payload, {
    tradeId,
    pageUrl,
    profileHandle: fomoHandleFromUrl(pageUrl),
    capturedAt: exact.capturedAt,
    relatedPayloads,
    relatedTradeGapSeconds: 3_600,
  });
  if (!baseContext?.tokenMint) return baseContext;
  const candleCaptures = [...captures].reverse().filter((capture) => {
    try {
      const url = new URL(capture.url);
      return url.pathname === "/proxy/getBarsNew"
        || url.pathname === "/proxy/getBars"
        || url.pathname === "/api/2/token/ohlcv-history";
    } catch {
      return false;
    }
  });
  const capturedCandles = selectFomoCandlesForTrade(
    candleCaptures,
    baseContext.tradeExecutions ?? [],
    baseContext.tokenMint,
    baseContext.chainId,
  );
  return ShareContextSchema.parse({ ...baseContext, capturedCandles });
}

function requestFocusedCandles(url: string, signal?: AbortSignal): Promise<FocusedCandleResult> {
  if (signal?.aborted) return Promise.resolve({ capture: null, error: "Fomo capture aborted." });
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (result: FocusedCandleResult) => {
      const pending = pendingCandleRequests.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingCandleRequests.delete(requestId);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => finish({ capture: null, error: "Fomo capture aborted." });
    const timeout = setTimeout(() => finish({ capture: null, error: "Fomo candle request timed out." }), 6_000);
    pendingCandleRequests.set(requestId, { resolve: finish, timeout });
    signal?.addEventListener("abort", abort, { once: true });
    window.postMessage({ source: FOMO_BRIDGE_MESSAGE_SOURCE, type: "focused-candle-request", requestId, url }, location.origin);
  });
}

function waitForRetry(delay: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Fomo capture aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delay);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Fomo capture aborted", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function retrieveTradeContext(
  tradeId: string | null,
  pageUrl: string,
  signal?: AbortSignal,
  onStatus?: (message: string) => void,
): Promise<ShareContext> {
  if (!tradeId) throw new Error("Open a specific trade from this Fomo profile so the URL contains a tradeId, then open Wicklapse again.");
  window.dispatchEvent(new Event("wicklapse:fomo-snapshot-request"));
  const deadline = Date.now() + 12_000;
  while (!signal?.aborted && Date.now() < deadline) {
    const context = capturedContext(pageUrl, tradeId);
    if (context) {
      if (context.tokenMint && context.tradeExecutions?.length) {
        const maxAttempts = 5;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          onStatus?.(`${attempt === 1 ? "Requesting" : "Retrying"} Fomo candles (${attempt}/${maxAttempts})…`);
          if (attempt > 1) await waitForRetry([0, 2_000, 3_000, 4_000, 6_000][attempt - 1]!, signal);
          window.dispatchEvent(new Event("wicklapse:fomo-snapshot-request"));
          const sessionCapture = [...captures].reverse().find((capture) => {
            try {
              const url = new URL(capture.url);
              return url.origin === "https://fomo-api.mobula.io"
                && url.pathname === "/api/2/token/ohlcv-history"
                && fomoCandleCaptureMatches(capture, context.tokenMint!, context.chainId);
            } catch {
              return false;
            }
          });
          const chainId = context.tradeExecutions[0]?.chainId ?? context.chainId;
          const syntheticTemplate = chainId
            ? `https://fomo-api.mobula.io/api/2/token/ohlcv-history?address=${encodeURIComponent(context.tokenMint)}&chainId=${encodeURIComponent(chainId)}&period=1m&usd=true&from=1&to=2&amount=1000`
            : null;
          const focusedUrl = focusedFomoCandleUrl(
            sessionCapture?.url ?? syntheticTemplate ?? "",
            context.tradeExecutions,
            context.positionStatus === "open" ? Date.now() / 1_000 : undefined,
          );
          const focusedResult = focusedUrl
            ? await requestFocusedCandles(focusedUrl, signal)
            : { capture: null, error: "The Fomo candle URL could not be created." };
          if (signal?.aborted) throw new DOMException("Fomo capture aborted", "AbortError");
          const focusedCandles = focusedResult.capture
            ? selectFomoCandlesForTrade([focusedResult.capture], context.tradeExecutions, context.tokenMint, context.chainId)
            : [];
          if (focusedCandles.length >= 2) {
            const enriched = ShareContextSchema.parse({ ...context, capturedCandles: focusedCandles });
            await saveShareContext(enriched);
            return enriched;
          }
          if (attempt < maxAttempts && focusedResult.error) {
            onStatus?.(`${focusedResult.error} Waiting before retry ${attempt + 1}/${maxAttempts}…`);
          }
        }
        onStatus?.("Fomo candles remained unavailable — trying the public fallback…");
      }
      await saveShareContext(context);
      return context;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (signal?.aborted) throw new DOMException("Fomo capture aborted", "AbortError");
  throw new Error("Fomo has not returned this trade yet. Keep the trade open for a few seconds and retry. If this is a fresh extension install, reload the Fomo page once.");
}

function retrieveCurrentTradeContext(signal?: AbortSignal): Promise<ShareContext> {
  return retrieveTradeContext(fomoTradeIdFromUrl(location.href), location.href, signal);
}

export default defineContentScript({
  matches: ["https://fomo.family/*"],
  runAt: "document_start",
  main(ctx) {
    let overlayHost: HTMLDivElement | null = null;
    let overlayRoot: Root | null = null;
    let activeUrl = location.href;
    let overlayTradeId: string | null = null;

    const closeOverlay = () => {
      overlayRoot?.unmount();
      overlayHost?.remove();
      overlayRoot = null;
      overlayHost = null;
      overlayTradeId = null;
    };

    const openInstant = async () => {
      const pinnedPageUrl = location.href;
      const pinnedTradeId = fomoTradeIdFromUrl(pinnedPageUrl);
      const context = capturedContext(pinnedPageUrl, pinnedTradeId ?? undefined) ?? currentPlaceholderContext();
      await saveShareContext(context);
      if (!overlayHost) {
        overlayHost = document.createElement("div");
        overlayHost.dataset.wicklapseOverlay = "true";
        Object.assign(overlayHost.style, {
          position: "fixed",
          inset: "0",
          zIndex: "2147483647",
          pointerEvents: "none",
        });
        document.documentElement.append(overlayHost);
        // Fomo's Radix dialog defers outside dismissal until later pointer/mouse
        // events. Keeping those events inside this host lets every Wicklapse
        // control work without dismissing the trade dialog behind it.
        for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend"]) {
          overlayHost.addEventListener(eventName, (event) => event.stopPropagation());
        }
        const shadow = overlayHost.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = overlayStyles;
        const mount = document.createElement("div");
        shadow.append(style, mount);
        overlayRoot = createRoot(mount);
      }
      overlayTradeId = pinnedTradeId;
      overlayRoot?.render(React.createElement(InstantOverlay, {
        context,
        resolveContext: (signal?: AbortSignal, _manualWallets?: string[], onStatus?: (message: string) => void) => retrieveTradeContext(pinnedTradeId, pinnedPageUrl, signal, onStatus),
        onClose: closeOverlay,
      }));
    };

    const handleWindowMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      const data = event.data as { source?: unknown; type?: unknown; requestId?: unknown; capture?: unknown; error?: unknown };
      if (data?.source !== FOMO_BRIDGE_MESSAGE_SOURCE) return;
      if (data.type === "focused-candle-response" && typeof data.requestId === "string") {
        const pending = pendingCandleRequests.get(data.requestId);
        if (!pending) return;
        const capture = data.capture as Partial<FomoCapturedResponse> | undefined;
        pending.resolve({
          capture: capture && typeof capture.url === "string" && typeof capture.capturedAt === "number" && "payload" in capture
            ? capture as FomoCapturedResponse
            : null,
          error: typeof data.error === "string" ? data.error : null,
        });
        return;
      }
      if (data.type !== "capture") return;
      const capture = data.capture as Partial<FomoCapturedResponse>;
      if (typeof capture.url !== "string" || typeof capture.capturedAt !== "number" || !("payload" in capture)) return;
      retainCapture(capture as FomoCapturedResponse);
    };
    window.addEventListener("message", handleWindowMessage);
    window.dispatchEvent(new Event("wicklapse:fomo-snapshot-request"));

    const observer = new MutationObserver(() => {
      if (location.href === activeUrl) return;
      activeUrl = location.href;
      const nextTradeId = fomoTradeIdFromUrl(activeUrl);
      if (overlayHost && nextTradeId && nextTradeId !== overlayTradeId) void openInstant();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    const handleRuntimeMessage = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return undefined;
      if (message.type === "OPEN_WICKLAPSE_INSTANT") return openInstant().then(() => ({ ok: true }));
      if (message.type === "FETCH_FOMO_EXECUTIONS") {
        return retrieveCurrentTradeContext()
          .then((context) => ({ ok: true, context }))
          .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "Fomo trade lookup failed." }));
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(handleRuntimeMessage);

    ctx.onInvalidated(() => {
      observer.disconnect();
      window.removeEventListener("message", handleWindowMessage);
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
      for (const pending of pendingCandleRequests.values()) pending.resolve({ capture: null, error: "Fomo page closed." });
      closeOverlay();
    });
  },
});
