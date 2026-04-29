import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import type { CatalogRecord, SearchFilters, SearchResponse } from "../../../shared.js";
import type { CatalogRepository } from "../../domain/catalog.repository.js";
import { CATALOG_MODEL_NAME, type CatalogMongoDocument } from "./catalog.schema.js";
import { normalizeCatalogRecord } from "./catalog-mapper.js";

@Injectable()
export class MongoCatalogRepository implements CatalogRepository {
  constructor(
    @InjectModel(CATALOG_MODEL_NAME) private readonly catalogModel: Model<CatalogMongoDocument>
  ) {}

  async init(): Promise<void> {
    await this.catalogModel.createCollection();
    await this.catalogModel.syncIndexes();
  }

  async upsert(record: CatalogRecord): Promise<void> {
    const existing = await this.catalogModel.findOne({ imageId: record.imageId }).select("_id").lean<{ _id: unknown }>().exec();
    if (existing) {
      await this.catalogModel.updateOne({ _id: existing._id }, { $set: record }).exec();
      return;
    }

    const duplicateFilter = buildDuplicateFilter(record);
    if (duplicateFilter) {
      const duplicate = await this.catalogModel.findOne(duplicateFilter).select("_id").lean<{ _id: unknown }>().exec();
      if (duplicate) {
        await this.catalogModel.updateOne({ _id: duplicate._id }, { $set: record }).exec();
        return;
      }
    }

    await this.catalogModel.updateOne({ imageId: record.imageId }, { $set: record }, { upsert: true }).exec();
  }

  async findById(imageId: string): Promise<CatalogRecord | null> {
    const document = await this.catalogModel.findOne({ imageId }).lean<CatalogRecord>().exec();
    return document ? normalizeCatalogRecord(document as CatalogRecord & Record<string, unknown>) : null;
  }

