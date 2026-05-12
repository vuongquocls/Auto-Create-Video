import { describe, expect, it } from "vitest";
import { enrichScriptWithBrandAssets, createBrandAssetManifest } from "./brand-assets.js";
import type { Script } from "../render/script-schema.js";

const baseScript = {
  version: "1.0",
  metadata: {
    title: "Yok Don chong chay rung",
    source: { url: "idea", domain: "idea", image: null },
    channel: "Quoc YokDon",
  },
  voice: { provider: "lucylab", voiceId: "voice-id", speed: 1 },
  scenes: [
    {
      id: "hook",
      type: "hook",
      voiceText: "Canh bao chay rung den som hon moi nam.",
      templateData: { template: "hook", headline: "Chay rung den som", subhead: "Yok Don canh giac", kenBurns: "zoom-in" },
      assetPrompt: "dry dipterocarp forest patrol at sunrise",
    },
    {
      id: "body-1",
      type: "body",
      voiceText: "Kiem lam phai theo doi tung vet khoi nho.",
      templateData: { template: "image-card", title: "Tuan tra som", detail: "Kiem lam doc dau vet khoi" },
    },
    {
      id: "body-2",
      type: "body",
      voiceText: "Nguoi dan bao tin giup ngan dam chay lan rong.",
      templateData: { template: "callout", statement: "Bao tin som la khac biet lon" },
      assetPrompt: "villagers and ranger checking a smoke column from forest edge",
      creative: { tone: "cinematic", accent: "amber", background: "abstract", motion: "pan-left", density: "balanced" },
    },
    {
      id: "body-3",
      type: "body",
      voiceText: "Cong nghe giup xac dinh diem nong nhanh hon.",
      templateData: { template: "stat-hero", value: "15 phut", label: "de phat hien diem nong" },
    },
    {
      id: "outro",
      type: "outro",
      voiceText: "Theo doi Quoc YokDon de hieu hon ve rung.",
      templateData: { template: "outro", ctaTop: "Theo doi ngay", channelName: "Quoc YokDon", source: "idea" },
    },
  ],
} satisfies Script;

describe("brand assets", () => {
  it("adds pending branded assets to scenes with assetPrompt", () => {
    const enriched = enrichScriptWithBrandAssets(baseScript);

    expect(enriched.scenes[0].asset?.provider).toBe("manual");
    expect(enriched.scenes[0].asset?.status).toBe("pending");
    expect(enriched.scenes[0].asset?.brand?.profile).toBe("yokdon-intimate-wilderness");
    expect(enriched.scenes[0].asset?.prompt).toContain("dry dipterocarp forest patrol");
    expect(enriched.scenes[1].asset).toBeUndefined();
    expect(enriched.scenes[2].asset?.prompt).toContain("pan-left");
  });

  it("creates a compact prompt manifest for downstream image generation", () => {
    const enriched = enrichScriptWithBrandAssets(baseScript);
    const manifest = createBrandAssetManifest(enriched);

    expect(manifest.brand.profile).toBe("yokdon-intimate-wilderness");
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets[0]).toMatchObject({
      sceneId: "hook",
      status: "pending",
      provider: "manual",
    });
    expect(manifest.assets[0].prompt).toContain("vertical 9:16");
  });
});
