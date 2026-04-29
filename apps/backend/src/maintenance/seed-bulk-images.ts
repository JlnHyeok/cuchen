import "reflect-metadata";
import crypto from "node:crypto";
import { Client } from "minio";
import mongoose, { type Model } from "mongoose";
import sharp from "sharp";
import { buildThumbnailKey, type CatalogRecord, type MetadataDocument } from "../shared.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "../images/application/thumbnail.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema, type CatalogMongoDocument } from "../catalog/infrastructure/mongo/catalog.schema.js";

interface CliOptions {
  count: number;
  imageMegabytes: number;
  prefix: string;
  concurrency: number;
  batchSize: number;
  purgeDummy: boolean;
  dryRun: boolean;
  confirmRemoteWrite: boolean;
}

interface SeedPayload {
  record: CatalogRecord;
  recordJson: Buffer;
}

interface PurgeCandidate {
  imageId: string;
  imageKey?: string;
  thumbnailKey?: string;
  rawJsonKey?: string;
}

const DEFAULT_COUNT = 20_000;
const DEFAULT_IMAGE_MEGABYTES = 4;
const DEFAULT_PREFIX = "bulk-20k";
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_BATCH_SIZE = 100;
const DIVISIONS = ["top", "bot", "top-inf", "bot-inf"] as const;
const DUMMY_IMAGE_ID_PATTERNS = [/^sample-/, /^grouped-sample-/, /^bulk-20k-/, /^bulk-seed-/];

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const config = loadAppConfig();
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDbName,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000
  });
  await CatalogModel.createCollection();
  await CatalogModel.syncIndexes();

  try {
    const existingCount = await CatalogModel.countDocuments({ bucket: config.minioBucket }).exec();
    const dummyCandidates = await listDummyCandidates(CatalogModel, config.minioBucket);
    const targetBytes = options.count * options.imageMegabytes * 1024 * 1024;
    const productCount = Math.ceil(options.count / DIVISIONS.length);

    log(
      `target bucket=${config.minioBucket} count=${options.count} products=${productCount} imageMb=${options.imageMegabytes} estimatedOriginalBytes=${formatBytes(targetBytes)}`
    );
    log(`current records=${existingCount} dummyCandidates=${dummyCandidates.length} dryRun=${options.dryRun}`);

    if (options.dryRun) {
      log("dry-run only; no MinIO or MongoDB writes were made");
      return;
    }

    if (!options.confirmRemoteWrite) {
      throw new Error("remote writes require --confirm-remote-write");
    }

    await ensureBucket(client, config.minioBucket);

    if (options.purgeDummy) {
      await purgeDummyRecords(client, CatalogModel, config.minioBucket, dummyCandidates, options.concurrency);
    }

    const { imageBuffer, contentType } = await createSeedImageBuffer(options.imageMegabytes);
    const thumbnailBuffer = await createThumbnailBuffer(imageBuffer);
    const imageHash = hashBuffer(imageBuffer);

    log(`seed image size=${formatBytes(imageBuffer.length)} thumbnail=${formatBytes(thumbnailBuffer.length)}`);
    await seedRecords({
      CatalogModel,
      client,
      bucketName: config.minioBucket,
      options,
      imageBuffer,
      thumbnailBuffer,
      contentType,
      imageHash
    });

    const nextCount = await CatalogModel.countDocuments({ bucket: config.minioBucket }).exec();
    log(`completed records=${nextCount}`);
  } finally {
    await mongoose.disconnect();
  }
}

function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    count: DEFAULT_COUNT,
    imageMegabytes: DEFAULT_IMAGE_MEGABYTES,
    prefix: DEFAULT_PREFIX,
    concurrency: DEFAULT_CONCURRENCY,
    batchSize: DEFAULT_BATCH_SIZE,
    purgeDummy: false,
    dryRun: false,
    confirmRemoteWrite: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--purge-dummy") {
      options.purgeDummy = true;
      continue;
    }
    if (arg === "--confirm-remote-write") {
      options.confirmRemoteWrite = true;
      continue;
    }
    if (arg === "--count") {
      options.count = readPositiveInteger(args[++index], "--count");
      continue;
    }
    if (arg === "--image-mb") {
      options.imageMegabytes = readPositiveNumber(args[++index], "--image-mb");
      continue;
    }
    if (arg === "--prefix") {
      options.prefix = readNonEmptyString(args[++index], "--prefix");
      continue;
    }
    if (arg === "--concurrency") {
      options.concurrency = readPositiveInteger(args[++index], "--concurrency");
      continue;
    }
    if (arg === "--batch-size") {
      options.batchSize = readPositiveInteger(args[++index], "--batch-size");
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return options;
}

