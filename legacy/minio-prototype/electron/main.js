import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../src/config.js";
import { startServer } from "../src/server.js";
import { normalizeFixtureJson } from "../src/services/ingestService.js";
import { S3Client } from "../src/storage/s3Client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeConfig = getConfig();
const DEFAULT_API_BASE_URL = process.env.VIEWER_API_BASE_URL || `http://127.0.0.1:${runtimeConfig.appPort}`;

let mainWindow = null;
let backendRuntime = null;
let apiBaseUrl = DEFAULT_API_BASE_URL;
let backendStartupPromise = startBackend().catch((error) => {
  console.error("Failed to start embedded backend:", error);
  throw error;
});
const viewerClient = new S3Client({
  endpoint: runtimeConfig.minioEndpoint,
  accessKey: runtimeConfig.minioAccessKey,
  secretKey: runtimeConfig.minioSecretKey,
  region: runtimeConfig.region
});
const bucketCache = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#f4efe6",
    title: "MinIO Image Viewer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(async () => {
  try {
    await backendStartupPromise;
  } catch {
    app.quit();
    return;
  }

  ipcMain.handle("viewer:get-config", () => ({
    apiBaseUrl,
    defaultBucket: runtimeConfig.minioBucket
  }));

  ipcMain.handle("viewer:set-config", (_event, nextConfig) => {
    if (nextConfig?.apiBaseUrl) {
      apiBaseUrl = String(nextConfig.apiBaseUrl).replace(/\/$/, "");
    }
    return { apiBaseUrl };
  });

  ipcMain.handle("viewer:list-buckets", async () => {
    const buckets = await loadVisibleBuckets();
    return {
      buckets
    };
  });

  ipcMain.handle("viewer:list-files", async (_event, payload = {}) => {
    const bucket = requireBucketName(payload.bucket);
    const snapshot = await loadBucketSnapshot(bucket, Boolean(payload.refresh));
    return {
      bucket,
      updatedAt: snapshot.updatedAt,
      total: snapshot.items.length,
      items: snapshot.items
    };
  });

  ipcMain.handle("viewer:get-details", async (_event, payload) => {
    const { bucket, id } = normalizeDetailPayload(payload);
    try {
      return await getDetailedRecord(bucket, id);
    } catch (error) {
      return {
        ok: false,
        bucket,
        id,
        error: error.message
      };
    }
  });

  ipcMain.handle("viewer:list-images", async (_event, params = {}) => {
    const baseUrl = resolveApiBaseUrl(params.apiBaseUrl);
    const page = clampInteger(params.page ?? 1, 1, 1_000_000);
    const pageSize = clampInteger(params.pageSize ?? 50, 1, 500);
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return fetchJson(`${baseUrl}/images/search?${query.toString()}`);
  });

  ipcMain.handle("viewer:get-image-data-url", async (_event, payload) => {
    const { bucket, id } = normalizeDetailPayload(payload);
    return getImageDataUrl(bucket, id);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    closeBackend();
    app.quit();
  }
});

app.on("before-quit", () => {
  closeBackend();
});

