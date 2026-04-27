import type { CatalogRecord, SearchFilters, SearchResponse } from "@cuchen/shared";
import { buildSearchText } from "@cuchen/shared";
import type { CatalogRepository } from "../../domain/catalog.repository.js";

export class MemoryCatalogRepository implements CatalogRepository {
  private readonly records = new Map<string, CatalogRecord>();

  async init(): Promise<void> {}

  async upsert(record: CatalogRecord): Promise<void> {
    this.records.set(record.imageId, structuredClone(record));
  }

  async findById(imageId: string): Promise<CatalogRecord | null> {
    const record = this.records.get(imageId);
    return record ? structuredClone(record) : null;
  }

  async search(filters: SearchFilters, page: number, pageSize: number): Promise<SearchResponse> {
    const filtered = [...this.records.values()].filter((record) => matchesFilters(record, filters));
    if (filters.productPage) {
      return productPage(filtered, page, pageSize);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map((record) => structuredClone(record));
    return { items, total, page, pageSize };
  }

  async listPendingPairs(): Promise<CatalogRecord[]> {
    return [...this.records.values()].filter((record) => record.syncStatus !== "synced").map((record) => structuredClone(record));
  }

  async listBuckets(): Promise<string[]> {
    return [...new Set([...this.records.values()].map((record) => record.bucket).filter(Boolean))].sort();
  }
}

function productPage(records: CatalogRecord[], page: number, pageSize: number): SearchResponse {
  const groups = new Map<string, CatalogRecord[]>();
  for (const record of records) {
    const productId = productIdForRecord(record);
    groups.set(productId, [...(groups.get(productId) ?? []), record]);
  }

  const sortedGroups = [...groups.entries()].sort(([leftId, leftRecords], [rightId, rightRecords]) => {
    const rightLatest = latestUpdatedAt(rightRecords);
    const leftLatest = latestUpdatedAt(leftRecords);
    return rightLatest.localeCompare(leftLatest) || leftId.localeCompare(rightId);
  });
  const total = sortedGroups.length;
  const start = (page - 1) * pageSize;
  const pageProductIds = new Set(sortedGroups.slice(start, start + pageSize).map(([productId]) => productId));
  const items = records
    .filter((record) => pageProductIds.has(productIdForRecord(record)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.imageId.localeCompare(right.imageId))
    .map((record) => structuredClone(record));

  return { items, total, totalData: records.length, page, pageSize };
}

function productIdForRecord(record: CatalogRecord): string {
  return readFirstString(record.metadata ?? {}, ["product_id", "productId", "productNo"]) || productIdFromName(record.fileName || record.imageId);
}

function productIdFromName(value: string): string {
  return value.replace(/\.(png|jpg|jpeg|webp)$/i, "").replace(/-(top-inf|bot-inf|top|bot)$/i, "");
}

function latestUpdatedAt(records: CatalogRecord[]): string {
  return records.reduce((latest, record) => (record.updatedAt > latest ? record.updatedAt : latest), "");
}

function matchesFilters(record: CatalogRecord, filters: SearchFilters): boolean {
  const metadata = record.metadata ?? {};
  if (filters.bucket && record.bucket !== filters.bucket) return false;
  if (filters.productNo) {
    const needle = filters.productNo.trim().toLowerCase();
    if (!productIdForRecord(record).toLowerCase().includes(needle)) return false;
  }
  if (filters.processCode && readFirstString(metadata, ["processCode", "process_code", "div"]) !== filters.processCode) return false;
  if (filters.result && !matchesResult(String(metadata.result ?? ""), filters.result)) return false;
  if (filters.lotNo && !readFirstString(metadata, ["lotNo", "lot_no", "lot", "lotNumber", "lot_number"]).toLowerCase().includes(filters.lotNo.toLowerCase())) return false;
  if (filters.cameraId && !readFirstString(metadata, ["cameraId", "camera_id", "camera"]).toLowerCase().includes(filters.cameraId.toLowerCase())) return false;
  if (filters.query) {
    const text = buildSearchText(record);
    if (!text.includes(filters.query.toLowerCase())) return false;
  }
  const capturedAt = readFirstString(metadata, ["capturedAt", "captured_at", "time"]);
  if (filters.capturedAtFrom && capturedAt < filters.capturedAtFrom) return false;
  if (filters.capturedAtTo && capturedAt > filters.capturedAtTo) return false;
  if (typeof filters.thresholdMin === "number" && Number(metadata.threshold ?? Number.NaN) < filters.thresholdMin) return false;
  if (typeof filters.thresholdMax === "number" && Number(metadata.threshold ?? Number.NaN) > filters.thresholdMax) return false;
  return true;
}

function readFirstString(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function matchesResult(actual: string, expected: string): boolean {
  return resultGroup(actual) === resultGroup(expected);
}

function resultGroup(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OK" || normalized === "PASS") return "OK";
  if (normalized === "NG" || normalized === "FAIL" || normalized === "FAILED") return "NG";
  return normalized;
}
