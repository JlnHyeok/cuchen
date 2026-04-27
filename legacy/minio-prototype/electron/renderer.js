const bucketInfoEl = document.getElementById("bucketInfo");
const bucketListEl = document.getElementById("bucketList");
const filterTextEl = document.getElementById("filterText");
const filterProductNoEl = document.getElementById("filterProductNo");
const filterResultEl = document.getElementById("filterResult");
const filterThresholdMinEl = document.getElementById("filterThresholdMin");
const filterThresholdMaxEl = document.getElementById("filterThresholdMax");
const clearFiltersEl = document.getElementById("clearFilters");
const filterInfoEl = document.getElementById("filterInfo");
const fileListEl = document.getElementById("fileList");
const metadataListEl = document.getElementById("metadataList");
const tagsListEl = document.getElementById("tagsList");
const refreshBtn = document.getElementById("refresh");

const state = {
  defaultBucket: null,
  buckets: [],
  selectedBucket: null,
  items: [],
  selectedId: null,
  selectedRecord: null,
  visibleItems: [],
  bucketLoadToken: 0,
  detailLoadToken: 0,
  lastBucketLoadMs: null,
  bucketLoading: false,
  filters: {
    text: "",
    productNo: "",
    result: "",
    thresholdMin: "",
    thresholdMax: ""
  }
};
let filterApplyTimer = null;

await bootstrap();

async function bootstrap() {
  bindEvents();

  const config = await window.viewerApi.getConfig();
  state.defaultBucket = config.defaultBucket || null;

  await loadBuckets();
}

function bindEvents() {
  refreshBtn.addEventListener("click", async () => {
    await loadBuckets();
  });

  bucketListEl.addEventListener("click", (event) => {
    const button = event.target.closest(".bucket-row");
    if (!button || !bucketListEl.contains(button)) {
      return;
    }
    loadBucket(button.dataset.bucket);
  });

  fileListEl.addEventListener("click", (event) => {
    const button = event.target.closest(".file-row");
    if (!button || !fileListEl.contains(button)) {
      return;
    }
    selectItem(button.dataset.id);
  });

  for (const element of [
    filterTextEl,
    filterProductNoEl,
    filterResultEl,
    filterThresholdMinEl,
    filterThresholdMaxEl
  ]) {
    element.addEventListener("input", scheduleFilterApply);
  }

  clearFiltersEl.addEventListener("click", async () => {
    filterTextEl.value = "";
    filterProductNoEl.value = "";
    filterResultEl.value = "";
    filterThresholdMinEl.value = "";
    filterThresholdMaxEl.value = "";
    state.filters = {
      text: "",
      productNo: "",
      result: "",
      thresholdMin: "",
      thresholdMax: ""
    };
    await applyCurrentFilters({ preserveSelection: false });
  });
}

async function loadBuckets() {
  const token = ++state.bucketLoadToken;
  bucketListEl.innerHTML = renderEmptyState("버킷을 불러오는 중...");
  try {
    const result = await window.viewerApi.listBuckets();
    if (token !== state.bucketLoadToken) {
      return;
    }
    state.buckets = result.buckets || [];

    if (!state.selectedBucket || !state.buckets.some((bucket) => bucket.name === state.selectedBucket)) {
      state.selectedBucket =
        state.buckets.find((bucket) => bucket.name === state.defaultBucket)?.name ||
        state.buckets[0]?.name ||
        null;
    }

    renderBucketList();

    if (state.selectedBucket) {
      await loadBucket(state.selectedBucket);
    } else {
      renderEmptyPanels("버킷이 없습니다.");
    }
  } catch (error) {
    bucketListEl.innerHTML = renderEmptyState(`버킷 불러오기 실패: ${error.message}`);
    renderEmptyPanels("버킷 목록을 가져올 수 없습니다.");
  }
}

async function refreshCurrentBucket() {
  await loadBuckets();
}

