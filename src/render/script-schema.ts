import { z } from "zod";

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(40),
  subhead: z.string().max(40).optional(),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(20),
  color: z.enum(["cyan", "purple"]),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(40),
  context: z.string().max(50).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(40),
  bullets: z.array(z.string().min(1).max(50)).min(1).max(4),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(80),
  tag: z.string().max(20).optional(),
});

const ImageCardData = z.object({
  template: z.literal("image-card"),
  kicker: z.string().min(1).max(24).optional(),
  title: z.string().min(1).max(48),
  detail: z.string().min(1).max(70).optional(),
});

const QuoteData = z.object({
  template: z.literal("quote"),
  quote: z.string().min(1).max(120),
  attribution: z.string().min(1).max(40).optional(),
});

const StepsData = z.object({
  template: z.literal("steps"),
  title: z.string().min(1).max(42),
  steps: z.array(z.string().min(1).max(46)).min(2).max(4),
});

const TimelineData = z.object({
  template: z.literal("timeline"),
  title: z.string().min(1).max(42),
  items: z.array(z.object({
    label: z.string().min(1).max(24),
    value: z.string().min(1).max(44),
  })).min(2).max(4),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(30),
  channelName: z.string().min(1).max(30),
  source: z.string().min(1).max(40),
});

export const TemplateData = z.discriminatedUnion("template", [
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  ImageCardData,
  QuoteData,
  StepsData,
  TimelineData,
  OutroData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / pipeline DEFAULT_SFX).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "alert/notification"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

const Scene = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  templateData: TemplateData,
  caption: z.object({
    headline: z.string().min(1).max(44),
    subline: z.string().min(1).max(72).optional(),
    badge: z.string().min(1).max(24).optional(),
  }).optional(),
  creative: z.object({
    tone: z.enum(["studio", "editorial", "breaking", "social", "cinematic", "minimal"]).default("studio"),
    accent: z.enum(["cyan", "purple", "amber", "rose", "lime", "blue"]).default("cyan"),
    background: z.enum(["source-image", "abstract", "gradient", "split", "none"]).default("abstract"),
    motion: z.enum(["push-in", "pull-out", "pan-left", "pan-right", "snap", "float"]).default("push-in"),
    density: z.enum(["calm", "balanced", "high-energy"]).default("balanced"),
  }).optional(),
  asset: z.object({
    provider: z.enum(["local", "openai", "stock", "manual"]).default("local"),
    prompt: z.string().min(1).max(2000),
    image: z.string().min(1).optional(),
    status: z.enum(["pending", "ready", "failed"]).default("pending"),
    brand: z.object({
      profile: z.string().min(1),
      vibe: z.string().min(1),
      aspectRatio: z.enum(["9:16", "1:1", "16:9"]).default("9:16"),
    }).optional(),
  }).optional(),
  assetPrompt: z.string().min(1).max(280).optional(),
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
});

// ── Root schema ────────────────────────────────────────────────────────────

export const ScriptSchema = z.object({
  version: z.literal("1.0"),
  metadata: z.object({
    title: z.string().min(1),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
    }),
    channel: z.string().min(1),
  }),
  voice: z.object({
    provider: z.literal("lucylab"),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
  }),
  scenes: z
    .array(Scene)
    .min(5)
    .max(8, "scenes must have at most 8 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
});

export type Script = z.infer<typeof ScriptSchema>;
