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
  pageActivity: "sanctum_page_activity_v1",
  journals: "sanctum_journals_v1",
  documents: "sanctum_documents",
  docSettings: "sanctum_doc_settings",
  pageDatabases: "sanctum_page_databases",
  legacyCalendarDatabases: "sanctum_calendar_databases",
  chronicles: "sanctum_chronicles",
  trash: "sanctum_trash",
  pins: "sanctum_pins",
  bookmarks: "sanctum_bookmarks",
  stickers: "sanctum_stickers",
  customStickers: "sanctum_custom_stickers",
  recentColors: "sanctum_recent_colors",
  colorPalette: "sanctum_color_palette",
  notesVault: "sanctum_notes_vault_v1",
  noteShelves: "sanctum_note_shelves_v1",
  helperInbox: "sanctum_helper_inbox_v1",
  helperActionLog: "sanctum_helper_action_log_v1",
  helperChatLog: "sanctum_helper_chat_log_v1",
  helperUserProfile: "sanctum_helper_user_profile_v1",
  helperMemoryProfile: "sanctum_helper_memory_profile_v1",
  settings: "sanctum_settings",
  threads: "sanctum_threads",
  anchors: "sanctum_anchors",
  annotations: "sanctum_annotations",
  canvasLines: "sanctum_canvas_lines",
  pageProps: "sanctum_page_props_v1",
  relationshipGraphSettings: "sanctum.relationshipGraph.settings.v1",
  lexicon: "sanctumLexicon",
  styleKits: "sanctum_style_kits",
  pagePresets: "sanctum_page_presets",
  studyActivity: "sanctum.studyActivity.v1",
  activePageSession: "sanctum_active_page_session_v1",
  soundbarLibrary: "sanctum_soundbar_library_v1",
  knowledgeViewState: "sanctum_knowledge_view_state",
  historyState: "sanctum_v3_state",
  splitLayout: "sanctum_split_layout_v1",
  tabsLayout: "sanctum_tabs_layout_v1"
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

function normalizeCanvasZoom(value = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.45, Math.min(1.85, numeric));
}

function normalizeCanvasOffset(value = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function normalizeThemeMode(value = "", fallback = "dark") {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "light" || safe === "dark" || safe === "black") return safe;
  return fallback === "light" ? "light" : fallback === "black" ? "black" : "dark";
}

function normalizePageThemeOverride(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "light" || safe === "dark" || safe === "black" ? safe : "";
}

function normalizePageSettings(settings = {}) {
  return {
    showHeader: !!settings.showHeader,
    showTitle: settings.showTitle !== false,
    showIcon: settings.showIcon !== false,
    headerSrc: typeof settings.headerSrc === "string" ? settings.headerSrc : "",
    headerSize: ["sm", "md", "lg", "xl"].includes(settings.headerSize) ? settings.headerSize : "md",
    headerPos: normalizeHeaderPos(settings.headerPos),
    fontPreset: normalizePageFontPreset(settings.fontPreset),
    theme: normalizePageThemeOverride(settings.theme || settings.themeOverride || ""),
    heroOverlay: !!settings.heroOverlay,
    heroOverlayTitle: typeof settings.heroOverlayTitle === "string" ? settings.heroOverlayTitle : "",
    heroOverlaySubtitle: typeof settings.heroOverlaySubtitle === "string" ? settings.heroOverlaySubtitle : "",
    canvasZoom: normalizeCanvasZoom(settings.canvasZoom),
    canvasScrollLeft: normalizeCanvasOffset(settings.canvasScrollLeft),
    canvasScrollTop: normalizeCanvasOffset(settings.canvasScrollTop),
    canvasHasView: settings.canvasHasView === true
  };
}

