import { describe, expect, it } from "vitest";
import { buildScript } from "./planner.js";
import { directVideo } from "./director.js";

describe("video director", () => {
  it("selects legal-warning for wildlife enforcement content", () => {
    const content = [
      "Đàn bò rừng vừa xuất hiện tại Vườn quốc gia Yok Đôn.",
      "Mọi hành vi săn bắt, đặt bẫy, vận chuyển hoặc buôn bán trái phép sẽ bị xử lý hình sự.",
      "Theo quy định pháp luật, người vi phạm có thể bị phạt tù và phạt tiền.",
    ].join(" ");

    const direction = directVideo({ title: "Cảnh báo bảo vệ bò rừng", content, channel: "Yok Đôn" });
    expect(direction.intent).toBe("legal-warning");
    expect(direction.visualKeywords).toContain("bò rừng");
    expect(direction.sourceLabel).toBe("VƯỜN QUỐC GIA YOK ĐÔN");
  });

  it("builds social news cards automatically for alert-style content", () => {
    const script = buildScript({
      title: "Bò rừng Yok Đôn và ranh giới pháp luật",
      content: "Phát hiện đàn bò rừng quý hiếm tại Vườn quốc gia Yok Đôn. Cảnh báo mọi hành vi săn bắt, đặt bẫy, tàng trữ, vận chuyển, buôn bán trái phép động vật hoang dã sẽ bị xử lý hình sự theo pháp luật.",
      channel: "Yok Đôn",
    });

    expect(script.director?.intent).toBe("legal-warning");
    expect(script.scenes.some((scene) => scene.templateData.template === "social-news-card")).toBe(true);
    expect(script.scenes[1].creative?.stylePreset).toBe("legal-warning");
  });
});
