<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import type { FileListItem } from '@entities/file/model';
  import { getImageBlob } from '@entities/file/api';
  import { getErrorMessage } from '@shared/lib/errors';

  export let open = false;
  export let file: FileListItem | null = null;
  export let originalBlobPromise: Promise<Blob> | null = null;
  export let onClose: () => void = () => {};

  let originalImageUrl = '';
  let loading = false;
  let error = '';
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let requestSequence = 0;
  let fitScale = 1;
  let imageReady = false;
  let fittedImageUrl = '';
  let viewerElement: HTMLDivElement;
  let stageElement: HTMLDivElement;
  let imageElement: HTMLImageElement;

  $: divLabel = file ? formatDiv(file.div) : '';
  $: title = file ? `${file.productId} ${divLabel}` : '원본 이미지';
  $: imageStyle = `transform: translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale});`;

  function formatDiv(value: string): string {
    if (value === 'top') return '상단 원본';
    if (value === 'bot') return '하단 원본';
    if (value === 'top-inf') return '상단 결과';
    if (value === 'bot-inf') return '하단 결과';
    return value;
  }

  function revokeImageUrl(): void {
    if (originalImageUrl) {
      URL.revokeObjectURL(originalImageUrl);
      originalImageUrl = '';
    }
  }

  function resetView(): void {
    scale = fitScale;
    offsetX = 0;
    offsetY = 0;
  }

  function resetFitScale(): void {
    fitScale = 1;
    imageReady = false;
    fittedImageUrl = '';
    resetView();
  }

  function fitImageToStage(): void {
    if (!stageElement || !imageElement || imageElement.naturalWidth === 0 || imageElement.naturalHeight === 0) return;

    const stageWidth = Math.max(0, stageElement.clientWidth - 48);
    const stageHeight = Math.max(0, stageElement.clientHeight - 48);
    const widthScale = stageWidth / imageElement.naturalWidth;
    const heightScale = stageHeight / imageElement.naturalHeight;

    fitScale = Math.min(6, Math.max(0.05, Math.min(widthScale, heightScale)));
    resetView();
    fittedImageUrl = originalImageUrl;
    imageReady = true;
  }

  async function loadOriginal(nextFile: FileListItem, blobPromise: Promise<Blob> | null): Promise<void> {
    const requestId = requestSequence + 1;
    requestSequence = requestId;
    loading = true;
    error = '';
    resetFitScale();
    revokeImageUrl();

    try {
      const blob = await (blobPromise ?? getImageBlob(nextFile.id));
      const nextUrl = URL.createObjectURL(blob);
      if (requestId !== requestSequence) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      originalImageUrl = nextUrl;
    } catch (caught) {
      if (requestId === requestSequence) {
        error = getErrorMessage(caught);
      }
    } finally {
      if (requestId === requestSequence) {
        loading = false;
      }
    }
  }

  function close(): void {
    requestSequence += 1;
    dragging = false;
    onClose();
  }

  async function focusViewer(): Promise<void> {
    await tick();
    viewerElement?.focus();
  }

  function zoomBy(delta: number, originX = 0, originY = 0): void {
    const nextScale = Math.min(6, Math.max(0.05, scale + delta));
    if (nextScale === scale) return;

    const ratio = nextScale / scale;
    offsetX = originX - (originX - offsetX) * ratio;
    offsetY = originY - (originY - offsetY) * ratio;
    scale = nextScale;
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : null;
    const originX = rect ? event.clientX - rect.left - rect.width / 2 : 0;
    const originY = rect ? event.clientY - rect.top - rect.height / 2 : 0;
    zoomBy(event.deltaY > 0 ? -0.15 : 0.15, originX, originY);
  }

  function startDrag(event: PointerEvent): void {
    if (!originalImageUrl) return;
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragging) return;
    offsetX += event.clientX - lastPointerX;
    offsetY += event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  }

  function stopDrag(event: PointerEvent): void {
    dragging = false;
    event.currentTarget instanceof HTMLElement && event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key === 'Tab') {
      const focusableElements = Array.from(
        viewerElement?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex >= 0);

      if (focusableElements.length === 0) {
        event.preventDefault();
        viewerElement?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  $: if (open && file) {
    void loadOriginal(file, originalBlobPromise);
    void focusViewer();
  }

  $: if (originalImageUrl && originalImageUrl !== fittedImageUrl) {
    imageReady = false;
  }

  $: if (!open) {
    requestSequence += 1;
    loading = false;
    error = '';
    dragging = false;
    revokeImageUrl();
    resetView();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (browser) {
      document.removeEventListener('keydown', handleKeydown);
    }
    requestSequence += 1;
    revokeImageUrl();
  });
</script>

{#if open && file}
  <div class="original-viewer-layer">
    <button class="modal-backdrop" type="button" aria-label="원본 이미지 닫기" on:click={close}></button>
    <div bind:this={viewerElement} class="original-viewer" role="dialog" aria-modal="true" aria-label="원본 이미지 뷰어" tabindex="-1">
      <header>
        <div>
          <p class="modal-eyebrow">원본 이미지</p>
          <h2>{title}</h2>
        </div>
        <div class="original-viewer-actions">
          <button type="button" aria-label="축소" on:click={() => zoomBy(-0.2)}>-</button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="확대" on:click={() => zoomBy(0.2)}>+</button>
          <button type="button" on:click={resetView}>초기화</button>
          <button type="button" aria-label="닫기" on:click={close}>닫기</button>
        </div>
      </header>

      <div
        class:dragging
        bind:this={stageElement}
        class="original-viewer-stage"
        role="presentation"
        on:wheel={handleWheel}
        on:pointerdown={startDrag}
        on:pointermove={moveDrag}
        on:pointerup={stopDrag}
        on:pointercancel={stopDrag}
        on:dblclick={resetView}
      >
        {#if loading && !originalImageUrl}
          <div class="original-viewer-status">
            <span class="initial-loading-spinner"></span>
            <p>원본 이미지를 불러오는 중입니다.</p>
          </div>
        {:else if error && !originalImageUrl}
          <p class="original-viewer-error">{error}</p>
        {:else if originalImageUrl}
          <img
            bind:this={imageElement}
            src={originalImageUrl}
            alt={`${file.productId} ${divLabel} 원본`}
            style={imageStyle}
            class:fitting={!imageReady}
            draggable="false"
            on:load={fitImageToStage}
          />
          {#if loading || error}
            <div class:error={Boolean(error)} class="original-viewer-loading-badge">
              {#if loading}
                <span class="initial-loading-spinner"></span>
              {/if}
              <span>{error ? '원본 로드 실패' : '원본 로딩 중'}</span>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
