import "reflect-metadata";
import mongoose from "mongoose";
import { loadAppConfig } from "../common/config/app-config.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";

async function main(): Promise<void> {
  const config = loadAppConfig();
  const CatalogModel = mongoose.model(CATALOG_MODEL_NAME, createCatalogSchema(config.mongoCollectionName));

  await mongoose.connect(config.mongoUri, { dbName: config.mongoDbName });
  await CatalogModel.createCollection();
  await CatalogModel.syncIndexes();

  const result = await CatalogModel.collection.updateMany(
    {},
    {
      $unset: {
        productNo: "",
        capturedAt: "",
        processCode: "",
        result: "",
        threshold: "",
        lotNo: "",
        processId: "",
        version: "",
        cameraId: ""
      }
    }
  );

  // eslint-disable-next-line no-console
  console.log(
    `[prune] matched=${result.matchedCount} modified=${result.modifiedCount} removed=productNo,capturedAt,processCode,result,threshold,lotNo,processId,version,cameraId`
  );
  await mongoose.disconnect();
}

void main().catch(async (error) => {
  // eslint-disable-next-line no-console
  console.error("[prune] failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
