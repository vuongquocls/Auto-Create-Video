import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { config as loadDotenv } from "dotenv";
import { buildScript, inferTitle, makeProjectId, type CreateProjectInput } from "./planner.js";
import { ScriptSchema } from "../render/script-schema.js";
import { buildSocialCaption } from "../publish/caption.js";
import { publishProject, type PublishPlatform, type PublishRun } from "../publish/publisher.js";
import {
  allSceneAssetsReady,
  assignManualImageToScene,
  generateSceneAssets,
  prepareSceneAssets,
  summarizeSceneAssets,
  type AssetProvider,
  type AssetSummary,
} from "./assets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUTPUT_DIR = join(ROOT, "output");
const PORT = Number(process.env.STUDIO_PORT || 8787);
loadDotenv({ path: join(ROOT, ".env.local") });

type ProjectStatus = "draft" | "assets_pending_review" | "assets_approved" | "queued" | "rendering" | "done" | "publishing" | "published" | "failed";

interface AssetReview {
  state: "pending" | "approved";
  preparedAt?: string;
  approvedAt?: string;
  provider?: AssetProvider | "manual";
  directory: string;
  count: number;
  scenes: AssetSummary[];
}

interface StatusFile {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  sourceType: "text" | "url" | "idea";
  error?: string;
  pid?: number;
  assetReview?: AssetReview;
  publish?: {
    state: "idle" | "publishing" | "published" | "failed";
    updatedAt: string;
    platforms: PublishPlatform[];
    results?: PublishRun["results"];
    caption?: string;
  };
}

type ProjectFileKind = "video" | "voice" | "script" | "log" | "caption" | "publishManifest" | "publishResult";

const running = new Map<string, ReturnType<typeof spawn>>();

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const server = createServer((req, res) => {
    route(req, res).catch((err) => {
      console.error(err);
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
  server.listen(PORT, () => {
    console.log(`Studio running: http://localhost:${PORT}`);
  });
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/") {
    sendHtml(res, studioHtml());
    return;
  }

  if (method === "GET" && url.pathname === "/api/projects") {
    sendJson(res, 200, await listProjects());
    return;
  }

  if (method === "POST" && url.pathname === "/api/projects") {
    const input = await readJson<CreateProjectInput>(req);
    if (!input.content?.trim()) {
      sendJson(res, 400, { error: "content is required" });
      return;
    }
    const project = await createProject(input);
    sendJson(res, 201, project);
    return;
  }

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (method === "GET" && projectMatch) {
    sendJson(res, 200, await getProject(projectMatch[1]));
    return;
  }

  const scriptMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/script$/);
  if (method === "PUT" && scriptMatch) {
    const body = await readJson<{ script: unknown }>(req);
    const parsed = ScriptSchema.parse(body.script);
    const dir = projectDir(scriptMatch[1]);
    await writeFile(join(dir, "script.json"), JSON.stringify(parsed, null, 2));
    await touchStatus(scriptMatch[1], { status: "draft", error: undefined });
    sendJson(res, 200, await getProject(scriptMatch[1]));
    return;
  }

  const renderMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/render$/);
  if (method === "POST" && renderMatch) {
    const body = await readJson<{ approved?: boolean }>(req);
    const result = await startRender(renderMatch[1], Boolean(body.approved));
    sendJson(res, 202, result);
    return;
  }

  const publishMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/publish$/);
  if (method === "POST" && publishMatch) {
    const body = await readJson<{ platforms?: PublishPlatform[]; caption?: string; dryRun?: boolean }>(req);
    const result = await publishProjectFromStudio(publishMatch[1], body);
    sendJson(res, 200, result);
    return;
  }

  const assetApproveMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/approve$/);
  if (method === "POST" && assetApproveMatch) {
    const result = await approveAssetsForProject(assetApproveMatch[1]);
    sendJson(res, 200, result);
    return;
  }

  const assetGenerateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/generate$/);
  if (method === "POST" && assetGenerateMatch) {
    const body = await readJson<{ provider?: AssetProvider }>(req);
    const result = await generateAssetsForProject(assetGenerateMatch[1], body.provider || "local");
    sendJson(res, 200, result);
    return;
  }

  const assetManualMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/manual$/);
  if (method === "POST" && assetManualMatch) {
    const body = await readJson<{ sceneId?: string; path?: string }>(req);
    if (!body.path?.trim()) {
      sendJson(res, 400, { error: "path is required" });
      return;
    }
    const result = await addManualAssetToProject(assetManualMatch[1], body.path.trim(), body.sceneId);
    sendJson(res, 200, result);
    return;
  }

  const assetMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/(.+)$/);
  if (method === "GET" && assetMatch) {
    await sendAssetFile(res, assetMatch[1], assetMatch[2]);
    return;
  }

  const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(video|voice|script|log|caption|publishManifest|publishResult)$/);
  if (method === "GET" && fileMatch) {
    await sendProjectFile(res, fileMatch[1], fileMatch[2] as ProjectFileKind);
    return;
  }

  sendJson(res, 404, { error: "not found" });
}

