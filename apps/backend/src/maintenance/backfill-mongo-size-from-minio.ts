import "reflect-metadata";
import { Client } from "minio";
import mongoose from "mongoose";
import type { CatalogRecord } from "../shared.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";

interface BackfillStats {
  processed: number;
  updated: number;
  noop: number;
  missingObjects: number;
  failed: number;
}

const BATCH_SIZE = 100;

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadAppConfig();
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName });
  const cursor = CatalogModel.find({
    bucket: config.minioBucket,
    $or: [{ "metadata.size": { $exists: false } }, { "metadata.size": null }, { "metadata.size": "" }]
  })
    .sort({ imageId: 1 })
    .lean<CatalogRecord>()
    .cursor();

  const stats: BackfillStats = { processed: 0, updated: 0, noop: 0, missingObjects: 0, failed: 0 };
  console.log(`[backfill-mongo-size-from-minio] boot dryRun=${dryRun} bucket=${config.minioBucket}`);

  let batch: CatalogRecord[] = [];
  for await (const record of cursor) {
    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      await processBatch(CatalogModel, client, config.minioBucket, batch, dryRun, stats);
      batch = [];
      console.log(`[backfill-mongo-size-from-minio] progress=${JSON.stringify(stats)}`);
    }
  }

  if (batch.length > 0) {
    await processBatch(CatalogModel, client, config.minioBucket, batch, dryRun, stats);
  }

  console.log(`[backfill-mongo-size-from-minio] completed ${JSON.stringify(stats)}`);
  await mongoose.disconnect();
}

async function processBatch(
  CatalogModel: mongoose.Model<any>,
  client: Client,
  bucketName: string,
  records: CatalogRecord[],
  dryRun: boolean,
  stats: BackfillStats
): Promise<void> {
  const updates: Array<{ updateOne: { filter: { imageId: string }; update: Record<string, unknown> } }> = [];

  await Promise.all(
    records.map(async (record) => {
      stats.processed += 1;
      try {
        const stat = await client.statObject(bucketName, record.imageKey);
        if (typeof stat.size !== "number" || stat.size <= 0) {
          stats.noop += 1;
          return;
        }
        updates.push({
          updateOne: {
            filter: { imageId: record.imageId },
            update: {
              $set: {
                "metadata.size": stat.size,
                updatedAt: new Date().toISOString()
              }
            }
          }
        });
      } catch (error) {
        if (isMissingObjectError(error)) {
          stats.missingObjects += 1;
        } else {
          stats.failed += 1;
          console.error(`[backfill-mongo-size-from-minio] failed imageId=${record.imageId}`, error);
        }
      }
    })
  );

  if (updates.length === 0) {
    return;
  }

  if (dryRun) {
    stats.updated += updates.length;
    return;
  }

  const result = await CatalogModel.bulkWrite(updates as any, { ordered: false });
  stats.updated += result.modifiedCount;
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

function isMissingObjectError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: unknown }).code === "NotFound" || (error as { code?: unknown }).code === "NoSuchKey")
  );
}

void main().catch(async (error) => {
  console.error("[backfill-mongo-size-from-minio] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
