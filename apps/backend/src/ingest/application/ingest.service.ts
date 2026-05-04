import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
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
  rootDir?: string;
}

const IMAGE_DIVS = ["top", "bot", "top-inf", "bot-inf"] as const;
const ARCHIVE_DIR_NAMES = new Set(["processed", "failed"]);

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);
  private readonly config = loadAppConfig();

  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalogRepository: CatalogRepository,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage,
    private readonly ingestEvents: IngestEventsService = new IngestEventsService()
  ) {}

  async getById(imageId: string): Promise<CatalogRecord | null> {
    return this.catalogRepository.findById(imageId);
  }

  async ingestFilebase(rootDir: string, filebase: string): Promise<IngestOutcome> {
    const sourceDir = path.resolve(process.cwd(), rootDir);
    const candidates = await collectFilebasePairs(sourceDir, filebase);
    return this.ingestPairs(candidates);
  }

  async ingestFileList(rootDir: string, files: string[]): Promise<IngestOutcome> {
    const candidates = collectPairs(rootDir, files);
    return this.ingestPairs(candidates);
  }

  async scanAndIngest(rootDir: string): Promise<IngestOutcome> {
    this.logger.log(`[ingest] scan start rootDir=${rootDir}`);
    await fs.mkdir(rootDir, { recursive: true });
    const absoluteFiles = await listFilesRecursive(rootDir);
    const outcome = await this.ingestFileList(rootDir, absoluteFiles);
    this.logger.log(
      `[ingest] scan done rootDir=${rootDir} files=${absoluteFiles.length} processed=${outcome.processed} synced=${outcome.synced} partial=${outcome.partial} failed=${outcome.failed} skipped=${outcome.skipped}`
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
    try {
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
        await this.deletePair(candidate);
        this.logger.log(`[ingest] pair synced imageId=${record.imageId} fileName=${candidate.fileName}`);
        return record;
      } catch (error) {
        const failedRecord = { ...record, syncStatus: "partial" as const, errorMessage: String(error), updatedAt: new Date().toISOString() };
        await this.catalogRepository.upsert(failedRecord);
        await this.archivePair(candidate, "failed");
        this.logger.warn(`[ingest] pair partial imageId=${record.imageId} fileName=${candidate.fileName} error=${String(error)}`);
        return failedRecord;
      }
    } catch (error) {
      await this.archivePair(candidate, "failed");
      throw error;
    }
  }

  private async deletePair(candidate: PairCandidate): Promise<void> {
    try {
      await removeIfExists(candidate.imagePath);
      await removeIfExists(candidate.jsonPath);
      this.logger.log(`[ingest] pair deleted fileName=${candidate.fileName}`);
    } catch (error) {
      this.logger.warn(`[ingest] pair delete failed fileName=${candidate.fileName} error=${String(error)}`);
    }
  }

  private async archivePair(candidate: PairCandidate, archiveDirName: "processed" | "failed"): Promise<void> {
    const rootDir = candidate.rootDir ?? inferRootDir(candidate);
    if (!rootDir) {
      return;
    }

    try {
      const targets = await reserveArchiveTargets(rootDir, archiveDirName, candidate);
      await moveIfExists(candidate.imagePath, targets.imagePath);
      await moveIfExists(candidate.jsonPath, targets.jsonPath);
      this.logger.log(`[ingest] pair archived status=${archiveDirName} fileName=${candidate.fileName}`);
    } catch (error) {
      this.logger.warn(`[ingest] pair archive failed status=${archiveDirName} fileName=${candidate.fileName} error=${String(error)}`);
    }
  }
}

async function collectFilebasePairs(rootDir: string, filebase: string): Promise<PairCandidate[]> {
  const candidates: PairCandidate[] = [];
  const missing: string[] = [];

  for (const div of IMAGE_DIVS) {
    const relativeKey = `${filebase}-${div}`;
    const base = path.join(rootDir, relativeKey);
    const imagePath = await findExistingImage(base);
    const jsonPath = `${base}.json`;
    const hasJson = await pathExists(jsonPath);
    if (!imagePath) {
      missing.push(`${relativeKey}.png`);
    }
    if (!hasJson) {
      missing.push(`${relativeKey}.json`);
    }
    if (imagePath && hasJson) {
      candidates.push({
        relativeKey,
        imagePath,
        jsonPath,
        fileName: relativeKey,
        fileExt: path.extname(imagePath).toLowerCase(),
        rootDir
      });
    }
  }

  if (missing.length > 0) {
    throw new BadRequestException(`missing ingest files: ${missing.join(", ")}`);
  }

  return candidates;
}

function collectPairs(rootDir: string, files: string[]): PairCandidate[] {
  const map = new Map<string, { imagePath?: string; jsonPath?: string }>();
  for (const filePath of files) {
    if (isArchivePath(rootDir, filePath)) continue;
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
      fileExt: path.extname(pair.imagePath!).toLowerCase(),
      rootDir
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
      if (ARCHIVE_DIR_NAMES.has(entry.name)) {
        continue;
      }
      files.push(...(await listFilesRecursive(absolute)));
      continue;
    }
    if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function isArchivePath(rootDir: string, filePath: string): boolean {
  const relative = path.relative(rootDir, path.resolve(filePath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return false;
  }
  return relative.split(path.sep).some((segment) => ARCHIVE_DIR_NAMES.has(segment));
}

function inferRootDir(candidate: PairCandidate): string | null {
  const imageSuffix = `${candidate.relativeKey}${candidate.fileExt}`;
  if (candidate.imagePath.endsWith(imageSuffix)) {
    return candidate.imagePath.slice(0, -imageSuffix.length).replace(/[\\/]$/, "");
  }
  return null;
}

async function reserveArchiveTargets(rootDir: string, archiveDirName: "processed" | "failed", candidate: PairCandidate): Promise<{ imagePath: string; jsonPath: string }> {
  const archiveBase = path.join(rootDir, archiveDirName, candidate.relativeKey);
  const archiveDir = path.dirname(archiveBase);
  await fs.mkdir(archiveDir, { recursive: true });

  for (let index = 0; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const base = `${archiveBase}${suffix}`;
    const imagePath = `${base}${candidate.fileExt}`;
    const jsonPath = `${base}.json`;
    if (!(await pathExists(imagePath)) && !(await pathExists(jsonPath))) {
      return { imagePath, jsonPath };
    }
  }

  throw new Error(`archive target unavailable: ${archiveBase}`);
}

async function moveIfExists(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function removeIfExists(sourcePath: string): Promise<void> {
  try {
    await fs.rm(sourcePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
