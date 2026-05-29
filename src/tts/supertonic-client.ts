import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { TtsClient } from "./tts-client.js";

export interface SupertonicOptions {
  python: string;
  scriptPath: string;
  voice: string;
  lang: string;
  speed: number;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (exit ${code}): ${err || out}`));
    });
  });
}

/**
 * Local/offline Supertonic TTS adapter.
 *
 * The Python wrapper writes WAV. For the existing video pipeline we convert to
 * MP3 when the requested output path ends in .mp3, so concat/SFX code can stay
 * unchanged.
 */
export class SupertonicClient implements TtsClient {
  constructor(private readonly opts: SupertonicOptions) {}

  async generate(text: string, audioOutPath: string, _srtOutPath?: string, _speed?: number): Promise<void> {
    await mkdir(dirname(audioOutPath), { recursive: true });

    const tmp = await mkdtemp(join(tmpdir(), "supertonic-"));
    const textPath = join(tmp, "text.txt");
    const wavPath = extname(audioOutPath).toLowerCase() === ".wav"
      ? audioOutPath
      : join(tmp, "voice.wav");

    try {
      await writeFile(textPath, text, "utf8");
      await run(this.opts.python, [
        resolve(this.opts.scriptPath),
        "--text-file", textPath,
        "--out", wavPath,
        "--voice", this.opts.voice,
        "--lang", this.opts.lang,
        "--speed", String(this.opts.speed),
      ]);

      if (wavPath !== audioOutPath) {
        await run("ffmpeg", [
          "-y",
          "-i", wavPath,
          "-ar", "44100",
          "-ac", "1",
          "-c:a", "libmp3lame",
          "-b:a", "192k",
          audioOutPath,
        ]);
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }
}
