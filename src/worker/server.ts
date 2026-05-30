#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const JOBS_ROOT = resolve(process.env.RENDER_JOBS_ROOT || join(ROOT, "worker-jobs"));
const HOST = process.env.RENDER_WORKER_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.RENDER_WORKER_PORT || "8088", 10);
const TOKEN = process.env.RENDER_WORKER_TOKEN || "";
const PIPELINE_SCRIPT = process.env.RENDER_PIPELINE_SCRIPT || "pipeline";
const TIMEOUT_MS = Number.parseInt(process.env.RENDER_TIMEOUT_SECONDS || "1200", 10) * 1000;
const BODY_LIMIT_BYTES = Number.parseInt(process.env.RENDER_BODY_LIMIT_BYTES || `${25 * 1024 * 1024}`, 10);

type JsonValue = Record<string, any>;

interface JobRecord {
  job_id: string;
  status: "queued" | "rendering" | "rendered" | "failed" | "deleted";
  created_at: string;
  updated_at: string;
  job_dir: string;
  script_path: string;
  video_path: string;
  error: string;
  stdout_tail: string;
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function safeJobId(value: string | undefined): string {
  const raw = (value || "").trim();
  const id = raw || `render_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  if (!/^[A-Za-z0-9_.:-]{3,96}$/.test(id)) {
    throw httpError(400, "job_id chỉ được chứa chữ, số, '.', '_', ':', '-' và dài 3-96 ký tự.");
  }
  return id;
}

function jobDir(jobId: string): string {
  const dir = resolve(JOBS_ROOT, jobId);
  const rel = dir.startsWith(JOBS_ROOT + "/") || dir === JOBS_ROOT;
  if (!rel) throw httpError(400, "job_id không an toàn.");
  return dir;
}

function httpError(status: number, message: string): Error & { status?: number } {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function requireAuth(req: IncomingMessage): void {
  if (!TOKEN) return;
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${TOKEN}`) throw httpError(401, "unauthorized");
}

function sendJson(res: ServerResponse, status: number, payload: JsonValue): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendError(res: ServerResponse, err: unknown): void {
  const status = typeof err === "object" && err && "status" in err ? Number((err as any).status) : 500;
  sendJson(res, Number.isFinite(status) ? status : 500, {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
}

async function readJsonBody(req: IncomingMessage): Promise<JsonValue> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT_BYTES) throw httpError(413, "request body quá lớn.");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw httpError(400, "request body phải là JSON hợp lệ.");
  }
}

async function saveJob(job: JobRecord): Promise<void> {
  job.updated_at = nowIso();
  await mkdir(job.job_dir, { recursive: true });
  await writeFile(join(job.job_dir, "job.json"), JSON.stringify(job, null, 2), "utf8");
}

function safeAssetRelPath(value: string): string {
  const rel = String(value || "").replace(/^\/+/, "");
  if (!rel || rel.includes("..") || rel.startsWith(".") || rel.includes("\0")) {
    throw httpError(400, "asset rel_path không an toàn.");
  }
  return rel;
}

async function writeAssetFiles(dir: string, assets: unknown): Promise<void> {
  if (!Array.isArray(assets)) return;
  for (const item of assets) {
    if (!item || typeof item !== "object") continue;
    const relPath = safeAssetRelPath((item as any).rel_path || (item as any).path || "");
    const b64 = String((item as any).b64 || "");
    if (!b64) continue;
    const outPath = resolve(dir, relPath);
    if (!(outPath.startsWith(dir + "/") || outPath === dir)) throw httpError(400, "asset path vượt khỏi job_dir.");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(b64, "base64"));
  }
}

async function readJob(jobId: string): Promise<JobRecord> {
  const path = join(jobDir(jobId), "job.json");
  try {
    return JSON.parse(await readFile(path, "utf8")) as JobRecord;
  } catch {
    throw httpError(404, `Không tìm thấy render job ${jobId}.`);
  }
}

