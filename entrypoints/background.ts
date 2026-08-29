import { browser } from "wxt/browser";

const marketRequests = new Map<string, AbortController>();
const PUBLIC_MARKET_HOSTS = new Set(["api.geckoterminal.com", "api.coingecko.com"]);
const CONTENT_SCRIPTS = {
  axiom: "/content-scripts/axiom.js",
  fomo: "/content-scripts/fomo.js",
} as const;
const FOMO_BRIDGE_SCRIPT = "/content-scripts/fomo-bridge.js" as const;

type SupportedProvider = keyof typeof CONTENT_SCRIPTS;

type AxiomJsonResult = { ok: boolean; status?: number; payload?: unknown; error?: string };

/** Runs in Axiom's main-world page context, preserving the signed-in session. */
async function fetchAxiomJsonInPage(url: string, body?: Record<string, unknown>): Promise<AxiomJsonResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Preserve an unsuccessful HTTP status for the extension UI.
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The Axiom request failed." };
  }
}

async function fetchAxiomJson(message: {
  kind: "wallets" | "executions";
  body?: Record<string, unknown>;
}, tabId?: number): Promise<AxiomJsonResult> {
  const url = message.kind === "wallets"
    ? "https://api.axiom.trade/bundle-key-and-wallets-v2"
    : "https://api3.axiom.trade/transactions-feed-v4";
  if (tabId) {
    try {
      const [injected] = await browser.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: fetchAxiomJsonInPage,
        args: [url, message.kind === "executions" ? message.body : undefined],
      });
      if (injected?.result) return injected.result as AxiomJsonResult;
      return { ok: false, error: "Axiom returned no data from the active page." };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Wicklapse could not query the active Axiom page." };
    }
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { accept: "application/json", "content-type": "application/json" },
      ...(message.kind === "executions" ? { body: JSON.stringify(message.body ?? {}) } : {}),
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // The caller turns an unsuccessful status into a useful user-facing error.
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The Axiom request failed." };
  }
}

async function fetchPublicMarketJson(message: {
  requestId: string;
  url: string;
  headers: Record<string, string>;
}): Promise<{ ok?: boolean; status?: number; payload?: unknown; error?: string }> {
  try {
    const url = new URL(message.url);
    if (url.protocol !== "https:" || !PUBLIC_MARKET_HOSTS.has(url.hostname)) {
      return { error: "Wicklapse blocked an unsupported market-data host." };
    }
    const controller = new AbortController();
    marketRequests.get(message.requestId)?.abort();
    marketRequests.set(message.requestId, controller);
    const response = await fetch(url, { headers: message.headers, signal: controller.signal });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Preserve the HTTP status so the caller can continue to its next fallback.
    }
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { error: "Market request aborted." };
    return { error: error instanceof Error ? error.message : "The market-data request failed." };
  } finally {
    marketRequests.delete(message.requestId);
  }
}

function providerForUrl(rawUrl: string | undefined): SupportedProvider | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.hostname === "axiom.trade" || url.hostname.endsWith(".axiom.trade")) return "axiom";
    if (url.hostname === "fomo.family") return "fomo";
  } catch {
    // Ignore malformed tab URLs.
  }
  return null;
}

async function sendMessageToSupportedTab(tabId: number, provider: SupportedProvider, message: Record<string, unknown>): Promise<unknown> {
  if (provider === "fomo") {
    await browser.scripting.executeScript({ target: { tabId }, world: "MAIN", files: [FOMO_BRIDGE_SCRIPT] }).catch(() => undefined);
  }
  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch {
    await browser.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPTS[provider]] });
    return browser.tabs.sendMessage(tabId, message);
  }
}

async function openInstantOnSupportedTab(tab: Browser.tabs.Tab): Promise<boolean> {
  if (!tab.id || !tab.url) return false;
  const provider = providerForUrl(tab.url);
  if (!provider) return false;

  try {
    await sendMessageToSupportedTab(tab.id, provider, { type: "OPEN_WICKLAPSE_INSTANT" });
    return true;
  } catch (error) {
    console.warn(`Wicklapse could not capture the active ${provider} tab.`, error);
    return false;
  }
}

async function refreshAxiomTrade(pairAddress: string | null): Promise<unknown> {
  const tabs = await browser.tabs.query({ url: ["https://axiom.trade/meme/*", "https://*.axiom.trade/meme/*"] });
  const matchingTab = tabs.find((tab) => tab.id && (!pairAddress || tab.url?.includes(`/meme/${pairAddress}`)));
  if (!matchingTab?.id) return { ok: false, error: "Keep the matching Axiom coin page open, then try Generate Replay again." };
  try {
    return await sendMessageToSupportedTab(matchingTab.id, "axiom", { type: "FETCH_AXIOM_EXECUTIONS" });
  } catch {
    return { ok: false, error: "Wicklapse could not initialize on the open Axiom coin page. Reload the page and retry." };
  }
}

async function refreshFomoTrade(tradeId: string | null): Promise<unknown> {
  const tabs = await browser.tabs.query({ url: ["https://fomo.family/profile/*"] });
  const matchingTab = tabs.find((tab) => tab.id && (!tradeId || tab.url?.includes(`tradeId=${encodeURIComponent(tradeId)}`)));
  if (!matchingTab?.id) return { ok: false, error: "Keep the matching Fomo trade open, then try Generate Replay again." };
  try {
    return await sendMessageToSupportedTab(matchingTab.id, "fomo", { type: "FETCH_FOMO_EXECUTIONS" });
  } catch {
    return { ok: false, error: "Reload the open Fomo trade once so Wicklapse can observe its authenticated response." };
  }
}

