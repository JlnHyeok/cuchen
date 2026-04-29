import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { IngestEventsController } from "./api/ingest-events.controller.js";
import { IngestController } from "./api/ingest.controller.js";
import { IngestEventsService } from "./application/ingest-events.service.js";
import { FolderWatcherService } from "./application/folder-watcher.service.js";
import { IngestService } from "./application/ingest.service.js";
import { ScanService } from "./application/scan.service.js";

@Module({
  imports: [StorageModule],
  controllers: [IngestController, IngestEventsController],
  providers: [IngestService, ScanService, FolderWatcherService, IngestEventsService],
  exports: [IngestService, ScanService, IngestEventsService]
})
export class IngestModule {}
