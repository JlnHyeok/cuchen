import "reflect-metadata";
import { Client, CopyDestinationOptions, CopySourceOptions } from "minio";
import mongoose from "mongoose";
import type { CatalogRecord } from "../shared.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";

interface SyncStats {
  records: number;
  objectsChecked: number;
  objectsUpdated: number;
  rawJsonUpdated: number;
  missingObjects: number;
  failed: number;
}

const BATCH_SIZE = 20;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadAppConfig();
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName });
  const cursor = CatalogModel.find({ bucket: config.minioBucket }).sort({ imageId: 1 }).lean<CatalogRecord>().cursor();

  const stats: SyncStats = {
    records: 0,
    objectsChecked: 0,
    objectsUpdated: 0,
    rawJsonUpdated: 0,
    missingObjects: 0,
    failed: 0
  };

  console.log(`[sync-mongo-metadata-to-minio] boot dryRun=${dryRun} bucket=${config.minioBucket}`);

  let batch: CatalogRecord[] = [];
  for await (const record of cursor) {
    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      await processBatch(client, config.minioBucket, batch, dryRun, stats);
      batch = [];
      console.log(`[sync-mongo-metadata-to-minio] progress=${JSON.stringify(stats)}`);
    }
  }

  if (batch.length > 0) {
    await processBatch(client, config.minioBucket, batch, dryRun, stats);
  }

  console.log(`[sync-mongo-metadata-to-minio] completed ${JSON.stringify(stats)}`);
  await mongoose.disconnect();
}

async function processBatch(
  client: Client,
  bucketName: string,
  records: CatalogRecord[],
  dryRun: boolean,
  stats: SyncStats
): Promise<void> {
  await Promise.all(records.map((record) => processRecord(client, bucketName, record, dryRun, stats)));
}

async function processRecord(
  client: Client,
  bucketName: string,
  record: CatalogRecord,
  dryRun: boolean,
  stats: SyncStats
): Promise<void> {
  stats.records += 1;
  const keys = [record.imageKey, record.thumbnailKey, record.rawJsonKey].filter((key): key is string => Boolean(key));

  for (const key of keys) {
    stats.objectsChecked += 1;
    try {
      if (!dryRun) {
        await replaceObjectUserMetadata(client, bucketName, key, record);
      }
      stats.objectsUpdated += 1;
    } catch (error) {
      if (isMissingObjectError(error)) {
        stats.missingObjects += 1;
      } else {
        stats.failed += 1;
        console.error(`[sync-mongo-metadata-to-minio] failed key=${key}`, error);
      }
    }
  }

  if (record.rawJsonKey) {
    try {
      if (!dryRun) {
        const rawJson = Buffer.from(JSON.stringify(buildRawJsonPayload(record), null, 2));
        await client.putObject(bucketName, record.rawJsonKey, rawJson, rawJson.length, {
          "Content-Type": "application/json",
          ...buildObjectUserMetadata(record)
        });
      }
      stats.rawJsonUpdated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`[sync-mongo-metadata-to-minio] raw-json failed key=${record.rawJsonKey}`, error);
    }
  }
}

async function replaceObjectUserMetadata(
  client: Client,
  bucketName: string,
  key: string,
  record: CatalogRecord
): Promise<void> {
  const stat = await client.statObject(bucketName, key);
  const source = new CopySourceOptions({ Bucket: bucketName, Object: key });
  const destination = new CopyDestinationOptions({
    Bucket: bucketName,
    Object: key,
    MetadataDirective: "REPLACE",
    UserMetadata: toUserMetadata(record),
    Headers: {
      "Content-Type": readContentType(stat.metaData) ?? guessContentType(key, record.fileExt)
    }
  });

  await client.copyObject(source, destination);
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

function toUserMetadata(record: CatalogRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record.metadata)
      .filter((entry): entry is [string, string | number | boolean] => {
        const [, value] = entry;
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      })
      .map(([key, value]) => [key, String(value)])
  );
}

function buildObjectUserMetadata(record: CatalogRecord): Record<string, string> {
  return Object.fromEntries(Object.entries(toUserMetadata(record)).map(([key, value]) => [`X-Amz-Meta-${key}`, value]));
}

function buildRawJsonPayload(record: CatalogRecord): Record<string, unknown> {
  return {
    sourcePath: record.sourcePath,
    imageKey: record.imageKey,
    thumbnailKey: record.thumbnailKey,
    rawJsonKey: record.rawJsonKey,
    meta: record.metadata,
    tag: {
      productId: record.metadata.productId,
      div: record.metadata.div,
      result: record.metadata.result
    }
  };
}

function readContentType(metadata: Record<string, string | number | undefined>): string | undefined {
  const value = metadata["content-type"] ?? metadata["Content-Type"];
  return typeof value === "string" && value ? value : undefined;
}

function guessContentType(key: string, fileExt: string): string {
  if (key.endsWith(".json")) return "application/json";
  if (key.endsWith(".webp")) return "image/webp";
  if (fileExt === "jpg" || fileExt === "jpeg") return "image/jpeg";
  return "image/png";
}

function isMissingObjectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: unknown }).code === "NotFound" || (error as { code?: unknown }).code === "NoSuchKey")
  );
}

void main().catch(async (error) => {
  console.error("[sync-mongo-metadata-to-minio] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
