import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SearchQuery } from "../../shared.js";
import { CATALOG_REPOSITORY } from "../../storage/storage.tokens.js";
import type { CatalogRepository } from "../domain/catalog.repository.js";

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository) {}

  async search(query: SearchQuery) {
    this.logger.log(`[catalog] search start page=${query.page} pageSize=${query.pageSize} productNo=${query.productNo ?? ""}`);
    const result = await this.catalogRepository.search(query, query.page, query.pageSize);
    this.logger.log(`[catalog] search done page=${result.page} pageSize=${result.pageSize} total=${result.total} items=${result.items.length}`);
    return result;
  }
}
