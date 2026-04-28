import "reflect-metadata";
import { pathToFileURL } from "node:url";
import type { Model } from "mongoose";
import { DEFAULT_METADATA_VERSION } from "../shared.js";

type PlainRecord = Record<string, unknown>;

type MigrationStatus = "noop" | "update" | "skip";

export interface MetadataMigrationPlan {
  status: MigrationStatus;
  reason?: string;
  warnings: string[];
  metadata?: PlainRecord;
  unsetRootKeys: string[];
}

interface MigrationStats {
  processed: number;
  updated: number;
  noop: number;
  skipped: number;
  failed: number;
  probMissing: number;
  skipReasons: Record<string, number>;
}

interface MigrationDocument {
  _id?: unknown;
  imageId?: string;
  metadata?: PlainRecord;
  [key: string]: unknown;
}

const BATCH_SIZE = 500;
const CANONICAL_KEYS = ["product_id", "div", "capturedAt", "result", "threshold", "prob", "processId", "version", "size"] as const;
const REQUIRED_KEYS = ["product_id", "div", "capturedAt", "result", "threshold"] as const;
const METADATA_ALIAS_KEYS = new Set([
  "product_id",
  "productId",
  "productNo",
  "div",
  "processCode",
  "process_code",
  "time",
  "capturedAt",
  "captured_at",
  "result",
  "aiResult",
  "inspectionResult",
  "prob",
  "probability",
  "confidence",
  "score",
  "aiProb",
  "inspectionProb",
  "inspectionScore",
  "threshold",
  "inspectionThreshold",
  "inspection_threshold",
  "processId",
  "process_id",
  "process",
  "cameraId",
  "camera_id",
  "camera",
  "version",
  "metadataVersion",
  "metadata_version",
  "size",
  "fileSize",
  "sizeBytes"
]);
const ROOT_ALIAS_KEYS = [
  "product_id",
  "productId",
  "productNo",
  "div",
  "processCode",
  "process_code",
  "time",
  "capturedAt",
  "captured_at",
  "result",
  "aiResult",
  "inspectionResult",
  "prob",
  "probability",
  "confidence",
  "score",
  "aiProb",
  "inspectionProb",
  "inspectionScore",
  "threshold",
  "inspectionThreshold",
  "inspection_threshold",
  "processId",
  "process_id",
  "process",
  "cameraId",
  "camera_id",
  "camera",
  "version",
  "metadataVersion",
  "metadata_version",
  "size",
  "fileSize",
  "sizeBytes"
];

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const mongooseModule = await import("mongoose");
  const mongoose = mongooseModule.default;
  const { loadAppConfig } = await import("../common/config/app-config.js");
  const { CATALOG_MODEL_NAME, createCatalogSchema } = await import("../catalog/infrastructure/mongo/catalog.schema.js");
  const config = loadAppConfig();
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  console.log(
    `[metadata-migrate] boot dryRun=${dryRun} mongoDb=${config.mongoDbName} collection=${config.mongoCollectionName}`
  );

  try {
    await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000
    });
    await CatalogModel.createCollection();
    await CatalogModel.syncIndexes();

    const stats: MigrationStats = {
      processed: 0,
      updated: 0,
      noop: 0,
      skipped: 0,
      failed: 0,
      probMissing: 0,
      skipReasons: {}
    };
    const skipSamples: string[] = [];

    const cursor = CatalogModel.find(
      {},
      {
        _id: 1,
        imageId: 1,
        metadata: 1,
        product_id: 1,
        productId: 1,
        productNo: 1,
        div: 1,
        processCode: 1,
        process_code: 1,
        time: 1,
        capturedAt: 1,
        captured_at: 1,
        result: 1,
        aiResult: 1,
        inspectionResult: 1,
        threshold: 1,
        prob: 1,
        probability: 1,
        confidence: 1,
        score: 1,
        aiProb: 1,
        inspectionProb: 1,
        inspectionScore: 1,
        inspectionThreshold: 1,
        inspection_threshold: 1,
        processId: 1,
        process_id: 1,
        process: 1,
        cameraId: 1,
        camera_id: 1,
        camera: 1,
        version: 1,
        metadataVersion: 1,
        metadata_version: 1,
        size: 1,
        fileSize: 1,
        sizeBytes: 1
      }
    )
      .sort({ updatedAt: 1, imageId: 1 })
      .lean<MigrationDocument>()
      .cursor();

    let batch: MigrationDocument[] = [];
    for await (const document of cursor) {
      batch.push(document);
      if (batch.length >= BATCH_SIZE) {
        await processBatch(CatalogModel, batch, dryRun, stats, skipSamples);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processBatch(CatalogModel, batch, dryRun, stats, skipSamples);
    }

    console.log(
      `[metadata-migrate] completed processed=${stats.processed} updated=${stats.updated} noop=${stats.noop} skipped=${stats.skipped} failed=${stats.failed} probMissing=${stats.probMissing}`
    );
    if (skipSamples.length > 0) {
      console.log(`[metadata-migrate] skipSamples=${JSON.stringify(skipSamples.slice(0, 20))}`);
    }
    if (Object.keys(stats.skipReasons).length > 0) {
      console.log(`[metadata-migrate] skipReasons=${JSON.stringify(stats.skipReasons)}`);
    }
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}

