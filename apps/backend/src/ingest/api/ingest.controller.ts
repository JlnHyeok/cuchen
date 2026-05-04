import { Body, Controller, Post } from "@nestjs/common";
import { ScanService } from "../application/scan.service.js";
import { IngestFilesRequestDto } from "./dto/ingest-files.request.dto.js";
import { ScanRequestDto } from "./dto/scan.request.dto.js";

@Controller()
export class IngestController {
  constructor(private readonly scanService: ScanService) {}

  @Post("ingest/scan")
  async scan(@Body() body: ScanRequestDto) {
    return this.scanService.scan(body.rootDir);
  }

  @Post("ingest/files")
  async ingestFiles(@Body() body: IngestFilesRequestDto) {
    return this.scanService.ingestFiles(body.path, body.filebase);
  }
}
