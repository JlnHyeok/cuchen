import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IngestService } from "../src/ingest/application/ingest.service.js";
import { MemoryBlobStorage } from "../src/images/infrastructure/memory/blob.storage.js";
import { MemoryCatalogRepository } from "../src/catalog/infrastructure/memory/catalog.repository.js";

test("ingest service stores metadata and blob in memory mode", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-test-"));
  const imagePath = path.join(rootDir, "sample.png");
  const jsonPath = path.join(rootDir, "sample.json");
  const imageBuffer = Buffer.from(SAMPLE_PNG_BASE64, "base64");
  await fs.writeFile(imagePath, imageBuffer);
  await fs.writeFile(
    jsonPath,
    JSON.stringify({
      productId: "PRD-10001",
      capturedAt: "2026-04-21T10:00:00.000Z",
      div: "top",
      result: "PASS",
      threshold: 0.42,
      lotNo: "LOT-001",
      processId: "PROC-01",
      version: "v1"
    })
  );

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const record = await service.syncPair({
    relativeKey: "sample",
    imagePath,
    jsonPath,
    fileName: "sample",
    fileExt: ".png"
  });
  assert.equal(record.syncStatus, "synced");
  const loaded = await catalog.findById(record.imageId);
  assert.ok(loaded);
  assert.equal(loaded?.metadata.productId, "PRD-10001");
  assert.equal(loaded?.metadata.product_id, undefined);
  assert.equal(loaded?.metadata.processCode, undefined);
  assert.equal(loaded?.metadata.version, "v1");
  assert.equal(loaded?.metadata.size, imageBuffer.length);
});

test("ingest service normalizes metadata to productId and processId only", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-metadata-contract-"));
  const imagePath = path.join(rootDir, "sample.png");
  const jsonPath = path.join(rootDir, "sample.json");
  await fs.writeFile(imagePath, Buffer.from(SAMPLE_PNG_BASE64, "base64"));
  await fs.writeFile(
    jsonPath,
    JSON.stringify({
      product_id: "PRD-LEGACY-001",
      div: "bot-inf",
      time: "2026-04-29T13:45:00.000Z",
      processCode: "P2-BOT-INF",
      processId: "PROC2-BOT-INF",
      result: "OK",
      threshold: 0.78,
      prob: 0.89,
      source: "legacy-source"
    })
  );

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const record = await service.syncPair({
    relativeKey: "sample",
    imagePath,
    jsonPath,
    fileName: "sample",
    fileExt: ".png"
  });

  assert.equal(record.imageId, "prd-legacy-001-bot-inf");
  assert.equal(record.metadata.productId, "PRD-LEGACY-001");
  assert.equal(record.metadata.processId, "PROC2-BOT-INF");
  assert.equal(record.metadata.product_id, undefined);
  assert.equal(record.metadata.processCode, undefined);
  assert.equal(record.metadata.process_code, undefined);
  assert.equal(record.metadata.source, undefined);
});

test("scanAndIngest walks nested directories", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-scan-"));
  const nestedDir = path.join(rootDir, "nested", "deeper");
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(nestedDir, "sample.png"), Buffer.from(SAMPLE_PNG_BASE64, "base64"));
  await fs.writeFile(
    path.join(nestedDir, "sample.json"),
    JSON.stringify({
      productId: "PRD-20002",
      capturedAt: "2026-04-21T10:30:00.000Z",
      div: "bot",
      result: "FAIL",
      threshold: 0.12
    })
  );

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const outcome = await service.scanAndIngest(rootDir);

  assert.equal(outcome.processed, 1);
  assert.equal(outcome.synced, 1);
  assert.equal(await pathExists(path.join(nestedDir, "sample.png")), false);
  assert.equal(await pathExists(path.join(nestedDir, "sample.json")), false);
  assert.equal(await pathExists(path.join(rootDir, "processed", "nested", "deeper", "sample.png")), false);
  assert.equal(await pathExists(path.join(rootDir, "processed", "nested", "deeper", "sample.json")), false);
  const records = await catalog.listPendingPairs();
  assert.equal(records.length, 0);
  const searchResult = await catalog.search({ productNo: "PRD-20002" }, 1, 20);
  assert.equal(searchResult.items[0]?.metadata.version, "v1");
  assert.equal(searchResult.items[0]?.metadata.size, Buffer.from(SAMPLE_PNG_BASE64, "base64").length);

  const secondOutcome = await service.scanAndIngest(rootDir);
  assert.equal(secondOutcome.processed, 0);
  assert.equal(secondOutcome.synced, 0);
});

