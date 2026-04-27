import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { getConfig } from "../../src/config.js";
import { FixtureService } from "../../src/services/fixtureService.js";
import { normalizeFixtureJson, scanInputDirectory } from "../../src/services/ingestService.js";
import { createStableId } from "../../src/utils/hash.js";
import { MinioObjectStore } from "../../src/storage/objectStore.js";
import { MinioNativeObjectStore } from "../../src/storage/nativeObjectStore.js";

const config = getConfig();
const count = Number.parseInt(process.argv[2] || "1000", 10);
const bucketPrefix = process.argv[3] || "pairs-bench";
const imageMegabytes = Number.parseFloat(process.argv[4] || "4");
const runId = Date.now().toString(36);
const fixtureDir = path.join(config.defaultFixtureDir, `${bucketPrefix}-${count}-${runId}`);
const reportDir = config.benchmarkReportDir;
const logDir = path.join(reportDir, "logs");
const populationConcurrency = Math.max(32, config.ingestConcurrency * 4);

await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(logDir, { recursive: true });
await resetDirectory(fixtureDir);

const fixtureService = new FixtureService();
await fixtureService.generateFixtures({
  count,
  outputDir: fixtureDir,
  imageMegabytes
});

const scan = await scanInputDirectory(fixtureDir);
if (!scan.pairs.length) {
  throw new Error("No fixture pairs were generated");
}

const pairs = scan.pairs;
const samplePair = pairs[0];
const [sampleImageBuffer, sampleJsonBuffer] = await Promise.all([
  fs.readFile(samplePair.imagePath),
  fs.readFile(samplePair.jsonPath)
]);
const sampleId = createStableId(samplePair.baseName, sampleImageBuffer, sampleJsonBuffer);
const sampleRecordKey = `records/${sampleId}.json`;
const sampleImageKey = `images/${sampleId}.png`;
const recordBucket = `${bucketPrefix}-record-${count}-${runId}`;
const nativeBucket = `${bucketPrefix}-native-${count}-${runId}`;

const recordStore = new MinioObjectStore({ ...config, minioBucket: recordBucket });
const nativeStore = new MinioNativeObjectStore({ ...config, minioBucket: nativeBucket });

const recordResult = await populateRecordBucket(recordStore, pairs, {
  recordKey: sampleRecordKey,
  imageKey: sampleImageKey
});
const nativeResult = await populateNativeBucket(nativeStore, pairs, {
  imageKey: sampleImageKey
});

const comparison = {
  generatedAt: new Date().toISOString(),
  count,
  bucketPrefix,
  imageMegabytes,
  fixtureDir,
  recordJson: recordResult,
  nativeMetaTags: nativeResult
};

const reportPath = path.join(reportDir, `populate-buckets-${bucketPrefix}-${count}.json`);
await fs.writeFile(reportPath, JSON.stringify(comparison, null, 2), "utf8");

const logPath = path.join(logDir, `populate-buckets-${bucketPrefix}-${count}.md`);
await fs.writeFile(logPath, renderLog(comparison), "utf8");

await fs.rm(fixtureDir, { recursive: true, force: true });

console.log(JSON.stringify({ reportPath, logPath, comparison }, null, 2));

async function populateRecordBucket(store, pairs, sample) {
  await store.init();
  const manifest = createEmptyManifest();
  const startedAt = performance.now();

  await asyncPool(populationConcurrency, pairs, async (pair) => {
    const [imageBuffer, rawJsonBuffer] = await Promise.all([
      fs.readFile(pair.imagePath),
      fs.readFile(pair.jsonPath)
    ]);
    const normalized = normalizeFixtureJson(JSON.parse(rawJsonBuffer.toString("utf8")));
    const id = createStableId(pair.baseName, imageBuffer, rawJsonBuffer);
    const imageKey = `images/${id}.png`;
    const rawJsonKey = `raw-json/${id}.json`;
    const recordKey = `records/${id}.json`;
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
      store.putImage(imageKey, imageBuffer),
      store.putRawJson(rawJsonKey, rawJsonBuffer),
      store.putRecord(recordKey, record)
    ]);

    manifest.items[id] = toManifestEntry(record);
  });

  manifest.updatedAt = new Date().toISOString();
  manifest.count = Object.keys(manifest.items).length;
  await store.saveManifest(manifest);

  const uploadMs = round(performance.now() - startedAt);
  const readMetrics = await measureRecordReads(store, sample);

  return {
    bucket: store.bucket,
    processed: pairs.length,
    uploadMs,
    uploadAverageMsPerItem: round(uploadMs / pairs.length),
    ...readMetrics
  };
}

async function populateNativeBucket(store, pairs, sample) {
  await store.init();
  const startedAt = performance.now();

  await asyncPool(populationConcurrency, pairs, async (pair) => {
    const [imageBuffer, rawJsonBuffer] = await Promise.all([
      fs.readFile(pair.imagePath),
      fs.readFile(pair.jsonPath)
    ]);
    const normalized = normalizeFixtureJson(JSON.parse(rawJsonBuffer.toString("utf8")));
    const id = createStableId(pair.baseName, imageBuffer, rawJsonBuffer);
    const imageKey = `images/${id}.png`;

    await store.putImageWithContext(imageKey, imageBuffer, {
      contentType: "image/png",
      metadata: normalized.meta,
      tags: normalized.tag
    });
  });

  const uploadMs = round(performance.now() - startedAt);
  const readMetrics = await measureNativeReads(store, sample);

  return {
    bucket: store.bucket,
    processed: pairs.length,
    uploadMs,
    uploadAverageMsPerItem: round(uploadMs / pairs.length),
    ...readMetrics
  };
}

