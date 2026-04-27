const els = {
  form: document.getElementById("filterForm"),
  bucketSelect: document.getElementById("bucketSelect"),
  productId: document.getElementById("productId"),
  divFilter: document.getElementById("divFilter"),
  resultFilter: document.getElementById("resultFilter"),
  thresholdMin: document.getElementById("thresholdMin"),
  thresholdMax: document.getElementById("thresholdMax"),
  probMin: document.getElementById("probMin"),
  probMax: document.getElementById("probMax"),
  timeFrom: document.getElementById("timeFrom"),
  timeTo: document.getElementById("timeTo"),
  pageSize: document.getElementById("pageSize"),
  searchBtn: document.getElementById("searchBtn"),
  resetBtn: document.getElementById("resetBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  pageLabel: document.getElementById("pageLabel"),
  resultCount: document.getElementById("resultCount"),
  filterSummary: document.getElementById("filterSummary"),
  selectedCount: document.getElementById("selectedCount"),
  statusBar: document.getElementById("statusBar"),
  connectionBanner: document.getElementById("connectionBanner"),
  list: document.getElementById("list"),
  viewerModal: document.getElementById("viewerModal"),
  modalCloseBtn: document.getElementById("modalCloseBtn"),
  modalTitle: document.getElementById("modalTitle"),
  modalSubtitle: document.getElementById("modalSubtitle"),
  modalPreviewSpinner: document.getElementById("modalPreviewSpinner"),
  modalPreview: document.getElementById("modalPreview"),
  modalPreviewMessage: document.getElementById("modalPreviewMessage"),
  modalMetadataInfo: document.getElementById("modalMetadataInfo")
};

document.querySelectorAll(".detail-panel").forEach((element) => element.remove());

const state = {
  bucket: "all",
  buckets: ["all"],
  filters: readFilters(),
  page: 1,
  pageSize: Number(els.pageSize.value || 20),
  total: 0,
  items: [],
  selectedId: null,
  selectedIds: new Set(),
  listStatus: "idle",
  listError: null,
  searchToken: 0,
  detailToken: 0,
  downloadStatus: "idle",
  modalOpen: false,
  modalStatus: "idle",
  modalMetadataStatus: "idle",
  modalPreviewPhase: "idle",
  modalRequestToken: 0,
  modalRecord: null,
  modalThumbnailUrl: null,
  modalOriginalUrl: null,
  modalPreviewUrl: null,
  modalError: null,
  backendConnectionState: "connected",
  backendConnectionMessage: "",
  backendHealthTimer: null,
  pendingRefreshAfterReconnect: false,
  reconnectAttemptCount: 0,
  reconnectIntervalMs: 3000
};

els.modalPreview?.addEventListener("load", () => {
  if (!state.modalOpen) {
    return;
  }
  if (state.modalPreviewPhase === "thumbnail-loading") {
    state.modalPreviewPhase = "thumbnail-ready";
  } else if (state.modalPreviewPhase === "original-loading") {
    state.modalPreviewPhase = "original-ready";
  }
  state.modalStatus = state.modalMetadataStatus === "error" ? "error" : "ready";
  renderAll();
});

els.modalPreview?.addEventListener("error", () => {
  if (!state.modalOpen) {
    return;
  }
  if (state.modalPreviewPhase === "thumbnail-loading" && state.modalOriginalUrl) {
    state.modalPreviewPhase = "original-loading";
    state.modalPreviewUrl = state.modalOriginalUrl;
    renderAll();
    return;
  }
  state.modalPreviewPhase = "error";
  state.modalStatus = state.modalMetadataStatus === "error" ? "error" : "loading";
  state.modalError = state.modalError || "이미지를 불러오지 못했습니다.";
  renderAll();
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.page = 1;
  state.filters = readFilters();
  state.bucket = els.bucketSelect.value || "all";
  state.pageSize = Number(els.pageSize.value || 20);
  void runSearch({ resetSelection: true });
});

els.resetBtn.addEventListener("click", () => {
  els.form.reset();
  els.pageSize.value = "20";
  els.bucketSelect.value = "all";
  state.bucket = "all";
  state.page = 1;
  state.pageSize = 20;
  state.filters = readFilters();
  void runSearch({ resetSelection: true });
});

els.bucketSelect.addEventListener("change", () => {
  state.bucket = els.bucketSelect.value || "all";
  state.page = 1;
  void runSearch({ resetSelection: true });
});

els.pageSize.addEventListener("change", () => {
  state.page = 1;
  state.pageSize = Number(els.pageSize.value || 20);
  void runSearch({ resetSelection: true });
});

els.prevBtn.addEventListener("click", () => {
  if (state.page > 1 && state.listStatus !== "loading") {
    state.page -= 1;
    void runSearch({ keepPage: true });
  }
});

els.nextBtn.addEventListener("click", () => {
  if (state.listStatus === "loading") {
    return;
  }
  const maxPage = getMaxPage();
  if (state.page < maxPage) {
    state.page += 1;
    void runSearch({ keepPage: true });
  }
});

els.downloadBtn.addEventListener("click", async () => {
  const selected = state.selectedIds.size > 0 ? Array.from(state.selectedIds) : state.selectedId ? [state.selectedId] : [];
  if (!selected.length || state.downloadStatus === "loading") {
    return;
  }

  state.downloadStatus = "loading";
  renderAll();

  try {
    const result = await window.viewerApi.saveImages(selected);
    if (result?.canceled) {
      state.downloadStatus = "idle";
      renderAll();
      return;
    }

    state.downloadStatus = "idle";
    renderStatusBar(`다운로드 완료: ${result?.saved?.length ?? selected.length}개`, "ok");
    renderAll();
  } catch (error) {
    state.downloadStatus = "idle";
    markBackendDisconnected(error);
    renderStatusBar(error.message, "error");
    renderAll();
  }
});

els.list.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  if (target.closest("input[type='checkbox']")) {
    return;
  }

  const viewButton = target.closest("[data-view-image]");
  if (viewButton) {
    const imageId = viewButton.getAttribute("data-view-image");
    if (imageId) {
      void openModal(imageId);
    }
    return;
  }

  const row = target.closest("[data-image-id]");
  if (!row || state.listStatus === "loading") {
    return;
  }
  const imageId = row.getAttribute("data-image-id");
  if (imageId) {
    void selectItem(imageId);
  }
});

