import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { setTimeout as delay } from "node:timers/promises";
import { Readable } from "node:stream";
import type { CatalogRecord } from "../../shared.js";
import { CATALOG_REPOSITORY, BLOB_STORAGE } from "../../storage/storage.tokens.js";
import { loadAppConfig } from "../../common/config/app-config.js";
import type { CatalogRepository } from "../../catalog/domain/catalog.repository.js";
import type { BlobStorage } from "../domain/blob.storage.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "./thumbnail.js";

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly config = loadAppConfig();
  private readonly testIoDelayMs = this.config.testIoDelayMs;

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage
  ) {}

  async getMetadata(imageId: string) {
    this.logger.log(`[images] metadata start imageId=${imageId}`);
    const record = await this.getRecordOrThrow(imageId);
    this.logger.log(`[images] metadata done imageId=${imageId}`);
    return record;
  }

  async getDetail(imageId: string) {
    this.logger.log(`[images] detail start imageId=${imageId}`);
    const record = await this.getRecordOrThrow(imageId);
    this.logger.log(`[images] detail done imageId=${imageId}`);
    return record;
  }

  async getBlob(imageId: string) {
    this.logger.log(`[images] blob start imageId=${imageId}`);
    const record = await this.getRecordOrThrow(imageId);
    const blob = await this.blobStorage.openImage(record);
    if (!blob) {
      throw new NotFoundException(`Image not found: ${imageId}`);
    }
    this.logger.log(`[images] blob done imageId=${imageId} contentType=${blob.contentType}`);
    return blob;
  }

  async getThumbnail(imageId: string) {
    this.logger.log(`[images] thumbnail start imageId=${imageId}`);
    const record = await this.getRecordOrThrow(imageId);

    const cached = await this.blobStorage.openThumbnail(record);
    if (cached) {
      this.logger.log(`[images] thumbnail cache-hit imageId=${imageId}`);
      return cached;
    }

    const original = await this.blobStorage.openImage(record);
    if (!original) {
      throw new NotFoundException(`Image not found: ${imageId}`);
    }

    const sourceBuffer = await readableToBuffer(original.stream);
    const thumbnailBuffer = await createThumbnailBuffer(sourceBuffer);

    await this.blobStorage.putThumbnail(record, thumbnailBuffer, THUMBNAIL_CONTENT_TYPE);
    this.logger.log(`[images] thumbnail generated imageId=${imageId}`);
    return {
      stream: Readable.from([thumbnailBuffer]),
      contentType: THUMBNAIL_CONTENT_TYPE
    };
  }

  async listBuckets() {
    const buckets = await this.catalogRepository.listBuckets();
    const result = uniqueStrings([this.config.minioBucket, ...buckets]);
    this.logger.log(`[images] buckets listed count=${result.length}`);
    return result;
  }

  private async getRecordOrThrow(imageId: string): Promise<CatalogRecord> {
    const record = await this.catalogRepository.findById(imageId);
    await delayIfNeeded(this.testIoDelayMs);
    if (!record) {
      throw new NotFoundException(`Record not found: ${imageId}`);
    }
    return record;
  }
}

async function delayIfNeeded(testIoDelayMs: number): Promise<void> {
  if (testIoDelayMs > 0) {
    await delay(testIoDelayMs);
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

async function readableToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