async function processBatch(
  CatalogModel: Model<any>,
  documents: MigrationDocument[],
  dryRun: boolean,
  stats: MigrationStats,
  skipSamples: string[]
): Promise<void> {
  const operations: Array<{ updateOne: { filter: { _id: unknown }; update: Record<string, unknown> } }> = [];

  for (const document of documents) {
    stats.processed += 1;
    const plan = planMetadataMigration(document);

    if (plan.status === "noop") {
      stats.noop += 1;
      continue;
    }

    if (plan.status === "skip") {
      stats.skipped += 1;
      const reason = plan.reason || "unknown";
      stats.skipReasons[reason] = (stats.skipReasons[reason] || 0) + 1;
      if (document.imageId) {
        skipSamples.push(`${document.imageId}:${reason}`);
      }
      continue;
    }

    if (plan.warnings.includes("prob_missing")) {
      stats.probMissing += 1;
    }

    operations.push({
      updateOne: {
        filter: { _id: document._id },
        update: {
          $set: {
            metadata: plan.metadata,
            updatedAt: new Date().toISOString()
          },
          ...(plan.unsetRootKeys.length > 0
            ? {
                $unset: Object.fromEntries(plan.unsetRootKeys.map((key) => [key, ""]))
              }
            : {})
        }
      }
    });
  }

  if (operations.length === 0) {
    return;
  }

  if (dryRun) {
    stats.updated += operations.length;
    console.log(`[metadata-migrate] dry-run batch=${operations.length}`);
    return;
  }

  const result = await CatalogModel.bulkWrite(operations as any, { ordered: false });
  stats.updated += result.modifiedCount;
  console.log(
    `[metadata-migrate] batch processed=${operations.length} modified=${result.modifiedCount} matched=${result.matchedCount}`
  );
}

export function planMetadataMigration(document: MigrationDocument): MetadataMigrationPlan {
  const metadata = isPlainRecord(document.metadata) ? document.metadata : {};
  const nextMetadata = buildNextMetadata(document, metadata);
  const requiredProblem = validateRequiredFields(nextMetadata);
  if (requiredProblem) {
    return {
      status: "skip",
      reason: requiredProblem,
      warnings: [],
      unsetRootKeys: []
    };
  }

  const unsetRootKeys = ROOT_ALIAS_KEYS.filter((key) => hasOwn(document, key));
  const metadataChanged = !deepEqual(metadata, nextMetadata);

  if (!metadataChanged && unsetRootKeys.length === 0) {
    return {
      status: "noop",
      warnings: [],
      unsetRootKeys: []
    };
  }

  const warnings = nextMetadata.prob === undefined ? ["prob_missing"] : [];
  return {
    status: "update",
    warnings,
    metadata: nextMetadata,
    unsetRootKeys
  };
}

