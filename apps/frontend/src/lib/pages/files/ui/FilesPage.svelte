<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { checkBackendConnection, getFilterOptions, getImageBlob, getPreviewImageBlob, getProductFiles, isBackendConnectionError, listFiles } from '@entities/file/api';
  import type { FileListItem, FileListQuery, FilterOptions, PageResult } from '@entities/file/model';
  import { saveAllFilesToDisk, saveFileToDisk, saveSelectedFilesToDisk } from '@features/file-download/model/saveFileToDisk';
  import FileFilters from '@features/file-filter/ui/FileFilters.svelte';
  import ImagePreviewModal from '@features/image-preview/ui/ImagePreviewModal.svelte';
  import OriginalImageViewer from '@features/image-preview/ui/OriginalImageViewer.svelte';
  import FileTable from '@widgets/file-table/ui/FileTable.svelte';
  import Pagination from '@widgets/file-table/ui/Pagination.svelte';
  import { getErrorMessage } from '@shared/lib/errors';

  type FilterValues = Pick<FileListQuery, 'dateFrom' | 'dateTo' | 'productId' | 'process' | 'version' | 'result'>;
  type PreviewImageItem = {
    file: FileListItem;
    imageUrl?: string;
    imageLoading: boolean;
    imageError?: string;
  };
  type ToastTone = 'error' | 'success' | 'info';
  type ToastMessage = {
    id: string;
    tone: ToastTone;
    message: string;
  };
  type ToastPosition = {
    left: number;
    top: number;
  };
  type ToastDragState = {
    pointerId: number;
    offsetX: number;
    offsetY: number;
  };

  const initialPage: PageResult<FileListItem> = {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalData: 0,
    totalPages: 0
  };
  const maxOriginalBlobCacheSize = 8;
  const pageSizeOptions = [10, 20, 50];

  function toDateInputValue(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function createDefaultFilters(): FilterValues {
    const today = toDateInputValue();
    return {
      dateFrom: today,
      dateTo: today
    };
  }

  let filters: FilterValues = createDefaultFilters();
  let filterOptions: FilterOptions = { productIds: [], processes: [], versions: [], divs: [], results: [] };
  let query: FileListQuery = { ...filters, page: 1, pageSize: 20 };
  let pageResult = initialPage;
  let loading = true;
  let downloadingId: string | null = null;
  let downloadingSelected = false;
  let downloadingAll = false;
  let selectedIds: string[] = [];
  let toasts: ToastMessage[] = [];

  let previewOpen = false;
  let previewProductId = '';
  let previewItems: PreviewImageItem[] = [];
  let previewLoading = false;
  let previewError = '';
  let previewRequestSequence = 0;
  let originalViewerOpen = false;
  let originalViewerFile: FileListItem | null = null;
  let originalViewerBlobPromise: Promise<Blob> | null = null;
  const originalBlobCache = new Map<string, Blob>();
  const originalBlobRequests = new Map<string, Promise<Blob>>();
  const activeDownloadStorageKey = 'cuchen-active-download';
  const toastPositionStorageKey = 'cuchen-toast-position';
  const reconnectDelayMs = 6000;
  const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let toastRegionElement: HTMLDivElement | null = null;
  let toastPosition: ToastPosition | null = null;
  let toastDragState: ToastDragState | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectingBackend = false;
  let reconnectAttemptCount = 0;
  let activeDownloadCount = 0;

  $: selectedIdSet = new Set(selectedIds);
  $: currentPageIds = pageResult.items.map((item) => item.id);
  $: selectedVisibleCount = currentPageIds.filter((id) => selectedIdSet.has(id)).length;
  $: allVisibleSelected = currentPageIds.length > 0 && selectedVisibleCount === currentPageIds.length;
  $: toastRegionStyle = toastPosition
    ? `left: ${toastPosition.left}px; top: ${toastPosition.top}px; right: auto; bottom: auto;`
    : '';

  function showToast(
    message: string,
    tone: ToastTone,
    id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    durationMs: number | null = tone === 'error' ? 6000 : 3500
  ): string {
    const nextToast = { id, tone, message };
    const existing = toasts.some((toast) => toast.id === id);
    toasts = existing ? toasts.map((toast) => (toast.id === id ? nextToast : toast)) : [...toasts, nextToast];
    if (durationMs === null) {
      clearToastDismiss(id);
    } else {
      scheduleToastDismiss(id, durationMs);
    }
    return id;
  }

  function clearToastDismiss(id: string): void {
    const existingTimer = toastTimers.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimers.delete(id);
    }
  }

  function scheduleToastDismiss(id: string, durationMs: number): void {
    clearToastDismiss(id);

    const timer = setTimeout(() => dismissToast(id), durationMs);
    toastTimers.set(id, timer);
  }

  function dismissToast(id: string): void {
    clearToastDismiss(id);
    toasts = toasts.filter((toast) => toast.id !== id);
  }

  function shouldScrollToast(message: string): boolean {
    return message.length > 28;
  }

  function clampToastPosition(position: ToastPosition): ToastPosition {
    if (typeof window === 'undefined') return position;
    const margin = 8;
    const rect = toastRegionElement?.getBoundingClientRect();
    const width = rect?.width ?? 420;
    const height = rect?.height ?? 56;
    return {
      left: Math.min(Math.max(position.left, margin), Math.max(margin, window.innerWidth - width - margin)),
      top: Math.min(Math.max(position.top, margin), Math.max(margin, window.innerHeight - height - margin))
    };
  }

  function saveToastPosition(position: ToastPosition): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(toastPositionStorageKey, JSON.stringify(position));
  }

  function restoreToastPosition(): void {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(toastPositionStorageKey);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<ToastPosition>;
      if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return;
      toastPosition = clampToastPosition({ left: parsed.left, top: parsed.top });
    } catch {
      window.localStorage.removeItem(toastPositionStorageKey);
    }
  }

  function startToastDrag(event: PointerEvent): void {
    if (!(event.target instanceof Element) || event.target.closest('.toast-close')) return;
    const rect = toastRegionElement?.getBoundingClientRect();
    if (!rect) return;

    toastDragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    toastRegionElement?.setPointerCapture(event.pointerId);
    toastPosition = clampToastPosition({ left: rect.left, top: rect.top });
    event.preventDefault();
  }

  function moveToastDrag(event: PointerEvent): void {
    if (!toastDragState || event.pointerId !== toastDragState.pointerId) return;
    toastPosition = clampToastPosition({
      left: event.clientX - toastDragState.offsetX,
      top: event.clientY - toastDragState.offsetY
    });
  }

  function endToastDrag(event: PointerEvent): void {
    if (!toastDragState || event.pointerId !== toastDragState.pointerId) return;
    if (toastRegionElement?.hasPointerCapture(event.pointerId)) {
      toastRegionElement.releasePointerCapture(event.pointerId);
    }
    toastDragState = null;
    if (toastPosition) {
      const nextPosition = clampToastPosition(toastPosition);
      toastPosition = nextPosition;
      saveToastPosition(nextPosition);
    }
  }

  function handleWindowResize(): void {
    if (!toastPosition) return;
    const nextPosition = clampToastPosition(toastPosition);
    toastPosition = nextPosition;
    saveToastPosition(nextPosition);
  }

  function beginDownloadTask(): void {
    activeDownloadCount += 1;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(activeDownloadStorageKey, '1');
  }

  function endDownloadTask(): void {
    activeDownloadCount = Math.max(0, activeDownloadCount - 1);
    if (activeDownloadCount === 0 && typeof window !== 'undefined') {
      window.localStorage.removeItem(activeDownloadStorageKey);
    }
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (activeDownloadCount === 0) return;
    event.preventDefault();
    event.returnValue = '';
  }

  function notifyInterruptedDownload(): void {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(activeDownloadStorageKey) !== '1') return;
    window.localStorage.removeItem(activeDownloadStorageKey);
    showToast('새로고침으로 진행 중이던 다운로드가 취소되었습니다. 다시 다운로드를 시작해주세요.', 'error', 'download-interrupted');
  }

  function reportError(error: unknown, toastId: string): void {
    if (isBackendConnectionError(error)) {
      handleBackendDisconnected();
      return;
    }
    showToast(getErrorMessage(error), 'error', toastId);
  }

  function handleBackendDisconnected(): void {
    if (!reconnectingBackend) {
      reconnectingBackend = true;
      reconnectAttemptCount = 0;
      showToast('백엔드 서버와 연결이 끊겼습니다. 자동으로 재연결을 시도합니다.', 'error', 'backend-connection', null);
    }
    scheduleReconnect();
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void checkBackendRecovery();
    }, reconnectDelayMs);
  }

  function stopReconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  async function checkBackendRecovery(): Promise<void> {
    reconnectAttemptCount += 1;
    showToast(`백엔드 서버 재연결 시도 중입니다. (${reconnectAttemptCount}회)`, 'error', 'backend-connection', null);

    try {
      await checkBackendConnection();
      reconnectingBackend = false;
      reconnectAttemptCount = 0;
      stopReconnect();
      showToast('백엔드 서버와 다시 연결되었습니다.', 'success', 'backend-connection');
      await Promise.all([loadFiles(query), loadFilterOptions()]);
    } catch (error) {
      if (isBackendConnectionError(error)) {
        scheduleReconnect();
        return;
      }
      reportError(error, 'backend-connection');
    }
  }

  async function loadFiles(nextQuery: FileListQuery = query): Promise<void> {
    loading = true;

    try {
      pageResult = await listFiles(nextQuery);
      query = nextQuery;
    } catch (error) {
      reportError(error, 'file-list-error');
    } finally {
      loading = false;
    }
  }

  async function loadFilterOptions(): Promise<void> {
    try {
      filterOptions = await getFilterOptions();
    } catch (error) {
      reportError(error, 'filter-options-error');
    }
  }

  function applyFilters(nextFilters: FilterValues): void {
    filters = nextFilters;
    const nextQuery: FileListQuery = {
      ...nextFilters,
      page: 1,
      pageSize: query.pageSize
    };

    void loadFiles(nextQuery);
  }

  function resetFilters(): void {
    const defaultFilters = createDefaultFilters();
    filters = defaultFilters;
    void loadFiles({ ...defaultFilters, page: 1, pageSize: query.pageSize });
  }

  function changePage(nextPage: number): void {
    if (nextPage < 1 || (pageResult.totalPages > 0 && nextPage > pageResult.totalPages)) return;
    void loadFiles({ ...query, page: nextPage });
  }

  function changePageSize(nextPageSize: number): void {
    void loadFiles({ ...query, page: 1, pageSize: nextPageSize });
  }

  function selectFile(file: FileListItem, selected: boolean): void {
    if (selected) {
      selectedIds = [...new Set([...selectedIds, file.id])];
      return;
    }

    selectedIds = selectedIds.filter((id) => id !== file.id);
  }

  function selectVisibleFiles(selected: boolean): void {
    if (selected) {
      selectedIds = [...new Set([...selectedIds, ...currentPageIds])];
      return;
    }

    const currentPageIdSet = new Set(currentPageIds);
    selectedIds = selectedIds.filter((id) => !currentPageIdSet.has(id));
  }

  function revokePreviewUrls(items: PreviewImageItem[] = previewItems): void {
    for (const item of items) {
      if (item.imageUrl) {
        URL.revokeObjectURL(item.imageUrl);
      }
    }
  }

  function patchPreviewItem(requestId: number, fileId: string, patch: Partial<PreviewImageItem>): void {
    if (requestId !== previewRequestSequence) return;

    previewItems = previewItems.map((item) => {
      if (item.file.id !== fileId) return item;
      return { ...item, ...patch };
    });
  }

  async function openPreview(file: FileListItem): Promise<void> {
    const requestId = previewRequestSequence + 1;
    previewRequestSequence = requestId;
    previewOpen = true;
    previewProductId = file.productId;
    previewLoading = true;
    previewError = '';
    revokePreviewUrls();
    previewItems = [];

    const nextItems: PreviewImageItem[] = [];

    try {
      const productFiles = await getProductFiles(file.id);

      if (requestId !== previewRequestSequence) {
        return;
      }

      nextItems.push(
        ...productFiles.map((productFile) => ({
          file: productFile,
          imageLoading: true
        }))
      );
      previewItems = nextItems;
      previewLoading = false;

      for (const productFile of productFiles) {
        void (async () => {
          try {
            const blob = await getPreviewImageBlob(productFile.id);
            const imageUrl = URL.createObjectURL(blob);

            if (requestId !== previewRequestSequence) {
              URL.revokeObjectURL(imageUrl);
              return;
            }

            patchPreviewItem(requestId, productFile.id, {
              imageUrl,
              imageLoading: false,
              imageError: ''
            });
          } catch (error) {
            patchPreviewItem(requestId, productFile.id, {
              imageLoading: false,
              imageError: getErrorMessage(error)
            });
          }
        })();
      }
    } catch (error) {
      revokePreviewUrls(nextItems);
      if (requestId === previewRequestSequence) {
        previewError = getErrorMessage(error);
      }
    } finally {
      if (requestId === previewRequestSequence && previewItems.length === 0) {
        previewLoading = false;
      }
    }
  }

  function closePreview(): void {
    previewRequestSequence += 1;
    previewOpen = false;
    previewProductId = '';
    previewError = '';
    previewLoading = false;
    revokePreviewUrls();
    previewItems = [];
    closeOriginalViewer();
  }

  function getCachedOriginalBlob(file: FileListItem): Promise<Blob> {
    const cachedBlob = originalBlobCache.get(file.id);
    if (cachedBlob) {
      return Promise.resolve(cachedBlob);
    }

    const pendingRequest = originalBlobRequests.get(file.id);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = getImageBlob(file.id)
      .then((blob) => {
        originalBlobCache.set(file.id, blob);
        if (originalBlobCache.size > maxOriginalBlobCacheSize) {
          const oldestFileId = originalBlobCache.keys().next().value;
          if (oldestFileId) {
            originalBlobCache.delete(oldestFileId);
          }
        }
        return blob;
      })
      .finally(() => {
        originalBlobRequests.delete(file.id);
      });

    originalBlobRequests.set(file.id, request);
    return request;
  }

  function prefetchOriginal(file: FileListItem): void {
    void getCachedOriginalBlob(file).catch(() => {
      originalBlobCache.delete(file.id);
    });
  }

  function openOriginalViewer(file: FileListItem): void {
    originalViewerFile = file;
    originalViewerBlobPromise = getCachedOriginalBlob(file);
    originalViewerOpen = true;
  }

  function closeOriginalViewer(): void {
    originalViewerOpen = false;
    originalViewerFile = null;
    originalViewerBlobPromise = null;
  }

  async function download(file: FileListItem): Promise<void> {
    downloadingId = file.id;
    beginDownloadTask();

    try {
      const result = await saveFileToDisk(file);
      showToast(result.canceled ? '다운로드가 취소되었습니다.' : `저장 완료: ${result.filePath ?? file.fileName}`, 'success', `download-${file.id}`);
    } catch (error) {
      showToast(getErrorMessage(error), 'error', `download-${file.id}`);
    } finally {
      downloadingId = null;
      endDownloadTask();
    }
  }

  async function downloadSelectedFiles(): Promise<void> {
    if (selectedIds.length === 0) return;

    downloadingSelected = true;
    beginDownloadTask();

    try {
      const result = await saveSelectedFilesToDisk(selectedIds, (progress) => {
        showToast(progress.message, 'info', 'selected-download', null);
      });
      showToast(result.canceled ? '선택 다운로드가 취소되었습니다.' : `선택 파일 저장 완료: ${result.filePath ?? selectedIds.length}`, 'success', 'selected-download');
    } catch (error) {
      showToast(getErrorMessage(error), 'error', 'selected-download');
    } finally {
      downloadingSelected = false;
      endDownloadTask();
    }
  }

  async function downloadAllFiles(): Promise<void> {
    if (pageResult.total === 0) return;

    const confirmed = window.confirm(
      `현재 검색 조건의 전체 ${pageResult.total.toLocaleString()}개 제품을 ZIP으로 생성합니다.\n데이터가 많으면 시간이 걸릴 수 있습니다.`
    );
    if (!confirmed) return;

    downloadingAll = true;
    beginDownloadTask();
    showToast('전체 다운로드 ZIP을 준비하는 중입니다.', 'info', 'all-download', null);

    try {
      const result = await saveAllFilesToDisk({ ...query, page: 1 }, pageResult.total, (progress) => {
        showToast(progress.message, 'info', 'all-download', null);
      });
      showToast(result.canceled ? '전체 다운로드가 취소되었습니다.' : `전체 파일 저장 완료: ${result.filePath ?? pageResult.total}`, 'success', 'all-download');
    } catch (error) {
      showToast(getErrorMessage(error), 'error', 'all-download');
    } finally {
      downloadingAll = false;
      endDownloadTask();
    }
  }

  onMount(() => {
    restoreToastPosition();
    notifyInterruptedDownload();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('resize', handleWindowResize);
    void loadFiles();
    void loadFilterOptions();
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('resize', handleWindowResize);
    }
    revokePreviewUrls();
    stopReconnect();
    for (const timer of toastTimers.values()) {
      clearTimeout(timer);
    }
    toastTimers.clear();
  });
