export type DirectorIntent =
  | "breaking-news"
  | "legal-warning"
  | "wildlife-documentary"
  | "how-to"
  | "editorial-explainer";

export interface StylePreset {
  id: DirectorIntent;
  label: string;
  tone: "studio" | "editorial" | "breaking" | "social" | "cinematic" | "minimal";
  accent: "cyan" | "purple" | "amber" | "rose" | "lime" | "blue";
  panel: "orange" | "red" | "forest" | "navy";
  headlineStyle: "yellow-outline" | "white-outline" | "clean-white";
  preferredTemplates: string[];
  motions: Array<"push-in" | "pull-out" | "pan-left" | "pan-right" | "snap" | "float" | "slow-zoom" | "collage-push" | "blur-depth" | "urgent-pulse" | "handheld-pan" | "zoom-cut">;
}

export interface VideoDirection {
  preset: StylePreset;
  intent: DirectorIntent;
  confidence: number;
  reasons: string[];
  visualKeywords: string[];
  sourceLabel: string;
}

export const STYLE_PRESETS: Record<DirectorIntent, StylePreset> = {
  "breaking-news": {
    id: "breaking-news",
    label: "Tin nhanh mạng xã hội",
    tone: "breaking",
    accent: "amber",
    panel: "orange",
    headlineStyle: "yellow-outline",
    preferredTemplates: ["social-news-card", "stat-hero", "callout"],
    motions: ["slow-zoom", "zoom-cut", "collage-push", "pan-left"],
  },
  "legal-warning": {
    id: "legal-warning",
    label: "Cảnh báo pháp luật",
    tone: "breaking",
    accent: "rose",
    panel: "red",
    headlineStyle: "yellow-outline",
    preferredTemplates: ["social-news-card", "callout", "steps", "stat-hero"],
    motions: ["urgent-pulse", "zoom-cut", "handheld-pan", "slow-zoom"],
  },
  "wildlife-documentary": {
    id: "wildlife-documentary",
    label: "Phóng sự thiên nhiên",
    tone: "cinematic",
    accent: "lime",
    panel: "forest",
    headlineStyle: "white-outline",
    preferredTemplates: ["social-news-card", "image-card", "quote", "timeline"],
    motions: ["slow-zoom", "pan-left", "pan-right", "blur-depth"],
  },
  "how-to": {
    id: "how-to",
    label: "Hướng dẫn từng bước",
    tone: "studio",
    accent: "blue",
    panel: "navy",
    headlineStyle: "clean-white",
    preferredTemplates: ["steps", "social-news-card", "feature-list"],
    motions: ["push-in", "pan-right", "float", "pull-out"],
  },
  "editorial-explainer": {
    id: "editorial-explainer",
    label: "Giải thích biên tập",
    tone: "editorial",
    accent: "cyan",
    panel: "navy",
    headlineStyle: "clean-white",
    preferredTemplates: ["steps", "quote", "feature-list", "callout"],
    motions: ["push-in", "pan-left", "pull-out", "float"],
  },
};

const SIGNALS: Record<DirectorIntent, RegExp[]> = {
  "breaking-news": [
    /tin nóng|khẩn|vừa xuất hiện|phát hiện|mới nhất|cảnh báo|chú ý|đang gây/i,
  ],
  "legal-warning": [
    /pháp luật|xử lý hình sự|phạt tù|phạt tiền|nghị định|bộ luật|truy cứu|vi phạm|săn bắt|đặt bẫy|buôn bán trái phép/i,
  ],
  "wildlife-documentary": [
    /bò rừng|động vật hoang dã|vườn quốc gia|yok đôn|kiểm lâm|rừng|thiên nhiên|bảo tồn|loài nguy cấp/i,
  ],
  "how-to": [
    /hướng dẫn|cách|quy trình|bước|checklist|làm thế nào|thiết lập|sử dụng/i,
  ],
  "editorial-explainer": [
    /phân tích|giải thích|vì sao|bối cảnh|góc nhìn|nhận định|so sánh/i,
  ],
};

const VISUAL_HINTS: Array<[RegExp, string]> = [
  [/bò rừng|bos javanicus/i, "bò rừng"],
  [/động vật hoang dã|loài nguy cấp/i, "động vật hoang dã"],
  [/yok đôn|vườn quốc gia/i, "rừng Yok Đôn"],
  [/bẫy|săn bắt|súng săn/i, "bẫy và dấu hiệu săn bắt"],
  [/kiểm lâm|công an|tuần tra/i, "kiểm lâm tuần tra"],
  [/pháp luật|phạt tù|phạt tiền/i, "cảnh báo pháp luật"],
  [/hướng dẫn|quy trình|bước/i, "minh họa từng bước"],
  [/công nghệ|ai|ứng dụng|phần mềm/i, "giao diện công nghệ"],
];

export function directVideo(input: { title: string; content: string; channel?: string; domain?: string }): VideoDirection {
  const text = `${input.title}\n${input.content}`.toLowerCase();
  const scores = new Map<DirectorIntent, number>();
  const reasons: string[] = [];

  for (const [intent, patterns] of Object.entries(SIGNALS) as Array<[DirectorIntent, RegExp[]]>) {
    let score = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        score += 2;
        reasons.push(`${intent}: ${matches[0]}`);
      }
    }
    scores.set(intent, score);
  }

  // Legal warnings should win when both wildlife and enforcement terms appear.
  if ((scores.get("legal-warning") || 0) > 0 && (scores.get("wildlife-documentary") || 0) > 0) {
    scores.set("legal-warning", (scores.get("legal-warning") || 0) + 2);
  }

  let intent: DirectorIntent = "editorial-explainer";
  let best = -1;
  for (const [candidate, score] of scores.entries()) {
    if (score > best) {
      intent = candidate;
      best = score;
    }
  }

  const visualKeywords = pickVisualKeywords(text);
  const sourceLabel = inferSourceLabel(input.channel, input.domain, text);
  const confidence = Math.min(0.95, Math.max(0.35, 0.35 + best * 0.12));

  return {
    preset: STYLE_PRESETS[intent],
    intent,
    confidence,
    reasons: reasons.slice(0, 5),
    visualKeywords,
    sourceLabel,
  };
}

export function motionFor(direction: VideoDirection, index: number): StylePreset["motions"][number] {
  const motions = direction.preset.motions;
  return motions[index % motions.length];
}

function pickVisualKeywords(text: string): string[] {
  const out: string[] = [];
  for (const [pattern, label] of VISUAL_HINTS) {
    if (pattern.test(text) && !out.includes(label)) out.push(label);
  }
  return out.length ? out.slice(0, 5) : ["ảnh minh họa theo chủ đề", "bối cảnh chính", "chi tiết nổi bật"];
}

function inferSourceLabel(channel: string | undefined, domain: string | undefined, text: string): string {
  if (/yok đôn|bò rừng|kiểm lâm|vườn quốc gia/i.test(text)) return "VƯỜN QUỐC GIA YOK ĐÔN";
  if (channel?.trim()) return channel.trim().toUpperCase();
  if (domain && domain !== "local") return domain.toUpperCase();
  return "CẬP NHẬT";
}
