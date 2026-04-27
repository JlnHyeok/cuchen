import fs from "node:fs/promises";
import path from "node:path";
import { createStableId } from "../utils/hash.js";

const META_PRODUCT_KEYS = ["productno", "productnumber", "sku", "제품번호", "품번"];
const META_CAPTURED_AT_KEYS = ["capturedat", "captured_at", "shotat", "shot_at", "촬영일시", "촬영시간"];
const TAG_AI_RESULT_KEYS = ["airesult", "inspectionresult", "result", "판정결과", "ai판정결과", "검사결과"];
const TAG_THRESHOLD_KEYS = ["threshold", "inspectionthreshold", "임계치", "검사시임계치", "검사임계치"];
const TAG_KEYWORDS = [
  "ai",
  "result",
  "threshold",
  "score",
  "confidence",
  "judge",
  "status",
  "inspect",
  "판정",
  "임계",
  "검사"
];

export class IngestService {
  constructor({ store, concurrency = 8 }) {
    this.store = store;
    this.concurrency = concurrency;
    this.manifest = createEmptyManifest();
  }

  async init() {
    await this.store.init();
    const manifest = await this.store.loadManifest();
    this.manifest = manifest && manifest.version === 1 ? manifest : createEmptyManifest();
  }

  async ingestDirectory(inputDir) {
    const scan = await scanInputDirectory(inputDir);
    const outcomes = await asyncPool(this.concurrency, scan.pairs, (pair) => this.ingestPair(pair));
    let uploaded = 0;
    let updated = 0;
    let failed = 0;

    for (const outcome of outcomes) {
      if (outcome.status === "uploaded") {
        uploaded += 1;
      } else if (outcome.status === "updated") {
        updated += 1;
      } else {
        failed += 1;
      }
    }

    this.manifest.updatedAt = new Date().toISOString();
    this.manifest.count = Object.keys(this.manifest.items).length;
    await this.store.saveManifest(this.manifest);

    return {
      inputDir,
      processed: scan.pairs.length,
      uploaded,
      updated,
      skipped: scan.orphans.length,
      failed,
      orphanBases: scan.orphans
    };
  }

  async ingestPair(pair) {
    try {
      const [imageBuffer, rawJsonBuffer] = await Promise.all([
        fs.readFile(pair.imagePath),
        fs.readFile(pair.jsonPath)
      ]);

      const parsed = JSON.parse(rawJsonBuffer.toString("utf8"));
      const normalized = normalizeFixtureJson(parsed);
      const id = createStableId(pair.baseName, imageBuffer, rawJsonBuffer);
      const imageKey = `images/${id}.png`;
      const rawJsonKey = `raw-json/${id}.json`;
      const recordKey = `records/${id}.json`;
      const existed = await this.store.recordExists(recordKey);
      const record = {
        id,
        baseName: pair.baseName,
        imageKey,
        rawJsonKey,
        recordKey,
        sourcePath: pair.imagePath,
        meta: normalized.meta,
        tag: normalized.tag
      };

      await Promise.all([
        this.store.putImage(imageKey, imageBuffer),
        this.store.putRawJson(rawJsonKey, rawJsonBuffer),
        this.store.putRecord(recordKey, record)
      ]);

      this.manifest.items[id] = toManifestEntry(record);
      return { status: existed ? "updated" : "uploaded", id };
    } catch (error) {
      return { status: "failed", baseName: pair.baseName, error: error.message };
    }
  }

  async getRecord(id) {
    const entry = this.manifest.items[id];
    if (!entry) {
      return null;
    }
    return this.store.getRecord(entry.recordKey);
  }

  async getImage(id) {
    const entry = this.manifest.items[id];
    if (!entry) {
      return null;
    }
    return this.store.getImage(entry.imageKey);
  }

  search(filters = {}) {
    const items = Object.values(this.manifest.items);
    const filtered = items.filter((item) => matchesFilters(item, filters));
    const page = Math.max(1, Number.parseInt(filters.page || "1", 10));
    const pageSize = Math.max(1, Math.min(500, Number.parseInt(filters.pageSize || "50", 10)));
    const start = (page - 1) * pageSize;
    return {
      total: filtered.length,
      page,
      pageSize,
      items: filtered.slice(start, start + pageSize)
    };
  }

  getManifestStats() {
    return {
      count: this.manifest.count,
      updatedAt: this.manifest.updatedAt
    };
  }
}

export async function scanInputDirectory(inputDir) {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  const files = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext !== ".png" && ext !== ".json") {
      continue;
    }
    const baseName = path.basename(entry.name, ext);
    const current = files.get(baseName) || {};
    current[ext] = path.join(inputDir, entry.name);
    files.set(baseName, current);
  }

  const pairs = [];
  const orphans = [];
  for (const [baseName, fileSet] of files.entries()) {
    if (fileSet[".png"] && fileSet[".json"]) {
      pairs.push({
        baseName,
        imagePath: fileSet[".png"],
        jsonPath: fileSet[".json"]
      });
    } else {
      orphans.push(baseName);
    }
  }

  pairs.sort((a, b) => a.baseName.localeCompare(b.baseName));
  orphans.sort();
  return { pairs, orphans };
}

