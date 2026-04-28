<script lang="ts">
  import type { FileListItem } from '@entities/file/model';
  import { formatBytes, formatDateTime } from '@shared/lib/format';

  export let items: FileListItem[] = [];
  export let loading = false;
  export let downloadingId: string | null = null;
  export let actionsDisabled = false;
  export let selectedIdSet: Set<string> = new Set();
  export let allVisibleSelected = false;
  export let onPreview: (file: FileListItem) => void = () => {};
  export let onDownload: (file: FileListItem) => void = () => {};
  export let onSelect: (file: FileListItem, selected: boolean) => void = () => {};
  export let onSelectVisible: (selected: boolean) => void = () => {};

  function readChecked(event: Event): boolean {
    return (event.currentTarget as HTMLInputElement).checked;
  }

  function displayProbability(file: FileListItem): number {
    return file.minProb ?? file.prob;
  }

  function formatList(values: string[] | undefined): string {
    if (!values || values.length === 0) return '-';
    if (values.length <= 2) return values.join(', ');
    return `${values.slice(0, 2).join(', ')} 외 ${values.length - 2}`;
  }

  function formatQualityPercent(file: FileListItem): string {
    return `${Math.round(displayProbability(file) * 100)}%`;
  }
</script>

<div class="table-shell" aria-busy={loading}>
  {#if loading && items.length === 0}
    <div class="initial-loading-panel" role="status" aria-live="polite">
      <div class="initial-loading">
        <span class="initial-loading-spinner" aria-hidden="true"></span>
        <span>파일 목록을 불러오는 중입니다.</span>
      </div>
    </div>
  {/if}

  <table class:table-refreshing={loading && items.length > 0}>
    <thead>
      <tr>
        <th class="select-col">
          <input
            type="checkbox"
            aria-label="현재 페이지 전체 선택"
            checked={allVisibleSelected}
            disabled={loading || items.length === 0}
            on:change={(event) => onSelectVisible(readChecked(event))}
          />
        </th>
        <th class="file-name-col">제품번호</th>
        <th class="result-cell">AI 품질 판정</th>
        <th class="metadata-date-col">촬영일시</th>
        <th class="metadata-process-col">공정</th>
        <th class="metadata-list-col">Version</th>
        <th class="size-col">크기</th>
        <th class="action-col">상세</th>
        <th class="action-col">다운로드</th>
      </tr>
    </thead>
    <tbody>
      {#if items.length === 0}
        <tr>
          <td class="empty" colspan="9">
            {loading ? '' : '조건에 맞는 파일이 없습니다.'}
          </td>
        </tr>
      {:else}
        {#each items as file}
          <tr class:selected-row={selectedIdSet.has(file.id)} class:row-refreshing={loading}>
            <td class="select-col">
              <input
                type="checkbox"
                aria-label={`${file.fileName} 선택`}
                checked={selectedIdSet.has(file.id)}
                disabled={loading || actionsDisabled}
                on:change={(event) => onSelect(file, readChecked(event))}
              />
            </td>
            <td class="file-name">
              <span class="file-title">{file.productId}</span>
              <span class="file-subtitle">
                {file.fileCount && file.fileCount > 1 ? `${file.fileCount}개 이미지 묶음` : file.fileName}
              </span>
            </td>
            <td class="result-cell">
              <span class:ok={file.result === 'OK'} class:ng={file.result === 'NG'} class="tag">
                {file.result}
              </span>
              <span class:ok={file.result === 'OK'} class:ng={file.result === 'NG'} class="quality-percent">{formatQualityPercent(file)}</span>
            </td>
            <td class="metadata-date-col">
              <span class="metadata-value metadata-date-value" title={formatDateTime(file.time)}>{formatDateTime(file.time)}</span>
            </td>
            <td class="metadata-process-col">
              <span class="metadata-value metadata-process-value" title={formatList(file.processes ?? (file.process ? [file.process] : []))}>
                {formatList(file.processes ?? (file.process ? [file.process] : []))}
              </span>
            </td>
            <td class="metadata-list-col">
              <span class="metadata-value" title={formatList(file.versions ?? (file.version ? [file.version] : []))}>
                {formatList(file.versions ?? (file.version ? [file.version] : []))}
              </span>
            </td>
            <td>{formatBytes(file.sizeBytes)}</td>
            <td class="action-col">
              <button type="button" on:click={() => onPreview(file)} disabled={loading || actionsDisabled}>상세</button>
            </td>
            <td class="action-col">
              <button type="button" on:click={() => onDownload(file)} disabled={loading || actionsDisabled || downloadingId === file.id}>
                {downloadingId === file.id ? '저장 중' : '다운로드'}
              </button>
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
