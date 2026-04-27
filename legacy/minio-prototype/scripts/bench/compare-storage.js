import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { getConfig } from "../../src/config.js";
import { FixtureService } from "../../src/services/fixtureService.js";
import {
  normalizeFixtureJson,
  scanInputDirectory,
  IngestService
} from "../../src/services/ingestService.js";
import { createStableId } from "../../src/utils/hash.js";
import { MinioObjectStore } from "../../src/storage/objectStore.js";
import { MinioNativeObjectStore } from "../../src/storage/nativeObjectStore.js";

const config = getConfig();
const count = Number.parseInt(process.argv[2] || "1000", 10);
const bucketPrefix = process.argv[3] || "cmp";
const imageMegabytes = Number.parseFloat(process.argv[4] || "4");
const fixtureDir = path.join(config.defaultFixtureDir, `compare-${count}`);
const reportDir = config.benchmarkReportDir;
const logDir = path.join(config.benchmarkReportDir, "logs");

await fs.mkdir(reportDir, { recursive: true });
await fs.mkdir(logDir, { recursive: true });
await resetDirectory(fixtureDir);

const fixtureService = new FixtureService();
await fixtureService.generateFixtures({
  count,
  outputDir: fixtureDir,
  imageMegabytes,
  reuseSingleImage: true
});

const runId = Date.now().toString(36);
const recordBucket = `${bucketPrefix}-record-${count}-${runId}`;
const nativeBucket = `${bucketPrefix}-native-${count}-${runId}`;

const recordStore = new MinioObjectStore({ ...config, minioBucket: recordBucket });
const nativeStore = new MinioNativeObjectStore({ ...config, minioBucket: nativeBucket });

const recordResult = await runRecordStrategy(recordStore, fixtureDir);
const nativeResult = await runNativeStrategy(nativeStore, fixtureDir);

const comparison = {
  generatedAt: new Date().toISOString(),
  count,
  imageMegabytes,
  fixtureDir,
  recordJson: recordResult,
  nativeMetaTags: nativeResult
};

const reportPath = path.join(reportDir, `storage-compare-${bucketPrefix}-${count}.json`);
await fs.writeFile(reportPath, JSON.stringify(comparison, null, 2), "utf8");

const logPath = path.join(logDir, `storage-compare-${bucketPrefix}-${count}.md`);
await fs.writeFile(logPath, renderComparisonLog(comparison), "utf8");

console.log(JSON.stringify({ reportPath, logPath, comparison }, null, 2));

async function runRecordStrategy(store, inputDir) {
  const service = new IngestService({ store, concurrency: 8 });
  const ingestStarted = performance.now();
  await service.init();
  const ingestResult = await service.ingestDirectory(inputDir);
  const ingestMs = round(performance.now() - ingestStarted);

  const sample = firstSample(service);
  const readMetrics = await measureRecordReads(service, sample.id);

  return {
    bucket: store.bucket,
    ingestResult,
    ingestMs,
    ...readMetrics
  };
}

async function runNativeStrategy(store, inputDir) {
  await store.init();
  const scan = await scanInputDirectory(inputDir);
  const ingestStarted = performance.now();
  const ids = [];

  for (const pair of scan.pairs) {
    const [imageBuffer, rawJsonBuffer] = await Promise.all([
      fs.readFile(pair.imagePath),
      fs.readFile(pair.jsonPath)
    ]);
    const normalized = normalizeFixtureJson(JSON.parse(rawJsonBuffer.toString("utf8")));
    const id = createStableId(pair.baseName, imageBuffer, rawJsonBuffer);
    const imageKey = `images/${id}.png`;
    await store.putImageWithContext(imageKey, imageBuffer, {
      meta: normalized.meta,
      tag: normalized.tag
    });
    ids.push({ id, imageKey });
  }

  const ingestMs = round(performance.now() - ingestStarted);
  const sample = ids[0];
  const readMetrics = await measureNativeReads(store, sample.imageKey);

  return {
    bucket: store.bucket,
    processed: scan.pairs.length,
    ingestMs,
    ...readMetrics
  };
}

async function measureRecordReads(service, id) {
  const recordReadTimings = await measureMany(20, async () => {
    await service.getRecord(id);
  });
  const imageReadTimings = await measureMany(20, async () => {
    const image = await service.getImage(id);
    await drainStream(image.stream);
  });

  return {
    recordReadMs: summarize(recordReadTimings),
    imageReadMs: summarize(imageReadTimings)
  };
}

async function measureNativeReads(store, imageKey) {
  const metadataReadTimings = await measureMany(20, async () => {
    await store.getMetadataHeaders(imageKey);
  });
  const tagsReadTimings = await measureMany(20, async () => {
    await store.getTags(imageKey);
  });
  const fullDescriptionTimings = await measureMany(20, async () => {
    await store.getMetadataHeaders(imageKey);
    await store.getTags(imageKey);
  });
  const imageReadTimings = await measureMany(20, async () => {
    const image = await store.getImage(imageKey);
    await drainStream(image.stream);
  });

  return {
    metadataReadMs: summarize(metadataReadTimings),
    tagsReadMs: summarize(tagsReadTimings),
    fullDescriptionReadMs: summarize(fullDescriptionTimings),
    imageReadMs: summarize(imageReadTimings)
  };
}

function firstSample(service) {
  const entry = Object.values(service.manifest.items)[0];
  if (!entry) {
    throw new Error("No sample record was ingested");
  }
  return entry;
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

function renderComparisonLog(comparison) {
  const record = comparison.recordJson;
  const native = comparison.nativeMetaTags;

  return `# Storage Comparison Log

- generatedAt: ${comparison.generatedAt}
- count: ${comparison.count}
- imageMegabytes: ${comparison.imageMegabytes}
- fixtureDir: ${comparison.fixtureDir}

## Record JSON

- bucket: ${record.bucket}
- ingestMs: ${record.ingestMs} ms
- uploadEstimateMs: ${record.ingestResult.processed ? round(record.ingestMs / record.ingestResult.processed * comparison.count) : "n/a"} ms
- uploadThroughputItemsPerSec: ${formatItemsPerSec(record.ingestResult.processed, record.ingestMs)}
- imageRead p50/p95: ${record.imageReadMs.p50} / ${record.imageReadMs.p95} ms
- recordRead p50/p95: ${record.recordReadMs.p50} / ${record.recordReadMs.p95} ms

## Native Metadata/Tags

- bucket: ${native.bucket}
- ingestMs: ${native.ingestMs} ms
- uploadEstimateMs: ${native.processed ? round(native.ingestMs / native.processed * comparison.count) : "n/a"} ms
- uploadThroughputItemsPerSec: ${formatItemsPerSec(native.processed, native.ingestMs)}
- imageRead p50/p95: ${native.imageReadMs.p50} / ${native.imageReadMs.p95} ms
- metadataRead p50/p95: ${native.metadataReadMs.p50} / ${native.metadataReadMs.p95} ms
- tagsRead p50/p95: ${native.tagsReadMs.p50} / ${native.tagsReadMs.p95} ms
- fullDescriptionRead p50/p95: ${native.fullDescriptionReadMs.p50} / ${native.fullDescriptionReadMs.p95} ms
`;
}

function formatItemsPerSec(count, elapsedMs) {
  if (!count || !elapsedMs) {
    return "n/a";
  }
  return round((count / elapsedMs) * 1000);
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
