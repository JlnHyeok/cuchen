import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { CatalogRecord, IngestOutcome } from "../../shared.js";
import { buildThumbnailKey, extractAliasValues } from "../../shared.js";
import { loadAppConfig } from "../../common/config/app-config.js";
import { BLOB_STORAGE, CATALOG_REPOSITORY } from "../../storage/storage.tokens.js";
import type { CatalogRepository } from "../../catalog/domain/catalog.repository.js";
import type { BlobStorage } from "../../images/domain/blob.storage.js";
import { THUMBNAIL_CONTENT_TYPE, createThumbnailBuffer } from "../../images/application/thumbnail.js";
import { IngestEventsService } from "./ingest-events.service.js";

interface PairCandidate {
  relativeKey: string;
  imagePath: string;
  jsonPath: string;
  fileName: string;
  fileExt: string;
}

@Injectable()
export class IngestService implements OnModuleInit {
  private readonly logger = new Logger(IngestService.name);
  private readonly config = loadAppConfig();
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private watcherStarted = false;

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage,
    private readonly ingestEvents: IngestEventsService = new IngestEventsService()
  ) {}

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.config.ingestRootDir, { recursive: true });
    await this.scanAndIngest(this.config.ingestRootDir);
    await this.startWatcher(this.config.ingestRootDir);
  }

  async getById(imageId: string): Promise<CatalogRecord | null> {
    return this.catalogRepository.findById(imageId);
  }

  async ingestFileList(rootDir: string, files: string[]): Promise<IngestOutcome> {
    const candidates = collectPairs(rootDir, files);
    return this.ingestPairs(candidates);
  }

  async scanAndIngest(rootDir: string): Promise<IngestOutcome> {
    this.logger.log(`[ingest] startup scan start rootDir=${rootDir}`);
    await fs.mkdir(rootDir, { recursive: true });
    const absoluteFiles = await listFilesRecursive(rootDir);
    const outcome = await this.ingestFileList(rootDir, absoluteFiles);
    this.logger.log(
      `[ingest] startup scan done rootDir=${rootDir} files=${absoluteFiles.length} processed=${outcome.processed} synced=${outcome.synced} partial=${outcome.partial} failed=${outcome.failed} skipped=${outcome.skipped}`
    );
    return outcome;
  }

  async ingestPairs(candidates: PairCandidate[]): Promise<IngestOutcome> {
    let processed = 0;
    let synced = 0;
    let partial = 0;
    let failed = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      processed += 1;
      try {
        const record = await this.syncPair(candidate);
        if (record.syncStatus === "synced") {
          synced += 1;
        } else if (record.syncStatus === "partial") {
          partial += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(`failed to ingest ${candidate.fileName}: ${String(error)}`);
      }
    }

    return { processed, synced, partial, failed, skipped };
  }

  async syncPair(candidate: PairCandidate): Promise<CatalogRecord> {
    this.logger.log(`[ingest] pair start fileName=${candidate.fileName} imagePath=${candidate.imagePath}`);
    const imageBuffer = await fs.readFile(candidate.imagePath);
    const jsonRaw = await fs.readFile(candidate.jsonPath, "utf8");
    const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
    const metadata = extractAliasValues(parsed);
    metadata.size ??= imageBuffer.length;
    const imageId = buildImageId(metadata, candidate.relativeKey, imageBuffer);
    const ext = candidate.fileExt.replace(".", "") as "png" | "jpg" | "jpeg";
    const record: CatalogRecord = {
      imageId,
      bucket: this.config.minioBucket,
      fileName: candidate.fileName,
      fileExt: ext,
      sourcePath: candidate.imagePath,
      contentHash: hashBuffer(imageBuffer),
      imageKey: `images/${imageId}.${ext}`,
      thumbnailKey: buildThumbnailKey(imageId),
      rawJsonKey: `metadata/${imageId}.json`,
      metadata,
      syncStatus: "synced",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await this.catalogRepository.upsert(record);
      await this.blobStorage.putImage(record, imageBuffer, detectMimeType(candidate.fileExt));
      const thumbnailBuffer = await createThumbnailBuffer(imageBuffer);
      await this.blobStorage.putThumbnail(record, thumbnailBuffer, THUMBNAIL_CONTENT_TYPE);
      await this.catalogRepository.upsert(record);
      this.ingestEvents.publishRecordSynced(record);
      this.logger.log(`[ingest] pair synced imageId=${record.imageId} fileName=${candidate.fileName}`);
      return record;
    } catch (error) {
      const failedRecord = { ...record, syncStatus: "partial" as const, errorMessage: String(error), updatedAt: new Date().toISOString() };
      await this.catalogRepository.upsert(failedRecord);
      this.logger.warn(`[ingest] pair partial imageId=${record.imageId} fileName=${candidate.fileName} error=${String(error)}`);
      return failedRecord;
    }
  }

  private async startWatcher(rootDir: string): Promise<void> {
    if (this.watcherStarted) return;
    this.watcherStarted = true;
    const { watch } = await import("chokidar");
    this.logger.log(
      `[ingest] watcher start rootDir=${rootDir} usePolling=${this.config.ingestWatchUsePolling} intervalMs=${this.config.ingestWatchIntervalMs}`
    );
    const watcher = watch(rootDir, {
      ignored: /(^|[\\/])\../,
      ignoreInitial: true,
      persistent: true,
      usePolling: this.config.ingestWatchUsePolling,
      interval: this.config.ingestWatchIntervalMs,
      awaitWriteFinish: {
        stabilityThreshold: this.config.stabilityDelayMs,
        pollInterval: 100
      }
    });

    watcher.on("all", (_event, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".json"].includes(ext)) {
        return;
      }
      this.logger.log(`[ingest] watcher event event=${_event} filePath=${filePath}`);
      const key = pairKey(filePath);
      const previous = this.pending.get(key);
      if (previous) {
        clearTimeout(previous);
      }
      const timeout = setTimeout(() => {
        void this.handlePairByFile(filePath).catch((error) => {
          this.logger.warn(`watcher ingest failed for ${filePath}: ${String(error)}`);
        });
      }, this.config.stabilityDelayMs);
      this.pending.set(key, timeout);
    });
  }

  private async handlePairByFile(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    const base = filePath.slice(0, -ext.length);
    const imagePath = await findExistingImage(base);
    const jsonPath = `${base}.json`;
    if (!imagePath) return;
    try {
      await fs.access(jsonPath);
    } catch {
      return;
    }
    const candidate = {
      relativeKey: path.relative(this.config.ingestRootDir, imagePath).slice(0, -path.extname(imagePath).length),
      imagePath,
      jsonPath,
      fileName: path.basename(base),
      fileExt: path.extname(imagePath).toLowerCase()
    };
    await this.syncPair(candidate);
    this.logger.log(`[ingest] watcher pair handled fileName=${candidate.fileName}`);
    this.pending.delete(pairKey(filePath));
  }
}