const PAGE_FONT_PRESETS = {
  "": {
    label: "System",
    family: ""
  },
  arial: {
    label: "Arial",
    family: "Arial, 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', Helvetica, sans-serif"
  },
  manrope: {
    label: "Manrope",
    family: "'Manrope', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', 'Segoe UI', sans-serif"
  },
  notoSansJp: {
    label: "Noto Sans JP",
    family: "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', sans-serif"
  },
  bizUdGothic: {
    label: "BIZ UDPGothic",
    family: "'BIZ UDPGothic', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', sans-serif"
  },
  mPlusRounded: {
    label: "M PLUS Rounded",
    family: "'M PLUS Rounded 1c', 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', sans-serif"
  },
  notoSerifJp: {
    label: "Noto Serif JP",
    family: "'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif"
  },
  bizUdMincho: {
    label: "BIZ UDPMincho",
    family: "'BIZ UDPMincho', 'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif"
  },
  times: {
    label: "Times New Roman",
    family: "'Times New Roman', 'Noto Serif JP', Times, serif"
  },
  playfair: {
    label: "Playfair Display",
    family: "'Playfair Display', 'Noto Serif JP', Georgia, serif"
  },
  cormorant: {
    label: "Cormorant Garamond",
    family: "'Cormorant Garamond', 'Noto Serif JP', Garamond, serif"
  },
  marcellus: {
    label: "Marcellus",
    family: "'Marcellus', 'Noto Serif JP', 'Times New Roman', serif"
  },
  sunrise: {
    label: "Waiting for the Sunrise",
    family: "'Waiting for the Sunrise', 'Noto Sans JP', 'Comic Sans MS', cursive"
  },
  cursive: {
    label: "Great Vibes",
    family: "'Great Vibes', 'Noto Sans JP', 'Brush Script MT', cursive"
  }
};

function normalizePageFontPreset(value) {
  const preset = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (preset === "garamond") return "times";
  if (preset === "cormorant garamond") return "cormorant";
  if (preset === "playfair display") return "playfair";
  if (preset === "noto sans jp") return "notoSansJp";
  if (preset === "noto serif jp") return "notoSerifJp";
  if (preset === "biz udpgothic" || preset === "biz ud gothic" || preset === "ud gothic") return "bizUdGothic";
  if (preset === "biz udpmincho" || preset === "biz ud mincho" || preset === "ud mincho") return "bizUdMincho";
  if (preset === "m plus rounded" || preset === "m plus rounded 1c") return "mPlusRounded";
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
window.normalizeThemeMode = normalizeThemeMode;
window.normalizePageThemeOverride = normalizePageThemeOverride;
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

function getVaultRecords() {
  const domains = Array.isArray(window.userDomains)
    ? window.userDomains
    : readStorageJSON(STORAGE_KEYS.domains, []);
  const pages = Array.isArray(window.userPages)
    ? window.userPages
    : readStorageJSON(STORAGE_KEYS.pagesRegistry, []);
  return [
    ...domains.map((domain) => ({
      ...domain,
      type: "domain",
      parent: "home",
      isScopeBoundary: true,
      recordKind: "space",
      canonicalId: ""
    })),
    ...pages.map((page) => {
      const record = { ...page, type: page.type || "page" };
      return {
        ...record,
        recordKind: getVaultRecordKind(record),
        canonicalId: normalizeVaultCanonicalId(record.canonicalId || record.canonicalPageId || record.duplicateOf || record.variantOf || "")
      };
    })
  ];
}

function getVaultRecordById(recordId = "") {
  const safeId = String(recordId || "").trim();
  if (!safeId) return null;
  return getVaultRecords().find((record) => record.id === safeId) || null;
}

function normalizeVaultAliases(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVaultScopeBoundary(record) {
  if (!record?.id) return false;
  if (record.type === "domain") return true;
  if (record.isScopeBoundary === true || record.definesScope === true) return true;
  if (record.isScopeBoundary === false || record.definesScope === false) return false;
  return record.containerType === "project";
}

function getVaultScopeId(recordId = "") {
  const safeId = String(recordId || "").trim();
  if (!safeId || safeId === "home" || (typeof SYSTEM_PAGES !== "undefined" && SYSTEM_PAGES[safeId])) {
    return "";
  }

  const records = new Map(getVaultRecords().map((record) => [record.id, record]));
  let current = records.get(safeId) || null;
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (isVaultScopeBoundary(current)) return current.id;
    const parentId = current.parent || "";
    if (!parentId || parentId === "home") return "";
    current = records.get(parentId) || null;
  }

  return "";
}

function getVaultTopLevelScopeId(recordId = "") {
  return getVaultScopeId(recordId);
}

function getVaultScopeLabel(scopeId = "") {
  const scope = getVaultRecordById(scopeId);
  return scope?.title || "";
}

function getVaultRecordPath(recordId = "") {
  const safeId = String(recordId || "").trim();
  if (!safeId) return [];
  const records = new Map(getVaultRecords().map((record) => [record.id, record]));
  const path = [];
  let current = records.get(safeId) || null;
  const visited = new Set();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    const parentId = current.parent || "";
    if (!parentId || parentId === "home") break;
    current = records.get(parentId) || null;
  }

  return path;
}

