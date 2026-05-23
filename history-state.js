// ===============================
// == LocalStorage Save / Load  ==
// ===============================

// == Undo / Redo ==
const historyStack = [];
let historyIndex = -1;
const MAX_HISTORY = 50;
let isRestoringHistory = false;

function pushHistory() {
  if (isRestoringHistory) return;

  const state = JSON.stringify(serializeBlocks());

  if (historyIndex >= 0 && historyStack[historyIndex] === state) {
    return;
  }

  // cut off any redo states ahead of current position
  historyStack.splice(historyIndex + 1);
  historyStack.push(state);

  if (historyStack.length > MAX_HISTORY) historyStack.shift();

  historyIndex = historyStack.length - 1;
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreHistory();
}

function redo() {
  if (historyIndex >= historyStack.length - 1) return;
  historyIndex++;
  restoreHistory();
}

function restoreHistory() {
  if (historyIndex < 0 || historyIndex >= historyStack.length) return;

  isRestoringHistory = true;
  const blocks = JSON.parse(historyStack[historyIndex]);
  clearGrid();
  const grid = document.getElementById("grid");
  blocks.forEach((data) => {
    const b = buildBlockFromData(data);
    grid.appendChild(b);
  });
  clearSelection();
  expandGrid();
  saveState(false);
  isRestoringHistory = false;
}
const STORAGE_KEY = "sanctum_v3_state";

// Turn the current blocks into plain data we can store
function serializeBlocks() {
  return Array.from(document.querySelectorAll("#grid .block"))
    .filter((b) => !b.classList.contains("ghost"))
    .map((b) => serializeBlockElement(b));
}



function saveState(recordHistory = true) {
  const blocks = serializeBlocks();
  const state = {
    page: document.getElementById("pageTitle")?.textContent || "Home",
    topZIndex: typeof topZIndex !== "undefined" ? topZIndex : 10,
  };

  const pageBlocksSaved = setPageBlocks(currentPageId, blocks);
  const stateSaved = writeStorageJSON(STORAGE_KEY, state);

  if (!pageBlocksSaved) {
    showAppToast?.("Couldn't save that canvas change. The image may be too large for browser storage.", "info");
    return false;
  }

  if (!stateSaved) {
    console.warn("Failed to persist lightweight app state snapshot.");
  }

  if (recordHistory) pushHistory();
  return true;
}