function collectPairs(rootDir: string, files: string[]): PairCandidate[] {
  const map = new Map<string, { imagePath?: string; jsonPath?: string }>();
  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".json"].includes(ext)) continue;
    const key = path.relative(rootDir, filePath).slice(0, -ext.length);
    const entry = map.get(key) ?? {};
    if (ext === ".json") {
      entry.jsonPath = filePath;
    } else {
      entry.imagePath = filePath;
    }
    map.set(key, entry);
  }

  return [...map.entries()]
    .filter(([, pair]) => Boolean(pair.imagePath && pair.jsonPath))
    .map(([key, pair]) => ({
      relativeKey: key,
      imagePath: pair.imagePath!,
      jsonPath: pair.jsonPath!,
      fileName: path.basename(key),
      fileExt: path.extname(pair.imagePath!).toLowerCase()
    }));
}

function buildImageId(metadata: Record<string, unknown>, relativeKey: string, imageBuffer: Buffer): string {
  const productId = readText(metadata.productId);
  const div = readText(metadata.div);
  if (productId && div) {
    return `${normalizeIdPart(productId)}-${normalizeIdPart(div)}`;
  }

  return `${path.basename(relativeKey, path.extname(relativeKey))}-${hashBuffer(Buffer.concat([Buffer.from(relativeKey), imageBuffer])).slice(0, 12)}`;
}

function readText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function detectMimeType(ext: string): string {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/png";
}

function pairKey(filePath: string): string {
  return filePath.replace(/\.(png|jpg|jpeg|json)$/i, "");
}

async function findExistingImage(base: string): Promise<string | null> {
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const candidate = `${base}${ext}`;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolute)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}
