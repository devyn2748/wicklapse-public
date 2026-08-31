import { browser } from "wxt/browser";
import type { CardAspectRatio } from "./studio-settings";

export type BundledBackdrop = "aurora" | "cyberpunk-scene" | "starlit-lake" | "neon-tokyo" | "anime-edit" | "anime-edit-2" | "anime-edit-3" | "anime-edit-4";
export type BundledVideoBackdrop = "anime-edit" | "anime-edit-2" | "anime-edit-3" | "anime-edit-4";
export type BundledBackdropMedia = ImageBitmap | HTMLVideoElement;

export const BUNDLED_BACKDROPS: ReadonlyArray<{ value: BundledBackdrop; label: string }> = [
  { value: "aurora", label: "Aurora" },
  { value: "cyberpunk-scene", label: "Cyberpunk Scene" },
  { value: "starlit-lake", label: "Starlit Lake" },
  { value: "neon-tokyo", label: "Neon Tokyo" },
  { value: "anime-edit", label: "Anime Edit · video + audio" },
  { value: "anime-edit-2", label: "Anime Edit 2 · video + audio" },
  { value: "anime-edit-3", label: "Anime Edit 3 · video + audio" },
  { value: "anime-edit-4", label: "Anime Edit 4 · video + audio" },
];

const VIDEO_BACKDROP_FILES = {
  "anime-edit": "/backdrops/anime-edit.m4v",
  "anime-edit-2": "/backdrops/anime-edit-2.m4v",
  "anime-edit-3": "/backdrops/anime-edit-3.m4v",
  "anime-edit-4": "/backdrops/anime-edit-4.m4v",
} as const;

export function isBundledBackdrop(value: string): value is BundledBackdrop {
  return BUNDLED_BACKDROPS.some((backdrop) => backdrop.value === value);
}

export function isBundledVideoBackdrop(value: string): value is BundledVideoBackdrop {
  return value in VIDEO_BACKDROP_FILES;
}

export function isVideoBackdrop(media: CanvasImageSource | null): media is HTMLVideoElement {
  return typeof HTMLVideoElement !== "undefined" && media instanceof HTMLVideoElement;
}

export function disposeBundledBackdrop(media: BundledBackdropMedia | null): void {
  if (!media) return;
  if (isVideoBackdrop(media)) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  } else media.close();
}

export async function loadBundledBackdrop(value: string, aspectRatio: CardAspectRatio): Promise<BundledBackdropMedia | null> {
  if (!isBundledBackdrop(value)) return null;
  if (isBundledVideoBackdrop(value)) {
    const video = document.createElement("video");
    video.src = browser.runtime.getURL(VIDEO_BACKDROP_FILES[value]);
    video.preload = "auto";
    video.loop = true;
    video.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("Bundled video backdrop could not be loaded.")), { once: true });
      video.load();
    });
    return video;
  }
  const orientation = aspectRatio === "9:16" ? "tall" : "wide";
  const response = await fetch(browser.runtime.getURL(`/backdrops/${value === "cyberpunk-scene" ? "cyberpunk" : value}-${orientation}.png`));
  if (!response.ok) throw new Error(`Bundled backdrop could not be loaded (${response.status}).`);
  return createImageBitmap(await response.blob());
}
