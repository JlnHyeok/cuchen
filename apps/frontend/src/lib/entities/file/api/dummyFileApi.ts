import { strToU8, zipSync } from 'fflate';
import type { FileListItem, FileListQuery, FilterOptions, ImageDiv, InspectionResult, PageResult } from '@entities/file/model/types';

const IMAGE_DIVS: ImageDiv[] = ['top', 'bot', 'top-inf', 'bot-inf'];
const INSPECTION_RESULTS: InspectionResult[] = ['OK', 'NG'];
const IMAGE_DIV_ORDER = new Map<ImageDiv, number>(IMAGE_DIVS.map((div, index) => [div, index]));
const BASE_TIME = Date.parse('2026-04-21T09:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
type DownloadProgressHandler = (progress: { completed: number; total: number; message: string }) => void;

const files: FileListItem[] = Array.from({ length: 72 }, (_value, index) => {
  const sequence = index + 1;
  const productIndex = Math.floor(index / IMAGE_DIVS.length);
  const productSequence = productIndex + 1;
  const productId = `CUCHEN-${productSequence.toString().padStart(5, '0')}`;
  const div = IMAGE_DIVS[index % IMAGE_DIVS.length];
  const time = new Date(BASE_TIME - productIndex * 12 * 60 * 60 * 1000).toISOString();
  const threshold = Number((0.7 + (productIndex % 5) * 0.03).toFixed(2));
  const prob = Number((productIndex % 3 === 0 ? 0.88 - (productIndex % 7) * 0.02 : 0.42 + (productIndex % 6) * 0.04).toFixed(2));
  const result: InspectionResult = prob >= threshold ? 'OK' : 'NG';
  const process = ['압력검사', '외관검사', '조립검사'][productIndex % 3];
  const processId = `PROC-${(productIndex % 3) + 1}`;
  const version = `V${(productIndex % 2) + 1}`;

  return {
    id: `file-${sequence.toString().padStart(4, '0')}`,
    fileName: `${productId}-${div}.svg`,
    productId,
    div,
    process,
    processId,
    version,
    time,
    result,
    threshold,
    prob,
    sizeBytes: 420_000 + index * 3_721
  };
});

function normalizePage(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function normalizePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 20;
}

function dateStart(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`);
}

function dateEnd(value: string): number {
  return Date.parse(`${value}T23:59:59.999Z`);
}

function filterFiles(query: FileListQuery): FileListItem[] {
  const from = query.dateFrom ? dateStart(query.dateFrom) : null;
  const to = query.dateTo ? dateEnd(query.dateTo) : null;

  return files.filter((file) => {
    const capturedAt = Date.parse(file.time);

    if (from !== null && capturedAt < from) return false;
    if (to !== null && capturedAt > to) return false;
    if (query.productId && file.productId !== query.productId) return false;
    if (query.process && ![file.process, file.processId].some((value) => value?.toLowerCase().includes(query.process!.toLowerCase()))) return false;
    if (query.version && file.version !== query.version) return false;
    if (query.lotNo && !file.lotNo?.toLowerCase().includes(query.lotNo.toLowerCase())) return false;
    if (query.processId && !file.processId?.toLowerCase().includes(query.processId.toLowerCase())) return false;
    if (query.div && file.div !== query.div) return false;
    if (query.result && file.result !== query.result) return false;

    return true;
  });
}

function findFile(fileId: string): FileListItem {
  const file = files.find((item) => item.id === fileId);
  if (!file) {
    throw new Error(`파일을 찾을 수 없습니다: ${fileId}`);
  }
  return file;
}

function sortByImageDiv(items: FileListItem[]): FileListItem[] {
  return [...items].sort((a, b) => (IMAGE_DIV_ORDER.get(a.div) ?? 999) - (IMAGE_DIV_ORDER.get(b.div) ?? 999));
}

function getProductGroup(productId: string): FileListItem[] {
  return sortByImageDiv(files.filter((item) => item.productId === productId));
}

function getProductGroupByFileId(fileId: string): FileListItem[] {
  const file = findFile(fileId);
  return getProductGroup(file.productId);
}

function toProductListItem(productId: string): FileListItem {
  const group = getProductGroup(productId);
  const representative = group[0];

  if (!representative) {
    throw new Error(`제품 데이터를 찾을 수 없습니다: ${productId}`);
  }

  return {
    ...representative,
    fileName: representative.productId,
    divs: group.map((file) => file.div),
    fileCount: group.length,
    process: representative.process,
    processes: [...new Set(group.map((file) => file.process).filter((value): value is string => Boolean(value)))],
    version: representative.version,
    versions: [...new Set(group.map((file) => file.version).filter((value): value is string => Boolean(value)))],
    sizeBytes: group.reduce((sum, file) => sum + file.sizeBytes, 0)
  };
}

function makeZip(filesToZip: FileListItem[], fileName: string, onProgress?: DownloadProgressHandler): { blob: Blob; fileName: string } {
  const entries: Record<string, Uint8Array> = {};
  let completed = 0;

  for (const file of filesToZip) {
    entries[`${file.productId}/${file.fileName}`] = strToU8(makeSvg(file));
    entries[`${file.productId}/${file.fileName.replace(/\.[^.]+$/, '.json')}`] = strToU8(JSON.stringify(toMetadataJson(file), null, 2));
    completed += 1;
    onProgress?.({ completed, total: filesToZip.length, message: `이미지 다운로드 중 ${completed}/${filesToZip.length}` });
  }

  const zipBytes = zipSync(entries);
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);

  return {
    blob: new Blob([zipBuffer], { type: 'application/zip' }),
    fileName
  };
}

function toMetadataJson(file: FileListItem): Record<string, string | number> {
  return {
    productId: file.productId,
    div: file.div,
    time: file.time,
    result: file.result,
    threshold: file.threshold,
    prob: file.prob,
    processId: file.processId ?? file.process ?? '',
    version: file.version ?? '',
    size: file.sizeBytes
  };
}

function makeSvg(file: FileListItem): string {
  const statusColor = file.result === 'OK' ? '#168a4a' : '#b42318';
  const capturedDate = file.time.slice(0, 10);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <rect width="960" height="640" fill="#f5f7f8"/>
  <rect x="72" y="64" width="816" height="512" rx="8" fill="#ffffff" stroke="#ccd3d8"/>
  <rect x="112" y="112" width="736" height="344" rx="4" fill="#e8edf0"/>
  <path d="M112 396 L258 272 L394 348 L546 212 L848 392 L848 456 L112 456 Z" fill="#c6d4dc"/>
  <circle cx="710" cy="188" r="52" fill="#f1c44e"/>
  <rect x="112" y="488" width="188" height="28" rx="4" fill="${statusColor}"/>
  <text x="128" y="508" font-family="Arial, sans-serif" font-size="17" fill="#ffffff">${file.result}</text>
  <text x="112" y="548" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#1f2933">${file.productId}</text>
  <text x="112" y="580" font-family="Arial, sans-serif" font-size="18" fill="#52616b">${file.div} · ${capturedDate} · prob ${file.prob}</text>
</svg>`.trim();
}

export async function listFiles(query: FileListQuery): Promise<PageResult<FileListItem>> {
  const page = normalizePage(query.page);
  const pageSize = normalizePageSize(query.pageSize);
  const filtered = filterFiles(query);
  const productIds = [...new Set(filtered.map((file) => file.productId))];
  const grouped = productIds.map(toProductListItem);
  const total = grouped.length;
  const totalData = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;

  return {
    items: grouped.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalData,
    totalPages
  };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  return {
    productIds: [...new Set(files.map((file) => file.productId))],
    processes: [...new Set(files.map((file) => file.process).filter((value): value is string => Boolean(value)))],
    versions: [...new Set(files.map((file) => file.version).filter((value): value is string => Boolean(value)))],
    divs: [...IMAGE_DIVS],
    results: [...INSPECTION_RESULTS]
  };
}

export async function getImageBlob(fileId: string): Promise<Blob> {
  const file = findFile(fileId);
  return new Blob([makeSvg(file)], { type: 'image/svg+xml' });
}

export async function getPreviewImageBlob(fileId: string): Promise<Blob> {
  return getImageBlob(fileId);
}

export async function getProductFiles(fileId: string): Promise<FileListItem[]> {
  return getProductGroupByFileId(fileId);
}

export async function downloadFile(fileId: string): Promise<{ blob: Blob; fileName: string }> {
  const group = getProductGroupByFileId(fileId);
  const representative = group[0];

  return makeZip(group, `${representative?.productId ?? fileId}.zip`);
}

export async function downloadFiles(fileIds: string[], onProgress?: DownloadProgressHandler): Promise<{ blob: Blob; fileName: string }> {
  const uniqueFileIds = [...new Set(fileIds)];

  if (uniqueFileIds.length === 0) {
    throw new Error('선택된 제품이 없습니다.');
  }

  const productIds = new Set<string>();

  for (const fileId of uniqueFileIds) {
    const file = findFile(fileId);
    productIds.add(file.productId);
  }

  const selectedFiles = [...productIds].flatMap(getProductGroup);

  return makeZip(selectedFiles, `cuchen-selected-${productIds.size}-products.zip`, onProgress);
}

export async function downloadAllFiles(query: FileListQuery, onProgress?: DownloadProgressHandler): Promise<{ blob: Blob; fileName: string }> {
  const filtered = filterFiles(query);
  const productIds = [...new Set(filtered.map((file) => file.productId))];
  const selectedFiles = productIds.flatMap(getProductGroup);

  if (selectedFiles.length === 0) {
    throw new Error('다운로드할 제품이 없습니다.');
  }

  onProgress?.({ completed: productIds.length, total: productIds.length, message: `다운로드 대상 수집 중 ${productIds.length}/${productIds.length}` });
  return makeZip(selectedFiles, `cuchen-all-${productIds.length}-products.zip`, onProgress);
}

export const dummyFileApiTestHooks = {
  files,
  oneDayMs: ONE_DAY_MS
};
