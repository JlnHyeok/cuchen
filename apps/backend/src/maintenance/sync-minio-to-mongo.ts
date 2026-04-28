import "reflect-metadata";
import { Client } from "minio";
import mongoose from "mongoose";
import { DEFAULT_METADATA_VERSION, buildThumbnailKey, extractAliasValues } from "../shared.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";

interface MinioListObject {
  name: string;
  lastModified?: Date;
  etag?: string;
  size?: number;
}

interface RawJsonPayload {
  [key: string]: unknown;
}

interface MinioRecordPayload {
  sourcePath?: string;
  rawJsonKey?: string;
  recordKey?: string;
  meta?: Record<string, unknown>;
  tag?: Record<string, unknown>;
  [key: string]: unknown;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
const BATCH_SIZE = 1000;

async function main(): Promise<void> {
  const config = loadAppConfig();
  const bucketName = config.minioBucket;
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName });
  await CatalogModel.createCollection();
  await CatalogModel.syncIndexes();

  const [objects, rawJsonMap, recordMap] = await Promise.all([
    listImageObjects(client, bucketName),
    listJsonMap(client, bucketName, "raw-json/"),
    listJsonMap(client, bucketName, "records/")
  ]);
  // eslint-disable-next-line no-console
  console.log(`[sync] bucket=${bucketName} images=${objects.length}`);

  await CatalogModel.deleteMany({ bucket: bucketName });

  let inserted = 0;
  let enrichedFromRecords = 0;
  let enrichedFromRawJson = 0;
  for (const chunk of chunkArray(objects, BATCH_SIZE)) {
    const docs = chunk.map((object) => {
      const imageId = deriveImageIdFromObjectKey(object.name);
      const recordPayload = recordMap.get(imageId);
      if (recordPayload) {
        enrichedFromRecords += 1;
        return buildCatalogDocumentFromRecord(bucketName, object, recordPayload, imageId);
      }
      const rawJsonPayload = rawJsonMap.get(imageId);
      if (rawJsonPayload) {
        enrichedFromRawJson += 1;
        return buildCatalogDocumentFromRawJson(bucketName, object, rawJsonPayload, imageId);
      }
      return buildCatalogDocument(bucketName, object, imageId);
    });
    await CatalogModel.insertMany(docs, { ordered: true });
    inserted += docs.length;
    // eslint-disable-next-line no-console
    console.log(`[sync] inserted=${inserted}/${objects.length}`);
  }

  await mongoose.disconnect();
  // eslint-disable-next-line no-console
  console.log(
    `[sync] completed bucket=${bucketName} inserted=${inserted} enrichedFromRecords=${enrichedFromRecords} enrichedFromRawJson=${enrichedFromRawJson}`
  );
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

async function listImageObjects(client: Client, bucketName: string): Promise<MinioListObject[]> {
  const objects: MinioListObject[] = [];
  const stream = client.listObjectsV2(bucketName, "images/", true, "");
  for await (const object of stream as AsyncIterable<MinioListObject>) {
    if (!object?.name) {
      continue;
    }
    if (!isImageObject(object.name)) {
      continue;
    }
    objects.push(object);
  }
  objects.sort((left, right) => left.name.localeCompare(right.name));
  return objects;
}

async function listJsonMap(client: Client, bucketName: string, prefix: string): Promise<Map<string, RawJsonPayload | MinioRecordPayload>> {
  const entries = new Map<string, RawJsonPayload | MinioRecordPayload>();
  const stream = client.listObjectsV2(bucketName, prefix, true, "");
  for await (const object of stream as AsyncIterable<MinioListObject>) {
    if (!object?.name || !object.name.endsWith(".json")) {
      continue;
    }
    const baseName = deriveImageIdFromObjectKey(object.name);
    const payload = await readJsonObject(client, bucketName, object.name);
    if (payload) {
      entries.set(baseName, payload);
    }
  }
  return entries;
}

async function readJsonObject(client: Client, bucketName: string, key: string): Promise<RawJsonPayload | MinioRecordPayload | null> {
  try {
    const stream = await client.getObject(bucketName, key);
    let data = "";
    for await (const chunk of stream) {
      data += chunk.toString("utf8");
    }
    return JSON.parse(data) as RawJsonPayload | MinioRecordPayload;
  } catch {
    return null;
  }
}