function getVaultRecordPathLabel(recordId = "", options = {}) {
  const path = getVaultRecordPath(recordId);
  const labels = path
    .filter((record) => !options.omitSelf || record.id !== recordId)
    .map((record) => record.title || "Untitled")
    .filter(Boolean);
  return labels.join(" / ");
}

function isVaultRecordInScope(recordOrId, scopeId = "") {
  const safeScopeId = String(scopeId || "").trim();
  if (!safeScopeId) return true;
  const recordId = typeof recordOrId === "string" ? recordOrId : recordOrId?.id;
  if (!recordId) return false;
  return recordId === safeScopeId || getVaultTopLevelScopeId(recordId) === safeScopeId;
}

function compareVaultScopedRecords(left, right, scopeId = "") {
  const safeScopeId = String(scopeId || "").trim();
  if (safeScopeId) {
    const leftScoped = isVaultRecordInScope(left, safeScopeId) ? 1 : 0;
    const rightScoped = isVaultRecordInScope(right, safeScopeId) ? 1 : 0;
    if (leftScoped !== rightScoped) return rightScoped - leftScoped;
  }

  const leftTitle = String(left?.title || "").trim();
  const rightTitle = String(right?.title || "").trim();
  return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base", numeric: true });
}

function normalizeVaultRecordKind(value = "", fallback = "record") {
  const safe = String(value || "").trim().toLowerCase();
  return ["space", "record", "note", "view", "database-row"].includes(safe) ? safe : fallback;
}

function getDefaultVaultRecordKind(record = {}) {
  if (record?.type === "domain") return "space";
  if (record?.containerType === "database-row") return "database-row";
  if (record?.containerType === "hub" || record?.containerType === "project") return "space";
  if (record?.containerType === "detail") return "record";
  if (record?.layout === "sheet") return "view";
  return "record";
}

function getVaultRecordKind(record = {}) {
  return normalizeVaultRecordKind(record?.recordKind || record?.kind || "", getDefaultVaultRecordKind(record));
}

function normalizeVaultCanonicalId(value = "") {
  return String(value || "").trim();
}

function getVaultCanonicalId(recordOrId) {
  const recordId = typeof recordOrId === "string" ? String(recordOrId || "").trim() : String(recordOrId?.id || "").trim();
  if (!recordId) return "";

  const records = new Map(getVaultRecords().map((record) => [record.id, record]));
  let current = records.get(recordId) || null;
  const visited = new Set();

  while (current?.id && !visited.has(current.id)) {
    visited.add(current.id);
    const nextId = normalizeVaultCanonicalId(current.canonicalId || current.canonicalPageId || current.duplicateOf || current.variantOf || "");
    if (!nextId || nextId === current.id || !records.has(nextId)) return current.id;
    current = records.get(nextId);
  }

  return recordId;
}

function getVaultCanonicalRecord(recordOrId) {
  const canonicalId = getVaultCanonicalId(recordOrId);
  return canonicalId ? getVaultRecordById(canonicalId) : null;
}

function isVaultCanonicalRecord(recordOrId) {
  const recordId = typeof recordOrId === "string" ? String(recordOrId || "").trim() : String(recordOrId?.id || "").trim();
  if (!recordId) return false;
  return getVaultCanonicalId(recordOrId) === recordId;
}

function normalizeVaultLookupTitle(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['\u2019]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getVaultTitleEditDistance(left = "", right = "") {
  const a = String(left || "");
  const b = String(right || "");
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    prev = next;
  }
  return prev[b.length];
}

