import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";

const ENV_KEYS = [
  "TTS_PROVIDER",
  "VIETNAMESE_API_KEY",
  "VIETNAMESE_VOICEID",
  "LUCYLAB_ENDPOINT",
  "LUCYLAB_POLL_INTERVAL_MS",
  "LUCYLAB_POLL_TIMEOUT_MS",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_MODEL_ID",
  "ELEVENLABS_ENDPOINT",
  "SUPERTONIC_PYTHON",
  "SUPERTONIC_SCRIPT",
  "SUPERTONIC_VOICE",
  "SUPERTONIC_LANG",
  "SUPERTONIC_SPEED",
  "VIENEU_PYTHON",
  "VIENEU_SCRIPT",
  "VIENEU_MODE",
  "VIENEU_EMOTION",
  "VIENEU_REF_AUDIO",
  "VIENEU_REF_TEXT",
  "VIENEU_REMOTE_API_BASE",
  "VIENEU_REMOTE_MODEL",
  "TTS_FALLBACK_PROVIDER",
  "TTS_CONCURRENCY",
  "AUTO_SFX",
];

describe("loadConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  describe("LucyLab provider (default)", () => {
    it("reads LucyLab env vars when no provider specified", () => {
      process.env.VIETNAMESE_API_KEY = "sk_test_abc";
      process.env.VIETNAMESE_VOICEID = "voice123";
      const cfg = loadConfig();
      expect(cfg.ttsProvider).toBe("lucylab");
      expect(cfg.lucylabApiKey).toBe("sk_test_abc");
      expect(cfg.lucylabVoiceId).toBe("voice123");
    });

    it("throws when VIETNAMESE_API_KEY missing", () => {
      process.env.VIETNAMESE_VOICEID = "voice123";
      expect(() => loadConfig()).toThrow(/VIETNAMESE_API_KEY/);
    });

    it("uses sensible defaults for optional vars", () => {
      process.env.VIETNAMESE_API_KEY = "k";
      process.env.VIETNAMESE_VOICEID = "v";
      const cfg = loadConfig();
      expect(cfg.lucylabEndpoint).toBe("https://api.lucylab.io/json-rpc");
      expect(cfg.lucylabPollIntervalMs).toBe(2000);
      expect(cfg.lucylabPollTimeoutMs).toBe(120000);
      expect(cfg.ttsConcurrency).toBe(1);
      expect(cfg.autoSfx).toBe(false);
    });
  });

  describe("ElevenLabs provider", () => {
    it("reads ElevenLabs env vars when TTS_PROVIDER=elevenlabs", () => {
      process.env.TTS_PROVIDER = "elevenlabs";
      process.env.ELEVENLABS_API_KEY = "sk_eleven_xyz";
      process.env.ELEVENLABS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
      const cfg = loadConfig();
      expect(cfg.ttsProvider).toBe("elevenlabs");
      expect(cfg.elevenlabsApiKey).toBe("sk_eleven_xyz");
      expect(cfg.elevenlabsVoiceId).toBe("EXAVITQu4vr4xnSDxMaL");
      expect(cfg.elevenlabsModelId).toBe("eleven_multilingual_v2");
      expect(cfg.elevenlabsEndpoint).toBe("https://api.elevenlabs.io/v1");
    });

    it("throws when ELEVENLABS_API_KEY missing", () => {
      process.env.TTS_PROVIDER = "elevenlabs";
      process.env.ELEVENLABS_VOICE_ID = "v";
      expect(() => loadConfig()).toThrow(/ELEVENLABS_API_KEY/);
    });

    it("respects ELEVENLABS_MODEL_ID override", () => {
      process.env.TTS_PROVIDER = "elevenlabs";
      process.env.ELEVENLABS_API_KEY = "k";
      process.env.ELEVENLABS_VOICE_ID = "v";
      process.env.ELEVENLABS_MODEL_ID = "eleven_turbo_v2_5";
      const cfg = loadConfig();
      expect(cfg.elevenlabsModelId).toBe("eleven_turbo_v2_5");
    });
  });

  describe("Supertonic provider", () => {
    it("does not require cloud API keys when TTS_PROVIDER=supertonic", () => {
      process.env.TTS_PROVIDER = "supertonic";
      const cfg = loadConfig();
      expect(cfg.ttsProvider).toBe("supertonic");
      expect(cfg.supertonicPython).toBe("python3");
      expect(cfg.supertonicScript).toBe("scripts/supertonic_tts.py");
      expect(cfg.supertonicVoice).toBe("M4");
      expect(cfg.supertonicLang).toBe("vi");
      expect(cfg.supertonicSpeed).toBe(1.05);
    });

    it("reads Supertonic overrides", () => {
      process.env.TTS_PROVIDER = "supertonic";
      process.env.SUPERTONIC_PYTHON = ".venv/bin/python";
      process.env.SUPERTONIC_SCRIPT = "custom/supertonic.py";
      process.env.SUPERTONIC_VOICE = "F2";
      process.env.SUPERTONIC_LANG = "en";
      process.env.SUPERTONIC_SPEED = "1.2";
      const cfg = loadConfig();
      expect(cfg.supertonicPython).toBe(".venv/bin/python");
      expect(cfg.supertonicScript).toBe("custom/supertonic.py");
      expect(cfg.supertonicVoice).toBe("F2");
      expect(cfg.supertonicLang).toBe("en");
      expect(cfg.supertonicSpeed).toBe(1.2);
    });
  });

  describe("VieNeu provider", () => {
    it("does not require cloud API keys when TTS_PROVIDER=vieneu", () => {
      process.env.TTS_PROVIDER = "vieneu";
      const cfg = loadConfig();
      expect(cfg.ttsProvider).toBe("vieneu");
      expect(cfg.vieneuPython).toBe("python3");
      expect(cfg.vieneuScript).toBe("scripts/vieneu_tts.py");
      expect(cfg.vieneuMode).toBe("standard");
      expect(cfg.vieneuEmotion).toBe("storytelling");
    });

    it("reads VieNeu overrides", () => {
      process.env.TTS_PROVIDER = "vieneu";
      process.env.VIENEU_PYTHON = ".venv/bin/python";
      process.env.VIENEU_SCRIPT = "custom/vieneu.py";
      process.env.VIENEU_MODE = "turbo";
      process.env.VIENEU_EMOTION = "natural";
      process.env.VIENEU_REF_AUDIO = "assets/yokdon-voice.wav";
      process.env.VIENEU_REF_TEXT = "Xin chào";
      const cfg = loadConfig();
      expect(cfg.vieneuPython).toBe(".venv/bin/python");
      expect(cfg.vieneuScript).toBe("custom/vieneu.py");
      expect(cfg.vieneuMode).toBe("turbo");
      expect(cfg.vieneuEmotion).toBe("natural");
      expect(cfg.vieneuRefAudio).toBe("assets/yokdon-voice.wav");
      expect(cfg.vieneuRefText).toBe("Xin chào");
    });

    it("reads remote mode config", () => {
      process.env.TTS_PROVIDER = "vieneu";
      process.env.VIENEU_MODE = "remote";
      process.env.VIENEU_REMOTE_API_BASE = "http://gpu-server:23333/v1";
      process.env.VIENEU_REMOTE_MODEL = "pnnbao-ump/VieNeu-TTS-v2";
      const cfg = loadConfig();
      expect(cfg.vieneuMode).toBe("remote");
      expect(cfg.vieneuRemoteApiBase).toBe("http://gpu-server:23333/v1");
      expect(cfg.vieneuRemoteModel).toBe("pnnbao-ump/VieNeu-TTS-v2");
    });
  });

  it("accepts Supertonic as fallback without cloud keys", () => {
    process.env.TTS_PROVIDER = "elevenlabs";
    process.env.ELEVENLABS_API_KEY = "k";
    process.env.ELEVENLABS_VOICE_ID = "v";
    process.env.TTS_FALLBACK_PROVIDER = "supertonic";
    const cfg = loadConfig();
    expect(cfg.ttsFallbackProviders).toEqual(["supertonic"]);
  });

  it("accepts VieNeu as fallback without cloud keys", () => {
    process.env.TTS_PROVIDER = "elevenlabs";
    process.env.ELEVENLABS_API_KEY = "k";
    process.env.ELEVENLABS_VOICE_ID = "v";
    process.env.TTS_FALLBACK_PROVIDER = "vieneu";
    const cfg = loadConfig();
    expect(cfg.ttsFallbackProviders).toEqual(["vieneu"]);
  });

  it("accepts multiple comma-separated fallback providers", () => {
    process.env.TTS_PROVIDER = "lucylab";
    process.env.VIETNAMESE_API_KEY = "k";
    process.env.VIETNAMESE_VOICEID = "v";
    process.env.TTS_FALLBACK_PROVIDER = "supertonic, vieneu";
    const cfg = loadConfig();
    expect(cfg.ttsFallbackProviders).toEqual(["supertonic", "vieneu"]);
  });

  it("rejects invalid fallback providers", () => {
    process.env.TTS_PROVIDER = "lucylab";
    process.env.VIETNAMESE_API_KEY = "k";
    process.env.VIETNAMESE_VOICEID = "v";
    process.env.TTS_FALLBACK_PROVIDER = "supertonic, google";
    expect(() => loadConfig()).toThrow(/TTS_FALLBACK_PROVIDER/);
  });

  it("rejects invalid TTS_PROVIDER", () => {
    process.env.TTS_PROVIDER = "google";
    process.env.VIETNAMESE_API_KEY = "k";
    process.env.VIETNAMESE_VOICEID = "v";
    expect(() => loadConfig()).toThrow(/TTS_PROVIDER/);
  });

  it("supports opt-in automatic SFX", () => {
    process.env.VIETNAMESE_API_KEY = "k";
    process.env.VIETNAMESE_VOICEID = "v";
    process.env.AUTO_SFX = "true";
    expect(loadConfig().autoSfx).toBe(true);
  });

  it("rejects invalid AUTO_SFX", () => {
    process.env.VIETNAMESE_API_KEY = "k";
    process.env.VIETNAMESE_VOICEID = "v";
    process.env.AUTO_SFX = "maybe";
    expect(() => loadConfig()).toThrow(/AUTO_SFX/);
  });
});
