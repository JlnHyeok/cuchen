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

  function formatDiv(value: string): string {
    if (value === 'top') return '상단 원본';
    if (value === 'bot') return '하단 원본';
    if (value === 'top-inf') return '상단 결과';
    if (value === 'bot-inf') return '하단 결과';
    return value;
  }

  $: detailColumnCount = Math.min(Math.max(items.length || 1, 1), 4);
  $: detailModalWidth = detailColumnCount * 420 + (detailColumnCount - 1) * 16 + 42;
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
          <div class="detail-grid">
            {#each items as item (item.file.id)}
              <article class="detail-card">
                <div class="detail-card-header">
                  <div>
                    <h3>{formatDiv(item.file.div)}</h3>
                    <p>{item.file.fileName}</p>
                  </div>
                  <span class:ok={item.file.result === 'OK'} class:ng={item.file.result === 'NG'} class="tag">
                    {item.file.result}
                  </span>
                </div>

                <div class="detail-image-shell">
                  {#if item.imageUrl}
                    <img class="detail-image" src={item.imageUrl} alt={`${item.file.productId} ${formatDiv(item.file.div)} 미리보기`} />
                  {:else if item.imageError}
                    <div class="detail-image-placeholder detail-image-error">{item.imageError}</div>
                  {:else}
                    <div class="detail-image-placeholder">{item.imageLoading ? '이미지 불러오는 중...' : '이미지가 없습니다.'}</div>
                  {/if}
                </div>

                <dl class="metadata-list">
                  <div>
                    <dt>제품번호</dt>
                    <dd>{item.file.productId}</dd>
                  </div>
                  <div>
                    <dt>이미지 구분</dt>
                    <dd>{formatDiv(item.file.div)}</dd>
                  </div>
                  <div>
                    <dt>촬영 일시</dt>
                    <dd>{formatDateTime(item.file.time)}</dd>
                  </div>
                  <div>
                    <dt>로트 번호</dt>
                    <dd>{item.file.lotNo ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>카메라 ID</dt>
                    <dd>{item.file.cameraId ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>판정 임계 값</dt>
                    <dd>{item.file.threshold.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>예측 확률</dt>
                    <dd>{Math.round(item.file.prob * 100)}%</dd>
                  </div>
                  <div>
                    <dt>크기</dt>
                    <dd>{formatBytes(item.file.sizeBytes)}</dd>
                  </div>
                </dl>
              </article>
            {/each}
          </div>
        {:else}
          <p>표시할 이미지가 없습니다.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
