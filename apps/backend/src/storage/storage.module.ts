import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CATALOG_REPOSITORY, BLOB_STORAGE } from "./storage.tokens.js";
import { loadAppConfig } from "../common/config/app-config.js";
import { MemoryCatalogRepository } from "../catalog/infrastructure/memory/catalog.repository.js";
import { CATALOG_MODEL_NAME, createCatalogSchema } from "../catalog/infrastructure/mongo/catalog.schema.js";
import { MongoCatalogRepository } from "../catalog/infrastructure/mongo/catalog.repository.js";
import { MemoryBlobStorage } from "../images/infrastructure/memory/blob.storage.js";
import { MinioObjectStorage } from "../images/infrastructure/minio/object.storage.js";

const config = loadAppConfig();
const catalogSchema = createCatalogSchema(config.mongoCollectionName);
const mongooseFeatureImports =
  config.storageMode === "mongo-minio"
    ? [
        MongooseModule.forFeature([
          {
            name: CATALOG_MODEL_NAME,
            schema: catalogSchema
          }
        ])
      ]
    : [];
const catalogProviders =
  config.storageMode === "memory"
    ? [
        MemoryCatalogRepository,
        {
          provide: CATALOG_REPOSITORY,
          useFactory: async (memoryRepository: MemoryCatalogRepository) => {
            await memoryRepository.init();
            return memoryRepository;
          },
          inject: [MemoryCatalogRepository]
        }
      ]
    : [
        MongoCatalogRepository,
        {
          provide: CATALOG_REPOSITORY,
          useFactory: async (mongoRepository: MongoCatalogRepository) => {
            await mongoRepository.init();
            return mongoRepository;
          },
          inject: [MongoCatalogRepository]
        }
      ];

@Module({
  imports: [...mongooseFeatureImports],
  providers: [
    ...catalogProviders,
    {
      provide: BLOB_STORAGE,
      useFactory: async () => {
        if (config.storageMode === "memory") {
          const storage = new MemoryBlobStorage();
          await storage.init();
          return storage;
        }
        const storage = new MinioObjectStorage(
          config.minioEndpoint,
          config.minioAccessKey,
          config.minioSecretKey,
          config.minioBucket
        );
        await storage.init();
        return storage;
      }
    }
  ],
  exports: [CATALOG_REPOSITORY, BLOB_STORAGE]
})
export class StorageModule {}
