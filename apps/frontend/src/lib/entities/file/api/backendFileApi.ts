import { strToU8, zipSync } from 'fflate';
import type { FileListItem, FileListQuery, FilterOptions, ImageDiv, InspectionResult, PageResult } from '@entities/file/model/types';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:3000';
const BACKEND_PAGE_SIZE = 1000;
const IMAGE_DIVS: ImageDiv[] = ['top', 'bot', 'top-inf', 'bot-inf'];
const INSPECTION_RESULTS: InspectionResult[] = ['OK', 'NG'];
const IMAGE_DIV_ORDER = new Map<ImageDiv, number>(IMAGE_DIVS.map((div, index) => [div, index]));
const PROCESS_CODE_KEYS = ['processCode', 'process_code', '공정코드', '공정 코드'];
const PROCESS_ID_KEYS = ['processId', 'process_id', 'process', 'processName', 'process_name', 'cameraId', 'camera_id', 'camera'];
const VERSION_KEYS = ['version', 'Version', 'modelVersion', 'model_version', 'inspectionVersion', 'inspection_version', 'recipeVersion', 'recipe_version'];

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
type DownloadProgressHandler = (progress: { completed: number; total: number; message: string }) => void;
type DownloadStartHandler = (productName: string) => void;

export class BackendConnectionError extends Error {
  constructor() {
    super('백엔드 서버에 연결할 수 없습니다.');
    this.name = 'BackendConnectionError';
  }
}

export function isBackendConnectionError(error: unknown): error is BackendConnectionError {
  return error instanceof BackendConnectionError;
}

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

async function request(pathname: string, query: QueryParams = {}): Promise<Response> {
  try {
    return await fetch(buildUrl(pathname, query));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new BackendConnectionError();
    }
    throw error;
  }
}

