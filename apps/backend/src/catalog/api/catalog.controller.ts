import { Controller, Get, Query } from "@nestjs/common";
import { normalizePagination, type SearchQuery } from "../../shared.js";
import { CatalogService } from "../application/catalog.service.js";
import { SearchRequestDto } from "./dto/search.request.dto.js";

@Controller("images")
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("search")
  async search(@Query() query: SearchRequestDto) {
    const pagination = normalizePagination({ page: query.page, pageSize: query.pageSize });
    const filters: SearchQuery = {
      ...pagination,
      bucket: query.bucket,
      productNo: query.productNo,
      div: query.div,
      result: query.result ?? query.aiResult,
      lotNo: query.lotNo,
      processId: query.processId,
      version: query.version,
      productPage: query.productPage === "1" || query.productPage === "true",
      query: query.query,
      capturedAtFrom: query.capturedAtFrom,
      capturedAtTo: query.capturedAtTo,
      thresholdMin: query.thresholdMin,
      thresholdMax: query.thresholdMax
    };
    return this.catalogService.search(filters);
  }
}
