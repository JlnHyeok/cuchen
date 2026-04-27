import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { IngestController } from "./api/ingest.controller.js";
import { FolderWatcherService } from "./application/folder-watcher.service.js";
import { IngestService } from "./application/ingest.service.js";
import { ScanService } from "./application/scan.service.js";

@Module({
  imports: [StorageModule],
  controllers: [IngestController],
  providers: [IngestService, ScanService, FolderWatcherService],
  exports: [IngestService, ScanService]
})
export class IngestModule {}
