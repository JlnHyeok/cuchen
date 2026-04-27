import type { CatalogRecord, SearchFilters, SearchResponse } from "@cuchen/shared";

export interface CatalogRepository {
  init(): Promise<void>;
  upsert(record: CatalogRecord): Promise<void>;
  findById(imageId: string): Promise<CatalogRecord | null>;
  search(filters: SearchFilters, page: number, pageSize: number): Promise<SearchResponse>;
  listPendingPairs(): Promise<CatalogRecord[]>;
  listBuckets(): Promise<string[]>;
}
