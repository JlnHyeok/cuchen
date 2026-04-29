export type ImageExtension = "png" | "jpg" | "jpeg";

export type SyncStatus = "pending" | "synced" | "partial" | "failed" | "missing-source";

export interface MetadataDocument {
  productId?: string;
  capturedAt?: string;
  captured_at?: string;
  time?: string;
  div?: string;
  result?: string;
  threshold?: number;
  prob?: number;
  lotNo?: string;
  processId?: string;
  version?: string;
  size?: number;
  [key: string]: unknown;
}

export interface CatalogRecord {
  imageId: string;
  bucket: string;
  fileName: string;
  fileExt: ImageExtension;
  sourcePath: string;
  contentHash: string;
  imageKey: string;
  thumbnailKey?: string;
  rawJsonKey?: string;
  metadata: MetadataDocument;
  syncStatus: SyncStatus;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchFilters {
  bucket?: string;
  productNo?: string;
  div?: string;
  result?: string;
  lotNo?: string;
  processId?: string;
  version?: string;
  productPage?: boolean;
  query?: string;
  capturedAtFrom?: string;
  capturedAtTo?: string;
  thresholdMin?: number;
  thresholdMax?: number;
}

export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface SearchQuery extends SearchFilters, PaginationQuery {}

export interface SearchResponse {
  items: CatalogRecord[];
  total: number;
  totalData?: number;
  page: number;
  pageSize: number;
}

export interface IngestOutcome {
  processed: number;
  synced: number;
  partial: number;
  failed: number;
  skipped: number;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_METADATA_VERSION = "v1";

const FIELD_ALIASES: Record<string, readonly string[]> = {
  productId: ["productId", "product_id", "productNo", "productNumber", "sku", "제품번호", "품번"],
  capturedAt: ["capturedAt", "captured_at", "shotAt", "shot_at", "촬영일시", "촬영시간"],
  result: ["result", "aiResult", "inspectionResult", "판정결과", "ai판정결과", "검사결과"],
  threshold: ["threshold", "inspectionThreshold", "임계치", "검사시임계치", "검사임계치"],
  lotNo: ["lotNo", "lot_no", "lot", "lotNumber", "lot_number"],
  processId: ["processId", "process_id", "process", "공정ID", "공정 ID", "cameraId", "camera_id", "camera", "카메라", "카메라ID"],
  version: ["version", "metadataVersion", "metadata_version", "버전"],
  size: ["size", "fileSize", "sizeBytes"]
};

const NUMERIC_METADATA_FIELDS = new Set(["threshold", "prob", "size"]);
const DROPPED_METADATA_FIELDS = new Set(["source", "processCode", "process_code"]);

export function normalizePagination(input: Partial<PaginationQuery>): PaginationQuery {
  const page = typeof input.page === "number" && Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : DEFAULT_PAGE;
  const pageSizeRaw = typeof input.pageSize === "number" && Number.isFinite(input.pageSize) ? Math.floor(input.pageSize) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, pageSizeRaw));
  return { page, pageSize };
}

export function normalizeMetadata(source: Record<string, unknown>): MetadataDocument {
  const metadata: MetadataDocument = { version: DEFAULT_METADATA_VERSION };
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    const value = pickFirst(source, aliases);
    if (value !== undefined) {
      metadata[target] = NUMERIC_METADATA_FIELDS.has(target) ? toNumberOrUndefined(value) : value;
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (isAliasKey(key) || DROPPED_METADATA_FIELDS.has(key)) {
      continue;
    }
    metadata[key] = value;
  }

  return metadata;
}

export function extractAliasValues(source: Record<string, unknown>): MetadataDocument {
  return normalizeMetadata(source);
}

export function buildSearchText(record: CatalogRecord): string {
  const parts = [
    record.imageId,
    record.fileName,
    record.metadata.productId,
    record.metadata.div,
    record.metadata.result,
    record.metadata.lotNo,
    record.metadata.processId,
    record.metadata.version
  ];
  return parts.filter(Boolean).map((value) => String(value).toLowerCase()).join(" ");
}

export function buildThumbnailKey(imageId: string): string {
  return `thumbnails/${imageId}.webp`;
}

function pickFirst(source: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const alias of aliases) {
    const value = source[alias];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function isAliasKey(key: string): boolean {
  return Object.values(FIELD_ALIASES).some((aliases) => aliases.includes(key));
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
