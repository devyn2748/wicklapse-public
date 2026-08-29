import { browser } from "wxt/browser";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareContextSchema, type ShareContext } from "../../src/domain";
import {
  fomoHandleFromUrl,
  fomoTradeIdFromUrl,
  focusedFomoCandleUrl,
  parseFomoCandles,
  parseFomoTradeResponse,
  type FomoCapturedResponse,
} from "../../src/fomo-api";
import { FOMO_BRIDGE_MESSAGE_SOURCE } from "../../src/fomo-bridge";
import { InstantOverlay } from "../../src/instant-overlay";
import overlayStyles from "../../src/instant-overlay.css?inline";
import { saveShareContext } from "../../src/storage";

const captures: FomoCapturedResponse[] = [];
const pendingCandleRequests = new Map<string, {
  resolve: (capture: FomoCapturedResponse | null) => void;
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

function isCandleCaptureForToken(capture: FomoCapturedResponse, tokenAddress: string): boolean {
  try {
    const url = new URL(capture.url);
    if (url.hostname === "fomo-api.mobula.io") {
      return url.searchParams.get("address")?.toLowerCase() === tokenAddress.toLowerCase();
    }
    const bodyText = JSON.stringify(capture.requestBody ?? "").toLowerCase();
    return bodyText.includes(tokenAddress.toLowerCase());
  } catch {
    return false;
  }
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
  const baseContext = parseFomoTradeResponse(exact.payload, {
    tradeId,
    pageUrl,
    profileHandle: fomoHandleFromUrl(pageUrl),
    capturedAt: exact.capturedAt,
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
  const matchingCapture = candleCaptures.find((capture) => isCandleCaptureForToken(capture, baseContext.tokenMint!));
  const capturedCandles = parseFomoCandles(matchingCapture?.payload);
  return ShareContextSchema.parse({ ...baseContext, capturedCandles });
}

function requestFocusedCandles(url: string, signal?: AbortSignal): Promise<FomoCapturedResponse | null> {
  if (signal?.aborted) return Promise.resolve(null);
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const finish = (capture: FomoCapturedResponse | null) => {
      const pending = pendingCandleRequests.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingCandleRequests.delete(requestId);
      signal?.removeEventListener("abort", abort);
      resolve(capture);
    };
    const abort = () => finish(null);
    const timeout = setTimeout(() => finish(null), 8_000);
    pendingCandleRequests.set(requestId, { resolve: finish, timeout });
    signal?.addEventListener("abort", abort, { once: true });
    window.postMessage({ source: FOMO_BRIDGE_MESSAGE_SOURCE, type: "focused-candle-request", requestId, url }, location.origin);
  });
}

async function retrieveTradeContext(tradeId: string | null, pageUrl: string, signal?: AbortSignal): Promise<ShareContext> {
  if (!tradeId) throw new Error("Open a specific trade from this Fomo profile so the URL contains a tradeId, then open Wicklapse again.");
  window.dispatchEvent(new Event("wicklapse:fomo-snapshot-request"));
  const deadline = Date.now() + 12_000;
  while (!signal?.aborted && Date.now() < deadline) {
    const context = capturedContext(pageUrl, tradeId);
    if (context) {
      if (context.tokenMint && context.tradeExecutions?.length) {
        const sessionCapture = [...captures].reverse().find((capture) => {
          try {
            const url = new URL(capture.url);
            return url.origin === "https://fomo-api.mobula.io"
              && url.pathname === "/api/2/token/ohlcv-history"
              && isCandleCaptureForToken(capture, context.tokenMint!);
          } catch {
            return false;
          }
        });
        const focusedUrl = sessionCapture && focusedFomoCandleUrl(
          sessionCapture.url,
          context.tradeExecutions,
          context.positionStatus === "open" ? Date.now() / 1_000 : undefined,
        );
        const focusedCapture = focusedUrl ? await requestFocusedCandles(focusedUrl, signal) : null;
        const focusedCandles = parseFomoCandles(focusedCapture?.payload);
        if (focusedCandles.length >= 2) {
          const enriched = ShareContextSchema.parse({ ...context, capturedCandles: focusedCandles });
          await saveShareContext(enriched);
          return enriched;
        }
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
        resolveContext: (signal?: AbortSignal) => retrieveTradeContext(pinnedTradeId, pinnedPageUrl, signal),
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
        pending.resolve(capture && typeof capture.url === "string" && typeof capture.capturedAt === "number" && "payload" in capture
          ? capture as FomoCapturedResponse
          : null);
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
      for (const pending of pendingCandleRequests.values()) pending.resolve(null);
      closeOverlay();
    });
  },
});
