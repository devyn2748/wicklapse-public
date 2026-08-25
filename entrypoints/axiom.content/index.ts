import { browser } from "wxt/browser";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { normalizeAxiomNumber } from "../../src/axiom-capture";
import { AxiomTradeEventSchema, ShareContextSchema, type AxiomTradeEvent, type ShareContext } from "../../src/domain";
import { InstantOverlay } from "../../src/instant-overlay";
import overlayStyles from "../../src/instant-overlay.css?inline";
import { saveShareContext } from "../../src/storage";

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
  const pathMatch = location.pathname.match(/\/meme\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\/|$)/i);
  return pathMatch?.[1] ?? null;
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

function normalizedText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findPersonalMarker(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("div, span, p"))
    .filter(isRendered)
    .find((element) => /^Showing \d+ of your transactions$/i.test(normalizedText(element))) ?? null;
}

function findTradeTableRoot(marker: HTMLElement | null): HTMLElement | null {
  if (marker) {
    let candidate: HTMLElement | null = marker.parentElement;
    for (let depth = 0; candidate && depth < 8; depth += 1, candidate = candidate.parentElement) {
      const text = normalizedText(candidate);
      if (/\bAmount\b/i.test(text) && /\bTotal\s*SOL\b/i.test(text) && candidate.querySelector('a[href*="solscan.io/tx/"]')) {
        return candidate;
      }
    }
  }
  return Array.from(document.querySelectorAll<HTMLElement>("div, section"))
    .filter(isRendered)
    .filter((element) => {
      const text = normalizedText(element);
      return /\bAge\b/i.test(text) && /\bType\b/i.test(text) && /\bAmount\b/i.test(text) && /\bTotal\s*SOL\b/i.test(text) && Boolean(element.querySelector('a[href*="solscan.io/tx/"]'));
    })
    .sort((left, right) => left.clientWidth * left.clientHeight - right.clientWidth * right.clientHeight)[0] ?? null;
}

function findColumnHeader(root: HTMLElement, pattern: RegExp): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>("button, div, span"))
    .filter(isRendered)
    .filter((element) => pattern.test(normalizedText(element)))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    })[0] ?? null;
}

function valueAtColumn(row: HTMLElement, header: HTMLElement | null): string | null {
  if (!header) return null;
  const x = header.getBoundingClientRect().left + header.getBoundingClientRect().width / 2;
  return Array.from(row.querySelectorAll<HTMLElement>("div, span, button, a"))
    .filter(isRendered)
    .map((element) => ({ element, text: normalizedText(element), rect: element.getBoundingClientRect(), value: normalizeAxiomNumber(normalizedText(element)) }))
    .filter(({ rect, value }) => value !== null && rect.left <= x + 3 && rect.right >= x - 3)
    .sort((left, right) => {
      const leftPenalty = (left.rect.width < 20 ? 2_000 : 0) + (left.text.length < 2 ? 1_000 : 0);
      const rightPenalty = (right.rect.width < 20 ? 2_000 : 0) + (right.text.length < 2 ? 1_000 : 0);
      return leftPenalty - rightPenalty || left.rect.width * left.rect.height - right.rect.width * right.rect.height;
    })[0]?.value ?? null;
}

function rowForTransactionLink(link: HTMLAnchorElement, root: HTMLElement): HTMLElement | null {
  let candidate: HTMLElement | null = link.parentElement;
  for (let depth = 0; candidate && candidate !== root && depth < 8; depth += 1, candidate = candidate.parentElement) {
    const text = normalizedText(candidate);
    const rect = candidate.getBoundingClientRect();
    if (/\b(Buy|Sell)\b/i.test(text) && rect.height > 12 && rect.height < 140) return candidate;
  }
  return null;
}

function transactionSignature(link: HTMLAnchorElement): string | null {
  const match = link.href.match(/solscan\.io\/tx\/([1-9A-HJ-NP-Za-km-z]{64,96})/i);
  return match?.[1] ?? null;
}

