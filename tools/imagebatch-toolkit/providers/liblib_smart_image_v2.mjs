import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import crypto from "node:crypto";

import dotenv from "dotenv";

dotenv.config();

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function requireEnv(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected integer value, got: ${value}`);
  }
  return parsed;
}

function buildSignedUrl(baseUrl, endpointPath) {
  const accessKey = requireEnv("LIBLIB_ACCESS_KEY");
  const secretKey = requireEnv("LIBLIB_SECRET_KEY");
  const normalizedBaseUrl = requireEnv("LIBLIB_API_BASE_URL", baseUrl).replace(/\/+$/, "");
  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const url = `${normalizedBaseUrl}${normalizedPath}`;
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(12).toString("hex");
  const raw = `${url}&${timestamp}&${nonce}`;
  const signature = crypto
    .createHmac("sha1", secretKey)
    .update(raw)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const signedUrl = new URL(url);
  signedUrl.searchParams.set("AccessKey", accessKey);
  signedUrl.searchParams.set("Signature", signature);
  signedUrl.searchParams.set("Timestamp", timestamp);
  signedUrl.searchParams.set("SignatureNonce", nonce);
  return signedUrl.toString();
}

async function callLiblib(path, body) {
  const url = buildSignedUrl(process.env.LIBLIB_API_BASE_URL, path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON response (${response.status}): ${text}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  if (typeof data.code === "number" && data.code !== 0) {
    throw new Error(`Liblib API error: ${JSON.stringify(data)}`);
  }

  return data;
}

function parseArgs(argv) {
  const result = {
    _: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        result[key] = true;
      } else {
        result[key] = next;
        index += 1;
      }
      continue;
    }
    result._.push(token);
  }

  return result;
}

function getGeneratePaths() {
  return {
    listModels: process.env.LIBLIB_LIST_MODELS_PATH || "/api/model/getByVersionUuid",
    text2img: process.env.LIBLIB_TEXT2IMG_PATH || "/api/generate/webui/text2img",
    status: process.env.LIBLIB_STATUS_PATH || "/api/generate/webui/status",
  };
}

async function listModelVersion() {
  const { listModels } = getGeneratePaths();
  const versionUuid = requireEnv("LIBLIB_SMART_IMAGE_V2_VERSION_UUID");
  const response = await callLiblib(listModels, {
    version_uuid: versionUuid,
  });
  console.log(JSON.stringify(response, null, 2));
}

function buildText2ImgBody(args) {
  const templateUuid = process.env.LIBLIB_SMART_IMAGE_V2_TEMPLATE_UUID;
  const checkPointId = process.env.LIBLIB_SMART_IMAGE_V2_CHECKPOINT_ID;
  const prompt = args.prompt || args.p;
  if (!prompt) {
    throw new Error("Missing required argument: --prompt");
  }

  const width = optionalInt(args.width, optionalInt(process.env.LIBLIB_DEFAULT_WIDTH, 1024));
  const height = optionalInt(args.height, optionalInt(process.env.LIBLIB_DEFAULT_HEIGHT, 1024));
  const imgCount = optionalInt(args.count, optionalInt(process.env.LIBLIB_DEFAULT_IMG_COUNT, 1));
  const steps = optionalInt(args.steps, process.env.LIBLIB_DEFAULT_STEPS ? optionalInt(process.env.LIBLIB_DEFAULT_STEPS) : undefined);
  const seed = args.seed !== undefined ? optionalInt(args.seed, undefined) : undefined;
  const sampler = args.sampler !== undefined ? optionalInt(args.sampler, undefined) : undefined;
  const cfgScale =
    args.cfg !== undefined
      ? Number.parseFloat(String(args.cfg))
      : process.env.LIBLIB_DEFAULT_CFG_SCALE
        ? Number.parseFloat(process.env.LIBLIB_DEFAULT_CFG_SCALE)
        : undefined;

  const negativePrompt = args.negative || process.env.LIBLIB_DEFAULT_NEGATIVE_PROMPT;

  const generateParams = {
    prompt,
    width,
    height,
    imgCount,
  };

  if (checkPointId) {
    generateParams.checkPointId = checkPointId;
  }
  if (negativePrompt) {
    generateParams.negativePrompt = negativePrompt;
  }
  if (steps !== undefined) {
    generateParams.steps = steps;
  }
  if (seed !== undefined) {
    generateParams.seed = seed;
  }
  if (sampler !== undefined) {
    generateParams.sampler = sampler;
  }
  if (cfgScale !== undefined && !Number.isNaN(cfgScale)) {
    generateParams.cfgScale = cfgScale;
  }

  const body = { generateParams };
  if (templateUuid) {
    body.templateUuid = templateUuid;
  }
  return body;
}

async function submitText2Img(args) {
  const { text2img } = getGeneratePaths();
  const response = await callLiblib(text2img, buildText2ImgBody(args));
  const generateUuid = response?.data?.generateUuid;
  if (!generateUuid) {
    throw new Error(`Missing generateUuid in response: ${JSON.stringify(response)}`);
  }
  return response;
}

async function pollUntilDone(generateUuid, pollMs, timeoutMs) {
  const { status } = getGeneratePaths();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const response = await callLiblib(status, { generateUuid });
    const payload = response?.data ?? {};
    const statusCode = payload.generateStatus;
    if (statusCode === 5 || statusCode === 6) {
      return response;
    }
    if (statusCode === 7 || statusCode === -1) {
      throw new Error(`Generation failed: ${JSON.stringify(response)}`);
    }
    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for generation result: ${generateUuid}`);
}

