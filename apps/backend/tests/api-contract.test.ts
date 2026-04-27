import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { APP_FILTER, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import type { CatalogRecord } from "@cuchen/shared";
import { CatalogController } from "../src/catalog/api/catalog.controller.js";
import { CatalogService } from "../src/catalog/application/catalog.service.js";
import { HealthController } from "../src/health/health.controller.js";
import { ImagesController } from "../src/images/api/images.controller.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "../src/images/application/thumbnail.js";
import { ImagesService } from "../src/images/application/images.service.js";
import { ApiExceptionFilter } from "../src/common/http/api-exception.filter.js";
import { ApiResponseInterceptor } from "../src/common/http/api-response.interceptor.js";
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
      productNo: "PRD-10001",
      capturedAt: "2026-04-21T10:00:00.000Z",
      processCode: "P-001",
      result: "PASS",
      threshold: 0.42,
      lotNo: "LOT-001",
      cameraId: "CAM-01"
    },
    syncStatus: "synced",
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z"
  };

  await catalogRepository.upsert(record);
  await blobStorage.putImage(record, imageBuffer, "image/png");
  await blobStorage.putThumbnail(record, thumbnailBuffer, THUMBNAIL_CONTENT_TYPE);

  @Module({
    controllers: [HealthController, CatalogController, ImagesController],
    providers: [
      CatalogService,
      ImagesService,
      { provide: CATALOG_REPOSITORY, useValue: catalogRepository },
      { provide: BLOB_STORAGE, useValue: blobStorage },
      { provide: APP_FILTER, useClass: ApiExceptionFilter },
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
    `${baseUrl}/images/search?lotNo=LOT-001&cameraId=CAM-01&page=1&pageSize=20&productPage=1`
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
          productNo,
          processCode: div
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
  const rowProductNos = new Set(body.data.items.map((item) => String(item.metadata?.productNo ?? "")));

  assert.equal(body.success, true);
  assert.equal(body.data.total, 25);
  assert.equal(body.data.totalData, 100);
  assert.equal(rowProductNos.size, 20);
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
