import "reflect-metadata";
import { Client } from "minio";
import mongoose, { type Model } from "mongoose";
import { buildThumbnailKey } from "../shared.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema, type CatalogMongoDocument } from "../catalog/infrastructure/mongo/catalog.schema.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "../images/application/thumbnail.js";

interface CatalogDocument {
  imageId: string;
  imageKey: string;
  thumbnailKey?: string;
  bucket: string;
}

const BATCH_SIZE = 5;

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[backfill-thumbnails] boot");
  const config = loadAppConfig();
  // eslint-disable-next-line no-console
  console.log(
    `[backfill-thumbnails] config loaded bucket=${config.minioBucket} mongoDb=${config.mongoDbName} mongoHost=${config.mongoUri}`
  );
  const client = createMinioClient(config.minioEndpoint, config.minioAccessKey, config.minioSecretKey);
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  // eslint-disable-next-line no-console
  console.log("[backfill-thumbnails] connecting mongodb");
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDbName,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000
  });
  // eslint-disable-next-line no-console
  console.log("[backfill-thumbnails] mongodb connected");
  await CatalogModel.createCollection();
  // eslint-disable-next-line no-console
  console.log("[backfill-thumbnails] collection ensured");
  await CatalogModel.syncIndexes();
  // eslint-disable-next-line no-console
  console.log("[backfill-thumbnails] indexes synced");

  const total = await CatalogModel.countDocuments({ bucket: config.minioBucket }).exec();
  // eslint-disable-next-line no-console
  console.log(`[backfill-thumbnails] start bucket=${config.minioBucket} records=${total} batchSize=${BATCH_SIZE}`);
  let processed = 0;
  let generated = 0;
  let skipped = 0;

  const cursor = CatalogModel.find({ bucket: config.minioBucket }).sort({ updatedAt: -1, imageId: 1 }).lean<CatalogDocument>().cursor();
  let batch: CatalogDocument[] = [];
  for await (const record of cursor) {
    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      ({ processed, generated, skipped } = await processBatch(client, CatalogModel, config.minioBucket, batch, {
        processed,
        generated,
        skipped,
        total
      }));
      batch = [];
    }
  }
  if (batch.length > 0) {
    ({ processed, generated, skipped } = await processBatch(client, CatalogModel, config.minioBucket, batch, {
      processed,
      generated,
      skipped,
      total
    }));
  }

  // eslint-disable-next-line no-console
  console.log(`[backfill-thumbnails] completed processed=${processed} generated=${generated} skipped=${skipped}`);
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

async function objectExists(client: Client, bucketName: string, objectName: string): Promise<boolean> {
  try {
    await client.statObject(bucketName, objectName);
    return true;
  } catch {
    return false;
  }
}

async function processRecord(
  client: Client,
  CatalogModel: Model<CatalogMongoDocument>,
  bucketName: string,
  record: CatalogDocument
): Promise<"generated" | "skipped" | "failed"> {
  const thumbnailKey = record.thumbnailKey || buildThumbnailKey(record.imageId);
  try {
    const exists = await objectExists(client, bucketName, thumbnailKey);
    if (exists) {
      return "skipped";
    }

    const imageStream = await client.getObject(bucketName, record.imageKey);
    const imageBuffer = await streamToBuffer(imageStream);
    const thumbnailBuffer = await createThumbnailBuffer(imageBuffer);
    await client.putObject(bucketName, thumbnailKey, thumbnailBuffer, thumbnailBuffer.length, {
      "Content-Type": THUMBNAIL_CONTENT_TYPE
    });
    await CatalogModel.updateOne({ imageId: record.imageId }, { $set: { thumbnailKey, updatedAt: new Date().toISOString() } }).exec();
    return "generated";
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[backfill-thumbnails] failed imageId=${record.imageId}: ${String(error)}`);
    return "failed";
  }
}

async function processBatch(
  client: Client,
  CatalogModel: Model<CatalogMongoDocument>,
  bucketName: string,
  batch: CatalogDocument[],
  counters: { processed: number; generated: number; skipped: number; total: number }
): Promise<{ processed: number; generated: number; skipped: number }> {
  const batchStart = counters.processed + 1;
  const batchEnd = counters.processed + batch.length;
  // eslint-disable-next-line no-console
  console.log(`[backfill-thumbnails] batch start ${batchStart}-${batchEnd}`);

  const outcomes = await Promise.all(batch.map((record) => processRecord(client, CatalogModel, bucketName, record)));
  for (const outcome of outcomes) {
    counters.processed += 1;
    if (outcome === "generated") {
      counters.generated += 1;
    } else if (outcome === "skipped") {
      counters.skipped += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-thumbnails] progress processed=${counters.processed}/${counters.total} generated=${counters.generated} skipped=${counters.skipped}`
  );
  return {
    processed: counters.processed,
    generated: counters.generated,
    skipped: counters.skipped
  };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

void main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[backfill-thumbnails] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
