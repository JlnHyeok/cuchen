import { Injectable } from "@nestjs/common";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAppConfig } from "../../common/config/app-config.js";
import { IngestService } from "./ingest.service.js";

@Injectable()
export class ScanService {
  private readonly config = loadAppConfig();

  constructor(private readonly ingestService: IngestService) {}

  async scan(rootDir?: string) {
    const sourceDir = path.resolve(process.cwd(), rootDir ?? this.config.ingestRootDir);
    await this.ensureDirectory(sourceDir);
    const files = await listFiles(sourceDir);
    return this.ingestService.ingestFileList(sourceDir, files);
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