test("scanAndIngest moves failed pairs into failed directory", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-failed-"));
  const imagePath = path.join(rootDir, "bad.png");
  const jsonPath = path.join(rootDir, "bad.json");
  await fs.writeFile(imagePath, Buffer.from(SAMPLE_PNG_BASE64, "base64"));
  await fs.writeFile(jsonPath, "{");

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const outcome = await service.scanAndIngest(rootDir);

  assert.equal(outcome.processed, 1);
  assert.equal(outcome.failed, 1);
  assert.equal(await pathExists(imagePath), false);
  assert.equal(await pathExists(jsonPath), false);
  assert.equal(await pathExists(path.join(rootDir, "failed", "bad.png")), true);
  assert.equal(await pathExists(path.join(rootDir, "failed", "bad.json")), true);

  const secondOutcome = await service.scanAndIngest(rootDir);
  assert.equal(secondOutcome.processed, 0);
});

test("ingestFilebase stores four division pairs and deletes successful files", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-filebase-"));
  await writeDivisionPairs(rootDir, "cuchen-test");

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const outcome = await service.ingestFilebase(rootDir, "cuchen-test");

  assert.deepEqual(outcome, { processed: 4, synced: 4, partial: 0, failed: 0, skipped: 0 });
  for (const div of IMAGE_DIVS) {
    assert.equal(await pathExists(path.join(rootDir, `cuchen-test-${div}.png`)), false);
    assert.equal(await pathExists(path.join(rootDir, `cuchen-test-${div}.json`)), false);
  }
  assert.equal(await pathExists(path.join(rootDir, "processed")), false);
  assert.equal(await pathExists(path.join(rootDir, "failed")), false);

  const searchResult = await catalog.search({ productNo: "CUCHEN-TEST" }, 1, 20);
  assert.equal(searchResult.total, 4);
});

test("ingestFilebase rejects missing division files before ingesting", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-filebase-missing-"));
  await writeDivisionPairs(rootDir, "cuchen-test");
  await fs.rm(path.join(rootDir, "cuchen-test-bot-inf.json"));

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);

  await assert.rejects(() => service.ingestFilebase(rootDir, "cuchen-test"), /missing ingest files/);
  assert.equal((await catalog.search({ productNo: "CUCHEN-TEST" }, 1, 20)).total, 0);
  assert.equal(await pathExists(path.join(rootDir, "cuchen-test-top.png")), true);
  assert.equal(await pathExists(path.join(rootDir, "failed")), false);
});

test("ingestFilebase moves failed pairs into failed directory", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-filebase-failed-"));
  await writeDivisionPairs(rootDir, "cuchen-test");
  await fs.writeFile(path.join(rootDir, "cuchen-test-bot-inf.json"), "{");

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const outcome = await service.ingestFilebase(rootDir, "cuchen-test");

  assert.deepEqual(outcome, { processed: 4, synced: 3, partial: 0, failed: 1, skipped: 0 });
  assert.equal(await pathExists(path.join(rootDir, "cuchen-test-bot-inf.png")), false);
  assert.equal(await pathExists(path.join(rootDir, "cuchen-test-bot-inf.json")), false);
  assert.equal(await pathExists(path.join(rootDir, "failed", "cuchen-test-bot-inf.png")), true);
  assert.equal(await pathExists(path.join(rootDir, "failed", "cuchen-test-bot-inf.json")), true);
});

test("ingest service upserts duplicate product and div from different paths", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-dedupe-"));
  const firstDir = path.join(rootDir, "first");
  const secondDir = path.join(rootDir, "second");
  await fs.mkdir(firstDir, { recursive: true });
  await fs.mkdir(secondDir, { recursive: true });
  const firstImagePath = path.join(firstDir, "sample.png");
  const firstJsonPath = path.join(firstDir, "sample.json");
  const secondImagePath = path.join(secondDir, "sample.png");
  const secondJsonPath = path.join(secondDir, "sample.json");
  const imageBuffer = Buffer.from(SAMPLE_PNG_BASE64, "base64");
  const metadata = {
    productId: "PRD-30003",
    div: "top",
    capturedAt: "2026-04-21T11:00:00.000Z",
    result: "OK",
    threshold: 0.9
  };
  await fs.writeFile(firstImagePath, imageBuffer);
  await fs.writeFile(firstJsonPath, JSON.stringify(metadata));
  await fs.writeFile(secondImagePath, imageBuffer);
  await fs.writeFile(secondJsonPath, JSON.stringify({ ...metadata, capturedAt: "2026-04-21T11:05:00.000Z" }));

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const firstRecord = await service.syncPair({
    relativeKey: "first/sample",
    imagePath: firstImagePath,
    jsonPath: firstJsonPath,
    fileName: "sample",
    fileExt: ".png"
  });
  const secondRecord = await service.syncPair({
    relativeKey: "second/sample",
    imagePath: secondImagePath,
    jsonPath: secondJsonPath,
    fileName: "sample",
    fileExt: ".png"
  });

  assert.equal(firstRecord.imageId, "prd-30003-top");
  assert.equal(secondRecord.imageId, "prd-30003-top");
  const searchResult = await catalog.search({ productNo: "PRD-30003" }, 1, 20);
  assert.equal(searchResult.total, 1);
  assert.equal(searchResult.items[0]?.metadata.capturedAt, "2026-04-21T11:05:00.000Z");
});

