import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function printHelp() {
  console.log(`GPT Image 2 router

Usage:
  node tools/gpt_image_2_router.mjs <provider> --prompt "your prompt" [options]

Providers:
  grsai   Calls the documented GRSAI generate endpoint.
  xstx    Calls an OpenAI-compatible images endpoint for XSTX.

Common options:
  --prompt <text>           Required prompt text
  --model <name>            Model name (default: gpt-image-2)
  --output-dir <path>       Output directory
  --image <path-or-url>     Reference image; can be repeated (GRSAI only)

GRSAI options:
  --aspect-ratio <value>    Aspect ratio or size, e.g. 16:9 or 1024x1024

XSTX options:
  --size <value>            Image size, e.g. 1024x1024
  --count <n>               Number of images
  --key-scope <value>       auto | default | 4k (XSTX only)
  --quality <value>         Quality hint when supported
  --background <value>      Background hint when supported
  --format <value>          Output format hint, e.g. png

Environment variables:
  GRSAI_API_KEY
  GRSAI_BASE_URL=https://grsaiapi.com
  GRSAI_GENERATE_PATH=/v1/api/generate
  GRSAI_REPLY_TYPE=json
  GRSAI_DEFAULT_ASPECT_RATIO=1024x1024
  GRSAI_OUTPUT_DIR=output_images/gpt_image_2_router/grsai

  XSTX_API_KEY
  XSTX_API_KEY_4K
  XSTX_API_BASE_URL=https://api.xstx.info/v1
  XSTX_IMAGES_PATH=/images/generations
  XSTX_DEFAULT_SIZE=1024x1024
  XSTX_DEFAULT_COUNT=1
  XSTX_DEFAULT_KEY_SCOPE=auto
  XSTX_OUTPUT_DIR=output_images/gpt_image_2_router/xstx
`);
}

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    if (Object.hasOwn(args, key)) {
      if (!Array.isArray(args[key])) {
        args[key] = [args[key]];
      }
      args[key].push(next);
    } else {
      args[key] = next;
    }
    index += 1;
  }

  return args;
}

function getString(args, key, fallback) {
  const value = args[key];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return value ?? fallback;
}

function getList(args, key) {
  const value = args[key];
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function sanitizeSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function timestampStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toAbsoluteProjectPath(inputPath) {
  if (!inputPath) {
    return null;
  }
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(projectRoot, inputPath);
}

function buildUrl(baseUrl, pathname) {
  const cleanBase = String(baseUrl).replace(/\/+$/, "");
  const cleanPath = String(pathname).startsWith("/") ? pathname : `/${pathname}`;
  return `${cleanBase}${cleanPath}`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function fileOrUrlToApiValue(item) {
  if (/^https?:\/\//i.test(item)) {
    return item;
  }
  const absolutePath = toAbsoluteProjectPath(item);
  const buffer = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath).toLowerCase();
  const mimeMap = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  const mime = mimeMap[ext] ?? "application/octet-stream";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function requestJson({ url, apiKey, body, extraHeaders = {} }) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!response.ok) {
    const detail = parsed?.error?.message || parsed?.error || parsed?.message || text;
    throw new Error(`Request failed (${response.status}): ${detail}`);
  }

  return parsed;
}

function isLikely4kSize(size) {
  if (!size) {
    return false;
  }

  const normalized = String(size).trim().toLowerCase();
  if (normalized.includes("4k")) {
    return true;
  }

  const match = normalized.match(/^(\d+)\s*x\s*(\d+)$/);
  if (!match) {
    return false;
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  return Math.max(width, height) >= 2160;
}

function resolveXstxApiKey({ size, keyScope }) {
  const requestedScope = String(keyScope || process.env.XSTX_DEFAULT_KEY_SCOPE || "auto").toLowerCase();
  const defaultKey = process.env.XSTX_API_KEY;
  const fourKKey = process.env.XSTX_API_KEY_4K;

  if (requestedScope === "4k") {
    if (!fourKKey) {
      throw new Error("Missing XSTX_API_KEY_4K in environment.");
    }
    return { apiKey: fourKKey, selectedScope: "4k" };
  }

  if (requestedScope === "default") {
    if (!defaultKey) {
      throw new Error("Missing XSTX_API_KEY in environment.");
    }
    return { apiKey: defaultKey, selectedScope: "default" };
  }

  if (isLikely4kSize(size) && fourKKey) {
    return { apiKey: fourKKey, selectedScope: "4k" };
  }

  if (!defaultKey) {
    throw new Error("Missing XSTX_API_KEY in environment.");
  }

  return { apiKey: defaultKey, selectedScope: "default" };
}

function collectImageResults(provider, payload) {
  const resultItems = [];

  if (Array.isArray(payload?.results)) {
    for (const item of payload.results) {
      if (item?.url) {
        resultItems.push({ type: "url", value: item.url });
      } else if (item?.b64_json) {
        resultItems.push({ type: "b64", value: item.b64_json });
      }
    }
  }

  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) {
      if (item?.url) {
        resultItems.push({ type: "url", value: item.url });
      } else if (item?.b64_json) {
        resultItems.push({ type: "b64", value: item.b64_json });
      }
    }
  }

  if (provider === "grsai" && payload?.status && payload.status !== "succeeded") {
    console.warn(`GRSAI task status: ${payload.status}`);
  }

  return resultItems;
}

