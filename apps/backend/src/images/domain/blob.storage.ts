import type { Readable } from "node:stream";
import type { CatalogRecord } from "@cuchen/shared";

export interface BlobStorage {
  init(): Promise<void>;
  putImage(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void>;
  putThumbnail(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void>;
  openImage(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null>;
  openThumbnail(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null>;
}
