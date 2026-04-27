<script lang="ts">
  import type { FileListQuery, FilterOptions, ImageDiv, InspectionResult } from '@entities/file/model';

  type FilterValues = Pick<FileListQuery, 'dateFrom' | 'dateTo' | 'productId' | 'lotNo' | 'cameraId' | 'div' | 'result'>;

  export let filters: FilterValues = {};
  export let options: FilterOptions = { productIds: [], divs: [], results: [] };
  export let disabled = false;
  export let onApply: (filters: FilterValues) => void = () => {};
  export let onReset: () => void = () => {};

  let dateFrom = '';
  let dateTo = '';
  let productId = '';
  let lotNo = '';
  let cameraId = '';
  let div = '';
  let result = '';

  $: {
    dateFrom = filters.dateFrom ?? '';
    dateTo = filters.dateTo ?? '';
    productId = filters.productId ?? '';
    lotNo = filters.lotNo ?? '';
    cameraId = filters.cameraId ?? '';
    div = filters.div ?? '';
    result = filters.result ?? '';
  }

  function submitFilters(): void {
    onApply({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      productId: productId.trim() || undefined,
      lotNo: lotNo.trim() || undefined,
      cameraId: cameraId.trim() || undefined,
      div: div ? (div as ImageDiv) : undefined,
      result: result ? (result as InspectionResult) : undefined
    });
  }

  function formatDiv(value: string): string {
    if (value === 'top') return '상단 원본';
    if (value === 'bot') return '하단 원본';
    if (value === 'top-inf') return '상단 결과';
    if (value === 'bot-inf') return '하단 결과';
    return value;
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
    <span>제품번호</span>
    <input type="search" bind:value={productId} placeholder="제품번호 입력" disabled={disabled} />
  </label>

  <label>
    <span>LOT</span>
    <input type="search" bind:value={lotNo} placeholder="LOT 입력" disabled={disabled} />
  </label>

  <label>
    <span>CAMERA</span>
    <input type="search" bind:value={cameraId} placeholder="CAMERA 입력" disabled={disabled} />
  </label>

  <label>
    <span>이미지 구분</span>
    <select bind:value={div} disabled={disabled}>
      <option value="">전체</option>
      {#each options.divs as option}
        <option value={option}>{formatDiv(option)}</option>
      {/each}
    </select>
  </label>

  <label>
    <span>검사 결과</span>
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
