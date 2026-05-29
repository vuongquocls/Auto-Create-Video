import type { Script } from "../render/script-schema.js";
import { toSlug } from "../utils/slug.js";
import { directVideo, motionFor } from "./director.js";

export interface CreateProjectInput {
  title?: string;
  content: string;
  channel?: string;
  sourceUrl?: string;
  domain?: string;
}

const STOPWORDS = new Set([
  "một", "những", "nhiều", "được", "trong", "không", "nhưng", "hoặc", "rằng",
  "người", "điều", "cách", "khi", "với", "cho", "của", "là", "và", "thì",
]);

export function inferTitle(content: string, explicit?: string): string {
  const clean = (explicit || content.split(/\n+/).find(Boolean) || "Video mới").trim();
  return clean.replace(/^["'“”]+|["'“”]+$/g, "").slice(0, 90);
}

export function makeProjectId(title: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${toSlug(title)}-${ts}`;
}

export function buildScript(input: CreateProjectInput): Script {
  const title = inferTitle(input.content, input.title);
  const content = normalizeContent(input.content);
  const sentences = splitSentences(content);
  const keywords = pickKeywords(content);
  const domain = input.domain || domainFromUrl(input.sourceUrl) || "local";
  const channel = input.channel?.trim() || "Quoc YokDon";
  const direction = directVideo({ title, content, channel, domain });
  const visualBrief = direction.visualKeywords.join(", ");
  const useSocialNewsCards = direction.intent !== "editorial-explainer" && direction.intent !== "how-to";

  const hookText = sentences[0] || `Có một chủ đề đáng chú ý: ${title}.`;
  const [context, bodyA, bodyB, bodyC] = buildBodySegments(sentences.slice(1), title, keywords);

  const hookHeadline = compactTitle(title, 38);
  const subhead = keywords.length ? `${capitalize(keywords[0])}: nhìn kỹ hơn` : "Nhìn kỹ hơn";

  return {
    version: "1.0",
    metadata: {
      title,
      source: {
        url: input.sourceUrl || "local",
        domain,
        image: null,
      },
      channel,
    },
    director: {
      preset: direction.preset.id,
      intent: direction.intent,
      confidence: direction.confidence,
      visualKeywords: direction.visualKeywords,
      reasons: direction.reasons,
    },
    voice: {
      provider: "lucylab",
      voiceId: "${VIETNAMESE_VOICEID}",
      speed: 1,
    },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: trimVoice(hookText, 24),
        templateData: {
          template: "hook",
          headline: hookHeadline,
          subhead: compactTitle(subhead, 36),
          kenBurns: "zoom-in",
        },
        caption: {
          badge: compactTitle(keywords[0] || "GÓC NHÌN", 20).toUpperCase(),
          headline: compactTitle(title, 42),
          subline: "Một cách đọc tỉnh táo hơn",
        },
        creative: {
          tone: direction.preset.tone,
          accent: direction.preset.accent,
          background: useSocialNewsCards ? "source-image" : "abstract",
          motion: motionFor(direction, 0),
          density: direction.intent === "legal-warning" ? "high-energy" : "balanced",
          stylePreset: direction.preset.id,
        },
        assetPrompt: `${title}, ${visualBrief}, vertical social video cover, ${direction.preset.label}, high contrast`,
        asset: {
          provider: "local",
          prompt: `${title}, ${visualBrief}, vertical social video cover, ${direction.preset.label}, high contrast`,
          status: "pending",
        },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: trimVoice(context, 26),
        templateData: useSocialNewsCards
          ? socialNewsCard(direction, "BỐI CẢNH", context, keywords[0] || title)
          : {
              template: "steps",
              title: compactTitle("Điểm cần chú ý", 38),
              steps: buildSteps(keywords),
            },
        caption: {
          badge: "TÓM TẮT",
          headline: compactTitle("Đừng đọc lướt qua lớp nghĩa", 42),
          subline: "Tách ý chính trước khi kết luận",
        },
        creative: {
          tone: direction.preset.tone,
          accent: direction.preset.accent,
          background: useSocialNewsCards ? "source-image" : "abstract",
          motion: motionFor(direction, 1),
          density: direction.intent === "legal-warning" ? "high-energy" : "balanced",
          stylePreset: direction.preset.id,
        },
        asset: {
          provider: "local",
          prompt: `${visualBrief}, visual summary for ${title}, vertical social video scene`,
          status: "pending",
        },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: trimVoice(bodyA, 26),
        templateData: useSocialNewsCards
          ? socialNewsCard(direction, direction.intent === "legal-warning" ? "CẢNH BÁO" : "ĐIỂM CHÍNH", bodyA || content, keywords[1] || title)
          : {
              template: "quote",
              quote: compactTitle(extractKeyClaim(bodyA || content), 112),
              attribution: "Ý chính",
            },
        caption: {
          badge: "NHẬN ĐỊNH",
          headline: compactTitle(keywords[1] ? `${capitalize(keywords[1])} là điểm mấu chốt` : "Điểm mấu chốt nằm ở cách nhìn", 42),
        },
        creative: {
          tone: useSocialNewsCards ? direction.preset.tone : "minimal",
          accent: useSocialNewsCards ? direction.preset.accent : "purple",
          background: useSocialNewsCards ? "source-image" : "gradient",
          motion: motionFor(direction, 2),
          density: direction.intent === "legal-warning" ? "high-energy" : "calm",
          stylePreset: direction.preset.id,
        },
        asset: {
          provider: "local",
          prompt: `${visualBrief}, key claim visual for ${title}, dramatic vertical composition`,
          status: "pending",
        },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: trimVoice(bodyB, 26),
        templateData: {
          template: "feature-list",
          title: compactTitle("Các lớp nội dung", 38),
          bullets: buildBullets(keywords),
        },
        caption: {
          badge: "PHÂN TÍCH",
          headline: compactTitle("Mỗi lớp có một vai trò riêng", 42),
          subline: "Không nên gom tất cả thành một",
        },
        creative: {
          tone: direction.intent === "editorial-explainer" ? "studio" : direction.preset.tone,
          accent: direction.intent === "editorial-explainer" ? "cyan" : direction.preset.accent,
          background: direction.intent === "editorial-explainer" ? "abstract" : "source-image",
          motion: motionFor(direction, 3),
          density: direction.intent === "legal-warning" ? "high-energy" : "balanced",
          stylePreset: direction.preset.id,
        },
        asset: {
          provider: "local",
          prompt: `${visualBrief}, four key ideas from ${title}, editorial collage, vertical poster`,
          status: "pending",
        },
      },
      {
        id: "body-4",
        type: "body",
        voiceText: trimVoice(bodyC, 26),
        templateData: {
          template: "callout",
          statement: compactTitle(extractKeyClaim(bodyC || context), 76),
          tag: "GÓC NHÌN",
        },
        caption: {
          badge: "KẾT LUẬN",
          headline: compactTitle("Câu hỏi đáng giữ lại", 42),
          subline: "Tin ngay hay đối chiếu thêm?",
        },
        creative: {
          tone: direction.preset.tone,
          accent: direction.preset.accent,
          background: direction.intent === "editorial-explainer" ? "abstract" : "source-image",
          motion: motionFor(direction, 4),
          density: "high-energy",
          stylePreset: direction.preset.id,
        },
        asset: {
          provider: "local",
          prompt: `${visualBrief}, final takeaway for ${title}, bold cinematic social video visual`,
          status: "pending",
        },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: trimVoice(makeOutro(title), 22),
        templateData: {
          template: "outro",
          ctaTop: "Bạn nghĩ sao?",
          channelName: channel,
          source: domain,
        },
        creative: {
          tone: "social",
          accent: direction.preset.accent,
          background: "gradient",
          motion: motionFor(direction, 5),
          density: "balanced",
          stylePreset: direction.preset.id,
        },
      },
    ],
  };
}

function normalizeContent(content: string): string {
  return content.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitSentences(content: string): string[] {
  return content
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function pickKeywords(content: string): string[] {
  const words = content
    .toLowerCase()
    .normalize("NFC")
    .match(/[a-zA-ZÀ-ỹ0-9]{4,}/g) || [];
  const counts = new Map<string, number>();
  for (const word of words) {
    if (STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([word]) => word);
}

function buildSteps(keywords: string[]): string[] {
  const fallback = ["Xác định vấn đề", "Tách các lớp ý", "Đối chiếu nguồn", "Rút ra góc nhìn"];
  return fallback.map((step, i) => keywords[i] ? `${step}: ${compactTitle(keywords[i], 18)}` : step);
}

function buildBullets(keywords: string[]): string[] {
  const picked = keywords.slice(0, 4).map((k) => capitalize(compactTitle(k, 28)));
  return picked.length >= 2 ? picked : ["Bối cảnh", "Chi tiết chính", "Góc nhìn", "Câu hỏi mở"];
}

function buildBodySegments(sentences: string[], title: string, keywords: string[]): [string, string, string, string] {
  const segments: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of expandNarrativeUnits(sentences)) {
    const words = wordCount(sentence);
    if (current.length && currentWords + words > 30 && segments.length < 3) {
      segments.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words;
  }
  if (current.length) segments.push(current.join(" "));

  const fallback = [
    `Trước hết, cần đặt ${compactTitle(title, 48)} vào đúng bối cảnh trước khi kết luận.`,
    `Điểm đáng chú ý là các chi tiết không có cùng một mức độ chắc chắn và cần được tách lớp.`,
    `Một lớp thuộc dữ kiện, một lớp thuộc diễn giải, và một lớp thuộc ký ức văn hóa của cộng đồng.`,
    `Vì vậy, cách đọc tốt hơn là đối chiếu nguồn, giữ lại giá trị văn hóa, nhưng không xem mọi chi tiết là lịch sử.`,
  ];

  for (const item of fallback) {
    if (segments.length >= 4) break;
    if (!segments.some((segment) => sameMeaning(segment, item, keywords))) segments.push(item);
  }

  const unique = dedupeSegments(segments, keywords);
  while (unique.length < 4) unique.push(fallback[unique.length]);
  return unique.slice(0, 4) as [string, string, string, string];
}

function expandNarrativeUnits(sentences: string[]): string[] {
  const units: string[] = [];
  for (const sentence of sentences) {
    if (wordCount(sentence) <= 30 || !sentence.includes(",")) {
      units.push(sentence);
      continue;
    }

    const clauses = sentence.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
    let buffer = "";
    for (const clause of clauses) {
      const candidate = buffer ? `${buffer}, ${clause}` : clause;
      if (buffer && wordCount(candidate) > 30) {
        units.push(finishSentence(buffer));
        buffer = clause;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) units.push(finishSentence(buffer));
  }
  return units;
}

function finishSentence(text: string): string {
  const clean = capitalize(text.trim().replace(/[,:;]+$/g, ""));
  return /[.!?。！？]$/.test(clean) ? clean : `${clean}.`;
}

function dedupeSegments(segments: string[], keywords: string[]): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    const clean = segment.trim();
    if (!clean) continue;
    if (out.some((existing) => sameMeaning(existing, clean, keywords))) continue;
    out.push(clean);
  }
  return out;
}

function sameMeaning(a: string, b: string, keywords: string[]): boolean {
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  const toContentWords = (text: string) => new Set(
    text.split(/\s+/).filter((word) => word.length >= 4 && !STOPWORDS.has(word) && !keywords.slice(0, 2).includes(word)),
  );
  const leftWords = toContentWords(left);
  const rightWords = toContentWords(right);
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size || 1;
  return shared / union > 0.72;
}

function extractKeyClaim(text: string): string {
  const sentences = splitSentences(text);
  return sentences.sort((a, b) => b.length - a.length)[0] || text || "Điểm quan trọng nằm ở cách ta đọc và đối chiếu.";
}

function makeOutro(title: string): string {
  const short = compactTitle(title, 48);
  return `Với chủ đề ${short}, bạn thường tin ngay, hay sẽ tìm thêm nguồn khác để đối chiếu?`;
}

function socialNewsCard(
  direction: ReturnType<typeof directVideo>,
  label: string,
  body: string,
  headlineSeed: string,
): Script["scenes"][number]["templateData"] {
  const claim = extractKeyClaim(body);
  const headline = compactTitle(`${label}: ${headlineSeed}`, 56).toUpperCase();
  return {
    template: "social-news-card",
    source: direction.sourceLabel,
    headline,
    body: compactTitle(claim, 164),
    footer: compactTitle(direction.preset.label, 42).toUpperCase(),
    panel: direction.preset.panel,
    headlineStyle: direction.preset.headlineStyle,
  };
}

function trimVoice(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out = words.length > maxWords ? words.slice(0, maxWords).join(" ") + "." : text.trim();
  return out.replace(/[;:]+$/g, ".") || "Đây là một điểm đáng chú ý cần nhìn kỹ hơn.";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function compactTitle(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "").trim() || clean.slice(0, max - 1).trim();
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function domainFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
