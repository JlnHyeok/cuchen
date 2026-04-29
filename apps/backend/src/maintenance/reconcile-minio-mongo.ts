import "reflect-metadata";
import { Client } from "minio";
import mongoose from "mongoose";
import { DEFAULT_METADATA_VERSION, buildThumbnailKey } from "../shared.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";

interface MinioListObject {
  name: string;
  lastModified?: Date;
  etag?: string;
  size?: number;
}

interface ReconcileStats {
  minioObjects: number;
  mongoDocuments: number;
  inserted: number;
  repaired: number;
  missingInMinio: number;
}

interface RepairUpdate {
  filter: { imageId: string };
  update: Record<string, unknown>;
  upsert?: boolean;
}

const BATCH_SIZE = 1000;

async function main(): Promise<void> {
  const config = loadAppConfig();
  const bucketName = config.minioBucket;
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName });
  await CatalogModel.createCollection();
  await CatalogModel.syncIndexes();

  const objects = await listImageObjects(client, bucketName);
  const minioMap = new Map(objects.map((object) => [buildImageId(object.name), object]));
  const mongoDocuments = await CatalogModel.find({
    $or: [{ bucket: bucketName }, { imageId: { $in: [...minioMap.keys()] } }]
  })
    .lean()
    .exec();
  const mongoMap = new Map(mongoDocuments.map((document) => [document.imageId, document]));
  const bucketDocuments = mongoDocuments.filter((document) => document.bucket === bucketName);

  const repairOperations: Array<{ updateOne: RepairUpdate }> = [];
  let inserted = 0;
  let missingInMinio = 0;

  for (const object of objects) {
    const imageId = buildImageId(object.name);
    const existing = mongoMap.get(imageId);
    if (!existing) {
      repairOperations.push({
        updateOne: {
          filter: { imageId },
          update: { $setOnInsert: buildCatalogDocument(bucketName, object) },
          upsert: true
        }
      });
      inserted += 1;
      continue;
    }

    const updates = buildRepairUpdate(existing, bucketName, object);
    if (updates) {
      repairOperations.push({ updateOne: updates });
    }
  }

  for (const document of bucketDocuments) {
    if (!minioMap.has(document.imageId)) {
      missingInMinio += 1;
      repairOperations.push({
        updateOne: {
          filter: { imageId: document.imageId },
          update: {
            $set: {
              syncStatus: "missing-source",
              errorMessage: "Missing from MinIO during reconcile",
              updatedAt: new Date().toISOString()
            }
          }
        }
      });
    }
  }

  let repaired = 0;
  if (repairOperations.length > 0) {
    for (const chunk of chunkArray(repairOperations, BATCH_SIZE)) {
      const result = await CatalogModel.bulkWrite(chunk as any, { ordered: false });
      repaired += result.modifiedCount;
    }
  }

  const stats: ReconcileStats = {
    minioObjects: objects.length,
    mongoDocuments: bucketDocuments.length,
    inserted,
    repaired,
    missingInMinio
  };

  // eslint-disable-next-line no-console
  console.log(`[reconcile] ${JSON.stringify(stats)}`);
  await mongoose.disconnect();
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
    if (object?.name) {
      objects.push(object);
    }
  }
  objects.sort((left, right) => left.name.localeCompare(right.name));
  return objects;
}

function buildCatalogDocument(bucketName: string, object: MinioListObject) {
  const imageKey = object.name;
  const imageId = buildImageId(imageKey);
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

function buildRepairUpdate(
  document: {
    bucket?: string;
    imageKey?: string;
    thumbnailKey?: string;
    fileName?: string;
    fileExt?: string;
    sourcePath?: string;
    syncStatus?: string;
    errorMessage?: string;
    updatedAt?: string;
  },
  bucketName: string,
  object: MinioListObject
): RepairUpdate | null {
  const imageId = buildImageId(object.name);
  const nextStatus = document.syncStatus === "synced" ? null : "synced";
  const nextFields = {
    bucket: bucketName,
    imageKey: object.name,
    thumbnailKey: buildThumbnailKey(imageId),
    fileName: stripExtension(pathBaseName(object.name)),
    fileExt: normalizeExt(pathExtName(object.name).slice(1).toLowerCase()),
    sourcePath: object.name
  };
  const hasCoreMismatch = Object.entries(nextFields).some(([key, value]) => document[key as keyof typeof document] !== value);

  if (!nextStatus && !document.errorMessage && !hasCoreMismatch) {
    return null;
  }

  const $set: Record<string, unknown> = {
    ...nextFields,
    updatedAt: new Date().toISOString()
  };

  if (nextStatus) {
    $set.syncStatus = nextStatus;
  }

  const update: Record<string, unknown> = { $set };
  if (document.errorMessage) {
    update.$unset = { errorMessage: "" };
  }
  return { filter: { imageId }, update };
}

function buildImageId(value: string): string {
  const base = pathBaseName(value);
  return stripExtension(base);
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
  console.error("[reconcile] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