els.list.addEventListener("change", (event) => {
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (!target || target.type !== "checkbox" || state.listStatus === "loading") {
    return;
  }
  const imageId = target.dataset.imageId;
  if (imageId) {
    toggleSelection(imageId, target.checked);
  }
});

els.modalCloseBtn.addEventListener("click", () => closeModal());
els.viewerModal.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.dataset.closeModal === "true") {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modalOpen) {
    closeModal();
  }
});

void initialize();

async function initialize() {
  startBackendHealthMonitor();
  await loadBuckets();
  await runSearch({ resetSelection: true });
}

function startBackendHealthMonitor() {
  if (state.backendHealthTimer) {
    return;
  }
  state.backendHealthTimer = window.setInterval(() => {
    void checkBackendHealth();
  }, state.reconnectIntervalMs);
  void checkBackendHealth();
}

function setBackendConnectionState(nextState, message = "") {
  if (state.backendConnectionState === nextState && state.backendConnectionMessage === message) {
    return;
  }
  state.backendConnectionState = nextState;
  state.backendConnectionMessage = message;
  renderAll();
}

function isBackendConnectionError(error) {
  const message = String(error?.message ?? error ?? "");
  return /fetch failed|failed to fetch|network error|ECONNREFUSED|ECONNRESET|ENOTFOUND|timeout/i.test(message);
}

