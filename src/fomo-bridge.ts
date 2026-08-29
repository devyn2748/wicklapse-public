const BRIDGE_MESSAGE_SOURCE = "wicklapse-fomo-bridge";
const BRIDGE_STATE_KEY = "__wicklapseFomoBridgeV1";

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

function isRelevantFomoApiUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl, location.href);
    if (url.origin === "https://fomo-api.mobula.io") return url.pathname === "/api/2/token/ohlcv-history";
    if (url.origin !== "https://prod-api.fomo.family") return false;
    return url.pathname === "/proxy/getBarsNew"
      || url.pathname === "/proxy/getBars"
      || url.pathname.startsWith("/trades")
      || url.pathname.startsWith("/v2/users/userHandle/");
  } catch {
    return false;
  }
}

/** Runs in Fomo's MAIN world. It captures response bodies, never request headers. */
export function installFomoFetchBridge(): void {
  const bridgeWindow = window as typeof window & { [BRIDGE_STATE_KEY]?: BridgeState };
  if (bridgeWindow[BRIDGE_STATE_KEY]?.installed) return;
  const state: BridgeState = { installed: true, captures: [] };
  bridgeWindow[BRIDGE_STATE_KEY] = state;

  const publish = (capture: BridgeCapture) => {
    window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: "capture", capture }, location.origin);
  };
  const retain = (capture: BridgeCapture) => {
    state.captures = [...state.captures.filter((item) => item.url !== capture.url), capture].slice(-20);
    publish(capture);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const response = await originalFetch(...args);
    const input = args[0];
    const rawUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const rawBody = args[1]?.body ?? (input instanceof Request ? input.body : null);
    let requestBody: unknown;
    if (typeof rawBody === "string" && rawBody.length <= 20_000) {
      try {
        requestBody = JSON.parse(rawBody);
      } catch {
        requestBody = rawBody;
      }
    }
    if (isRelevantFomoApiUrl(rawUrl)) {
      void response.clone().json().then((payload: unknown) => {
        const serialized = JSON.stringify(payload);
        if (serialized.length <= 4_000_000) retain({ url: new URL(rawUrl, location.href).toString(), payload, capturedAt: Date.now(), requestBody });
      }).catch(() => undefined);
    }
    return response;
  };

  window.addEventListener("wicklapse:fomo-snapshot-request", () => {
    for (const capture of state.captures) publish(capture);
  });
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: "ready" }, location.origin);
}

export const FOMO_BRIDGE_MESSAGE_SOURCE = BRIDGE_MESSAGE_SOURCE;