function readPositiveInteger(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readPositiveNumber(value: string | undefined, name: string): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function readNonEmptyString(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function createMinioClient(endpoint: string, accessKey: string, secretKey: string): Client {
  const url = new URL(endpoint);
  return new Client({
    endPoint: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80,
    useSSL: url.protocol === "https:",
    accessKey,
    secretKey
  });
}

async function ensureBucket(client: Client, bucketName: string): Promise<void> {
  const exists = await client.bucketExists(bucketName);
  if (!exists) {
    await client.makeBucket(bucketName);
  }
}

async function listDummyCandidates(ModelRef: Model<CatalogMongoDocument>, bucketName: string): Promise<PurgeCandidate[]> {
  const candidates = await ModelRef.find({
    bucket: bucketName,
    $or: [...DUMMY_IMAGE_ID_PATTERNS.map((pattern) => ({ imageId: pattern })), { "metadata.source": "bulk-seed" }]
  })
    .select({ imageId: 1, imageKey: 1, thumbnailKey: 1, rawJsonKey: 1 })
    .lean<PurgeCandidate[]>()
    .exec();

  return candidates;
}

async function purgeDummyRecords(
  client: Client,
  ModelRef: Model<CatalogMongoDocument>,
  bucketName: string,
  candidates: PurgeCandidate[],
  concurrency: number
): Promise<void> {
  if (candidates.length === 0) {
    log("purge skipped; no dummy candidates");
    return;
  }

  const keys = uniqueStrings(candidates.flatMap((candidate) => buildObjectKeysForRemoval(candidate)));
  log(`purge start records=${candidates.length} objects=${keys.length}`);

  let removedObjects = 0;
  for (const chunk of chunkArray(keys, 500)) {
    await mapWithConcurrency(chunk, concurrency, async (key) => {
      await removeObjectIfExists(client, bucketName, key);
      removedObjects += 1;
    });
    log(`purge objects=${removedObjects}/${keys.length}`);
  }

  const imageIds = candidates.map((candidate) => candidate.imageId);
  let removedRecords = 0;
  for (const chunk of chunkArray(imageIds, 1000)) {
    const result = await ModelRef.deleteMany({ bucket: bucketName, imageId: { $in: chunk } }).exec();
    removedRecords += result.deletedCount ?? 0;
    log(`purge records=${removedRecords}/${candidates.length}`);
  }
}

function buildObjectKeysForRemoval(candidate: PurgeCandidate): string[] {
  const keys = [
    candidate.imageKey,
    candidate.thumbnailKey,
    candidate.rawJsonKey,
    `metadata/${candidate.imageId}.json`,
    `records/${candidate.imageId}.json`,
    `raw-json/${candidate.imageId}.json`,
    `thumbnails/${candidate.imageId}.webp`,
    `images/${candidate.imageId}.png`,
    `images/${candidate.imageId}.jpg`,
    `images/${candidate.imageId}.jpeg`
  ];
  return keys.filter((key): key is string => Boolean(key));
}

async function removeObjectIfExists(client: Client, bucketName: string, objectName: string): Promise<void> {
  try {
    await client.removeObject(bucketName, objectName);
  } catch (error) {
    log(`remove skipped object=${objectName} reason=${String(error)}`);
  }
}

async function createSeedImageBuffer(imageMegabytes: number): Promise<{ imageBuffer: Buffer; contentType: "image/jpeg" }> {
  const targetBytes = imageMegabytes * 1024 * 1024;
  let size = Math.max(256, Math.round(2300 * Math.sqrt(imageMegabytes / DEFAULT_IMAGE_MEGABYTES)));
  let quality = 88;
  let imageBuffer = await renderNoiseJpeg(size, quality);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ratio = imageBuffer.length / targetBytes;
    if (ratio >= 0.9 && ratio <= 1.15) {
      break;
    }
    if (ratio < 0.9) {
      size = Math.round(size * Math.sqrt(1 / Math.max(ratio, 0.2)) * 0.98);
      quality = Math.min(92, quality + 1);
    } else {
      size = Math.round(size * Math.sqrt(1 / ratio) * 1.02);
      quality = Math.max(72, quality - 1);
    }
    imageBuffer = await renderNoiseJpeg(size, quality);
  }

  return { imageBuffer, contentType: "image/jpeg" };
}

function renderNoiseJpeg(size: number, quality: number): Promise<Buffer> {
  const raw = crypto.randomBytes(size * size * 3);
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality })
    .toBuffer();
}

