import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { getConfig } from "../../src/config.js";
import { createApp } from "../../src/app.js";
import { FixtureService } from "../../src/services/fixtureService.js";
import { IngestService } from "../../src/services/ingestService.js";
import { createStore } from "../../src/storage/createStore.js";

const config = getConfig();
const count = Number.parseInt(process.argv[2] || "1000", 10);
const fixtureDir = path.join(config.defaultFixtureDir, `benchmark-${count}`);
await fs.mkdir(config.benchmarkReportDir, { recursive: true });

const fixtureService = new FixtureService();
const ingestService = new IngestService({
  store: createStore(config),
  concurrency: config.ingestConcurrency
});

const manifestLoadStarted = performance.now();
await ingestService.init();
const manifestLoadMs = round(performance.now() - manifestLoadStarted);
await resetDirectory(fixtureDir);

const server = createApp({ fixtureService, ingestService, config });
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

try {
  const fixtureStarted = performance.now();
  await postJson(`${baseUrl}/fixtures/generate`, {
    count,
    outputDir: fixtureDir,
    reuseSingleImage: true
  });
  const fixtureGenerationMs = round(performance.now() - fixtureStarted);

  const ingestStarted = performance.now();
  await postJson(`${baseUrl}/ingest/scan`, { inputDir: fixtureDir });
  const ingestMs = round(performance.now() - ingestStarted);

  const searchAll = await getJson(`${baseUrl}/images/search?page=1&pageSize=1`);
  if (!searchAll.items.length) {
    throw new Error("benchmark ingest produced no searchable items");
  }

  const sample = searchAll.items[0];
  const productNo = sample.productNo;
  const singleThresholdMin = Math.max(0, Number(sample.threshold) - 0.05);
  const singleThresholdMax = Math.min(1, Number(sample.threshold) + 0.05);

  const singleImageTimings = await timeMany(20, async () => {
    const response = await fetch(`${baseUrl}/images/${sample.id}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }
    await response.arrayBuffer();
  });

  const productSearchTimings = await timeMany(20, async () => {
    const response = await fetch(
      `${baseUrl}/images/search?productNo=${encodeURIComponent(productNo)}&page=1&pageSize=20`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    await response.json();
  });

  const compoundSearchTimings = await timeMany(20, async () => {
    const response = await fetch(
      `${baseUrl}/images/search?aiResult=${encodeURIComponent(sample.aiResult)}&thresholdMin=${singleThresholdMin}&thresholdMax=${singleThresholdMax}&page=1&pageSize=20`
    );
    if (!response.ok) {
      throw new Error(await response.text());
    }
    await response.json();
  });

  const report = {
    generatedAt: new Date().toISOString(),
    count,
    fixtureDir,
    endpoint: config.minioEndpoint,
    manifestLoadMs,
    fixtureGenerationMs,
    ingestMs,
    imageGetMs: summarizeTimings(singleImageTimings),
    productSearchMs: summarizeTimings(productSearchTimings),
    compoundSearchMs: summarizeTimings(compoundSearchTimings)
  };

  const reportPath = path.join(config.benchmarkReportDir, `benchmark-${count}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ reportPath, report }, null, 2));
} finally {
  server.close();
  await once(server, "close");
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

async function timeMany(iterations, fn) {
  const timings = [];
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await fn();
    timings.push(performance.now() - started);
  }
  return timings;
}

function summarizeTimings(timings) {
  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return {
    p50: round(p50),
    p95: round(p95),
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

async function resetDirectory(targetDir) {
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
}
