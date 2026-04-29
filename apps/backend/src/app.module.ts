import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { CatalogModule } from "./catalog/catalog.module.js";
import { HealthModule } from "./health/health.module.js";
import { ImagesModule } from "./images/images.module.js";
import { IngestModule } from "./ingest/ingest.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { loadAppConfig } from "./common/config/app-config.js";
import { ApiExceptionFilter } from "./common/http/api-exception.filter.js";
import { ApiResponseInterceptor } from "./common/http/api-response.interceptor.js";
import { RequestLoggingInterceptor } from "./common/http/request-logging.interceptor.js";

const config = loadAppConfig();
const mongooseImports =
  config.storageMode === "mongo-minio"
    ? [
        MongooseModule.forRootAsync({
          useFactory: async () => ({
            uri: config.mongoUri,
            dbName: config.mongoDbName,
            autoIndex: true
          })
        })
      ]
    : [];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ...mongooseImports,
    StorageModule,
    CatalogModule,
    IngestModule,
    ImagesModule,
    HealthModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor
    }
  ]
})
export class AppModule {}
