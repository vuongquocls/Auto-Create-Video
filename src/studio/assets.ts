import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Script } from "../render/script-schema.js";

export interface GeneratedAsset {
  sceneId: string;
  prompt: string;
  relPath: string;
  absPath: string;
}

export type AssetProvider = "local" | "openai";

const PALETTES = [
  ["#111827", "#164e63", "#22d3ee"],
  ["#111827", "#4c1d95", "#a855f7"],
  ["#111827", "#78350f", "#f59e0b"],
  ["#111827", "#881337", "#fb7185"],
  ["#111827", "#365314", "#84cc16"],
];

export async function generateSceneAssets(outputDir: string, script: Script, provider: AssetProvider): Promise<GeneratedAsset[]> {
  const assetsDir = join(outputDir, "assets", "scenes");
  await mkdir(assetsDir, { recursive: true });

  const generated: GeneratedAsset[] = [];
  let idx = 0;
  for (const scene of script.scenes) {
    if (scene.type === "outro") continue;
    const prompt = scene.asset?.prompt || scene.assetPrompt || scene.caption?.headline || scene.voiceText;
    const palette = PALETTES[idx % PALETTES.length];
    const ext = provider === "openai" ? "png" : "svg";
    const relPath = `assets/scenes/${scene.id}.${ext}`;
    const absPath = join(outputDir, relPath);
    if (provider === "openai") {
      await writeFile(absPath, await generateOpenAiPng(prompt));
    } else {
      await writeFile(absPath, makeSceneSvg({
        title: scene.caption?.headline || labelFromTemplate(scene.templateData),
        subtitle: scene.caption?.subline || scene.assetPrompt || prompt,
        badge: scene.caption?.badge || scene.templateData.template,
        prompt,
        palette,
        index: idx + 1,
      }));
    }
    scene.asset = {
      provider,
      prompt,
      image: relPath,
      status: "ready",
    };
    generated.push({ sceneId: scene.id, prompt, relPath, absPath });
    idx++;
  }
  return generated;
}

export async function generateLocalSceneAssets(outputDir: string, script: Script): Promise<GeneratedAsset[]> {
  return generateSceneAssets(outputDir, script, "local");
}

async function generateOpenAiPng(prompt: string): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY. Use local assets or set OPENAI_API_KEY in .env.local.");
  }
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${prompt}. Vertical 9:16 editorial social video frame, no text overlays, high contrast, clean subject, suitable for Vietnamese short-form video.`,
      size: "1024x1536",
      quality: process.env.OPENAI_IMAGE_QUALITY || "low",
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI image generation failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  const json: any = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image generation returned no b64_json image.");
  return Buffer.from(b64, "base64");
}

function makeSceneSvg(args: {
  title: string;
  subtitle: string;
  badge: string;
  prompt: string;
  palette: string[];
  index: number;
}) {
  const [bg, mid, accent] = args.palette;
  const title = fit(args.title, 34);
  const subtitle = fit(args.subtitle, 58);
  const prompt = fit(args.prompt, 84);
  const badge = fit(args.badge.toUpperCase(), 18);
  const seed = hash(args.prompt);
  const circles = Array.from({ length: 18 }, (_, i) => {
    const x = (seed * (i + 3) * 37) % 1080;
    const y = (seed * (i + 5) * 53) % 1920;
    const r = 80 + ((seed + i * 47) % 260);
    const opacity = 0.05 + (((seed + i) % 9) / 100);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? accent : mid}" opacity="${opacity.toFixed(2)}"/>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${mid}"/>
      <stop offset="0.52" stop-color="${bg}"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.18"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  ${circles}
  <rect width="1080" height="1920" filter="url(#grain)" opacity="0.35"/>
  <g opacity="0.20" stroke="#ffffff" stroke-width="1">
    ${Array.from({ length: 16 }, (_, i) => `<line x1="0" y1="${i * 128}" x2="1080" y2="${i * 128}"/>`).join("")}
    ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 135}" y1="0" x2="${i * 135}" y2="1920"/>`).join("")}
  </g>
  <g transform="translate(72 520)">
    <rect x="0" y="0" rx="28" width="936" height="680" fill="#020617" opacity="0.44" stroke="${accent}" stroke-opacity="0.5" stroke-width="2"/>
    <text x="54" y="92" fill="${accent}" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="3">${escapeXml(badge)}</text>
    <text x="54" y="218" fill="#ffffff" font-family="Impact, Anton, Arial Black, sans-serif" font-size="92" font-weight="900">${escapeXml(title)}</text>
    <text x="54" y="302" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700">${escapeXml(subtitle)}</text>
    <text x="54" y="570" fill="#94a3b8" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="600">${escapeXml(prompt)}</text>
  </g>
  <text x="72" y="1710" fill="${accent}" opacity="0.8" font-family="Impact, Anton, Arial Black, sans-serif" font-size="140" font-weight="900">${String(args.index).padStart(2, "0")}</text>
</svg>`;
}

function labelFromTemplate(templateData: Script["scenes"][number]["templateData"]) {
  switch (templateData.template) {
    case "hook": return templateData.headline;
    case "image-card": return templateData.title;
    case "steps": return templateData.title;
    case "timeline": return templateData.title;
    case "stat-hero": return `${templateData.value} ${templateData.label}`;
    case "comparison": return `${templateData.left.value} vs ${templateData.right.value}`;
    case "feature-list": return templateData.title;
    case "quote": return templateData.quote;
    case "callout": return templateData.statement;
    case "outro": return templateData.channelName;
  }
}

function fit(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() || clean.slice(0, max - 1);
}

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
