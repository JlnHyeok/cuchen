import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { getConfig } from "../../src/config.js";
import { FixtureService } from "../../src/services/fixtureService.js";
import { normalizeFixtureJson, scanInputDirectory } from "../../src/services/ingestService.js";
import { createStableId } from "../../src/utils/hash.js";
import { S3Client } from "../../src/storage/s3Client.js";

const config = getConfig();
const bucket = process.argv[2] || config.minioBucket;
const count = Number.parseInt(process.argv[3] || "3", 10);
const imageMegabytes = Number.parseFloat(process.argv[4] || "4");
const fixtureDir = path.join(config.defaultFixtureDir, `refill-${sanitizeBucketName(bucket)}`);
const populationConcurrency = Math.max(32, config.ingestConcurrency * 2);

const s3 = new S3Client({
  endpoint: config.minioEndpoint,
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
  region: config.region
});

await s3.ensureBucket(bucket);
await clearBucket(bucket);
await resetDirectory(fixtureDir);

const fixtureService = new FixtureService();
await fixtureService.generateFixtures({
  count,
  outputDir: fixtureDir,
  imageMegabytes,
  reuseSingleImage: true
});

const scan = await scanInputDirectory(fixtureDir);
if (!scan.pairs.length) {
  throw new Error("No fixture pairs were generated");
}

const population = await populateBucketWithSharedImageCopies({
  bucket,
  s3,
  pairs: scan.pairs,
  populationConcurrency
});
const sample = population.sample;
const sampleHeaders = sample ? await s3.headObjectHeaders(bucket, sample.imageKey) : null;

console.log(
  JSON.stringify(
    {
      bucket,
      cleared: true,
      generated: count,
      imageMegabytes,
      reuseSingleImage: true,
      fixtureDir,
      ingestResult: population.ingestResult,
      sampleImageSize: sampleHeaders?.get("content-length") || null
    },
    null,
    2
  )
);

async function clearBucket(targetBucket) {
  const keys = [];
  let continuationToken = null;

  while (true) {
    const result = await s3.listObjects(targetBucket, {
      ...(continuationToken ? { continuationToken } : {})
    });
    keys.push(...(result.keys || []));
    if (!result.isTruncated || !result.nextContinuationToken) {
      break;
    }
    continuationToken = result.nextContinuationToken;
  }

  for (const key of keys) {
    await s3.deleteObject(targetBucket, key);
  }
}

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}

async function populateBucketWithSharedImageCopies({ bucket: targetBucket, s3: client, pairs, populationConcurrency: limit }) {
  const manifest = createEmptyManifest();
  const startedAt = performance.now();
  const [headPair, ...tailPairs] = pairs;
  const [headImageBuffer, headJsonBuffer] = await Promise.all([
    fs.readFile(headPair.imagePath),
    fs.readFile(headPair.jsonPath)
  ]);
  const sourceImageKey = `images/${createStableId(headPair.baseName, headImageBuffer, headJsonBuffer)}.png`;
  const headRawJson = JSON.parse(headJsonBuffer.toString("utf8"));
  const sourceRecord = await writeRecordAndRawJson({
    bucket: targetBucket,
    client,
    pair: headPair,
    imageBuffer: headImageBuffer,
    rawJson: headRawJson
  });
  manifest.items[sourceRecord.id] = toManifestEntry(sourceRecord);

  await asyncPool(limit, tailPairs, async (pair) => {
    const rawJsonBuffer = await fs.readFile(pair.jsonPath);
    const rawJson = JSON.parse(rawJsonBuffer.toString("utf8"));
    const normalized = normalizeFixtureJson(rawJson);
    const id = createStableId(pair.baseName, headImageBuffer, rawJsonBuffer);
    const imageKey = `images/${id}.png`;
    const rawJsonKey = `raw-json/${id}.json`;
    const recordKey = `records/${id}.json`;

    await Promise.all([
      client.copyObject(targetBucket, sourceImageKey, imageKey, {
        contentType: "image/png"
      }),
      client.putJson(targetBucket, rawJsonKey, rawJson),
      client.putJson(targetBucket, recordKey, {
        id,
        baseName: pair.baseName,
        imageKey,
        rawJsonKey,
        recordKey,
        sourcePath: pair.imagePath,
        meta: normalized.meta,
        tag: normalized.tag
      })
    ]);

    manifest.items[id] = toManifestEntry({
      id,
      baseName: pair.baseName,
      imageKey,
      rawJsonKey,
      recordKey,
      sourcePath: pair.imagePath,
      meta: normalized.meta,
      tag: normalized.tag
    });
  });

  manifest.updatedAt = new Date().toISOString();
  manifest.count = Object.keys(manifest.items).length;
  await client.putJson(targetBucket, "manifests/catalog.json", manifest);

  const ingestMs = round(performance.now() - startedAt);
  return {
    ingestResult: {
      inputDir: null,
      processed: pairs.length,
      uploaded: pairs.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      orphanBases: []
    },
    ingestMs,
    sample: sourceRecord
  };
}

async function writeRecordAndRawJson({ bucket: targetBucket, client, pair, imageBuffer, rawJson }) {
  const normalized = normalizeFixtureJson(rawJson);
  const rawJsonBuffer = Buffer.from(JSON.stringify(rawJson, null, 2), "utf8");
  const id = createStableId(pair.baseName, imageBuffer, rawJsonBuffer);
  const imageKey = `images/${id}.png`;
  const rawJsonKey = `raw-json/${id}.json`;
  const recordKey = `records/${id}.json`;

  await Promise.all([
    client.putObject(targetBucket, imageKey, imageBuffer, "image/png"),
    client.putJson(targetBucket, rawJsonKey, rawJson),
    client.putJson(targetBucket, recordKey, {
      id,
      baseName: pair.baseName,
      imageKey,
      rawJsonKey,
      recordKey,
      sourcePath: pair.imagePath,
      meta: normalized.meta,
      tag: normalized.tag
    })
  ]);

  return {
    id,
    baseName: pair.baseName,
    imageKey,
    rawJsonKey,
    recordKey,
    sourcePath: pair.imagePath,
    meta: normalized.meta,
    tag: normalized.tag
  };
}

async function asyncPool(limit, items, iteratee) {
  const pending = new Set();
  const results = [];

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

function createEmptyManifest() {
  return {
    version: 1,
    updatedAt: null,
    count: 0,
    items: {}
  };
}

function toManifestEntry(record) {
  const aiResult = record.tag.aiResult ?? record.tag.result ?? record.tag.inspectionResult;
  const threshold = Number(record.tag.threshold ?? record.tag.inspectionThreshold ?? record.tag["임계치"]);
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

function sanitizeBucketName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function round(value) {
  return Number(value.toFixed(2));
}
