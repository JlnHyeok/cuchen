<script lang="ts">
  import type { FileListQuery, FilterOptions, InspectionResult } from '@entities/file/model';

  type FilterValues = Pick<FileListQuery, 'dateFrom' | 'dateTo' | 'productId' | 'process' | 'version' | 'result'>;

  export let filters: FilterValues = {};
  export let options: FilterOptions = { productIds: [], processes: [], versions: [], divs: [], results: [] };
  export let disabled = false;
  export let onApply: (filters: FilterValues) => void = () => {};
  export let onReset: () => void = () => {};

  let dateFrom = '';
  let dateTo = '';
  let productId = '';
  let process = '';
  let version = '';
  let result = '';

  $: {
    dateFrom = filters.dateFrom ?? '';
    dateTo = filters.dateTo ?? '';
    productId = filters.productId ?? '';
    process = filters.process ?? '';
    version = filters.version ?? '';
    result = filters.result ?? '';
  }

  function submitFilters(): void {
    onApply({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      productId: productId.trim() || undefined,
      process: process.trim() || undefined,
      version: version.trim() || undefined,
      result: result ? (result as InspectionResult) : undefined
    });
  }
</script>

<form class="filters" on:submit|preventDefault={submitFilters}>
  <label>
    <span>시작일</span>
    <input type="date" bind:value={dateFrom} disabled={disabled} />
  </label>

  <label>
    <span>종료일</span>
    <input type="date" bind:value={dateTo} disabled={disabled} />
  </label>

  <label>
    <span>Version</span>
    <select bind:value={version} disabled={disabled}>
      <option value="">전체</option>
      {#each options.versions as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>제품번호</span>
    <input type="search" bind:value={productId} placeholder="제품번호 입력" disabled={disabled} />
  </label>

  <label>
    <span>공정 ID</span>
    <select bind:value={process} disabled={disabled}>
      <option value="">전체</option>
      {#each options.processes as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>AI 품질 판정</span>
    <select bind:value={result} disabled={disabled}>
      <option value="">전체</option>
      {#each options.results as option}
        <option value={option}>{option}</option>
      {/each}
    </select>
  </label>

  <div class="filter-actions">
    <button type="submit" class="primary" disabled={disabled}>검색</button>
    <button type="button" disabled={disabled} on:click={onReset}>초기화</button>
  </div>
</form>