test("ingest service dedupes product and div case-insensitively", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-case-dedupe-"));
  const firstImagePath = path.join(rootDir, "first.png");
  const firstJsonPath = path.join(rootDir, "first.json");
  const secondImagePath = path.join(rootDir, "second.png");
  const secondJsonPath = path.join(rootDir, "second.json");
  const imageBuffer = Buffer.from(SAMPLE_PNG_BASE64, "base64");
  await fs.writeFile(firstImagePath, imageBuffer);
  await fs.writeFile(
    firstJsonPath,
    JSON.stringify({
      productId: "PRD-Case-001",
      div: "TOP",
      capturedAt: "2026-04-21T12:00:00.000Z",
      result: "OK",
      threshold: 0.9
    })
  );
  await fs.writeFile(secondImagePath, imageBuffer);
  await fs.writeFile(
    secondJsonPath,
    JSON.stringify({
      productId: "prd-case-001",
      div: "top",
      capturedAt: "2026-04-21T12:05:00.000Z",
      result: "OK",
      threshold: 0.9
    })
  );

  const catalog = new MemoryCatalogRepository();
  const blob = new MemoryBlobStorage();
  await catalog.init();
  await blob.init();
  const service = new IngestService(catalog, blob);
  const firstRecord = await service.syncPair({
    relativeKey: "first",
    imagePath: firstImagePath,
    jsonPath: firstJsonPath,
    fileName: "first",
    fileExt: ".png"
  });
  const secondRecord = await service.syncPair({
    relativeKey: "second",
    imagePath: secondImagePath,
    jsonPath: secondJsonPath,
    fileName: "second",
    fileExt: ".png"
  });

  assert.equal(firstRecord.imageId, "prd-case-001-top");
  assert.equal(secondRecord.imageId, "prd-case-001-top");
  const searchResult = await catalog.search({ productNo: "PRD-Case-001" }, 1, 20);
  assert.equal(searchResult.total, 1);
  assert.equal(searchResult.items[0]?.metadata.capturedAt, "2026-04-21T12:05:00.000Z");
});

test("memory catalog search supports canonical metadata fields", async () => {
  const catalog = new MemoryCatalogRepository();
  await catalog.init();
  await catalog.upsert({
    imageId: "canonical-01",
    bucket: "test-bucket",
    fileName: "canonical-top",
    fileExt: "png",
    sourcePath: "canonical-top.png",
    contentHash: "hash",
    imageKey: "images/canonical-01.png",
    thumbnailKey: "thumbnails/canonical-01.webp",
    metadata: {
      productId: "CUCHEN-00001",
      div: "top",
      time: "2026-04-21T10:00:00.000Z",
      result: "PASS",
      threshold: 0.42,
      prob: 0.87,
      lotNo: "LOT-001",
      processId: "PROC-TOP",
      version: "v1"
    },
    syncStatus: "synced",
    createdAt: "2026-04-21T10:00:00.000Z",
    updatedAt: "2026-04-21T10:00:00.000Z"
  });

  const result = await catalog.search(
    {
      productNo: "CUCHEN-00001",
      lotNo: "LOT",
      processId: "PROC",
      version: "v1",
      div: "top",
      capturedAtFrom: "2026-04-21T00:00:00.000Z",
      capturedAtTo: "2026-04-21T23:59:59.999Z",
      result: "OK"
    },
    1,
    20
  );

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.imageId, "canonical-01");

  const noMatch = await catalog.search(
    {
      lotNo: "LOT-NOT-FOUND",
      processId: "PROC-NOT-FOUND"
    },
    1,
    20
  );

  assert.equal(noMatch.total, 0);
});

test("memory catalog search supports product-level pagination", async () => {
  const catalog = new MemoryCatalogRepository();
  await catalog.init();
  await catalog.upsert(createCatalogRecord("product-a-top", "PRODUCT-A", "top", "2026-04-21T10:00:00.000Z"));
  await catalog.upsert(createCatalogRecord("product-a-bot", "PRODUCT-A", "bot", "2026-04-21T10:01:00.000Z"));
  await catalog.upsert(createCatalogRecord("product-b-top", "PRODUCT-B", "top", "2026-04-22T10:00:00.000Z"));

  const firstPage = await catalog.search({ productPage: true }, 1, 1);
  assert.equal(firstPage.total, 2);
  assert.equal(firstPage.totalData, 3);
  assert.deepEqual(firstPage.items.map((item) => item.metadata.productId), ["PRODUCT-B"]);

  const secondPage = await catalog.search({ productPage: true }, 2, 1);
  assert.equal(secondPage.total, 2);
  assert.equal(secondPage.totalData, 3);
  assert.deepEqual(secondPage.items.map((item) => item.imageId).sort(), ["product-a-bot", "product-a-top"]);
});