async function createProject(input: CreateProjectInput) {
  const title = inferTitle(input.content, input.title);
  const id = makeProjectId(title);
  const dir = projectDir(id);
  await mkdir(dir, { recursive: true });

  const script = buildScript(input);
  const status: StatusFile = {
    id,
    title,
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceType: input.sourceUrl ? "url" : "text",
  };

  await writeFile(join(dir, "source.txt"), input.content.trim() + "\n");
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  await writeStatus(dir, status);
  await prepareAssetsForProject(id, "local");
  return getProject(id);
}

async function listProjects() {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true }).catch(() => []);
  const projects = await Promise.all(entries
    .filter((e) => e.isDirectory())
    .map((e) => readStatus(join(OUTPUT_DIR, e.name)).catch(() => null)));
  return projects
    .filter((p): p is StatusFile => Boolean(p))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function getProject(id: string) {
  const dir = projectDir(id);
  const status = await readStatus(dir);
  const script = ScriptSchema.parse(JSON.parse(await readFile(join(dir, "script.json"), "utf8")));
  const caption = await readTextIfExists(join(dir, "sns_post.txt")) || buildSocialCaption(script);
  return {
    ...status,
    script,
    caption,
    files: {
      video: existsSync(join(dir, "video.mp4")),
      voice: existsSync(join(dir, "voice.mp3")),
      script: existsSync(join(dir, "script.txt")),
      log: existsSync(join(dir, "studio-render.log")),
      caption: existsSync(join(dir, "sns_post.txt")),
      publishManifest: existsSync(join(dir, "publish-manifest.json")),
      publishResult: existsSync(join(dir, "publish-result.json")),
    },
    assetReview: status.assetReview,
    assets: collectAssets(script),
  };
}

async function prepareAssetsForProject(id: string, provider: AssetProvider) {
  const dir = projectDir(id);
  const raw = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
  const script = ScriptSchema.parse(raw);
  const assets = await prepareSceneAssets(dir, script, provider, { searchRoots: [join(ROOT, "assets"), join(ROOT, "output")] });
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  await touchStatus(id, {
    status: "assets_pending_review",
    error: undefined,
    assetReview: makeAssetReview(script, provider, "pending"),
  });
  return { id, assets, project: await getProject(id) };
}

async function generateAssetsForProject(id: string, provider: AssetProvider) {
  if (provider !== "local" && provider !== "openai") {
    throw new Error(`Unsupported asset provider: ${provider}`);
  }
  const dir = projectDir(id);
  const raw = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
  const script = ScriptSchema.parse(raw);
  const assets = await generateSceneAssets(dir, script, provider, { overwriteReady: true });
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  await touchStatus(id, {
    status: "assets_pending_review",
    error: undefined,
    assetReview: makeAssetReview(script, provider, "pending"),
  });
  return { id, assets, project: await getProject(id) };
}

async function addManualAssetToProject(id: string, path: string, sceneId?: string) {
  const dir = projectDir(id);
  const raw = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
  const script = ScriptSchema.parse(raw);
  const asset = await assignManualImageToScene(dir, script, path, sceneId);
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  await touchStatus(id, {
    status: "assets_pending_review",
    error: undefined,
    assetReview: makeAssetReview(script, "manual", "pending"),
  });
  return { id, asset, project: await getProject(id) };
}

