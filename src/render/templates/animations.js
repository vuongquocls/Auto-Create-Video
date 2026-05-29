// v2 Animation Engine — template-specific entrance animations
// HyperFrames runtime drives playback by seeking the timeline.
//
// IMPORTANT: Only use supported GSAP props: opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility.
// Do NOT use `delay:` in vars — use position parameter (3rd arg) instead.
// Do NOT use `attr:` settings. No complex easings.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // ── Inject shimmer masks into all .shimmer-sweep-target elements ──────────
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── Scene dispatch ──────────────────────────────────────────────────────
  scenes.forEach((scene) => {
    const start = parseFloat(scene.dataset.start);
    const dur   = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Scene visibility: fade in/out
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    if (layout === "hook") {
      animateHook(scene, tl, start);
    } else if (layout === "comparison") {
      animateComparison(scene, tl, start);
    } else if (layout === "stat-hero") {
      animateStatHero(scene, tl, start);
    } else if (layout === "feature-list") {
      animateFeatureList(scene, tl, start);
    } else if (layout === "callout") {
      animateCallout(scene, tl, start);
    } else if (layout === "image-card") {
      animateImageCard(scene, tl, start);
    } else if (layout === "social-news-card") {
      animateSocialNewsCard(scene, tl, start, dur);
    } else if (layout === "quote") {
      animateQuote(scene, tl, start);
    } else if (layout === "steps") {
      animateSteps(scene, tl, start);
    } else if (layout === "timeline") {
      animateTimeline(scene, tl, start);
    } else if (layout === "outro") {
      animateOutro(scene, tl, start, dur);
    }

    animateAtmosphere(scene, tl, start, dur);
    animateCaption(scene, tl, start);
  });

  // ── HOOK ──────────────────────────────────────────────────────────────
  function animateHook(scene, tl, start) {
    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      // Scale pop in
      tl.fromTo(headline, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep after entrance
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      tl.fromTo(subhead, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, start + 0.55);
    }
  }

  // ── COMPARISON ────────────────────────────────────────────────────────
  function animateComparison(scene, tl, start) {
    const leftCard = scene.querySelector(".cmp-left");
    if (leftCard) {
      tl.fromTo(leftCard, { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.15);
    }

    const vs = scene.querySelector(".cmp-vs");
    if (vs) {
      tl.fromTo(vs, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, start + 0.45);
    }

    const rightCard = scene.querySelector(".cmp-right");
    if (rightCard) {
      tl.fromTo(rightCard, { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.6);
    }
  }

  // ── STAT HERO ─────────────────────────────────────────────────────────
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      tl.fromTo(value, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep on the stat value
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const label = scene.querySelector(".stat-label");
    if (label) {
      tl.fromTo(label, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 0.55);
    }

    const context = scene.querySelector(".stat-context");
    if (context) {
      tl.fromTo(context, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.85);
    }
  }

  // ── FEATURE LIST ──────────────────────────────────────────────────────
  function animateFeatureList(scene, tl, start) {
    const card = scene.querySelector(".feat-card");
    if (card) {
      tl.fromTo(card, { y: 60, scale: 0.95, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5 }, start + 0.1);
    }

    const rule = scene.querySelector(".feat-rule");
    if (rule) {
      tl.fromTo(rule, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.4 }, start + 0.45);
    }

    const bullets = scene.querySelectorAll(".feat-bullet");
    bullets.forEach((b, i) => {
      tl.fromTo(b, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, start + 0.6 + i * 0.15);
    });
  }

  // ── CALLOUT ───────────────────────────────────────────────────────────
  function animateCallout(scene, tl, start) {
    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card, { y: 50, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55 }, start + 0.2);
    }
  }

  // ── IMAGE CARD ────────────────────────────────────────────────────────
  function animateImageCard(scene, tl, start) {
    const media = scene.querySelector(".image-card-media");
    if (media) {
      tl.fromTo(media, { x: -70, scale: 0.94, opacity: 0 }, { x: 0, scale: 1, opacity: 1, duration: 0.6 }, start + 0.12);
      tl.to(media, { scale: 1.04, duration: 4.5 }, start + 0.78);
    }

    const kicker = scene.querySelector(".image-card-kicker");
    if (kicker) {
      tl.fromTo(kicker, { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35 }, start + 0.28);
    }

    const title = scene.querySelector(".image-card-title");
    if (title) {
      tl.fromTo(title, { y: 52, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55 }, start + 0.42);
    }

    const detail = scene.querySelector(".image-card-detail");
    if (detail) {
      tl.fromTo(detail, { y: 32, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42 }, start + 0.78);
    }
  }

  // ── SOCIAL NEWS CARD ─────────────────────────────────────────────────
  function animateSocialNewsCard(scene, tl, start, dur) {
    const photos = scene.querySelectorAll(".social-news-photo");
    const motion = scene.dataset.motion || scene.querySelector(".scene-atmosphere")?.className || "";
    const isUrgent = motion.includes("urgent") || scene.dataset.tone === "breaking";
    const fromScale = motion.includes("pull-out") ? 1.16 : 1.02;
    const toScale = motion.includes("zoom-cut") || motion.includes("urgent") ? 1.18 : 1.10;
    const fromX = motion.includes("pan-left") || motion.includes("handheld") ? 34 : motion.includes("pan-right") ? -34 : 0;
    const toX = motion.includes("pan-left") ? -34 : motion.includes("pan-right") || motion.includes("handheld") ? 34 : 0;
    photos.forEach((photo) => {
      tl.fromTo(photo, { x: fromX, scale: fromScale, opacity: 0 }, { x: toX, scale: toScale, opacity: 1, duration: Math.max(2.2, dur - 0.2) }, start + 0.05);
    });

    const panel = scene.querySelector(".social-news-panel");
    if (panel) {
      tl.fromTo(panel, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: isUrgent ? 0.32 : 0.48 }, start + 0.12);
    }

    const source = scene.querySelector(".social-news-source");
    if (source) {
      tl.fromTo(source, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28 }, start + 0.28);
    }

    const headline = scene.querySelector(".social-news-headline");
    if (headline) {
      tl.fromTo(headline, { y: 44, scale: isUrgent ? 0.94 : 1, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45 }, start + 0.4);
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 0.9 }, start + 0.95);
      }
    }

    const body = scene.querySelector(".social-news-body");
    if (body) {
      tl.fromTo(body, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38 }, start + 0.72);
    }

    const footer = scene.querySelector(".social-news-footer");
    if (footer) {
      tl.fromTo(footer, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 }, start + 1.0);
    }
  }

  // ── QUOTE ─────────────────────────────────────────────────────────────
  function animateQuote(scene, tl, start) {
    const mark = scene.querySelector(".quote-mark");
    if (mark) {
      tl.fromTo(mark, { y: 45, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 0.15);
    }

    const text = scene.querySelector(".quote-text");
    if (text) {
      tl.fromTo(text, { y: 50, opacity: 0 }, { y: 0, opacity: 1, duration: 0.62 }, start + 0.32);
    }

    const attr = scene.querySelector(".quote-attr");
    if (attr) {
      tl.fromTo(attr, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42 }, start + 0.9);
    }
  }

  // ── STEPS ─────────────────────────────────────────────────────────────
  function animateSteps(scene, tl, start) {
    const title = scene.querySelector(".steps-title");
    if (title) {
      tl.fromTo(title, { y: 38, opacity: 0 }, { y: 0, opacity: 1, duration: 0.48 }, start + 0.12);
    }

    const rows = scene.querySelectorAll(".step-row");
    rows.forEach((row, i) => {
      tl.fromTo(row, { x: i % 2 === 0 ? -46 : 46, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42 }, start + 0.45 + i * 0.17);
    });
  }

  // ── TIMELINE ──────────────────────────────────────────────────────────
  function animateTimeline(scene, tl, start) {
    const title = scene.querySelector(".timeline-title");
    if (title) {
      tl.fromTo(title, { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 0.48 }, start + 0.12);
    }

    const track = scene.querySelector(".timeline-track");
    if (track) {
      tl.fromTo(track, { height: 0, opacity: 1 }, { height: 520, opacity: 1, duration: 0.85 }, start + 0.4);
    }

    const items = scene.querySelectorAll(".timeline-item");
    items.forEach((item, i) => {
      tl.fromTo(item, { x: 42, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42 }, start + 0.52 + i * 0.18);
    });
  }

  // ── SHARED ATMOSPHERE + CAPTION ───────────────────────────────────────
  function animateAtmosphere(scene, tl, start, dur) {
    const sweep = scene.querySelector(".scene-sweep");
    if (sweep) {
      tl.fromTo(sweep, { x: 0, opacity: 0.15 }, { x: 1450, opacity: 0.55, duration: Math.max(1.8, dur - 0.2) }, start + 0.05);
    }

    const grid = scene.querySelector(".scene-grid");
    if (grid) {
      tl.fromTo(grid, { y: 0, opacity: 0.18 }, { y: -80, opacity: 0.36, duration: Math.max(1.8, dur - 0.2) }, start + 0.05);
    }

    const photo = scene.querySelector(".scene-photo");
    if (photo) {
      const motion = scene.querySelector(".scene-atmosphere")?.className || "";
      const fromX = motion.includes("pan-left") ? 40 : motion.includes("pan-right") ? -40 : 0;
      const toX = motion.includes("pan-left") ? -40 : motion.includes("pan-right") ? 40 : 0;
      const fromScale = motion.includes("pull-out") ? 1.14 : 1.02;
      const toScale = motion.includes("pull-out") ? 1.02 : 1.12;
      tl.fromTo(photo, { x: fromX, scale: fromScale, opacity: 0.0 }, { x: toX, scale: toScale, opacity: 0.28, duration: Math.max(1.8, dur - 0.3) }, start + 0.08);
    }
  }

  function animateCaption(scene, tl, start) {
    const caption = scene.querySelector(".scene-caption");
    if (!caption) return;
    tl.fromTo(caption, { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 0.95);

    const badge = caption.querySelector(".caption-badge");
    if (badge) {
      tl.fromTo(badge, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28 }, start + 1.02);
    }
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────
  function animateOutro(scene, tl, start, dur) {
    const cta = scene.querySelector(".out-cta-top");
    if (cta) {
      tl.fromTo(cta, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.45 }, start + 0.2);
    }

    const channel = scene.querySelector(".out-channel");
    if (channel) {
      tl.fromTo(channel, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55 }, start + 0.55);
    }

    const underline = scene.querySelector(".out-underline");
    if (underline) {
      tl.fromTo(underline, { width: 0 }, { width: "600px", duration: 0.5 }, start + 0.9);
    }

  }
})();
