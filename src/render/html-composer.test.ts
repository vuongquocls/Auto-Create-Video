import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeHtml } from "./html-composer.js";
import type { Script } from "./script-schema.js";

describe("composeHtml", () => {
  it("produces deterministic HTML for sample script with image", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = [
      { id: "hook",   durationSec: 3.2 },
      { id: "body-1", durationSec: 11.5 },
      { id: "body-2", durationSec: 10.8 },
      { id: "body-3", durationSec: 12.1 },
      { id: "outro",  durationSec: 3.4 },
    ];
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
    });

    // ── HyperFrames structural requirements ──────────────────
    expect(html).toContain('id="stage"');
    expect(html).toContain('data-composition-id="news-video"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    expect(html).toContain('data-start="0"');           // root composition timing
    expect(html).toContain('id="voice"');               // audio element discoverable by hyperframes
    expect(html).toContain('class="scene clip"');       // clip class required for hyperframes visibility
    expect(html).toContain('window.__timelines');       // timeline registry (inlined JS)

    // ── Persistent minimal watermark shell ────────────────────
    expect(html).not.toContain('class="brand-shell-header"');
    expect(html).toContain('class="brand-shell-handle"');
    expect(html).not.toContain('class="brand-shell-keyword"');
    expect(html).toContain('id="grain-overlay"');
    // Shell has no data-start (persistent)
    expect(html).not.toContain('class="brand-name"');
    expect(html).toContain("@quocyokdon");

    // ── Hook scene ─────────────────────────────────────────────
    expect(html).toContain('data-layout="hook"');
    expect(html).toContain('class="hook-headline shimmer-sweep-target"');
    expect(html).toContain("iPhone 17");                // headline content
    expect(html).toContain("Camera 200MP!");            // subhead content

    // Image background (hook has bgSrc + bgImageRelPath provided)
    expect(html).toContain('class="bg kb-zoom-in"');
    expect(html).toContain("background-image: url('images/bg.jpg')");

    // ── Body templates ─────────────────────────────────────────
    // body-1: stat-hero
    expect(html).toContain('data-layout="stat-hero"');
    expect(html).toContain('class="stat-value shimmer-sweep-target"');
    expect(html).toContain('class="stat-label"');
    expect(html).toContain("200MP");

    // body-2: feature-list
    expect(html).toContain('data-layout="feature-list"');
    expect(html).toContain('class="feat-card"');
    expect(html).toContain('class="feat-title"');
    expect(html).toContain("Nâng cấp lớn");

    // body-3: callout
    expect(html).toContain('data-layout="callout"');
    expect(html).toContain('class="callout-card"');
    expect(html).toContain('class="callout-statement"');

    // ── Outro scene ────────────────────────────────────────────
    expect(html).toContain('data-layout="outro"');
    expect(html).toContain('class="out-channel"');
    expect(html).toContain('class="out-underline"');
    expect(html).not.toContain('class="out-source"');
    expect(html).not.toContain('id="tt-card"');
    expect(html).not.toContain('Following');
    expect(html).toContain("Theo dõi ngay");            // ctaTop content
    expect(html).toContain('class="out-cta-top"');

    // Audio src
    expect(html).toContain('src="voice.mp3"');
    expect(html).toMatch(/data-duration="[\d.]+"/);

    // Google Fonts present
    expect(html).toContain("fonts.googleapis.com");
  });

  it("falls back to gradient when bgImageRelPath is null", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    });
    // Hook scene with bgSrc but no bgImageRelPath → gradient fallback
    expect(html).toContain('class="bg gradient-news-dark"');
    expect(html).not.toContain("background-image: url");
  });

  it("renders storyboard v3 scene layouts and creative metadata", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-storyboard-v3.json", "utf8")) as Script;
    script.scenes[1].asset = {
      provider: "local",
      prompt: "scene-specific generated asset",
      image: "assets/scenes/body-1.svg",
      status: "ready",
    };
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 6 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
    });

    expect(html).toContain('data-layout="steps"');
    expect(html).toContain('class="layout-steps"');
    expect(html).toContain('data-layout="image-card"');
    expect(html).toContain('class="image-card-media"');
    expect(html).toContain('data-layout="quote"');
    expect(html).toContain('class="quote-text"');
    expect(html).toContain('data-layout="timeline"');
    expect(html).toContain('class="timeline-item timeline-item-0"');
    expect(html).toContain('class="scene-caption"');
    expect(html).toContain('data-accent="amber"');
    expect(html).toContain('data-tone="breaking"');
    expect(html).toContain('class="scene-atmosphere bg-split motion-pull-out"');
    expect(html).toContain("background-image: url('assets/scenes/body-1.svg')");
  });

  it("renders social news card scenes with local image motion", () => {
    const script = JSON.parse(readFileSync("tests/fixtures/sample-script-storyboard-v3.json", "utf8")) as Script;
    script.scenes[1].templateData = {
      template: "social-news-card",
      source: "VƯỜN QUỐC GIA YOK ĐÔN",
      headline: "CẢNH BÁO BẢO VỆ BÒ RỪNG",
      body: "Mọi hành vi săn bắt, đặt bẫy, vận chuyển trái phép đều có thể bị xử lý nghiêm.",
      footer: "CẢNH BÁO PHÁP LUẬT",
      panel: "red",
      headlineStyle: "yellow-outline",
    };
    script.scenes[1].creative = {
      tone: "breaking",
      accent: "rose",
      background: "source-image",
      motion: "urgent-pulse",
      density: "high-energy",
      stylePreset: "legal-warning",
    };
    script.scenes[1].asset = {
      provider: "local",
      prompt: "wild cattle camera trap",
      image: "assets/scenes/body-1.svg",
      status: "ready",
    };
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 6 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
    });

    expect(html).toContain('data-layout="social-news-card"');
    expect(html).toContain('data-motion="urgent-pulse"');
    expect(html).toContain('class="layout-social-news-card panel-red headline-yellow-outline"');
    expect(html).toContain("background-image: url('assets/scenes/body-1.svg')");
    expect(html).toContain("CẢNH BÁO BẢO VỆ BÒ RỪNG");
  });
});
