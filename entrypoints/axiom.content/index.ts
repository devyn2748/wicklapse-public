import { browser } from "wxt/browser";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchAxiomExecutions, pairAddressFromAxiomUrl } from "../../src/axiom-api";
import { extractAxiomPairContext } from "../../src/axiom-candles";
import { fetchAxiomWalletAddresses } from "../../src/axiom-wallets";
import { ShareContextSchema, type AxiomPairContext, type ShareContext } from "../../src/domain";
import { InstantOverlay } from "../../src/instant-overlay";
import overlayStyles from "../../src/instant-overlay.css?inline";
import { loadTradingWalletAddresses, saveShareContext, saveTradingWalletAddresses } from "../../src/storage";

const BASE58_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

const EXCLUDED_SYMBOLS = new Set([
  "AXIOM",
  "IMAGE",
  "VIDEO",
  "DOWNLOAD",
  "COPY",
  "SHARE",
  "SOL",
  "USD",
  "PNL",
  "ATH",
]);

function isRendered(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function numberAfterLabel(text: string, labels: string[]): string | null {
  const normalized = text.replace(/\s+/g, " ");
  for (const label of labels) {
    const match = normalized.match(new RegExp(`${label}[^0-9+\\-]{0,28}([+\\-]?[0-9][0-9,.]*)`, "i"));
    if (match?.[1]) return match[1].replaceAll(",", "").replace(/^\+/, "");
  }
  return null;
}

function percentageAfterPnl(text: string): string | null {
  const percent = text.match(/([+\-]?[0-9][0-9,.]*)\s*%/);
  return percent?.[1]?.replaceAll(",", "").replace(/^\+/, "") ?? null;
}

function base58From(value: string): string | null {
  return value.match(BASE58_PATTERN)?.at(-1) ?? null;
}

function findPairAddress(): string | null {
  return pairAddressFromAxiomUrl(location.href);
}

let activePairAddress = findPairAddress();
let activePairContext: AxiomPairContext | null = null;

function handlePairChange(newPairAddress: string | null) {
  if (newPairAddress === activePairAddress) return;
  console.info(`[Wicklapse] Active pair changed: ${activePairAddress} -> ${newPairAddress}. Invalidating cached pair context.`);
  activePairAddress = newPairAddress;
  activePairContext = null;
  performance.setResourceTimingBufferSize(10_000);
  window.dispatchEvent(new CustomEvent("wicklapse:pair-changed", { detail: newPairAddress }));
}

const resourceObserver = new PerformanceObserver((list) => {
  const currentPair = findPairAddress();
  if (currentPair !== activePairAddress) {
    handlePairChange(currentPair);
  }
  for (const entry of list.getEntries()) {
    try {
      const url = new URL(entry.name);
      const isAxiomHost = url.hostname === "axiom.trade" || url.hostname.endsWith(".axiom.trade");
      if (isAxiomHost && url.pathname.endsWith("/pair-chart-v3")) {
        const context = extractAxiomPairContext(url.toString(), activePairAddress);
        if (context) {
          activePairContext = context;
          console.info(`[Wicklapse] Captured fresh pair context for ${context.pairAddress}: tokenAddress=${context.tokenAddress}`);
        }
      }
    } catch {
      // Ignore
    }
  }
});

function findAxiomPairContext(): AxiomPairContext | null {
  if (activePairContext && activePairContext.pairAddress === activePairAddress) {
    return activePairContext;
  }
  const entries = performance.getEntriesByType("resource").slice().reverse();
  for (const entry of entries) {
    try {
      const url = new URL(entry.name);
      const isAxiomHost = url.hostname === "axiom.trade" || url.hostname.endsWith(".axiom.trade");
      if (!isAxiomHost || !url.pathname.endsWith("/pair-chart-v3")) continue;
      const context = extractAxiomPairContext(url.toString(), activePairAddress);
      if (context) {
        activePairContext = context;
        console.info(`[Wicklapse] Captured pair context from historical buffer for ${context.pairAddress}: tokenAddress=${context.tokenAddress}`);
        return context;
      }
    } catch {
      // Ignore
    }
  }
  return null;
}

function findMint(): string | null {
  const accountLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="solscan.io/account/"]'),
  );
  for (const link of accountLinks) {
    let container: HTMLElement | null = link.parentElement;
    for (let depth = 0; container && depth < 3; depth += 1, container = container.parentElement) {
      if (container.innerText.trim().toUpperCase().startsWith("CA:")) {
        return base58From(link.href);
      }
    }
  }
  const mintLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="pump.fun/coin/"], a[href*="/token/"], a[href*="x.com/search"]'),
  );
  for (const link of mintLinks) {
    const candidate = base58From(decodeURIComponent(link.href));
    if (candidate) return candidate;
  }
  return null;
}

