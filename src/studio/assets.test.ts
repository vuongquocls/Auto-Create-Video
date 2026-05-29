import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildScript } from "./planner.js";
import { assignManualImageToScene, generateSceneAssets, prepareSceneAssets } from "./assets.js";

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
      expect(script.scenes[0].asset?.image).toMatch(/^assets\/scenes\/scene_01_.*\.svg$/);

      const svg = await readFile(join(dir, script.scenes[0].asset!.image!), "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("Kiểm tra");

      const regenerated = await generateSceneAssets(dir, script, "local", { overwriteReady: true });
      expect(regenerated[0].relPath).not.toBe(assets[0].relPath);
      expect(regenerated[0].relPath).toMatch(/_02\.svg$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reuses a matching existing image before generating a new local asset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "studio-assets-"));
    const library = await mkdtemp(join(tmpdir(), "studio-library-"));
    try {
      await mkdir(join(library, "yokdon"), { recursive: true });
      const source = join(library, "yokdon", "bo-rung-yok-don.jpg");
      await writeFile(source, Buffer.alloc(256, 1));

      const script = buildScript({
        title: "Bò rừng Yok Đôn",
        content: "Bò rừng quý hiếm xuất hiện ở Yok Đôn. Kiểm lâm tuần tra trong rừng để bảo vệ động vật hoang dã.",
      });
      const assets = await prepareSceneAssets(dir, script, "local", { searchRoots: [library] });

      expect(assets.some((asset) => asset.source === "reused")).toBe(true);
      expect(script.scenes[0].asset?.provider).toBe("manual");
      expect(script.scenes[0].asset?.image).toMatch(/\.jpg$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(library, { recursive: true, force: true });
    }
  });

  it("assigns a manual image to the requested scene without overwriting existing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "studio-assets-"));
    const library = await mkdtemp(join(tmpdir(), "studio-library-"));
    try {
      const source = join(library, "canh-bao-phap-luat.png");
      await writeFile(source, Buffer.alloc(256, 2));
      const script = buildScript({
        title: "Cảnh báo pháp luật",
        content: "Cảnh báo pháp luật về săn bắt động vật hoang dã. Người vi phạm có thể bị xử lý hình sự.",
      });

      const first = await assignManualImageToScene(dir, script, source, "body-2");
      const second = await assignManualImageToScene(dir, script, source, "body-2");

      expect(first.sceneId).toBe("body-2");
      expect(second.sceneId).toBe("body-2");
      expect(first.relPath).not.toBe(second.relPath);
      expect(script.scenes.find((scene) => scene.id === "body-2")?.asset?.image).toBe(second.relPath);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(library, { recursive: true, force: true });
    }
  });
});
