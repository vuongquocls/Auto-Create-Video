import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { VieneuClient } from "./vieneu-client.js";

describe("VieneuClient", () => {
  it("passes text, mode, and emotion to the bridge script and writes wav output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "vieneu-client-test-"));
    try {
      const fakeScript = join(tmp, "fake-vieneu.mjs");
      writeFileSync(fakeScript, `
        import { readFileSync, writeFileSync } from "node:fs";
        const args = process.argv.slice(2);
        const get = (name) => args[args.indexOf(name) + 1];
        const text = readFileSync(get("--text-file"), "utf8");
        const result = {
          text,
          mode: get("--mode"),
          emotion: get("--emotion"),
        };
        if (args.includes("--ref-audio")) result.refAudio = get("--ref-audio");
        writeFileSync(get("--out"), JSON.stringify(result));
      `);

      const out = join(tmp, "out.wav");
      const client = new VieneuClient({
        python: process.execPath,
        scriptPath: fakeScript,
        mode: "standard",
        emotion: "storytelling",
      });

      await client.generate("Xin chào VieNeu", out);
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({
        text: "Xin chào VieNeu",
        mode: "standard",
        emotion: "storytelling",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("passes ref-audio for voice cloning", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "vieneu-client-clone-test-"));
    try {
      const fakeScript = join(tmp, "fake-vieneu.mjs");
      writeFileSync(fakeScript, `
        import { readFileSync, writeFileSync } from "node:fs";
        const args = process.argv.slice(2);
        const get = (name) => args[args.indexOf(name) + 1];
        const text = readFileSync(get("--text-file"), "utf8");
        const result = {
          text,
          mode: get("--mode"),
          emotion: get("--emotion"),
        };
        if (args.includes("--ref-audio")) result.refAudio = get("--ref-audio");
        writeFileSync(get("--out"), JSON.stringify(result));
      `);

      const refAudio = join(tmp, "ref.wav");
      writeFileSync(refAudio, "fake-audio-data");

      const out = join(tmp, "out.wav");
      const client = new VieneuClient({
        python: process.execPath,
        scriptPath: fakeScript,
        mode: "turbo",
        emotion: "natural",
        refAudio,
      });

      await client.generate("Đây là giọng clone", out);
      const result = JSON.parse(readFileSync(out, "utf8"));
      expect(result.text).toBe("Đây là giọng clone");
      expect(result.mode).toBe("turbo");
      expect(result.emotion).toBe("natural");
      expect(result.refAudio).toContain("ref.wav");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
