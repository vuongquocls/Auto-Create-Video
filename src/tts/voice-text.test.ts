import { describe, expect, it } from "vitest";
import { prepareTextForTts, ttsCacheKey } from "./voice-text.js";

describe("prepareTextForTts", () => {
  it("replaces Vietnamese hotline numbers with a spoken-safe phrase", () => {
    expect(prepareTextForTts("Gọi Hạt Kiểm lâm qua số 0974127212."))
      .toBe("Gọi Hạt Kiểm lâm qua số hotline hiển thị trên màn hình.");
  });

  it("replaces spaced or dashed phone numbers", () => {
    expect(prepareTextForTts("Hotline: 0974 127 212 hoặc 0974-127-212"))
      .toBe("Hotline: số hotline hiển thị trên màn hình hoặc số hotline hiển thị trên màn hình");
  });

  it("does not rewrite legal article numbers, dates, decrees, or prison terms", () => {
    const text = "Điều 19 Nghị định 146/2026/NĐ-CP, ngày 25 tháng 6 năm 2026, Điều 243, phạt tù 15 năm.";
    expect(prepareTextForTts(text)).toBe(text);
  });
});

describe("ttsCacheKey", () => {
  it("changes when prepared TTS text changes", () => {
    const base = { provider: "lucylab", voiceId: "v", speed: 1.2 };
    expect(ttsCacheKey({ ...base, text: "A" })).not.toBe(ttsCacheKey({ ...base, text: "B" }));
  });
});