test("memory catalog product search falls back to file name", async () => {
  const catalog = new MemoryCatalogRepository();
  await catalog.init();
  await catalog.upsert({
    ...createCatalogRecord("search-check", "", "top", "2026-04-22T10:00:00.000Z"),
    fileName: "search-check",
    metadata: {
      lotNo: "LOT-001",
      processId: "PROC-01"
    }
  });

  const result = await catalog.search({ productNo: "search" }, 1, 20);

  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.imageId, "search-check");
});

test("memory catalog removes existing case-variant product and div duplicates", async () => {
  const catalog = new MemoryCatalogRepository();
  await catalog.init();
  await catalog.upsert(createCatalogRecord("legacy-upper", "PRD-CASE-002", "TOP", "2026-04-21T10:00:00.000Z"));
  await catalog.upsert(createCatalogRecord("legacy-lower", "prd-case-002", "top", "2026-04-21T10:01:00.000Z"));
  await catalog.upsert(createCatalogRecord("prd-case-002-top", "Prd-Case-002", "Top", "2026-04-21T10:02:00.000Z"));

  const result = await catalog.search({ productNo: "PRD-CASE-002", productPage: true }, 1, 20);

  assert.equal(result.total, 1);
  assert.equal(result.totalData, 1);
  assert.deepEqual(result.items.map((item) => item.imageId), ["prd-case-002-top"]);
});

test("memory catalog product pagination groups file-name fallback divisions", async () => {
  const catalog = new MemoryCatalogRepository();
  await catalog.init();
  await catalog.upsert(createFileNameFallbackRecord("bulk-0001-top", "2026-04-22T10:00:00.000Z"));
  await catalog.upsert(createFileNameFallbackRecord("bulk-0001-bot", "2026-04-22T10:01:00.000Z"));
  await catalog.upsert(createFileNameFallbackRecord("bulk-0001-top-inf", "2026-04-22T10:02:00.000Z"));
  await catalog.upsert(createFileNameFallbackRecord("bulk-0001-bot-inf", "2026-04-22T10:03:00.000Z"));

  const result = await catalog.search({ productPage: true }, 1, 20);

  assert.equal(result.total, 1);
  assert.equal(result.totalData, 4);
  assert.deepEqual(result.items.map((item) => item.imageId).sort(), [
    "bulk-0001-bot",
    "bulk-0001-bot-inf",
    "bulk-0001-top",
    "bulk-0001-top-inf"
  ]);
});

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8D8WkAAAAASUVORK5CYII=";
const IMAGE_DIVS = ["top", "bot", "top-inf", "bot-inf"] as const;

function createCatalogRecord(imageId: string, productId: string, div: string, updatedAt: string) {
  return {
    imageId,
    bucket: "test-bucket",
    fileName: imageId,
    fileExt: "png" as const,
    sourcePath: `${imageId}.png`,
    contentHash: "hash",
    imageKey: `images/${imageId}.png`,
    thumbnailKey: `thumbnails/${imageId}.webp`,
    metadata: {
      productId,
      div,
      time: updatedAt,
      result: "PASS",
      threshold: 0.42
    },
    syncStatus: "synced" as const,
    createdAt: updatedAt,
    updatedAt
  };
}

function createFileNameFallbackRecord(imageId: string, updatedAt: string) {
  return {
    imageId,
    bucket: "test-bucket",
    fileName: imageId,
    fileExt: "jpg" as const,
    sourcePath: `${imageId}.jpg`,
    contentHash: "hash",
    imageKey: `images/${imageId}.jpg`,
    thumbnailKey: `thumbnails/${imageId}.webp`,
    metadata: {},
    syncStatus: "synced" as const,
    createdAt: updatedAt,
    updatedAt
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeDivisionPairs(rootDir: string, filebase: string): Promise<void> {
  for (const div of IMAGE_DIVS) {
    await fs.writeFile(path.join(rootDir, `${filebase}-${div}.png`), Buffer.from(SAMPLE_PNG_BASE64, "base64"));
    await fs.writeFile(
      path.join(rootDir, `${filebase}-${div}.json`),
      JSON.stringify({
        productId: "CUCHEN-TEST",
        capturedAt: "2026-04-30T04:00:00.000Z",
        div,
        result: "OK",
        threshold: 0.82,
        lotNo: "LOT-001",
        processId: `PROC-${div.toUpperCase()}`,
        version: "test-v1"
      })
    );
  }
}
