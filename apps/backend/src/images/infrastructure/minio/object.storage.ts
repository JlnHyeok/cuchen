import { Client } from "minio";
import type { CatalogRecord } from "../../../shared.js";
import type { Readable } from "node:stream";
import type { BlobStorage } from "../../domain/blob.storage.js";

export class MinioObjectStorage implements BlobStorage {
  private readonly client: Client;

  constructor(
    endpoint: string,
    accessKey: string,
    secretKey: string,
    private readonly bucketName: string
  ) {
    const url = new URL(endpoint);
    this.client = new Client({
      endPoint: url.hostname,
      port: url.port ? Number.parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80,
      useSSL: url.protocol === "https:",
      accessKey,
      secretKey
    });
  }

  async init(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucketName);
    if (!exists) {
      await this.client.makeBucket(this.bucketName);
    }
  }

  async putImage(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void> {
    await this.client.putObject(this.bucketName, record.imageKey, imageBuffer, imageBuffer.length, {
      "Content-Type": mimeType,
      ...buildObjectUserMetadata(record)
    });
  }

  async putThumbnail(record: CatalogRecord, imageBuffer: Buffer, mimeType: string): Promise<void> {
    const key = record.thumbnailKey ?? record.imageKey;
    await this.client.putObject(this.bucketName, key, imageBuffer, imageBuffer.length, {
      "Content-Type": mimeType,
      ...buildObjectUserMetadata(record)
    });
  }

  async openImage(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null> {
    try {
      const stream = (await this.client.getObject(this.bucketName, record.imageKey)) as Readable;
      return { stream, contentType: getContentType(record.fileExt) };
    } catch {
      return null;
    }
  }

  async openThumbnail(record: CatalogRecord): Promise<{ stream: Readable; contentType: string } | null> {
    const key = record.thumbnailKey ?? record.imageKey;
    try {
      const stream = (await this.client.getObject(this.bucketName, key)) as Readable;
      return { stream, contentType: "image/webp" };
    } catch {
      return null;
    }
  }
}

function getContentType(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  return "image/png";
}

function buildObjectUserMetadata(record: CatalogRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record.metadata)
      .filter((entry): entry is [string, string | number | boolean] => {
        const [, value] = entry;
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
      })
      .map(([key, value]) => [`X-Amz-Meta-${key}`, String(value)])
  );
}
