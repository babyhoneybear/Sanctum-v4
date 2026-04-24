// == Sidebar open/close ==
const menuBtn = document.getElementById("menuBtn");
const closeBtn = document.getElementById("closeBtn");
const sidebar = document.getElementById("sidebar");

function syncSidebarAccessibility(isOpen) {
  if (!sidebar) return;
  if (!isOpen && sidebar.contains(document.activeElement)) {
    menuBtn?.focus();
  }
  sidebar.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if ("inert" in sidebar) {
    sidebar.inert = !isOpen;
  }
}

syncSidebarAccessibility(false);

// == Shared storage helpers ==
const STORAGE_KEYS = {
  registry: "sanctum_registry",
  domains: "sanctum_domains",
  pagesRegistry: "sanctum_pages_registry",
  pageBlocks: "sanctum_page_blocks",
  pageSettings: "sanctum_page_settings",
  documents: "sanctum_documents",
  docSettings: "sanctum_doc_settings",
  chronicles: "sanctum_chronicles",
  trash: "sanctum_trash",
  pins: "sanctum_pins",
  bookmarks: "sanctum_bookmarks",
  stickers: "sanctum_stickers",
  customStickers: "sanctum_custom_stickers",
  recentColors: "sanctum_recent_colors",
  colorPalette: "sanctum_color_palette"
};

function readStorageJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (err) {
    console.warn(`Failed to read storage key "${key}"`, err);
    return fallback;
  }
}

function writeStorageJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Failed to write storage key "${key}"`, err);
    return false;
  }
}

window.STORAGE_KEYS = STORAGE_KEYS;
window.readStorageJSON = readStorageJSON;
window.writeStorageJSON = writeStorageJSON;

const UI_STATE = {
  openOverlay: null,
  openPanel: null
};

function getUIState() {
  return { ...UI_STATE };
}

function setUIState(next = {}) {
  if ("openOverlay" in next) UI_STATE.openOverlay = next.openOverlay;
  if ("openPanel" in next) UI_STATE.openPanel = next.openPanel;
}

function getManagedOverlayEls() {
  return [
    document.getElementById("pageDetailsOverlay"),
    document.getElementById("pageIconOverlay"),
    document.getElementById("pageCreateOverlay"),
    document.getElementById("settingsOverlay"),
    document.getElementById("trashOverlay"),
    document.getElementById("peekDrawer"),
    document.getElementById("knowledgeDrawer"),
    ...document.querySelectorAll(".topbar-dropdown"),
    ...document.querySelectorAll(".item-dropdown")
  ].filter(Boolean);
}

function getManagedPanelEls() {
  return [
    document.getElementById("pinPanel"),
    document.getElementById("stickerPanel"),
    document.getElementById("soundbarPanel")
  ].filter(Boolean);
}

function isOverlayElement(el) {
  if (!el) return false;
  return !!el.closest(
    "#pageDetailsOverlay, #pageIconOverlay, #pageCreateOverlay, #settingsOverlay, #trashOverlay, #peekDrawer, #knowledgeDrawer, .topbar-dropdown, .item-dropdown"
  );
}

function isPanelElement(el) {
  if (!el) return false;
  return !!el.closest("#pinPanel, #stickerPanel, #soundbarPanel");
}

function closeAllOverlays(except = null) {
  const keep = new Set(Array.isArray(except) ? except : (except ? [except] : []));

  getManagedOverlayEls().forEach((el) => {
    const id = el.id || el.dataset.uiId || null;
    if (id && keep.has(id)) return;

    if (el.id === "peekDrawer") {
      el.classList.remove("open");
      if (typeof activePeekId !== "undefined") activePeekId = null;
      return;
    }

    el.classList.remove("open", "active", "visible");

    if (el.classList.contains("topbar-dropdown") || el.classList.contains("item-dropdown")) {
      el.remove();
      return;
    }

    el.style.display = "";
  });

  if (!except) {
    setUIState({ openOverlay: null });
  }
}

function closeAllPanels(except = null) {
  const keep = new Set(Array.isArray(except) ? except : (except ? [except] : []));

  const pinPanel = document.getElementById("pinPanel");
  const stickerPanel = document.getElementById("stickerPanel");
  const soundbarPanel = document.getElementById("soundbarPanel");

  if (pinPanel && !keep.has("pinPanel")) {
    pinPanel.classList.remove("open");
    document.body.classList.remove("pin-open");
    if (typeof pinViewMode !== "undefined") pinViewMode = "list";
  }

  if (stickerPanel && !keep.has("stickerPanel")) {
    stickerPanel.classList.remove("open");
    if (typeof stickerPanelOpen !== "undefined") stickerPanelOpen = false;
  }

  if (soundbarPanel && !keep.has("soundbarPanel")) {
    soundbarPanel.classList.remove("open");
    const toggleBtn = document.getElementById("soundbarToggleBtn");
    if (toggleBtn) toggleBtn.textContent = "\u2303";
    if (typeof soundbarExpanded !== "undefined") soundbarExpanded = false;
  }

  if (!except) {
    setUIState({ openPanel: null });
  }
}

function openOverlay(id, el) {
  closeAllOverlays(id);
  closeAllPanels(["pinPanel"]);

  if (!el) {
    setUIState({ openOverlay: id });
    return;
  }

  if (el.id === "peekDrawer") {
    el.classList.add("open");
  } else if (el.classList.contains("topbar-dropdown") || el.classList.contains("item-dropdown")) {
    // already inserted and positioned by caller
  } else {
    el.classList.add("open");
    el.style.display = "";
  }

  setUIState({ openOverlay: id });
}

function openPanel(id, el) {
  closeAllOverlays();
  closeAllPanels(id);

  if (el) {
    el.classList.add("open");
  }

  if (id === "pinPanel") {
    document.body.classList.add("pin-open");
  }

  if (id === "soundbarPanel") {
    const toggleBtn = document.getElementById("soundbarToggleBtn");
    if (toggleBtn) toggleBtn.textContent = "⌄";
    if (typeof soundbarExpanded !== "undefined") soundbarExpanded = true;
  }

  if (id === "stickerPanel" && typeof stickerPanelOpen !== "undefined") {
    stickerPanelOpen = true;
  }

  setUIState({ openPanel: id });
}

window.getUIState = getUIState;
window.setUIState = setUIState;
window.openOverlay = openOverlay;
window.openPanel = openPanel;
window.closeAllOverlays = closeAllOverlays;
window.closeAllPanels = closeAllPanels;

let appToastTimer = null;

function showAppToast(message, tone = "default") {
  const toast = document.getElementById("appToast");
  if (!toast) return;

  toast.textContent = message;
  toast.className = `app-toast show ${tone}`.trim();

  if (appToastTimer) {
    clearTimeout(appToastTimer);
  }

  appToastTimer = setTimeout(() => {
    toast.className = "app-toast";
  }, 2600);
}

window.showAppToast = showAppToast;

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  closeAllOverlays();
  closeAllPanels();
});

document.addEventListener("mousedown", (e) => {
  const clickedOverlayToggle = e.target.closest(
    "#moreBtn, .item-menu, #settingsBtn, #trashBtn, .topbar-btn, #tableStructureBtn, #tableBordersBtn, #tableMathBtn"
  );

  const clickedPanelToggle = e.target.closest(
    "#PinsBtn, #soundbarToggleBtn, #toolSticker"
  );

  const insideOverlay = isOverlayElement(e.target);
  const insidePanel = isPanelElement(e.target);
  const insideDoc = e.target.closest("#docEditor, .doc-page, .doc-content");

  const placingPageCard =
    document.body.classList.contains("editing") &&
    typeof placing !== "undefined" &&
    placing &&
    (placePreset === "page" || placePreset === "domain") &&
    e.target.closest("#grid");

  if (!insideOverlay && !clickedOverlayToggle && !placingPageCard) {
    closeAllOverlays();
  }

  if (!insidePanel && !clickedPanelToggle && !insideDoc) {
    closeAllPanels();
  }

  if (!e.target.closest("#editToggle") && !e.target.closest("#docAnnotatePanelEl")) {
    if (typeof window.closeDocAnnotateDock === "function") {
      window.closeDocAnnotateDock();
    }
  }
});

function normalizeHeaderPos(value = 50) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "top") return 25;
    if (trimmed === "center" || trimmed === "") return 50;
    if (trimmed === "bottom") return 75;

    const parsed = Number(trimmed.replace("%", ""));
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, parsed));
    }
  }

  return 50;
}

function normalizePageSettings(settings = {}) {
  return {
    showHeader: !!settings.showHeader,
    showTitle: settings.showTitle !== false,
    showIcon: settings.showIcon !== false,
    headerSrc: typeof settings.headerSrc === "string" ? settings.headerSrc : "",
    headerSize: ["sm", "md", "lg"].includes(settings.headerSize) ? settings.headerSize : "md",
    headerPos: normalizeHeaderPos(settings.headerPos),
    fontPreset: normalizePageFontPreset(settings.fontPreset)
  };
}

const PAGE_FONT_PRESETS = {
  "": {
    label: "System",
    family: ""
  },
  arial: {
    label: "Arial",
    family: "Arial, Helvetica, sans-serif"
  },
  times: {
    label: "Times New Roman",
    family: "'Times New Roman', Times, serif"
  },
  sunrise: {
    label: "Waiting for the Sunrise",
    family: "'Waiting for the Sunrise', 'Comic Sans MS', cursive"
  },
  cursive: {
    label: "Great Vibes",
    family: "'Great Vibes', 'Brush Script MT', cursive"
  }
};

function normalizePageFontPreset(value) {
  const preset = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (preset === "garamond") return "times";
  return Object.prototype.hasOwnProperty.call(PAGE_FONT_PRESETS, preset) ? preset : "";
}

function getPageFontPresetMeta(preset = "") {
  return PAGE_FONT_PRESETS[normalizePageFontPreset(preset)] || PAGE_FONT_PRESETS[""];
}

function escapeHTML(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isImageIconValue(value = "") {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return false;
  return /^(data:image\/|blob:|https?:\/\/|file:|\/|\.\/|\.\.\/)/i.test(trimmed);
}

function getIconMarkup(iconValue, fallback = "📄", className = "") {
  const value = typeof iconValue === "string" && iconValue.trim() ? iconValue.trim() : fallback;
  const safeClassName = typeof className === "string" && className.trim()
    ? ` class="${className}"`
    : "";

  if (isImageIconValue(value)) {
    return `<span${safeClassName} data-icon-type="image"><img class="icon-render-img" src="${escapeHTML(value)}" alt=""></span>`;
  }

  return `<span${safeClassName} data-icon-type="glyph">${escapeHTML(value)}</span>`;
}

function setIconElementContent(el, iconValue, fallback = "📄") {
  if (!el) return;

  const value = typeof iconValue === "string" && iconValue.trim() ? iconValue.trim() : fallback;

  if (isImageIconValue(value)) {
    el.dataset.iconType = "image";
    el.innerHTML = `<img class="icon-render-img" src="${escapeHTML(value)}" alt="">`;
    return;
  }

  el.dataset.iconType = "glyph";
  el.textContent = value;
}

function normalizePin(pin = {}) {
  return {
    id: typeof pin.id === "string" ? pin.id : "",
    title: typeof pin.title === "string" && pin.title.trim() ? pin.title : "Untitled",
    type: typeof pin.type === "string" && pin.type.trim() ? pin.type : "canvas",
    icon: typeof pin.icon === "string" ? pin.icon : ""
  };
}

window.normalizePageSettings = normalizePageSettings;
window.normalizePin = normalizePin;

function readAllPageBlocks() {
  return readStorageJSON(STORAGE_KEYS.pageBlocks, {});
}

function writeAllPageBlocks(allBlocks) {
  return writeStorageJSON(STORAGE_KEYS.pageBlocks, allBlocks || {});
}

function getPageBlocks(pageId) {
  const all = readAllPageBlocks();
  return Array.isArray(all[pageId]) ? all[pageId] : [];
}

function setPageBlocks(pageId, blocks) {
  const all = readAllPageBlocks();
  all[pageId] = Array.isArray(blocks) ? blocks : [];
  return writeAllPageBlocks(all);
}

function readAllDocuments() {
  return readStorageJSON(STORAGE_KEYS.documents, {});
}

function writeAllDocuments(allDocs) {
  return writeStorageJSON(STORAGE_KEYS.documents, allDocs || {});
}

window.readAllPageBlocks = readAllPageBlocks;
window.writeAllPageBlocks = writeAllPageBlocks;
window.getPageBlocks = getPageBlocks;
window.setPageBlocks = setPageBlocks;
window.readAllDocuments = readAllDocuments;
window.writeAllDocuments = writeAllDocuments;

function updateLinkedCardTitlesEverywhere(pageId, newTitle) {
  const allBlocks = readAllPageBlocks();
  let changed = false;

  for (const hostPageId in allBlocks) {
    const blocks = Array.isArray(allBlocks[hostPageId]) ? allBlocks[hostPageId] : [];
    allBlocks[hostPageId] = blocks.map((b) => {
      let nextBlock = b;

      if (b.linkedPageId === pageId) {
        changed = true;
        const dims = getLinkedPageCardDimensions(newTitle, {
          type: b.type || "page",
          padding: b.padding || "",
          pageCardHideIcon: b.pageCardHideIcon || 0,
          pageCardView: b.pageCardView || "default",
          w: b.w || 0,
          h: b.h || 0
        });
        nextBlock = { ...b, pageCardTitle: newTitle, w: dims.width, h: dims.height };
      }

      const nextItems = getSerializedContainerItems(nextBlock).map((item) => {
        if (item.linkedPageId !== pageId) return item;
        changed = true;
        return { ...item, pageCardTitle: newTitle };
      });

      if (nextItems.length) {
        nextBlock = { ...nextBlock, containerItems: nextItems };
      }

      return nextBlock;
    });
  }

  if (changed) {
    writeAllPageBlocks(allBlocks);
  }

  document
    .querySelectorAll(`[data-linked-page-id="${pageId}"]`)
    .forEach((cardHost) => {
      const titleEl = cardHost.querySelector(".page-card-title");
      if (titleEl) titleEl.textContent = newTitle;
      fitLinkedPageBlock(cardHost);
    });
}

function updatePinnedPageTitle(pageId, newTitle) {
  let changed = false;
  pinnedPages = pinnedPages.map((pin) => {
    if (pin.id === pageId) {
      changed = true;
      return { ...pin, title: newTitle };
    }
    return pin;
  });

  if (changed) {
    savePins();
    const pinPanel = document.getElementById("pinPanel");
    if (pinPanel?.classList.contains("open")) {
      renderPinPanel();
    }
  }
}

function updateLinkedCardIconsEverywhere(pageId, newIcon) {
  const icon = newIcon || "📄";
  const allBlocks = readAllPageBlocks();
  let changed = false;

  for (const hostPageId in allBlocks) {
    const blocks = Array.isArray(allBlocks[hostPageId]) ? allBlocks[hostPageId] : [];
    allBlocks[hostPageId] = blocks.map((b) => {
      let nextBlock = b;

      if (b.linkedPageId === pageId) {
        changed = true;
        nextBlock = { ...b, pageCardIcon: icon };
      }

      const nextItems = getSerializedContainerItems(nextBlock).map((item) => {
        if (item.linkedPageId !== pageId) return item;
        changed = true;
        return { ...item, pageCardIcon: icon };
      });

      if (nextItems.length) {
        nextBlock = { ...nextBlock, containerItems: nextItems };
      }

      return nextBlock;
    });
  }

  if (changed) {
    writeAllPageBlocks(allBlocks);
  }

  document
    .querySelectorAll(`[data-linked-page-id="${pageId}"]`)
    .forEach((cardHost) => {
      const fallbackGlyph = cardHost.dataset.type === "domain" ? "⌂" : "📄";
      const cardIcon = cardHost.querySelector(".page-card-icon");
      const mediaIcon = cardHost.querySelector(".page-card-media-icon");

      if (cardIcon) setIconElementContent(cardIcon, icon, fallbackGlyph);
      if (mediaIcon) setIconElementContent(mediaIcon, icon, fallbackGlyph);
      cardHost.dataset.pageCardIcon = icon;
    });
}

function updateLinkedCardImagesEverywhere(pageId) {
  const imageSrc = getLinkedPageCardImageSource(pageId);
  const allBlocks = readAllPageBlocks();
  let changed = false;

  for (const hostPageId in allBlocks) {
    const blocks = Array.isArray(allBlocks[hostPageId]) ? allBlocks[hostPageId] : [];
    allBlocks[hostPageId] = blocks.map((b) => {
      let nextBlock = b;

      if (b.linkedPageId === pageId && getPageCardImageMode(b) === "linked") {
        changed = true;
        nextBlock = { ...b, pageCardImageMode: "linked", pageCardImageSrc: imageSrc };
      }

      const nextItems = getSerializedContainerItems(nextBlock).map((item) => {
        if (item.linkedPageId !== pageId || getPageCardImageMode(item) !== "linked") return item;
        changed = true;
        return { ...item, pageCardImageMode: "linked", pageCardImageSrc: imageSrc };
      });

      if (nextItems.length) {
        nextBlock = { ...nextBlock, containerItems: nextItems };
      }

      return nextBlock;
    });
  }

  if (changed) {
    writeAllPageBlocks(allBlocks);
  }

  document
    .querySelectorAll(`[data-linked-page-id="${pageId}"]`)
    .forEach((cardHost) => {
      if (getPageCardImageMode(cardHost) !== "linked") return;

      applyPageCardImage(cardHost, {
        mode: "linked",
        iconValue: cardHost.dataset.pageCardIcon || cardHost.querySelector(".page-card-icon")?.textContent || (cardHost.dataset.type === "domain" ? "⌂" : "📄"),
        fallbackGlyph: cardHost.dataset.type === "domain" ? "⌂" : "📄"
      });
    });
}

function isPageCardIconHidden(blockOrData) {
  if (!blockOrData) return false;

  if (blockOrData instanceof HTMLElement) {
    return blockOrData.dataset.pageCardHideIcon === "1";
  }

  const raw = blockOrData.pageCardHideIcon;
  return raw === 1 || raw === "1" || raw === true;
}

function setPageCardIconHidden(block, hidden = false) {
  if (!block) return;

  if (hidden) {
    block.dataset.pageCardHideIcon = "1";
  } else {
    delete block.dataset.pageCardHideIcon;
  }

  if (block.dataset.type === "page" || block.dataset.type === "domain") {
    fitLinkedPageBlock(block);
  }
}

function updatePinnedPageIcon(pageId, newIcon) {
  let changed = false;
  pinnedPages = pinnedPages.map((pin) => {
    if (pin.id === pageId) {
      changed = true;
      return { ...pin, icon: newIcon || "" };
    }
    return pin;
  });

  if (changed) {
    savePins();
    const pinPanel = document.getElementById("pinPanel");
    if (pinPanel?.classList.contains("open")) {
      renderPinPanel();
    }
  }
}

function refreshSidebarLabelsAfterRename(pageId) {
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();

  const item = document.querySelector(`[data-domain-id="${pageId}"] .item-name, [data-page-id="${pageId}"] .item-name`);
  if (item) {
    const page =
      userDomains.find((d) => d.id === pageId) ||
      userPages.find((p) => p.id === pageId);

    if (page) item.textContent = page.title;
  }
}

function applyPageRenameEverywhere(pageId, newTitle) {
  const page =
    userDomains.find((d) => d.id === pageId) ||
    userPages.find((p) => p.id === pageId);

  if (!page) return;

  page.title = newTitle;
  saveSanctumRegistry();

  if (currentPageId === pageId) {
    const titleEl = document.getElementById("pageTitle");
    if (titleEl) titleEl.textContent = newTitle;

    const heroTitle = document.getElementById("pageHeroTitle");
    if (heroTitle) heroTitle.textContent = newTitle;

    renderBreadcrumbs(pageId);

    if (page.layout === "sheet" && typeof window.renderPageCalendarDatabase === "function") {
      window.requestAnimationFrame(() => window.renderPageCalendarDatabase(pageId));
    }
  }

  updateLinkedCardTitlesEverywhere(pageId, newTitle);
  updatePinnedPageTitle(pageId, newTitle);
  refreshSidebarLabelsAfterRename(pageId);
}

function applyPageIconEverywhere(pageId, newIcon) {
  const page =
    userDomains.find((d) => d.id === pageId) ||
    userPages.find((p) => p.id === pageId);

  if (!page) return false;

  const nextIcon = typeof newIcon === "string" ? newIcon : "";
  const previousIcon = page.icon || "";
  page.icon = nextIcon;

  const saved = saveSanctumRegistry();
  if (!saved) {
    page.icon = previousIcon;
    saveSanctumRegistry();
    return false;
  }

  updateLinkedCardIconsEverywhere(pageId, nextIcon);
  updatePinnedPageIcon(pageId, nextIcon);
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();

  if (currentPageId === pageId) {
    renderBreadcrumbs(pageId);
    renderPageHero(pageId);

    if (page.layout === "sheet" && typeof window.renderPageCalendarDatabase === "function") {
      window.requestAnimationFrame(() => window.renderPageCalendarDatabase(pageId));
    }
  }

  if (activePeekId === pageId) {
    openPeek(pageId);
  }

  return true;
}

function collectDescendantPageIds(rootId) {
  const ids = new Set();
  const stack = [rootId];

  while (stack.length) {
    const parentId = stack.pop();

    userPages.forEach((page) => {
      if (page.parent === parentId && !ids.has(page.id)) {
        ids.add(page.id);
        stack.push(page.id);
      }
    });
  }

  return Array.from(ids);
}

let trashItems = readStorageJSON(STORAGE_KEYS.trash, []);

function saveTrash(nextItems = trashItems) {
  const normalizedItems = Array.isArray(nextItems) ? nextItems.filter(Boolean) : [];
  const saved = writeStorageJSON(STORAGE_KEYS.trash, normalizedItems);
  if (!saved) return false;
  trashItems = normalizedItems;
  return true;
}

function getRestorableRecordTitle(id) {
  if (!id) return "";
  if (id === "home") return "Home";

  const record =
    userDomains.find((d) => d.id === id) ||
    userPages.find((p) => p.id === id) ||
    SYSTEM_PAGES[id];

  return record?.title || "";
}

function hasRestorableHost(id) {
  if (!id) return false;
  if (id === "home") return true;
  return !!(
    SYSTEM_PAGES[id] ||
    userDomains.some((d) => d.id === id) ||
    userPages.some((p) => p.id === id)
  );
}

function formatTrashKindLabel(item) {
  if (item.kind === "domain") return "Domain";
  const type = item.rootContainerType || "page";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function mergeUniqueById(existing = [], incoming = []) {
  const merged = [...existing];
  incoming.forEach((item) => {
    if (!item?.id) return;
    if (!merged.some((entry) => entry.id === item.id)) {
      merged.push(item);
    }
  });
  return merged;
}

function snapshotTrashItem(rootId, kind = "page") {
  const targetIds = Array.from(new Set([rootId, ...collectDescendantPageIds(rootId)]));
  const rootDomain = kind === "domain" ? userDomains.find((d) => d.id === rootId) : null;
  const rootPage = kind !== "domain" ? userPages.find((p) => p.id === rootId) : null;
  if (!rootDomain && !rootPage) return null;

  const rootParentId = kind === "page" ? (rootPage?.parent || "home") : null;
  const itemCount = kind === "domain" ? targetIds.length + 1 : targetIds.length;

  const allBlocks = readAllPageBlocks();
  const allDocs = readAllDocuments();
  const pageSettings = readStorageJSON(STORAGE_KEYS.pageSettings, {});
  const docSettings = readStorageJSON(STORAGE_KEYS.docSettings, {});
  const stickers = readStorageJSON(STORAGE_KEYS.stickers, {});
  const threads = readStorageJSON("sanctum_threads", {});
  const anchors = readStorageJSON("sanctum_anchors", {});
  const legacyAnnotations = readStorageJSON("sanctum_annotations", {});

  const item = {
    id: `trash-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    rootId,
    title: rootDomain?.title || rootPage?.title || "Untitled",
    deletedAt: new Date().toISOString(),
    rootParentId,
    rootParentTitle: rootParentId ? (getRestorableRecordTitle(rootParentId) || "Home") : null,
    rootContainerType: rootPage?.containerType || null,
    itemCount,
    domain: rootDomain ? { ...rootDomain } : null,
    pages: userPages.filter((p) => targetIds.includes(p.id)).map((p) => ({ ...p })),
    pinnedPages: pinnedPages.filter((p) => targetIds.includes(p.id)).map((p) => ({ ...p })),
    bookmarks: bookmarks.filter((id) => targetIds.includes(id)),
    pageBlocks: {},
    linkedBlocksByHost: {},
    documents: {},
    docSettings: {},
    pageSettings: {},
    stickers: {},
    threads: {},
    anchors: {},
    annotations: {}
  };

  targetIds.forEach((id) => {
    if (Array.isArray(allBlocks[id])) item.pageBlocks[id] = allBlocks[id].map((b) => ({ ...b }));
    if (Object.prototype.hasOwnProperty.call(allDocs, id)) item.documents[id] = allDocs[id];
    if (Object.prototype.hasOwnProperty.call(docSettings, id)) item.docSettings[id] = docSettings[id];
    if (Object.prototype.hasOwnProperty.call(pageSettings, id)) item.pageSettings[id] = pageSettings[id];
    if (Object.prototype.hasOwnProperty.call(stickers, id)) item.stickers[id] = stickers[id];
    if (Object.prototype.hasOwnProperty.call(threads, id)) item.threads[id] = threads[id];
    if (Object.prototype.hasOwnProperty.call(anchors, id)) item.anchors[id] = anchors[id];
    if (Object.prototype.hasOwnProperty.call(legacyAnnotations, id)) item.annotations[id] = legacyAnnotations[id];
  });

  for (const hostId in allBlocks) {
    if (targetIds.includes(hostId)) continue;
    const blocks = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
    const linkedBlocks = blocks.filter((b) => targetIds.includes(b.linkedPageId));
    if (linkedBlocks.length) {
      item.linkedBlocksByHost[hostId] = linkedBlocks.map((b) => ({ ...b }));
    }
  }

  const nextTrashItems = [item, ...trashItems];
  if (!saveTrash(nextTrashItems)) {
    showAppToast(`Could not move "${item.title}" to Trash. Nothing was deleted.`, "info");
    return null;
  }
  return item;
}