function getVaultTitleMatchScore(inputTitle = "", candidateTitle = "") {
  const input = normalizeVaultLookupTitle(inputTitle);
  const candidate = normalizeVaultLookupTitle(candidateTitle);
  if (!input || !candidate) return 0;
  if (input === candidate) return 100;

  const longerLength = Math.max(input.length, candidate.length);
  if (longerLength < 8) return 0;

  const inputWords = input.split(" ").filter(Boolean);
  const candidateWords = candidate.split(" ").filter(Boolean);
  const inputWordSet = new Set(inputWords);
  const candidateWordSet = new Set(candidateWords);
  const sharedWords = [...inputWordSet].filter((word) => candidateWordSet.has(word)).length;
  const sharedCoverage = sharedWords / Math.max(1, Math.min(inputWordSet.size, candidateWordSet.size));
  const similarity = 1 - (getVaultTitleEditDistance(input, candidate) / longerLength);

  if (similarity >= 0.9 && sharedCoverage >= 0.5) return Math.round(similarity * 95);
  if (similarity >= 0.84 && sharedCoverage >= 0.75) return Math.round(similarity * 90);
  return 0;
}

function getVaultRecordMatchScore(query = "", record) {
  const titleScore = getVaultTitleMatchScore(query, record?.title || "");
  const aliases = normalizeVaultAliases(record?.aliases || record?.alias || "");
  const aliasScore = aliases.reduce((best, alias) => Math.max(best, getVaultTitleMatchScore(query, alias)), 0);
  return Math.max(titleScore, Math.max(0, aliasScore - 5));
}

function getVaultCreateMatchCandidates(options = {}) {
  const title = String(options.title || "").trim();
  if (!normalizeVaultLookupTitle(title)) return [];

  const type = options.type === "domain" ? "domain" : "page";
  const parentId = String(options.parentId || "").trim();
  const containerType = String(options.containerType || "").trim();
  const currentPageId = String(options.currentPageId || "").trim();
  const scopeId = String(options.scopeId || (currentPageId ? getVaultTopLevelScopeId(currentPageId) : "") || "").trim();
  const includeCurrentPage = options.includeCurrentPage !== false;
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 6;

  return getVaultRecords()
    .map((record) => ({ ...record, vaultMatchScore: getVaultRecordMatchScore(title, record) }))
    .filter((record) => record.vaultMatchScore > 0)
    .filter((record) => type === "domain" ? record.type === "domain" : record.type !== "domain")
    .filter((record) => type === "domain" || record.containerType !== "database-row")
    .filter((record) => {
      if (includeCurrentPage && currentPageId && record.id === currentPageId) return true;
      if (parentId && record.parent === parentId) return true;
      if (scopeId && isVaultRecordInScope(record, scopeId)) return true;
      return !parentId && !scopeId;
    })
    .sort((a, b) => {
      const aCurrent = includeCurrentPage && currentPageId && a.id === currentPageId ? 1 : 0;
      const bCurrent = includeCurrentPage && currentPageId && b.id === currentPageId ? 1 : 0;
      if (aCurrent !== bCurrent) return bCurrent - aCurrent;

      const aSameParent = parentId && a.parent === parentId ? 1 : 0;
      const bSameParent = parentId && b.parent === parentId ? 1 : 0;
      if (aSameParent !== bSameParent) return bSameParent - aSameParent;

      const aScoped = scopeId && isVaultRecordInScope(a, scopeId) ? 1 : 0;
      const bScoped = scopeId && isVaultRecordInScope(b, scopeId) ? 1 : 0;
      if (aScoped !== bScoped) return bScoped - aScoped;

      if (a.vaultMatchScore !== b.vaultMatchScore) return b.vaultMatchScore - a.vaultMatchScore;

      const aCanonical = isVaultCanonicalRecord(a) ? 1 : 0;
      const bCanonical = isVaultCanonicalRecord(b) ? 1 : 0;
      if (aCanonical !== bCanonical) return bCanonical - aCanonical;

      if (containerType) {
        const aSameType = (a.containerType || "page") === containerType ? 1 : 0;
        const bSameType = (b.containerType || "page") === containerType ? 1 : 0;
        if (aSameType !== bSameType) return bSameType - aSameType;
      }

      return compareVaultScopedRecords(a, b, scopeId);
    })
    .slice(0, limit);
}

function findExistingVaultPageForCreate(options = {}) {
  const candidate = getVaultCreateMatchCandidates({ ...options, limit: 1 })[0] || null;
  return getVaultCanonicalRecord(candidate) || candidate;
}