function findTokenImage(): string | null {
  return Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"))
    .filter(isRendered)
    .map((image) => ({ image, rect: image.getBoundingClientRect() }))
    .filter(({ image, rect }) => {
      const alt = image.alt.trim().toUpperCase();
      return rect.top >= 50 && rect.top <= 220 && rect.width >= 20 && rect.width <= 96 && alt !== "SOL";
    })
    .sort((left, right) => left.rect.top - right.rect.top || right.rect.width - left.rect.width)[0]?.image.src ?? null;
}

function findSymbol(): string {
  const explicit = document.querySelector<HTMLElement>(
    '[data-token-symbol], [class*="token-symbol" i]',
  )?.innerText;
  if (explicit?.trim()) return explicit.trim().replace(/^\$/, "").slice(0, 32);

  const headerSymbol = Array.from(document.querySelectorAll<HTMLElement>("span, div, p"))
    .filter(isRendered)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { text: element.innerText.trim(), top: rect.top };
    })
    .filter(
      ({ text, top }) =>
        top >= 48 &&
        top <= 190 &&
        /^[A-Z][A-Z0-9_]{1,20}$/.test(text) &&
        !EXCLUDED_SYMBOLS.has(text),
    )
    .sort((a, b) => a.top - b.top)[0]?.text;

  const titleSymbol = document.title.match(/^([A-Z][A-Z0-9_]{1,20})\b/)?.[1];
  return (headerSymbol ?? titleSymbol ?? "TOKEN").slice(0, 32);
}

function findTradeSummary(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>("div"))
      .filter(isRendered)
      .map((element) => {
        const text = element.innerText.trim();
        const rect = element.getBoundingClientRect();
        return { element, text, area: rect.width * rect.height };
      })
      .filter(
        ({ text, area }) =>
          area > 0 &&
          text.length < 500 &&
          /\bBought\b/i.test(text) &&
          /\bSold\b/i.test(text) &&
          /\bHolding\b/i.test(text) &&
          /\bPnL\b/i.test(text),
      )
      .sort((a, b) => a.area - b.area || a.text.length - b.text.length)[0]?.element ?? null
  );
}

function buildShareContext(): ShareContext {
  const summary = findTradeSummary();
  const summaryText = summary?.innerText.trim() ?? "";
  const summaryUsesSol = Boolean(summary?.querySelector('img[alt="SOL" i]'));
  const holding = numberAfterLabel(summaryText, ["Holding", "Position"]);
  const sold = numberAfterLabel(summaryText, ["Sold"]);

  const pairContext = findAxiomPairContext();
  return ShareContextSchema.parse({
    id: crypto.randomUUID(),
    capturedAt: Date.now(),
    pageUrl: location.href,
    tokenMint: findMint(),
    pairAddress: findPairAddress(),
    symbol: findSymbol(),
    tokenName: null,
    tokenImageUrl: findTokenImage(),
    axiomChartUrl: pairContext?.chartBaseUrl ?? null,
    axiomPairContext: pairContext,
    walletAddress: null,
    walletLabel: null,
    boughtSol: summaryUsesSol ? numberAfterLabel(summaryText, ["Bought", "Invested"]) : null,
    soldSol: summaryUsesSol ? sold : null,
    holdingSol: summaryUsesSol ? holding : null,
    pnlSol: summaryUsesSol ? numberAfterLabel(summaryText, ["PNL", "P&L"]) : null,
    roiPercent: percentageAfterPnl(summaryText),
    positionStatus: sold && holding === "0" ? "closed" : holding && holding !== "0" ? "open" : "unknown",
    sourceText: summaryText.slice(0, 20_000),
  });
}

async function retrieveCurrentTradeContext(): Promise<ShareContext> {
  const context = buildShareContext();
  if (!context.pairAddress) throw new Error("The current Axiom URL does not contain a pair address.");
  const savedWallets = await loadTradingWalletAddresses();
  let detectedWallets: string[] = [];
  try {
    detectedWallets = await fetchAxiomWalletAddresses();
  } catch (error) {
    if (!savedWallets.length) throw error;
  }
  const walletAddresses = [...new Set([...detectedWallets, ...savedWallets])];
  if (!walletAddresses.length) {
    throw new Error("Axiom did not expose any Solana trading wallets. Confirm a public trading wallet is active in Axiom, then try again.");
  }
  if (detectedWallets.length) await saveTradingWalletAddresses(walletAddresses);
  const tradeExecutions = await fetchAxiomExecutions({ pairAddress: context.pairAddress, walletAddresses });
  const enrichedContext = ShareContextSchema.parse({
    ...context,
    tradeExecutions,
    walletAddresses,
    walletAddress: walletAddresses[0] ?? null,
    walletLabel: walletAddresses.length > 1 ? `${walletAddresses.length} wallets` : null,
  });
  await saveShareContext(enrichedContext);
  return enrichedContext;
}

