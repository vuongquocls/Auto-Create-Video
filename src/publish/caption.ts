import type { Script } from "../render/script-schema.js";

export function buildSocialCaption(script: Script): string {
  const title = script.metadata.title.trim();
  const keyPoints = script.scenes
    .filter((scene) => scene.type !== "outro")
    .map((scene) => scene.caption?.headline || scene.voiceText)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);

  const hashtags = inferHashtags(script);
  const body = keyPoints.length
    ? keyPoints.map((point) => `- ${point}`).join("\n")
    : script.scenes[0]?.voiceText || title;

  return [
    title,
    "",
    body,
    "",
    hashtags.join(" "),
  ].join("\n").trim() + "\n";
}

function inferHashtags(script: Script): string[] {
  const text = [
    script.metadata.title,
    script.metadata.channel,
    script.director?.intent,
    ...(script.director?.visualKeywords || []),
    ...script.scenes.map((scene) => scene.voiceText),
  ].join(" ").toLowerCase();

  const tags = new Set<string>(["#Shorts", "#Reels", "#VideoAI"]);
  if (/yok\s*đôn|yokdon|vườn quốc gia|kiểm lâm|bò rừng|động vật hoang dã/i.test(text)) {
    tags.add("#YokDon");
    tags.add("#BaoTonThienNhien");
  }
  if (/pháp luật|xử lý|vi phạm|cảnh báo|nghị định|hình sự/i.test(text)) {
    tags.add("#CanhBao");
    tags.add("#PhapLuat");
  }
  if (/công nghệ|ai|iphone|openai|google|startup|chip/i.test(text)) {
    tags.add("#CongNghe");
    tags.add("#AI");
  }
  if (/lịch sử|văn hóa|truyền thuyết|di sản/i.test(text)) {
    tags.add("#LichSu");
    tags.add("#VanHoa");
  }

  return Array.from(tags).slice(0, 8);
}