function createFixtureJson(index) {
  const sequence = index - 1;
  const capturedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)).toISOString();
  const threshold = Number(((sequence * 3) % 100 / 100).toFixed(2));
  return {
    title: `sample title ${String(index).padStart(6, "0")}`,
    productNo: `PRD-${String(100000 + index)}`,
    capturedAt,
    lotNo: `LOT-${String((index % 30) + 1).padStart(3, "0")}`,
    cameraId: `CAM-${String((index % 8) + 1).padStart(2, "0")}`,
    result: ["PASS", "FAIL", "REVIEW"][index % 3],
    threshold,
    inspectorModel: `vision-v${(index % 4) + 1}`,
    inspectedAt: new Date(Date.parse(capturedAt) + 3000).toISOString()
  };
}

async function measureRecordReads(store, sample) {
  const recordReadTimings = await measureMany(5, async () => {
    await store.getRecord(sample.recordKey);
  });
  const imageReadTimings = await measureMany(5, async () => {
    const image = await store.getImage(sample.imageKey);
    await drainStream(image.stream);
  });

  return {
    recordReadMs: summarize(recordReadTimings),
    imageReadMs: summarize(imageReadTimings)
  };
}

async function measureNativeReads(store, sample) {
  const metadataReadTimings = await measureMany(5, async () => {
    await store.getMetadataHeaders(sample.imageKey);
  });
  const tagsReadTimings = await measureMany(5, async () => {
    await store.getTags(sample.imageKey);
  });
  const fullDescriptionTimings = await measureMany(5, async () => {
    await store.getMetadataHeaders(sample.imageKey);
    await store.getTags(sample.imageKey);
  });
  const imageReadTimings = await measureMany(5, async () => {
    const image = await store.getImage(sample.imageKey);
    await drainStream(image.stream);
  });

  return {
    metadataReadMs: summarize(metadataReadTimings),
    tagsReadMs: summarize(tagsReadTimings),
    fullDescriptionReadMs: summarize(fullDescriptionTimings),
    imageReadMs: summarize(imageReadTimings)
  };
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
  return {
    id: record.id,
    baseName: record.baseName,
    imageKey: record.imageKey,
    rawJsonKey: record.rawJsonKey,
    recordKey: record.recordKey,
    productNo: record.meta.productNo,
    capturedAt: record.meta.capturedAt,
    aiResult,
    threshold: Number(record.tag.threshold ?? record.tag.inspectionThreshold ?? record.tag["임계치"])
  };
}

function renderLog(comparison) {
  return `# Bucket Population Log

- generatedAt: ${comparison.generatedAt}
- count: ${comparison.count}
- bucketPrefix: ${comparison.bucketPrefix}
- imageMegabytes: ${comparison.imageMegabytes}
- fixtureDir: ${comparison.fixtureDir}

## Record Bucket

- bucket: ${comparison.recordJson.bucket}
- uploadMs: ${comparison.recordJson.uploadMs}
- uploadAverageMsPerItem: ${comparison.recordJson.uploadAverageMsPerItem}
- imageRead p50/p95: ${comparison.recordJson.imageReadMs.p50} / ${comparison.recordJson.imageReadMs.p95} ms
- recordRead p50/p95: ${comparison.recordJson.recordReadMs.p50} / ${comparison.recordJson.recordReadMs.p95} ms

## Native Bucket

- bucket: ${comparison.nativeMetaTags.bucket}
- uploadMs: ${comparison.nativeMetaTags.uploadMs}
- uploadAverageMsPerItem: ${comparison.nativeMetaTags.uploadAverageMsPerItem}
- imageRead p50/p95: ${comparison.nativeMetaTags.imageReadMs.p50} / ${comparison.nativeMetaTags.imageReadMs.p95} ms
- metadataRead p50/p95: ${comparison.nativeMetaTags.metadataReadMs.p50} / ${comparison.nativeMetaTags.metadataReadMs.p95} ms
- tagsRead p50/p95: ${comparison.nativeMetaTags.tagsReadMs.p50} / ${comparison.nativeMetaTags.tagsReadMs.p95} ms
- fullDescriptionRead p50/p95: ${comparison.nativeMetaTags.fullDescriptionReadMs.p50} / ${comparison.nativeMetaTags.fullDescriptionReadMs.p95} ms
`;
}

function summarize(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1])
  };
}

function percentile(sorted, ratio) {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index];
}

function round(value) {
  return Number(value.toFixed(2));
}

async function measureMany(iterations, fn) {
  const timings = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await fn();
    timings.push(performance.now() - started);
  }
  return timings;
}

async function asyncPool(limit, items, iteratee) {
  const pending = new Set();

  for (const item of items) {
    const task = Promise.resolve().then(() => iteratee(item));
    pending.add(task);
    task.finally(() => pending.delete(task));

    if (pending.size >= limit) {
      await Promise.race(pending);
    }
  }

  await Promise.all(pending);
}

async function drainStream(stream) {
  if (!stream) {
    return;
  }
  if (typeof stream.pipe === "function") {
    await new Promise((resolve, reject) => {
      stream.on("error", reject);
      stream.on("end", resolve);
      stream.resume();
    });
    return;
  }
  const reader = stream.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) {
      break;
    }
  }
}

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}
