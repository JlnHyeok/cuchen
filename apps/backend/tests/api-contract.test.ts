import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { APP_FILTER, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import type { CatalogRecord } from "../src/shared.js";
import { CatalogController } from "../src/catalog/api/catalog.controller.js";
import { CatalogService } from "../src/catalog/application/catalog.service.js";
import { HealthController } from "../src/health/health.controller.js";
import { ImagesController } from "../src/images/api/images.controller.js";
import { IngestController } from "../src/ingest/api/ingest.controller.js";
import { IngestEventsController } from "../src/ingest/api/ingest-events.controller.js";
import { CATALOG_RECORD_SYNCED_EVENT, IngestEventsService } from "../src/ingest/application/ingest-events.service.js";
import { IngestService } from "../src/ingest/application/ingest.service.js";
import { ScanService } from "../src/ingest/application/scan.service.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "../src/images/application/thumbnail.js";
import { ImagesService } from "../src/images/application/images.service.js";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter.js";
import { ApiResponseInterceptor } from "../src/common/http/api-response.interceptor.js";
import { RequestLoggingInterceptor } from "../src/common/http/request-logging.interceptor.js";
import { BLOB_STORAGE, CATALOG_REPOSITORY } from "../src/storage/storage.tokens.js";
import { MemoryBlobStorage } from "../src/images/infrastructure/memory/blob.storage.js";
import { MemoryCatalogRepository } from "../src/catalog/infrastructure/memory/catalog.repository.js";

let app: Awaited<ReturnType<typeof NestFactory.create>>;
let seed: { record: CatalogRecord; imageBuffer: Buffer };
let catalogRepository: MemoryCatalogRepository;
let tempDir = "";
let originalEnv: Record<string, string | undefined> = {};
let baseUrl = "";

before(async () => {
  originalEnv = {
    STORAGE_MODE: process.env.STORAGE_MODE,
    MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
    MINIO_BUCKET: process.env.MINIO_BUCKET,
    INGEST_ROOT_DIR: process.env.INGEST_ROOT_DIR,
    TEST_IO_DELAY_MS: process.env.TEST_IO_DELAY_MS
  };

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cuchen-contract-"));
  process.env.STORAGE_MODE = "memory";
  process.env.MINIO_ENDPOINT = "http://127.0.0.1:9000";
  process.env.MINIO_BUCKET = "test-bucket";
  process.env.INGEST_ROOT_DIR = path.join(tempDir, "inbox");
  process.env.TEST_IO_DELAY_MS = "0";

  catalogRepository = new MemoryCatalogRepository();
  const blobStorage = new MemoryBlobStorage();
  await catalogRepository.init();
  await blobStorage.init();

  const imageBuffer = Buffer.from(SAMPLE_PNG_BASE64, "base64");
  const thumbnailBuffer = await createThumbnailBuffer(imageBuffer);
  const imageId = "sample-01";
  const record: CatalogRecord = {
    imageId,
    bucket: "test-bucket",
    fileName: "sample",
    fileExt: "png",
    sourcePath: path.join(tempDir, "sample.png"),
    contentHash: createHash("sha256").update(imageBuffer).digest("hex"),
    imageKey: `images/${imageId}.png`,
    thumbnailKey: `thumbnails/${imageId}.webp`,
    rawJsonKey: `metadata/${imageId}.json`,
    metadata: {
      productId: "PRD-10001",
      capturedAt: "2026-04-21T10:00:00.000Z",
      div: "top",
      result: "PASS",
      threshold: 0.42,
      lotNo: "LOT-001",
      processId: "PROC-01",
      version: "v1"
    },
    syncStatus: "synced",
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z"
  };

  await catalogRepository.upsert(record);
  await blobStorage.putImage(record, imageBuffer, "image/png");
  await blobStorage.putThumbnail(record, thumbnailBuffer, THUMBNAIL_CONTENT_TYPE);

  @Module({
    controllers: [HealthController, CatalogController, IngestController, IngestEventsController, ImagesController],
    providers: [
      CatalogService,
      ImagesService,
      IngestService,
      ScanService,
      IngestEventsService,
      { provide: CATALOG_REPOSITORY, useValue: catalogRepository },
      { provide: BLOB_STORAGE, useValue: blobStorage },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
      { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
      { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor }
    ]
  })
  class TestApiModule {}

  app = await NestFactory.create(TestApiModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
  seed = { record, imageBuffer };
});

after(async () => {
  if (app) {
    await app.close();
  }
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
  process.env.STORAGE_MODE = originalEnv.STORAGE_MODE;
  process.env.MINIO_ENDPOINT = originalEnv.MINIO_ENDPOINT;
  process.env.MINIO_BUCKET = originalEnv.MINIO_BUCKET;
  process.env.INGEST_ROOT_DIR = originalEnv.INGEST_ROOT_DIR;
  process.env.TEST_IO_DELAY_MS = originalEnv.TEST_IO_DELAY_MS;
});

test("json endpoints are wrapped in the common envelope", async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  assert.equal(healthResponse.status, 200);
  const healthBody = await healthResponse.json();
  assert.deepEqual(healthBody, {
    success: true,
    message: "ok",
    data: {
      ok: true,
      storageMode: "memory",
      ingestRootDir: path.join(tempDir, "inbox"),
      minioEndpoint: "http://127.0.0.1:9000",
      bucket: "test-bucket"
    },
    errorCode: null,
    errorMessage: null
  });

  const bucketsResponse = await fetch(`${baseUrl}/images/buckets`);
  assert.equal(bucketsResponse.status, 200);
  const bucketsBody = await bucketsResponse.json();
  assert.deepEqual(bucketsBody, {
    success: true,
    message: "ok",
    data: {
      buckets: ["test-bucket"]
    },
    errorCode: null,
    errorMessage: null
  });
});

test("search endpoint is served from the catalog API", async () => {
  const response = await fetch(
    `${baseUrl}/images/search?lotNo=LOT-001&processId=PROC-01&version=v1&page=1&pageSize=20&productPage=1`
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    success: boolean;
    data: {
      total: number;
      totalData: number;
      items: Array<{ imageId: string }>;
    };
  };
  assert.equal(body.success, true);
  assert.equal(body.data.total, 1);
  assert.equal(body.data.totalData, 1);
  assert.equal(body.data.items[0]?.imageId, seed.record.imageId);
});

test("search endpoint paginates by product rows when productPage is enabled", async () => {
  for (let productIndex = 1; productIndex <= 25; productIndex += 1) {
    for (const div of ["top", "bot", "top-inf", "bot-inf"]) {
      const productNo = `PRD-PAGE-${String(productIndex).padStart(4, "0")}`;
      await catalogRepository.upsert({
        ...seed.record,
        imageId: `${productNo}-${div}`,
        fileName: `${productNo}-${div}`,
        metadata: {
          ...seed.record.metadata,
          productId: productNo,
          div
        },
        updatedAt: `2026-04-${String((productIndex % 20) + 1).padStart(2, "0")}T00:00:00.000Z`
      });
    }
  }

  const response = await fetch(`${baseUrl}/images/search?productNo=PRD-PAGE&page=1&pageSize=20&productPage=1`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    success: boolean;
    data: {
      total: number;
      totalData: number;
      items: Array<{ metadata?: Record<string, unknown> }>;
    };
  };
  const rowProductNos = new Set(body.data.items.map((item) => String(item.metadata?.productId ?? "")));

  assert.equal(body.success, true);
  assert.equal(body.data.total, 25);
  assert.equal(body.data.totalData, 100);
  assert.equal(rowProductNos.size, 20);
});

test("filebase ingest endpoint stores listed division files and deletes successes", async () => {
  const inboxDir = path.join(tempDir, "api-inbox");
  await fs.mkdir(inboxDir, { recursive: true });
  await writeDivisionPairs(inboxDir, "api-test");

  const response = await fetch(`${baseUrl}/ingest/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: inboxDir, filebase: "api-test" })
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    success: true,
    message: "ok",
    data: { processed: 4, synced: 4, partial: 0, failed: 0, skipped: 0 },
    errorCode: null,
    errorMessage: null
  });
  assert.equal(await pathExists(path.join(inboxDir, "api-test-top.png")), false);
  assert.equal(await pathExists(path.join(inboxDir, "api-test-top.json")), false);

  const searchResult = await catalogRepository.search({ productNo: "API-TEST" }, 1, 20);
  assert.equal(searchResult.total, 4);
});

test("filebase ingest endpoint emits catalog synced server-sent events", async () => {
  const inboxDir = path.join(tempDir, "api-events-inbox");
  await fs.mkdir(inboxDir, { recursive: true });
  await writeDivisionPairs(inboxDir, "api-events");

  const abort = new AbortController();
  const eventsResponse = await fetch(`${baseUrl}/images/events`, { signal: abort.signal });
  assert.equal(eventsResponse.status, 200);
  const reader = eventsResponse.body?.getReader();
  assert.ok(reader);

  const ingestResponse = await fetch(`${baseUrl}/ingest/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: inboxDir, filebase: "api-events" })
  });
  assert.equal(ingestResponse.status, 201);

  let raw = "";
  while (!raw.includes(CATALOG_RECORD_SYNCED_EVENT)) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    raw += Buffer.from(chunk.value).toString("utf8");
  }

  abort.abort();
  assert.match(raw, new RegExp(`event: ${CATALOG_RECORD_SYNCED_EVENT}`));
  assert.match(raw, /"imageId":"api-events-top"/);
});

