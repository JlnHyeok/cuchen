<script lang="ts">
  export let page = 1;
  export let totalPages = 0;
  export let disabled = false;
  export let onPageChange: (page: number) => void = () => {};

  const maxVisiblePages = 10;

  $: visibleTotalPages = totalPages || 1;
  $: canGoPrev = page > 1 && !disabled;
  $: canGoNext = totalPages > 0 && page < totalPages && !disabled;
  $: pageGroupStart = Math.floor((page - 1) / maxVisiblePages) * maxVisiblePages + 1;
  $: pageGroupEnd = Math.min(pageGroupStart + maxVisiblePages - 1, visibleTotalPages);
  $: pageNumbers = Array.from({ length: pageGroupEnd - pageGroupStart + 1 }, (_value, index) => pageGroupStart + index);
</script>

<div class="pagination">
  <div class="page-actions">
    <button type="button" disabled={!canGoPrev} on:click={() => onPageChange(1)}>처음</button>
    <button type="button" disabled={!canGoPrev} on:click={() => onPageChange(page - 1)}>이전</button>

    {#each pageNumbers as pageNumber}
      <button
        type="button"
        class:active-page={pageNumber === page}
        aria-current={pageNumber === page ? 'page' : undefined}
        disabled={disabled || pageNumber === page}
        on:click={() => onPageChange(pageNumber)}
      >
        {pageNumber}
      </button>
    {/each}

    <button type="button" disabled={!canGoNext} on:click={() => onPageChange(page + 1)}>다음</button>
    <button type="button" disabled={!canGoNext} on:click={() => onPageChange(visibleTotalPages)}>마지막</button>
  </div>

  <div class="page-status">{page} / {visibleTotalPages}페이지</div>
</div>
