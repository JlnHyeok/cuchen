import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import type { HydratedDocument } from "mongoose";
import type { ImageExtension, MetadataDocument, SyncStatus } from "../../../shared.js";

export const CATALOG_MODEL_NAME = "CatalogRecord";

@Schema({ _id: false, versionKey: false, strict: false })
export class CatalogMetadataDocument implements MetadataDocument {
  @Prop()
  productNo?: string;

  @Prop()
  product_id?: string;

  @Prop()
  productId?: string;

  @Prop()
  capturedAt?: string;

  @Prop()
  captured_at?: string;

  @Prop()
  time?: string;

  @Prop()
  processCode?: string;

  @Prop()
  process_code?: string;

  @Prop()
  div?: string;

  @Prop()
  result?: string;

  @Prop()
  threshold?: number;

  @Prop()
  prob?: number;

  @Prop()
  lotNo?: string;

  @Prop()
  processId?: string;

  @Prop()
  version?: string;

  @Prop()
  size?: number;

  [key: string]: unknown;
}

export const CatalogMetadataSchema = SchemaFactory.createForClass(CatalogMetadataDocument);

@Schema({ versionKey: false })
export class CatalogMongoDocument {
  @Prop({ required: true, unique: true, index: true })
  imageId!: string;

  @Prop({ required: true, index: true })
  bucket!: string;

  @Prop({ required: true })
  fileName!: string;

  @Prop({ required: true })
  fileExt!: ImageExtension;

  @Prop({ required: true })
  sourcePath!: string;

  @Prop({ required: true })
  contentHash!: string;

  @Prop({ required: true })
  imageKey!: string;

  @Prop({ required: true })
  thumbnailKey!: string;

  @Prop()
  rawJsonKey?: string;

  @Prop({ type: CatalogMetadataSchema, default: {} })
  metadata!: CatalogMetadataDocument;

  @Prop({ required: true, index: true })
  syncStatus!: SyncStatus;

  @Prop()
  errorMessage?: string;

  @Prop({ required: true, index: true })
  createdAt!: string;

  @Prop({ required: true, index: true })
  updatedAt!: string;
}

export const CatalogSchema = SchemaFactory.createForClass(CatalogMongoDocument);
CatalogSchema.index({ "metadata.productNo": 1 });
CatalogSchema.index({ "metadata.product_id": 1 });
CatalogSchema.index({ "metadata.productId": 1 });
CatalogSchema.index({ "metadata.capturedAt": 1 });
CatalogSchema.index({ "metadata.captured_at": 1 });
CatalogSchema.index({ "metadata.time": 1 });
CatalogSchema.index({ "metadata.processCode": 1 });
CatalogSchema.index({ "metadata.process_code": 1 });
CatalogSchema.index({ "metadata.div": 1 });
CatalogSchema.index({ "metadata.result": 1 });
CatalogSchema.index({ "metadata.threshold": 1 });
CatalogSchema.index({ "metadata.prob": 1 });
CatalogSchema.index({ "metadata.lotNo": 1 });
CatalogSchema.index({ "metadata.processId": 1 });
CatalogSchema.index({ "metadata.version": 1 });
CatalogSchema.index({ "metadata.size": 1 });

export type CatalogMongoDocumentHydrated = HydratedDocument<CatalogMongoDocument>;

export function createCatalogSchema(collectionName: string) {
  const schema = CatalogSchema.clone();
  schema.set("collection", collectionName);
  return schema;
}