async function checkBackendHealth() {
  try {
    await window.viewerApi.health();
    if (state.backendConnectionState !== "connected") {
      state.reconnectAttemptCount = 0;
      setBackendConnectionState("connected", "");
      if (state.pendingRefreshAfterReconnect) {
        state.pendingRefreshAfterReconnect = false;
        await loadBuckets();
        await runSearch({ keepPage: true, resetSelection: true });
      }
    }
    return true;
  } catch (error) {
    const message = error?.message || String(error || "백엔드 연결을 확인하지 못했습니다.");
    state.reconnectAttemptCount += 1;
    setBackendConnectionState("reconnecting", message);
    return false;
  }
}

function markBackendDisconnected(error) {
  const message = error?.message || String(error || "백엔드 연결이 끊겼습니다.");
  if (isBackendConnectionError(error)) {
    state.pendingRefreshAfterReconnect = true;
    state.reconnectAttemptCount = Math.max(1, state.reconnectAttemptCount + 1);
    setBackendConnectionState("reconnecting", message);
  }
}

async function loadBuckets() {
  try {
    const response = await window.viewerApi.listBuckets();
    const buckets = Array.isArray(response)
      ? response
      : Array.isArray(response?.buckets)
        ? response.buckets
        : [];
    state.buckets = ["all", ...new Set(buckets.filter(Boolean))];
    const current = els.bucketSelect.value || state.bucket || "all";
    els.bucketSelect.innerHTML = state.buckets
      .map((bucket) => `<option value="${escapeHtml(bucket)}">${escapeHtml(bucket === "all" ? "All buckets" : bucket)}</option>`)
      .join("");
    els.bucketSelect.value = state.buckets.includes(current) ? current : "all";
    state.bucket = els.bucketSelect.value;
  } catch (error) {
    markBackendDisconnected(error);
    state.buckets = ["all"];
    els.bucketSelect.innerHTML = `<option value="all">All buckets</option>`;
    renderStatusBar(`버킷 목록을 불러오지 못했습니다: ${error.message}`, "error");
  }
}

async function runSearch({ keepPage = false, resetSelection = false } = {}) {
  state.filters = readFilters();
  state.bucket = els.bucketSelect.value || "all";
  state.pageSize = Number(els.pageSize.value || state.pageSize || 20);
  const searchToken = ++state.searchToken;
  const previousSelectedId = keepPage ? state.selectedId : null;

  if (resetSelection) {
    state.selectedIds = new Set();
  }

  state.listStatus = "loading";
  state.listError = null;
  state.items = [];
  state.selectedId = null;
  renderAll();

  try {
    const response = await window.viewerApi.listImages(buildQuery());
    if (searchToken !== state.searchToken) {
      return;
    }

    state.total = Number(response?.total ?? 0);
    state.page = Number(response?.page ?? state.page);
    state.pageSize = Number(response?.pageSize ?? state.pageSize);
    state.items = Array.isArray(response?.items) ? response.items : [];
    state.listStatus = state.items.length ? "ready" : "empty";

  const selected =
      (previousSelectedId && state.items.find((item) => getItemId(item) === previousSelectedId)) ||
      state.items[0] ||
      null;

    if (!selected) {
      state.selectedId = null;
      renderAll();
      return;
    }

    state.selectedId = getItemId(selected);
    renderAll();
  } catch (error) {
    if (searchToken !== state.searchToken) {
      return;
    }
    if (isBackendConnectionError(error)) {
      state.listStatus = "loading";
      state.listError = null;
      state.items = [];
      state.selectedId = null;
      state.pendingRefreshAfterReconnect = true;
      markBackendDisconnected(error);
      renderAll();
      return;
    }
    state.listStatus = "error";
    state.listError = error.message;
    state.items = [];
    state.selectedId = null;
    renderAll();
  }
}

async function selectItem(imageId) {
  if (!state.items.some((item) => getItemId(item) === imageId)) {
    return;
  }
  state.selectedId = imageId;
  renderAll();
}