function restoreTrashItem(trashId) {
  const item = trashItems.find((entry) => entry.id === trashId);
  if (!item) return;

  if (item.domain?.id && !userDomains.some((d) => d.id === item.domain.id)) {
    userDomains.push({ ...item.domain });
  }

  userPages = mergeUniqueById(userPages, (item.pages || []).map((p) => ({ ...p })));
  pinnedPages = mergeUniqueById(pinnedPages, (item.pinnedPages || []).map((p) => ({ ...p })));
  bookmarks = Array.from(new Set([...(bookmarks || []), ...(item.bookmarks || [])]));

  let restoredRootPage = item.kind === "page"
    ? userPages.find((p) => p.id === item.rootId)
    : null;
  let reparentedToHome = false;

  if (restoredRootPage) {
    const intendedParentId = restoredRootPage.parent || item.rootParentId || "home";
    if (!hasRestorableHost(intendedParentId)) {
      restoredRootPage.parent = "home";
      reparentedToHome = true;
    }
  }

  const allBlocks = readAllPageBlocks();
  Object.entries(item.pageBlocks || {}).forEach(([hostId, blocks]) => {
    allBlocks[hostId] = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
    const existingIds = new Set(allBlocks[hostId].map((b) => b.id));
    const restoredBlocks = blocks.filter((b) => !existingIds.has(b.id)).map((b) => ({ ...b }));
    allBlocks[hostId] = [...allBlocks[hostId], ...restoredBlocks];
  });

  Object.entries(item.linkedBlocksByHost || {}).forEach(([hostId, blocks]) => {
    if (!hasRestorableHost(hostId)) return;
    allBlocks[hostId] = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
    const existingIds = new Set(allBlocks[hostId].map((b) => b.id));
    const restoredBlocks = blocks.filter((b) => !existingIds.has(b.id)).map((b) => ({ ...b }));
    allBlocks[hostId] = [...allBlocks[hostId], ...restoredBlocks];
  });
  writeAllPageBlocks(allBlocks);

  const allDocs = readAllDocuments();
  Object.entries(item.documents || {}).forEach(([id, value]) => {
    allDocs[id] = value;
  });
  writeAllDocuments(allDocs);

  const docSettings = readStorageJSON(STORAGE_KEYS.docSettings, {});
  Object.assign(docSettings, item.docSettings || {});
  writeStorageJSON(STORAGE_KEYS.docSettings, docSettings);

  const pageSettings = readStorageJSON(STORAGE_KEYS.pageSettings, {});
  Object.assign(pageSettings, item.pageSettings || {});
  writeStorageJSON(STORAGE_KEYS.pageSettings, pageSettings);

  const stickers = readStorageJSON(STORAGE_KEYS.stickers, {});
  Object.assign(stickers, item.stickers || {});
  writeStorageJSON(STORAGE_KEYS.stickers, stickers);

  const threads = readStorageJSON("sanctum_threads", {});
  Object.assign(threads, item.threads || {});
  writeStorageJSON("sanctum_threads", threads);

  const anchors = readStorageJSON("sanctum_anchors", {});
  Object.assign(anchors, item.anchors || {});
  writeStorageJSON("sanctum_anchors", anchors);

  const legacyAnnotations = readStorageJSON("sanctum_annotations", {});
  Object.assign(legacyAnnotations, item.annotations || {});
  writeStorageJSON("sanctum_annotations", legacyAnnotations);

  if (restoredRootPage && reparentedToHome) {
    ensureParentLinkCard(restoredRootPage);
  }

  saveTrash(trashItems.filter((entry) => entry.id !== trashId));
  saveSanctumRegistry();
  savePins();
  saveBookmarks();
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();
  renderTrashList();
  closeTrash();
  showAppToast(
    reparentedToHome
      ? `Restored "${item.title}" to Home because its original parent no longer exists.`
      : `Restored "${item.title}".`,
    reparentedToHome ? "info" : "success"
  );
  openPage(item.rootId);
}