window.getVaultRecords = getVaultRecords;
window.getVaultRecordById = getVaultRecordById;
window.normalizeVaultAliases = normalizeVaultAliases;
window.isVaultScopeBoundary = isVaultScopeBoundary;
window.getVaultScopeId = getVaultScopeId;
window.getVaultTopLevelScopeId = getVaultTopLevelScopeId;
window.getVaultScopeLabel = getVaultScopeLabel;
window.getVaultRecordPath = getVaultRecordPath;
window.getVaultRecordPathLabel = getVaultRecordPathLabel;
window.isVaultRecordInScope = isVaultRecordInScope;
window.compareVaultScopedRecords = compareVaultScopedRecords;
window.normalizeVaultRecordKind = normalizeVaultRecordKind;
window.getDefaultVaultRecordKind = getDefaultVaultRecordKind;
window.getVaultRecordKind = getVaultRecordKind;
window.getVaultCanonicalId = getVaultCanonicalId;
window.getVaultCanonicalRecord = getVaultCanonicalRecord;
window.isVaultCanonicalRecord = isVaultCanonicalRecord;
window.normalizeVaultLookupTitle = normalizeVaultLookupTitle;
window.getVaultTitleMatchScore = getVaultTitleMatchScore;
window.getVaultRecordMatchScore = getVaultRecordMatchScore;
window.getVaultCreateMatchCandidates = getVaultCreateMatchCandidates;
window.findExistingVaultPageForCreate = findExistingVaultPageForCreate;