function toggleSelection(imageId, checked) {
  const next = new Set(state.selectedIds);
  if (checked) {
    next.add(imageId);
  } else {
    next.delete(imageId);
  }
  state.selectedIds = next;
  renderAll();
}

async function openModal(imageId) {
  const item = state.items.find((entry) => getItemId(entry) === imageId) || null;
  const requestToken = state.modalRequestToken + 1;
  state.modalRequestToken = requestToken;
  state.modalOpen = true;
  state.modalStatus = "loading";
  state.modalMetadataStatus = "loading";
  state.modalPreviewPhase = "thumbnail-loading";
  state.modalRecord = item;
  state.modalThumbnailUrl = null;
  state.modalOriginalUrl = null;
  state.modalPreviewUrl = null;
  state.modalError = null;
  renderAll();

  void window.viewerApi
    .getMetadata(imageId)
    .then((metadata) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      state.modalRecord = metadata;
      state.modalMetadataStatus = "ready";
      state.modalStatus = state.modalPreviewPhase === "error" ? "error" : "loading";
      renderAll();
    })
    .catch((error) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      markBackendDisconnected(error);
      state.modalMetadataStatus = "error";
      state.modalError = error.message || String(error || "메타데이터를 불러오지 못했습니다.");
      state.modalStatus = state.modalPreviewPhase === "error" ? "error" : "loading";
      renderAll();
    });

  void window.viewerApi
    .getThumbnailUrl(imageId)
    .then((previewUrl) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      state.modalThumbnailUrl = previewUrl;
      state.modalPreviewUrl = previewUrl;
      state.modalPreviewPhase = "thumbnail-loading";
      state.modalStatus = state.modalMetadataStatus === "error" ? "error" : "loading";
      renderAll();
    })
    .catch((error) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      markBackendDisconnected(error);
      state.modalPreviewPhase = "error";
      state.modalError = state.modalError || error.message || String(error || "이미지를 불러오지 못했습니다.");
      state.modalStatus = state.modalMetadataStatus === "error" ? "error" : "loading";
      renderAll();
    });

  void window.viewerApi
    .getImageUrl(imageId)
    .then(async (imageUrl) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      state.modalOriginalUrl = imageUrl;
      await prefetchImage(imageUrl);
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      state.modalPreviewPhase = "original-loading";
      state.modalPreviewUrl = imageUrl;
      renderAll();
    })
    .catch((error) => {
      if (!state.modalOpen || state.modalRequestToken !== requestToken) {
        return;
      }
      markBackendDisconnected(error);
      state.modalError = state.modalError || error.message || String(error || "원본 이미지를 불러오지 못했습니다.");
      renderAll();
      });
}

function closeModal() {
  state.modalRequestToken += 1;
  state.modalOpen = false;
  state.modalStatus = "idle";
  state.modalMetadataStatus = "idle";
  state.modalPreviewPhase = "idle";
  state.modalRecord = null;
  state.modalThumbnailUrl = null;
  state.modalOriginalUrl = null;
  state.modalPreviewUrl = null;
  state.modalError = null;
  renderAll();
}

function buildQuery() {
  return {
    bucket: state.bucket === "all" ? "" : state.bucket,
    productNo: state.filters.productId,
    processCode: state.filters.div,
    result: state.filters.result,
    thresholdMin: state.filters.thresholdMin,
    thresholdMax: state.filters.thresholdMax,
    probMin: state.filters.probMin,
    probMax: state.filters.probMax,
    timeFrom: state.filters.timeFrom,
    timeTo: state.filters.timeTo,
    page: state.page,
    pageSize: state.pageSize
  };
}

function readFilters() {
  return {
    productId: els.productId.value.trim(),
    div: els.divFilter.value.trim(),
    result: els.resultFilter.value.trim(),
    thresholdMin: els.thresholdMin.value.trim(),
    thresholdMax: els.thresholdMax.value.trim(),
    probMin: els.probMin.value.trim(),
    probMax: els.probMax.value.trim(),
    timeFrom: els.timeFrom.value.trim(),
    timeTo: els.timeTo.value.trim()
  };
}

