import { describe, expect, it } from "vitest";
import { buildBrandAssetPrompt, YOKDON_BRAND_PROFILE } from "./brand-prompt.js";

describe("buildBrandAssetPrompt", () => {
  it("turns a scene asset prompt into a YokDon brand-consistent image prompt", () => {
    const prompt = buildBrandAssetPrompt({
      brand: YOKDON_BRAND_PROFILE,
      sceneId: "body-2",
      sceneType: "body",
      topic: "Kiem lam tuan tra rung khop luc binh minh",
      assetPrompt: "forest ranger observing wildlife beside the Serepok river",
      captionHeadline: "Canh bao som",
      motion: "push-in",
      aspectRatio: "9:16",
    });

    expect(prompt).toContain("Yok Don — Intimate Wilderness");
    expect(prompt).toContain("forest ranger observing wildlife beside the Serepok river");
    expect(prompt).toContain("Earth & Muted");
    expect(prompt).toContain("Natural low-key golden hour");
    expect(prompt).toContain("35mm");
    expect(prompt).toContain("vertical 9:16");
    expect(prompt).toContain("safe center crop");
    expect(prompt).toContain("No text, captions, watermark, logo");
  });
});
