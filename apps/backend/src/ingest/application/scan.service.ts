import { Injectable, Logger } from "@nestjs/common";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAppConfig } from "../../common/config/app-config.js";
import { IngestService } from "./ingest.service.js";

const ARCHIVE_DIR_NAMES = new Set(["processed", "failed"]);

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private readonly config = loadAppConfig();

  constructor(private readonly ingestService: IngestService) {}

  async ingestFiles(rootDir: string, filebase: string) {
    const sourceDir = path.resolve(process.cwd(), rootDir);
    this.logger.log(`[ingest] files requested rootDir=${sourceDir} filebase=${filebase}`);
    const outcome = await this.ingestService.ingestFilebase(sourceDir, filebase);
    this.logger.log(
      `[ingest] files done rootDir=${sourceDir} filebase=${filebase} processed=${outcome.processed} synced=${outcome.synced} partial=${outcome.partial} failed=${outcome.failed} skipped=${outcome.skipped}`
    );
    return outcome;
  }

  async scan(rootDir?: string) {
    const sourceDir = path.resolve(process.cwd(), rootDir ?? this.config.ingestRootDir);
    this.logger.log(`[ingest] scan requested rootDir=${sourceDir}`);
    await this.ensureDirectory(sourceDir);
    const files = await listFiles(sourceDir);
    const outcome = await this.ingestService.ingestFileList(sourceDir, files);
    this.logger.log(
      `[ingest] scan done rootDir=${sourceDir} files=${files.length} processed=${outcome.processed} synced=${outcome.synced} partial=${outcome.partial} failed=${outcome.failed} skipped=${outcome.skipped}`
    );
    return outcome;
  }

  private async ensureDirectory(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function listFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (ARCHIVE_DIR_NAMES.has(entry.name)) {
        continue;
      }
      const nested = await listFiles(absolute);
      files.push(...nested);
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}