test("filebase ingest endpoint rejects missing division files", async () => {
  const inboxDir = path.join(tempDir, "api-missing-inbox");
  await fs.mkdir(inboxDir, { recursive: true });
  await writeDivisionPairs(inboxDir, "api-missing");
  await fs.rm(path.join(inboxDir, "api-missing-bot-inf.json"));

  const response = await fetch(`${baseUrl}/ingest/files`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: inboxDir, filebase: "api-missing" })
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { success: boolean; errorCode: string; errorMessage: string };
  assert.equal(body.success, false);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
  assert.match(body.errorMessage, /missing ingest files/);
  assert.equal(await pathExists(path.join(inboxDir, "api-missing-top.png")), true);
});

test("stream endpoints stay raw", async () => {
  for (const [suffix, expectedType, expectedBody] of [
    ["/blob", "image/png", seed.imageBuffer],
    ["/thumbnail", THUMBNAIL_CONTENT_TYPE, await createThumbnailBuffer(seed.imageBuffer)],
    ["/download", "image/png", seed.imageBuffer]
  ] as const) {
    const response = await fetch(`${baseUrl}/images/${seed.record.imageId}${suffix}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), expectedType);
    if (suffix === "/download") {
      assert.equal(response.headers.get("content-disposition"), `attachment; filename="${seed.record.imageId}"`);
    }
    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(body, expectedBody);
  }
});

test("catalog events endpoint streams raw server-sent events", async () => {
  const abort = new AbortController();
  const response = await fetch(`${baseUrl}/images/events`, { signal: abort.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);

  const events = app.get(IngestEventsService);
  events.publishRecordSynced(seed.record);

  const reader = response.body?.getReader();
  assert.ok(reader);
  let raw = "";
  while (!raw.includes(CATALOG_RECORD_SYNCED_EVENT)) {
    const chunk = await reader.read();
    assert.equal(chunk.done, false);
    raw += Buffer.from(chunk.value).toString("utf8");
  }

  abort.abort();
  assert.match(raw, new RegExp(`event: ${CATALOG_RECORD_SYNCED_EVENT}`));
  assert.match(raw, /"imageId":"sample-01"/);
});

test("not-found responses flow through the error envelope", async () => {
  const metadataResponse = await fetch(`${baseUrl}/images/missing-image/metadata`);
  assert.equal(metadataResponse.status, 404);
  assert.deepEqual(await metadataResponse.json(), {
    success: false,
    message: "request failed",
    data: null,
    errorCode: "NOT_FOUND",
    errorMessage: "Record not found: missing-image"
  });

  const blobResponse = await fetch(`${baseUrl}/images/missing-image/blob`);
  assert.equal(blobResponse.status, 404);
  assert.deepEqual(await blobResponse.json(), {
    success: false,
    message: "request failed",
    data: null,
    errorCode: "NOT_FOUND",
    errorMessage: "Record not found: missing-image"
  });
});

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8D8WkAAAAASUVORK5CYII=";
const IMAGE_DIVS = ["top", "bot", "top-inf", "bot-inf"] as const;

async function writeDivisionPairs(rootDir: string, filebase: string): Promise<void> {
  for (const div of IMAGE_DIVS) {
    await fs.writeFile(path.join(rootDir, `${filebase}-${div}.png`), Buffer.from(SAMPLE_PNG_BASE64, "base64"));
    await fs.writeFile(
      path.join(rootDir, `${filebase}-${div}.json`),
      JSON.stringify({
        productId: filebase.toUpperCase(),
        capturedAt: "2026-04-30T04:00:00.000Z",
        div,
        result: "OK",
        threshold: 0.82,
        lotNo: "LOT-API",
        processId: `PROC-${div.toUpperCase()}`,
        version: "test-v1"
      })
    );
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
