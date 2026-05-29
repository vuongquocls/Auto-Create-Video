import "dotenv/config";

export type TtsProvider = "lucylab" | "elevenlabs" | "supertonic" | "vieneu";
export type VieneuMode = "standard" | "turbo" | "remote";
export type VieneuEmotion = "natural" | "storytelling";

export interface TiktokConfig {
  displayName: string;
  handle: string;
  followers: string;
  /** URL to download avatar JPG. If undefined, the bundled `assets/avatar.jpg` is used. */
  avatarUrl?: string;
}

export interface Config {
  ttsProvider: TtsProvider;

  // LucyLab
  lucylabApiKey?: string;
  lucylabVoiceId?: string;
  lucylabEndpoint: string;
  lucylabPollIntervalMs: number;
  lucylabPollTimeoutMs: number;

  // ElevenLabs
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId: string;
  elevenlabsEndpoint: string;

  // Supertonic local TTS
  supertonicPython: string;
  supertonicScript: string;
  supertonicVoice: string;
  supertonicLang: string;
  supertonicSpeed: number;

  // VieNeu-TTS local/remote
  vieneuPython: string;
  vieneuScript: string;
  vieneuMode: VieneuMode;
  vieneuEmotion: VieneuEmotion;
  vieneuRefAudio?: string;
  vieneuRefText?: string;
  vieneuRemoteApiBase?: string;
  vieneuRemoteModel?: string;

  // Ordered fallback providers when the primary TTS provider fails.
  // e.g. ["supertonic", "vieneu"] → try supertonic first, then vieneu.
  ttsFallbackProviders: TtsProvider[];

  // TikTok follow card (outro)
  tiktok: TiktokConfig;

  ttsConcurrency: number;
  autoSfx: boolean;
}

function intDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`Env var ${name} must be integer, got "${v}"`);
  return n;
}

function floatDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`Env var ${name} must be number, got "${v}"`);
  return n;
}

function boolDefault(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (!v) return def;
  const normalized = v.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Env var ${name} must be boolean, got "${v}"`);
}

function parseProvider(name: string, value: string | undefined, def?: TtsProvider): TtsProvider | undefined {
  const provider = (value ?? def) as TtsProvider | undefined;
  if (!provider) return undefined;
  if (provider !== "lucylab" && provider !== "elevenlabs" && provider !== "supertonic" && provider !== "vieneu") {
    throw new Error(`${name} must be "lucylab", "elevenlabs", "supertonic", or "vieneu", got "${provider}"`);
  }
  return provider;
}

const VALID_PROVIDERS: readonly TtsProvider[] = ["lucylab", "elevenlabs", "supertonic", "vieneu"];

function parseFallbackProviders(value: string | undefined): TtsProvider[] {
  if (!value || value.trim() === "") return [];
  return value.split(",").map((p) => {
    const trimmed = p.trim();
    if (!VALID_PROVIDERS.includes(trimmed as TtsProvider)) {
      throw new Error(
        `TTS_FALLBACK_PROVIDER contains invalid provider "${trimmed}". ` +
        `Valid values: ${VALID_PROVIDERS.join(", ")}`
      );
    }
    return trimmed as TtsProvider;
  });
}

function validateProviderConfig(provider: TtsProvider): void {
  if (provider === "supertonic" || provider === "vieneu") return;
  if (provider === "lucylab") {
    if (!process.env.VIETNAMESE_API_KEY || process.env.VIETNAMESE_API_KEY.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_API_KEY (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab API key.`
      );
    }
    if (!process.env.VIETNAMESE_VOICEID || process.env.VIETNAMESE_VOICEID.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_VOICEID (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab voice ID.`
      );
    }
    return;
  }

  if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.trim() === "") {
    throw new Error(
      `Missing ELEVENLABS_API_KEY (required when TTS_PROVIDER=elevenlabs). ` +
      `Copy .env.example to .env.local and fill in your ElevenLabs API key.`
    );
  }
  if (!process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID.trim() === "") {
    throw new Error(
      `Missing ELEVENLABS_VOICE_ID (required when TTS_PROVIDER=elevenlabs). ` +
      `Copy .env.example to .env.local and fill in your ElevenLabs voice ID.`
    );
  }
}

export function loadConfig(): Config {
  const provider = parseProvider("TTS_PROVIDER", process.env.TTS_PROVIDER, "lucylab")!;
  const fallbackProviders = parseFallbackProviders(process.env.TTS_FALLBACK_PROVIDER);
  validateProviderConfig(provider);
  for (const fb of fallbackProviders) validateProviderConfig(fb);

  return {
    ttsProvider: provider,
    lucylabApiKey: process.env.VIETNAMESE_API_KEY,
    lucylabVoiceId: process.env.VIETNAMESE_VOICEID,
    lucylabEndpoint: process.env.LUCYLAB_ENDPOINT ?? "https://api.lucylab.io/json-rpc",
    lucylabPollIntervalMs: intDefault("LUCYLAB_POLL_INTERVAL_MS", 2000),
    lucylabPollTimeoutMs: intDefault("LUCYLAB_POLL_TIMEOUT_MS", 120000),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    elevenlabsEndpoint: process.env.ELEVENLABS_ENDPOINT ?? "https://api.elevenlabs.io/v1",
    supertonicPython: process.env.SUPERTONIC_PYTHON ?? "python3",
    supertonicScript: process.env.SUPERTONIC_SCRIPT ?? "scripts/supertonic_tts.py",
    supertonicVoice: process.env.SUPERTONIC_VOICE ?? "M4",
    supertonicLang: process.env.SUPERTONIC_LANG ?? "vi",
    supertonicSpeed: floatDefault("SUPERTONIC_SPEED", 1.05),
    vieneuPython: process.env.VIENEU_PYTHON ?? "python3",
    vieneuScript: process.env.VIENEU_SCRIPT ?? "scripts/vieneu_tts.py",
    vieneuMode: (process.env.VIENEU_MODE ?? "standard") as VieneuMode,
    vieneuEmotion: (process.env.VIENEU_EMOTION ?? "storytelling") as VieneuEmotion,
    vieneuRefAudio: process.env.VIENEU_REF_AUDIO || undefined,
    vieneuRefText: process.env.VIENEU_REF_TEXT || undefined,
    vieneuRemoteApiBase: process.env.VIENEU_REMOTE_API_BASE || undefined,
    vieneuRemoteModel: process.env.VIENEU_REMOTE_MODEL || undefined,
    ttsFallbackProviders: fallbackProviders,
    tiktok: {
      displayName: process.env.TIKTOK_DISPLAY_NAME ?? "Công nghệ 24h",
      handle: process.env.TIKTOK_HANDLE ?? "@quocyokdon",
      followers: process.env.TIKTOK_FOLLOWERS ?? "1.2M followers",
      avatarUrl: process.env.TIKTOK_AVATAR_URL || undefined,
    },
    ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    autoSfx: boolDefault("AUTO_SFX", false),
  };
}