function deleteTrashItemForever(trashId) {
  if (!saveTrash(trashItems.filter((entry) => entry.id !== trashId))) {
    showAppToast("Could not update Trash right now.", "info");
    return;
  }
  renderTrashList();
}

function renderTrashList() {
  const list = document.getElementById("trashList");
  const empty = document.getElementById("trashEmpty");
  const emptyAllBtn = document.getElementById("trashEmptyAllBtn");
  if (!list || !empty) return;

  list.innerHTML = "";
  const hasItems = trashItems.length > 0;
  empty.style.display = hasItems ? "none" : "block";
  if (emptyAllBtn) emptyAllBtn.style.display = hasItems ? "" : "none";
  if (!hasItems) return;

  trashItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "trash-item";
    row.innerHTML = `
      <div class="trash-item-main">
        <div class="trash-item-title">${item.kind === "domain" ? "⌂" : "📄"} ${item.title}</div>
        <div class="trash-item-meta">
          ${formatTrashKindLabel(item)} • ${item.itemCount === 1 ? "1 item" : `${item.itemCount} items`} • ${item.rootParentTitle ? `From ${item.rootParentTitle}` : "Top level"}
        </div>
        <div class="trash-item-meta">
          Deleted ${new Date(item.deletedAt).toLocaleString()}
        </div>
      </div>
      <div class="trash-item-actions">
        <button class="trash-item-btn" data-trash-restore="${item.id}">Restore</button>
        <button class="trash-item-btn danger" data-trash-delete="${item.id}">Delete Forever</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function openTrash() {
  const overlay = document.getElementById("trashOverlay");
  if (!overlay) return;
  renderTrashList();
  if (typeof openOverlay === "function") {
    openOverlay("trashOverlay", overlay);
  } else {
    overlay.classList.add("open");
  }
}

function closeTrash() {
  document.getElementById("trashOverlay")?.classList.remove("open");
  if (typeof setUIState === "function") {
    const state = getUIState?.();
    if (state?.openOverlay === "trashOverlay") {
      setUIState({ openOverlay: null });
      if (typeof refreshCanvasDockToolState === "function") {
        refreshCanvasDockToolState();
      }
    }
  }
}

function movePageToTrash(pageId) {
  const snapshot = snapshotTrashItem(pageId, "page");
  if (!snapshot) return;
  deleteSinglePageTree(pageId);
}

function moveDomainToTrash(domainId) {
  const snapshot = snapshotTrashItem(domainId, "domain");
  if (!snapshot) return;
  deleteDomainTree(domainId);
}

function deletePagesAndStoredData(pageIds = []) {
  const ids = Array.from(new Set(pageIds.filter(Boolean)));
  if (!ids.length) return;

  userPages = userPages.filter((p) => !ids.includes(p.id));
  pinnedPages = pinnedPages.filter((p) => !ids.includes(p.id));
  bookmarks = bookmarks.filter((id) => !ids.includes(id));

  const allBlocks = readAllPageBlocks();
  ids.forEach((id) => {
    delete allBlocks[id];
  });

  for (const hostId in allBlocks) {
    const blocks = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
    allBlocks[hostId] = blocks.filter((b) => !ids.includes(b.linkedPageId));
  }
  writeAllPageBlocks(allBlocks);

  const allDocs = readAllDocuments();
  ids.forEach((id) => {
    delete allDocs[id];
  });
  writeAllDocuments(allDocs);

  const docSettings = readStorageJSON(STORAGE_KEYS.docSettings, {});
  ids.forEach((id) => delete docSettings[id]);
  writeStorageJSON(STORAGE_KEYS.docSettings, docSettings);

  const pageSettings = readStorageJSON(STORAGE_KEYS.pageSettings, {});
  ids.forEach((id) => delete pageSettings[id]);
  writeStorageJSON(STORAGE_KEYS.pageSettings, pageSettings);

  const stickers = readStorageJSON(STORAGE_KEYS.stickers, {});
  ids.forEach((id) => delete stickers[id]);
  writeStorageJSON(STORAGE_KEYS.stickers, stickers);

  const threads = readStorageJSON("sanctum_threads", {});
  ids.forEach((id) => delete threads[id]);
  writeStorageJSON("sanctum_threads", threads);

  const anchors = readStorageJSON("sanctum_anchors", {});
  ids.forEach((id) => delete anchors[id]);
  writeStorageJSON("sanctum_anchors", anchors);

  const legacyAnnotations = readStorageJSON("sanctum_annotations", {});
  ids.forEach((id) => delete legacyAnnotations[id]);
  writeStorageJSON("sanctum_annotations", legacyAnnotations);

  saveSanctumRegistry();
  savePins();
  saveBookmarks();
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();
}

function deleteDomainTree(domainId) {
  const childPageIds = collectDescendantPageIds(domainId);

  userDomains = userDomains.filter((d) => d.id !== domainId);
  pinnedPages = pinnedPages.filter((p) => p.id !== domainId);
  bookmarks = bookmarks.filter((id) => id !== domainId);

  deletePagesAndStoredData(childPageIds);

  const allBlocks = readAllPageBlocks();
  if (Array.isArray(allBlocks["home"])) {
    allBlocks["home"] = allBlocks["home"].filter((b) => b.linkedPageId !== domainId);
  }

  for (const hostId in allBlocks) {
    const blocks = Array.isArray(allBlocks[hostId]) ? allBlocks[hostId] : [];
    allBlocks[hostId] = blocks.filter((b) => b.linkedPageId !== domainId);
  }

  delete allBlocks[domainId];
  writeAllPageBlocks(allBlocks);

  const pageSettings = readStorageJSON(STORAGE_KEYS.pageSettings, {});
  delete pageSettings[domainId];
  writeStorageJSON(STORAGE_KEYS.pageSettings, pageSettings);

  const stickers = readStorageJSON(STORAGE_KEYS.stickers, {});
  delete stickers[domainId];
  writeStorageJSON(STORAGE_KEYS.stickers, stickers);

  saveSanctumRegistry();
  savePins();
  saveBookmarks();
  renderSidebarDomains();
  renderSidebarPins();
  renderSidebarBookmarks();
}

function deleteSinglePageTree(pageId) {
  const childPageIds = collectDescendantPageIds(pageId);
  deletePagesAndStoredData([pageId, ...childPageIds]);
}