// Create a block element from saved data
function buildBlockFromData(data) {
  const b = document.createElement("div");
  b.className = "block";
  b.dataset.type = data.type || "text";
  b.id = data.id;

  b.style.left = `${data.x}px`;
  b.style.top = `${data.y}px`;
  b.style.width = `${data.w}px`;
  if (typeof data.h === "number" && data.h > 0) {
    b.style.height = `${data.h}px`;
  }

  if (data.z) b.style.zIndex = String(data.z);

    b.innerHTML = makeBlockHTML(data.type || "text");

  const titleEl = b.querySelector(".block-title");
  const bodyEl = b.querySelector(".block-body");
  if (titleEl) titleEl.innerHTML = data.titleHTML ?? data.title ?? "";
  if (bodyEl) bodyEl.innerHTML = data.bodyHTML ?? data.body ?? "";

  if (data.containerTitle) {
    const ct = b.querySelector(".container-title");
    if (ct) ct.innerHTML = data.containerTitle;
  }
  if (data.type === "container") {
    hydrateContainerBlockFromData(b, data);
  }
  if (data.tableHTML && data.type === "table") {
    const wrap = b.querySelector(".block-table-wrap");
    if (wrap) wrap.innerHTML = data.tableHTML;
    normalizeCanvasTableElement(b);
    syncTableFormulaCells(b);
    // restore editability
    b.querySelectorAll(".table-cell").forEach(cell => {
      cell.contentEditable = "true";
      cell.spellcheck = false;
    });
  }
  if (data.containerBody && data.type !== "container") {
    const cb = b.querySelector(".container-body");
    if (cb) {
      cb.innerHTML = data.containerBody;
      // make sure restored inline links are non-editable
      cb.querySelectorAll(".inline-link").forEach(link => {
        link.contentEditable = "false";
      });
    }
  }

  if (data.type === "calendar") {
    if (data.calendarTitle) b.dataset.calendarTitle = data.calendarTitle;
    if (data.calendarView) b.dataset.calendarView = data.calendarView;
    if (data.calendarMonth) b.dataset.calendarMonth = data.calendarMonth;
    if (data.calendarItems) b.dataset.calendarItems = data.calendarItems;
    if (data.dbProperties) b.dataset.dbProperties = data.dbProperties;
    if (data.dbRows) b.dataset.dbRows = data.dbRows;
    if (data.dbColumnWidths) b.dataset.dbColumnWidths = data.dbColumnWidths;
    if (data.dbFolderState) b.dataset.dbFolderState = data.dbFolderState;
    if (data.dbSourceKind) b.dataset.dbSourceKind = data.dbSourceKind;
    if (data.dbSourcePageId) b.dataset.dbSourcePageId = data.dbSourcePageId;
    if (data.dbSourceBlockId) b.dataset.dbSourceBlockId = data.dbSourceBlockId;
    if (data.calendarCollapsed) b.dataset.calendarCollapsed = data.calendarCollapsed;
    if (data.calendarExpandedWidth) b.dataset.calendarExpandedWidth = data.calendarExpandedWidth;

    requestAnimationFrame(() => {
      window.mountDatabaseEmbedBlock?.(b);
    });
  }

  if (data.type === "data-callout") {
    if (data.dataCalloutLabel) b.dataset.dataCalloutLabel = data.dataCalloutLabel;
    if (data.dataCalloutSourceType) b.dataset.dataCalloutSourceType = data.dataCalloutSourceType;
    if (data.dataCalloutSourceKind) b.dataset.dataCalloutSourceKind = data.dataCalloutSourceKind;
    if (data.dataCalloutSourcePageId) b.dataset.dataCalloutSourcePageId = data.dataCalloutSourcePageId;
    if (data.dataCalloutSourceBlockId) b.dataset.dataCalloutSourceBlockId = data.dataCalloutSourceBlockId;
    if (data.dataCalloutPropertyId) b.dataset.dataCalloutPropertyId = data.dataCalloutPropertyId;
    if (data.dataCalloutMode) b.dataset.dataCalloutMode = data.dataCalloutMode;
    if (data.dataCalloutRowId) b.dataset.dataCalloutRowId = data.dataCalloutRowId;
    if (data.dataCalloutSystemKey) b.dataset.dataCalloutSystemKey = data.dataCalloutSystemKey;
    if (data.dataCalloutSystemTargetKind) b.dataset.dataCalloutSystemTargetKind = data.dataCalloutSystemTargetKind;
    if (data.dataCalloutSystemTargetPageId) b.dataset.dataCalloutSystemTargetPageId = data.dataCalloutSystemTargetPageId;
    if (data.dataCalloutSystemFormat) b.dataset.dataCalloutSystemFormat = data.dataCalloutSystemFormat;
    if (data.dataCalloutAlign) b.dataset.dataCalloutAlign = data.dataCalloutAlign;
    if (data.dataCalloutSize) b.dataset.dataCalloutSize = data.dataCalloutSize;
    if (data.dataCalloutLabelPos) b.dataset.dataCalloutLabelPos = data.dataCalloutLabelPos;
    if ("dataCalloutShowIcon" in data) b.dataset.dataCalloutShowIcon = data.dataCalloutShowIcon;
    if ("dataCalloutIcon" in data) b.dataset.dataCalloutIcon = data.dataCalloutIcon;

    requestAnimationFrame(() => {
      window.mountDataCalloutBlock?.(b);
    });
  }

  if (data.type === "progress") {
    if (data.progressTitle) b.dataset.progressTitle = data.progressTitle;
    if (data.progressSourceType) b.dataset.progressSourceType = data.progressSourceType;
    if (data.progressSourceKind) b.dataset.progressSourceKind = data.progressSourceKind;
    if (data.progressSourcePageId) b.dataset.progressSourcePageId = data.progressSourcePageId;
    if (data.progressSourceBlockId) b.dataset.progressSourceBlockId = data.progressSourceBlockId;
    if (data.progressPropertyId) b.dataset.progressPropertyId = data.progressPropertyId;
    if (data.progressValueMode) b.dataset.progressValueMode = data.progressValueMode;
    if (data.progressScope) b.dataset.progressScope = data.progressScope;
    if (data.progressCurrentValue) b.dataset.progressCurrentValue = data.progressCurrentValue;
    if (data.progressTargetValue) b.dataset.progressTargetValue = data.progressTargetValue;
    if (data.progressUnitLabel) b.dataset.progressUnitLabel = data.progressUnitLabel;
    if (data.progressDeadline) b.dataset.progressDeadline = data.progressDeadline;
    if (data.progressStyle) b.dataset.progressStyle = data.progressStyle;
    if (data.progressSize) b.dataset.progressSize = data.progressSize;
    if (data.progressShowTitle) b.dataset.progressShowTitle = data.progressShowTitle;
    if (data.progressShowValue) b.dataset.progressShowValue = data.progressShowValue;
    if (data.progressShowPercent) b.dataset.progressShowPercent = data.progressShowPercent;
    if (data.progressShowDeadline) b.dataset.progressShowDeadline = data.progressShowDeadline;
    if (data.progressFillColor) b.dataset.progressFillColor = data.progressFillColor;
    if (data.progressTrackColor) b.dataset.progressTrackColor = data.progressTrackColor;

    requestAnimationFrame(() => {
      window.mountProgressBlock?.(b);
    });
  }

  if (data.type === "flashcards") {
    if (data.flashcardsConfig) b.dataset.flashcardsConfig = data.flashcardsConfig;

    requestAnimationFrame(() => {
      window.mountFlashcardDeckBlock?.(b);
    });
  }

  if (data.type === "clock") {
    b.dataset.clockStyle = data.clockStyle || "digital";
    b.dataset.clockSize = data.clockSize || "md";
    b.dataset.clockColor = data.clockColor || "#f5f5f5";
    b.dataset.clockFormat = data.clockFormat || "12";
    b.dataset.clockShowSeconds = data.clockShowSeconds || "0";
    b.dataset.clockShowDate = data.clockShowDate || "0";

    requestAnimationFrame(() => {
      window.mountClockBlock?.(b);
    });
  }

  if (data.type === "weblink") {
    syncWebLinkCardTarget(b, { url: data.externalUrl || "" });
  }

  // restore styles if present
  b.dataset.bgState = data.bg ? "alt" : "default";
  b.dataset.borderState = data.borderColor ? "alt" : "default";
  b.dataset.textState = data.textColor ? "alt" : "default";
  b.dataset.paddingState = data.padding ? "expanded" : "default";
  b.dataset.radiusState = data.radius === "2px" ? "square" : "rounded";

  if (data.bg) applyBlockBackgroundTone(b, data.bg);
  if (data.borderColor) applyBlockBorderTone(b, data.borderColor);
  if (data.textColor) applyBlockTextTone(b, data.textColor);
  if (data.padding) applyBlockPaddingTone(b, data.padding);
  if (data.radius) b.style.borderRadius = data.radius;
  if (data.hasNote)    b.classList.add("has-note");
  if (data.linkedPageId) b.dataset.linkedPageId = data.linkedPageId;
  if (getPageCardView(data) === "gallery") b.dataset.pageCardView = "gallery";
  b.dataset.pageCardImageMode = getPageCardImageMode(data);
  b.dataset.pageCardImagePos = String(getPageCardImagePosition(data));
  if (data.pageCardImageSrc) b.dataset.pageCardImageSrc = data.pageCardImageSrc;
  const linkedPage = getLinkedCardSourceRecord(data.linkedPageId);
  const syncedFromLinkedRecord = linkedPage ? syncLinkedPageBlockFromRecord(b, linkedPage) : false;

  if (!syncedFromLinkedRecord && data.cardStyle) b.dataset.cardStyle = data.cardStyle;
  const resolvedType = linkedPage?.type || data.type || "page";

  if (!syncedFromLinkedRecord) {
    const resolvedTitle = linkedPage && isGenericLinkedCardTitle(data.pageCardTitle, resolvedType)
      ? (linkedPage.title || "")
      : (data.pageCardTitle || linkedPage?.title || "");
    if (resolvedTitle) {
      const cardTitle = b.querySelector(".page-card-title");
      if (cardTitle) cardTitle.textContent = resolvedTitle;
    }

    const resolvedIcon = data.pageCardIcon || linkedPage?.icon || "";
    const iconFallback = resolvedType === "domain" ? "⌂" : "📄";
    if (resolvedIcon) {
      const cardIcon = b.querySelector(".page-card-icon");
      if (cardIcon) setIconElementContent(cardIcon, resolvedIcon, iconFallback);
      b.dataset.pageCardIcon = resolvedIcon;
    }

    applyPageCardImage(b, {
      mode: getPageCardImageMode(data),
      src: getStoredPageCardImageSource(data),
      pos: getPageCardImagePosition(data),
      iconValue: resolvedIcon || iconFallback,
      fallbackGlyph: iconFallback
    });
  }

  if (isPageCardIconHidden(data)) {
    setPageCardIconHidden(b, true);
  }

  const resolvedSummary = syncedFromLinkedRecord ? "" : (data.pageCardSummary || linkedPage?.summary || "");
  if (resolvedSummary) {
    const cardSummary = b.querySelector(".page-card-summary");
    if (cardSummary) cardSummary.textContent = resolvedSummary;
  }

  const resolvedTypeLabel = syncedFromLinkedRecord ? "" : (data.pageCardTypeLabel || (resolvedType === "domain" ? "domain" : (linkedPage?.type || "page")));
  if (resolvedTypeLabel) {
    const cardTypeLabel = b.querySelector(".page-card-type-label");
    if (cardTypeLabel) cardTypeLabel.textContent = resolvedTypeLabel;
  }

  if (data.pageCardMeta) {
    const cardMeta = b.querySelector(".page-card-meta");
    if (cardMeta) cardMeta.textContent = data.pageCardMeta;
  }

  if (data.type === "page" || data.type === "domain") {
    fitLinkedPageBlock(b);
  }

  return b;
}

