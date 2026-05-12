import type { Script } from "../render/script-schema.js";
import { buildBrandAssetPrompt, YOKDON_BRAND_PROFILE } from "./brand-prompt.js";

export interface BrandAssetManifest {
  brand: {
    profile: string;
    name: string;
    vibe: string;
  };
  assets: Array<{
    sceneId: string;
    sceneType: string;
    provider: string;
    status: string;
    prompt: string;
    image?: string;
  }>;
}

export function enrichScriptWithBrandAssets(script: Script): Script {
  return {
    ...script,
    scenes: script.scenes.map((scene) => {
      if (!scene.assetPrompt || scene.asset?.status === "ready") return scene;

      const prompt = scene.asset?.prompt ?? buildBrandAssetPrompt({
        brand: YOKDON_BRAND_PROFILE,
        sceneId: scene.id,
        sceneType: scene.type,
        topic: script.metadata.title,
        assetPrompt: scene.assetPrompt,
        captionHeadline: scene.caption?.headline,
        motion: scene.creative?.motion,
        aspectRatio: "9:16",
      });

      return {
        ...scene,
        asset: {
          provider: scene.asset?.provider ?? "manual",
          status: scene.asset?.status ?? "pending",
          image: scene.asset?.image,
          prompt,
          brand: scene.asset?.brand ?? {
            profile: YOKDON_BRAND_PROFILE.id,
            vibe: YOKDON_BRAND_PROFILE.name,
            aspectRatio: "9:16",
          },
        },
      };
    }),
  };
}

export function createBrandAssetManifest(script: Script): BrandAssetManifest {
  return {
    brand: {
      profile: YOKDON_BRAND_PROFILE.id,
      name: YOKDON_BRAND_PROFILE.name,
      vibe: YOKDON_BRAND_PROFILE.vibe,
    },
    assets: script.scenes
      .filter((scene) => scene.asset)
      .map((scene) => ({
        sceneId: scene.id,
        sceneType: scene.type,
        provider: scene.asset!.provider,
        status: scene.asset!.status,
        prompt: scene.asset!.prompt,
        image: scene.asset!.image,
      })),
  };
}