function tail(value: string, limit = 3000): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  return text.slice(text.length - limit);
}

function runPipeline(scriptPath: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveRun) => {
    const child = spawn("npm", ["run", PIPELINE_SCRIPT, "--", scriptPath, "--approved-assets"], {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => {
      output += `\nRender timeout after ${TIMEOUT_MS / 1000}s.`;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, output });
    });
  });
}

async function handleRender(req: IncomingMessage, res: ServerResponse): Promise<void> {
  requireAuth(req);
  const body = await readJsonBody(req);
  const script = body.script;
  if (!script || typeof script !== "object" || Array.isArray(script)) {
    throw httpError(400, "Thiếu field script dạng object.");
  }

  const jobId = safeJobId(String(body.job_id || ""));
  const dir = jobDir(jobId);
  await mkdir(dir, { recursive: true });
  const scriptPath = join(dir, "script.json");
  const videoPath = join(dir, "video.mp4");
  await writeAssetFiles(dir, body.asset_files);
  await writeFile(scriptPath, JSON.stringify(script, null, 2), "utf8");

  const job: JobRecord = {
    job_id: jobId,
    status: "rendering",
    created_at: nowIso(),
    updated_at: nowIso(),
    job_dir: dir,
    script_path: scriptPath,
    video_path: videoPath,
    error: "",
    stdout_tail: "",
  };
  await saveJob(job);

  const result = await runPipeline(scriptPath);
  job.stdout_tail = tail(result.output);
  try {
    await stat(videoPath);
    job.status = result.code === 0 ? "rendered" : "failed";
  } catch {
    job.status = "failed";
  }
  if (job.status !== "rendered") {
    job.error = tail(result.output || `Pipeline exited with code ${result.code}.`, 1200);
  }
  await saveJob(job);

  sendJson(res, job.status === "rendered" ? 200 : 500, {
    ok: job.status === "rendered",
    job,
    video_url: `/v1/jobs/${encodeURIComponent(jobId)}/video`,
  });
}

async function handleStatus(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
  requireAuth(req);
  sendJson(res, 200, { ok: true, job: await readJob(jobId) });
}

async function handleVideo(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
  requireAuth(req);
  const job = await readJob(jobId);
  if (job.status !== "rendered") throw httpError(409, `Job ${jobId} chưa render xong.`);
  const st = await stat(job.video_path);
  res.writeHead(200, {
    "content-type": "video/mp4",
    "content-length": st.size,
    "content-disposition": `attachment; filename="${basename(job.video_path)}"`,
  });
  createReadStream(job.video_path).pipe(res);
}

async function handleDelete(req: IncomingMessage, res: ServerResponse, jobId: string): Promise<void> {
  requireAuth(req);
  await rm(jobDir(jobId), { recursive: true, force: true });
  sendJson(res, 200, { ok: true, job_id: jobId, status: "deleted" });
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "auto-create-video-render-worker", jobs_root: JOBS_ROOT });
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/render") {
    await handleRender(req, res);
    return;
  }
  const statusMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
  if (req.method === "GET" && statusMatch) {
    await handleStatus(req, res, decodeURIComponent(statusMatch[1]));
    return;
  }
  const videoMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/video$/);
  if (req.method === "GET" && videoMatch) {
    await handleVideo(req, res, decodeURIComponent(videoMatch[1]));
    return;
  }
  if (req.method === "DELETE" && statusMatch) {
    await handleDelete(req, res, decodeURIComponent(statusMatch[1]));
    return;
  }
  throw httpError(404, "not found");
}

await mkdir(JOBS_ROOT, { recursive: true });
createServer((req, res) => {
  route(req, res).catch((err) => sendError(res, err));
}).listen(PORT, HOST, () => {
  console.log(`auto-create-video-render-worker listening on http://${HOST}:${PORT}`);
  if (!TOKEN) console.warn("RENDER_WORKER_TOKEN is empty; bind to localhost or set a token before exposing this service.");
});