async function loadBucket(bucket, options = {}) {
  const token = ++state.bucketLoadToken;
  const startedAt = performance.now();
  const previousSelectedId = state.selectedId;
  state.selectedBucket = bucket;
  state.selectedId = null;
  state.selectedRecord = null;
  state.items = [];
  state.visibleItems = [];
  state.bucketLoading = true;
  renderBucketList();
  renderFileList();
  renderMetadataPanelsLoading("불러오는 중...");
  bucketInfoEl.textContent = `${bucket} · loading...`;

  try {
    const result = await window.viewerApi.listFiles({ bucket, refresh: Boolean(options.refresh) });
    if (token !== state.bucketLoadToken) {
      return null;
    }
    const elapsedMs = performance.now() - startedAt;
    state.lastBucketLoadMs = elapsedMs;
    state.items = result.items || [];
    state.bucketLoading = false;
    await applyCurrentFilters({
      preserveSelection: Boolean(options.refresh),
      refreshSelected: Boolean(options.refresh),
      preferredSelectedId: previousSelectedId,
      result,
      elapsedMs
    });
    return result;
  } catch (error) {
    if (/Bucket not found/i.test(error.message)) {
      await loadBuckets();
      return null;
    }
    if (token !== state.bucketLoadToken) {
      return null;
    }
    state.bucketLoading = false;
    state.items = [];
    state.visibleItems = [];
    renderFileList();
    renderEmptyPanels("파일 목록을 가져올 수 없습니다.");
    bucketInfoEl.textContent = `${bucket} · error`;
    return null;
  }
}

function renderBucketList() {
  bucketListEl.innerHTML = state.buckets.length
    ? state.buckets
        .map((bucket) => {
          const active = bucket.name === state.selectedBucket ? "active" : "";
          const summary = bucket.bucketSummary || "MinIO bucket";
          const details = bucket.bucketDetails || summary;
          return `
            <button class="bucket-row ${active}" data-bucket="${escapeHtml(bucket.name)}" title="${escapeHtml(details)}">
              <div class="row-title">${escapeHtml(bucket.name)}</div>
              <div class="row-meta">${escapeHtml(summary)}</div>
            </button>
          `;
        })
        .join("")
    : renderEmptyState("버킷이 없습니다.");
}

function renderBucketInfo(result = {}, elapsedMs = null) {
  const totalCount = Number.isFinite(result.total) ? result.total : state.items.length;
  const visibleCount = state.visibleItems.length;
  const countLabel = visibleCount < totalCount ? `${visibleCount}/${totalCount}` : `${totalCount}`;
  const timing = Number.isFinite(elapsedMs) ? ` · ${formatMs(elapsedMs)}` : "";
  bucketInfoEl.textContent = `${state.selectedBucket || "No bucket"} · ${countLabel} files${timing}`;
  renderFilterInfo(totalCount, visibleCount);
}

function renderFileList() {
  const visibleItems = state.visibleItems.length ? state.visibleItems : getVisibleItems();
  state.visibleItems = visibleItems;
  const emptyMessage = state.bucketLoading
    ? "불러오는 중..."
    : state.items.length
      ? "필터에 맞는 파일이 없습니다."
      : "파일이 없습니다.";
  fileListEl.innerHTML = visibleItems.length
    ? visibleItems
        .map((item) => {
          const active = item.id === state.selectedId ? "active" : "";
          const resultValue = item.aiResult ?? item.result ?? item.inspectionResult;
          const summary = [item.productNo, resultValue].filter(Boolean).join(" · ");
          const subtitle = [summary, item.capturedAt].filter(Boolean).join(" / ");
          return `
            <button class="file-row ${active}" data-id="${escapeHtml(item.id)}">
              <div class="row-title">${escapeHtml(item.baseName || item.id)}</div>
              <div class="row-meta">${escapeHtml(subtitle || item.recordKey || "")}</div>
            </button>
          `;
        })
        .join("")
    : renderEmptyState(emptyMessage);

}

async function selectItem(id) {
  const token = ++state.detailLoadToken;
  state.selectedId = id;
  renderFileList();
  renderMetadataPanelsLoading("불러오는 중...");

  try {
    state.selectedRecord = await window.viewerApi.getDetails({
      bucket: state.selectedBucket,
      id
    });
    if (token !== state.detailLoadToken) {
      return;
    }

    if (state.selectedRecord?.ok === false) {
      renderMetadataPanels(state.selectedRecord);
      bucketInfoEl.textContent = `${state.selectedBucket || "No bucket"} · partial data`;
      return;
    }

    renderMetadataPanels(state.selectedRecord);
  } catch (error) {
    if (token !== state.detailLoadToken) {
      return;
    }
    renderEmptyPanels(`선택 항목을 불러올 수 없습니다: ${error.message}`);
  }
}

function renderMetadataPanels(record) {
  const metadataRows = Object.entries(record.meta || {});
  metadataListEl.innerHTML = renderKeyValueRows(metadataRows);

  const tagRows = Object.entries(record.tag || {});
  tagsListEl.innerHTML = renderKeyValueRows(tagRows);
}

