import { strToU8, zipSync } from 'fflate';
import type { FileListItem, FileListQuery, FilterOptions, ImageDiv, InspectionResult, PageResult } from '@entities/file/model/types';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3000';
const BACKEND_PAGE_SIZE = 1000;
const IMAGE_DIVS: ImageDiv[] = ['top', 'bot', 'top-inf', 'bot-inf'];
const INSPECTION_RESULTS: InspectionResult[] = ['OK', 'NG'];
const IMAGE_DIV_ORDER = new Map<ImageDiv, number>(IMAGE_DIVS.map((div, index) => [div, index]));

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface CatalogRecord {
  imageId: string;
  bucket: string;
  fileName: string;
  fileExt: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface SearchResponse {
  items: CatalogRecord[];
  total: number;
  totalData?: number;
  page: number;
  pageSize: number;
}

type QueryParams = Record<string, string | number | undefined>;

function getBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_URL as string | undefined;
  return (configured || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

function buildUrl(pathname: string, query: QueryParams = {}): string {
  const url = new URL(pathname, getBackendBaseUrl());

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'success' in value &&
      'message' in value &&
      'data' in value &&
      'errorCode' in value &&
      'errorMessage' in value
  );
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const raw = await response.text();
  if (!raw) return fallbackMessage;

  try {
    const payload = JSON.parse(raw) as unknown;
    if (isApiEnvelope(payload)) {
      return payload.errorMessage || payload.message || fallbackMessage;
    }
  } catch {
    return raw;
  }

  return fallbackMessage;
}

async function requestJson<T>(pathname: string, query: QueryParams = {}): Promise<T> {
  const response = await fetch(buildUrl(pathname, query));
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `요청에 실패했습니다: ${pathname}`));
  }

  const payload = (await response.json()) as unknown;
  if (isApiEnvelope<T>(payload)) {
    if (!payload.success) {
      throw new Error(payload.errorMessage || payload.message);
    }
    return payload.data as T;
  }

  return payload as T;
}

async function requestBlob(pathname: string): Promise<Blob> {
  const response = await fetch(buildUrl(pathname));
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `파일을 불러오지 못했습니다: ${pathname}`));
  }
  return response.blob();
}

function toDateStart(value: string | undefined): string | undefined {
  return value ? `${value}T00:00:00.000Z` : undefined;
}

function toDateEnd(value: string | undefined): string | undefined {
  return value ? `${value}T23:59:59.999Z` : undefined;
}

function toBackendSearchQuery(query: Partial<FileListQuery>, page: number, pageSize: number): QueryParams {
  return {
    page,
    pageSize,
    productNo: query.productId,
    lotNo: query.lotNo,
    cameraId: query.cameraId,
    processCode: query.div,
    result: query.result,
    capturedAtFrom: toDateStart(query.dateFrom),
    capturedAtTo: toDateEnd(query.dateTo)
  };
}

function toBackendProductPageQuery(query: Partial<FileListQuery>, page: number, pageSize: number): QueryParams {
  return {
    ...toBackendSearchQuery(query, page, pageSize),
    productPage: 1
  };
}

async function fetchSearchPage(query: Partial<FileListQuery>, page: number, pageSize = BACKEND_PAGE_SIZE): Promise<SearchResponse> {
  return requestJson<SearchResponse>('/images/search', toBackendSearchQuery(query, page, pageSize));
}

async function fetchProductSearchPage(query: Partial<FileListQuery>, page: number, pageSize: number): Promise<SearchResponse> {
  return requestJson<SearchResponse>('/images/search', toBackendProductPageQuery(query, page, pageSize));
}

function readString(metadata: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(metadata: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function normalizeImageDiv(value: string | undefined, fallbackText: string): ImageDiv {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'top' || normalized === 'bot' || normalized === 'top-inf' || normalized === 'bot-inf') {
    return normalized;
  }

  const source = fallbackText.toLowerCase();
  if (source.includes('top-inf')) return 'top-inf';
  if (source.includes('bot-inf')) return 'bot-inf';
  if (source.includes('top')) return 'top';
  if (source.includes('bot')) return 'bot';
  return 'top';
}

function normalizeInspectionResult(value: string | undefined): InspectionResult {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'NG' || normalized === 'FAIL' || normalized === 'FAILED') return 'NG';
  return 'OK';
}

function normalizeTime(value: string | undefined, record: CatalogRecord): string {
  return value || record.updatedAt || record.createdAt || new Date(0).toISOString();
}

function withExtension(fileName: string, fileExt: string): string {
  const ext = fileExt.replace(/^\./, '').toLowerCase();
  if (!ext || fileName.toLowerCase().endsWith(`.${ext}`)) return fileName;
  return `${fileName}.${ext}`;
}

