import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildPublishManifest, publishProject } from "./publisher.js";

describe("publisher", () => {
  it("builds a manifest and writes dry-run output", async () => {
    const dir = await fixtureProject();
    const run = await publishProject({ projectDir: dir, platforms: ["dry-run"] });

    expect(run.manifest.title).toBe("Kiểm tra tự động đăng");
    expect(run.manifest.video.bytes).toBeGreaterThan(0);
    expect(run.results).toEqual([{ platform: "dry-run", status: "planned", id: run.manifest.projectId }]);
    await expect(readFile(join(dir, "publish-manifest.json"), "utf8")).resolves.toContain("Kiểm tra tự động đăng");
    await expect(readFile(join(dir, "publish-dry-run.json"), "utf8")).resolves.toContain("plannedAt");
  });

  it("uses explicit caption before generated caption", async () => {
    const dir = await fixtureProject();
    const manifest = await buildPublishManifest(dir, {
      caption: "Caption riêng\n#Test",
      platforms: ["dry-run"],
    });

    expect(manifest.caption).toBe("Caption riêng\n#Test\n");
  });
});

async function fixtureProject() {
  const dir = join(tmpdir(), `publish-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "video.mp4"), Buffer.from("fake mp4 bytes"));
  await writeFile(join(dir, "script.json"), JSON.stringify({
    version: "1.0",
    metadata: {
      title: "Kiểm tra tự động đăng",
      source: { url: "local", domain: "local", image: null },
      channel: "Quốc Yok Đôn",
    },
    voice: { provider: "supertonic", voiceId: "M4", speed: 1.05 },
    scenes: [
      {
        id: "hook",
        type: "hook",
        voiceText: "Đây là phần mở đầu.",
        templateData: { template: "hook", headline: "Mở đầu" },
        caption: { headline: "Mở đầu" },
      },
      {
        id: "body-1",
        type: "body",
        voiceText: "Nội dung thứ nhất.",
        templateData: { template: "callout", statement: "Nội dung thứ nhất" },
        caption: { headline: "Nội dung thứ nhất" },
      },
      {
        id: "body-2",
        type: "body",
        voiceText: "Nội dung thứ hai.",
        templateData: { template: "callout", statement: "Nội dung thứ hai" },
        caption: { headline: "Nội dung thứ hai" },
      },
      {
        id: "body-3",
        type: "body",
        voiceText: "Nội dung thứ ba.",
        templateData: { template: "callout", statement: "Nội dung thứ ba" },
        caption: { headline: "Nội dung thứ ba" },
      },
      {
        id: "outro",
        type: "outro",
        voiceText: "Theo dõi để xem tiếp.",
        templateData: { template: "outro", ctaTop: "Theo dõi", channelName: "Quốc Yok Đôn", source: "Local" },
      },
    ],
  }, null, 2));
  return dir;
}