async function applyCurrentFilters({
  preserveSelection = false,
  refreshSelected = false,
  preferredSelectedId = null,
  result = null,
  elapsedMs = null
} = {}) {
  syncFiltersFromInputs();
  const visibleItems = getVisibleItems();
  state.visibleItems = visibleItems;

  if (result) {
    renderBucketInfo(result, elapsedMs);
  } else {
    renderBucketInfo({ total: state.items.length }, state.lastBucketLoadMs);
  }

  renderFileList();

  if (!visibleItems.length) {
    state.detailLoadToken += 1;
    state.selectedId = null;
    renderEmptyPanels("필터에 맞는 파일이 없습니다.");
    return;
  }

  const selectedStillVisible = visibleItems.some((item) => item.id === state.selectedId);
  if (refreshSelected && preferredSelectedId && visibleItems.some((item) => item.id === preferredSelectedId)) {
    await selectItem(preferredSelectedId);
    return;
  }
  if (!selectedStillVisible || !preserveSelection) {
    await selectItem(visibleItems[0].id);
  }
}

function scheduleFilterApply() {
  clearTimeout(filterApplyTimer);
  filterApplyTimer = setTimeout(() => {
    void applyCurrentFilters({ preserveSelection: true });
  }, 120);
}

function syncFiltersFromInputs() {
  state.filters = {
    text: filterTextEl.value.trim(),
    productNo: filterProductNoEl.value.trim(),
    result: filterResultEl.value.trim(),
    thresholdMin: filterThresholdMinEl.value.trim(),
    thresholdMax: filterThresholdMaxEl.value.trim()
  };
}

function getVisibleItems() {
  const filters = state.filters;
  const text = normalizeLookup(String(filters.text || ""));
  const productNo = String(filters.productNo || "").trim();
  const result = String(filters.result || "").trim();
  const thresholdMin = parseNumber(filters.thresholdMin);
  const thresholdMax = parseNumber(filters.thresholdMax);

  return state.items.filter((item) => {
    const resultValue = String(item.aiResult ?? item.result ?? item.inspectionResult ?? "");
    const searchable = normalizeLookup(
      [item.baseName, item.productNo, item.capturedAt, resultValue, item.lotNo, item.cameraId]
        .filter(Boolean)
        .join(" ")
    );

    if (text && !searchable.includes(text)) {
      return false;
    }
    if (productNo && !String(item.productNo || "").includes(productNo)) {
      return false;
    }
    if (result && normalizeLookup(resultValue) !== normalizeLookup(result)) {
      return false;
    }
    if (thresholdMin !== null && Number(item.threshold) < thresholdMin) {
      return false;
    }
    if (thresholdMax !== null && Number(item.threshold) > thresholdMax) {
      return false;
    }
    return true;
  });
}

function renderFilterInfo(totalCount, visibleCount) {
  const applied = Object.values(state.filters).some((value) => String(value || "").trim().length > 0);
  const text = applied
    ? `필터 적용됨 · ${visibleCount}/${totalCount} files`
    : `필터 없음 · ${totalCount} files`;
  filterInfoEl.textContent = text;
}

function renderMetadataPanelsLoading(message) {
  metadataListEl.innerHTML = renderEmptyState(message);
  tagsListEl.innerHTML = renderEmptyState(message);
}

function renderEmptyPanels(message) {
  metadataListEl.innerHTML = renderEmptyState(message);
  tagsListEl.innerHTML = renderEmptyState(message);
}

function renderKeyValueRows(rows) {
  if (!rows.length) {
    return renderEmptyState("데이터가 없습니다.");
  }

  return rows
    .map(([key, value]) => {
      return `
        <div class="kv-row">
          <div class="kv-key">${escapeHtml(key)}</div>
          <div class="kv-value">${escapeHtml(formatValue(value))}</div>
        </div>
      `;
    })
    .join("");
}

function renderEmptyState(message) {
  const loading = /불러오는 중|loading/i.test(message);
  return `<div class="empty-state ${loading ? "loading" : ""}">${escapeHtml(message)}</div>`;
}

function normalizeLookup(value) {
  return String(value).replace(/[\s_-]+/g, "").toLowerCase();
}

function parseNumber(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function formatMs(value) {
  const rounded = Math.round(Number(value));
  if (rounded < 1000) {
    return `${rounded} ms`;
  }
  return `${(rounded / 1000).toFixed(2)} s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