</script>

<main class="page">
  <section class="toolbar" aria-label="파일 필터">
    <div class="panel-heading">
      <div>
        <h2>검색 조건</h2>
      </div>
    </div>
    <FileFilters {filters} options={filterOptions} disabled={loading} onApply={applyFilters} onReset={resetFilters} />
  </section>

  <section class="content" aria-label="파일 목록">
    <div class="list-heading">
      <div>
        <h2>파일 목록</h2>
        <p>
          현재 페이지 {pageResult.items.length.toLocaleString()}개 제품 · 전체 {pageResult.total.toLocaleString()}개 제품
          {#if pageResult.totalData !== undefined}
            ({pageResult.totalData.toLocaleString()}개 데이터)
          {/if}
        </p>
      </div>
      <div class="list-heading-actions" aria-label="다운로드">
        <label class="page-size-control">
          <span>페이지 크기</span>
          <select value={pageResult.pageSize} disabled={loading} on:change={(event) => changePageSize(Number(event.currentTarget.value))}>
            {#each pageSizeOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>
        <p class="selection-pill">선택 {selectedIds.length.toLocaleString()}개 제품</p>
        <button type="button" disabled={pageResult.total === 0 || loading || downloadingAll || downloadingSelected} on:click={downloadAllFiles}>
          {downloadingAll ? 'ZIP 생성 중' : '전체 다운로드'}
        </button>
        <button type="button" class="primary" disabled={selectedIds.length === 0 || loading || downloadingSelected || downloadingAll} on:click={downloadSelectedFiles}>
          {downloadingSelected ? '저장 중' : '선택 다운로드'}
        </button>
      </div>
    </div>
    <FileTable
      items={pageResult.items}
      {loading}
      {downloadingId}
      actionsDisabled={downloadingSelected || downloadingAll}
      {selectedIdSet}
      {allVisibleSelected}
      onPreview={openPreview}
      onDownload={download}
      onSelect={selectFile}
      onSelectVisible={selectVisibleFiles}
    />
    <Pagination
      page={pageResult.page}
      totalPages={pageResult.totalPages}
      disabled={loading}
      onPageChange={changePage}
    />
  </section>

  <ImagePreviewModal
    open={previewOpen}
    productId={previewProductId}
    items={previewItems}
    loading={previewLoading}
    error={previewError}
    onClose={closePreview}
    onOpenOriginal={openOriginalViewer}
    onPrefetchOriginal={prefetchOriginal}
  />

  <OriginalImageViewer
    open={originalViewerOpen}
    file={originalViewerFile}
    originalBlobPromise={originalViewerBlobPromise}
    onClose={closeOriginalViewer}
  />

  {#if toasts.length > 0}
    <div
      bind:this={toastRegionElement}
      class:toast-region-dragging={Boolean(toastDragState)}
      class="toast-region"
      style={toastRegionStyle}
      role="status"
      aria-live="polite"
      aria-label="알림"
      on:pointerdown={startToastDrag}
      on:pointermove={moveToastDrag}
      on:pointerup={endToastDrag}
      on:pointercancel={endToastDrag}
    >
      {#each toasts as toast (toast.id)}
        <div
          class:toast-error={toast.tone === 'error'}
          class:toast-success={toast.tone === 'success'}
          class:toast-info={toast.tone === 'info'}
          class:toast-scrolling={shouldScrollToast(toast.message)}
          class="toast"
        >
          <p><span>{toast.message}</span></p>
          <button type="button" class="toast-close" aria-label="알림 닫기" on:click={() => dismissToast(toast.id)}>닫기</button>
        </div>
      {/each}
    </div>
  {/if}
</main>
