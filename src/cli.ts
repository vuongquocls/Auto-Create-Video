#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });

import { runPipeline, type PipelineOptions } from "./pipeline.js";
import { log } from "./utils/logger.js";

async function main() {
  const args = process.argv.slice(2);
  const scriptPath = args.find((arg) => !arg.startsWith("--"));
  if (!scriptPath) {
    console.error("Usage: npm run pipeline -- <path/to/script.json> [--approved-assets] [--prepare-assets]");
    process.exit(2);
  }
  const options: PipelineOptions = {
    assetsApproved: args.includes("--approved-assets"),
    prepareAssetsOnly: args.includes("--prepare-assets"),
  };
  try {
    await runPipeline(scriptPath, options);
  } catch (e) {
    log.error("Pipeline failed", e);
    process.exit(1);
  }
}

main();
