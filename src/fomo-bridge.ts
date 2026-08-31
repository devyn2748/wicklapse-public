import { canonicalChainId } from "./chains";

const BRIDGE_MESSAGE_SOURCE = "wicklapse-fomo-bridge";
const BRIDGE_STATE_KEY = "__wicklapseFomoBridgeV2";
const MOBULA_ORIGIN = "https://fomo-api.mobula.io";
const MOBULA_PATH = "/api/2/token/ohlcv-history";
const ALLOWED_PERIODS = new Set(["1s", "5s", "15s", "30s", "1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d", "1w"]);

interface BridgeCapture {
  url: string;
  payload: unknown;
  capturedAt: number;
  requestBody?: unknown;
}

interface BridgeState {
  installed: true;
  captures: BridgeCapture[];
}

function mobulaRequestKey(url: URL): string | null {
  if (url.origin !== MOBULA_ORIGIN || url.pathname !== MOBULA_PATH) return null;
  const address = url.searchParams.get("address")?.toLowerCase();
  const chainId = canonicalChainId(url.searchParams.get("chainId"));
  return address && chainId ? `${address}|${chainId}` : null;
}

/** Validates and rebuilds a focused candle URL against the captured session request. */
export function validatedFocusedUrl(rawUrl: string, template: Pick<Request, "url">): URL | null {
  try {
    const requested = new URL(rawUrl);
    const captured = new URL(template.url);
    if (mobulaRequestKey(requested) !== mobulaRequestKey(captured)) return null;
    for (const name of ["address", "chainId", "period", "from", "to", "amount"]) {
      if (requested.searchParams.getAll(name).length !== 1) return null;
    }
    const period = requested.searchParams.get("period");
    const from = Number(requested.searchParams.get("from"));
    const to = Number(requested.searchParams.get("to"));
    const amount = Number(requested.searchParams.get("amount"));
    if (!period || !ALLOWED_PERIODS.has(period) || !Number.isFinite(from) || !Number.isFinite(to)
      || from < 0 || to <= from || !Number.isInteger(amount) || amount < 2 || amount > 1_000) return null;
    const safe = new URL(`${MOBULA_ORIGIN}${MOBULA_PATH}`);
    safe.searchParams.set("address", captured.searchParams.get("address")!);
    safe.searchParams.set("chainId", captured.searchParams.get("chainId")!);
    safe.searchParams.set("period", period);
    safe.searchParams.set("usd", "true");
    safe.searchParams.set("from", String(Math.trunc(from)));
    safe.searchParams.set("to", String(Math.trunc(to)));
    safe.searchParams.set("amount", String(amount));
    return safe;
  } catch {
    return null;
  }
}

function isRelevantFomoApiUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl, location.href);
    if (url.origin === MOBULA_ORIGIN) return url.pathname === MOBULA_PATH;
    if (url.origin !== "https://prod-api.fomo.family") return false;
    return url.pathname === "/proxy/getBarsNew"
      || url.pathname === "/proxy/getBars"
      || url.pathname.startsWith("/trades")
      || /^\/v2\/users\/[^/]+\/swaps$/.test(url.pathname)
      || url.pathname.startsWith("/v2/users/userHandle/");
  } catch {
    return false;
  }
}