export function normalizeFixtureJson(value) {
  if (!value || typeof value !== "object") {
    throw new Error("JSON payload must be an object");
  }

  const extracted = hasLegacyGroups(value) ? extractFromLegacyGroups(value) : extractFromFlatJson(value);
  const capturedAt = new Date(extracted.meta.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) {
    throw new Error("capturedAt must be a valid timestamp");
  }

  const tagResult = getTagResultValue(extracted.tag);
  const threshold = Number(getTagThresholdValue(extracted.tag));
  if (!Number.isFinite(threshold)) {
    throw new Error("threshold must be numeric");
  }
  if (tagResult === undefined || tagResult === null || tagResult === "") {
    throw new Error("aiResult/result must be present");
  }

  return {
    meta: {
      ...extracted.meta,
      productNo: String(extracted.meta.productNo),
      capturedAt: capturedAt.toISOString()
    },
    tag: {
      ...extracted.tag,
      threshold
    }
  };
}

function hasLegacyGroups(value) {
  return Boolean(value.meta && typeof value.meta === "object" && value.tag && typeof value.tag === "object");
}

function extractFromLegacyGroups(value) {
  return {
    meta: { ...value.meta },
    tag: { ...value.tag }
  };
}

function extractFromFlatJson(value) {
  const entries = Object.entries(value);
  const consumedKeys = new Set();

  const productNo = pickRequiredField(entries, META_PRODUCT_KEYS, consumedKeys, "productNo");
  const capturedAt = pickRequiredField(entries, META_CAPTURED_AT_KEYS, consumedKeys, "capturedAt");
  const aiResult = pickRequiredField(entries, TAG_AI_RESULT_KEYS, consumedKeys, "aiResult");
  const threshold = pickRequiredField(entries, TAG_THRESHOLD_KEYS, consumedKeys, "threshold");

  const meta = { productNo: productNo.value, capturedAt: capturedAt.value };
  const tag = { [aiResult.key]: aiResult.value, [threshold.key]: threshold.value };

  for (const [key, rawValue] of entries) {
    if (consumedKeys.has(key)) {
      continue;
    }
    if (rawValue === undefined) {
      continue;
    }

    if (isTagLikeKey(key)) {
      tag[key] = rawValue;
    } else {
      meta[key] = rawValue;
    }
  }

  return { meta, tag };
}

function pickRequiredField(entries, aliases, consumedKeys, label) {
  const match = entries.find(([key]) => aliases.includes(normalizeLookupKey(key)));
  if (!match) {
    throw new Error(`JSON payload is missing ${label}`);
  }
  consumedKeys.add(match[0]);
  return { key: match[0], value: match[1] };
}

function normalizeLookupKey(value) {
  return String(value).replace(/[\s_-]+/g, "").toLowerCase();
}

function isTagLikeKey(key) {
  const normalized = normalizeLookupKey(key);
  return TAG_KEYWORDS.some((keyword) => normalized.includes(normalizeLookupKey(keyword)));
}

function toManifestEntry(record) {
  const aiResult = getTagResultValue(record.tag);
  const threshold = Number(getTagThresholdValue(record.tag));
  return {
    id: record.id,
    baseName: record.baseName,
    imageKey: record.imageKey,
    rawJsonKey: record.rawJsonKey,
    recordKey: record.recordKey,
    productNo: record.meta.productNo,
    capturedAt: record.meta.capturedAt,
    aiResult,
    threshold
  };
}

function matchesFilters(item, filters) {
  if (filters.productNo && item.productNo !== filters.productNo) {
    return false;
  }
  const itemResult = item.aiResult ?? item.result ?? item.inspectionResult;
  if (filters.aiResult && itemResult !== filters.aiResult) {
    return false;
  }
  if (filters.capturedAtFrom && item.capturedAt < new Date(filters.capturedAtFrom).toISOString()) {
    return false;
  }
  if (filters.capturedAtTo && item.capturedAt > new Date(filters.capturedAtTo).toISOString()) {
    return false;
  }
  if (filters.thresholdMin !== undefined && item.threshold < Number(filters.thresholdMin)) {
    return false;
  }
  if (filters.thresholdMax !== undefined && item.threshold > Number(filters.thresholdMax)) {
    return false;
  }
  return true;
}

function getTagResultValue(tag) {
  if (!tag || typeof tag !== "object") {
    return undefined;
  }
  return tag.aiResult ?? tag.result ?? tag.inspectionResult;
}

function getTagThresholdValue(tag) {
  if (!tag || typeof tag !== "object") {
    return undefined;
  }
  return tag.threshold ?? tag.inspectionThreshold ?? tag["검사임계치"] ?? tag["검사시임계치"] ?? tag["임계치"];
}

function createEmptyManifest() {
  return {
    version: 1,
    updatedAt: null,
    count: 0,
    items: {}
  };
}

async function asyncPool(limit, items, iteratee) {
  const results = [];
  const pending = new Set();

  for (const item of items) {
    const task = Promise.resolve().then(() => iteratee(item));
    results.push(task);
    pending.add(task);
    task.finally(() => pending.delete(task));

    if (pending.size >= limit) {
      await Promise.race(pending);
    }
  }

  return Promise.all(results);
}
