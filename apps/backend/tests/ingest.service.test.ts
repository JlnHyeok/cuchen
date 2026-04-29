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
      productNo: "PRD-10001",
      capturedAt: "2026-04-21T10:00:00.000Z",
      processCode: "P-001",
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
  assert.equal(loaded?.metadata.productNo, "PRD-10001");
  assert.equal(loaded?.metadata.version, "v1");
  assert.equal(loaded?.metadata.size, imageBuffer.length);
});

test("scanAndIngest walks nested directories", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-backend-scan-"));
  const nestedDir = path.join(rootDir, "nested", "deeper");
  await fs.mkdir(nestedDir, { recursive: true });
  await fs.writeFile(path.join(nestedDir, "sample.png"), Buffer.from(SAMPLE_PNG_BASE64, "base64"));
  await fs.writeFile(
    path.join(nestedDir, "sample.json"),
    JSON.stringify({
      productNo: "PRD-20002",
      capturedAt: "2026-04-21T10:30:00.000Z",
      processCode: "P-002",
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
  const records = await catalog.listPendingPairs();
  assert.equal(records.length, 0);
  const searchResult = await catalog.search({ productNo: "PRD-20002" }, 1, 20);
  assert.equal(searchResult.items[0]?.metadata.version, "v1");
  assert.equal(searchResult.items[0]?.metadata.size, Buffer.from(SAMPLE_PNG_BASE64, "base64").length);
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
    product_id: "PRD-30003",
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
      product_id: "CUCHEN-00001",
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
      processCode: "top",
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
  assert.deepEqual(firstPage.items.map((item) => item.metadata.product_id), ["PRODUCT-B"]);

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
      product_id: productId,
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
    metadata: {
      source: "minio-reconcile"
    },
    syncStatus: "synced" as const,
    createdAt: updatedAt,
    updatedAt
  };
}
