import { browser } from "wxt/browser";

async function openStudio(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL("/studio.html?mode=advanced") });
}

async function openInstantOnAxiom(tab: Browser.tabs.Tab): Promise<boolean> {
  if (!tab.id || !tab.url) return false;
  const url = new URL(tab.url);
  if (url.hostname !== "axiom.trade" && !url.hostname.endsWith(".axiom.trade")) return false;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "OPEN_WICKLAPSE_INSTANT" });
    return true;
  } catch (error) {
    // This normally means the extension was just installed and the existing Axiom tab has not been reloaded yet.
    console.warn("Wicklapse could not capture the active Axiom tab.", error);
    return false;
  }
}

async function refreshAxiomTrade(pairAddress: string | null): Promise<unknown> {
  const tabs = await browser.tabs.query({ url: ["https://axiom.trade/meme/*", "https://*.axiom.trade/meme/*"] });
  const matchingTab = tabs.find((tab) => tab.id && (!pairAddress || tab.url?.includes(`/meme/${pairAddress}`)));
  if (!matchingTab?.id) return { ok: false, error: "Keep the matching Axiom coin page open, then try Generate Replay again." };
  try {
    return await browser.tabs.sendMessage(matchingTab.id, { type: "FETCH_AXIOM_EXECUTIONS" });
  } catch {
    return { ok: false, error: "Reload the open Axiom coin page so Wicklapse can retrieve its trades." };
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
    const url = tab.url ? new URL(tab.url) : null;
    const isAxiom = url && (url.hostname === "axiom.trade" || url.hostname.endsWith(".axiom.trade"));
    if (isAxiom) {
      void openInstantOnAxiom(tab);
      return;
    }
    void openStudio();
  });
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== "object" || !("type" in message)) return undefined;
    if (message.type === "OPEN_ADVANCED_STUDIO") return openStudio().then(() => ({ ok: true }));
    if (message.type === "WICKLAPSE_REFRESH_AXIOM_TRADE") {
      const pairAddress = "pairAddress" in message && typeof message.pairAddress === "string" ? message.pairAddress : null;
      return refreshAxiomTrade(pairAddress);
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
