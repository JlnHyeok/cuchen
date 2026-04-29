import type { CatalogRecord, MetadataDocument } from "../../../shared.js";
import { buildThumbnailKey } from "../../../shared.js";

export function buildMetadataDocument(document: { metadata?: MetadataDocument } & Record<string, unknown>): MetadataDocument {
  const metadata: MetadataDocument = { ...(document.metadata ?? {}) };
  const mutableMetadata = metadata as Record<string, unknown>;
  const legacyKeys = [
    "productId",
    "capturedAt",
    "captured_at",
    "time",
    "div",
    "result",
    "threshold",
    "prob",
    "lotNo",
    "processId",
    "version"
  ] as const;
  for (const key of legacyKeys) {
    const value = document[key];
    if (value !== undefined && value !== null && mutableMetadata[key] === undefined) {
      mutableMetadata[key] = (key === "threshold" || key === "prob") && typeof value !== "number" ? Number(value) : value;
    }
  }
  return metadata;
}

export function normalizeCatalogRecord(document: Partial<CatalogRecord> & { metadata?: MetadataDocument } & Record<string, unknown>): CatalogRecord {
  const metadata = buildMetadataDocument(document);
  return {
    imageId: document.imageId ?? "",
    bucket: document.bucket ?? "",
    fileName: document.fileName ?? "",
    fileExt: document.fileExt ?? "png",
    sourcePath: document.sourcePath ?? "",
    contentHash: document.contentHash ?? "",
    imageKey: document.imageKey ?? "",
    thumbnailKey: document.thumbnailKey ?? buildThumbnailKey(document.imageId ?? ""),
    rawJsonKey: document.rawJsonKey,
    metadata,
    syncStatus: document.syncStatus ?? "pending",
    errorMessage: document.errorMessage,
    createdAt: document.createdAt ?? new Date().toISOString(),
    updatedAt: document.updatedAt ?? new Date().toISOString()
  };
}