function buildNextMetadata(document: MigrationDocument, currentMetadata: PlainRecord): PlainRecord {
  const passthrough = Object.fromEntries(
    Object.entries(currentMetadata).filter(([key]) => !METADATA_ALIAS_KEYS.has(key))
  );

  const productId = normalizeText(
    firstDefined(
      readValue(document, currentMetadata, ["product_id", "productId"]),
      readValue(document, currentMetadata, ["productNo"])
    )
  );
  const div = normalizeText(
    firstDefined(
      readValue(document, currentMetadata, ["div"]),
      readValue(document, currentMetadata, ["processCode", "process_code"])
    )
  );
  const capturedAt = normalizeTime(
    firstDefined(
      readValue(document, currentMetadata, ["capturedAt", "captured_at"]),
      readValue(document, currentMetadata, ["time"])
    )
  );
  const result = normalizeResult(
    firstDefined(
      readValue(document, currentMetadata, ["result"]),
      readValue(document, currentMetadata, ["aiResult"]),
      readValue(document, currentMetadata, ["inspectionResult"])
    )
  );
  const threshold = normalizeNumber(
    firstDefined(
      readValue(document, currentMetadata, ["threshold"]),
      readValue(document, currentMetadata, ["inspectionThreshold", "inspection_threshold"])
    )
  );
  const prob = normalizeNumber(
    firstDefined(
      readValue(document, currentMetadata, ["prob"]),
      readValue(document, currentMetadata, ["probability"]),
      readValue(document, currentMetadata, ["confidence"]),
      readValue(document, currentMetadata, ["score"]),
      readValue(document, currentMetadata, ["aiProb"]),
      readValue(document, currentMetadata, ["inspectionProb"]),
      readValue(document, currentMetadata, ["inspectionScore"])
    )
  );
  const processId = normalizeText(
    firstDefined(
      readValue(document, currentMetadata, ["processId", "process_id", "process"]),
      readValue(document, currentMetadata, ["cameraId", "camera_id", "camera"])
    )
  );
  const version = normalizeText(readValue(document, currentMetadata, ["version", "metadataVersion", "metadata_version"])) ?? DEFAULT_METADATA_VERSION;
  const size = normalizeNumber(readValue(document, currentMetadata, ["size", "fileSize", "sizeBytes"]));

  const nextMetadata: PlainRecord = {
    ...passthrough,
    product_id: productId,
    div,
    capturedAt,
    result,
    threshold
  };

  if (prob !== undefined) {
    nextMetadata.prob = prob;
  }
  if (processId !== undefined) {
    nextMetadata.processId = processId;
  }
  nextMetadata.version = version;
  if (size !== undefined) {
    nextMetadata.size = size;
  }

  return nextMetadata;
}

function validateRequiredFields(metadata: PlainRecord): string | null {
  for (const key of REQUIRED_KEYS) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") {
      return `missing_${key}`;
    }
  }
  return null;
}

function readValue(document: MigrationDocument, currentMetadata: PlainRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const metadataValue = currentMetadata[key];
    if (isPresent(metadataValue)) {
      return metadataValue;
    }
    const rootValue = document[key];
    if (isPresent(rootValue)) {
      return rootValue;
    }
  }
  return undefined;
}

function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (isPresent(value)) {
      return value;
    }
  }
  return undefined;
}

function normalizeText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function normalizeTime(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
}

function normalizeResult(value: unknown): string | undefined {
  const text = normalizeText(value);
  if (!text) {
    return undefined;
  }
  const upper = text.toUpperCase();
  if (upper === "PASS" || upper === "FAIL" || upper === "REVIEW") {
    return upper;
  }
  return text;
}

function normalizeNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = String(value).trim();
  if (text.length === 0) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPlainRecord(value: unknown): value is PlainRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function hasOwn(document: MigrationDocument, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(document, key);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => deepEqual(item, right[index]));
  }

  const leftEntries = Object.entries(left as PlainRecord);
  const rightEntries = Object.entries(right as PlainRecord);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [key, leftValue] of leftEntries) {
    if (!Object.prototype.hasOwnProperty.call(right as PlainRecord, key)) {
      return false;
    }
    if (!deepEqual(leftValue, (right as PlainRecord)[key])) {
      return false;
    }
  }

  return true;
}

const isDirectRun = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectRun) {
  void main().catch(async (error) => {
    console.error("[metadata-migrate] failed", error);
    process.exitCode = 1;
  });
}