function resolveApiBaseUrl(overrideBaseUrl) {
  return String(overrideBaseUrl || apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

function normalizeDetailPayload(payload) {
  if (typeof payload === "string") {
    return { bucket: runtimeConfig.minioBucket, id: payload };
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("id is required");
  }
  if (!payload.id) {
    throw new Error("id is required");
  }
  return {
    bucket: payload.bucket ? String(payload.bucket) : runtimeConfig.minioBucket,
    id: String(payload.id),
    apiBaseUrl: payload.apiBaseUrl
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchImageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

function clampInteger(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
}

async function startBackend() {
  backendRuntime = await startServer(runtimeConfig);
  apiBaseUrl = backendRuntime.baseUrl;
  return backendRuntime;
}

function closeBackend() {
  if (backendRuntime?.server) {
    backendRuntime.server.close();
    backendRuntime = null;
  }
}

function requireBucketName(bucket) {
  if (!bucket || typeof bucket !== "string") {
    throw new Error("bucket is required");
  }
  return bucket;
}

async function loadBucketSnapshot(bucket, refresh = false) {
  const visible = await ensureBucketVisible(bucket);
  if (!visible) {
    throw new Error("Bucket not found");
  }

  if (!refresh && bucketCache.has(bucket)) {
    return bucketCache.get(bucket);
  }

  const manifest = await viewerClient.getJson(bucket, "manifests/catalog.json");
  const manifestItems = manifest?.items ? Object.values(manifest.items) : [];
  if (manifestItems.length > 0) {
    manifestItems.sort((a, b) => {
      const left = String(a.baseName || a.id || "");
      const right = String(b.baseName || b.id || "");
      return left.localeCompare(right);
    });

    const snapshot = {
      bucket,
      mode: "record",
      updatedAt: manifest?.updatedAt || null,
      items: manifestItems
    };
    bucketCache.set(bucket, snapshot);
    return snapshot;
  }

  const nativeItems = await loadNativeBucketItems(bucket);
  nativeItems.sort((a, b) => {
    const left = String(a.baseName || a.id || "");
    const right = String(b.baseName || b.id || "");
    return left.localeCompare(right);
  });

  const snapshot = {
    bucket,
    mode: "native",
    updatedAt: manifest?.updatedAt || null,
    items: nativeItems
  };
  bucketCache.set(bucket, snapshot);
  return snapshot;
}

async function loadVisibleBuckets() {
  const buckets = await viewerClient.listBuckets();
  const sorted = buckets.sort((a, b) => a.name.localeCompare(b.name));
  const enriched = await Promise.all(sorted.map(async (bucket) => {
    const visible = await ensureBucketVisible(bucket.name);
    if (!visible) {
      return null;
    }
    return {
      ...bucket,
      ...describeBucket(bucket.name)
    };
  }));

  return enriched.filter(Boolean);
}

async function ensureBucketVisible(bucket) {
  const exists = await viewerClient.bucketExists(bucket).catch(() => false);
  if (!exists) {
    bucketCache.delete(bucket);
  }
  return exists;
}

function describeBucket(bucketName) {
  const normalized = String(bucketName || "");
  const isDefaultBucket = normalized === runtimeConfig.minioBucket;
  const isRecordBucket = /(^|-)record(-|$)/i.test(normalized) || normalized.includes("record-json");
  const isNativeBucket = /(^|-)native(-|$)/i.test(normalized);
  const isBenchmarkBucket =
    normalized.includes("bench") || normalized.includes("cmp") || normalized.includes("performance");
  const isPairsBucket = normalized === "pairs" || normalized.startsWith("pairs-");
  const isTestBucket = normalized.includes("test") || normalized.includes("fixture");

  if (isDefaultBucket) {
    return {
      bucketKind: "default",
      bucketSummary: "현재 API가 쓰는 기본 저장 버킷",
      bucketDetails: "이미지 + 원본 JSON + record/manifest"
    };
  }

  if (isRecordBucket) {
    return {
      bucketKind: "record",
      bucketSummary: "이미지 + 원본 JSON + record/manifest",
      bucketDetails: "검색은 manifest, 상세는 record 파일로 조회"
    };
  }

  if (isNativeBucket) {
    return {
      bucketKind: "native",
      bucketSummary: "이미지 + MinIO metadata/tags",
      bucketDetails: "JSON 파일이 아니라 객체 자체의 metadata/tags를 사용"
    };
  }

  if (isBenchmarkBucket) {
    return {
      bucketKind: "benchmark",
      bucketSummary: "성능 비교/측정용 버킷",
      bucketDetails: "record 방식과 native 방식의 조회 성능 비교"
    };
  }

  if (isPairsBucket) {
    return {
      bucketKind: "pairs",
      bucketSummary: "이미지와 설명 JSON을 함께 다루는 샘플 버킷",
      bucketDetails: "실험용 원본 데이터셋"
    };
  }

  if (isTestBucket) {
    return {
      bucketKind: "test",
      bucketSummary: "검증/테스트용 버킷",
      bucketDetails: "임시 데이터와 smoke test 결과"
    };
  }

  return {
    bucketKind: "general",
    bucketSummary: "일반 객체 저장 버킷",
    bucketDetails: "형식이 정해지지 않은 MinIO 저장소"
  };
}

async function getDetailedRecord(bucket, id) {
  const snapshot = await loadBucketSnapshot(bucket);
  const item = snapshot.items.find((entry) => entry.id === id);
  const recordKey = item?.recordKey || `records/${id}.json`;
  const record = await viewerClient.getJson(bucket, recordKey);
  if (record) {
    return {
      bucket,
      ok: true,
      source: "record",
      ...record
    };
  }

  const rawJsonKey = item?.rawJsonKey || `raw-json/${id}.json`;
  const rawJson = await viewerClient.getJson(bucket, rawJsonKey);
  if (rawJson) {
    const normalized = normalizeFixtureJson(rawJson);
    return {
      bucket,
      ok: true,
      source: "raw-json",
      id,
      baseName: item?.baseName || id,
      imageKey: item?.imageKey || `images/${id}.png`,
      rawJsonKey,
      recordKey,
      meta: normalized.meta,
      tag: normalized.tag
    };
  }

  if (item?.imageKey || snapshot.mode === "native") {
    const imageKey = item?.imageKey || `images/${id}.png`;
    const [headers, tags] = await Promise.all([
      viewerClient.headObjectHeaders(bucket, imageKey),
      viewerClient.getObjectTagging(bucket, imageKey)
    ]);
    if (headers || tags) {
      const meta = extractNativeMetadata(headers);
      return {
        bucket,
        ok: true,
        source: "native",
        id,
        baseName: item?.baseName || id,
        imageKey,
        rawJsonKey: item?.rawJsonKey || null,
        recordKey: item?.recordKey || null,
        meta,
        tag: tags || {}
      };
    }
  }

  if (item) {
    return {
      bucket,
      ok: false,
      source: snapshot.mode || "manifest",
      id,
      baseName: item.baseName,
      imageKey: item.imageKey,
      rawJsonKey: item.rawJsonKey,
      recordKey,
      meta: {
        productNo: item.productNo,
        capturedAt: item.capturedAt
      },
      tag: {
        aiResult: item.aiResult,
        threshold: item.threshold
      },
      error: "Record and raw JSON are missing"
    };
  }

  throw new Error("Record not found");
}

async function getImageDataUrl(bucket, id) {
  const snapshot = await loadBucketSnapshot(bucket);
  const item = snapshot.items.find((entry) => entry.id === id);
  const imageKey = item?.imageKey || `images/${id}.png`;
  const image = await viewerClient.getNodeStream(bucket, imageKey);
  if (!image) {
    throw new Error("Image not found");
  }
  const contentType = image.headers.get("content-type") || "image/png";
  const chunks = [];
  for await (const chunk of image.stream) {
    chunks.push(Buffer.from(chunk));
  }
  const base64 = Buffer.concat(chunks).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function loadNativeBucketItems(bucket) {
  const items = [];
  let continuationToken = null;

  while (true) {
    const result = await viewerClient.listObjects(bucket, {
      prefix: "images/",
      ...(continuationToken ? { continuationToken } : {})
    });

    for (const key of result.keys || []) {
      if (!key.endsWith(".png")) {
        continue;
      }
      const id = key.replace(/^images\//, "").replace(/\.png$/i, "");
      items.push({
        id,
        baseName: deriveBaseNameFromImageKey(key),
        imageKey: key,
        rawJsonKey: null,
        recordKey: null,
        source: "native"
      });
    }

    if (!result.isTruncated || !result.nextContinuationToken) {
      break;
    }
    continuationToken = result.nextContinuationToken;
  }

  return items;
}

function deriveBaseNameFromImageKey(imageKey) {
  const fileName = String(imageKey).split("/").pop() || imageKey;
  return fileName.replace(/\.png$/i, "");
}

function extractNativeMetadata(headers) {
  if (!headers) {
    return {};
  }

  const meta = {};
  for (const [key, value] of headers.entries()) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("x-amz-meta-")) {
      const metaKey = normalized.slice("x-amz-meta-".length);
      meta[metaKey] = value;
    }
  }
  return meta;
}