async function approveAssetsForProject(id: string) {
  const dir = projectDir(id);
  const script = ScriptSchema.parse(JSON.parse(await readFile(join(dir, "script.json"), "utf8")));
  if (!allSceneAssetsReady(script)) {
    await touchStatus(id, {
      status: "assets_pending_review",
      error: "Cần đủ ảnh cho từng cảnh trước khi duyệt render.",
      assetReview: makeAssetReview(script, "manual", "pending"),
    });
    throw new Error("Cần đủ ảnh cho từng cảnh trước khi duyệt render.");
  }
  await touchStatus(id, {
    status: "assets_approved",
    error: undefined,
    assetReview: makeAssetReview(script, "manual", "approved"),
  });
  return getProject(id);
}

async function startRender(id: string, approved: boolean) {
  if (running.has(id)) return { id, status: "rendering" };
  const dir = projectDir(id);
  const status = await readStatus(dir);
  const script = ScriptSchema.parse(JSON.parse(await readFile(join(dir, "script.json"), "utf8")));
  if (!script.metadata.source.image) {
    if (!allSceneAssetsReady(script)) {
      await touchStatus(id, {
        status: "assets_pending_review",
        error: "Chưa có đủ ảnh minh họa cho các cảnh. Hãy tạo/tìm/thêm ảnh rồi duyệt trước khi render.",
        assetReview: makeAssetReview(script, "manual", "pending"),
      });
      throw new Error("Chưa có đủ ảnh minh họa cho các cảnh. Hãy tạo/tìm/thêm ảnh rồi duyệt trước khi render.");
    }
    if (status.status !== "assets_approved" && !approved) {
      await touchStatus(id, {
        status: "assets_pending_review",
        error: "Ảnh đã sẵn sàng nhưng chưa được duyệt. Hãy xác nhận duyệt ảnh trước khi render.",
        assetReview: makeAssetReview(script, "manual", "pending"),
      });
      throw new Error("Ảnh đã sẵn sàng nhưng chưa được duyệt. Hãy xác nhận duyệt ảnh trước khi render.");
    }
    if (approved && status.status !== "assets_approved") {
      await touchStatus(id, {
        status: "assets_approved",
        error: undefined,
        assetReview: makeAssetReview(script, "manual", "approved"),
      });
    }
  }
  const wordCount = script.scenes.map((s) => s.voiceText).join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 190) {
    await touchStatus(id, { status: "failed", error: `Script is too long for <60s video (${wordCount} words; target <=190).` });
    throw new Error(`Script is too long for <60s video (${wordCount} words; target <=190).`);
  }
  await touchStatus(id, { status: "rendering", error: undefined });

  const logPath = join(dir, "studio-render.log");
  const child = spawn("npm", ["run", "pipeline", "--", join("output", id, "script.json"), "--approved-assets"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.set(id, child);
  await writeFile(logPath, "");
  let finalized = false;
  let lastSize = -1;
  let stableTicks = 0;
  const finishIfVideoStable = setInterval(async () => {
    if (finalized) return;
    const videoPath = join(dir, "video.mp4");
    if (!existsSync(videoPath)) return;
    const size = (await stat(videoPath).catch(() => ({ size: 0 }))).size;
    if (size > 1_000_000 && size === lastSize) stableTicks += 1;
    else stableTicks = 0;
    lastSize = size;
    if (stableTicks >= 2) {
      finalized = true;
      await completeRender(id).catch(console.error);
      child.kill();
    }
  }, 5000);
  child.stdout.on("data", (d) => appendLog(logPath, d));
  child.stderr.on("data", (d) => appendLog(logPath, d));
  child.on("close", async (code) => {
    clearInterval(finishIfVideoStable);
    running.delete(id);
    const videoExists = existsSync(join(dir, "video.mp4"));
    if (finalized && videoExists) return;
    if (code === 0 || videoExists) {
      await completeRender(id).catch(console.error);
    } else {
      await touchStatus(id, {
        status: "failed",
        error: `render exited with code ${code}`,
      }).catch(console.error);
    }
  });
  child.on("error", async (err) => {
    clearInterval(finishIfVideoStable);
    running.delete(id);
    await touchStatus(id, { status: "failed", error: err.message }).catch(console.error);
  });
  return { id, status: "rendering", pid: child.pid };
}

async function completeRender(id: string) {
  await touchStatus(id, { status: "done", error: undefined });
  if (String(process.env.AUTO_PUBLISH_ON_RENDER || "").toLowerCase() === "true") {
    await publishProjectFromStudio(id, {
      platforms: parsePublishPlatforms(process.env.AUTO_PUBLISH_PLATFORMS || "dry-run"),
    });
  }
}

async function publishProjectFromStudio(
  id: string,
  body: { platforms?: PublishPlatform[]; caption?: string; dryRun?: boolean },
) {
  const dir = projectDir(id);
  if (!existsSync(join(dir, "video.mp4"))) {
    throw new Error("Chưa có video.mp4 để đăng. Hãy render xong video trước.");
  }
  const platforms = normalizePublishPlatforms(body.platforms);
  const caption = body.caption?.trim();
  await touchStatus(id, {
    status: "publishing",
    error: undefined,
    publish: {
      state: "publishing",
      updatedAt: new Date().toISOString(),
      platforms,
      caption,
    },
  });

  try {
    const run = await publishProject({ projectDir: dir, platforms, caption, dryRun: body.dryRun });
    const hasFailed = run.results.some((result) => result.status === "failed");
    await touchStatus(id, {
      status: hasFailed ? "done" : "published",
      error: hasFailed ? "Một hoặc nhiều nền tảng đăng thất bại. Xem publish-result.json để biết chi tiết." : undefined,
      publish: {
        state: hasFailed ? "failed" : "published",
        updatedAt: new Date().toISOString(),
        platforms: run.manifest.platforms,
        results: run.results,
        caption: run.manifest.caption,
      },
    });
    return { id, project: await getProject(id), publish: run };
  } catch (err) {
    await touchStatus(id, {
      status: "done",
      error: err instanceof Error ? err.message : String(err),
      publish: {
        state: "failed",
        updatedAt: new Date().toISOString(),
        platforms,
        results: platforms.map((platform) => ({
          platform,
          status: "failed" as const,
          error: err instanceof Error ? err.message : String(err),
        })),
        caption,
      },
    });
    throw err;
  }
}

function normalizePublishPlatforms(platforms?: PublishPlatform[]): PublishPlatform[] {
  const fromInput = platforms?.length ? platforms : parsePublishPlatforms(process.env.AUTO_PUBLISH_PLATFORMS || "dry-run");
  const valid = new Set<PublishPlatform>(["dry-run", "webhook", "facebook", "youtube", "tiktok"]);
  const unique = Array.from(new Set(fromInput));
  for (const platform of unique) {
    if (!valid.has(platform)) throw new Error(`Unsupported publish platform: ${platform}`);
  }
  return unique.length ? unique : ["dry-run"];
}

function parsePublishPlatforms(value: string): PublishPlatform[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean) as PublishPlatform[];
}

