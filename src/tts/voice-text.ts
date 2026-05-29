import { createHash } from "node:crypto";

const PHONE_NUMBER_RE = /(?<![\d/])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\d/])/g;
const PHONE_NUMBER_WITH_PREFIX_RE = /\b(?:số|so)\s+(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\d/])/giu;
const PHONE_REPLACEMENT = "số hotline hiển thị trên màn hình";

export function prepareTextForTts(text: string): string {
  return text
    .replace(PHONE_NUMBER_WITH_PREFIX_RE, PHONE_REPLACEMENT)
    .replace(PHONE_NUMBER_RE, PHONE_REPLACEMENT)
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function ttsCacheKey(args: {
  provider: string;
  voiceId: string;
  speed: number;
  text: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify(args))
    .digest("hex");
}