function captureAxiomTrades(): AxiomTradeEvent[] {
  const marker = findPersonalMarker();
  const root = findTradeTableRoot(marker);
  if (!root) return [];
  const headers = {
    amount: findColumnHeader(root, /^Amount$/i),
    marketCap: findColumnHeader(root, /^MC(?:\s|$)/i),
    totalSol: findColumnHeader(root, /^Total\s*SOL(?:\s|$)/i),
  };
  const events: AxiomTradeEvent[] = [];
  const seen = new Set<string>();
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="solscan.io/tx/"]'));
  for (const link of links) {
    const signature = transactionSignature(link);
    if (!signature || seen.has(signature)) continue;
    const row = rowForTransactionLink(link, root);
    if (!row) continue;
    const text = normalizedText(row);
    if (!marker && !/\bYOU\b/i.test(text)) continue;
    const sideMatch = text.match(/\b(Buy|Sell)\b/i);
    const quoteSol = valueAtColumn(row, headers.totalSol);
    if (!sideMatch || !quoteSol) continue;
    const displayAge = normalizedText(link).match(/\b\d+(?:\.\d+)?\s*(?:s|m|h|d|w|mo|y)\b/i)?.[0] ?? null;
    const parsed = AxiomTradeEventSchema.safeParse({
      id: signature,
      side: sideMatch[1]!.toLowerCase(),
      tokenAmount: valueAtColumn(row, headers.amount),
      quoteSol,
      marketCapUsd: valueAtColumn(row, headers.marketCap),
      timestamp: null,
      displayAge,
      signature,
      rowIndex: events.length,
    });
    if (!parsed.success) continue;
    seen.add(signature);
    events.push(parsed.data);
  }
  return events;
}

async function activatePersonalTrades(): Promise<void> {
  if (findPersonalMarker()) return;
  if (!findTradeTableRoot(null)) {
    const tradesButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
      .filter(isRendered)
      .find((button) => normalizedText(button).toUpperCase() === "TRADES");
    tradesButton?.click();
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  const youButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .filter(isRendered)
    .find((button) => normalizedText(button).replace(/[^A-Z]/gi, "").toUpperCase() === "YOU");
  if (!youButton) return;
  youButton.click();
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 2_000);
    const observer = new MutationObserver(() => {
      if (!findPersonalMarker()) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function buildShareContext(): ShareContext {
  const summary = findTradeSummary();
  const summaryText = summary?.innerText.trim() ?? "";
  const summaryUsesSol = Boolean(summary?.querySelector('img[alt="SOL" i]'));
  const holding = numberAfterLabel(summaryText, ["Holding", "Position"]);
  const sold = numberAfterLabel(summaryText, ["Sold"]);
  const tradeEvents = captureAxiomTrades();

  return ShareContextSchema.parse({
    id: crypto.randomUUID(),
    capturedAt: Date.now(),
    pageUrl: location.href,
    tokenMint: findMint(),
    pairAddress: findPairAddress(),
    symbol: findSymbol(),
    tokenName: null,
    tokenImageUrl: findTokenImage(),
    tradeEvents,
    walletAddress: null,
    walletLabel: null,
    boughtSol: summaryUsesSol ? numberAfterLabel(summaryText, ["Bought", "Invested"]) : null,
    soldSol: summaryUsesSol ? sold : null,
    holdingSol: summaryUsesSol ? holding : null,
    pnlSol: summaryUsesSol ? numberAfterLabel(summaryText, ["PNL", "P&L"]) : null,
    roiPercent: percentageAfterPnl(summaryText),
    positionStatus: sold && holding === "0" ? "closed" : holding && holding !== "0" ? "open" : "unknown",
    sourceText: `${summaryText}\n${tradeEvents.map((trade) => `${trade.displayAge ?? ""} ${trade.side} ${trade.tokenAmount ?? "?"} ${trade.quoteSol} SOL ${trade.signature ?? ""}`).join("\n")}`.slice(0, 20_000),
  });
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

    const openInstant = async () => {
      await activatePersonalTrades();
      const context = buildShareContext();
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
        onOpenAdvanced: () => {
          void browser.runtime.sendMessage({ type: "OPEN_ADVANCED_STUDIO" });
          closeOverlay();
        },
      }));
    };

    const injectEntry = () => {
      const dialog = findShareDialog();
      if (!dialog || dialog.querySelector('[data-wicklapse-entry="true"]')) return;
      dialog.append(makeEntryButton(() => void openInstant()));
    };

    const observer = new MutationObserver(injectEntry);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    injectEntry();

    const handleMessage = (message: unknown) => {
      if (!message || typeof message !== "object" || !("type" in message)) return undefined;
      if (message.type === "OPEN_WICKLAPSE_INSTANT") {
        return openInstant().then(() => ({ ok: true }));
      }
      if (message.type !== "CAPTURE_ACTIVE_AXIOM_TRADE") return undefined;

      return Promise.resolve().then(async () => {
        const context = buildShareContext();
        await saveShareContext(context);
        return { ok: true, contextId: context.id };
      });
    };

    browser.runtime.onMessage.addListener(handleMessage);
    ctx.onInvalidated(() => {
      observer.disconnect();
      closeOverlay();
      browser.runtime.onMessage.removeListener(handleMessage);
    });
  },
});
