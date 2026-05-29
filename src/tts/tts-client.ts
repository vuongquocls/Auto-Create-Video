/**
 * Common TTS client interface.
 *
 * All providers (LucyLab, ElevenLabs) implement this so the pipeline
 * can swap providers without changing orchestration logic.
 */
export interface TtsClient {
  /**
   * Generate speech audio for `text` and write to `audioOutPath` (mp3 or wav).
   * If `srtOutPath` is provided AND the provider supports subtitles,
   * write the SRT to that path. Otherwise silently skip.
   */
  generate(text: string, audioOutPath: string, srtOutPath?: string, speed?: number): Promise<void>;
}

import type { Config } from "../config.js";
import { LucylabClient } from "./lucylab-client.js";
import { ElevenLabsClient } from "./elevenlabs-client.js";
import { SupertonicClient } from "./supertonic-client.js";
import { VieneuClient } from "./vieneu-client.js";

class FallbackTtsClient implements TtsClient {
  constructor(
    private readonly primaryName: string,
    private readonly primary: TtsClient,
    private readonly fallbackName: string,
    private readonly fallback: TtsClient,
  ) {}

  async generate(text: string, audioOutPath: string, srtOutPath?: string, speed?: number): Promise<void> {
    try {
      await this.primary.generate(text, audioOutPath, srtOutPath, speed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[tts] ${this.primaryName} failed; retrying with ${this.fallbackName}: ${message}`
      );
      await this.fallback.generate(text, audioOutPath, srtOutPath, speed);
    }
  }
}

function createSingleTtsClient(cfg: Config, provider = cfg.ttsProvider): TtsClient {
  switch (provider) {
    case "lucylab":
      return new LucylabClient({
        apiKey: cfg.lucylabApiKey!,
        voiceId: cfg.lucylabVoiceId!,
        endpoint: cfg.lucylabEndpoint,
        pollIntervalMs: cfg.lucylabPollIntervalMs,
        pollTimeoutMs: cfg.lucylabPollTimeoutMs,
      });
    case "elevenlabs":
      return new ElevenLabsClient({
        apiKey: cfg.elevenlabsApiKey!,
        voiceId: cfg.elevenlabsVoiceId!,
        modelId: cfg.elevenlabsModelId,
        endpoint: cfg.elevenlabsEndpoint,
      });
    case "supertonic":
      return new SupertonicClient({
        python: cfg.supertonicPython,
        scriptPath: cfg.supertonicScript,
        voice: cfg.supertonicVoice,
        lang: cfg.supertonicLang,
        speed: cfg.supertonicSpeed,
      });
    case "vieneu":
      return new VieneuClient({
        python: cfg.vieneuPython,
        scriptPath: cfg.vieneuScript,
        mode: cfg.vieneuMode,
        emotion: cfg.vieneuEmotion,
        refAudio: cfg.vieneuRefAudio,
        refText: cfg.vieneuRefText,
        remoteApiBase: cfg.vieneuRemoteApiBase,
        remoteModel: cfg.vieneuRemoteModel,
      });
    default: {
      const _never: never = provider;
      throw new Error(`Unknown TTS provider: ${_never}`);
    }
  }
}

/**
 * Build a TTS client with an ordered fallback chain.
 *
 * Given primary=lucylab and fallbacks=[supertonic, vieneu], the resulting
 * chain is:  lucylab → supertonic → vieneu
 *
 * Implemented as nested FallbackTtsClient instances so each tier logs
 * which provider failed and which is retried next.
 */
export function createTtsClient(cfg: Config): TtsClient {
  // Collect the full ordered list: primary first, then fallbacks
  const allProviders = [cfg.ttsProvider, ...cfg.ttsFallbackProviders.filter(
    (p) => p !== cfg.ttsProvider,
  )];

  if (allProviders.length === 1) {
    return createSingleTtsClient(cfg, allProviders[0]);
  }

  // Build chain from right to left (innermost = last resort)
  let client: TtsClient = createSingleTtsClient(cfg, allProviders[allProviders.length - 1]);

  for (let i = allProviders.length - 2; i >= 0; i--) {
    const current = createSingleTtsClient(cfg, allProviders[i]);
    client = new FallbackTtsClient(allProviders[i], current, allProviders[i + 1], client);
  }

  return client;
}