function renderAll() {
  renderStatusBar();
  renderConnectionBanner();
  renderList();
  renderPager();
  renderFilterSummary();
  renderSelectionSummary();
  renderDownloadButton();
  renderModal();
}

function renderConnectionBanner() {
  if (!els.connectionBanner) {
    return;
  }

  if (state.backendConnectionState === "connected") {
    els.connectionBanner.classList.add("is-hidden");
    els.connectionBanner.textContent = "";
    return;
  }

  els.connectionBanner.classList.remove("is-hidden");
  const isReconnecting = state.backendConnectionState === "reconnecting";
  const attemptText = state.reconnectAttemptCount > 0 ? ` 재시도 ${state.reconnectAttemptCount}회째입니다.` : "";
  const retryText = ` ${Math.round(state.reconnectIntervalMs / 1000)}초마다 자동으로 다시 연결을 시도합니다.`;
  const prefix = isReconnecting ? "백엔드와 연결이 끊겨 재연결을 시도 중입니다." : "백엔드 연결이 끊겼습니다.";
  els.connectionBanner.textContent = state.backendConnectionMessage
    ? `${prefix}${retryText}${attemptText} (${state.backendConnectionMessage})`
    : `${prefix}${retryText}${attemptText}`;
}

function renderStatusBar(message = null, tone = null) {
  const status =
    message !== null && message !== undefined
      ? {
          tone: tone || "ok",
          label: message,
          detail: ""
        }
      : getStatusMessage();
  els.statusBar.innerHTML = `
    <span class="status-pill" data-tone="${escapeHtml(status.tone)}">${escapeHtml(status.label)}</span>
    <span>${escapeHtml(status.detail)}</span>
  `;
}

function getStatusMessage() {
  if (state.backendConnectionState !== "connected") {
    return {
      tone: "loading",
      label: "재연결 시도 중",
      detail:
        state.backendConnectionMessage ||
        `${Math.round(state.reconnectIntervalMs / 1000)}초마다 백엔드 재연결을 자동으로 다시 시도합니다.`
    };
  }
  if (state.listStatus === "loading") {
    return {
      tone: "loading",
      label: "검색 중",
      detail: `page ${state.page}, ${state.pageSize} rows를 backend에서 불러오는 중입니다.`
    };
  }
  if (state.listStatus === "error") {
    return {
      tone: "error",
      label: "검색 실패",
      detail: state.listError || "검색 요청이 실패했습니다."
    };
  }
  if (state.listStatus === "empty") {
    return {
      tone: "ok",
      label: "0 results",
      detail: "현재 필터에 맞는 항목이 없습니다."
    };
  }
  return {
    tone: "ok",
    label: `${state.total.toLocaleString()} results`,
    detail: `page ${state.page} / ${getMaxPage()} · selected ${state.selectedId ?? "none"}`
  };
}

function renderFilterSummary() {
  const parts = [];
  if (state.bucket && state.bucket !== "all") parts.push(`bucket=${state.bucket}`);
  if (state.filters.productId) parts.push(`product_id=${state.filters.productId}`);
  if (state.filters.div) parts.push(`div=${state.filters.div}`);
  if (state.filters.result) parts.push(`result=${normalizeResultValue(state.filters.result)}`);
  if (state.filters.thresholdMin || state.filters.thresholdMax) {
    parts.push(`threshold=${state.filters.thresholdMin || "min"}..${state.filters.thresholdMax || "max"}`);
  }
  if (state.filters.probMin || state.filters.probMax) {
    parts.push(`prob=${state.filters.probMin || "min"}..${state.filters.probMax || "max"}`);
  }
  if (state.filters.timeFrom || state.filters.timeTo) {
    parts.push(`time=${state.filters.timeFrom || "start"}..${state.filters.timeTo || "end"}`);
  }
  els.filterSummary.textContent = parts.length ? parts.join(" · ") : "No filters";
  els.resultCount.textContent = state.listStatus === "loading" ? "Loading..." : `${state.total.toLocaleString()} items`;
}