async function ensureRpcPermission(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return { ok: false, error: "Custom RPC endpoints must use HTTPS." };
    const pattern = `${url.origin}/*`;
    const granted = await browser.permissions.contains({ origins: [pattern] });
    if (granted) return { ok: true };
    const approved = await browser.permissions.request({ origins: [pattern] });
    return approved
      ? { ok: true }
      : { ok: false, error: "Chrome needs permission to connect to this custom RPC host." };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The custom RPC URL is invalid." };
  }
}

async function runRpcRequest(message: {
  endpoint: string;
  method: string;
  params: unknown[];
}): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const maximumAttempts = 4;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(message.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: message.method, params: message.params }),
        signal: controller.signal,
      });
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!response.ok && retryable && attempt < maximumAttempts - 1) {
        const retryAfter = response.headers.get("retry-after");
        const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
        const serverDelay = Number.isFinite(retrySeconds) ? retrySeconds * 1_000 : 0;
        const exponentialDelay = 750 * (2 ** attempt) + Math.round(Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(serverDelay, exponentialDelay), 10_000)));
        continue;
      }
      if (!response.ok) {
        if (response.status === 429) {
          return {
            ok: false,
            error: "This RPC is rate-limiting Wicklapse (HTTP 429). It was retried four times; wait 30–60 seconds or use a dedicated Helius/custom RPC endpoint.",
          };
        }
        return { ok: false, error: `RPC returned HTTP ${response.status}.` };
      }
      const payload = await response.json() as { result?: unknown; error?: { message?: string } };
      if (payload.error) return { ok: false, error: payload.error.message ?? `RPC ${message.method} failed.` };
      if (payload.result === undefined) return { ok: false, error: `RPC ${message.method} returned no result.` };
      return { ok: true, result: payload.result };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return { ok: false, error: "The RPC request timed out after 25 seconds." };
      }
      return { ok: false, error: error instanceof Error ? error.message : "The RPC request failed." };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: "The RPC request failed after multiple attempts." };
}

export default defineBackground(() => {
  browser.action.onClicked.addListener((tab) => {
    if (providerForUrl(tab.url)) {
      void openInstantOnSupportedTab(tab);
      return;
    }
    void browser.tabs.query({ url: [
      "https://axiom.trade/meme/*",
      "https://*.axiom.trade/meme/*",
      "https://fomo.family/profile/*",
    ] }).then(async (tabs) => {
      const supportedTab = tabs.find((candidate) => candidate.active && candidate.id && candidate.url)
        ?? tabs.find((candidate) => candidate.id && candidate.url);
      if (!supportedTab?.id) return;
      await browser.tabs.update(supportedTab.id, { active: true });
      if (supportedTab.windowId) await browser.windows.update(supportedTab.windowId, { focused: true });
      await openInstantOnSupportedTab(supportedTab);
    }).catch(() => undefined);
  });
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!message || typeof message !== "object" || !("type" in message)) return undefined;
    if (message.type === "WICKLAPSE_REFRESH_AXIOM_TRADE") {
      const pairAddress = "pairAddress" in message && typeof message.pairAddress === "string" ? message.pairAddress : null;
      return refreshAxiomTrade(pairAddress);
    }
    if (message.type === "WICKLAPSE_REFRESH_TRADE") {
      const provider = "provider" in message && message.provider === "fomo" ? "fomo" : "axiom";
      if (provider === "fomo") {
        const tradeId = "providerTradeId" in message && typeof message.providerTradeId === "string" ? message.providerTradeId : null;
        return refreshFomoTrade(tradeId);
      }
      const pairAddress = "pairAddress" in message && typeof message.pairAddress === "string" ? message.pairAddress : null;
      return refreshAxiomTrade(pairAddress);
    }
    if (message.type === "WICKLAPSE_FETCH_AXIOM_WALLETS") {
      return fetchAxiomJson({ kind: "wallets" }, sender.tab?.id);
    }
    if (
      message.type === "WICKLAPSE_FETCH_AXIOM_EXECUTIONS" &&
      "body" in message && message.body && typeof message.body === "object"
    ) {
      return fetchAxiomJson({ kind: "executions", body: message.body as Record<string, unknown> }, sender.tab?.id);
    }
    if (
      message.type === "WICKLAPSE_FETCH_MARKET_JSON" &&
      "requestId" in message && typeof message.requestId === "string" &&
      "url" in message && typeof message.url === "string"
    ) {
      const headers = "headers" in message && message.headers && typeof message.headers === "object"
        ? Object.fromEntries(Object.entries(message.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {};
      return fetchPublicMarketJson({ requestId: message.requestId, url: message.url, headers });
    }
    if (message.type === "WICKLAPSE_ABORT_MARKET_REQUEST" && "requestId" in message && typeof message.requestId === "string") {
      marketRequests.get(message.requestId)?.abort();
      return Promise.resolve({ ok: true });
    }
    if (message.type === "WICKLAPSE_ENSURE_RPC_PERMISSION" && "endpoint" in message && typeof message.endpoint === "string") {
      return ensureRpcPermission(message.endpoint);
    }
    if (
      message.type === "WICKLAPSE_RPC_REQUEST" &&
      "endpoint" in message && typeof message.endpoint === "string" &&
      "method" in message && typeof message.method === "string" &&
      "params" in message && Array.isArray(message.params)
    ) {
      return runRpcRequest({ endpoint: message.endpoint, method: message.method, params: message.params });
    }
    return undefined;
  });
});
