import { describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_SETTINGS, StudioSettingsSchema } from "./studio-settings";

describe("StudioSettingsSchema", () => {
  it("accepts every shipped default", () => {
    expect(StudioSettingsSchema.parse(DEFAULT_STUDIO_SETTINGS)).toEqual(DEFAULT_STUDIO_SETTINGS);
  });

  it("rejects corrupt persisted dimensions, duration, sounds, and intervals", () => {
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, width: Number.NaN }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, duration: 0 }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, buySound: "missing-file" }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, candleInterval: "2s" }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, tradeIndicatorStyle: "bubbles" }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, tradeIndicatorStyle: "markers" }).success).toBe(false);
    expect(StudioSettingsSchema.safeParse({ ...DEFAULT_STUDIO_SETTINGS, tradeIndicatorStyle: "minimal" }).success).toBe(false);
  });

  it("defaults execution indicators to the canvas feed", () => {
    expect(DEFAULT_STUDIO_SETTINGS.tradeIndicatorStyle).toBe("feed");
  });
});
