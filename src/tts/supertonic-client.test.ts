import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SupertonicClient } from "./supertonic-client.js";

describe("SupertonicClient", () => {
  it("passes text and settings to the local wrapper and writes wav output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "supertonic-client-test-"));
    try {
      const fakeScript = join(tmp, "fake-supertonic.mjs");
      writeFileSync(fakeScript, `
        import { readFileSync, writeFileSync } from "node:fs";
        const args = process.argv.slice(2);
        const get = (name) => args[args.indexOf(name) + 1];
        const text = readFileSync(get("--text-file"), "utf8");
        writeFileSync(get("--out"), JSON.stringify({
          text,
          voice: get("--voice"),
          lang: get("--lang"),
          speed: get("--speed")
        }));
      `);

      const out = join(tmp, "out.wav");
      const client = new SupertonicClient({
        python: process.execPath,
        scriptPath: fakeScript,
        voice: "F1",
        lang: "vi",
        speed: 1.1,
      });

      await client.generate("Xin chào Supertonic", out);
      expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({
        text: "Xin chào Supertonic",
        voice: "F1",
        lang: "vi",
        speed: "1.1",
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
