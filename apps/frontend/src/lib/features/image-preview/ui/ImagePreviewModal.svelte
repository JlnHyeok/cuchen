<script lang="ts">
  import type { FileListItem } from '@entities/file/model';
  import { formatBytes, formatDateTime } from '@shared/lib/format';

  type PreviewImageItem = {
    file: FileListItem;
    imageUrl?: string;
    imageLoading: boolean;
    imageError?: string;
  };

  export let open = false;
  export let productId = '';
  export let items: PreviewImageItem[] = [];
  export let loading = false;
  export let error = '';
  export let onClose: () => void = () => {};
  export let onOpenOriginal: (file: FileListItem) => void = () => {};
  export let onPrefetchOriginal: (file: FileListItem) => void = () => {};

  function formatDiv(value: string): string {
    if (value === 'top') return '상단 원본';
    if (value === 'bot') return '하단 원본';
    if (value === 'top-inf') return '상단 결과';
    if (value === 'bot-inf') return '하단 결과';
    return value;
  }

  function formatList(values: Array<string | undefined>): string {
    const uniqueValues = [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
    if (uniqueValues.length === 0) return '-';
    return uniqueValues.join(', ');
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function formatThreshold(values: number[]): string {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length === 0) return '-';

    const min = Math.min(...validValues);
    const max = Math.max(...validValues);
    if (min === max) return min.toFixed(2);
    return `${min.toFixed(2)}-${max.toFixed(2)}`;
  }

  $: detailColumnCount = Math.min(Math.max(items.length || 1, 1), 4);
  $: detailModalWidth = detailColumnCount * 420 + (detailColumnCount - 1) * 16 + 42;
  $: files = items.map((item) => item.file);
  $: commonCapturedAt = files.reduce((latest, file) => (file.time > latest ? file.time : latest), files[0]?.time ?? '');
  $: commonProcess = formatList(files.map((file) => file.process));
  $: commonVersion = formatList(files.map((file) => file.version));
  $: commonResult = files.some((file) => file.result === 'NG') ? 'NG' : 'OK';
  $: commonProbability = files.reduce((minimum, file) => Math.min(minimum, file.prob), files[0]?.prob ?? 0);
  $: commonThreshold = formatThreshold(files.map((file) => file.threshold));
</script>

{#if open}
  <div class="modal-layer">
    <button class="modal-backdrop" type="button" aria-label="제품 이미지 상세 닫기" on:click={onClose}></button>
    <div
      class="modal product-detail-modal"
      style={`--detail-columns: ${detailColumnCount}; --detail-modal-width: ${detailModalWidth}px`}
      role="dialog"
      aria-modal="true"
      aria-label="제품 이미지 상세"
      tabindex="-1"
    >
      <header>
        <div>
          <p class="modal-eyebrow">제품 이미지 상세</p>
          <h2>{productId || '이미지 상세'}</h2>
        </div>
        <button type="button" aria-label="닫기" on:click={onClose}>닫기</button>
      </header>

      <div class="preview-body detail-preview-body">
        {#if loading}
          <p>제품 이미지와 메타데이터를 불러오는 중입니다.</p>
        {:else if error}
          <p class="error">{error}</p>
        {:else if items.length > 0}
          <div class="detail-layout">
            <dl class="common-metadata">
              <div class="common-field product-field">
                <dt>제품번호</dt>
                <dd>{productId}</dd>
              </div>
              <div class="common-field captured-field">
                <dt>촬영일시</dt>
                <dd>{commonCapturedAt ? formatDateTime(commonCapturedAt) : '-'}</dd>
              </div>
              <div class="common-field process-field">
                <dt>공정 ID</dt>
                <dd>{commonProcess}</dd>
              </div>
              <div class="common-field version-field">
                <dt>Version</dt>
                <dd>{commonVersion}</dd>
              </div>
              <div class="common-field quality-field">
                <dt>AI 품질 판정</dt>
                <dd>
                  <span class="quality-badge">
                    <span class:ok={commonResult === 'OK'} class:ng={commonResult === 'NG'} class="tag">
                      {commonResult}
                    </span>
                    <span class:ok={commonResult === 'OK'} class:ng={commonResult === 'NG'} class="quality-percent">{formatPercent(commonProbability)}</span>
                  </span>
                </dd>
              </div>
              <div class="common-field probability-field">
                <dt>예측값</dt>
                <dd>{formatPercent(commonProbability)}</dd>
              </div>
              <div class="common-field threshold-field">
                <dt>판정 기준</dt>
                <dd>{commonThreshold}</dd>
              </div>
            </dl>

            <div class="detail-grid">
              {#each items as item (item.file.id)}
                <article class="detail-card">
                  <div class="detail-card-header">
                    <div>
                      <h3>{formatDiv(item.file.div)}</h3>
                      <p>{item.file.fileName}</p>
                    </div>
                  </div>

                  <div class="detail-image-shell">
                    {#if item.imageUrl}
                      <button
                        class="detail-image-button"
                        type="button"
                        aria-label={`${formatDiv(item.file.div)} 원본 보기`}
                        on:click={() => onOpenOriginal(item.file)}
                        on:focus={() => onPrefetchOriginal(item.file)}
                        on:mouseenter={() => onPrefetchOriginal(item.file)}
                      >
                        <img class="detail-image" src={item.imageUrl} alt={`${item.file.productId} ${formatDiv(item.file.div)} 미리보기`} />
                      </button>
                    {:else if item.imageError}
                      <div class="detail-image-placeholder detail-image-error">{item.imageError}</div>
                    {:else}
                      <div class="detail-image-placeholder">{item.imageLoading ? '이미지 불러오는 중...' : '이미지가 없습니다.'}</div>
                    {/if}
                  </div>
                  <dl class="metadata-list">
                    <div>
                      <dt>이미지 구분</dt>
                      <dd>{formatDiv(item.file.div)}</dd>
                    </div>
                    <div>
                      <dt>LOT</dt>
                      <dd>{item.file.lotNo ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>공정 ID</dt>
                      <dd>{item.file.processId ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>크기</dt>
                      <dd>{formatBytes(item.file.sizeBytes)}</dd>
                    </div>
                  </dl>
                </article>
              {/each}
            </div>
          </div>
        {:else}
          <p>표시할 이미지가 없습니다.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
