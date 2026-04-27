import type { CatalogRecord } from "@cuchen/shared";
import { Readable } from "node:stream";
import type { BlobStorage } from "../../domain/blob.storage.js";

export class MemoryBlobStorage implements BlobStorage {
  private readonly blobs = new Map<string, { buffer: Buffer; contentType: string }>();

  async init(): Promise<void> {}

  async putImage(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void> {
    this.blobs.set(record.imageKey, { buffer: Buffer.from(imageBuffer), contentType: mimeType });
  }

  async putThumbnail(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void> {
    this.blobs.set(record.thumbnailKey ?? record.imageKey, { buffer: Buffer.from(imageBuffer), contentType: mimeType });
  }

  async openImage(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null> {
    const blob = this.blobs.get(record.imageKey);
    return blob ? { stream: Readable.from([Buffer.from(blob.buffer)]), contentType: blob.contentType } : null;
  }

  async openThumbnail(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null> {
    const blob = this.blobs.get(record.thumbnailKey ?? record.imageKey);
    return blob ? { stream: Readable.from([Buffer.from(blob.buffer)]), contentType: blob.contentType } : null;
  }
}
