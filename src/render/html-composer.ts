import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script, TemplateDataType } from "./script-schema.js";


const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates");

// Grain overlay HTML inline (from installed component)
const GRAIN_OVERLAY_HTML = `<div id="grain-overlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;"><div class="grain-texture"></div></div>`;



export interface SceneAudio {
  id: string;
  durationSec: number;
}

export interface ComposeArgs {
  script: Script;
  sceneAudio: SceneAudio[];
  gapSec: number;
  bgImageRelPath: string | null;   // null => no image available
  audioRelPath: string;
}

export function composeHtml(args: ComposeArgs): string {
  const { script, sceneAudio, gapSec, bgImageRelPath, audioRelPath } = args;

  // Compute timing per scene
  let cursor = 0;
  const timing = script.scenes.map((scene) => {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) throw new Error(`No audio entry for scene id=${scene.id}`);
    const dur = audio.durationSec + gapSec;
    const start = cursor;
    cursor += dur;
    return { scene, start, duration: dur };
  });
  const totalDuration = cursor;

  // Render scenes
  const sceneHtml = timing.map(({ scene, start, duration }) => {
    return renderScene(scene, start, duration, bgImageRelPath);
  }).join("\n");

  // Persistent shell — minimal footer watermark only
  const shellHtml = renderShell(script.metadata);

  const animJs = readFileSync(join(TPL_DIR, "animations.js"), "utf8");

  const tpl = readFileSync(join(TPL_DIR, "base.html.tmpl"), "utf8");
  return tpl
    .replace("{{TITLE}}", escapeHtml(script.metadata.title))
    .replace(/\{\{TOTAL_DURATION\}\}/g, totalDuration.toFixed(2))
    .replace("{{SHELL}}", shellHtml)
    .replace("{{SCENES}}", sceneHtml)
    .replace(/src="voice\.mp3"/g, `src="${audioRelPath}"`)
    .replace('<script src="animations.js"></script>', `<script>\n${animJs}\n</script>`);
}

// ── PERSISTENT SHELL ───────────────────────────────────────────────────────
function renderShell(_metadata: Script["metadata"]): string {
  return `
<!-- Shell: persistent brand elements (no data-start → always visible) -->
<div class="shell-bg"></div>

<img class="yokdon-logo" src="assets/logo-vuon.png" alt="Vườn quốc gia Yok Đôn" onerror="this.style.display='none'" />

<div class="brand-shell-handle">
  <span class="handle-music">&#9835;</span>
  <span class="handle-text">@quocyokdon</span>
</div>

${GRAIN_OVERLAY_HTML}`.trim();
}

// ── SCENE DISPATCH ─────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  bgImageRelPath: string | null,
): string {
  const td = scene.templateData;
  const sceneImageRelPath = scene.asset?.status === "ready" && scene.asset.image
    ? scene.asset.image
    : bgImageRelPath;

  let inner: string;
  let layoutName: string;

  switch (td.template) {
    case "hook":
      inner = renderHookInner(td, sceneImageRelPath);
      layoutName = "hook";
      break;
    case "comparison":
      inner = renderComparisonInner(td);
      layoutName = "comparison";
      break;
    case "stat-hero":
      inner = renderStatHeroInner(td);
      layoutName = "stat-hero";
      break;
    case "feature-list":
      inner = renderFeatureListInner(td);
      layoutName = "feature-list";
      break;
    case "callout":
      inner = renderCalloutInner(td);
      layoutName = "callout";
      break;
    case "image-card":
      inner = renderImageCardInner(td, sceneImageRelPath);
      layoutName = "image-card";
      break;
    case "social-news-card":
      inner = renderSocialNewsCardInner(td, sceneImageRelPath);
      layoutName = "social-news-card";
      break;
    case "quote":
      inner = renderQuoteInner(td);
      layoutName = "quote";
      break;
    case "steps":
      inner = renderStepsInner(td);
      layoutName = "steps";
      break;
    case "timeline":
      inner = renderTimelineInner(td);
      layoutName = "timeline";
      break;
    case "outro":
      inner = renderOutroInner(td);
      layoutName = "outro";
      break;
    default: {
      const _never: never = td;
      throw new Error(`Unknown template: ${(_never as any).template}`);
    }
  }

  return buildScene(scene, start, duration, layoutName, inner, sceneImageRelPath);
}

// ── HOOK SCENE ─────────────────────────────────────────────────────────────
function renderHookInner(td: Extract<TemplateDataType, { template: "hook" }>, bgImageRelPath: string | null): string {
  // Background
  let bgHtml: string;
  if (td.bgSrc && bgImageRelPath) {
    // Ken Burns image
    const kbClass = td.kenBurns ?? "zoom-in";
    bgHtml = `<div class="bg kb-${kbClass}" style="background-image: url('${bgImageRelPath}')"></div>`;
  } else {
    bgHtml = `<div class="bg gradient-news-dark"></div>`;
  }
  const overlayHtml = `<div class="overlay" style="opacity: 0.55"></div>`;

  const headline = escapeHtml(td.headline);
  const subhead = td.subhead ? escapeHtml(td.subhead) : "";

  return `${bgHtml}
  ${overlayHtml}
  <div class="layout-hook">
    <div class="hook-headline shimmer-sweep-target">${headline}</div>
    ${subhead ? `<div class="hook-subhead">${subhead}</div>` : ""}
  </div>`;
}

