import axios from "axios";
import { writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

export interface FetchResult {
  success: boolean;
  path?: string;
  reason?: string;
}

export async function fetchImage(url: string | null, outPath: string): Promise<FetchResult> {
  // IDEMPOTENT: if the image already exists at outPath, reuse it.
  // This lets users pre-place generated images (e.g. from AI image generation)
  // and skip the download step.
  if (existsSync(outPath)) {
    return { success: true, path: outPath };
  }

  if (!url) return { success: false, reason: "no url provided (null)" };

  // Support local file paths (absolute path or file:// URL)
  const localPath = url.startsWith("file://") ? url.slice(7) : null;
  if (localPath || (url.startsWith("/") && existsSync(url))) {
    try {
      const src = localPath ?? url;
      await mkdir(dirname(outPath), { recursive: true });
      await copyFile(src, outPath);
      return { success: true, path: outPath };
    } catch (e: any) {
      return { success: false, reason: `local file copy failed: ${e.message}` };
    }
  }

  try {
    const resp = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      validateStatus: (s) => s < 400,
    });

    const ct = String(resp.headers["content-type"] ?? "");
    if (!ct.startsWith("image/")) {
      return { success: false, reason: `non-image content-type: ${ct}` };
    }

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(resp.data));
    return { success: true, path: outPath };
  } catch (e: any) {
    const status = e.response?.status;
    return { success: false, reason: status ? `http ${status}` : String(e.message ?? e) };
  }
}