async function sendProjectFile(res: ServerResponse, id: string, kind: ProjectFileKind) {
  const file = kind === "video" ? "video.mp4"
    : kind === "voice" ? "voice.mp3"
      : kind === "script" ? "script.txt"
        : kind === "log" ? "studio-render.log"
          : kind === "caption" ? "sns_post.txt"
            : kind === "publishManifest" ? "publish-manifest.json"
              : "publish-result.json";
  const path = join(projectDir(id), file);
  if (!existsSync(path)) {
    sendJson(res, 404, { error: `${file} not found` });
    return;
  }
  const st = await stat(path);
  res.writeHead(200, {
    "Content-Length": st.size,
    "Content-Type": kind === "video" ? "video/mp4" : kind === "voice" ? "audio/mpeg" : kind === "publishManifest" || kind === "publishResult" ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Content-Disposition": `inline; filename="${file}"`,
  });
  createReadStream(path).pipe(res);
}

async function sendAssetFile(res: ServerResponse, id: string, assetPath: string) {
  const normalized = assetPath.split("/").filter(Boolean).join("/");
  if (normalized.includes("..")) {
    sendJson(res, 400, { error: "invalid asset path" });
    return;
  }
  const path = join(projectDir(id), "assets", normalized);
  if (!existsSync(path)) {
    sendJson(res, 404, { error: "asset not found" });
    return;
  }
  const st = await stat(path);
  res.writeHead(200, {
    "Content-Length": st.size,
    "Content-Type": assetContentType(path),
  });
  createReadStream(path).pipe(res);
}