function productIdFromName(value: string): string {
  return value.replace(/\.(png|jpg|jpeg|webp)$/i, '').replace(/-(top-inf|bot-inf|top|bot)$/i, '');
}

function toFileListItem(record: CatalogRecord): FileListItem {
  const metadata = record.metadata ?? {};
  const baseName = record.fileName || record.imageId;
  const fileName = withExtension(baseName, record.fileExt);
  const productId = readString(metadata, ['product_id', 'productId', 'productNo']) || productIdFromName(baseName || record.imageId);
  const div = normalizeImageDiv(readString(metadata, ['div', 'processCode', 'process_code']), `${baseName} ${record.imageId}`);
  const result = normalizeInspectionResult(readString(metadata, ['result', 'aiResult', 'inspectionResult']));

  return {
    id: record.imageId,
    fileName,
    productId,
    div,
    time: normalizeTime(readString(metadata, ['time', 'capturedAt', 'captured_at']), record),
    result,
    threshold: readNumber(metadata, ['threshold', 'inspectionThreshold', 'inspection_threshold'], 0),
    prob: readNumber(metadata, ['prob', 'probability', 'confidence', 'score', 'aiProb', 'inspectionProb', 'inspectionScore'], 0),
    sizeBytes: readNumber(metadata, ['size', 'fileSize', 'sizeBytes'], 0),
    lotNo: readString(metadata, ['lotNo', 'lot_no', 'lot', 'lotNumber', 'lot_number']),
    cameraId: readString(metadata, ['cameraId', 'camera_id', 'camera'])
  };
}

function matchesClientFilters(file: FileListItem, query: Partial<FileListQuery>): boolean {
  if (query.productId && file.productId !== query.productId) return false;
  if (query.lotNo && !file.lotNo?.toLowerCase().includes(query.lotNo.toLowerCase())) return false;
  if (query.cameraId && !file.cameraId?.toLowerCase().includes(query.cameraId.toLowerCase())) return false;
  if (query.div && file.div !== query.div) return false;
  if (query.result && file.result !== query.result) return false;
  if (query.dateFrom && file.time.slice(0, 10) < query.dateFrom) return false;
  if (query.dateTo && file.time.slice(0, 10) > query.dateTo) return false;
  return true;
}

function sortByImageDiv(items: FileListItem[]): FileListItem[] {
  return [...items].sort((left, right) => (IMAGE_DIV_ORDER.get(left.div) ?? 999) - (IMAGE_DIV_ORDER.get(right.div) ?? 999));
}

function latestTime(items: FileListItem[]): string {
  return items.reduce((latest, item) => (item.time > latest ? item.time : latest), items[0]?.time ?? new Date(0).toISOString());
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function minNumber(values: number[]): number {
  return values.reduce((min, value) => Math.min(min, value), values[0] ?? 0);
}

function maxNumber(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, value), values[0] ?? 0);
}

function groupProductRows(items: FileListItem[]): FileListItem[] {
  const groups = new Map<string, FileListItem[]>();

  for (const item of items) {
    groups.set(item.productId, [...(groups.get(item.productId) ?? []), item]);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = sortByImageDiv(group);
      const okCount = sorted.filter((file) => file.result === 'OK').length;
      const ngCount = sorted.filter((file) => file.result === 'NG').length;
      const result: InspectionResult = ngCount > 0 ? 'NG' : 'OK';
      const minProbFile = [...sorted].sort((left, right) => left.prob - right.prob)[0] ?? sorted[0];
      const representative = sorted.find((file) => file.result === 'NG') ?? minProbFile;
      const thresholds = sorted.map((file) => file.threshold);

      return {
        ...representative,
        fileName: representative.productId,
        divs: sorted.map((file) => file.div),
        fileCount: sorted.length,
        result,
        threshold: minProbFile.threshold,
        thresholdMin: minNumber(thresholds),
        thresholdMax: maxNumber(thresholds),
        prob: minProbFile.prob,
        minProb: minProbFile.prob,
        minProbDiv: minProbFile.div,
        time: latestTime(sorted),
        sizeBytes: sorted.reduce((sum, file) => sum + file.sizeBytes, 0),
        lotNos: uniqueValues(sorted.map((file) => file.lotNo)),
        cameraIds: uniqueValues(sorted.map((file) => file.cameraId)),
        okCount,
        ngCount
      };
    })
    .sort((left, right) => Date.parse(right.time) - Date.parse(left.time) || left.productId.localeCompare(right.productId));
}

function normalizePage(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20;
}

function sanitizeZipPathPart(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+$/, '_') || 'file';
}

