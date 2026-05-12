import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildScript } from "./planner.js";
import { generateSceneAssets } from "./assets.js";

describe("studio assets", () => {
  it("generates local per-scene SVG assets and marks scenes ready", async () => {
    const dir = await mkdtemp(join(tmpdir(), "studio-assets-"));
    try {
      const script = buildScript({
        title: "Kiểm tra ảnh cảnh",
        content: "Đây là nội dung kiểm tra. Mỗi cảnh cần có một ảnh riêng. Sau đó renderer dùng ảnh đó làm nền chuyển động.",
      });
      const assets = await generateSceneAssets(dir, script, "local");
      expect(assets.length).toBeGreaterThan(0);
      expect(script.scenes[0].asset?.status).toBe("ready");
      expect(script.scenes[0].asset?.image).toMatch(/^assets\/scenes\/hook\.svg$/);

      const svg = await readFile(join(dir, "assets", "scenes", "hook.svg"), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("Kiểm tra");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