// ── COMPARISON SCENE ───────────────────────────────────────────────────────
function renderComparisonInner(td: Extract<TemplateDataType, { template: "comparison" }>): string {
  const lColor = td.left.color;  // "cyan" | "purple"
  const rColor = td.right.color;
  const winnerClass = td.right.winner ? " card-winner" : "";

  return `
<div class="layout-comparison">
  <div class="cmp-card cmp-left color-${lColor}">
    <div class="cmp-label">${escapeHtml(td.left.label)}</div>
    <div class="cmp-value">${escapeHtml(td.left.value)}</div>
  </div>
  <div class="cmp-vs">VS</div>
  <div class="cmp-card cmp-right color-${rColor}${winnerClass}">
    <div class="cmp-label">${escapeHtml(td.right.label)}</div>
    <div class="cmp-value">${escapeHtml(td.right.value)}</div>
    ${td.right.winner ? '<div class="cmp-winner-badge">WINNER</div>' : ""}
  </div>
</div>`.trim();
}

// ── STAT HERO SCENE ────────────────────────────────────────────────────────
function renderStatHeroInner(td: Extract<TemplateDataType, { template: "stat-hero" }>): string {
  const context = td.context ? `<div class="stat-context">${escapeHtml(td.context)}</div>` : "";
  return `
<div class="layout-stat-hero">
  <div class="stat-value shimmer-sweep-target">${escapeHtml(td.value)}</div>
  <div class="stat-label">${escapeHtml(td.label)}</div>
  ${context}
</div>`.trim();
}

// ── FEATURE LIST SCENE ─────────────────────────────────────────────────────
function renderFeatureListInner(td: Extract<TemplateDataType, { template: "feature-list" }>): string {
  const bullets = td.bullets.map((b, i) =>
    `<div class="feat-bullet feat-bullet-${i}" data-idx="${i}">
      <div class="feat-dot"></div>
      <div class="feat-text">${escapeHtml(b)}</div>
    </div>`
  ).join("\n    ");

  return `
<div class="layout-feature-list">
  <div class="feat-card">
    <div class="feat-title">${escapeHtml(td.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${bullets}
    </div>
  </div>
</div>`.trim();
}

// ── CALLOUT SCENE ──────────────────────────────────────────────────────────
function renderCalloutInner(td: Extract<TemplateDataType, { template: "callout" }>): string {
  const tag = td.tag ? `<div class="callout-tag">${escapeHtml(td.tag)}</div>` : "";
  return `
<div class="layout-callout">
  <div class="callout-card">
    ${tag}
    <div class="callout-statement">${escapeHtml(td.statement)}</div>
  </div>
</div>`.trim();
}

// ── IMAGE CARD SCENE ──────────────────────────────────────────────────────
function renderImageCardInner(td: Extract<TemplateDataType, { template: "image-card" }>, bgImageRelPath: string | null): string {
  const media = bgImageRelPath
    ? `<div class="image-card-media" style="background-image: url('${bgImageRelPath}')"></div>`
    : `<div class="image-card-media image-card-media-fallback"><span>${escapeHtml(td.title.slice(0, 1))}</span></div>`;
  const kicker = td.kicker ? `<div class="image-card-kicker">${escapeHtml(td.kicker)}</div>` : "";
  const detail = td.detail ? `<div class="image-card-detail">${escapeHtml(td.detail)}</div>` : "";
  return `
<div class="layout-image-card">
  ${media}
  <div class="image-card-copy">
    ${kicker}
    <div class="image-card-title">${escapeHtml(td.title)}</div>
    ${detail}
  </div>
</div>`.trim();
}

// ── SOCIAL NEWS CARD SCENE ────────────────────────────────────────────────
function renderSocialNewsCardInner(td: Extract<TemplateDataType, { template: "social-news-card" }>, bgImageRelPath: string | null): string {
  const media = bgImageRelPath
    ? `<div class="social-news-photo" style="background-image: url('${bgImageRelPath}')"></div>`
    : `<div class="social-news-photo social-news-photo-fallback"></div>`;
  const footer = td.footer ? `<div class="social-news-footer">${escapeHtml(td.footer)}</div>` : "";
  return `
<div class="layout-social-news-card panel-${td.panel} headline-${td.headlineStyle}">
  <div class="social-news-visual">
    <div class="social-news-blur">${media}</div>
    ${media}
    <div class="social-news-vignette"></div>
  </div>
  <div class="social-news-panel">
    <div class="social-news-source">${escapeHtml(td.source)}</div>
    <div class="social-news-headline shimmer-sweep-target">${escapeHtml(td.headline)}</div>
    <div class="social-news-body">${escapeHtml(td.body)}</div>
    ${footer}
  </div>
</div>`.trim();
}