/** Runs in Fomo's MAIN world. Session request objects never leave this closure. */
export function installFomoFetchBridge(): void {
  const bridgeWindow = window as typeof window & { [BRIDGE_STATE_KEY]?: BridgeState };
  if (bridgeWindow[BRIDGE_STATE_KEY]?.installed) return;
  const state: BridgeState = { installed: true, captures: [] };
  bridgeWindow[BRIDGE_STATE_KEY] = state;
  const mobulaRequestTemplates = new Map<string, Request>();

  const publish = (capture: BridgeCapture) => {
    window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: "capture", capture }, location.origin);
  };
  const retain = (capture: BridgeCapture) => {
    state.captures = [...state.captures.filter((item) => item.url !== capture.url), capture].slice(-20);
    publish(capture);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const input = args[0];
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    try {
      const url = new URL(rawUrl, location.href);
      const key = mobulaRequestKey(url);
      if (key) {
        const template = new Request(url, input instanceof Request ? {
          method: args[1]?.method ?? input.method,
          headers: args[1]?.headers ?? input.headers,
          mode: args[1]?.mode ?? input.mode,
          credentials: args[1]?.credentials ?? input.credentials,
          cache: args[1]?.cache ?? input.cache,
          redirect: args[1]?.redirect ?? input.redirect,
          referrer: args[1]?.referrer ?? input.referrer,
          referrerPolicy: args[1]?.referrerPolicy ?? input.referrerPolicy,
        } : args[1]);
        if (template.method === "GET") {
          mobulaRequestTemplates.delete(key);
          mobulaRequestTemplates.set(key, template);
          if (mobulaRequestTemplates.size > 20) mobulaRequestTemplates.delete(mobulaRequestTemplates.keys().next().value!);
        }
      }
    } catch {
      // A malformed or non-HTTP request cannot become a session template.
    }

    const response = await originalFetch(...args);
    const rawBody = args[1]?.body ?? (input instanceof Request ? input.body : null);
    let requestBody: unknown;
    if (typeof rawBody === "string" && rawBody.length <= 20_000) {
      try { requestBody = JSON.parse(rawBody); } catch { requestBody = rawBody; }
    }
    if (isRelevantFomoApiUrl(rawUrl)) {
      void response.clone().json().then((payload: unknown) => {
        if (JSON.stringify(payload).length <= 4_000_000) {
          retain({ url: new URL(rawUrl, location.href).toString(), payload, capturedAt: Date.now(), requestBody });
        }
      }).catch(() => undefined);
    }
    return response;
  };

  window.addEventListener("wicklapse:fomo-snapshot-request", () => {
    for (const capture of state.captures) publish(capture);
  });
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data as { source?: unknown; type?: unknown; requestId?: unknown; url?: unknown };
    if (message?.source !== BRIDGE_MESSAGE_SOURCE || message.type !== "focused-candle-request"
      || typeof message.requestId !== "string" || typeof message.url !== "string") return;
    const requestId = message.requestId;
    const requestedUrl = message.url;
    void (async () => {
      try {
        const key = mobulaRequestKey(new URL(requestedUrl));
        const template = key ? mobulaRequestTemplates.get(key) : null;
        if (!template) throw new Error("Fomo chart session is not ready.");
        const safeUrl = validatedFocusedUrl(requestedUrl, template);
        if (!safeUrl) throw new Error("Invalid focused candle request.");
        const request = new Request(safeUrl, {
          method: "GET",
          headers: template.headers,
          mode: template.mode,
          credentials: template.credentials,
          cache: "no-store",
          redirect: template.redirect,
          referrer: template.referrer,
          referrerPolicy: template.referrerPolicy,
        });
        const response = await originalFetch(request);
        if (!response.ok) throw new Error(`Fomo candle request failed (${response.status}).`);
        const payload: unknown = await response.json();
        if (JSON.stringify(payload).length > 4_000_000) throw new Error("Fomo candle response was too large.");
        const capture = { url: safeUrl.toString(), payload, capturedAt: Date.now() };
        retain(capture);
        window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: "focused-candle-response", requestId, capture }, location.origin);
      } catch (error) {
        window.postMessage({
          source: BRIDGE_MESSAGE_SOURCE,
          type: "focused-candle-response",
          requestId,
          error: error instanceof Error ? error.message : "Fomo candle request failed.",
        }, location.origin);
      }
    })();
  });
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: "ready" }, location.origin);
}

export const FOMO_BRIDGE_MESSAGE_SOURCE = BRIDGE_MESSAGE_SOURCE;
