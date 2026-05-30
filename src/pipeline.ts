import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { ScriptSchema, type Script } from "./render/script-schema.js";
import { loadConfig } from "./config.js";
import { createTtsClient } from "./tts/tts-client.js";
import { fetchImage } from "./assets/image-fetcher.js";
import { getDurationSec, concatWithSilence, mixSfxOntoVoice, type SfxMixSpec } from "./assets/audio-tools.js";
import { indexSfxLibrary, pickSfxForScene, defaultPlayback } from "./assets/sfx-selector.js";
import { existsSync } from "node:fs";
import { composeHtml } from "./render/html-composer.js";
import { renderWithHyperframes } from "./render/hyperframes-runner.js";
import { log } from "./utils/logger.js";
import { createBrandAssetManifest, enrichScriptWithBrandAssets } from "./brand/brand-assets.js";
import { allSceneAssetsReady, prepareSceneAssets, summarizeSceneAssets, type AssetProvider } from "./studio/assets.js";
import { prepareTextForTts, ttsCacheKey } from "./tts/voice-text.js";
import { buildSocialCaption } from "./publish/caption.js";

const TOTAL_STEPS = 8;
const DURATION_MIN_SEC = 48;
const DURATION_MAX_SEC = 72;
const SCENE_GAP_SEC = 0.3;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "render", "templates");
/** Path to the SFX library (relative to project root) */
const SFX_DIR = join(__dirname, "..", "assets", "sfx");

const HYPERFRAMES_CONFIG = {
  $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
  registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  paths: {
    blocks: "compositions",
    components: "compositions/components",
    assets: "assets",
  },
};

export interface PipelineOptions {
  assetsApproved?: boolean;
  prepareAssetsOnly?: boolean;
  assetProvider?: AssetProvider;
}