// ── QUOTE SCENE ───────────────────────────────────────────────────────────
function renderQuoteInner(td: Extract<TemplateDataType, { template: "quote" }>): string {
  const attr = td.attribution ? `<div class="quote-attr">${escapeHtml(td.attribution)}</div>` : "";
  return `
<div class="layout-quote">
  <div class="quote-mark">“</div>
  <div class="quote-text">${escapeHtml(td.quote)}</div>
  ${attr}
</div>`.trim();
}

// ── STEPS SCENE ───────────────────────────────────────────────────────────
function renderStepsInner(td: Extract<TemplateDataType, { template: "steps" }>): string {
  const steps = td.steps.map((step, i) => `
    <div class="step-row step-row-${i}">
      <div class="step-index">${String(i + 1).padStart(2, "0")}</div>
      <div class="step-text">${escapeHtml(step)}</div>
    </div>`).join("");
  return `
<div class="layout-steps">
  <div class="steps-title">${escapeHtml(td.title)}</div>
  <div class="steps-list">${steps}</div>
</div>`.trim();
}

// ── TIMELINE SCENE ────────────────────────────────────────────────────────
function renderTimelineInner(td: Extract<TemplateDataType, { template: "timeline" }>): string {
  const items = td.items.map((item, i) => `
    <div class="timeline-item timeline-item-${i}">
      <div class="timeline-dot"></div>
      <div class="timeline-copy">
        <div class="timeline-label">${escapeHtml(item.label)}</div>
        <div class="timeline-value">${escapeHtml(item.value)}</div>
      </div>
    </div>`).join("");
  return `
<div class="layout-timeline">
  <div class="timeline-title">${escapeHtml(td.title)}</div>
  <div class="timeline-track"></div>
  <div class="timeline-list">${items}</div>
</div>`.trim();
}

// ── OUTRO SCENE ────────────────────────────────────────────────────────────
function renderOutroInner(
  td: Extract<TemplateDataType, { template: "outro" }>,
): string {
  return `
<div class="layout-outro">
  <div class="out-cta-top">${escapeHtml(td.ctaTop)}</div>
  <div class="out-channel">${escapeHtml(td.channelName)}</div>
  <div class="out-underline"></div>
</div>
`.trim();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function buildScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  layoutName: string,
  innerHtml: string,
  bgImageRelPath: string | null,
): string {
  const creative = scene.creative;
  const accent = creative?.accent ?? defaultAccent(layoutName);
  const tone = creative?.tone ?? "studio";
  const motion = creative?.motion ?? "push-in";
  const bg = renderSceneAtmosphere(scene, bgImageRelPath, layoutName);
  const caption = renderCaption(scene);
  return `
<div class="scene clip" id="scene-${scene.id}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-active="0"
     data-layout="${layoutName}" data-accent="${accent}" data-tone="${tone}" data-motion="${motion}">
  ${bg}
  ${innerHtml}
  ${caption}
</div>`.trim();
}

function defaultAccent(layoutName: string): string {
  if (layoutName === "feature-list" || layoutName === "quote") return "purple";
  if (layoutName === "callout" || layoutName === "timeline") return "amber";
  if (layoutName === "steps") return "lime";
  return "cyan";
}

function renderSceneAtmosphere(scene: Script["scenes"][number], bgImageRelPath: string | null, layoutName: string): string {
  if (layoutName === "hook" || layoutName === "outro" || layoutName === "social-news-card") return "";
  const creative = scene.creative;
  const bg = creative?.background ?? "abstract";
  const motion = creative?.motion ?? "push-in";
  const hasSceneAsset = scene.asset?.status === "ready" && Boolean(scene.asset.image);
  const useImage = bgImageRelPath && (hasSceneAsset || bg === "source-image" || bg === "split");
  const image = useImage
    ? `<div class="scene-photo scene-photo-${motion}" style="background-image: url('${bgImageRelPath}')"></div>`
    : "";
  return `
<div class="scene-atmosphere bg-${bg} motion-${motion}">
  <div class="scene-gradient"></div>
  <div class="scene-grid"></div>
  <div class="scene-sweep"></div>
  ${image}
</div>`.trim();
}

function renderCaption(scene: Script["scenes"][number]): string {
  if (!scene.caption || scene.type === "outro") return "";
  const badge = scene.caption.badge ? `<div class="caption-badge">${escapeHtml(scene.caption.badge)}</div>` : "";
  const subline = scene.caption.subline ? `<div class="caption-subline">${escapeHtml(scene.caption.subline)}</div>` : "";
  return `
<div class="scene-caption">
  ${badge}
  <div class="caption-headline">${escapeHtml(scene.caption.headline)}</div>
  ${subline}
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