function collectAssets(script: any) {
  return summarizeSceneAssets(ScriptSchema.parse(script));
}

function makeAssetReview(script: ReturnType<typeof ScriptSchema.parse>, provider: AssetProvider | "manual", state: "pending" | "approved"): AssetReview {
  const scenes = summarizeSceneAssets(script);
  return {
    state,
    preparedAt: state === "pending" ? new Date().toISOString() : undefined,
    approvedAt: state === "approved" ? new Date().toISOString() : undefined,
    provider,
    directory: "assets/scenes",
    count: scenes.filter((scene) => scene.status === "ready" && scene.image).length,
    scenes,
  };
}

function projectDir(id: string) {
  const safe = basename(id);
  if (safe !== id) throw new Error("invalid project id");
  return join(OUTPUT_DIR, safe);
}

async function readStatus(dir: string): Promise<StatusFile> {
  return JSON.parse(await readFile(join(dir, "status.json"), "utf8"));
}

async function readTextIfExists(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return readFile(path, "utf8");
}

async function writeStatus(dir: string, status: StatusFile) {
  await writeFile(join(dir, "status.json"), JSON.stringify(status, null, 2));
}

async function touchStatus(id: string, patch: Partial<StatusFile>) {
  const dir = projectDir(id);
  const current = await readStatus(dir);
  await writeStatus(dir, { ...current, ...patch, updatedAt: new Date().toISOString() });
}