export async function runPipeline(scriptPath: string, options: PipelineOptions = {}): Promise<void> {
  const cfg = loadConfig();
  const outputDir = dirname(scriptPath);
  log.info(`Output directory: ${outputDir}`);

  // STEP 1
  log.step(1, TOTAL_STEPS, `Load env + validate script.json (TTS provider: ${cfg.ttsProvider})`);
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  // Substitute env placeholder before validation (works for both providers)
  if (raw.voice?.voiceId === "${VIETNAMESE_VOICEID}" || raw.voice?.voiceId === "${VOICE_ID}") {
    raw.voice.voiceId = cfg.ttsProvider === "lucylab"
      ? cfg.lucylabVoiceId!
      : cfg.ttsProvider === "elevenlabs"
        ? cfg.elevenlabsVoiceId!
        : cfg.supertonicVoice;
  }
  const script: Script = enrichScriptWithBrandAssets(ScriptSchema.parse(raw));

  if (await stopForAssetReviewIfNeeded(scriptPath, outputDir, script, options)) {
    return;
  }

  // STEP 2
  log.step(2, TOTAL_STEPS, "Write script.txt + sns_post.txt");
  const fullText = script.scenes.map((s) => prepareTextForTts(s.voiceText)).join("\n\n");
  await writeFile(join(outputDir, "script.txt"), fullText);
  await writeFile(join(outputDir, "sns_post.txt"), buildSocialCaption(script));
  await writeFile(
    join(outputDir, "brand-asset-prompts.json"),
    JSON.stringify(createBrandAssetManifest(script), null, 2),
  );

  // STEP 3 + 4 in parallel
  log.step(3, TOTAL_STEPS, "Fetch og:image (parallel) + Step 4 TTS");
  const imgPath = join(outputDir, "images", "bg.jpg");
  const imgPromise = fetchImage(script.metadata.source.image, imgPath);

  // STEP 4
  const ttsClient = createTtsClient(cfg);
  // Concurrency: LucyLab requires 1 (only 1 concurrent export per key);
  // ElevenLabs supports parallel calls but we keep 1 by default to be polite.
  const limit = pLimit(cfg.ttsConcurrency);
  const voiceDir = join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });

  const sceneAudioPromises = script.scenes.map((scene) =>
    limit(async () => {
      const out = join(voiceDir, `scene-${scene.id}.mp3`);
      const srtOut = join(voiceDir, `scene-${scene.id}.srt`);
      const ttsText = prepareTextForTts(scene.voiceText);
      const metaOut = join(voiceDir, `scene-${scene.id}.tts.json`);
      const cacheKey = ttsCacheKey({
        provider: script.voice.provider,
        voiceId: script.voice.voiceId,
        speed: script.voice.speed,
        text: ttsText,
      });

      // IDEMPOTENT: skip TTS if voice file already exists.
      // The metadata hash includes the TTS-safe text, voice, provider, and speed.
      // That prevents stale audio when we normalize phone numbers or edit a scene.
      if (existsSync(out)) {
        const meta = await readJsonIfExists(metaOut);
        if (meta?.cacheKey === cacheKey) {
          const dur = await getDurationSec(out);
          log.info(`  scene ${scene.id}: REUSE existing mp3 (${dur.toFixed(2)}s)`);
          return { id: scene.id, path: out, durationSec: dur };
        }
        log.info(`  scene ${scene.id}: existing mp3 is stale or missing metadata → re-TTS`);
      }

      log.info(`  TTS scene ${scene.id} (${ttsText.length} chars)...`);
      await ttsClient.generate(ttsText, out, srtOut, script.voice.speed);
      const dur = await getDurationSec(out);
      await writeFile(metaOut, JSON.stringify({
        cacheKey,
        provider: script.voice.provider,
        voiceId: script.voice.voiceId,
        speed: script.voice.speed,
        text: ttsText,
      }, null, 2));
      log.info(`  scene ${scene.id}: ${dur.toFixed(2)}s`);
      return { id: scene.id, path: out, durationSec: dur };
    }),
  );

  const [imgResult, sceneAudio] = await Promise.all([
    imgPromise,
    Promise.all(sceneAudioPromises),
  ]);

  let bgImageRelPath: string | null = null;
  if (imgResult.success) {
    bgImageRelPath = "images/bg.jpg";
  } else {
    log.warn(`Background image fetch failed: ${imgResult.reason} → using gradient fallback`);
  }

  // STEP 5
  log.step(5, TOTAL_STEPS, "Concat voice scenes + mix SFX layer");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(sceneAudio.map((a) => a.path), SCENE_GAP_SEC, voiceRawMp3);

  // Compute scene start times (cumulative voice durations + gaps)
  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }

  // Build SFX mix list. Auto-SFX is opt-in because transition bleeps can sound
  // like stray audio in legal/public-service videos. Explicit scene.sfx still works.
  const sfxIndex = indexSfxLibrary(SFX_DIR);
  const indexCats = Object.keys(sfxIndex).length;
  const indexFiles = Object.values(sfxIndex).reduce((s, a) => s + a.length, 0);
  log.info(`  SFX library: ${indexFiles} files in ${indexCats} categories`);
  if (!cfg.autoSfx) {
    log.info("  Auto SFX disabled (set AUTO_SFX=true to enable template/semantic SFX)");
  }

  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];

    // Tier 1: explicit override in script.json
    if (scene.sfx) {
      if (scene.sfx.name === "none") {
        log.info(`  scene ${scene.id}: SFX disabled (explicit "none")`);
        continue;
      }
      const sfxPath = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(sfxPath)) {
        sfxList.push({ path: sfxPath, startSec: startSec + scene.sfx.startOffsetSec, volume: scene.sfx.volume });
        log.info(`  scene ${scene.id}: SFX override -> ${scene.sfx.name}.mp3`);
      } else {
        log.warn(`  scene ${scene.id}: explicit SFX not found, skipping: ${scene.sfx.name}.mp3`);
      }
      continue;
    }

    if (!cfg.autoSfx) continue;

    // Tier 2/3: smart selection by content + template
    const picked = pickSfxForScene({
      voiceText: prepareTextForTts(scene.voiceText),
      templateName: scene.templateData.template,
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) {
      log.warn(`  scene ${scene.id}: no SFX available (empty library?)`);
      continue;
    }

    const sfxPath = join(SFX_DIR, picked.relPath);
    const playback = defaultPlayback(picked);
    sfxList.push({ path: sfxPath, startSec: startSec + playback.offsetSec, volume: playback.volume });

    const why = picked.source === "semantic"
      ? `semantic match "${picked.matchedKeyword}"`
      : picked.source;
    log.info(`  scene ${scene.id}: SFX -> ${picked.relPath} (${why})`);
  }
  log.info(`  mixing ${sfxList.length} SFX into voice.mp3`);
  await mixSfxOntoVoice(voiceRawMp3, sfxList, voiceMp3);

  const totalAudioSec = await getDurationSec(voiceMp3);
  log.info(`  voice.mp3 total: ${totalAudioSec.toFixed(2)}s`);
  if (totalAudioSec < DURATION_MIN_SEC || totalAudioSec > DURATION_MAX_SEC) {
    log.warn(`Total duration ${totalAudioSec.toFixed(1)}s outside [${DURATION_MIN_SEC}, ${DURATION_MAX_SEC}]s tolerance — proceeding anyway`);
  }

  // STEP 6 — Compose HTML + write hyperframes project files
  log.step(6, TOTAL_STEPS, "Compose HTML + project files");

  const html = composeHtml({
    script,
    sceneAudio: sceneAudio.map((a) => ({ id: a.id, durationSec: a.durationSec })),
    gapSec: SCENE_GAP_SEC,
    bgImageRelPath,
    audioRelPath: "voice.mp3",
  });

  // hyperframes expects: index.html (NOT composition.html), hyperframes.json, meta.json in DIR
  await writeFile(join(outputDir, "index.html"), html);

  await writeFile(join(outputDir, "hyperframes.json"), JSON.stringify(HYPERFRAMES_CONFIG, null, 2));

  const slug = basename(outputDir);
  await writeFile(join(outputDir, "meta.json"), JSON.stringify({
    id: slug,
    name: script.metadata.title,
    createdAt: new Date().toISOString(),
  }, null, 2));

  // Copy templates next to the index.html so relative paths resolve
  await copyFile(join(TPL_DIR, "styles.css"),    join(outputDir, "styles.css"));
  await copyFile(join(TPL_DIR, "animations.js"), join(outputDir, "animations.js"));

  // Copy brand logo into output assets/ so HTML can find it at assets/logo-vuon.png
  const logoSrc = join(__dirname, "..", "assets", "logo-vuon.png");
  if (existsSync(logoSrc)) {
    await mkdir(join(outputDir, "assets"), { recursive: true });
    await copyFile(logoSrc, join(outputDir, "assets", "logo-vuon.png"));
  }

  // STEP 7
  log.step(7, TOTAL_STEPS, "Render with hyperframes");
  const videoPath = join(outputDir, "video.mp4");
  await renderWithHyperframes({ compositionDir: outputDir, outputPath: videoPath });

  // STEP 8
  log.step(8, TOTAL_STEPS, "Done");
  console.log("\n=== Result ===");
  console.log(`Video:  ${videoPath}`);
  console.log(`Audio:  ${voiceMp3}  (cho CapCut)`);
  console.log(`Script: ${join(outputDir, "script.txt")}  (cho CapCut auto-caption)`);
  console.log(`Post:   ${join(outputDir, "sns_post.txt")}  (caption mang xa hoi)`);
  console.log(`Tong thoi luong: ${totalAudioSec.toFixed(2)}s`);
}