function renderSelectionSummary() {
  els.selectedCount.textContent = `${state.selectedIds.size.toLocaleString()} selected`;
}

function renderDownloadButton() {
  const totalSelected = state.selectedIds.size > 0 ? state.selectedIds.size : state.selectedId ? 1 : 0;
  els.downloadBtn.disabled = totalSelected === 0 || state.downloadStatus === "loading";
  els.downloadBtn.textContent =
    state.downloadStatus === "loading"
      ? "다운로드 중..."
      : totalSelected > 1
        ? `다운로드 (${totalSelected})`
        : "다운로드";
}

function renderPager() {
  const maxPage = getMaxPage();
  els.pageLabel.textContent = `${state.page} / ${maxPage}`;
  els.prevBtn.disabled = state.listStatus === "loading" || state.page <= 1;
  els.nextBtn.disabled = state.listStatus === "loading" || state.page >= maxPage;
}

function renderList() {
  if (state.listStatus === "loading") {
    els.list.innerHTML = `
      ${Array.from({ length: 6 }, () => `
        <div class="item skeleton-item">
          <div class="item-check"></div>
          <div class="item-body">
            <div class="skeleton skeleton-line"></div>
            <div class="skeleton skeleton-line short"></div>
            <div class="skeleton skeleton-line short"></div>
          </div>
        </div>
      `).join("")}
    `;
    return;
  }

  if (state.listStatus === "error") {
    els.list.innerHTML = `<div class="list-empty list-error">${escapeHtml(state.listError || "검색에 실패했습니다.")}</div>`;
    return;
  }

  if (!state.items.length) {
    els.list.innerHTML = `<div class="list-empty">필터에 맞는 결과가 없습니다.</div>`;
    return;
  }

  els.list.innerHTML = state.items
    .map((item) => {
      const metadata = getCanonicalMetadata(item);
      const tone = getResultTone(metadata.result);
      const productId = formatMissingValue(metadata.product_id);
      const div = formatMissingValue(metadata.div);
      const time = formatTimeValue(metadata.time);
      const result = formatResultValue(metadata.result);
      const threshold = formatNumberValue(metadata.threshold);
      const prob = formatNumberValue(metadata.prob);
      const rawTitle = String(metadata.product_id || item.fileName || item.baseName || getItemId(item)).trim();
      const itemId = getItemId(item);
      const checked = state.selectedIds.has(itemId) ? "checked" : "";
      const rowTitle = formatMissingValue(rawTitle || itemId);
      return `
        <div class="item ${state.selectedId === itemId ? "active" : ""}" data-image-id="${escapeHtml(itemId)}">
          <label class="item-check">
            <input type="checkbox" data-image-id="${escapeHtml(itemId)}" ${checked} aria-label="${escapeHtml(itemId)} 선택">
          </label>
          <div class="item-body">
            <div class="item-title">${escapeHtml(rowTitle)}</div>
            <div class="item-id">${escapeHtml(itemId)}</div>
          </div>
          <div class="item-cell is-muted">${escapeHtml(productId)}</div>
          <div class="item-cell is-muted">${escapeHtml(div)}</div>
          <div class="item-cell is-muted">${escapeHtml(time)}</div>
          <div class="item-cell is-result${tone === "muted" ? " is-empty" : ""}" data-tone="${tone}">${escapeHtml(result)}</div>
          <div class="item-cell is-muted">${escapeHtml(threshold)}</div>
          <div class="item-cell is-muted">${escapeHtml(prob)}</div>
          <div class="item-action">
            <button type="button" class="view-btn" data-view-image="${escapeHtml(itemId)}">이미지 보기</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderModal() {
  if (!els.viewerModal) {
    return;
  }
  if (!state.modalOpen) {
    els.viewerModal.classList.add("is-hidden");
    els.viewerModal.setAttribute("aria-hidden", "true");
    return;
  }

  els.viewerModal.classList.remove("is-hidden");
  els.viewerModal.setAttribute("aria-hidden", "false");

  const record = state.modalRecord || null;
  const metadata = record ? getCanonicalMetadata(record) : {};
  els.modalTitle.textContent = record
    ? formatMissingValue(metadata.product_id || record.fileName || record.imageId || "이미지 보기")
    : "이미지 보기";
  els.modalSubtitle.textContent = record
    ? joinParts([record.imageId || "", metadata.div, formatTimeValue(metadata.time)])
    : "이미지와 메타데이터를 함께 확인합니다.";

  if (state.modalPreviewPhase === "thumbnail-loading") {
    els.modalPreviewSpinner.classList.remove("is-hidden");
    els.modalPreviewMessage.classList.add("is-hidden");
    if (state.modalPreviewUrl) {
      els.modalPreview.src = state.modalPreviewUrl;
    } else {
      els.modalPreview.removeAttribute("src");
    }
    els.modalPreview.style.display = "none";
  } else {
    els.modalPreviewSpinner.classList.add("is-hidden");
    els.modalPreview.style.display = "";
  }

  if (state.modalStatus === "error" && !state.modalRecord && !state.modalPreviewUrl) {
    els.modalPreview.removeAttribute("src");
    els.modalPreview.style.display = "none";
    els.modalPreviewSpinner.classList.add("is-hidden");
    els.modalPreviewMessage.textContent = state.modalError || "이미지를 불러오지 못했습니다.";
    els.modalPreviewMessage.classList.remove("is-hidden");
    els.modalMetadataInfo.innerHTML = `<div class="meta-error">${escapeHtml(state.modalError || "메타데이터를 불러오지 못했습니다.")}</div>`;
    return;
  }

  if ((state.modalPreviewPhase === "thumbnail-ready" || state.modalPreviewPhase === "original-ready") && state.modalPreviewUrl) {
    els.modalPreview.src = state.modalPreviewUrl;
    els.modalPreview.style.display = "";
    els.modalPreviewMessage.classList.add("is-hidden");
  } else if (state.modalPreviewPhase === "error") {
    els.modalPreview.removeAttribute("src");
    els.modalPreview.style.display = "none";
    els.modalPreviewMessage.textContent = state.modalError || "이미지를 불러오지 못했습니다.";
    els.modalPreviewMessage.classList.remove("is-hidden");
  } else if (!state.modalPreviewUrl) {
    els.modalPreview.removeAttribute("src");
    els.modalPreview.style.display = "none";
    els.modalPreviewMessage.textContent = "";
    els.modalPreviewMessage.classList.add("is-hidden");
  }

  if (state.modalRecord) {
    els.modalMetadataInfo.innerHTML = renderMetadata(state.modalRecord);
  } else if (state.modalMetadataStatus === "error") {
    els.modalMetadataInfo.innerHTML = `<div class="meta-error">${escapeHtml(state.modalError || "메타데이터를 불러오지 못했습니다.")}</div>`;
  } else if (state.modalMetadataStatus === "loading") {
    els.modalMetadataInfo.innerHTML = `<div class="meta-loading">메타데이터를 불러오는 중입니다.</div>`;
  } else {
    els.modalMetadataInfo.innerHTML = `<div class="meta-empty">메타데이터가 없습니다.</div>`;
  }
}

function prefetchImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`이미지 프리로드 실패: ${url}`));
    image.src = url;
  });
}

function renderKeyValues(entries, { emptyText } = {}) {
  const rows = entries.map(
    ([key, value]) => `
      <div class="kv-row">
        <div class="kv-key">${escapeHtml(key)}</div>
        <div class="kv-value">${escapeHtml(formatValue(value))}</div>
      </div>
    `
  );

  if (!rows.length) {
    return `<div class="meta-empty">${escapeHtml(emptyText || "항목이 없습니다.")}</div>`;
  }

  return rows.join("");
}

function renderMetadata(record) {
  const metadata = getCanonicalMetadata(record);
  const metadataSource = record?.metadata || record?.meta || record || {};
  const orderedFields = [
    ["image_id", record.imageId],
    ["bucket", record.bucket],
    ["product_id", metadata.product_id],
    ["div", metadata.div],
    ["time", formatTimeValue(metadata.time)],
    ["result", formatResultValue(metadata.result)],
    ["threshold", formatNumberValue(metadata.threshold)],
    ["prob", formatNumberValue(metadata.prob)]
  ];
  const extraFields = Object.entries(metadataSource)
    .filter(([key]) => !new Set(["product_id", "productId", "productNo", "div", "time", "capturedAt", "captured_at", "result", "aiResult", "threshold", "prob", "score", "confidence"]).has(key))
    .map(([key, value]) => [`metadata.${key}`, value]);
  return renderKeyValues([...orderedFields, ...extraFields], {
    emptyText: "메타데이터가 없습니다."
  });
}

function getSelectedItem() {
  return state.items.find((item) => getItemId(item) === state.selectedId) || null;
}

function buildDownloadName(item) {
  const base = item?.fileName || item?.baseName || getItemId(item) || state.selectedId || "image";
  const ext = item?.fileExt ? `.${item.fileExt}` : ".png";
  return `${base}${ext}`;
}

function getItemId(item) {
  return item?.imageId || item?.id || "";
}

function getMaxPage() {
  return Math.max(1, Math.ceil((state.total || 0) / Math.max(1, state.pageSize)));
}

function getResultTone(value) {
  const normalized = normalizeResultValue(value);
  if (normalized === "OK") return "ok";
  if (normalized === "NG") return "warn";
  return "muted";
}

function formatDateTime(value) {
  if (!value) {
    return EMPTY_VALUE_LABEL;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  return number.toFixed(2).replace(/\.00$/, "");
}

function formatValue(value) {
  if (value === null || value === undefined) {
    return EMPTY_VALUE_LABEL;
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = String(value).trim();
  return text || EMPTY_VALUE_LABEL;
}

function formatTimeValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return EMPTY_VALUE_LABEL;
  }
  return formatDateTime(value);
}

function formatNumberValue(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return EMPTY_VALUE_LABEL;
  }
  return formatNumber(value);
}

function formatResultValue(value) {
  const normalized = normalizeResultValue(value);
  return normalized || EMPTY_VALUE_LABEL;
}

function normalizeResultValue(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) {
    return "";
  }
  if (["OK", "PASS"].includes(normalized)) {
    return "OK";
  }
  if (["NG", "FAIL", "REVIEW"].includes(normalized)) {
    return "NG";
  }
  return normalized;
}

function getCanonicalMetadata(record) {
  const source = record?.metadata || record?.meta || record || {};
  return {
    product_id: pickFirstDefined(source, ["product_id", "productId", "productNo"]),
    div: pickFirstDefined(source, ["div", "division", "group"]),
    time: pickFirstDefined(source, ["time", "capturedAt", "captured_at", "shotAt"]),
    result: pickFirstDefined(source, ["result", "aiResult", "inspectionResult"]),
    threshold: pickFirstDefined(source, ["threshold", "inspectionThreshold"]),
    prob: pickFirstDefined(source, ["prob", "confidence", "score"])
  };
}

function pickFirstDefined(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

const EMPTY_VALUE_LABEL = "미등록";

function joinParts(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean).join(" · ");
}

function formatMissingValue(value) {
  const text = String(value ?? "").trim();
  return text ? text : EMPTY_VALUE_LABEL;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