async function seedRecords(input: {
  CatalogModel: Model<CatalogMongoDocument>;
  client: Client;
  bucketName: string;
  options: CliOptions;
  imageBuffer: Buffer;
  thumbnailBuffer: Buffer;
  contentType: "image/jpeg";
  imageHash: string;
}): Promise<void> {
  const { CatalogModel, client, bucketName, options, imageBuffer, thumbnailBuffer, contentType, imageHash } = input;
  let uploaded = 0;

  for (let start = 0; start < options.count; start += options.batchSize) {
    const end = Math.min(options.count, start + options.batchSize);
    const payloads = [];
    for (let index = start; index < end; index += 1) {
      payloads.push(buildSeedPayload(index, bucketName, options.prefix, imageBuffer.length, imageHash));
    }

    await mapWithConcurrency(payloads, options.concurrency, async (payload) => {
      await uploadSeedPayload(client, bucketName, payload, imageBuffer, thumbnailBuffer, contentType);
    });

    await CatalogModel.bulkWrite(
      payloads.map((payload) => ({
        updateOne: {
          filter: { imageId: payload.record.imageId },
          update: { $set: payload.record },
          upsert: true
        }
      })),
      { ordered: false }
    );

    uploaded += payloads.length;
    log(`seed progress=${uploaded}/${options.count}`);
  }
}

function buildSeedPayload(index: number, bucketName: string, prefix: string, imageBytes: number, imageHash: string): SeedPayload {
  const productIndex = Math.floor(index / DIVISIONS.length) + 1;
  const division = DIVISIONS[index % DIVISIONS.length]!;
  const productNo = `BULK-${productIndex.toString().padStart(6, "0")}`;
  const imageId = `${prefix}-${productNo.toLowerCase()}-${division}`;
  const now = new Date(Date.UTC(2026, 0, 1, 0, 0, 0 + index)).toISOString();
  const isNg = division === "bot-inf" && productIndex % 11 === 0;
  const prob = isNg ? 0.62 : 0.93 + (productIndex % 6) * 0.01;
  const threshold = 0.8;
  const metadata: MetadataDocument = {
    productId: productNo,
    capturedAt: now,
    captured_at: now,
    time: now,
    div: division,
    result: isNg ? "NG" : "OK",
    threshold,
    prob,
    lotNo: `LOT-${String(((productIndex - 1) % 200) + 1).padStart(3, "0")}`,
    processId: processIdForDivision(division),
    version: "seed-v1",
    size: imageBytes,
    seedPrefix: prefix,
    contentType: "image/jpeg"
  };
  const record: CatalogRecord = {
    imageId,
    bucket: bucketName,
    fileName: imageId,
    fileExt: "jpg",
    sourcePath: `generated/bulk/${imageId}.jpg`,
    contentHash: imageHash,
    imageKey: `images/${imageId}.jpg`,
    thumbnailKey: buildThumbnailKey(imageId),
    rawJsonKey: `records/${imageId}.json`,
    metadata,
    syncStatus: "synced",
    createdAt: now,
    updatedAt: now
  };
  const recordJson = Buffer.from(
    JSON.stringify({
      sourcePath: record.sourcePath,
      imageKey: record.imageKey,
      thumbnailKey: record.thumbnailKey,
      rawJsonKey: record.rawJsonKey,
      meta: metadata,
      tag: {
        productId: productNo,
        div: division,
        result: metadata.result
      }
    })
  );

  return { record, recordJson };
}

function processIdForDivision(division: string): string {
  if (division === "top") return "PROC-TOP";
  if (division === "bot") return "PROC-BOT";
  if (division === "top-inf") return "PROC-TOP-INF";
  return "PROC-BOT-INF";
}

async function uploadSeedPayload(
  client: Client,
  bucketName: string,
  payload: SeedPayload,
  imageBuffer: Buffer,
  thumbnailBuffer: Buffer,
  contentType: "image/jpeg"
): Promise<void> {
  await Promise.all([
    client.putObject(bucketName, payload.record.imageKey, imageBuffer, imageBuffer.length, {
      "Content-Type": contentType,
      ...buildObjectUserMetadata(payload.record)
    }),
    client.putObject(bucketName, payload.record.thumbnailKey ?? buildThumbnailKey(payload.record.imageId), thumbnailBuffer, thumbnailBuffer.length, {
      "Content-Type": THUMBNAIL_CONTENT_TYPE,
      ...buildObjectUserMetadata(payload.record)
    }),
    client.putObject(bucketName, payload.record.rawJsonKey ?? `records/${payload.record.imageId}.json`, payload.recordJson, payload.recordJson.length, {
      "Content-Type": "application/json",
      ...buildObjectUserMetadata(payload.record)
    })
  ]);
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildObjectUserMetadata(record: CatalogRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record.metadata)
      .filter((entry): entry is [string, string | number | boolean] => {
        const [, value] = entry;
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      })
      .map(([key, value]) => [`X-Amz-Meta-${key}`, String(value)])
  );
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(workers);
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function formatBytes(bytes: number): string {
  const gib = bytes / 1024 / 1024 / 1024;
  if (gib >= 1) {
    return `${gib.toFixed(2)} GiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed-bulk-images] ${message}`);
}

void main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[seed-bulk-images] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
