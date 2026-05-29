import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { TtsClient } from "./tts-client.js";

export type VieneuMode = "standard" | "turbo" | "remote";
export type VieneuEmotion = "natural" | "storytelling";

export interface VieneuOptions {
  python: string;
  scriptPath: string;
  mode: VieneuMode;
  emotion: VieneuEmotion;
  /** Path to a 3-5 second reference audio for voice cloning. */
  refAudio?: string;
  /** Transcript of the reference audio (improves Standard mode accuracy). */
  refText?: string;
  /** API base URL for remote mode (e.g. http://host:23333/v1). */
  remoteApiBase?: string;
  /** Model name for remote mode. */
  remoteModel?: string;
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
 * VieNeu-TTS adapter for high-quality Vietnamese text-to-speech.
 *
 * Supports three modes:
 * - standard: GGUF + ONNX on-device (highest quality)
 * - turbo:    lightweight CPU-only (fastest, lower quality for short phrases)
 * - remote:   connects to a VieNeu Docker/GPU server
 *
 * Voice cloning is supported via `refAudio` — provide 3-5 seconds of reference
 * audio and VieNeu will synthesize speech in that voice.
 */
export class VieneuClient implements TtsClient {
  constructor(private readonly opts: VieneuOptions) {}

  async generate(text: string, audioOutPath: string, _srtOutPath?: string, _speed?: number): Promise<void> {
    await mkdir(dirname(audioOutPath), { recursive: true });

    const tmp = await mkdtemp(join(tmpdir(), "vieneu-"));
    const textPath = join(tmp, "text.txt");
    const wavPath = extname(audioOutPath).toLowerCase() === ".wav"
      ? audioOutPath
      : join(tmp, "voice.wav");

    try {
      await writeFile(textPath, text, "utf8");

      const scriptArgs = [
        resolve(this.opts.scriptPath),
        "--text-file", textPath,
        "--out", wavPath,
        "--mode", this.opts.mode,
        "--emotion", this.opts.emotion,
      ];

      if (this.opts.refAudio) {
        scriptArgs.push("--ref-audio", resolve(this.opts.refAudio));
      }
      if (this.opts.refText) {
        scriptArgs.push("--ref-text", this.opts.refText);
      }
      if (this.opts.mode === "remote" && this.opts.remoteApiBase) {
        scriptArgs.push("--api-base", this.opts.remoteApiBase);
      }
      if (this.opts.mode === "remote" && this.opts.remoteModel) {
        scriptArgs.push("--model", this.opts.remoteModel);
      }

      await run(this.opts.python, scriptArgs);

      // Convert WAV → MP3 when the pipeline expects .mp3 output
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