function buildCatalogDocument(bucketName: string, object: MinioListObject, imageId: string) {
  const imageKey = object.name;
  const fileExt = pathExtName(imageKey).slice(1).toLowerCase();
  const size = typeof object.size === "number" ? object.size : 0;
  const etag = object.etag ?? "";
  const timestamp = object.lastModified ? object.lastModified.toISOString() : new Date().toISOString();

  return {
    imageId,
    bucket: bucketName,
    fileName: stripExtension(pathBaseName(imageKey)),
    fileExt: normalizeExt(fileExt),
    sourcePath: imageKey,
    contentHash: etag || `${imageId}:${size}`,
    imageKey,
    thumbnailKey: buildThumbnailKey(imageId),
    rawJsonKey: undefined,
    metadata: {
      source: "minio-backfill",
      contentType: fileExt === "jpg" || fileExt === "jpeg" ? "image/jpeg" : "image/png",
      size,
      etag,
      lastModified: timestamp,
      version: DEFAULT_METADATA_VERSION
    },
    syncStatus: "synced" as const,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildCatalogDocumentFromRawJson(bucketName: string, object: MinioListObject, rawJson: RawJsonPayload, imageId: string) {
  const fileExt = pathExtName(object.name).slice(1).toLowerCase();
  const size = typeof object.size === "number" ? object.size : 0;
  const etag = object.etag ?? "";
  const timestamp = object.lastModified ? object.lastModified.toISOString() : new Date().toISOString();
  const metadata = extractAliasValues(rawJson);
  const contentType = fileExt === "jpg" || fileExt === "jpeg" ? "image/jpeg" : "image/png";

  return {
    imageId,
    bucket: bucketName,
    fileName: stripExtension(pathBaseName(object.name)),
    fileExt: normalizeExt(fileExt),
    sourcePath: typeof rawJson.sourcePath === "string" ? rawJson.sourcePath : object.name,
    contentHash: etag || `${imageId}:${size}`,
    imageKey: object.name,
    thumbnailKey: buildThumbnailKey(imageId),
    rawJsonKey: `raw-json/${imageId}.json`,
    metadata: {
      ...metadata,
      source: "minio-raw-json",
      contentType,
      size,
      etag,
      lastModified: timestamp,
      version: metadata.version ?? DEFAULT_METADATA_VERSION
    },
    syncStatus: "synced" as const,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function buildCatalogDocumentFromRecord(bucketName: string, object: MinioListObject, record: MinioRecordPayload, imageId: string) {
  const fileExt = pathExtName(object.name).slice(1).toLowerCase();
  const size = typeof object.size === "number" ? object.size : 0;
  const etag = object.etag ?? "";
  const timestamp = object.lastModified ? object.lastModified.toISOString() : new Date().toISOString();
  const metadata = extractAliasValues({ ...(record.meta ?? {}), ...(record.tag ?? {}) });
  const contentType = fileExt === "jpg" || fileExt === "jpeg" ? "image/jpeg" : "image/png";

  return {
    imageId,
    bucket: bucketName,
    fileName: stripExtension(pathBaseName(object.name)),
    fileExt: normalizeExt(fileExt),
    sourcePath: typeof record.sourcePath === "string" ? record.sourcePath : object.name,
    contentHash: etag || `${imageId}:${size}`,
    imageKey: object.name,
    thumbnailKey: buildThumbnailKey(imageId),
    rawJsonKey: typeof record.rawJsonKey === "string" ? record.rawJsonKey : `raw-json/${imageId}.json`,
    metadata: {
      ...metadata,
      source: "minio-record",
      contentType,
      size,
      etag,
      lastModified: timestamp,
      version: metadata.version ?? DEFAULT_METADATA_VERSION
    },
    syncStatus: "synced" as const,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function isImageObject(name: string): boolean {
  return IMAGE_EXTENSIONS.has(pathExtName(name).toLowerCase());
}

function deriveImageIdFromObjectKey(objectKey: string): string {
  return stripExtension(pathBaseName(objectKey));
}

function pathBaseName(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

function pathExtName(value: string): string {
  const base = pathBaseName(value);
  const lastDot = base.lastIndexOf(".");
  return lastDot >= 0 ? base.slice(lastDot) : "";
}

function stripExtension(value: string): string {
  const lastDot = value.lastIndexOf(".");
  return lastDot >= 0 ? value.slice(0, lastDot) : value;
}

function normalizeExt(ext: string): "png" | "jpg" | "jpeg" {
  if (ext === "jpg" || ext === "jpeg") {
    return ext;
  }
  return "png";
}

function chunkArray<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

void main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[sync] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