async function requestJson<T>(pathname: string, query: QueryParams = {}): Promise<T> {
  const response = await request(pathname, query);
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
  const response = await request(pathname);
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
    processId: query.processId,
    processCode: query.div,
    version: query.version,
    result: query.result,
    query: query.process,
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

function readOptionalNumber(metadata: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function isImageDiv(value: string | undefined): value is ImageDiv {
  return Boolean(value && IMAGE_DIVS.includes(value.trim().toLowerCase() as ImageDiv));
}

function normalizeImageDiv(value: string | undefined, fallbackText: string): ImageDiv {
  const normalized = value?.trim().toLowerCase();
  if (isImageDiv(normalized)) {
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

function normalizeDisplayProcess(processCode: string | undefined, processId: string | undefined): string | undefined {
  if (processCode && !isImageDiv(processCode)) return processCode;
  return processId ?? processCode;
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
  const processCode = readString(metadata, PROCESS_CODE_KEYS);
  const processId = readString(metadata, PROCESS_ID_KEYS);
  const div = normalizeImageDiv(readString(metadata, ['div']) ?? (isImageDiv(processCode) ? processCode : undefined), `${baseName} ${record.imageId}`);
  const process = normalizeDisplayProcess(processCode, processId);
  const version = readString(metadata, VERSION_KEYS);
  const result = normalizeInspectionResult(readString(metadata, ['result', 'aiResult', 'inspectionResult']));

  return {
    id: record.imageId,
    fileName,
    productId,
    div,
    process,
    processCode,
    processId,
    version,
    time: normalizeTime(readString(metadata, ['time', 'capturedAt', 'captured_at']), record),
    result,
    threshold: readNumber(metadata, ['threshold', 'inspectionThreshold', 'inspection_threshold'], 0),
    prob: readOptionalNumber(metadata, ['prob', 'probability', 'confidence', 'score', 'aiProb', 'inspectionProb', 'inspectionScore']) ?? Number.NaN,
    sizeBytes: readNumber(metadata, ['size', 'fileSize', 'sizeBytes'], 0),
    lotNo: readString(metadata, ['lotNo', 'lot_no', 'lot', 'lotNumber', 'lot_number'])
  };
}

function matchesClientFilters(file: FileListItem, query: Partial<FileListQuery>): boolean {
  if (query.productId && file.productId !== query.productId) return false;
  if (query.process && ![file.process, file.processCode, file.processId].some((value) => value?.toLowerCase().includes(query.process!.toLowerCase()))) return false;
  if (query.version && file.version !== query.version) return false;
  if (query.lotNo && !file.lotNo?.toLowerCase().includes(query.lotNo.toLowerCase())) return false;
  if (query.processId && !file.processId?.toLowerCase().includes(query.processId.toLowerCase())) return false;
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
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.reduce((min, value) => Math.min(min, value), finiteValues[0] ?? Number.NaN);
}

function maxNumber(values: number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.reduce((max, value) => Math.max(max, value), finiteValues[0] ?? Number.NaN);
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
      const minProbFile = [...sorted].filter((file) => Number.isFinite(file.prob)).sort((left, right) => left.prob - right.prob)[0] ?? sorted[0];
      const representative = sorted.find((file) => file.result === 'NG') ?? minProbFile;
      const thresholds = sorted.map((file) => file.threshold);
      const processCodes = uniqueValues(sorted.map((file) => file.processCode));
      const processes = uniqueValues(sorted.map((file) => file.process));
      const versions = uniqueValues(sorted.map((file) => file.version));

      return {
        ...representative,
        fileName: representative.productId,
        divs: sorted.map((file) => file.div),
        fileCount: sorted.length,
        process: processes[0] ?? representative.process,
        processes,
        processCode: processCodes[0] ?? representative.processCode,
        processCodes,
        version: versions[0] ?? representative.version,
        versions,
        result,
        threshold: minProbFile.threshold,
        thresholdMin: minNumber(thresholds),
        thresholdMax: maxNumber(thresholds),
        prob: minProbFile.prob,
        minProb: Number.isFinite(minProbFile.prob) ? minProbFile.prob : undefined,
        minProbDiv: minProbFile.div,
        time: latestTime(sorted),
        sizeBytes: sorted.reduce((sum, file) => sum + file.sizeBytes, 0),
        lotNos: uniqueValues(sorted.map((file) => file.lotNo)),
        processIds: uniqueValues(sorted.map((file) => file.processId)),
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

async function makeZip(files: FileListItem[], fileName: string, onProgress?: DownloadProgressHandler): Promise<{ blob: Blob; fileName: string }> {
  const entries: Record<string, Uint8Array> = {};
  let completed = 0;

  for (const file of files) {
    const [blob, record] = await Promise.all([
      getImageBlob(file.id),
      requestJson<CatalogRecord>(`/images/${encodeURIComponent(file.id)}/metadata`)
    ]);
    const imageEntryName = uniqueImageEntryName(entries, file);
    entries[imageEntryName] = new Uint8Array(await blob.arrayBuffer());
    entries[metadataEntryName(imageEntryName)] = strToU8(JSON.stringify(record.metadata ?? {}, null, 2));
    completed += 1;
    onProgress?.({ completed, total: files.length, message: `이미지 다운로드 중 ${completed}/${files.length}` });
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
    processes: uniqueValues(items.map((file) => file.process)).sort((left, right) => left.localeCompare(right)),
    versions: uniqueValues(items.map((file) => file.version)).sort((left, right) => left.localeCompare(right)),
    divs: IMAGE_DIVS.filter((div) => items.some((file) => file.div === div)),
    results: INSPECTION_RESULTS.filter((result) => items.some((file) => file.result === result))
  };
}

export async function checkBackendConnection(): Promise<void> {
  await requestJson<unknown>('/health');
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

export async function downloadFile(fileId: string, onStart?: DownloadStartHandler): Promise<{ blob: Blob; fileName: string }> {
  const group = await getProductFiles(fileId);
  const productName = sanitizeZipPathPart(group[0].productId);
  onStart?.(productName);
  return makeZip(group, `${productName}.zip`);
}

export async function downloadFiles(fileIds: string[], onProgress?: DownloadProgressHandler): Promise<{ blob: Blob; fileName: string }> {
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

  return makeZip([...selectedFiles.values()], `cuchen-selected-${productIds.size}-products.zip`, onProgress);
}

export async function downloadAllFiles(query: FileListQuery, onProgress?: DownloadProgressHandler): Promise<{ blob: Blob; fileName: string }> {
  const pageSize = BACKEND_PAGE_SIZE;
  let page = 1;
  let totalProducts = 0;
  const filesById = new Map<string, FileListItem>();

  while (true) {
    const response = await fetchProductSearchPage(query, page, pageSize);
    totalProducts = response.total;
    const pageItems = response.items.map(toFileListItem);
    for (const item of pageItems) {
      filesById.set(item.id, item);
    }

    const fetchedProducts = Math.min(page * pageSize, totalProducts);
    onProgress?.({
      completed: fetchedProducts,
      total: totalProducts,
      message: `다운로드 대상 수집 중 ${fetchedProducts}/${totalProducts}`
    });

    if (response.items.length === 0 || fetchedProducts >= totalProducts) {
      break;
    }

    page += 1;
  }

  if (filesById.size === 0) {
    throw new Error('다운로드할 제품이 없습니다.');
  }

  const files = [...filesById.values()].sort(
    (left, right) => left.productId.localeCompare(right.productId) || (IMAGE_DIV_ORDER.get(left.div) ?? 999) - (IMAGE_DIV_ORDER.get(right.div) ?? 999)
  );
  return makeZip(files, `cuchen-all-${totalProducts}-products.zip`, onProgress);
}

export const backendFileApiTestHooks = {
  toFileListItem,
  groupProductRows,
  matchesClientFilters
};
