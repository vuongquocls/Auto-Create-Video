#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });

import { resolve } from "node:path";
import { publishProject, type PublishPlatform } from "./publisher.js";

const VALID_PLATFORMS = new Set(["dry-run", "webhook", "facebook", "youtube", "tiktok"]);

async function main() {
  const args = process.argv.slice(2);
  const projectDir = args.find((arg) => !arg.startsWith("--"));
  if (!projectDir) {
    console.error("Usage: npm run publish -- output/<project> [--platforms dry-run,webhook,facebook,youtube,tiktok] [--caption \"...\"] [--dry-run]");
    process.exit(2);
  }

  const platforms = parsePlatforms(valueAfter(args, "--platforms") || process.env.AUTO_PUBLISH_PLATFORMS || "dry-run");
  const caption = valueAfter(args, "--caption");
  const run = await publishProject({
    projectDir: resolve(projectDir),
    platforms,
    caption,
    dryRun: args.includes("--dry-run"),
  });

  console.log(JSON.stringify(run, null, 2));
  if (run.results.some((result) => result.status === "failed")) process.exit(1);
}

function parsePlatforms(value: string): PublishPlatform[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean).map((platform) => {
    if (!VALID_PLATFORMS.has(platform)) {
      throw new Error(`Invalid platform "${platform}". Valid platforms: ${Array.from(VALID_PLATFORMS).join(", ")}`);
    }
    return platform as PublishPlatform;
  });
}

function valueAfter(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0) return args[idx + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