function uniqueImageEntryName(entries: Record<string, Uint8Array>, file: FileListItem): string {
  const productId = sanitizeZipPathPart(file.productId);
  const fileName = sanitizeZipPathPart(file.fileName || file.id);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';
  let candidate = `${productId}/${fileName}`;
  let suffix = 1;

  while (entries[candidate]) {
    candidate = `${productId}/${baseName}-${suffix}${extension}`;
    suffix += 1;
  }

  return candidate;
}

function metadataEntryName(imageEntryName: string): string {
  const slashIndex = imageEntryName.lastIndexOf('/');
  const directory = slashIndex >= 0 ? imageEntryName.slice(0, slashIndex + 1) : '';
  const fileName = slashIndex >= 0 ? imageEntryName.slice(slashIndex + 1) : imageEntryName;
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  return `${directory}${baseName}.json`;
}

async function makeZip(files: FileListItem[], fileName: string): Promise<{ blob: Blob; fileName: string }> {
  const entries: Record<string, Uint8Array> = {};

  for (const file of files) {
    const [blob, record] = await Promise.all([
      getImageBlob(file.id),
      requestJson<CatalogRecord>(`/images/${encodeURIComponent(file.id)}/metadata`)
    ]);
    const imageEntryName = uniqueImageEntryName(entries, file);
    entries[imageEntryName] = new Uint8Array(await blob.arrayBuffer());
    entries[metadataEntryName(imageEntryName)] = strToU8(JSON.stringify(record.metadata ?? {}, null, 2));
  }

  const zipBytes = zipSync(entries);
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);

  return {
    blob: new Blob([zipBuffer], { type: 'application/zip' }),
    fileName
  };
}

export async function listFiles(query: FileListQuery): Promise<PageResult<FileListItem>> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const response = await fetchProductSearchPage(query, page, pageSize);
  let grouped = groupProductRows(response.items.map(toFileListItem)).slice(0, pageSize);
  let total = response.total;
  let totalData = response.totalData ?? response.total;

  if (response.totalData === undefined && grouped.length < pageSize && response.total > pageSize) {
    const fallbackResponse = await fetchProductSearchPage(query, page, pageSize * IMAGE_DIVS.length);
    grouped = groupProductRows(fallbackResponse.items.map(toFileListItem)).slice(0, pageSize);
    totalData = fallbackResponse.total;
    total = Math.ceil(totalData / IMAGE_DIVS.length);
  }

  return {
    items: grouped,
    page,
    pageSize,
    total,
    totalData,
    totalPages: Math.ceil(total / pageSize)
  };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetchSearchPage({}, 1, BACKEND_PAGE_SIZE);
  const items = response.items.map(toFileListItem);

  return {
    productIds: [...new Set(items.map((file) => file.productId))].sort((left, right) => left.localeCompare(right)),
    divs: IMAGE_DIVS.filter((div) => items.some((file) => file.div === div)),
    results: INSPECTION_RESULTS.filter((result) => items.some((file) => file.result === result))
  };
}

export async function getImageBlob(fileId: string): Promise<Blob> {
  return requestBlob(`/images/${encodeURIComponent(fileId)}/blob`);
}

export async function getPreviewImageBlob(fileId: string): Promise<Blob> {
  return requestBlob(`/images/${encodeURIComponent(fileId)}/thumbnail`);
}

export async function getProductFiles(fileId: string): Promise<FileListItem[]> {
  const record = await requestJson<CatalogRecord>(`/images/${encodeURIComponent(fileId)}/metadata`);
  const selected = toFileListItem(record);
  const response = await fetchSearchPage({ productId: selected.productId }, 1, BACKEND_PAGE_SIZE);
  const group = response.items
    .map(toFileListItem)
    .filter((file) => file.productId === selected.productId);

  return sortByImageDiv(group.length > 0 ? group : [selected]);
}

export async function downloadFile(fileId: string): Promise<{ blob: Blob; fileName: string }> {
  const group = await getProductFiles(fileId);
  return makeZip(group, `${sanitizeZipPathPart(group[0].productId)}.zip`);
}

export async function downloadFiles(fileIds: string[]): Promise<{ blob: Blob; fileName: string }> {
  const uniqueFileIds = [...new Set(fileIds)];
  if (uniqueFileIds.length === 0) {
    throw new Error('선택된 제품이 없습니다.');
  }

  const productIds = new Set<string>();
  const selectedFiles = new Map<string, FileListItem>();

  for (const fileId of uniqueFileIds) {
    const group = await getProductFiles(fileId);
    for (const file of group) {
      productIds.add(file.productId);
      selectedFiles.set(file.id, file);
    }
  }

  return makeZip([...selectedFiles.values()], `cuchen-selected-${productIds.size}-products.zip`);
}

export const backendFileApiTestHooks = {
  toFileListItem,
  groupProductRows,
  matchesClientFilters
};
