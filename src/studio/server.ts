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
import { generateSceneAssets, type AssetProvider } from "./assets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUTPUT_DIR = join(ROOT, "output");
const PORT = Number(process.env.STUDIO_PORT || 8787);
loadDotenv({ path: join(ROOT, ".env.local") });

type ProjectStatus = "draft" | "queued" | "rendering" | "done" | "failed";

interface StatusFile {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  sourceType: "text" | "url" | "idea";
  error?: string;
  pid?: number;
}

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
    const result = await startRender(renderMatch[1]);
    sendJson(res, 202, result);
    return;
  }

  const assetGenerateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/generate$/);
  if (method === "POST" && assetGenerateMatch) {
    const body = await readJson<{ provider?: AssetProvider }>(req);
    const result = await generateAssetsForProject(assetGenerateMatch[1], body.provider || "local");
    sendJson(res, 200, result);
    return;
  }

  const assetMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/(.+)$/);
  if (method === "GET" && assetMatch) {
    await sendAssetFile(res, assetMatch[1], assetMatch[2]);
    return;
  }

  const fileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/files\/(video|voice|script|log)$/);
  if (method === "GET" && fileMatch) {
    await sendProjectFile(res, fileMatch[1], fileMatch[2] as "video" | "voice" | "script" | "log");
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
  const script = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
  return {
    ...status,
    script,
    files: {
      video: existsSync(join(dir, "video.mp4")),
      voice: existsSync(join(dir, "voice.mp3")),
      script: existsSync(join(dir, "script.txt")),
      log: existsSync(join(dir, "studio-render.log")),
    },
    assets: collectAssets(script),
  };
}

async function generateAssetsForProject(id: string, provider: AssetProvider) {
  if (provider !== "local" && provider !== "openai") {
    throw new Error(`Unsupported asset provider: ${provider}`);
  }
  const dir = projectDir(id);
  const raw = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
  const script = ScriptSchema.parse(raw);
  const assets = await generateSceneAssets(dir, script, provider);
  await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  await touchStatus(id, { status: "draft", error: undefined });
  return { id, assets, project: await getProject(id) };
}

async function startRender(id: string) {
  if (running.has(id)) return { id, status: "rendering" };
  const dir = projectDir(id);
  await readStatus(dir);
  const script = ScriptSchema.parse(JSON.parse(await readFile(join(dir, "script.json"), "utf8")));
  const wordCount = script.scenes.map((s) => s.voiceText).join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 190) {
    await touchStatus(id, { status: "failed", error: `Script is too long for <60s video (${wordCount} words; target <=190).` });
    throw new Error(`Script is too long for <60s video (${wordCount} words; target <=190).`);
  }
  await touchStatus(id, { status: "rendering", error: undefined });

  const logPath = join(dir, "studio-render.log");
  const child = spawn("npm", ["run", "pipeline", "--", join("output", id, "script.json")], {
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
      await touchStatus(id, { status: "done", error: undefined }).catch(console.error);
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
    await touchStatus(id, {
      status: code === 0 || videoExists ? "done" : "failed",
      error: code === 0 || videoExists ? undefined : `render exited with code ${code}`,
    }).catch(console.error);
  });
  child.on("error", async (err) => {
    clearInterval(finishIfVideoStable);
    running.delete(id);
    await touchStatus(id, { status: "failed", error: err.message }).catch(console.error);
  });
  return { id, status: "rendering", pid: child.pid };
}

async function sendProjectFile(res: ServerResponse, id: string, kind: "video" | "voice" | "script" | "log") {
  const file = kind === "video" ? "video.mp4" : kind === "voice" ? "voice.mp3" : kind === "script" ? "script.txt" : "studio-render.log";
  const path = join(projectDir(id), file);
  if (!existsSync(path)) {
    sendJson(res, 404, { error: `${file} not found` });
    return;
  }
  const st = await stat(path);
  res.writeHead(200, {
    "Content-Length": st.size,
    "Content-Type": kind === "video" ? "video/mp4" : kind === "voice" ? "audio/mpeg" : "text/plain; charset=utf-8",
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
    "Content-Type": path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : "application/octet-stream",
  });
  createReadStream(path).pipe(res);
}

function collectAssets(script: any) {
  return (script.scenes || [])
    .filter((scene: any) => scene.asset?.image)
    .map((scene: any) => ({
      sceneId: scene.id,
      status: scene.asset.status,
      provider: scene.asset.provider,
      prompt: scene.asset.prompt,
      image: scene.asset.image,
    }));
}

function projectDir(id: string) {
  const safe = basename(id);
  if (safe !== id) throw new Error("invalid project id");
  return join(OUTPUT_DIR, safe);
}

async function readStatus(dir: string): Promise<StatusFile> {
  return JSON.parse(await readFile(join(dir, "status.json"), "utf8"));
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
    .badge.done { background:rgba(131,210,70,.16); color:var(--good); }
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
          <button class="secondary" id="assetBtn" disabled>Tạo ảnh local</button>
          <button class="secondary" id="aiAssetBtn" disabled>Tạo ảnh AI</button>
          <button class="secondary" id="saveBtn" disabled>Lưu script</button>
          <button id="renderBtn" disabled>Render</button>
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
          <strong>Scene Assets</strong>
          <span class="muted" id="assetCount">0 ảnh</span>
        </div>
        <div id="assets" class="assets"></div>
      </div>
      <div class="notice">
        Phase 1 tập trung vào lõi: storyboard, tạo ảnh từng cảnh, tạo clip ngắn theo scene và ghép thành video dưới 1 phút. Publisher Facebook/TikTok/YouTube chưa làm ở giai đoạn này.
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
      document.getElementById('renderBtn').disabled = false;
      document.getElementById('status').textContent = p.status;
      document.getElementById('status').className = 'badge ' + p.status;
      document.getElementById('video').src = p.files.video ? '/api/projects/' + id + '/files/video?ts=' + Date.now() : '';
      const duration = estimateDuration(p.script);
      document.getElementById('downloads').innerHTML = [
        '<span class="muted">Ước tính thoại: '+duration+'s / mục tiêu &lt; 60s</span>',
        p.files.video ? '<a href="/api/projects/'+id+'/files/video" target="_blank">Tải video.mp4</a>' : '<span class="muted">Chưa có video</span>',
        p.files.voice ? '<a href="/api/projects/'+id+'/files/voice" target="_blank">Tải voice.mp3</a>' : '',
        p.files.script ? '<a href="/api/projects/'+id+'/files/script" target="_blank">Tải script.txt</a>' : '',
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
    document.getElementById('renderBtn').onclick = async () => {
      if (!currentId) return;
      await api('/api/projects/' + currentId + '/render', { method:'POST', body:'{}' });
      poll();
    };
    async function poll() {
      if (!currentId) return;
      await loadProject(currentId);
      const s = document.getElementById('status').textContent;
      if (s === 'rendering' || s === 'queued') setTimeout(poll, 2500);
    }
    function renderAssets(assets) {
      document.getElementById('assetCount').textContent = assets.length + ' ảnh';
      document.getElementById('assets').innerHTML = assets.map(a => {
        const src = '/api/projects/' + currentId + '/' + a.image;
        return '<div class="asset"><img src="'+src+'" alt="'+escapeHtml(a.sceneId)+'"><div><strong>'+escapeHtml(a.sceneId)+'</strong><br>'+escapeHtml(a.prompt || '')+'</div></div>';
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
