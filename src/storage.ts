import { browser } from "wxt/browser";
import {
  RpcSettingsSchema,
  ShareContextSchema,
  type RpcSettings,
  type ShareContext,
  type StudioProject,
} from "./domain";
import { DEFAULT_STUDIO_SETTINGS, StudioSettingsSchema, type StudioSettings } from "./studio-settings";
import { normalizeWalletAddresses } from "./axiom-api";

const KEYS = {
  latestShareContext: "wicklapse.latestShareContext",
  rpcSettings: "wicklapse.rpcSettings",
  project: "wicklapse.project",
  studioSettings: "wicklapse.studioSettings",
  tradingWallets: "wicklapse.tradingWallets",
} as const;

export async function saveShareContext(context: ShareContext): Promise<void> {
  await browser.storage.local.set({ [KEYS.latestShareContext]: ShareContextSchema.parse(context) });
}

export async function loadShareContext(): Promise<ShareContext | null> {
  const result = await browser.storage.local.get(KEYS.latestShareContext);
  const parsed = ShareContextSchema.safeParse(result[KEYS.latestShareContext]);
  return parsed.success ? parsed.data : null;
}

export async function saveRpcSettings(settings: RpcSettings): Promise<void> {
  const validated = RpcSettingsSchema.parse(settings);
  if (validated.remember) {
    await browser.storage.local.set({ [KEYS.rpcSettings]: validated });
    try {
      await browser.storage.session.remove(KEYS.rpcSettings);
    } catch {
      // Content scripts cannot always clean session storage. The remembered local value is authoritative.
    }
    return;
  }

  await browser.storage.session.set({ [KEYS.rpcSettings]: validated });
  await browser.storage.local.remove(KEYS.rpcSettings);
}

export async function loadRpcSettings(): Promise<RpcSettings | null> {
  let sessionValue: unknown;
  try {
    const session = await browser.storage.session.get(KEYS.rpcSettings);
    sessionValue = session[KEYS.rpcSettings];
  } catch {
    // Chrome does not expose storage.session to content scripts unless its access level is widened.
    // First-run and remembered credentials use storage.local, so the in-page Instant UI can safely continue.
  }
  const local = await browser.storage.local.get(KEYS.rpcSettings);
  const parsed = RpcSettingsSchema.safeParse(sessionValue ?? local[KEYS.rpcSettings]);
  return parsed.success ? parsed.data : null;
}

export async function saveTradingWalletAddresses(walletAddresses: string[]): Promise<void> {
  await browser.storage.local.set({ [KEYS.tradingWallets]: normalizeWalletAddresses(walletAddresses) });
}

export async function loadTradingWalletAddresses(): Promise<string[]> {
  const stored = await browser.storage.local.get(KEYS.tradingWallets);
  const rawWallets: unknown = stored[KEYS.tradingWallets];
  const configured = Array.isArray(rawWallets)
    ? normalizeWalletAddresses(rawWallets.filter((value: unknown): value is string => typeof value === "string"))
    : [];
  if (configured.length) return configured;
  const legacyRpc = await loadRpcSettings();
  return legacyRpc ? normalizeWalletAddresses([legacyRpc.walletAddress]) : [];
}

export async function saveProject(project: StudioProject): Promise<void> {
  await browser.storage.local.set({ [KEYS.project]: project });
}

export async function loadProject(): Promise<StudioProject | null> {
  const result = await browser.storage.local.get(KEYS.project);
  const value = result[KEYS.project];
  if (!value || typeof value !== "object") return null;
  return value as StudioProject;
}

export async function saveStudioSettings(settings: StudioSettings): Promise<void> {
  await browser.storage.local.set({ [KEYS.studioSettings]: { version: 7, settings: StudioSettingsSchema.parse(settings) } });
}

export async function loadStudioSettings(): Promise<StudioSettings> {
  const result = await browser.storage.local.get(KEYS.studioSettings);
  const value = result[KEYS.studioSettings];
  const version = value && typeof value === "object" ? (value as { version?: number }).version : undefined;
  if (version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7) {
    return DEFAULT_STUDIO_SETTINGS;
  }
  const parsed = StudioSettingsSchema.safeParse({
    ...DEFAULT_STUDIO_SETTINGS,
    ...((value as { settings?: Partial<StudioSettings> }).settings ?? {}),
  });
  return parsed.success ? parsed.data : DEFAULT_STUDIO_SETTINGS;
}