function getMinHeightForBlock(block) {
  if (block?.dataset?.type === "text") {
    const body = block.querySelector(".block-body");
    const paddingTop = parseFloat(window.getComputedStyle(block).paddingTop) || 0;
    const paddingBottom = parseFloat(window.getComputedStyle(block).paddingBottom) || 0;
    const bodyHeight = body ? Math.max(body.scrollHeight, body.getBoundingClientRect().height) : 0;
    return Math.max(GRID_SIZE, Math.ceil(paddingTop + bodyHeight + paddingBottom + 2));
  }

  if (block?.dataset?.type === "clock") {
    const style = String(block.dataset.clockStyle || "digital").trim().toLowerCase();
    const size = String(block.dataset.clockSize || "md").trim().toLowerCase();
    const showDate = String(block.dataset.clockShowDate || "0") === "1" || String(block.dataset.clockShowDate || "").toLowerCase() === "true";
    const baseHeights = {
      digital: { sm: GRID_SIZE * 3, md: GRID_SIZE * 3, lg: GRID_SIZE * 4 },
      capsule: { sm: GRID_SIZE * 3, md: GRID_SIZE * 3, lg: GRID_SIZE * 4 },
      analog: { sm: GRID_SIZE * 4, md: GRID_SIZE * 5, lg: GRID_SIZE * 6 },
      split: { sm: GRID_SIZE * 5, md: GRID_SIZE * 6, lg: GRID_SIZE * 7 },
    };
    const resolvedStyle = baseHeights[style] ? style : "digital";
    const resolvedSize = baseHeights[resolvedStyle][size] ? size : "md";
    let height = baseHeights[resolvedStyle][resolvedSize];

    if (showDate) {
      height += GRID_SIZE;
    }

    return height;
  }

  const title = block.querySelector(".block-title");
  const body  = block.querySelector(".block-body");
  const containerTitle = block.querySelector(".container-title");
  const containerBody  = block.querySelector(".container-body");

  let bottom = 0;

  if (title)          bottom = Math.max(bottom, title.offsetTop + title.scrollHeight);
  if (body)           bottom = Math.max(bottom, body.offsetTop + body.scrollHeight);
  if (containerTitle) bottom = Math.max(bottom, containerTitle.offsetTop + containerTitle.scrollHeight);
  if (containerBody)  bottom = Math.max(bottom, containerBody.offsetTop + containerBody.scrollHeight);

  return bottom + 8; // small padding
}

function enforceMinHeight(block) {
  const minH = getMinResizeDimensionsForBlock(block).height;
  const currentH = block.getBoundingClientRect().height;

  if (currentH < minH) {
    block.style.height = `${minH}px`;
  }
}

gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;

  const mediaAction = e.target.closest(".page-card-media-action");
  if (!mediaAction) return;

  e.preventDefault();
  e.stopPropagation();

  const block = getPageCardHost(mediaAction);
  if (!block) return;

  promptPageCardImageUpload(block);
});


function clearGrid() {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.querySelectorAll(".block").forEach((b) => b.remove());
}
