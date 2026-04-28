import type { CatalogRecord, SearchFilters, SearchResponse } from "../../shared.js";

export interface CatalogRepository {
  init(): Promise<void>;
  upsert(record: CatalogRecord): Promise<void>;
  findById(imageId: string): Promise<CatalogRecord | null>;
  search(filters: SearchFilters, page: number, pageSize: number): Promise<SearchResponse>;
  listPendingPairs(): Promise<CatalogRecord[]>;
  listBuckets(): Promise<string[]>;
}
