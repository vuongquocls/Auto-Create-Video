import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ScriptSchema, type Script } from "../render/script-schema.js";
import { buildSocialCaption } from "./caption.js";

export type PublishPlatform = "dry-run" | "webhook" | "facebook" | "youtube" | "tiktok";

export interface PublishRequest {
  projectDir: string;
  platforms: PublishPlatform[];
  caption?: string;
  dryRun?: boolean;
}

export interface PublishAsset {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PublishManifest {
  version: "1.0";
  projectId: string;
  title: string;
  channel: string;
  sourceUrl: string;
  createdAt: string;
  caption: string;
  platforms: PublishPlatform[];
  video: PublishAsset;
  scriptPath: string;
  syntheticMedia: true;
}

export interface PublishResult {
  platform: PublishPlatform;
  status: "planned" | "published" | "uploaded" | "failed";
  id?: string;
  url?: string;
  response?: unknown;
  error?: string;
}

export interface PublishRun {
  manifest: PublishManifest;
  results: PublishResult[];
}

export async function publishProject(request: PublishRequest): Promise<PublishRun> {
  const projectDir = resolve(request.projectDir);
  const manifest = await buildPublishManifest(projectDir, {
    caption: request.caption,
    platforms: request.platforms,
  });
  await writePublishFiles(projectDir, manifest);

  const platforms = normalizePlatforms(request.platforms, request.dryRun);
  const results: PublishResult[] = [];
  for (const platform of platforms) {
    try {
      if (platform === "dry-run") results.push(await publishDryRun(projectDir, manifest));
      else if (platform === "webhook") results.push(await publishWebhook(manifest));
      else if (platform === "facebook") results.push(await publishFacebook(manifest));
      else if (platform === "youtube") results.push(await publishYouTube(manifest));
      else if (platform === "tiktok") results.push(await publishTikTokInbox(manifest));
      else results.push({ platform, status: "failed", error: `Unsupported platform: ${platform}` });
    } catch (err) {
      results.push({
        platform,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const run: PublishRun = { manifest: { ...manifest, platforms }, results };
  await writeFile(join(projectDir, "publish-result.json"), JSON.stringify(run, null, 2));
  return run;
}

export async function buildPublishManifest(
  projectDir: string,
  options: { caption?: string; platforms?: PublishPlatform[] } = {},
): Promise<PublishManifest> {
  const scriptPath = join(projectDir, "script.json");
  const videoPath = join(projectDir, "video.mp4");
  if (!existsSync(scriptPath)) throw new Error(`script.json not found in ${projectDir}`);
  if (!existsSync(videoPath)) throw new Error(`video.mp4 not found in ${projectDir}`);

  const script: Script = ScriptSchema.parse(JSON.parse(await readFile(scriptPath, "utf8")));
  const captionPath = join(projectDir, "sns_post.txt");
  const caption = options.caption?.trim()
    || (existsSync(captionPath) ? (await readFile(captionPath, "utf8")).trim() : "")
    || buildSocialCaption(script).trim();

  const video = await assetInfo(videoPath);
  return {
    version: "1.0",
    projectId: basename(projectDir),
    title: script.metadata.title,
    channel: script.metadata.channel,
    sourceUrl: script.metadata.source.url,
    createdAt: new Date().toISOString(),
    caption: caption + "\n",
    platforms: options.platforms?.length ? options.platforms : ["dry-run"],
    video,
    scriptPath,
    syntheticMedia: true,
  };
}

export async function writePublishFiles(projectDir: string, manifest: PublishManifest): Promise<void> {
  await writeFile(join(projectDir, "sns_post.txt"), manifest.caption);
  await writeFile(join(projectDir, "publish-manifest.json"), JSON.stringify(manifest, null, 2));
}

function normalizePlatforms(platforms: PublishPlatform[], dryRun?: boolean): PublishPlatform[] {
  const unique = Array.from(new Set<PublishPlatform>(platforms.length ? platforms : ["dry-run"]));
  if (dryRun && !unique.includes("dry-run")) return ["dry-run", ...unique];
  return unique;
}

async function assetInfo(path: string): Promise<PublishAsset> {
  const [buf, st] = await Promise.all([readFile(path), stat(path)]);
  return {
    path,
    bytes: st.size,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

async function publishDryRun(projectDir: string, manifest: PublishManifest): Promise<PublishResult> {
  await writeFile(join(projectDir, "publish-dry-run.json"), JSON.stringify({
    plannedAt: new Date().toISOString(),
    manifest,
  }, null, 2));
  return { platform: "dry-run", status: "planned", id: manifest.projectId };
}

async function publishWebhook(manifest: PublishManifest): Promise<PublishResult> {
  const url = process.env.AUTOPUBLISH_WEBHOOK_URL;
  if (!url) throw new Error("Missing AUTOPUBLISH_WEBHOOK_URL");
  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  form.set("caption", manifest.caption);
  form.set("projectId", manifest.projectId);
  form.set("video", await fileBlob(manifest.video.path), `${manifest.projectId}.mp4`);
  const secret = process.env.AUTOPUBLISH_WEBHOOK_SECRET;
  const res = await fetch(url, {
    method: "POST",
    headers: secret ? { "x-autopublish-secret": secret } : undefined,
    body: form,
  });
  const response = await readResponse(res);
  if (!res.ok) throw new Error(`Webhook publish failed: HTTP ${res.status} ${stringifyShort(response)}`);
  return { platform: "webhook", status: "published", response };
}

async function publishFacebook(manifest: PublishManifest): Promise<PublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId) throw new Error("Missing FACEBOOK_PAGE_ID");
  if (!token) throw new Error("Missing FACEBOOK_PAGE_ACCESS_TOKEN");

  const version = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
  const form = new FormData();
  form.set("access_token", token);
  form.set("title", manifest.title);
  form.set("description", manifest.caption);
  form.set("published", process.env.FACEBOOK_PUBLISHED ?? "true");
  form.set("source", await fileBlob(manifest.video.path), `${manifest.projectId}.mp4`);

  const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/videos`, {
    method: "POST",
    body: form,
  });
  const response = await readResponse(res);
  if (!res.ok) throw new Error(`Facebook publish failed: HTTP ${res.status} ${stringifyShort(response)}`);
  const id = objectId(response);
  return {
    platform: "facebook",
    status: "published",
    id,
    url: id ? `https://www.facebook.com/${id}` : undefined,
    response,
  };
}

async function publishYouTube(manifest: PublishManifest): Promise<PublishResult> {
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  if (!token) throw new Error("Missing YOUTUBE_ACCESS_TOKEN");

  const metadata = {
    snippet: {
      title: truncate(manifest.title, 100),
      description: manifest.caption,
      tags: inferTags(manifest.caption),
      categoryId: process.env.YOUTUBE_CATEGORY_ID || "22",
      defaultLanguage: process.env.YOUTUBE_DEFAULT_LANGUAGE || "vi",
    },
    status: {
      privacyStatus: process.env.YOUTUBE_PRIVACY_STATUS || "private",
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
    },
  };
  const boundary = `autopublish_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const video = await readFile(manifest.video.path);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`),
    video,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/related; boundary=${boundary}`,
      "content-length": String(body.length),
    },
    body,
  });
  const response = await readResponse(res);
  if (!res.ok) throw new Error(`YouTube publish failed: HTTP ${res.status} ${stringifyShort(response)}`);
  const id = objectId(response);
  return {
    platform: "youtube",
    status: "published",
    id,
    url: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
    response,
  };
}

async function publishTikTokInbox(manifest: PublishManifest): Promise<PublishResult> {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error("Missing TIKTOK_ACCESS_TOKEN");
  const size = manifest.video.bytes;
  const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const init = await readResponse(initRes);
  if (!initRes.ok) throw new Error(`TikTok init failed: HTTP ${initRes.status} ${stringifyShort(init)}`);
  const uploadUrl = nestedString(init, ["data", "upload_url"]);
  const publishId = nestedString(init, ["data", "publish_id"]);
  if (!uploadUrl) throw new Error(`TikTok init response did not include upload_url: ${stringifyShort(init)}`);

  const video = await readFile(manifest.video.path);
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "video/mp4",
      "content-length": String(size),
      "content-range": `bytes 0-${size - 1}/${size}`,
    },
    body: video,
  });
  const uploadResponse = await readResponse(uploadRes);
  if (!uploadRes.ok) throw new Error(`TikTok upload failed: HTTP ${uploadRes.status} ${stringifyShort(uploadResponse)}`);
  return {
    platform: "tiktok",
    status: "uploaded",
    id: publishId,
    response: { init, upload: uploadResponse || { ok: true } },
  };
}

async function fileBlob(path: string): Promise<Blob> {
  return new Blob([await readFile(path)], { type: "video/mp4" });
}

async function readResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function objectId(value: unknown): string | undefined {
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return undefined;
}

function nestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

function stringifyShort(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 600) : JSON.stringify(value).slice(0, 600);
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trim();
}

function inferTags(caption: string): string[] {
  return Array.from(caption.matchAll(/#([\p{L}\p{N}_]+)/gu))
    .map((match) => match[1])
    .filter(Boolean)
    .slice(0, 15);
}