async function readJsonIfExists(path: string): Promise<any | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function stopForAssetReviewIfNeeded(
  scriptPath: string,
  outputDir: string,
  script: Script,
  options: PipelineOptions,
): Promise<boolean> {
  if (script.metadata.source.image) return false;

  const ready = allSceneAssetsReady(script);
  const provider = options.assetProvider || "local";
  if (!ready) {
    log.step(2, TOTAL_STEPS, "Prepare scene images for review");
    const root = join(__dirname, "..");
    await prepareSceneAssets(outputDir, script, provider, {
      searchRoots: [join(root, "assets"), join(root, "output")],
    });
    await writeFile(scriptPath, JSON.stringify(script, null, 2));
    await writeAssetReviewFile(outputDir, script, "prepared");
    if (options.prepareAssetsOnly || !options.assetsApproved) {
      printAssetReviewSummary(outputDir, script);
      console.log("\nĐã chuẩn bị ảnh minh họa và tạm dừng trước bước render.");
      console.log("Hãy kiểm tra ảnh, bổ sung/thay ảnh nếu cần, rồi xác nhận duyệt ảnh trước khi render.");
      return true;
    }
  }

  await writeAssetReviewFile(outputDir, script, "ready");
  if (options.prepareAssetsOnly || !options.assetsApproved) {
    printAssetReviewSummary(outputDir, script);
    console.log("\nẢnh đã sẵn sàng nhưng pipeline chưa nhận xác nhận duyệt ảnh, nên chưa render video.");
    console.log("Chạy lại qua Studio bằng nút \"Duyệt ảnh, render\" hoặc dùng cờ --approved-assets nếu bạn đã kiểm tra ảnh.");
    return true;
  }

  return false;
}

async function writeAssetReviewFile(outputDir: string, script: Script, state: "prepared" | "ready") {
  await writeFile(join(outputDir, "asset-review.json"), JSON.stringify({
    state,
    directory: "assets/scenes",
    count: summarizeSceneAssets(script).filter((scene) => scene.status === "ready" && scene.image).length,
    scenes: summarizeSceneAssets(script),
  }, null, 2));
}

function printAssetReviewSummary(outputDir: string, script: Script) {
  const scenes = summarizeSceneAssets(script);
  console.log("\n=== Asset Review ===");
  console.log(`Ảnh: ${scenes.filter((scene) => scene.status === "ready" && scene.image).length}/${scenes.length}`);
  console.log(`Thư mục: ${join(outputDir, "assets", "scenes")}`);
  for (const scene of scenes) {
    console.log(`- ${scene.sceneId}: ${scene.image || "(chưa có ảnh)"} — ${scene.label}`);
  }
}
