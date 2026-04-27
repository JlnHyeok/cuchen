<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getFilterOptions, getImageBlob, getPreviewImageBlob, getProductFiles, listFiles } from '@entities/file/api';
  import type { FileListItem, FileListQuery, FilterOptions, PageResult } from '@entities/file/model';
  import { saveFileToDisk, saveSelectedFilesToDisk } from '@features/file-download/model/saveFileToDisk';
  import FileFilters from '@features/file-filter/ui/FileFilters.svelte';
  import ImagePreviewModal from '@features/image-preview/ui/ImagePreviewModal.svelte';
  import OriginalImageViewer from '@features/image-preview/ui/OriginalImageViewer.svelte';
  import FileTable from '@widgets/file-table/ui/FileTable.svelte';
  import Pagination from '@widgets/file-table/ui/Pagination.svelte';
  import { getErrorMessage } from '@shared/lib/errors';

  type FilterValues = Pick<FileListQuery, 'dateFrom' | 'dateTo' | 'productId' | 'lotNo' | 'cameraId' | 'div' | 'result'>;
  type PreviewImageItem = {
    file: FileListItem;
    imageUrl?: string;
    imageLoading: boolean;
    imageError?: string;
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

  let filters: FilterValues = {};
  let filterOptions: FilterOptions = { productIds: [], divs: [], results: [] };
  let query: FileListQuery = { page: 1, pageSize: 20 };
  let pageResult = initialPage;
  let loading = true;
  let errorMessage = '';
  let statusMessage = '';
  let downloadingId: string | null = null;
  let downloadingSelected = false;
  let selectedIds: string[] = [];

  let previewOpen = false;
  let previewProductId = '';
  let previewItems: PreviewImageItem[] = [];
  let previewLoading = false;
  let previewError = '';
  let previewRequestSequence = 0;
  let originalViewerOpen = false;
  let originalViewerFile: FileListItem | null = null;
  let originalViewerPreviewUrl = '';
  let originalViewerBlobPromise: Promise<Blob> | null = null;
  const originalBlobCache = new Map<string, Blob>();
  const originalBlobRequests = new Map<string, Promise<Blob>>();

  $: selectedIdSet = new Set(selectedIds);
  $: currentPageIds = pageResult.items.map((item) => item.id);
  $: selectedVisibleCount = currentPageIds.filter((id) => selectedIdSet.has(id)).length;
  $: allVisibleSelected = currentPageIds.length > 0 && selectedVisibleCount === currentPageIds.length;

  async function loadFiles(nextQuery: FileListQuery = query): Promise<void> {
    loading = true;
    errorMessage = '';

    try {
      pageResult = await listFiles(nextQuery);
      query = nextQuery;
    } catch (error) {
      errorMessage = getErrorMessage(error);
    } finally {
      loading = false;
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
    filters = {};
    void loadFiles({ page: 1, pageSize: query.pageSize });
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
    const previewItem = previewItems.find((item) => item.file.id === file.id);
    originalViewerFile = file;
    originalViewerPreviewUrl = previewItem?.imageUrl ?? '';
    originalViewerBlobPromise = getCachedOriginalBlob(file);
    originalViewerOpen = true;
  }

  function closeOriginalViewer(): void {
    originalViewerOpen = false;
    originalViewerFile = null;
    originalViewerPreviewUrl = '';
    originalViewerBlobPromise = null;
  }

  async function download(file: FileListItem): Promise<void> {
    downloadingId = file.id;
    errorMessage = '';
    statusMessage = '';

    try {
      const result = await saveFileToDisk(file);
      statusMessage = result.canceled ? '다운로드가 취소되었습니다.' : `저장 완료: ${result.filePath ?? file.fileName}`;
    } catch (error) {
      errorMessage = getErrorMessage(error);
    } finally {
      downloadingId = null;
    }
  }

  async function downloadSelectedFiles(): Promise<void> {
    if (selectedIds.length === 0) return;

    downloadingSelected = true;
    errorMessage = '';
    statusMessage = '';

    try {
      const result = await saveSelectedFilesToDisk(selectedIds);
      statusMessage = result.canceled ? '선택 다운로드가 취소되었습니다.' : `선택 파일 저장 완료: ${result.filePath ?? selectedIds.length}`;
    } catch (error) {
      errorMessage = getErrorMessage(error);
    } finally {
      downloadingSelected = false;
    }
  }

  onMount(() => {
    void loadFiles();
    void getFilterOptions()
      .then((options) => {
        filterOptions = options;
      })
      .catch((error) => {
        errorMessage = getErrorMessage(error);
      });
  });

  onDestroy(() => {
    revokePreviewUrls();
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

  {#if errorMessage}
    <p class="message error">{errorMessage}</p>
  {:else if statusMessage}
    <p class="message success">{statusMessage}</p>
  {/if}

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
      <div class="list-heading-actions" aria-label="선택 다운로드">
        <label class="page-size-control">
          <span>페이지 크기</span>
          <select value={pageResult.pageSize} disabled={loading} on:change={(event) => changePageSize(Number(event.currentTarget.value))}>
            {#each pageSizeOptions as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </label>
        <p class="selection-pill">선택 {selectedIds.length.toLocaleString()}개 제품</p>
        <button type="button" class="primary" disabled={selectedIds.length === 0 || loading || downloadingSelected} on:click={downloadSelectedFiles}>
          {downloadingSelected ? '저장 중' : '선택 다운로드'}
        </button>
      </div>
    </div>
    <FileTable
      items={pageResult.items}
      {loading}
      {downloadingId}
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
    previewUrl={originalViewerPreviewUrl}
    originalBlobPromise={originalViewerBlobPromise}
    onClose={closeOriginalViewer}
  />
</main>