  async search(filters: SearchFilters, page: number, pageSize: number): Promise<SearchResponse> {
    const query = buildMongoQuery(filters);
    if (filters.productPage) {
      return this.searchProductPage(query, page, pageSize);
    }

    const [items, total] = await Promise.all([
      this.catalogModel
        .find(query)
        .sort({ updatedAt: -1, imageId: 1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<(CatalogRecord & Record<string, unknown>)[]>()
        .exec(),
      this.catalogModel.countDocuments(query).exec()
    ]);
    return { items: items.map((item) => normalizeCatalogRecord(item)), total, page, pageSize };
  }

  private async searchProductPage(query: Record<string, unknown>, page: number, pageSize: number): Promise<SearchResponse> {
    const start = (page - 1) * pageSize;
    const fallbackNameExpression = { $ifNull: ["$fileName", "$imageId"] };
    const fallbackProductIdExpression = {
      $switch: {
        branches: [
          {
            case: { $regexMatch: { input: fallbackNameExpression, regex: /-(top-inf|bot-inf)$/i } },
            then: { $substrCP: [fallbackNameExpression, 0, { $subtract: [{ $strLenCP: fallbackNameExpression }, 8] }] }
          },
          {
            case: { $regexMatch: { input: fallbackNameExpression, regex: /-(top|bot)$/i } },
            then: { $substrCP: [fallbackNameExpression, 0, { $subtract: [{ $strLenCP: fallbackNameExpression }, 4] }] }
          }
        ],
        default: fallbackNameExpression
      }
    };
    const productIdExpression = {
      $ifNull: [
        "$metadata.product_id",
        {
          $ifNull: [
            "$metadata.productId",
            {
              $ifNull: ["$metadata.productNo", fallbackProductIdExpression]
            }
          ]
        }
      ]
    };
    const productKeyExpression = { $toLower: productIdExpression };

    const [groupResult] = await this.catalogModel
      .aggregate<{
        pageProducts: Array<{ productKey: string }>;
        totalProducts: Array<{ count: number }>;
        totalData: Array<{ count: number }>;
      }>([
        { $match: query },
        { $addFields: { __productKey: productKeyExpression } },
        {
          $facet: {
            pageProducts: [
              { $group: { _id: "$__productKey", latestUpdatedAt: { $max: "$updatedAt" } } },
              { $sort: { latestUpdatedAt: -1, _id: 1 } },
              { $skip: start },
              { $limit: pageSize },
              { $project: { _id: 0, productKey: "$_id" } }
            ],
            totalProducts: [
              { $group: { _id: "$__productKey" } },
              { $count: "count" }
            ],
            totalData: [{ $count: "count" }]
          }
        }
      ])
      .exec();

    const productKeys = groupResult?.pageProducts.map((entry) => entry.productKey) ?? [];
    if (productKeys.length === 0) {
      return {
        items: [],
        total: groupResult?.totalProducts[0]?.count ?? 0,
        totalData: groupResult?.totalData[0]?.count ?? 0,
        page,
        pageSize
      };
    }

    const items = await this.catalogModel
      .aggregate<(CatalogRecord & Record<string, unknown>)>([
        { $match: query },
        { $addFields: { __productKey: productKeyExpression } },
        { $match: { __productKey: { $in: productKeys } } },
        { $sort: { updatedAt: -1, imageId: 1 } },
        { $project: { __productKey: 0 } }
      ])
      .exec();

    return {
      items: items.map((item) => normalizeCatalogRecord(item)),
      total: groupResult?.totalProducts[0]?.count ?? 0,
      totalData: groupResult?.totalData[0]?.count ?? 0,
      page,
      pageSize
    };
  }

  async listPendingPairs(): Promise<CatalogRecord[]> {
    const documents = await this.catalogModel
      .find({ syncStatus: { $ne: "synced" } })
      .sort({ updatedAt: -1 })
      .lean<(CatalogRecord & Record<string, unknown>)[]>()
      .exec();
    return documents.map((document) => normalizeCatalogRecord(document));
  }

  async listBuckets(): Promise<string[]> {
    const values = await this.catalogModel.distinct("bucket").exec();
    return values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .sort((left, right) => left.localeCompare(right));
  }
}

function buildMongoQuery(filters: SearchFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (filters.bucket) query.bucket = filters.bucket;
  if (filters.productNo) {
    const escaped = escapeRegExp(filters.productNo);
    andConditions.push({
      $or: [
        { imageId: { $regex: escaped, $options: "i" } },
        { fileName: { $regex: escaped, $options: "i" } },
        { "metadata.productNo": { $regex: escaped, $options: "i" } },
        { "metadata.product_id": { $regex: escaped, $options: "i" } },
        { "metadata.productId": { $regex: escaped, $options: "i" } }
      ]
    });
  }
  if (filters.processCode) {
    andConditions.push({
      $or: [
        { "metadata.processCode": filters.processCode },
        { "metadata.process_code": filters.processCode },
        { "metadata.div": filters.processCode }
      ]
    });
  }
  if (filters.result) query["metadata.result"] = { $in: resultAliases(filters.result) };
  if (filters.lotNo) {
    andConditions.push({
      "metadata.lotNo": { $regex: escapeRegExp(filters.lotNo), $options: "i" }
    });
  }
  if (filters.processId) {
    const escaped = escapeRegExp(filters.processId);
    andConditions.push({
      $or: [
        { "metadata.processId": { $regex: escaped, $options: "i" } },
        { "metadata.process_id": { $regex: escaped, $options: "i" } },
        { "metadata.process": { $regex: escaped, $options: "i" } },
        { "metadata.processName": { $regex: escaped, $options: "i" } },
        { "metadata.process_name": { $regex: escaped, $options: "i" } }
      ]
    });
  }
  if (filters.version) {
    const escaped = escapeRegExp(filters.version);
    andConditions.push({
      $or: [
        { "metadata.version": { $regex: escaped, $options: "i" } },
        { "metadata.metadataVersion": { $regex: escaped, $options: "i" } },
        { "metadata.metadata_version": { $regex: escaped, $options: "i" } },
        { "metadata.Version": { $regex: escaped, $options: "i" } },
        { "metadata.modelVersion": { $regex: escaped, $options: "i" } },
        { "metadata.model_version": { $regex: escaped, $options: "i" } },
        { "metadata.inspectionVersion": { $regex: escaped, $options: "i" } },
        { "metadata.inspection_version": { $regex: escaped, $options: "i" } },
        { "metadata.recipeVersion": { $regex: escaped, $options: "i" } },
        { "metadata.recipe_version": { $regex: escaped, $options: "i" } }
      ]
    });
  }
  if (filters.capturedAtFrom || filters.capturedAtTo) {
    const range = {
      ...(filters.capturedAtFrom ? { $gte: filters.capturedAtFrom } : {}),
      ...(filters.capturedAtTo ? { $lte: filters.capturedAtTo } : {})
    };
    andConditions.push({
      $or: [
        { "metadata.capturedAt": range },
        { "metadata.captured_at": range },
        { "metadata.time": range }
      ]
    });
  }
  if (typeof filters.thresholdMin === "number" || typeof filters.thresholdMax === "number") {
    query["metadata.threshold"] = {
      ...(typeof filters.thresholdMin === "number" ? { $gte: filters.thresholdMin } : {}),
      ...(typeof filters.thresholdMax === "number" ? { $lte: filters.thresholdMax } : {})
    };
  }
  if (filters.query) {
    const escaped = escapeRegExp(filters.query);
    andConditions.push({
      $or: [
        { imageId: { $regex: escaped, $options: "i" } },
        { fileName: { $regex: escaped, $options: "i" } },
        { "metadata.product_id": { $regex: escaped, $options: "i" } },
        { "metadata.productId": { $regex: escaped, $options: "i" } },
        { "metadata.productNo": { $regex: escaped, $options: "i" } },
        { "metadata.div": { $regex: escaped, $options: "i" } },
        { "metadata.process_code": { $regex: escaped, $options: "i" } },
        { "metadata.processCode": { $regex: escaped, $options: "i" } },
        { "metadata.result": { $regex: escaped, $options: "i" } },
        { "metadata.lotNo": { $regex: escaped, $options: "i" } },
        { "metadata.processId": { $regex: escaped, $options: "i" } },
        { "metadata.version": { $regex: escaped, $options: "i" } }
      ]
    });
  }
  if (andConditions.length > 0) {
    query.$and = andConditions;
  }
  return query;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDuplicateFilter(record: CatalogRecord): Record<string, unknown> | null {
  const productId = readFirstMetadataString(record.metadata, ["product_id", "productId", "productNo"]);
  const div = readFirstMetadataString(record.metadata, ["div"]);
  if (!productId || !div) {
    return null;
  }

  return {
    $and: [
      {
        $or: [
          { "metadata.product_id": exactCaseInsensitive(productId) },
          { "metadata.productId": exactCaseInsensitive(productId) },
          { "metadata.productNo": exactCaseInsensitive(productId) }
        ]
      },
      { "metadata.div": exactCaseInsensitive(div) }
    ]
  };
}

function readFirstMetadataString(metadata: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${escapeRegExp(value)}$`, "i");
}

function resultAliases(value: string): string[] {
  const normalized = value.trim().toUpperCase();
  if (normalized === "OK" || normalized === "PASS") {
    return ["OK", "ok", "PASS", "pass"];
  }
  if (normalized === "NG" || normalized === "FAIL" || normalized === "FAILED") {
    return ["NG", "ng", "FAIL", "fail", "FAILED", "failed"];
  }
  return [value];
}