function findShareDialog(): HTMLElement | null {
  const explicit = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"], [data-radix-dialog-content]'))
    .filter(isRendered)
    .find((element) => /\b(Image|Video)\b/i.test(element.innerText) && /\b(Download|Copy|Export)\b/i.test(element.innerText));
  if (explicit) return explicit;

  return Array.from(document.querySelectorAll<HTMLElement>("div"))
    .filter(isRendered)
    .map((element) => ({ element, text: element.innerText, area: element.clientWidth * element.clientHeight }))
    .filter(({ text, area }) => area > 80_000 && /\bImage\b/i.test(text) && /\bVideo\b/i.test(text) && /\bDownload\b/i.test(text))
    .sort((a, b) => a.area - b.area)[0]?.element ?? null;
}

function makeEntryButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.wicklapseEntry = "true";
  button.textContent = "✦  Create Trade Replay with Wicklapse";
  Object.assign(button.style, {
    width: "calc(100% - 28px)",
    minHeight: "42px",
    margin: "12px 14px 14px",
    border: "1px solid rgba(91, 255, 188, .72)",
    borderRadius: "10px",
    background: "linear-gradient(135deg, #22e59a, #21cbbb)",
    color: "#03120b",
    font: "800 13px Inter, ui-sans-serif, system-ui",
    letterSpacing: ".01em",
    cursor: "pointer",
    boxShadow: "0 12px 32px rgba(22, 237, 149, .14)",
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

export default defineContentScript({
  matches: ["https://axiom.trade/*", "https://*.axiom.trade/*"],
  runAt: "document_idle",
  main(ctx) {
    let overlayHost: HTMLDivElement | null = null;
    let overlayRoot: Root | null = null;

    const closeOverlay = () => {
      overlayRoot?.unmount();
      overlayHost?.remove();
      overlayRoot = null;
      overlayHost = null;
    };

    const handlePairChangedEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (overlayHost) {
        if (!detail) {
          closeOverlay();
        } else {
          void openInstant();
        }
      }
    };
    window.addEventListener("wicklapse:pair-changed", handlePairChangedEvent);

    const openInstant = async () => {
      const context = buildShareContext();
      if (!context.pairAddress) {
        closeOverlay();
        return;
      }
      await saveShareContext(context);
      if (!overlayHost) {
        overlayHost = document.createElement("div");
        overlayHost.dataset.wicklapseOverlay = "true";
        document.documentElement.append(overlayHost);
        const shadow = overlayHost.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = overlayStyles;
        const mount = document.createElement("div");
        shadow.append(style, mount);
        overlayRoot = createRoot(mount);
      }
      overlayRoot?.render(React.createElement(InstantOverlay, {
        context,
        onClose: closeOverlay,
      }));
    };

    const injectEntry = () => {
      const dialog = findShareDialog();
      if (!dialog || dialog.querySelector('[data-wicklapse-entry="true"]')) return;
      dialog.append(makeEntryButton(() => void openInstant()));
    };

    const checkUrlChange = () => {
      const current = findPairAddress();
      if (current !== activePairAddress) handlePairChange(current);
    };

    const observer = new MutationObserver(() => {
      checkUrlChange();
      injectEntry();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    
    performance.setResourceTimingBufferSize(10_000);
    try {
      resourceObserver.observe({ entryTypes: ["resource"] });
    } catch {
      // Ignore if not supported
    }

    checkUrlChange();
    injectEntry();

    const handleMessage = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return undefined;
      if (message.type === "OPEN_WICKLAPSE_INSTANT") {
        return openInstant().then(() => ({ ok: true }));
      }
      if (message.type === "FETCH_AXIOM_EXECUTIONS") {
        return retrieveCurrentTradeContext()
          .then((context) => ({ ok: true, context }))
          .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : "Axiom trade lookup failed." }));
      }
      if (message.type !== "CAPTURE_ACTIVE_AXIOM_TRADE") return undefined;

      return Promise.resolve().then(async () => {
        const context = await retrieveCurrentTradeContext();
        return { ok: true, contextId: context.id };
      });
    };

    browser.runtime.onMessage.addListener(handleMessage);
    ctx.onInvalidated(() => {
      observer.disconnect();
      resourceObserver.disconnect();
      window.removeEventListener("wicklapse:pair-changed", handlePairChangedEvent);
      closeOverlay();
      browser.runtime.onMessage.removeListener(handleMessage);
    });
  },
});
