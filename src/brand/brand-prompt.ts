export interface BrandProfile {
  id: string;
  name: string;
  vibe: string;
  quality: string;
  palette: {
    name: string;
    description: string;
  };
  lighting: string;
  composition: string;
  lens: string;
  textures: string;
  negativePrompt: string;
}

export interface BrandAssetPromptInput {
  brand: BrandProfile;
  sceneId: string;
  sceneType: string;
  topic: string;
  assetPrompt: string;
  captionHeadline?: string;
  motion?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
}

export const YOKDON_BRAND_PROFILE: BrandProfile = {
  id: "yokdon-intimate-wilderness",
  name: "Yok Don — Intimate Wilderness",
  vibe: "Intimate documentary wilderness: close to nature, quiet, observant, grounded, never glossy or touristy.",
  quality: "photorealistic cinematic documentary frame, natural skin tones, highly detailed, editorial realism",
  palette: {
    name: "Earth & Muted",
    description: "dry ochre, muted moss green, warm soil brown, soft golden highlights, slightly cool deep shadows",
  },
  lighting: "Natural low-key golden hour lighting, motivated sunlight through forest canopy, soft rim light, gentle contrast",
  composition: "off-center rule of thirds, layered foreground branches or tree trunks, clear subject silhouette, strong depth",
  lens: "35mm documentary lens, f/1.8 to f/2.8, medium shallow depth of field, natural bokeh",
  textures: "rough dipterocarp bark, dry leaves, cracked earth, river reflections, ranger fabric, dust, weathered surfaces",
  negativePrompt: "No text, captions, watermark, logo, UI, extra fingers, distorted faces, plastic skin, over-saturated colors, fantasy armor, tourist postcard look",
};

export function buildBrandAssetPrompt(input: BrandAssetPromptInput): string {
  const aspectRatio = input.aspectRatio ?? "9:16";
  const captionContext = input.captionHeadline ? `Scene caption context: ${input.captionHeadline}.` : "";
  const motionContext = input.motion ? `Motion potential for video: ${input.motion}; leave visual depth for subtle camera movement.` : "";

  return [
    `${input.brand.name}.`,
    `Scene ${input.sceneId} (${input.sceneType}) for topic: ${input.topic}.`,
    `Main visual: ${input.assetPrompt}.`,
    captionContext,
    `Vibe: ${input.brand.vibe}`,
    `Color palette: ${input.brand.palette.name} — ${input.brand.palette.description}.`,
    `Lighting: ${input.brand.lighting}.`,
    `Composition: ${input.brand.composition}; vertical ${aspectRatio}; safe center crop for Shorts/Reels; keep important subject details away from top and bottom UI zones.`,
    `Lens and camera: ${input.brand.lens}.`,
    `Texture signature: ${input.brand.textures}.`,
    motionContext,
    `Quality: ${input.brand.quality}.`,
    input.brand.negativePrompt,
  ].filter(Boolean).join(" ");
}