async function appendLog(path: string, data: Buffer) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, data).catch(console.error);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendHtml(res: ServerResponse, html: string) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function assetContentType(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function studioHtml() {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Auto Create Video Studio</title>
  <style>
    :root { color-scheme: dark; --bg:#0b111d; --panel:#111827; --line:#263244; --text:#edf2ff; --muted:#9aa8bd; --accent:#28d8d8; --good:#83d246; --bad:#ff6b6b; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: var(--bg); color: var(--text); }
    header { height:64px; display:flex; align-items:center; justify-content:space-between; padding:0 22px; border-bottom:1px solid var(--line); background:#0d1422; position:sticky; top:0; z-index:5; }
    h1 { font-size:18px; margin:0; letter-spacing:.2px; }
    main { display:grid; grid-template-columns: 330px minmax(0, 1fr) 390px; min-height: calc(100vh - 64px); }
    aside, section { padding:18px; border-right:1px solid var(--line); }
    section:last-child { border-right:0; }
    .panel { background: var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:14px; }
    label { display:block; font-size:12px; color:var(--muted); margin-bottom:6px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
    input, textarea, select { width:100%; background:#0c1320; color:var(--text); border:1px solid #2b3b52; border-radius:7px; padding:10px 11px; font: inherit; }
    textarea { min-height:240px; resize:vertical; line-height:1.45; }
    button { border:0; border-radius:7px; background:var(--accent); color:#06101a; padding:10px 12px; font-weight:800; cursor:pointer; }
    button.secondary { background:#1d2a3c; color:var(--text); border:1px solid #34445b; }
    button:disabled { opacity:.55; cursor:not-allowed; }
    .row { display:flex; gap:10px; align-items:center; }
    .row > * { flex:1; }
    .projects { display:flex; flex-direction:column; gap:8px; }
    .project { text-align:left; width:100%; background:#0c1320; color:var(--text); border:1px solid var(--line); padding:10px; border-radius:8px; }
    .project strong { display:block; font-size:13px; line-height:1.25; }
    .project span { color:var(--muted); font-size:12px; }
    .badge { display:inline-flex; padding:3px 7px; border-radius:99px; background:#223047; color:#c7d2e6; font-size:12px; font-weight:800; }
    .badge.done, .badge.assets_approved, .badge.published { background:rgba(131,210,70,.16); color:var(--good); }
    .badge.publishing { background:rgba(40,216,216,.16); color:var(--accent); }
    .badge.assets_pending_review { background:rgba(245,158,11,.16); color:#fbbf24; }
    .badge.failed { background:rgba(255,107,107,.16); color:var(--bad); }
    .editor { height: calc(100vh - 190px); min-height:520px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
    .muted { color:var(--muted); font-size:13px; }
    video { width:100%; border-radius:8px; background:#05070b; max-height:66vh; }
    .assets { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; }
    .asset { background:#0c1320; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .asset img { width:100%; display:block; aspect-ratio:9/16; object-fit:cover; background:#05070b; }
    .asset div { padding:8px; font-size:12px; color:var(--muted); }
    a { color:var(--accent); text-decoration:none; }
    .stack { display:flex; flex-direction:column; gap:10px; }
    .notice { font-size:13px; color:#d7e3f7; background:#0e1a2c; border:1px solid #20334d; padding:10px; border-radius:7px; }
    .checks { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; }
    .check { display:flex; gap:8px; align-items:center; background:#0c1320; border:1px solid var(--line); border-radius:7px; padding:8px; color:#d7e3f7; font-size:13px; text-transform:none; letter-spacing:0; margin:0; }
    .check input { width:auto; }
    .caption { min-height:130px; font-size:13px; }
    pre { margin:0; white-space:pre-wrap; word-break:break-word; background:#0c1320; border:1px solid var(--line); border-radius:7px; padding:10px; color:#d7e3f7; font-size:12px; max-height:220px; overflow:auto; }
  </style>
</head>
<body>
  <header>
    <h1>Auto Create Video Studio</h1>
    <div class="muted">Local YupVid-like phase 1 · @quocyokdon</div>
  </header>
  <main>
    <aside>
      <div class="panel">
        <label>Tiêu đề</label>
        <input id="title" placeholder="VD: Quan Vân Trường..." />
        <div style="height:10px"></div>
        <label>Nội dung / ý tưởng</label>
        <textarea id="content" placeholder="Dán bài viết hoặc ý tưởng vào đây..."></textarea>
        <div style="height:10px"></div>
        <button id="createBtn">Tạo storyboard</button>
      </div>
      <div class="panel">
        <div class="row" style="margin-bottom:10px">
          <strong>Projects</strong>
          <button class="secondary" onclick="loadProjects()">Refresh</button>
        </div>
        <div id="projects" class="projects"></div>
      </div>
    </aside>
    <section>
      <div class="panel">
        <div class="row">
          <div>
            <strong id="currentTitle">Chưa chọn project</strong>
            <div id="currentMeta" class="muted">Tạo hoặc chọn project để sửa storyboard.</div>
          </div>
          <button class="secondary" id="assetBtn" disabled>Tạo lại ảnh local</button>
          <button class="secondary" id="aiAssetBtn" disabled>Tạo lại ảnh AI</button>
          <button class="secondary" id="saveBtn" disabled>Lưu script</button>
          <button id="renderBtn" disabled>Duyệt ảnh, render</button>
        </div>
      </div>
      <textarea id="scriptEditor" class="editor" spellcheck="false"></textarea>
    </section>
    <section>
      <div class="panel stack">
        <div class="row">
          <strong>Preview / Download</strong>
          <span id="status" class="badge">draft</span>
        </div>
        <div id="downloads" class="stack"></div>
        <video id="video" controls></video>
      </div>
      <div class="panel stack">
        <div class="row">
          <strong>Đăng nền tảng</strong>
          <button id="publishBtn" disabled>Đăng</button>
        </div>
        <textarea id="captionEditor" class="caption" spellcheck="false" placeholder="Caption sẽ tự sinh sau khi tạo storyboard/render..."></textarea>
        <div class="checks">
          <label class="check"><input type="checkbox" name="platform" value="dry-run" checked /> Dry run</label>
          <label class="check"><input type="checkbox" name="platform" value="webhook" /> Webhook</label>
          <label class="check"><input type="checkbox" name="platform" value="facebook" /> Facebook</label>
          <label class="check"><input type="checkbox" name="platform" value="youtube" /> YouTube</label>
          <label class="check"><input type="checkbox" name="platform" value="tiktok" /> TikTok inbox</label>
        </div>
        <pre id="publishResult">Chưa có lượt đăng.</pre>
      </div>
      <div class="panel stack">
        <div class="row">
          <strong>Scene Assets</strong>
          <span class="muted" id="assetCount">0 ảnh</span>
        </div>
        <div id="assetDirectory" class="muted"></div>
        <div class="row">
          <select id="manualScene"></select>
          <input id="manualPath" placeholder="/duong/dan/anh-bo-sung.jpg" />
          <button class="secondary" id="manualBtn" disabled>Thêm ảnh</button>
        </div>
        <div id="assets" class="assets"></div>
      </div>
      <div class="notice">
        Khi đầu vào chỉ có nội dung, Studio tự chuẩn bị ảnh từng cảnh và dừng ở bước duyệt ảnh. Video chỉ render sau khi bấm “Duyệt ảnh, render”.
      </div>
    </section>
  </main>
  <script>
    let currentId = null;
    async function api(path, opts={}) {
      const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data;
    }
    async function loadProjects() {
      const items = await api('/api/projects');
      document.getElementById('projects').innerHTML = items.map(p => '<button class="project" onclick="loadProject(\\''+p.id+'\\')"><strong>'+escapeHtml(p.title)+'</strong><span>'+p.status+' · '+new Date(p.updatedAt).toLocaleString()+'</span></button>').join('') || '<div class="muted">Chưa có project.</div>';
    }
    async function loadProject(id) {
      const p = await api('/api/projects/' + id);
      currentId = id;
      document.getElementById('currentTitle').textContent = p.title;
      document.getElementById('currentMeta').textContent = p.id + ' · ' + p.status;
      document.getElementById('scriptEditor').value = JSON.stringify(p.script, null, 2);
      document.getElementById('saveBtn').disabled = false;
      document.getElementById('assetBtn').disabled = false;
      document.getElementById('aiAssetBtn').disabled = false;
      const readyAssets = (p.assets || []).filter(a => a.status === 'ready' && a.image);
      const assetsReady = readyAssets.length > 0 && readyAssets.length === (p.assets || []).length;
      document.getElementById('renderBtn').disabled = !assetsReady || p.status === 'rendering' || p.status === 'publishing';
      document.getElementById('publishBtn').disabled = !p.files.video || p.status === 'rendering' || p.status === 'publishing';
      document.getElementById('manualBtn').disabled = false;
      document.getElementById('status').textContent = p.status;
      document.getElementById('status').className = 'badge ' + p.status;
      document.getElementById('video').src = p.files.video ? '/api/projects/' + id + '/files/video?ts=' + Date.now() : '';
      document.getElementById('captionEditor').value = p.publish?.caption || p.caption || '';
      document.getElementById('publishResult').textContent = p.publish?.results ? JSON.stringify(p.publish.results, null, 2) : 'Chưa có lượt đăng.';
      document.getElementById('manualScene').innerHTML = (p.assets || []).map(a => '<option value="'+escapeHtml(a.sceneId)+'">'+escapeHtml(String(a.sceneIndex).padStart(2,'0') + ' · ' + a.label)+'</option>').join('');
      document.getElementById('assetDirectory').textContent = p.assetReview ? ('Thư mục: output/' + p.id + '/' + p.assetReview.directory) : '';
      const duration = estimateDuration(p.script);
      document.getElementById('downloads').innerHTML = [
        '<span class="muted">Ước tính thoại: '+duration+'s / mục tiêu &lt; 60s</span>',
        p.status === 'assets_pending_review' ? '<span class="muted">Đã chuẩn bị ảnh. Hãy kiểm tra từng cảnh trước khi render.</span>' : '',
        p.files.video ? '<a href="/api/projects/'+id+'/files/video" target="_blank">Tải video.mp4</a>' : '<span class="muted">Chưa có video</span>',
        p.files.voice ? '<a href="/api/projects/'+id+'/files/voice" target="_blank">Tải voice.mp3</a>' : '',
        p.files.script ? '<a href="/api/projects/'+id+'/files/script" target="_blank">Tải script.txt</a>' : '',
        p.files.caption ? '<a href="/api/projects/'+id+'/files/caption" target="_blank">Tải sns_post.txt</a>' : '',
        p.files.publishManifest ? '<a href="/api/projects/'+id+'/files/publishManifest" target="_blank">Xem publish-manifest.json</a>' : '',
        p.files.publishResult ? '<a href="/api/projects/'+id+'/files/publishResult" target="_blank">Xem publish-result.json</a>' : '',
        p.files.log ? '<a href="/api/projects/'+id+'/files/log" target="_blank">Xem render log</a>' : ''
      ].filter(Boolean).join('');
      renderAssets(p.assets || []);
    }
    document.getElementById('createBtn').onclick = async () => {
      const title = document.getElementById('title').value;
      const content = document.getElementById('content').value;
      const p = await api('/api/projects', { method:'POST', body: JSON.stringify({ title, content, channel:'Quoc YokDon' }) });
      await loadProjects();
      await loadProject(p.id);
    };
    document.getElementById('saveBtn').onclick = async () => {
      if (!currentId) return;
      const script = JSON.parse(document.getElementById('scriptEditor').value);
      await api('/api/projects/' + currentId + '/script', { method:'PUT', body: JSON.stringify({ script }) });
      await loadProject(currentId);
    };
    async function generateAssets(provider) {
      if (!currentId) return;
      document.getElementById('assetBtn').disabled = true;
      document.getElementById('aiAssetBtn').disabled = true;
      try {
        await api('/api/projects/' + currentId + '/assets/generate', { method:'POST', body: JSON.stringify({ provider }) });
        await loadProject(currentId);
      } catch (err) {
        alert(err.message || String(err));
      } finally {
        document.getElementById('assetBtn').disabled = false;
        document.getElementById('aiAssetBtn').disabled = false;
      }
    }
    document.getElementById('assetBtn').onclick = () => generateAssets('local');
    document.getElementById('aiAssetBtn').onclick = () => generateAssets('openai');
    document.getElementById('manualBtn').onclick = async () => {
      if (!currentId) return;
      const sceneId = document.getElementById('manualScene').value;
      const path = document.getElementById('manualPath').value;
      try {
        await api('/api/projects/' + currentId + '/assets/manual', { method:'POST', body: JSON.stringify({ sceneId, path }) });
        document.getElementById('manualPath').value = '';
        await loadProject(currentId);
      } catch (err) {
        alert(err.message || String(err));
      }
    };
    document.getElementById('renderBtn').onclick = async () => {
      if (!currentId) return;
      if (!confirm('Duyệt ảnh, tiếp tục tạo video?')) return;
      await api('/api/projects/' + currentId + '/render', { method:'POST', body: JSON.stringify({ approved:true }) });
      poll();
    };
    document.getElementById('publishBtn').onclick = async () => {
      if (!currentId) return;
      const platforms = Array.from(document.querySelectorAll('input[name="platform"]:checked')).map(input => input.value);
      if (!platforms.length) {
        alert('Chọn ít nhất một nền tảng.');
        return;
      }
      document.getElementById('publishBtn').disabled = true;
      document.getElementById('publishResult').textContent = 'Đang đăng...';
      try {
        const result = await api('/api/projects/' + currentId + '/publish', {
          method:'POST',
          body: JSON.stringify({ platforms, caption: document.getElementById('captionEditor').value })
        });
        document.getElementById('publishResult').textContent = JSON.stringify(result.publish.results, null, 2);
        await loadProject(currentId);
      } catch (err) {
        document.getElementById('publishResult').textContent = err.message || String(err);
        alert(err.message || String(err));
      } finally {
        await loadProject(currentId).catch(()=>{});
      }
    };
    async function poll() {
      if (!currentId) return;
      await loadProject(currentId);
      const s = document.getElementById('status').textContent;
      if (s === 'rendering' || s === 'queued' || s === 'publishing') setTimeout(poll, 2500);
    }
    function renderAssets(assets) {
      document.getElementById('assetCount').textContent = assets.length + ' ảnh';
      document.getElementById('assets').innerHTML = assets.map(a => {
        const src = '/api/projects/' + currentId + '/' + a.image;
        return '<div class="asset"><img src="'+src+'" alt="'+escapeHtml(a.sceneId)+'"><div><strong>'+escapeHtml(String(a.sceneIndex).padStart(2,'0') + ' · ' + a.sceneId)+'</strong><br>'+escapeHtml(a.label || '')+'<br>'+escapeHtml(a.prompt || '')+'</div></div>';
      }).join('') || '<div class="muted">Chưa tạo ảnh cảnh.</div>';
    }
    function estimateDuration(script) {
      const words = (script.scenes || []).map(s => s.voiceText || '').join(' ').trim().split(/\\s+/).filter(Boolean).length;
      return Math.round(words / 3.1);
    }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    loadProjects();
  </script>
</body>
</html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