async function saveImages(result, outputDir) {
  const images = result?.data?.images ?? [];
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error(`No images found in result: ${JSON.stringify(result)}`);
  }

  mkdirSync(outputDir, { recursive: true });
  const savedFiles = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const imageUrl = image?.imageUrl;
    if (!imageUrl) {
      continue;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image ${imageUrl}: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const ext = imageUrl.includes(".jpg") || imageUrl.includes(".jpeg") ? "jpg" : "png";
    const filePath = resolve(outputDir, `liblib-smart-image-v2-${index + 1}.${ext}`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, Buffer.from(arrayBuffer));
    savedFiles.push(filePath);
  }

  return savedFiles;
}

function printUsage() {
  console.log(`Usage:
  node tools/liblib_smart_image_v2.mjs list-model
  node tools/liblib_smart_image_v2.mjs generate --prompt "..." [--width 1024 --height 1024 --count 1]

Environment:
  LIBLIB_ACCESS_KEY
  LIBLIB_SECRET_KEY
  LIBLIB_API_BASE_URL
  LIBLIB_SMART_IMAGE_V2_TEMPLATE_UUID
  LIBLIB_SMART_IMAGE_V2_CHECKPOINT_ID
  LIBLIB_SMART_IMAGE_V2_VERSION_UUID`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "list-model") {
    await listModelVersion();
    return;
  }

  if (command === "generate") {
    const submitResponse = await submitText2Img(args);
    const generateUuid = submitResponse.data.generateUuid;
    const pollMs = optionalInt(args["poll-ms"], optionalInt(process.env.LIBLIB_POLL_INTERVAL_MS, 5000));
    const timeoutMs = optionalInt(args["timeout-ms"], optionalInt(process.env.LIBLIB_TIMEOUT_MS, 300000));
    const outputDir = resolve(args.output || process.env.LIBLIB_OUTPUT_DIR || "output_images/liblib_smart_image_v2");

    console.log(`Submitted generateUuid: ${generateUuid}`);
    const result = await pollUntilDone(generateUuid, pollMs, timeoutMs);
    const savedFiles = await saveImages(result, outputDir);
    console.log(JSON.stringify({ generateUuid, savedFiles, result: result.data }, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