async function downloadUrlImage(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
}

async function writeResults({ provider, model, outputDir, payload }) {
  await ensureDir(outputDir);

  const results = collectImageResults(provider, payload);
  const metadataPath = path.join(
    outputDir,
    `${sanitizeSegment(provider)}__${sanitizeSegment(model)}__${timestampStamp()}__response.json`,
  );
  await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2), "utf8");

  if (!results.length) {
    console.log(`No immediate image payload found. Raw response saved to ${metadataPath}`);
    return;
  }

  const savedFiles = [];
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index];
    const fileBase = `${sanitizeSegment(provider)}__${sanitizeSegment(model)}__${timestampStamp()}__${String(index + 1).padStart(2, "0")}`;
    if (item.type === "url") {
      const urlObject = new URL(item.value);
      const ext = path.extname(urlObject.pathname) || ".png";
      const filePath = path.join(outputDir, `${fileBase}${ext}`);
      await downloadUrlImage(item.value, filePath);
      savedFiles.push(filePath);
      continue;
    }

    const filePath = path.join(outputDir, `${fileBase}.png`);
    await fs.writeFile(filePath, Buffer.from(item.value, "base64"));
    savedFiles.push(filePath);
  }

  console.log("Saved files:");
  for (const savedFile of savedFiles) {
    console.log(`- ${savedFile}`);
  }
  console.log(`Response metadata: ${metadataPath}`);
}

async function runGrsai(args) {
  const apiKey = process.env.GRSAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GRSAI_API_KEY in environment.");
  }

  const prompt = getString(args, "prompt");
  if (!prompt) {
    throw new Error("Missing required --prompt.");
  }

  const model = getString(args, "model", "gpt-image-2");
  const aspectRatio = getString(
    args,
    "aspect-ratio",
    process.env.GRSAI_DEFAULT_ASPECT_RATIO || "1024x1024",
  );
  const references = getList(args, "image");
  const images = [];
  for (const item of references) {
    images.push(await fileOrUrlToApiValue(item));
  }

  const baseUrl = getString(args, "base-url", process.env.GRSAI_BASE_URL || "https://grsaiapi.com");
  const requestUrl = buildUrl(baseUrl, process.env.GRSAI_GENERATE_PATH || "/v1/api/generate");
  const replyType = process.env.GRSAI_REPLY_TYPE || "json";
  const outputDir = toAbsoluteProjectPath(
    getString(args, "output-dir", process.env.GRSAI_OUTPUT_DIR || "output_images/gpt_image_2_router/grsai"),
  );

  const payload = await requestJson({
    url: requestUrl,
    apiKey,
    body: {
      model,
      prompt,
      images,
      aspectRatio,
      replyType,
    },
  });

  await writeResults({ provider: "grsai", model, outputDir, payload });
}

async function runXstx(args) {
  const prompt = getString(args, "prompt");
  if (!prompt) {
    throw new Error("Missing required --prompt.");
  }

  const references = getList(args, "image");
  if (references.length) {
    console.warn("XSTX compatibility mode ignores --image because the image edit endpoint is not configured.");
  }

  const model = getString(args, "model", "gpt-image-2");
  const size = getString(args, "size", process.env.XSTX_DEFAULT_SIZE || "1024x1024");
  const keyScope = getString(args, "key-scope", process.env.XSTX_DEFAULT_KEY_SCOPE || "auto");
  const count = Number.parseInt(
    getString(args, "count", process.env.XSTX_DEFAULT_COUNT || "1"),
    10,
  );
  const { apiKey, selectedScope } = resolveXstxApiKey({ size, keyScope });
  const baseUrl = getString(args, "base-url", process.env.XSTX_API_BASE_URL || "https://api.xstx.info/v1");
  const requestUrl = buildUrl(baseUrl, process.env.XSTX_IMAGES_PATH || "/images/generations");
  const outputDir = toAbsoluteProjectPath(
    getString(args, "output-dir", process.env.XSTX_OUTPUT_DIR || "output_images/gpt_image_2_router/xstx"),
  );

  const body = {
    model,
    prompt,
    size,
    n: Number.isFinite(count) && count > 0 ? count : 1,
  };

  const quality = getString(args, "quality");
  if (quality) {
    body.quality = quality;
  }

  const background = getString(args, "background");
  if (background) {
    body.background = background;
  }

  const outputFormat = getString(args, "format");
  if (outputFormat) {
    body.output_format = outputFormat;
  }

  const payload = await requestJson({
    url: requestUrl,
    apiKey,
    body,
  });

  console.log(`XSTX key scope: ${selectedScope}`);
  await writeResults({ provider: "xstx", model, outputDir, payload });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args._[0];

  if (!provider || args.help || args.h) {
    printHelp();
    return;
  }

  if (provider === "grsai") {
    await runGrsai(args);
    return;
  }

  if (provider === "xstx") {
    await runXstx(args);
    return;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
