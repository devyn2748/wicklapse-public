import { browser } from "wxt/browser";
import type { CardAspectRatio } from "./studio-settings";

export type BundledBackdrop = "aurora" | "cyberpunk-scene" | "starlit-lake" | "neon-tokyo";

export const BUNDLED_BACKDROPS: ReadonlyArray<{ value: BundledBackdrop; label: string }> = [
  { value: "aurora", label: "Aurora" },
  { value: "cyberpunk-scene", label: "Cyberpunk Scene" },
  { value: "starlit-lake", label: "Starlit Lake" },
  { value: "neon-tokyo", label: "Neon Tokyo" },
];

export function isBundledBackdrop(value: string): value is BundledBackdrop {
  return BUNDLED_BACKDROPS.some((backdrop) => backdrop.value === value);
}

export async function loadBundledBackdrop(value: string, aspectRatio: CardAspectRatio): Promise<ImageBitmap | null> {
  if (!isBundledBackdrop(value)) return null;
  const orientation = aspectRatio === "9:16" ? "tall" : "wide";
  const response = await fetch(browser.runtime.getURL(`/backdrops/${value === "cyberpunk-scene" ? "cyberpunk" : value}-${orientation}.png`));
  if (!response.ok) throw new Error(`Bundled backdrop could not be loaded (${response.status}).`);
  return createImageBitmap(await response.blob());
}
