import { Inject, Injectable } from "@nestjs/common";
import type { SearchQuery } from "@cuchen/shared";
import { CATALOG_REPOSITORY } from "../../storage/storage.tokens.js";
import type { CatalogRepository } from "../domain/catalog.repository.js";

@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository) {}

  async search(query: SearchQuery) {
    return this.catalogRepository.search(query, query.page, query.pageSize);
  }
}