function updateLinkedCardTitlesEverywhere(pageId, newTitle) {
  const allBlocks = readAllPageBlocks();
  const changed = window.SanctumPageLifecycle.renameLinkedBlocks(
    allBlocks,
    pageId,
    newTitle,
    {
      getItems: getSerializedContainerItems,
      transformDirect: (b) => {
        const dims = getLinkedPageCardDimensions(newTitle, {
          type: b.type || "page",
          padding: b.padding || "",
          pageCardHideIcon: b.pageCardHideIcon || 0,
          pageCardView: b.pageCardView || "default",
          w: b.w || 0,
          h: b.h || 0
        });
        return { ...b, pageCardTitle: newTitle, w: dims.width, h: dims.height };
      }
    }
  );

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
  const result = window.SanctumPageLifecycle.renamePins(pinnedPages, pageId, newTitle);
  pinnedPages = result.pins;

  if (result.changed) {
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

function applyPageRenameEverywhere(pageId, newTitle, options = {}) {
  const page =
    userDomains.find((d) => d.id === pageId) ||
    userPages.find((p) => p.id === pageId);

  if (!page) return;

  window.SanctumPageLifecycle.renameRecord(
    userDomains.some((domain) => domain.id === pageId) ? userDomains : userPages,
    pageId,
    newTitle
  );
  saveSanctumRegistry();
  if (options.skipDatabaseSync !== true && typeof window.syncDatabaseRowTitleFromPage === "function") {
    window.syncDatabaseRowTitleFromPage(pageId);
  }
  if (typeof window.invalidateRelationshipGraphCache === "function") {
    window.invalidateRelationshipGraphCache();
  }

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
  if (typeof window.renderTabBar === "function") window.renderTabBar();
}
window.applyPageRenameEverywhere = applyPageRenameEverywhere;

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
  return window.SanctumPageLifecycle.collectDescendantPageIds(userPages, rootId);
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
  return window.SanctumPageLifecycle.mergeUniqueById(existing, incoming);
}

function snapshotTrashItem(rootId, kind = "page") {
  const targetIds = Array.from(new Set([rootId, ...collectDescendantPageIds(rootId)]));
  const rootDomain = kind === "domain" ? userDomains.find((d) => d.id === rootId) : null;
  const rootPage = kind !== "domain" ? userPages.find((p) => p.id === rootId) : null;
  if (!rootDomain && !rootPage) return null;

  const rootParentId = kind === "page" ? (rootPage?.parent || "home") : null;
  const itemCount = kind === "domain" ? targetIds.length + 1 : targetIds.length;

  const allBlocks = readAllPageBlocks();
  const lifecycleSnapshot = window.SanctumPageLifecycle.snapshotPageTree({
    pages: userPages,
    pinnedPages,
    bookmarks,
    pageBlocks: allBlocks
  }, rootId);
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
    pages: lifecycleSnapshot.pages,
    pinnedPages: lifecycleSnapshot.pinnedPages,
    bookmarks: lifecycleSnapshot.bookmarks,
    pageBlocks: lifecycleSnapshot.pageBlocks,
    linkedBlocksByHost: lifecycleSnapshot.linkedBlocksByHost,
    linkedItemsByHost: lifecycleSnapshot.linkedItemsByHost,
    documents: {},
    docSettings: {},
    pageSettings: {},
    stickers: {},
    threads: {},
    anchors: {},
    annotations: {}
  };

  targetIds.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(allDocs, id)) item.documents[id] = allDocs[id];
    if (Object.prototype.hasOwnProperty.call(docSettings, id)) item.docSettings[id] = docSettings[id];
    if (Object.prototype.hasOwnProperty.call(pageSettings, id)) item.pageSettings[id] = pageSettings[id];
    if (Object.prototype.hasOwnProperty.call(stickers, id)) item.stickers[id] = stickers[id];
    if (Object.prototype.hasOwnProperty.call(threads, id)) item.threads[id] = threads[id];
    if (Object.prototype.hasOwnProperty.call(anchors, id)) item.anchors[id] = anchors[id];
    if (Object.prototype.hasOwnProperty.call(legacyAnnotations, id)) item.annotations[id] = legacyAnnotations[id];
  });

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
  window.SanctumPageLifecycle.restoreBlockMap(allBlocks, item.pageBlocks || {});
  window.SanctumPageLifecycle.restoreBlockMap(allBlocks, item.linkedBlocksByHost || {}, {
    hasHost: hasRestorableHost
  });
  window.SanctumPageLifecycle.restoreLinkedItems(allBlocks, item.linkedItemsByHost || {}, {
    hasHost: hasRestorableHost
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

  const allBlocks = readAllPageBlocks();
  const deleted = window.SanctumPageLifecycle.removePagesAndLinkedBlocks({
    pages: userPages,
    pinnedPages,
    bookmarks,
    pageBlocks: allBlocks
  }, ids);
  userPages = deleted.pages;
  pinnedPages = deleted.pinnedPages;
  bookmarks = deleted.bookmarks;
  writeAllPageBlocks(deleted.pageBlocks);

  const allDocs = readAllDocuments();
  ids.forEach((id) => {
    delete allDocs[id];
  });
  writeAllDocuments(allDocs);

  const journals = readStorageJSON(STORAGE_KEYS.journals, {});
  ids.forEach((id) => {
    delete journals[id];
  });
  writeStorageJSON(STORAGE_KEYS.journals, journals);

  const docSettings = readStorageJSON(STORAGE_KEYS.docSettings, {});
  ids.forEach((id) => delete docSettings[id]);
  writeStorageJSON(STORAGE_KEYS.docSettings, docSettings);

  const pageDatabases = readStorageJSON(STORAGE_KEYS.pageDatabases, {});
  ids.forEach((id) => delete pageDatabases[id]);
  writeStorageJSON(STORAGE_KEYS.pageDatabases, pageDatabases);

  const legacyCalendarDatabases = readStorageJSON(STORAGE_KEYS.legacyCalendarDatabases, {});
  ids.forEach((id) => delete legacyCalendarDatabases[id]);
  writeStorageJSON(STORAGE_KEYS.legacyCalendarDatabases, legacyCalendarDatabases);

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
  if (typeof window.syncTabsWithRegistry === "function") window.syncTabsWithRegistry(ids);
}

function deleteDomainTree(domainId) {
  const childPageIds = collectDescendantPageIds(domainId);

  userDomains = userDomains.filter((d) => d.id !== domainId);
  pinnedPages = pinnedPages.filter((p) => p.id !== domainId);
  bookmarks = bookmarks.filter((id) => id !== domainId);

  deletePagesAndStoredData(childPageIds);

  const allBlocks = readAllPageBlocks();
  const deletedDomainData = window.SanctumPageLifecycle.removePagesAndLinkedBlocks({
    pages: userPages,
    pinnedPages,
    bookmarks,
    pageBlocks: allBlocks
  }, [domainId]);
  writeAllPageBlocks(deletedDomainData.pageBlocks);

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
  if (typeof window.syncTabsWithRegistry === "function") {
    window.syncTabsWithRegistry([domainId, ...childPageIds]);
  }
}

function deleteSinglePageTree(pageId) {
  const childPageIds = collectDescendantPageIds(pageId);
  deletePagesAndStoredData([pageId, ...childPageIds]);
}
