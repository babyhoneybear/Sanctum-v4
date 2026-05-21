(() => {
  const DEFAULT_GRID_WIDTH = 4800;
  const DEFAULT_GRID_HEIGHT = 3200;
  const GRID_PADDING = 720;
  const DEFAULT_TOP_OFFSET = 720;
  const MIN_SCALE = 0.45;
  const MAX_SCALE = 1.85;
  const SCALE_STEP = 0.12;
  const SAVE_DELAY = 160;

  let panState = null;
  let saveTimer = null;
  let spacePanEnabled = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeZoom(value = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return clamp(numeric, MIN_SCALE, MAX_SCALE);
  }

  function normalizeOffset(value = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, numeric);
  }

  function getCurrentPageIdSafe() {
    return typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "";
  }

  function getAllPageRecords() {
    return [
      ...(Array.isArray(window.userDomains) ? window.userDomains : []),
      ...(Array.isArray(window.userPages) ? window.userPages : [])
    ];
  }

  function getPageRecord(pageId = "") {
    const safePageId = String(pageId || "").trim();
    if (!safePageId) return null;
    return getAllPageRecords().find((entry) => entry?.id === safePageId) || null;
  }

  function isInfiniteCanvasPage(pageId = getCurrentPageIdSafe()) {
    return getPageRecord(pageId)?.layout === "infinite-canvas";
  }

  function getElements() {
    return {
      pageCanvas: document.getElementById("pageCanvas"),
      boardSurface: document.getElementById("pageBoardSurface"),
      toolbar: document.getElementById("infiniteCanvasToolbar"),
      viewport: document.getElementById("infiniteCanvasViewport"),
      stage: document.getElementById("infiniteCanvasStage"),
      grid: document.getElementById("grid"),
      zoomLabel: document.getElementById("infiniteCanvasZoomLabel")
    };
  }

  function getFallbackSettings() {
    if (typeof window.normalizePageSettings === "function") {
      return window.normalizePageSettings({});
    }

    return {
      canvasZoom: 1,
      canvasScrollLeft: 0,
      canvasScrollTop: 0,
      canvasHasView: false
    };
  }

  function getPageCanvasSettings(pageId = getCurrentPageIdSafe()) {
    if (!pageId || typeof getPageSettings !== "function") {
      return getFallbackSettings();
    }
    return getPageSettings(pageId);
  }

  function savePageCanvasSettings(pageId, patch = {}, options = {}) {
    if (!pageId || typeof getPageSettings !== "function" || typeof savePageSettings !== "function") {
      return false;
    }

    const next = {
      ...getPageSettings(pageId),
      ...patch
    };

    return savePageSettings(pageId, next, options);
  }

  function getCanvasBlockBounds(grid) {
    let maxRight = 0;
    let maxBottom = 0;

    grid.querySelectorAll(".block").forEach((block) => {
      if (block.classList.contains("ghost")) return;
      const left = parseInt(block.style.left || "0", 10) || 0;
      const top = parseInt(block.style.top || "0", 10) || 0;
      const width = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10) || 0;
      const height = parseInt(block.style.height || block.getBoundingClientRect().height || "0", 10) || 0;
      maxRight = Math.max(maxRight, left + width);
      maxBottom = Math.max(maxBottom, top + height);
    });

    return {
      maxRight,
      maxBottom
    };
  }

  function getLogicalSize(grid) {
    const bounds = getCanvasBlockBounds(grid);
    return {
      width: Math.max(DEFAULT_GRID_WIDTH, bounds.maxRight + GRID_PADDING),
      height: Math.max(DEFAULT_GRID_HEIGHT, bounds.maxBottom + GRID_PADDING)
    };
  }

  function setPanModeClass() {
    const { viewport } = getElements();
    if (!viewport) return;
    viewport.classList.toggle("is-pan-mode", spacePanEnabled);
  }

  function setCanvasVariables(scale, logicalWidth, logicalHeight) {
    const { pageCanvas, boardSurface, grid } = getElements();
    if (!pageCanvas || !boardSurface || !grid) return;

    pageCanvas.classList.add("is-infinite-canvas");
    boardSurface.classList.add("is-infinite-canvas");

    pageCanvas.style.setProperty("--infinite-canvas-scale", String(scale));
    pageCanvas.style.setProperty("--infinite-grid-width", `${Math.round(logicalWidth)}px`);
    pageCanvas.style.setProperty("--infinite-grid-height", `${Math.round(logicalHeight)}px`);
    pageCanvas.style.setProperty("--infinite-stage-width", `${Math.round(logicalWidth * scale)}px`);
    pageCanvas.style.setProperty("--infinite-stage-height", `${Math.round(logicalHeight * scale)}px`);

    grid.dataset.canvasScale = String(scale);
    grid.dataset.canvasWidth = String(Math.round(logicalWidth));
    grid.dataset.canvasHeight = String(Math.round(logicalHeight));
  }

  function clearCanvasVariables() {
    const { pageCanvas, boardSurface, viewport, grid } = getElements();
    if (!pageCanvas || !boardSurface || !viewport || !grid) return;

    pageCanvas.classList.remove("is-infinite-canvas");
    boardSurface.classList.remove("is-infinite-canvas");
    viewport.classList.remove("is-panning", "is-pan-mode");

    pageCanvas.style.removeProperty("--infinite-canvas-scale");
    pageCanvas.style.removeProperty("--infinite-grid-width");
    pageCanvas.style.removeProperty("--infinite-grid-height");
    pageCanvas.style.removeProperty("--infinite-stage-width");
    pageCanvas.style.removeProperty("--infinite-stage-height");

    delete grid.dataset.canvasScale;
    delete grid.dataset.canvasWidth;
    delete grid.dataset.canvasHeight;
  }

  function getMetrics(pageId = getCurrentPageIdSafe()) {
    const els = getElements();
    if (!els.viewport || !els.stage || !els.grid) return null;

    const settings = getPageCanvasSettings(pageId);
    const scale = normalizeZoom(els.grid.dataset.canvasScale || settings.canvasZoom || 1);
    const logicalWidth = Math.max(DEFAULT_GRID_WIDTH, parseInt(els.grid.dataset.canvasWidth || `${DEFAULT_GRID_WIDTH}`, 10) || DEFAULT_GRID_WIDTH);
    const logicalHeight = Math.max(DEFAULT_GRID_HEIGHT, parseInt(els.grid.dataset.canvasHeight || `${DEFAULT_GRID_HEIGHT}`, 10) || DEFAULT_GRID_HEIGHT);

    return {
      ...els,
      pageId,
      scale,
      logicalWidth,
      logicalHeight,
      stageRect: els.stage.getBoundingClientRect(),
      viewportRect: els.viewport.getBoundingClientRect(),
      isInfinite: isInfiniteCanvasPage(pageId)
    };
  }

  function updateToolbar(metrics) {
    if (!metrics?.toolbar || !metrics.zoomLabel) return;
    metrics.toolbar.hidden = !metrics.isInfinite;
    metrics.zoomLabel.textContent = `${Math.round(metrics.scale * 100)}%`;
  }

  function persistView(pageId = getCurrentPageIdSafe(), options = {}) {
    if (!isInfiniteCanvasPage(pageId)) return false;

    const commit = () => {
      const current = getMetrics(pageId);
      if (!current?.viewport) return false;
      return savePageCanvasSettings(pageId, {
        canvasZoom: current.scale,
        canvasScrollLeft: normalizeOffset(current.viewport.scrollLeft),
        canvasScrollTop: normalizeOffset(current.viewport.scrollTop),
        canvasHasView: true
      }, {
        syncLinkedCards: false
      });
    };

    if (options.immediate) {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      return commit();
    }

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      commit();
    }, SAVE_DELAY);
    return true;
  }

  function centerView(pageId = getCurrentPageIdSafe(), options = {}) {
    const metrics = getMetrics(pageId);
    if (!metrics?.isInfinite) return;

    const maxLeft = Math.max(0, metrics.logicalWidth * metrics.scale - metrics.viewport.clientWidth);
    const maxTop = Math.max(0, metrics.logicalHeight * metrics.scale - metrics.viewport.clientHeight);
    const nextLeft = clamp(
      options.left ?? ((metrics.logicalWidth * metrics.scale - metrics.viewport.clientWidth) / 2),
      0,
      maxLeft
    );
    const nextTop = clamp(
      options.top ?? (DEFAULT_TOP_OFFSET * metrics.scale),
      0,
      maxTop
    );

    metrics.viewport.scrollLeft = nextLeft;
    metrics.viewport.scrollTop = nextTop;

    if (!options.silent) {
      persistView(pageId, { immediate: true });
    }
  }

  function applyLayout(pageId = getCurrentPageIdSafe(), options = {}) {
    const { grid, viewport } = getElements();
    if (!grid || !viewport) return null;

    const settings = getPageCanvasSettings(pageId);
    const logicalSize = getLogicalSize(grid);
    const scale = normalizeZoom(options.scale ?? settings.canvasZoom ?? grid.dataset.canvasScale ?? 1);

    setCanvasVariables(scale, logicalSize.width, logicalSize.height);
    const metrics = getMetrics(pageId);
    updateToolbar(metrics);

    if (options.restoreView) {
      if (settings.canvasHasView) {
        viewport.scrollLeft = normalizeOffset(options.scrollLeft ?? settings.canvasScrollLeft);
        viewport.scrollTop = normalizeOffset(options.scrollTop ?? settings.canvasScrollTop);
      } else {
        centerView(pageId, { silent: true });
      }
    }

    return getMetrics(pageId);
  }

  function zoomTo(pageId = getCurrentPageIdSafe(), nextScale = 1, anchor = null) {
    const metrics = getMetrics(pageId);
    if (!metrics?.isInfinite) return;

    const clampedScale = normalizeZoom(nextScale);
    const viewportOffsetX = anchor ? (anchor.clientX - metrics.viewportRect.left) : (metrics.viewport.clientWidth / 2);
    const viewportOffsetY = anchor ? (anchor.clientY - metrics.viewportRect.top) : (metrics.viewport.clientHeight / 2);
    const logicalAnchorX = anchor
      ? ((anchor.clientX - metrics.stageRect.left) / metrics.scale)
      : ((metrics.viewport.scrollLeft + viewportOffsetX) / metrics.scale);
    const logicalAnchorY = anchor
      ? ((anchor.clientY - metrics.stageRect.top) / metrics.scale)
      : ((metrics.viewport.scrollTop + viewportOffsetY) / metrics.scale);

    applyLayout(pageId, { scale: clampedScale, restoreView: false });

    const next = getMetrics(pageId);
    if (!next?.viewport) return;

    const maxLeft = Math.max(0, next.logicalWidth * clampedScale - next.viewport.clientWidth);
    const maxTop = Math.max(0, next.logicalHeight * clampedScale - next.viewport.clientHeight);

    next.viewport.scrollLeft = clamp(logicalAnchorX * clampedScale - viewportOffsetX, 0, maxLeft);
    next.viewport.scrollTop = clamp(logicalAnchorY * clampedScale - viewportOffsetY, 0, maxTop);

    updateToolbar(next);
    persistView(pageId);
  }

  function fitBoard(pageId = getCurrentPageIdSafe()) {
    const metrics = getMetrics(pageId);
    if (!metrics?.isInfinite) return;

    const nextScale = normalizeZoom(Math.min(
      metrics.viewport.clientWidth / metrics.logicalWidth,
      metrics.viewport.clientHeight / metrics.logicalHeight,
      1
    ));

    applyLayout(pageId, { scale: nextScale, restoreView: false });
    centerView(pageId, { silent: true });
    updateToolbar(getMetrics(pageId));
    persistView(pageId);
  }

  function syncInfiniteCanvasGridBounds(pageId = getCurrentPageIdSafe()) {
    if (!isInfiniteCanvasPage(pageId)) return;

    const previous = getMetrics(pageId);
    const scale = previous?.scale || getPageCanvasSettings(pageId).canvasZoom || 1;
    const scrollLeft = previous?.viewport?.scrollLeft || 0;
    const scrollTop = previous?.viewport?.scrollTop || 0;

    applyLayout(pageId, {
      scale,
      restoreView: false
    });

    const next = getMetrics(pageId);
    if (!next?.viewport) return;

    const maxLeft = Math.max(0, next.logicalWidth * next.scale - next.viewport.clientWidth);
    const maxTop = Math.max(0, next.logicalHeight * next.scale - next.viewport.clientHeight);
    next.viewport.scrollLeft = clamp(scrollLeft, 0, maxLeft);
    next.viewport.scrollTop = clamp(scrollTop, 0, maxTop);
    updateToolbar(next);
  }

  function syncInfiniteCanvasPage(pageId = getCurrentPageIdSafe()) {
    const { toolbar } = getElements();
    const infinite = isInfiniteCanvasPage(pageId);

    if (toolbar) toolbar.hidden = !infinite;

    if (!infinite) {
      clearCanvasVariables();
      return;
    }

    requestAnimationFrame(() => {
      applyLayout(pageId, { restoreView: true });
      setPanModeClass();
    });
  }

  function beginPan(event) {
    const metrics = getMetrics();
    if (!metrics?.isInfinite) return;

    panState = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: metrics.viewport.scrollLeft,
      scrollTop: metrics.viewport.scrollTop
    };

    metrics.viewport.classList.add("is-panning");
    event.preventDefault();
  }

  function endPan() {
    const { viewport } = getElements();
    if (viewport) viewport.classList.remove("is-panning");
    panState = null;
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-infinite-canvas-action]");
    if (!actionButton) return;

    const pageId = getCurrentPageIdSafe();
    if (!isInfiniteCanvasPage(pageId)) return;

    const metrics = getMetrics(pageId);
    if (!metrics?.isInfinite) return;

    const action = actionButton.dataset.infiniteCanvasAction || "";
    if (action === "zoom-in") {
      zoomTo(pageId, metrics.scale + SCALE_STEP);
      return;
    }
    if (action === "zoom-out") {
      zoomTo(pageId, metrics.scale - SCALE_STEP);
      return;
    }
    if (action === "fit") {
      fitBoard(pageId);
      return;
    }
    if (action === "center") {
      centerView(pageId);
      return;
    }
    if (action === "reset") {
      applyLayout(pageId, { scale: 1, restoreView: false });
      centerView(pageId, { silent: true });
      updateToolbar(getMetrics(pageId));
      persistView(pageId, { immediate: true });
    }
  });

  const viewportEl = document.getElementById("infiniteCanvasViewport");
  viewportEl?.addEventListener("wheel", (event) => {
    const pageId = getCurrentPageIdSafe();
    if (!isInfiniteCanvasPage(pageId) || !event.ctrlKey) return;

    event.preventDefault();
    const metrics = getMetrics(pageId);
    if (!metrics?.isInfinite) return;
    const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    zoomTo(pageId, metrics.scale + delta, event);
  }, { passive: false });

  viewportEl?.addEventListener("scroll", () => {
    const pageId = getCurrentPageIdSafe();
    if (!isInfiniteCanvasPage(pageId)) return;
    persistView(pageId);
  });

  viewportEl?.addEventListener("mousedown", (event) => {
    const pageId = getCurrentPageIdSafe();
    if (!isInfiniteCanvasPage(pageId)) return;
    if (event.target.closest(".block, .topbar-dropdown, .page-database-floating-menu, .page-database-property-panel")) return;

    const canPan = event.button === 1 || spacePanEnabled || !document.body.classList.contains("editing");
    if (!canPan) return;
    beginPan(event);
  });

  document.addEventListener("mousemove", (event) => {
    const metrics = getMetrics();
    if (!metrics?.isInfinite || !panState) return;

    metrics.viewport.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    metrics.viewport.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  });

  document.addEventListener("mouseup", () => {
    if (!panState) return;
    endPan();
    persistView(getCurrentPageIdSafe());
  });

  document.addEventListener("keydown", (event) => {
    if (event.code !== "Space" || event.repeat) return;

    const activeEl = document.activeElement;
    const tagName = String(activeEl?.tagName || "").toUpperCase();
    if (activeEl?.closest?.('[contenteditable="true"]') || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) {
      return;
    }

    spacePanEnabled = true;
    document.body.classList.add("infinite-canvas-pan-ready");
    setPanModeClass();
    event.preventDefault();
  });

  document.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    spacePanEnabled = false;
    document.body.classList.remove("infinite-canvas-pan-ready");
    setPanModeClass();
  });

  window.addEventListener("resize", () => {
    const pageId = getCurrentPageIdSafe();
    if (!isInfiniteCanvasPage(pageId)) return;
    requestAnimationFrame(() => {
      const metrics = getMetrics(pageId);
      applyLayout(pageId, {
        scale: metrics?.scale || getPageCanvasSettings(pageId).canvasZoom || 1,
        restoreView: true
      });
    });
  });

  window.isInfiniteCanvasPage = isInfiniteCanvasPage;
  window.getCanvasLayoutMetrics = () => getMetrics();
  window.persistInfiniteCanvasView = persistView;
  window.syncInfiniteCanvasGridBounds = syncInfiniteCanvasGridBounds;
  window.syncInfiniteCanvasPage = syncInfiniteCanvasPage;
})();
