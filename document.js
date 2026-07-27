// == Document Editor ==

let docPageId = null;
let docData = null;
let docSections = [];
let activeSectionIndex = 0;
let docSidebarVisible = true;
let slashMenuActive = false;
let inspectorOpen = false;
let docViewMode = "edit";
let activeInlineSuggestionId = null;

function makeInlineSuggestionId() {
  return `inline-suggest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DOC_DEFAULT_UI_STATE = {
  editorOpen: false,
  mode: "edit",           // edit | view | annotate
  sectionsOpen: true,
  insertOpen: false,
  inspectorOpen: false,
  sidebarOpen: false,
  pinOpen: false,
  activeTransient: null
};

let docUIState = { ...DOC_DEFAULT_UI_STATE };

function applyDocUIAliases() {
  docSidebarVisible = !!docUIState.sectionsOpen;
  inspectorOpen = !!docUIState.inspectorOpen;
  docViewMode = docUIState.mode || "edit";
}

function getDocUIState() {
  return { ...docUIState };
}

function setDocUIState(patch = {}) {
  docUIState = { ...docUIState, ...patch };
  applyDocUIAliases();
  syncDocLayoutState();
  syncDocViewModeUI();
}

function resetDocUIState() {
  docUIState = {
    ...DOC_DEFAULT_UI_STATE,
    sidebarOpen: !!docUIState.sidebarOpen,
    pinOpen: !!docUIState.pinOpen
  };
  applyDocUIAliases();
  syncDocLayoutState();
  syncDocViewModeUI();
}

let savedDocAnnotationSelection = null;
const DOC_ANNOTATION_SAVED_SELECTION_TTL_MS = 6000;
const DOC_ANNOTATION_REPEAT_GUARD_MS = 1200;

function clearSavedDocAnnotationSelection() {
  savedDocAnnotationSelection = null;
}

function saveDocAnnotationSelection(range = null) {
  const nextRange = range || getDocSelectionRangeInsideContent();
  if (!nextRange || nextRange.collapsed || !isRangeInsideDocContent(nextRange)) return false;

  savedDocAnnotationSelection = {
    pageId: docPageId,
    sectionIndex: activeSectionIndex,
    range: nextRange.cloneRange(),
    capturedAt: Date.now(),
    lastAppliedTool: "",
    lastAppliedAt: 0,
  };
  return true;
}

function markSavedDocAnnotationSelectionApplied(tool = "") {
  if (!savedDocAnnotationSelection) return;
  if (savedDocAnnotationSelection.pageId !== docPageId) return;
  if (savedDocAnnotationSelection.sectionIndex !== activeSectionIndex) return;

  savedDocAnnotationSelection.lastAppliedTool = typeof tool === "string" ? tool : "";
  savedDocAnnotationSelection.lastAppliedAt = Date.now();
}

function getSavedDocAnnotationSelection(options = {}) {
  const { requestedTool = "" } = options;
  if (!savedDocAnnotationSelection) return null;
  if (savedDocAnnotationSelection.pageId !== docPageId) return null;
  if (savedDocAnnotationSelection.sectionIndex !== activeSectionIndex) return null;
  if (Date.now() - (savedDocAnnotationSelection.capturedAt || 0) > DOC_ANNOTATION_SAVED_SELECTION_TTL_MS) {
    clearSavedDocAnnotationSelection();
    return null;
  }
  if (
    requestedTool
    && requestedTool === savedDocAnnotationSelection.lastAppliedTool
    && Date.now() - (savedDocAnnotationSelection.lastAppliedAt || 0) < DOC_ANNOTATION_REPEAT_GUARD_MS
  ) {
    return null;
  }

  const range = savedDocAnnotationSelection.range;
  if (!range || range.collapsed || !isRangeInsideDocContent(range)) return null;

  return range.cloneRange();
}

function getDocAnnotationSelectionRange(options = {}) {
  const { allowSaved = true, requestedTool = "" } = options;
  const liveRange = getDocSelectionRangeInsideContent();

  if (liveRange) {
    saveDocAnnotationSelection(liveRange);
    return liveRange.cloneRange();
  }

  if (!allowSaved) return null;
  return getSavedDocAnnotationSelection({ requestedTool });
}

window.getDocUIState = getDocUIState;
window.setDocUIState = setDocUIState;
window.resetDocUIState = resetDocUIState;

function closeDocTransientUI(except = null) {
  const keep = new Set(
    Array.isArray(except) ? except.filter(Boolean) : (except ? [except] : [])
  );

  if (!keep.has("slash")) {
    closeSlashMenu();
  }

  if (!keep.has("listMenu")) {
    document.getElementById("docListMenu")?.classList.remove("open");
  }

  if (!keep.has("formatMenu")) {
    document.getElementById("docFormatMenu")?.classList.remove("open");
    document.getElementById("docStyleKitSubmenu")?.classList.remove("open");
    document.getElementById("docPagePresetSubmenu")?.classList.remove("open");
  }

  if (!keep.has("highlightDropdown") && !keep.has("textColorDropdown")) {
    closeDocColorPicker();
  }

  if (!keep.has("marginPanel")) {
    document.getElementById("docMarginPanel")?.classList.remove("open");
  }

  if (!keep.has("findPanel")) {
    document.getElementById("docFindPanel")?.classList.remove("open");
  }

  if (!keep.has("statsPanel")) {
    document.getElementById("docStatsPanel")?.classList.remove("open");
  }

  if (!keep.has("noteCard")) {
    document.getElementById("docNoteCard")?.remove();
  }

  if (!keep.has("threadPicker")) {
    document.getElementById("threadPicker")?.classList.remove("open");
  }
}

function setActiveDocTransient(name = null) {
  closeDocTransientUI(name);
  setDocUIState({ activeTransient: name || null });
}

function closeDocPanels(options = {}) {
  const {
    closeInsert = false,
    closeInspector = false,
    closeSections = false,
    closeTransient = true,
    blurContent = false
  } = options;

  const patch = {};

  if (closeInsert) patch.insertOpen = false;
  if (closeInspector) patch.inspectorOpen = false;
  if (closeSections) patch.sectionsOpen = false;

  if (Object.keys(patch).length) {
    setDocUIState(patch);
  }

  if (closeInsert && typeof syncDocInsertPanelState === "function") {
    syncDocInsertPanelState();
  }

  if (closeInspector) {
    document.getElementById("docInspector")?.classList.remove("open");
  }

  if (closeTransient) {
    closeDocTransientUI();
    setDocUIState({ activeTransient: null });
  }

  if (blurContent) {
    document.getElementById("docContent")?.blur();
  }
}

window.closeDocTransientUI = closeDocTransientUI;
window.setActiveDocTransient = setActiveDocTransient;
window.closeDocPanels = closeDocPanels;

function handleDocMajorOverlayOpen(type) {
  if (type === "sidebar") {
    closeDocPanels({
      closeInsert: true,
      closeInspector: true,
      closeSections: false,
      closeTransient: true,
      blurContent: true
    });
    setDocUIState({
      sidebarOpen: true,
      pinOpen: false
    });
    return;
  }

  if (type === "pin") {
    closeDocPanels({
      closeInsert: true,
      closeInspector: true,
      closeSections: true,
      closeTransient: true,
      blurContent: true
    });
    setDocUIState({
      pinOpen: true,
      sidebarOpen: false
    });
    return;
  }

  if (type === "topbarMenu") {
    closeDocTransientUI();
    document.getElementById("docContent")?.blur();
    setDocUIState({ activeTransient: null });
  }
}

window.handleDocMajorOverlayOpen = handleDocMajorOverlayOpen;

function getCurrentDocMode() {
  return getDocUIState().mode || "edit";
}

function isDocEditMode() {
  return getCurrentDocMode() === "edit";
}

function isDocViewMode() {
  return getCurrentDocMode() === "view";
}

function isDocAnnotateMode() {
  return getCurrentDocMode() === "annotate";
}

function canOpenDocInsert() {
  return isDocEditMode();
}

function canOpenDocInspector() {
  const mode = getCurrentDocMode();
  return mode === "edit" || mode === "annotate";
}

function canUseDocFormattingTools() {
  return isDocEditMode();
}

window.getCurrentDocMode = getCurrentDocMode;
window.isDocEditMode = isDocEditMode;
window.isDocViewMode = isDocViewMode;
window.isDocAnnotateMode = isDocAnnotateMode;
window.canOpenDocInsert = canOpenDocInsert;
window.canOpenDocInspector = canOpenDocInspector;
window.canUseDocFormattingTools = canUseDocFormattingTools;

function syncDocLayoutState() {
  const editor = document.getElementById("docEditor");
  if (!editor) return;

  const wasSidebar = editor.classList.contains("sidebar-visible");
  const wasInspector = editor.classList.contains("inspector-open");
  const nowSidebar = !!docUIState.sectionsOpen;
  const nowInspector = !!docUIState.inspectorOpen;

  editor.classList.toggle("sidebar-visible", nowSidebar);
  editor.classList.toggle("inspector-open", nowInspector);

  const docSidebar = document.getElementById("docSidebar");
  if (docSidebar) {
    docSidebar.classList.toggle("hidden", !nowSidebar);
  }

  syncDocToolbarHeight();

  // Only rebuild pages when the layout actually changed (sidebar/inspector toggled)
  if (wasSidebar !== nowSidebar || wasInspector !== nowInspector) {
    requestAnimationFrame(() => syncDocPages({ preserveSelection: true }));
  }
}

let docToolbarResizeObserver = null;
let _docResizeSyncTimer = null;

function syncDocToolbarHeight() {
  const editor = document.getElementById("docEditor");
  const toolbar = document.getElementById("docToolbar");
  if (!editor || !toolbar) return;
  const measured = Math.max(46, Math.ceil(toolbar.getBoundingClientRect().height));
  editor.style.setProperty("--doc-toolbar-height", `${measured}px`);
}

function ensureDocToolbarHeightSync() {
  const toolbar = document.getElementById("docToolbar");
  if (!toolbar || typeof ResizeObserver !== "function") {
    syncDocToolbarHeight();
    return;
  }

  if (docToolbarResizeObserver) return;

  docToolbarResizeObserver = new ResizeObserver(() => {
    syncDocToolbarHeight();
  });
  docToolbarResizeObserver.observe(toolbar);
  syncDocToolbarHeight();
}

window.addEventListener("resize", syncDocToolbarHeight);
window.addEventListener("resize", () => {
  if (_docResizeSyncTimer) clearTimeout(_docResizeSyncTimer);
  _docResizeSyncTimer = setTimeout(() => {
    _docResizeSyncTimer = null;
    requestAnimationFrame(() => syncDocPages({ preserveSelection: true }));
  }, 180);
});

function syncDocViewModeUI() {
  const editor = document.getElementById("docEditor");
  const toolbar = document.getElementById("docToolbar");
  const inspector = document.getElementById("docInspector");
  const view = docUIState.mode || "edit";

  if (editor) {
    editor.dataset.docMode = view;
    editor.classList.toggle("mode-edit", view === "edit");
    editor.classList.toggle("mode-view", view === "view");
    editor.classList.toggle("mode-annotate", view === "annotate");
  }

  document.querySelectorAll(".doc-view-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });

  const allContents = document.querySelectorAll(".doc-page .doc-content");
  const allAnnotationLayers = document.querySelectorAll(".doc-page .doc-annotation-layer");

  if (view === "edit") {
    allContents.forEach((content) => content.contentEditable = "true");
    allAnnotationLayers.forEach((layer) => layer.classList.remove("active"));

    if (toolbar) {
      toolbar.style.display = "";
      toolbar.style.pointerEvents = "auto";
      toolbar.style.opacity = "1";
    }

    const sidebar = document.getElementById("docSidebar");
    if (sidebar) sidebar.style.display = "";

    inspector?.classList.toggle("view-only", false);
    annotationMode = false;
    hideAnnotationToolbar();

    if (typeof window.closeDocAnnotateDock === "function") {
      window.closeDocAnnotateDock();
    }
  }

  if (view === "view") {
    allContents.forEach((content) => content.contentEditable = "false");
    allAnnotationLayers.forEach((layer) => layer.classList.remove("active"));

    if (toolbar) {
      toolbar.style.display = "none";
    }

    const sidebar = document.getElementById("docSidebar");
    if (sidebar) sidebar.style.display = "none";

    inspector?.classList.toggle("view-only", true);
    annotationMode = false;
    hideAnnotationToolbar();

    if (typeof window.closeDocAnnotateDock === "function") {
      window.closeDocAnnotateDock();
    }
  }

  if (view === "annotate") {
    allContents.forEach((content) => content.contentEditable = "true");
    allAnnotationLayers.forEach((layer) => layer.classList.add("active"));

    if (toolbar) {
      toolbar.style.display = "";
      toolbar.style.pointerEvents = "auto";
      toolbar.style.opacity = "1";
    }

    const sidebar = document.getElementById("docSidebar");
    if (sidebar) sidebar.style.display = "";

    inspector?.classList.toggle("view-only", false);
    annotationMode = true;
    hideAnnotationToolbar();

    if (typeof window.openDocAnnotateDock === "function") {
      window.openDocAnnotateDock();
    }
  }

  const activeContent = document.getElementById("docContent");
  if (activeContent) {
    const activePage = activeContent.closest(".doc-page");
    if (activePage) setActiveDocPage(activePage);
  }

  renderSuggestionTray();
  renderSectionAnnotations();
}

applyDocUIAliases();

const DOC_STORAGE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.documents) || "sanctum_documents";

// ===== LEXICON =====
let lexiconData = [];
let activeLexShelf = "all";
let activeLexiconGroupId = null;
let activeLexiconSectionId = null;
let activeLexiconEntryId = null;
let activeLexiconView = "all"; // "all" | "favorites" | "recent"
let lexiconInsertMode = "insert"; // "insert" | "replace"
let lexiconLookupSelectionRange = null;
let lexiconComposerMode = null; // "group" | "section" | "entry" | "edit-entry"
let editingLexiconEntry = null;

function normalizeLexiconEntry(entry = {}) {
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : crypto.randomUUID(),
    text: typeof entry.text === "string" ? entry.text.trim() : "",
    createdAt: Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : Date.now(),
    lastUsedAt: Number.isFinite(Number(entry.lastUsedAt)) ? Number(entry.lastUsedAt) : null,
    useCount: Number.isFinite(Number(entry.useCount)) ? Number(entry.useCount) : 0,
    favorite: !!entry.favorite
  };
}

function normalizeLexiconSection(section = {}) {
  return {
    id: typeof section.id === "string" && section.id ? section.id : crypto.randomUUID(),
    title: typeof section.title === "string" ? section.title.trim() : "",
    type: typeof section.type === "string" && section.type ? section.type : "description",
    entries: Array.isArray(section.entries)
      ? section.entries.map(normalizeLexiconEntry).filter((e) => e.text)
      : []
  };
}

function normalizeLexiconGroup(group = {}) {
  return {
    id: typeof group.id === "string" && group.id ? group.id : crypto.randomUUID(),
    shelf: typeof group.shelf === "string" && group.shelf ? group.shelf : "general",
    title: typeof group.title === "string" ? group.title.trim() : "",
    sections: Array.isArray(group.sections)
      ? group.sections.map(normalizeLexiconSection).filter((s) => s.title)
      : []
  };
}

function loadLexicon() {
  try {
    const raw = JSON.parse(localStorage.getItem("sanctumLexicon") || "[]");
    lexiconData = Array.isArray(raw)
      ? raw.map(normalizeLexiconGroup).filter((g) => g.title)
      : [];
  } catch {
    lexiconData = [];
  }

  syncDocToolbarHeight();
}

function saveLexicon() {
  localStorage.setItem("sanctumLexicon", JSON.stringify(lexiconData.map(normalizeLexiconGroup)));
}

function getLexiconGroupById(id) {
  return lexiconData.find((g) => g.id === id) || null;
}

function getLexiconSectionById(groupId, sectionId) {
  const group = getLexiconGroupById(groupId);
  if (!group) return null;
  return group.sections.find((s) => s.id === sectionId) || null;
}

function getLexiconEntryById(groupId, sectionId, entryId) {
  const section = getLexiconSectionById(groupId, sectionId);
  if (!section) return null;
  return section.entries.find((e) => e.id === entryId) || null;
}

function createLexiconGroup({ shelf = "general", title = "" }) {
  const name = String(title || "").trim();
  if (!name) return null;

  const existing = lexiconData.find((g) => g.title.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const group = normalizeLexiconGroup({
    id: crypto.randomUUID(),
    shelf,
    title: name,
    sections: []
  });

  lexiconData.unshift(group);
  saveLexicon();
  return group;
}

function createLexiconSection({ groupId, title = "", type = "description" }) {
  const group = getLexiconGroupById(groupId);
  if (!group) return null;

  const name = String(title || "").trim();
  if (!name) return null;

  const existing = group.sections.find((s) => s.title.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const section = normalizeLexiconSection({
    id: crypto.randomUUID(),
    title: name,
    type,
    entries: []
  });

  group.sections.push(section);
  saveLexicon();
  return section;
}

function createLexiconEntry({ groupId, sectionId, text = "" }) {
  const section = getLexiconSectionById(groupId, sectionId);
  if (!section) return null;

  const clean = String(text || "").trim();
  if (!clean) return null;

  const entry = normalizeLexiconEntry({
    id: crypto.randomUUID(),
    text: clean,
    favorite: false
  });

  section.entries.unshift(entry);
  saveLexicon();
  return entry;
}

function updateLexiconEntry({ groupId, sectionId, entryId, text = "" }) {
  const entry = getLexiconEntryById(groupId, sectionId, entryId);
  if (!entry) return null;

  entry.text = String(text || "").trim();
  saveLexicon();
  return entry;
}

function bumpLexiconEntryUsage(groupId, sectionId, entryId) {
  const entry = getLexiconEntryById(groupId, sectionId, entryId);
  if (!entry) return;

  entry.useCount = (entry.useCount || 0) + 1;
  entry.lastUsedAt = Date.now();
  saveLexicon();
}

function makeDocSectionId(index = 0) {
  return `section-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDocMeta(meta = {}) {
  return {
    version: Number.isFinite(Number(meta.version)) ? Number(meta.version) : 1,
    title: typeof meta.title === "string" ? meta.title : "",
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : "",
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : "",
    defaultMode: ["edit", "view", "annotate"].includes(meta.defaultMode) ? meta.defaultMode : "edit",
    headerHTML: typeof meta.headerHTML === "string" ? meta.headerHTML : "",
    footerHTML: typeof meta.footerHTML === "string" ? meta.footerHTML : "",
    stats: normalizeDocStats(meta.stats || {})
  };
}

function normalizeDocStats(stats = {}) {
  const dailyHistory = Array.isArray(stats.dailyHistory)
    ? stats.dailyHistory
        .map((entry) => ({
          date: typeof entry?.date === "string" ? entry.date : "",
          words: Number.isFinite(Number(entry?.words)) ? Math.max(0, Number(entry.words)) : 0
        }))
        .filter((entry) => entry.date)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-365)
    : [];

  return {
    totalWords: Number.isFinite(Number(stats.totalWords)) ? Number(stats.totalWords) : 0,
    dailyGoal: Number.isFinite(Number(stats.dailyGoal)) ? Number(stats.dailyGoal) : 500,
    overallGoal: Number.isFinite(Number(stats.overallGoal)) ? Number(stats.overallGoal) : 5000,
    todayWords: Number.isFinite(Number(stats.todayWords)) ? Number(stats.todayWords) : 0,
    lastTrackedDate: typeof stats.lastTrackedDate === "string" ? stats.lastTrackedDate : "",
    sessionStartWords: Number.isFinite(Number(stats.sessionStartWords)) ? Number(stats.sessionStartWords) : 0,
    dailyHistory
  };
}

function upsertDailyHistory(history = [], date, amount = 0) {
  const safe = Array.isArray(history) ? [...history] : [];
  const idx = safe.findIndex((entry) => entry.date === date);

  if (idx >= 0) {
    safe[idx] = {
      ...safe[idx],
      words: Math.max(0, Number(safe[idx].words || 0) + amount)
    };
  } else {
    safe.push({
      date,
      words: Math.max(0, Number(amount) || 0)
    });
  }

  return safe
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
}

function getRecentDailyHistory(stats, days = 7) {
  const map = new Map(
    (stats?.dailyHistory || []).map((entry) => [entry.date, Math.max(0, Number(entry.words) || 0)])
  );

  const out = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({
      date: iso,
      words: map.get(iso) || 0
    });
  }

  return out;
}

function computeWritingStreak(stats) {
  const map = new Map(
    (stats?.dailyHistory || []).map((entry) => [entry.date, Math.max(0, Number(entry.words) || 0)])
  );

  let streak = 0;
  const today = new Date();

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const words = map.get(iso) || 0;

    if (words > 0) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function formatStatsShortDate(isoDate) {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function getHistoryEntriesForRange(stats, days = 30) {
  const count = Math.max(1, Number(days) || 30);
  return getRecentDailyHistory(stats, count);
}

function computeLongestWritingStreak(stats) {
  const entries = Array.isArray(stats?.dailyHistory)
    ? stats.dailyHistory
        .filter((entry) => Math.max(0, Number(entry.words) || 0) > 0 && entry.date)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  if (!entries.length) return 0;

  let longest = 1;
  let current = 1;

  for (let i = 1; i < entries.length; i++) {
    const prev = new Date(`${entries[i - 1].date}T00:00:00`);
    const curr = new Date(`${entries[i].date}T00:00:00`);
    const diffDays = Math.round((curr - prev) / 86400000);

    if (diffDays === 1) {
      current += 1;
    } else if (diffDays > 1) {
      current = 1;
    }

    longest = Math.max(longest, current);
  }

  return longest;
}

function computeHistorySummary(entries = []) {
  const safe = Array.isArray(entries) ? entries : [];
  const activeEntries = safe.filter((entry) => (Number(entry.words) || 0) > 0);
  const totalWords = safe.reduce((sum, entry) => sum + Math.max(0, Number(entry.words) || 0), 0);
  const activeDays = activeEntries.length;

  const bestDay = activeEntries.reduce((best, entry) => {
    if (!best || entry.words > best.words) return entry;
    return best;
  }, null);

  return {
    totalWords,
    activeDays,
    bestDay,
    avgPerDay: safe.length ? Math.round(totalWords / safe.length) : 0,
    avgActiveDay: activeDays ? Math.round(totalWords / activeDays) : 0
  };
}

function groupHistoryByMonth(entries = [], monthCount = 6) {
  const totals = new Map();

  entries.forEach((entry) => {
    if (!entry?.date) return;
    const key = entry.date.slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + Math.max(0, Number(entry.words) || 0));
  });

  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-monthCount)
    .map(([month, words]) => ({ month, words }));
}

function formatStatsMonth(monthKey) {
  if (!monthKey) return "";
  const d = new Date(`${monthKey}-01T00:00:00`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    year: "numeric"
  });
}

function normalizeDocViewPrefs(viewPrefs = {}) {
  return {
    showAnnotations: viewPrefs.showAnnotations === true,
    visibleAnnotationLayers: Array.isArray(viewPrefs.visibleAnnotationLayers)
      ? viewPrefs.visibleAnnotationLayers.filter(v => typeof v === "string" && v.trim())
      : [],
  };
}

function normalizeDocAnnotationData(annotation = {}) {
  const layers = annotation && typeof annotation.layers === "object" && annotation.layers !== null
    ? annotation.layers
    : {};

  return {
    layers: {
      notes: layers.notes !== false,
      threads: layers.threads !== false,
      marks: layers.marks !== false,
      stickies: layers.stickies !== false,
    }
  };
}

function normalizeDocSuggestedChange(change = {}) {
  return {
    id: typeof change.id === "string" && change.id
      ? change.id
      : `sugg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: typeof change.kind === "string" ? change.kind : "replace",
    beforeHtml: typeof change.beforeHtml === "string" ? change.beforeHtml : "",
    afterHtml: typeof change.afterHtml === "string" ? change.afterHtml : "",
    createdAt: Number.isFinite(Number(change.createdAt)) ? Number(change.createdAt) : Date.now(),
    status: ["pending", "accepted", "declined"].includes(change.status) ? change.status : "pending"
  };
}

function makeAnnotationItemId(prefix = "ann") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSectionAnnotationItem(item = {}) {
  if (!item || typeof item !== "object") return null;

  const type = ["highlight", "underline", "sticky", "suggestion"].includes(item.type)
    ? item.type
    : "highlight";
  const hasLegacyGeometry = (Array.isArray(item.rects) && item.rects.length)
    || (item.moveFrom && typeof item.moveFrom === "object")
    || (item.moveTo && typeof item.moveTo === "object");

  return {
    id: typeof item.id === "string" && item.id.trim()
      ? item.id
      : makeAnnotationItemId(type),
    type,
    color: typeof item.color === "string" && item.color.trim()
      ? item.color
      : "#ffff00",

    // suggestion fields
    action: typeof item.action === "string" && item.action.trim()
      ? item.action
      : "",

    status: ["pending", "accepted", "declined"].includes(item.status)
      ? item.status
      : "pending",

    originalText: typeof item.originalText === "string"
      ? item.originalText
      : "",

    suggestedText: typeof item.suggestedText === "string"
      ? item.suggestedText
      : "",

    noteLabel: typeof item.noteLabel === "string"
      ? item.noteLabel
      : "",

    tool: typeof item.tool === "string" ? item.tool : "",
    renderStyle: typeof item.renderStyle === "string" ? item.renderStyle : "",
    targetText: typeof item.targetText === "string" ? item.targetText : "",
    toText: typeof item.toText === "string" ? item.toText : "",
    coordSpace: item.coordSpace === "annotation-layer"
      ? "annotation-layer"
      : hasLegacyGeometry
        ? "doc-page"
        : "",

    // range-based marks
    rects: Array.isArray(item.rects)
      ? item.rects
          .map((rect) => {
            if (!rect || typeof rect !== "object") return null;
            const left = Number(rect.left);
            const top = Number(rect.top);
            const width = Number(rect.width);
            const height = Number(rect.height);

            if (![left, top, width, height].every(Number.isFinite)) return null;

            return { left, top, width, height };
          })
          .filter(Boolean)
      : [],
    moveFrom: item.moveFrom && typeof item.moveFrom === "object"
      && Number.isFinite(Number(item.moveFrom.x))
      && Number.isFinite(Number(item.moveFrom.y))
      ? {
          x: Number(item.moveFrom.x),
          y: Number(item.moveFrom.y)
        }
      : null,
    moveTo: item.moveTo && typeof item.moveTo === "object"
      && Number.isFinite(Number(item.moveTo.x))
      && Number.isFinite(Number(item.moveTo.y))
      ? {
          x: Number(item.moveTo.x),
          y: Number(item.moveTo.y)
        }
      : null,

    // sticky-note style data
    left: Number.isFinite(Number(item.left)) ? Number(item.left) : 0,
    top: Number.isFinite(Number(item.top)) ? Number(item.top) : 0,
    text: typeof item.text === "string" ? item.text : ""
  };
}

function getActiveSection() {
  return docSections[activeSectionIndex] || null;
}

function getActiveSectionAnnotations() {
  const section = getActiveSection();
  if (!section) return [];
  if (!Array.isArray(section.annotations)) section.annotations = [];
  return section.annotations;
}

function getDocSectionAnnotationCount() {
  return getActiveSectionAnnotations().length;
}

function setActiveSectionAnnotations(items = []) {
  const section = getActiveSection();
  if (!section) return;

  section.annotations = Array.isArray(items)
    ? items.map(normalizeSectionAnnotationItem).filter(Boolean)
    : [];

  persistActiveDocData();
  syncExternalDocAnnotateDockButtons();
}

function pushActiveSectionAnnotation(item) {
  const section = getActiveSection();
  if (!section) return null;

  if (!Array.isArray(section.annotations)) section.annotations = [];

  const normalized = normalizeSectionAnnotationItem(item);
  if (!normalized) return null;

  section.annotations.push(normalized);
  persistActiveDocData();
  syncExternalDocAnnotateDockButtons();
  return normalized;
}

function clearActiveSectionAnnotations() {
  setActiveSectionAnnotations([]);
}

function getDocSelectionRangeInsideContent() {
  const content = document.getElementById("docContent");
  const sel = window.getSelection();

  if (!content || !sel || !sel.rangeCount || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer)) return null;

  return range;
}

function getDocSelectionTextInsideContent() {
  const range = getDocSelectionRangeInsideContent();
  if (!range) return "";
  return range.toString().trim();
}

// Walk the text nodes inside a range and return per-character-block rects
// relative to relativeEl.  Unlike range.getClientRects(), this never returns
// full-block-width rects when the range endpoint is an element node (e.g. after
// Ctrl+A which creates a container-level range).
function getTextTightRects(range, relativeEl) {
  if (!range || !relativeEl) return [];
  const relRect = relativeEl.getBoundingClientRect();
  const rects = [];
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    // range.intersectsNode is the fast check; fall back to manual overlap
    let intersects = false;
    try { intersects = range.intersectsNode(node); } catch { intersects = true; }
    if (!intersects) continue;

    const startOffset = node === range.startContainer ? range.startOffset : 0;
    const endOffset   = node === range.endContainer   ? range.endOffset   : node.textContent.length;
    if (startOffset >= endOffset) continue;

    const nr = document.createRange();
    nr.setStart(node, startOffset);
    nr.setEnd(node, endOffset);
    Array.from(nr.getClientRects()).forEach((rect) => {
      if (rect.width > 0 && rect.height > 0) {
        rects.push({
          left:   rect.left   - relRect.left,
          top:    rect.top    - relRect.top,
          width:  rect.width,
          height: rect.height,
        });
      }
    });
  }
  return rects;
}

function getRangeClientRectsRelativeToDocPage(range) {
  const relativeEl = document.getElementById("docAnnotationLayer")
    || document.querySelector(".doc-page-body")
    || document.querySelector(".doc-page");
  if (!relativeEl || !range) return [];
  return getTextTightRects(range, relativeEl);
}

let pendingMoveSource = null;

function getPrimaryRectFromRects(rects = []) {
  if (!Array.isArray(rects) || !rects.length) return null;
  return rects[0];
}

function getRangeAnchorPoint(rects = [], mode = "start") {
  const rect = mode === "end"
    ? rects[rects.length - 1]
    : rects[0];

  if (!rect) return null;

  return {
    x: mode === "end" ? rect.left + rect.width : rect.left,
    y: rect.top + rect.height / 2
  };
}

function doRectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return (
    a.left < (b.left + b.width + pad) &&
    (a.left + a.width + pad) > b.left &&
    a.top < (b.top + b.height + pad) &&
    (a.top + a.height + pad) > b.top
  );
}

function annotationOverlapsRects(annotation, rects = []) {
  if (!annotation || !Array.isArray(annotation.rects) || !annotation.rects.length) return false;
  if (!Array.isArray(rects) || !rects.length) return false;
  return annotation.rects.some((ar) => rects.some((r) => doRectsOverlap(ar, r, 1)));
}

function mergeRectsForInlineMark(rects = []) {
  const input = Array.isArray(rects) ? rects.filter(Boolean) : [];
  if (!input.length) return [];

  const sorted = [...input].sort((a, b) => {
    const dy = a.top - b.top;
    if (Math.abs(dy) > 3) return dy;
    return a.left - b.left;
  });

  const merged = [];
  sorted.forEach((r) => {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...r });
      return;
    }

    const sameLine = Math.abs(last.top - r.top) <= 3 && Math.abs(last.height - r.height) <= 4;
    const touch = r.left <= (last.left + last.width + 6);

    if (sameLine && touch) {
      const right = Math.max(last.left + last.width, r.left + r.width);
      last.left = Math.min(last.left, r.left);
      last.top = Math.min(last.top, r.top);
      last.width = right - last.left;
      last.height = Math.max(last.height, r.height);
      return;
    }

    merged.push({ ...r });
  });

  return merged;
}

function subtractMaskRectsFromRect(rect, maskRects = []) {
  if (!rect) return [];
  if (!Array.isArray(maskRects) || !maskRects.length) return [{ ...rect }];

  let segments = [{ left: rect.left, right: rect.left + rect.width }];

  maskRects.forEach((mask) => {
    if (!doRectsOverlap(rect, mask, 0)) return;

    const maskLeft = mask.left;
    const maskRight = mask.left + mask.width;

    segments = segments.flatMap((seg) => {
      if (maskRight <= seg.left || maskLeft >= seg.right) return [seg];

      const next = [];
      if (maskLeft > seg.left) {
        next.push({ left: seg.left, right: Math.min(maskLeft, seg.right) });
      }
      if (maskRight < seg.right) {
        next.push({ left: Math.max(maskRight, seg.left), right: seg.right });
      }
      return next;
    });
  });

  return segments
    .filter((seg) => (seg.right - seg.left) > 2)
    .map((seg) => ({
      left: seg.left,
      top: rect.top,
      width: seg.right - seg.left,
      height: rect.height
    }));
}

function upsertInlineMarkupAnnotation(item) {
  const section = getActiveSection();
  if (!section) return null;
  if (!Array.isArray(section.annotations)) section.annotations = [];

  if (!item || (item.tool !== "wc" && item.tool !== "cl")) {
    return pushActiveSectionAnnotation(item);
  }

  const opposite = item.tool === "wc" ? "cl" : "wc";
  let next = section.annotations
    .map(normalizeSectionAnnotationItem)
    .filter(Boolean);

  const overlappingSame = next.filter((ann) => ann.tool === item.tool && annotationOverlapsRects(ann, item.rects));

  if (overlappingSame.length) {
    const latest = overlappingSame[overlappingSame.length - 1];
    const mergedRects = mergeRectsForInlineMark([
      ...overlappingSame.flatMap((ann) => ann.rects || []),
      ...(item.rects || [])
    ]);

    const merged = normalizeSectionAnnotationItem({
      ...latest,
      ...item,
      rects: mergedRects
    });

    next = next.filter((ann) => !overlappingSame.some((oldAnn) => oldAnn.id === ann.id));
    if (merged) next.push(merged);
    setActiveSectionAnnotations(next);
    return merged;
  }

  next.push(item);
  setActiveSectionAnnotations(next);
  return normalizeSectionAnnotationItem(item);
}

function buildMarkupAnnotation(tool, range, color) {
  const text = range.toString().trim();
  if (!text) return null;

  const rects = getRangeClientRectsRelativeToDocPage(range);
  if (!rects.length) return null;

  const labelMap = {
    wc: "WC",
    cl: "CL",
    rw: "RW",
    sd: "SD",
    np: "NP",
    move: "MOVE"
  };

  const styleMap = {
    highlight: "highlight",
    underline: "underline",
    squiggle: "squiggle",
    circle: "circle",
    bracket: "bracket",
    wc: "wc-label",
    cl: "cl-label",
    rw: "rw-label",
    sd: "sd-note",
    np: "np-mark",
    move: "move-mark"
  };

  return {
    type: (tool === "highlight" || tool === "underline") ? tool : "suggestion",
    tool,
    renderStyle: styleMap[tool] || tool,
    color,
    originalText: text,
    noteLabel: labelMap[tool] || "",
    action:
      tool === "wc" ? "replace" :
      tool === "rw" ? "rewrite" :
      tool === "sd" ? "note" :
      tool === "np" ? "paragraph" :
      tool === "move" ? "move" :
      "",
    status: "pending",
    rects,
    coordSpace: "annotation-layer"
  };
}

function createMarkupFromSelection(tool, color = currentAnnotationColor, options = {}) {
  const range = options.rangeOverride ? options.rangeOverride.cloneRange() : getDocSelectionRangeInsideContent();
  if (!range) return null;

  const item = buildMarkupAnnotation(tool, range, color);
  if (!item) return null;

  if (tool === "move") {
    const rects = item.rects || [];
    const startPoint = getRangeAnchorPoint(rects, "start");

    if (!pendingMoveSource) {
      pendingMoveSource = {
        text: item.originalText,
        rects,
        point: startPoint
      };

      const sourceAnn = pushActiveSectionAnnotation({
        ...item,
        noteLabel: "MOVE FROM",
        status: "pending",
        targetText: ""
      });

      renderSectionAnnotations();
      renderSuggestionTray();
      markSavedDocAnnotationSelectionApplied(tool);
      window.getSelection()?.removeAllRanges();
      return sourceAnn;
    }

    const endPoint = getRangeAnchorPoint(rects, "end");

    const moveAnn = pushActiveSectionAnnotation({
      type: "suggestion",
      tool: "move",
      renderStyle: "move-arrow",
      color: "#c6d4ff",
      action: "move",
      status: "pending",
      originalText: pendingMoveSource.text || "",
      targetText: item.originalText || "",
      noteLabel: "MOVE",
      rects: pendingMoveSource.rects,
      moveFrom: pendingMoveSource.point,
      moveTo: endPoint
    });

    pendingMoveSource = null;
    renderSectionAnnotations();
    renderSuggestionTray();
    markSavedDocAnnotationSelectionApplied(tool);
    window.getSelection()?.removeAllRanges();
    return moveAnn;
  }

  const ann = (tool === "wc" || tool === "cl")
    ? upsertInlineMarkupAnnotation(item)
    : pushActiveSectionAnnotation(item);
  renderSectionAnnotations();
  renderSuggestionTray();
  markSavedDocAnnotationSelectionApplied(tool);
  window.getSelection()?.removeAllRanges();
  return ann;
}

function createSuggestionAnnotation({
  action = "replace",
  originalText = "",
  suggestedText = "",
  noteLabel = "",
  color = "#9aaa82"
} = {}) {
  const range = getDocSelectionRangeInsideContent();
  if (!range) return null;

  const text = originalText || range.toString().trim();
  if (!text) return null;

  const rects = getRangeClientRectsRelativeToDocPage(range);

  const ann = pushActiveSectionAnnotation({
    type: "suggestion",
    action,
    status: "pending",
    originalText: text,
    suggestedText,
    noteLabel,
    color,
    rects,
    coordSpace: "annotation-layer"
  });

  renderSectionAnnotations();
  renderSuggestionTray();
  return ann;
}

function getDocPageWidthPx(settings) {
  const MM_TO_IN = 1 / 25.4;
  const sizes = {
    letter:  { w: 8.5,            h: 11 },
    a4:      { w: 210 * MM_TO_IN, h: 297 * MM_TO_IN },
    legal:   { w: 8.5,            h: 14 }
  };
  const paper = sizes[settings.paperSize] || sizes.letter;
  const widthIn = settings.orientation === "landscape" ? paper.h : paper.w;
  return Math.round(widthIn * 96);
}

function getDocDisplayWidthPx(settings) {
  return settings.orientation === "landscape"
    ? getDocLandscapeWidth(settings)
    : (settings.pageWidth || 680);
}

function getDocPagesHost() {
  return document.getElementById("docPagesHost");
}

function getDocPageNodes() {
  return Array.from(document.querySelectorAll(".doc-page"));
}

function getDocContentNodes() {
  return Array.from(document.querySelectorAll(".doc-page .doc-content"));
}

function clearActiveDocIds() {
  document.querySelectorAll("#docHeader, #docContent, #docFooterArea, #docAnnotationLayer").forEach((el) => {
    el.removeAttribute("id");
  });
}

function setActiveDocPage(pageEl) {
  if (!pageEl) return;
  clearActiveDocIds();

  const header = pageEl.querySelector(".doc-header");
  const content = pageEl.querySelector(".doc-content");
  const footer = pageEl.querySelector(".doc-footer-area");
  const ann = pageEl.querySelector(".doc-annotation-layer");

  if (header) header.id = "docHeader";
  if (content) content.id = "docContent";
  if (footer) footer.id = "docFooterArea";
  if (ann) ann.id = "docAnnotationLayer";
}

function createDocPageShell(pageNumber, settings, headerHTML = "", footerHTML = "") {
  const page = document.createElement("section");
  page.className = "doc-page";
  page.dataset.pageNumber = String(pageNumber);

  const displayWidth = getDocDisplayWidthPx(settings);
  const pageHeight = getDocPageHeightPx(settings);
  const bodyHeight = Math.max(160, pageHeight - settings.pageMarginTop - settings.pageMarginBottom);

  page.style.setProperty("--doc-page-display-width", `${displayWidth}px`);
  page.style.setProperty("--doc-page-height", `${pageHeight}px`);
  page.style.setProperty("--doc-page-body-height", `${bodyHeight}px`);

  const header = document.createElement("div");
  header.className = "doc-header";
  header.contentEditable = "true";
  header.spellcheck = true;
  header.innerHTML = headerHTML || "";
  header.style.minHeight = `${settings.pageMarginTop}px`;
  header.style.paddingLeft = `${settings.pageMarginLeft}px`;
  header.style.paddingRight = `${settings.pageMarginRight}px`;

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "doc-page-body";

  const content = document.createElement("div");
  content.className = "doc-content";
  content.contentEditable = "true";
  content.spellcheck = true;
  content.style.paddingLeft = `${settings.pageMarginLeft}px`;
  content.style.paddingRight = `${settings.pageMarginRight}px`;
  content.style.paddingTop = "0";
  content.style.paddingBottom = "0";

  const annotationLayer = document.createElement("div");
  annotationLayer.className = "doc-annotation-layer";

  bodyWrap.appendChild(content);
  bodyWrap.appendChild(annotationLayer);

  const footer = document.createElement("div");
  footer.className = "doc-footer-area";
  footer.contentEditable = "true";
  footer.spellcheck = true;
  footer.innerHTML = footerHTML || "";
  footer.style.minHeight = `${settings.pageMarginBottom}px`;
  footer.style.paddingLeft = `${settings.pageMarginLeft}px`;
  footer.style.paddingRight = `${settings.pageMarginRight}px`;

  page.appendChild(header);
  page.appendChild(bodyWrap);
  page.appendChild(footer);

  return { page, header, bodyWrap, content, footer, annotationLayer, bodyHeight };
}

function stripDocPageDividerNodes(root) {
  if (!root || typeof root.querySelectorAll !== "function") return root;
  root.querySelectorAll(".doc-page-divider").forEach((node) => node.remove());
  return root;
}

function sanitizeDocContentHTML(html = "") {
  const temp = document.createElement("div");
  temp.innerHTML = html && String(html).trim() ? html : "<p><br></p>";
  stripDocPageDividerNodes(temp);
  return temp.innerHTML || "<p><br></p>";
}

function makeDocContentNodesFromHTML(html = "") {
  const temp = document.createElement("div");
  temp.innerHTML = sanitizeDocContentHTML(html);
  return Array.from(temp.childNodes).map((node) => node.cloneNode(true));
}

function getCombinedDocContentHTML() {
  const temp = document.createElement("div");
  getDocContentNodes().forEach((contentEl) => {
    Array.from(contentEl.childNodes).forEach((node) => {
      temp.appendChild(node.cloneNode(true));
    });
  });
  stripDocPageDividerNodes(temp);
  return temp.innerHTML || "<p><br></p>";
}

function getCombinedDocText() {
  const temp = document.createElement("div");
  temp.innerHTML = getCombinedDocContentHTML();
  return temp.innerText || temp.textContent || "";
}

function getDocHeaderHTML() {
  return document.getElementById("docHeader")?.innerHTML
    || document.querySelector(".doc-page .doc-header")?.innerHTML
    || docData?.meta?.headerHTML
    || "";
}

function getDocFooterHTML() {
  return document.getElementById("docFooterArea")?.innerHTML
    || document.querySelector(".doc-page .doc-footer-area")?.innerHTML
    || docData?.meta?.footerHTML
    || "";
}

function getTextOffsetWithin(root, range) {
  if (!root || !range) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return (pre.toString() || "").length;
}

function setCaretByTextOffset(root, offset = 0) {
  if (!root) return false;
  const target = Math.max(0, Number(offset) || 0);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let node = walker.nextNode();

  while (node) {
    const len = node.textContent.length;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
    remaining -= len;
    node = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function normalizeDocUnderscoreRule() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;

  const range = sel.getRangeAt(0);
  const anchor = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const block = anchor?.closest?.("p, div");
  const content = block?.closest?.(".doc-content");

  if (!block || !content || block === content) return false;
  if (Array.from(block.children).some((child) => child.tagName !== "BR")) return false;

  const text = (block.textContent || "").replace(/\u200B/g, "").trim();
  if (!/^_{3,}$/.test(text)) return false;

  const hr = document.createElement("hr");
  const nextParagraph = document.createElement("p");
  nextParagraph.innerHTML = "<br>";

  block.replaceWith(hr, nextParagraph);
  requestAnimationFrame(() => {
    setCaretByTextOffset(nextParagraph, Number.MAX_SAFE_INTEGER);
  });
  return true;
}

function captureDocSelectionState() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  const content = range.startContainer?.nodeType === Node.ELEMENT_NODE
    ? range.startContainer.closest?.(".doc-content")
    : range.startContainer?.parentElement?.closest?.(".doc-content");

  if (!content) return null;

  const allContents = getDocContentNodes();
  const idx = allContents.indexOf(content);
  if (idx < 0) return null;

  let globalOffset = 0;
  for (let i = 0; i < idx; i += 1) {
    globalOffset += (allContents[i].innerText || allContents[i].textContent || "").length;
  }
  globalOffset += getTextOffsetWithin(content, range);

  return { globalOffset };
}

function restoreDocSelectionState(state) {
  if (!state || !Number.isFinite(Number(state.globalOffset))) return;
  let remaining = Number(state.globalOffset);
  const allContents = getDocContentNodes();

  for (const content of allContents) {
    const len = (content.innerText || content.textContent || "").length;
    if (remaining <= len) {
      const page = content.closest(".doc-page");
      if (page) setActiveDocPage(page);
      content.focus();
      setCaretByTextOffset(content, remaining);
      return;
    }
    remaining -= len;
  }

  const last = allContents[allContents.length - 1];
  if (last) {
    const page = last.closest(".doc-page");
    if (page) setActiveDocPage(page);
    last.focus();
    setCaretByTextOffset(last, Number.MAX_SAFE_INTEGER);
  }
}

let isRenderingDocPages = false;

function renderDocPagesFromHTML(html = "", options = {}) {
  const host = getDocPagesHost();
  if (!host) return;

  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  const headerHTML = options.headerHTML ?? docData?.meta?.headerHTML ?? "";
  const footerHTML = options.footerHTML ?? docData?.meta?.footerHTML ?? "";
  const safeHTML = sanitizeDocContentHTML(html);
  const selectionState = options.preserveSelection ? captureDocSelectionState() : null;

  clearSavedDocAnnotationSelection();
  isRenderingDocPages = true;
  host.innerHTML = "";

  // Always one single shell — no splitting
  const shell = createDocPageShell(1, settings, headerHTML, footerHTML);
  shell.page.style.height = "auto";
  shell.page.style.minHeight = "var(--doc-page-height, auto)";
  shell.bodyWrap.style.height = "auto";
  shell.bodyWrap.style.minHeight = "var(--doc-page-body-height, auto)";
  shell.bodyWrap.style.overflow = "visible";
  shell.content.innerHTML = safeHTML;

  host.appendChild(shell.page);
  setActiveDocPage(shell.page);

  const view = getCurrentDocMode();
  shell.content.contentEditable = view === "view" ? "false" : "true";
  shell.content.querySelector(".doc-annotation-layer")?.classList
    ?.toggle("active", view === "annotate");

  renderSectionAnnotations();
  renderSuggestionTray();
  updateDocCounts();

  if (selectionState) restoreDocSelectionState(selectionState);
  isRenderingDocPages = false;

  // Schedule visual page dividers after layout settles
  scheduleDocPageDividers();
}

function syncDocPages(options = {}) {
  if (isRenderingDocPages) return;
  const editor = document.getElementById("docEditor");
  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  if (editor) editor.dataset.pageMode = settings.pageMode || "paged";
  // Single shell system — just refresh dividers, no full rebuild needed
  scheduleDocPageDividers();
}

let _repaginateTimer = null;
let _isMouseSelecting = false;

document.addEventListener("mousedown", (e) => {
  if (e.target.closest(".doc-content")) _isMouseSelecting = true;
});
document.addEventListener("mouseup", () => { _isMouseSelecting = false; });

function scheduleDocRepagination(delay = 500) {
  if (_repaginateTimer) clearTimeout(_repaginateTimer);
  _repaginateTimer = setTimeout(() => {
    _repaginateTimer = null;
    if (!isRenderingDocPages && !_isMouseSelecting) {
      saveCurrentDocSection();
      syncDocPages({ preserveSelection: true });
    }
  }, delay);
}

let _dividerTimer = null;

function scheduleDocPageDividers() {
  if (_dividerTimer) clearTimeout(_dividerTimer);
  _dividerTimer = setTimeout(() => {
    _dividerTimer = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderDocPageDividers();
      });
    });
  }, 400);
}

function createDocPageDivider(pageNumber) {
  const divider = document.createElement("div");
  divider.className = "doc-page-divider";
  divider.contentEditable = "false";
  divider.dataset.pageNumber = String(pageNumber);
  divider.dataset.docUi = "page-divider";
  divider.innerHTML = `<span class="doc-page-divider-line"></span><span class="doc-page-divider-label">page ${pageNumber}</span><span class="doc-page-divider-line"></span>`;
  return divider;
}

function getDocElementOuterHeight(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const marginTop = parseFloat(style.marginTop || "0") || 0;
  const marginBottom = parseFloat(style.marginBottom || "0") || 0;
  return rect.height + marginTop + marginBottom;
}

function getDocCharRectForOffset(node, offset) {
  if (!node) return null;
  const text = node.textContent || "";
  const maxOffset = text.length;
  if (!maxOffset) return null;

  const start = Math.max(0, Math.min(offset, maxOffset - 1));
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, Math.min(maxOffset, start + 1));
  const rect = range.getClientRects()[0] || range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return rect;
}

function getDocCharTopForOffset(node, offset, contentTop) {
  const rect = getDocCharRectForOffset(node, offset);
  if (!rect) return null;
  return rect.top - contentTop;
}

function findDocTextSplitForBoundary(content, boundaryY) {
  if (!content) return null;
  const contentTop = content.getBoundingClientRect().top;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || !node.textContent.length) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest(".doc-page-divider")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node;
  while ((node = walker.nextNode())) {
    const textLength = node.textContent.length;
    const lastRect = getDocCharRectForOffset(node, textLength - 1);
    if (!lastRect || lastRect.bottom - contentTop < boundaryY) continue;

    let lo = 0;
    let hi = textLength;

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const charTop = getDocCharTopForOffset(node, mid, contentTop);
      if (charTop === null || charTop < boundaryY) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo >= textLength) continue;

    return {
      node,
      offset: lo
    };
  }

  return null;
}

function findDocBlockForBoundary(content, boundaryY) {
  if (!content) return null;
  const contentTop = content.getBoundingClientRect().top;
  const blocks = Array.from(content.children).filter((el) => !el.classList.contains("doc-page-divider"));

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (!rect.height) continue;
    const top = rect.top - contentTop;
    const bottom = rect.bottom - contentTop;
    if (bottom < boundaryY - 1) continue;
    if (top >= boundaryY - 1) return block;
  }

  return null;
}

function placeDocDividerAtBoundary(content, boundaryY, pageNumber) {
  if (!content) return null;

  const textSplit = findDocTextSplitForBoundary(content, boundaryY);
  const divider = createDocPageDivider(pageNumber);

  if (textSplit) {
    const range = document.createRange();
    range.setStart(textSplit.node, textSplit.offset);
    range.collapse(true);
    range.insertNode(divider);
    return divider;
  }

  const block = findDocBlockForBoundary(content, boundaryY);
  if (block) {
    block.insertAdjacentElement("beforebegin", divider);
    return divider;
  }

  return null;
}

function renderDocPageDividers() {
  const content = document.getElementById("docContent");
  const surface = content?.closest(".doc-page");
  if (!content || !surface) return;

  // Remove existing dividers first
  content.querySelectorAll(".doc-page-divider").forEach(d => d.remove());

  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});

  // Pageless mode: no dividers, let content grow freely
  if ((settings.pageMode || "paged") === "pageless") return;

  const pageH = getDocPageHeightPx(settings);
  if (!pageH || pageH <= 0) return;

  // Measure clean content height after dividers are removed
  const rawContentHeight = content.scrollHeight;
  const breakCount = Math.floor((rawContentHeight - 1) / pageH);
  if (breakCount <= 0) return;

  // Place each divider using a fresh viewport measurement each iteration
  // so previously-inserted dividers don't cause boundary drift
  for (let index = 0; index < breakCount; index++) {
    const pageNumber = index + 2;
    // Re-measure contentTop each time — divider insertion shifts the DOM
    const contentTop = content.getBoundingClientRect().top;
    // Target boundary is always (pageNumber-1) full pages from the content top
    const targetClientY = contentTop + pageH * (index + 1);
    const boundaryY = pageH * (index + 1);
    const divider = placeDocDividerAtBoundary(content, boundaryY, pageNumber);
    if (!divider) break;
  }
}

function getDocContentEl() {
  return document.getElementById("docContent");
}

function getCurrentDocSelection() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  return sel;
}

function getCurrentDocRange() {
  const sel = getCurrentDocSelection();
  if (!sel) return null;
  return sel.getRangeAt(0);
}

function isRangeInsideDocContent(range) {
  const content = getDocContentEl();
  if (!content || !range) return false;
  return content.contains(range.commonAncestorContainer);
}

function createSuggestionSpan(kind, text = "") {
  const span = document.createElement("span");
  span.className = kind === "delete" ? "doc-suggest-delete" : "doc-suggest-insert";
  span.dataset.suggestId = makeInlineSuggestionId();
  span.dataset.suggestKind = kind;
  if (text) span.textContent = text;
  return span;
}

function getSuggestionSpanById(id) {
  if (!id) return null;
  return document.querySelector(`.doc-suggest-insert[data-suggest-id="${id}"], .doc-suggest-delete[data-suggest-id="${id}"]`);
}

function buildSuggestionContentNodes(text = "") {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  if (!normalized) return [];

  const parts = normalized.split("\n");
  const nodes = [];

  parts.forEach((segment, index) => {
    if (index > 0) nodes.push(document.createElement("br"));
    if (segment || parts.length === 1) {
      nodes.push(document.createTextNode(segment));
    }
  });

  return nodes;
}

function buildSuggestionBreakNodes(count = 1) {
  return Array.from({ length: Math.max(0, count) }, () => document.createElement("br"));
}

function fillSuggestionSpanText(span, text = "") {
  if (!span) return;
  span.textContent = "";
  buildSuggestionContentNodes(text).forEach((node) => span.appendChild(node));
}

function findExtendableInsertSuggestion(range) {
  if (!range || !range.collapsed) return null;

  const activeSpan = getSuggestionSpanById(activeInlineSuggestionId);
  const container = range.startContainer;

  const matchesActive = (span) => {
    if (!span || !span.matches?.(".doc-suggest-insert")) return false;
    return !activeSpan || span === activeSpan;
  };

  if (container?.nodeType === Node.TEXT_NODE) {
    const parentSpan = container.parentElement?.closest?.(".doc-suggest-insert");
    if (matchesActive(parentSpan)) return parentSpan;
  }

  if (container?.nodeType === Node.ELEMENT_NODE) {
    const beforeNode = container.childNodes[range.startOffset - 1];
    const beforeSpan = beforeNode?.nodeType === Node.ELEMENT_NODE
      ? beforeNode.closest?.(".doc-suggest-insert")
      : beforeNode?.parentElement?.closest?.(".doc-suggest-insert");
    if (matchesActive(beforeSpan)) return beforeSpan;

    const afterNode = container.childNodes[range.startOffset];
    const afterSpan = afterNode?.nodeType === Node.ELEMENT_NODE
      ? afterNode.closest?.(".doc-suggest-insert")
      : afterNode?.parentElement?.closest?.(".doc-suggest-insert");
    if (matchesActive(afterSpan)) return afterSpan;
  }

  return matchesActive(activeSpan) ? activeSpan : null;
}

function createCollapsedRangeInsideInsertSpan(sourceRange, span, position = "end") {
  const range = document.createRange();

  if (sourceRange && span.contains(sourceRange.startContainer)) {
    range.setStart(sourceRange.startContainer, sourceRange.startOffset);
    range.collapse(true);
    return range;
  }

  if (position === "start") {
    range.setStart(span, 0);
  } else {
    range.setStart(span, span.childNodes.length);
  }
  range.collapse(true);
  return range;
}

function commitAnnotateSuggestionMutation(targetNode, caretRange) {
  if (!targetNode || !caretRange) return null;

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(caretRange);

  const span = targetNode.nodeType === Node.ELEMENT_NODE
    ? targetNode.closest?.(".doc-suggest-insert, .doc-suggest-delete") || targetNode
    : targetNode.parentElement?.closest?.(".doc-suggest-insert, .doc-suggest-delete");

  activeInlineSuggestionId = span?.dataset?.suggestId || null;
  markSuggestionSelection(activeInlineSuggestionId);
  saveCurrentDocSection();
  persistActiveDocData();
  renderSuggestionTray();
  return span;
}

function insertNodesIntoSuggestionRange(range, nodes = []) {
  if (!range || !Array.isArray(nodes) || !nodes.length) return null;

  const fragment = document.createDocumentFragment();
  const materialized = [];
  nodes.forEach((node) => {
    fragment.appendChild(node);
    materialized.push(node);
  });

  range.deleteContents();
  range.insertNode(fragment);

  const lastNode = materialized[materialized.length - 1];
  const caretRange = document.createRange();
  if (lastNode.nodeType === Node.TEXT_NODE) {
    caretRange.setStart(lastNode, lastNode.textContent.length);
  } else {
    caretRange.setStartAfter(lastNode);
  }
  caretRange.collapse(true);

  return commitAnnotateSuggestionMutation(lastNode, caretRange);
}

function extendActiveAnnotateInsert(range, nodes = []) {
  const span = findExtendableInsertSuggestion(range);
  if (!span) return null;

  const localRange = createCollapsedRangeInsideInsertSpan(range, span, "end");
  return insertNodesIntoSuggestionRange(localRange, nodes);
}

function convertAnnotateSelectionToDeleteSuggestion(range) {
  if (!range || range.collapsed) return range;

  const ancestor = range.commonAncestorContainer;
  const insertSpan = ancestor.nodeType === Node.ELEMENT_NODE
    ? ancestor.closest?.(".doc-suggest-insert")
    : ancestor.parentElement?.closest?.(".doc-suggest-insert");

  if (insertSpan) {
    range.extractContents();
    return range;
  }

  const extracted = range.extractContents();
  if (!(extracted.textContent || "").trim()) return range;

  const delSpan = createSuggestionSpan("delete");
  delSpan.appendChild(extracted);
  range.insertNode(delSpan);

  const afterDelete = document.createRange();
  afterDelete.setStartAfter(delSpan);
  afterDelete.collapse(true);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(afterDelete);

  activeInlineSuggestionId = delSpan.dataset.suggestId;
  return afterDelete;
}

function finalizeAnnotateSuggestionInsertion(span, insertRange) {
  if (!span || !insertRange) return null;

  insertRange.deleteContents();
  insertRange.insertNode(span);

  const after = document.createRange();
  after.setStartAfter(span);
  after.collapse(true);
  return commitAnnotateSuggestionMutation(span, after);
}

function insertAnnotateSuggestionText(text) {
  const range = getCurrentDocRange();
  if (!range || !isRangeInsideDocContent(range)) return null;

  if (range.collapsed) {
    const extended = extendActiveAnnotateInsert(range, buildSuggestionContentNodes(text));
    if (extended) return extended;
  }

  const insertRange = convertAnnotateSelectionToDeleteSuggestion(range);
  const span = createSuggestionSpan("insert");
  fillSuggestionSpanText(span, text);
  return finalizeAnnotateSuggestionInsertion(span, insertRange);
}

function insertAnnotateParagraphSuggestion() {
  const range = getCurrentDocRange();
  if (!range || !isRangeInsideDocContent(range)) return null;

  if (range.collapsed) {
    const extended = extendActiveAnnotateInsert(range, buildSuggestionBreakNodes(1));
    if (extended) return extended;
  }

  const insertRange = convertAnnotateSelectionToDeleteSuggestion(range);
  const span = createSuggestionSpan("insert");
  span.dataset.suggestBreak = "true";
  span.innerHTML = `<br>`;
  return finalizeAnnotateSuggestionInsertion(span, insertRange);
}

function closestSuggestionSpan(node) {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(".doc-suggest-insert, .doc-suggest-delete")) {
    return node;
  }
  return node.parentElement?.closest?.(".doc-suggest-insert, .doc-suggest-delete") || null;
}

function getSuggestionKindFromNode(node) {
  const span = closestSuggestionSpan(node);
  return span?.dataset?.suggestKind || "";
}

function rangeIsInsideSingleInsertSuggestion(range) {
  if (!range) return false;

  const startSpan = closestSuggestionSpan(range.startContainer);
  const endSpan = closestSuggestionSpan(range.endContainer);
  if (!startSpan || !endSpan || startSpan !== endSpan) return false;
  return startSpan.dataset?.suggestKind === "insert";
}

function rangeIsInsideSingleDeleteSuggestion(range) {
  if (!range) return false;

  const startSpan = closestSuggestionSpan(range.startContainer);
  const endSpan = closestSuggestionSpan(range.endContainer);
  if (!startSpan || !endSpan || startSpan !== endSpan) return false;
  return startSpan.dataset?.suggestKind === "delete";
}

function getTrackedDeleteRangeFromCollapsedCaret(inputType) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;

  const original = sel.getRangeAt(0).cloneRange();
  const direction = inputType === "deleteContentForward" ? "forward" : "backward";
  let caret = original.cloneRange();

  for (let i = 0; i < 8; i += 1) {
    sel.removeAllRanges();
    sel.addRange(caret);

    try {
      sel.modify("extend", direction, "character");
    } catch {
      sel.removeAllRanges();
      sel.addRange(original);
      return null;
    }

    if (!sel.rangeCount) {
      sel.removeAllRanges();
      sel.addRange(original);
      return null;
    }

    const candidate = sel.getRangeAt(0).cloneRange();
    if (candidate.collapsed) {
      sel.removeAllRanges();
      sel.addRange(original);
      return null;
    }

    if (!isRangeInsideDocContent(candidate)) {
      sel.removeAllRanges();
      sel.addRange(original);
      return null;
    }

    if (!rangeIsInsideSingleDeleteSuggestion(candidate)) {
      sel.removeAllRanges();
      sel.addRange(original);
      return candidate;
    }

    // Skip over already deleted text so repeated backspace keeps striking prior base text.
    caret = document.createRange();
    if (direction === "backward") {
      caret.setStart(candidate.startContainer, candidate.startOffset);
    } else {
      caret.setStart(candidate.endContainer, candidate.endOffset);
    }
    caret.collapse(true);
  }

  sel.removeAllRanges();
  sel.addRange(original);
  return null;
}

function moveCaretIntoAdjacentInsertSuggestion(range, inputType = "") {
  if (!range || !range.collapsed) return false;

  const container = range.startContainer;
  if (container?.nodeType !== Node.ELEMENT_NODE) return false;

  const offset = range.startOffset;
  const targetNode = inputType === "deleteContentBackward"
    ? container.childNodes[offset - 1]
    : container.childNodes[offset];

  const insertSpan = closestSuggestionSpan(targetNode);
  if (!insertSpan || insertSpan.dataset?.suggestKind !== "insert") return false;

  const caret = document.createRange();
  if (inputType === "deleteContentBackward") {
    caret.setStart(insertSpan, insertSpan.childNodes.length);
  } else {
    caret.setStart(insertSpan, 0);
  }
  caret.collapse(true);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(caret);
  return true;
}

function unwrapNode(node) {
  if (!node || !node.parentNode) return;
  while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
  node.remove();
}

function removeSuggestionById(id) {
  document.querySelectorAll(`[data-suggest-id="${id}"]`).forEach((node) => node.remove());
}

function acceptSuggestionById(id) {
  document.querySelectorAll(`[data-suggest-id="${id}"]`).forEach((node) => {
    const kind = node.dataset.suggestKind;
    if (kind === "insert") {
      unwrapNode(node);
    } else if (kind === "delete") {
      node.remove();
    }
  });

  activeInlineSuggestionId = null;
  saveCurrentDocSection();
  persistActiveDocData();
  renderSuggestionTray();
}

function declineSuggestionById(id) {
  document.querySelectorAll(`[data-suggest-id="${id}"]`).forEach((node) => {
    const kind = node.dataset.suggestKind;
    if (kind === "insert") {
      node.remove();
    } else if (kind === "delete") {
      unwrapNode(node);
    }
  });

  activeInlineSuggestionId = null;
  saveCurrentDocSection();
  persistActiveDocData();
  renderSuggestionTray();
}

function markSuggestionSelection(id) {
  document.querySelectorAll(".doc-suggest-insert, .doc-suggest-delete").forEach((node) => {
    node.dataset.suggestSelected = node.dataset.suggestId === id ? "true" : "false";
  });
}

function handleAnnotateBeforeInput(e) {
  if (getCurrentDocMode() !== "annotate") return;

  const content = getDocContentEl();
  if (!content) return;

  const range = getCurrentDocRange();
  if (!range || !isRangeInsideDocContent(range)) return;

  const inputType = e.inputType || "";

  if (inputType === "insertText" && typeof e.data === "string" && e.data.length) {
    e.preventDefault();
    insertAnnotateSuggestionText(e.data);
    return;
  }

  if (inputType === "insertParagraph") {
    e.preventDefault();
    insertAnnotateParagraphSuggestion();
    return;
  }

  if (inputType === "insertFromPaste") {
    const text = e.dataTransfer?.getData("text/plain")
      || e.clipboardData?.getData("text/plain")
      || "";
    if (!text) return;

    e.preventDefault();
    insertAnnotateSuggestionText(text);
    return;
  }

  if (inputType.startsWith("delete") && !range.collapsed) {
    if (rangeIsInsideSingleInsertSuggestion(range)) {
      // Let native behavior edit inserted text directly.
      return;
    }

    e.preventDefault();

    const extracted = range.extractContents();
    const text = extracted.textContent || "";
    if (!text.trim()) return;

    const span = createSuggestionSpan("delete");
    span.appendChild(extracted);
    range.insertNode(span);

    const after = document.createRange();
    after.setStartAfter(span);
    after.collapse(true);

    commitAnnotateSuggestionMutation(span, after);
    return;
  }

  if ((inputType === "deleteContentBackward" || inputType === "deleteContentForward") && range.collapsed) {
    if (getSuggestionKindFromNode(range.startContainer) === "insert") {
      // Inside inserted text we should behave like normal typing edits.
      return;
    }

    if (moveCaretIntoAdjacentInsertSuggestion(range, inputType)) {
      // At an insert-span boundary, redirect deletion into annotation layer.
      return;
    }

    e.preventDefault();

    const work = getTrackedDeleteRangeFromCollapsedCaret(inputType);
    if (!work) return;

    const extracted = work.extractContents();
    const deletedText = extracted.textContent || "";
    if (!deletedText) return;

    const span = createSuggestionSpan("delete");
    span.appendChild(extracted);
    work.insertNode(span);

    const after = document.createRange();
    after.setStartAfter(span);
    after.collapse(true);

    commitAnnotateSuggestionMutation(span, after);
  }
}

function renderSuggestionTray() {
  // Inline hover UI is now handled via CSS and direct span event listeners
  // This function is kept for compatibility but does minimal work
  const content = getDocContentEl();
  if (!content) return;

  // Attach hover handlers to all suggestion spans
  content.querySelectorAll(".doc-suggest-insert, .doc-suggest-delete").forEach((span) => {
    if (span.dataset.hoverHandlersAttached) return; // Only attach once
    span.dataset.hoverHandlersAttached = "true";

    const clearHideTimer = () => {
      if (span._suggestHoverHideTimer) {
        clearTimeout(span._suggestHoverHideTimer);
        span._suggestHoverHideTimer = null;
      }
    };

    const scheduleHide = () => {
      clearHideTimer();
      span._suggestHoverHideTimer = setTimeout(() => {
        const buttons = span.querySelector(".doc-suggestion-hover-buttons");
        if (buttons) buttons.remove();
        span._suggestHoverHideTimer = null;
      }, 180); 
    };

    span.addEventListener("mouseenter", () => {
      clearHideTimer();

      // Only show buttons in Edit mode
      if (getCurrentDocMode() !== "edit") return;
      
      const id = span.dataset.suggestId;
      const existing = span.querySelector(".doc-suggestion-hover-buttons");
      if (!existing) {
        const buttons = document.createElement("span");
        buttons.className = "doc-suggestion-hover-buttons";
        buttons.contentEditable = "false";
        buttons.innerHTML = `
          <button class="doc-suggest-btn accept" title="Accept">✓</button>
          <button class="doc-suggest-btn decline" title="Decline">✕</button>
        `;
        buttons.querySelector(".accept")?.addEventListener("click", (e) => {
          e.stopPropagation();
          acceptSuggestionById(id);
        });
        buttons.querySelector(".decline")?.addEventListener("click", (e) => {
          e.stopPropagation();
          declineSuggestionById(id);
        });

        buttons.addEventListener("mouseenter", clearHideTimer);
        buttons.addEventListener("mouseleave", scheduleHide);
        span.appendChild(buttons);
      }
    });

    span.addEventListener("mouseleave", () => {
      scheduleHide();
    });
  });
}

function declineSuggestionAnnotation(annotationId) {
  const section = getActiveSection();
  if (!section || !Array.isArray(section.annotations)) return;

  section.annotations = section.annotations.filter((ann) => ann.id !== annotationId);
  persistActiveDocData();
  renderSectionAnnotations();
  renderSuggestionTray();
}

function acceptSuggestionAnnotation(annotationId) {
  const section = getActiveSection();
  if (!section || !Array.isArray(section.annotations)) return;

  const ann = section.annotations.find((item) => item.id === annotationId);
  if (!ann) return;

  const content = document.getElementById("docContent");
  if (!content) return;

  if (ann.tool === "wc" && ann.originalText) {
    const replacement = prompt("Replace with:", ann.suggestedText || "");
    if (replacement && replacement.trim()) {
      const escaped = ann.originalText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      content.innerHTML = content.innerHTML.replace(new RegExp(escaped), replacement.trim());
      saveCurrentDocSection();
    }
  }

  if (ann.tool === "rw") {
    const replacement = prompt("Rewrite as:", ann.suggestedText || "");
    if (replacement && replacement.trim()) {
      const escaped = ann.originalText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      content.innerHTML = content.innerHTML.replace(new RegExp(escaped), replacement.trim());
      saveCurrentDocSection();
    }
  }

  if (ann.tool === "np" && ann.originalText) {
    const escaped = ann.originalText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content.innerHTML = content.innerHTML.replace(new RegExp(escaped), `<p>${ann.originalText}</p><p><br></p>`);
    saveCurrentDocSection();
  }

  if (ann.tool === "sd") {
    const note = prompt("Stage direction note:", ann.suggestedText || "");
    if (note !== null) {
      ann.suggestedText = note;
    }
  }

  if (ann.tool === "move") {
    // keep simple for now: just remove the markup on accept
  }

  section.annotations = section.annotations.filter((item) => item.id !== annotationId);
  persistActiveDocData();
  renderSectionAnnotations();
  renderSuggestionTray();
}

window.createReplaceSuggestion = function (suggestedText = "", noteLabel = "WC") {
  return createSuggestionAnnotation({
    action: "replace",
    suggestedText,
    noteLabel,
    color: "#9aaa82"
  });
};

function normalizeDocSection(section = {}, index = 0) {
  const meta = section && typeof section.meta === "object" && section.meta !== null
    ? section.meta
    : {};

  return {
    id: typeof section.id === "string" && section.id.trim()
      ? section.id
      : makeDocSectionId(index),
    title: typeof section.title === "string" && section.title.trim()
      ? section.title
      : `Section ${index + 1}`,
    content: sanitizeDocReadableTextColor(typeof section.content === "string" ? section.content : ""),
    styleKit: typeof section.styleKit === "string" ? section.styleKit : "",
    meta: {
      status: ["brainstorming", "draft", "editing", "final"].includes(meta.status) ? meta.status : "draft",
      purpose: typeof meta.purpose === "string" ? meta.purpose : "",
      pov: typeof meta.pov === "string" ? meta.pov : "",
      povId: typeof meta.povId === "string" ? meta.povId : "",
      location: typeof meta.location === "string" ? meta.location : "",
      locationId: typeof meta.locationId === "string" ? meta.locationId : "",
      chapter: typeof meta.chapter === "string" ? meta.chapter : "",
      notes: typeof meta.notes === "string" ? meta.notes : ""
    },
    annotations: Array.isArray(section.annotations)
      ? section.annotations.map(normalizeSectionAnnotationItem).filter(Boolean)
      : [],
    suggestedChanges: Array.isArray(section.suggestedChanges)
      ? section.suggestedChanges.map(normalizeDocSuggestedChange)
      : []
  };
}

function sanitizeDocReadableTextColor(html = "") {
  const raw = String(html || "");
  if (!/color\s*:\s*(#000|#000000|black|rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\))/i.test(raw)) {
    return raw;
  }
  if (typeof document === "undefined") {
    return raw.replace(/color\s*:\s*(#000000|#000|black|rgb\s*\(\s*0\s*,\s*0\s*,\s*0\s*\))\s*;?/gi, "");
  }

  const host = document.createElement("div");
  host.innerHTML = raw;
  host.querySelectorAll("[style]").forEach((el) => {
    const color = String(el.style.color || "").replace(/\s+/g, "").toLowerCase();
    if (color === "black" || color === "#000" || color === "#000000" || color === "rgb(0,0,0)") {
      el.style.removeProperty("color");
    }
    if (!el.getAttribute("style")?.trim()) {
      el.removeAttribute("style");
    }
  });
  return host.innerHTML;
}

function normalizeDocData(data = {}) {
  const rawSections = Array.isArray(data.sections) ? data.sections : [];
  const sections = rawSections.length
    ? rawSections.map((section, index) => normalizeDocSection(section, index))
    : [normalizeDocSection({}, 0)];

  return {
    meta: normalizeDocMeta(data.meta || {}),
    viewPrefs: normalizeDocViewPrefs(data.viewPrefs || {}),
    annotation: normalizeDocAnnotationData(data.annotation || {}),
    sections
  };
}

function getActiveDocData() {
  const base = normalizeDocData(docData || {});
  return {
    ...base,
    sections: docSections.map((section, index) => normalizeDocSection(section, index)),
    meta: {
      ...base.meta,
      updatedAt: new Date().toISOString()
    }
  };
}

function persistActiveDocData() {
  if (!docPageId) return;
  updateDocStats();
  docData = getActiveDocData();
  saveDocData(docPageId, docData);
}

function migrateLegacyPageAnnotationsIntoSection(pageId) {
  const raw = readStorageJSON ? readStorageJSON("sanctum_annotations", {}) : JSON.parse(localStorage.getItem("sanctum_annotations") || "{}");
  const legacy = Array.isArray(raw?.[pageId]) ? raw[pageId] : [];
  if (!legacy.length) return;

  const section = getActiveSection();
  if (!section) return;
  if (Array.isArray(section.annotations) && section.annotations.length) return;

  section.annotations = legacy
    .map(normalizeSectionAnnotationItem)
    .filter(Boolean);

  persistActiveDocData();

  delete raw[pageId];
  if (typeof writeStorageJSON === "function") {
    writeStorageJSON("sanctum_annotations", raw);
  } else {
    localStorage.setItem("sanctum_annotations", JSON.stringify(raw));
  }
}

function normalizeDocSettings(settings = {}) {
  const PX_PER_IN = 96;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const paperSize = ["letter", "a4", "legal"].includes(String(settings.paperSize || "").toLowerCase())
    ? String(settings.paperSize).toLowerCase()
    : "letter";
  const orientation = ["portrait", "landscape"].includes(String(settings.orientation || "").toLowerCase())
    ? String(settings.orientation).toLowerCase()
    : "portrait";
  const pageMode = ["paged", "pageless"].includes(String(settings.pageMode || "").toLowerCase())
    ? String(settings.pageMode).toLowerCase()
    : "paged";
  const rawWidth = Number(settings.pageWidth);
  const rawLegacyPadding = Number(settings.pagePadding);
  const rawLegacyMarginX = Number(settings.pageMarginX);
  const rawMarginTop = Number(settings.pageMarginTop);
  const rawMarginRight = Number(settings.pageMarginRight);
  const rawMarginBottom = Number(settings.pageMarginBottom);
  const rawMarginLeft = Number(settings.pageMarginLeft);
  const rawMarginTopIn = Number(settings.pageMarginTopIn);
  const rawMarginRightIn = Number(settings.pageMarginRightIn);
  const rawMarginBottomIn = Number(settings.pageMarginBottomIn);
  const rawMarginLeftIn = Number(settings.pageMarginLeftIn);

  const pageWidth = Number.isFinite(rawWidth) ? clamp(rawWidth, 400, 1000) : 680;
  const defaultVertical = Number.isFinite(rawLegacyPadding)
    ? clamp(rawLegacyPadding / PX_PER_IN, 0.25, 3)
    : (40 / PX_PER_IN);
  const defaultHorizontal = Number.isFinite(rawLegacyMarginX)
    ? clamp(rawLegacyMarginX / PX_PER_IN, 0.25, 3)
    : (72 / PX_PER_IN);

  const defaultVerticalIn = Number.isFinite(defaultVertical) ? defaultVertical : (40 / PX_PER_IN);
  const defaultHorizontalIn = Number.isFinite(defaultHorizontal) ? defaultHorizontal : (72 / PX_PER_IN);

  const pageMarginTopIn = Number.isFinite(rawMarginTopIn)
    ? clamp(rawMarginTopIn, 0.25, 3)
    : (Number.isFinite(rawMarginTop) ? clamp(rawMarginTop / PX_PER_IN, 0.25, 3) : defaultVerticalIn);
  const pageMarginRightIn = Number.isFinite(rawMarginRightIn)
    ? clamp(rawMarginRightIn, 0.25, 3)
    : (Number.isFinite(rawMarginRight) ? clamp(rawMarginRight / PX_PER_IN, 0.25, 3) : defaultHorizontalIn);
  const pageMarginBottomIn = Number.isFinite(rawMarginBottomIn)
    ? clamp(rawMarginBottomIn, 0.25, 3)
    : (Number.isFinite(rawMarginBottom) ? clamp(rawMarginBottom / PX_PER_IN, 0.25, 3) : defaultVerticalIn);
  const pageMarginLeftIn = Number.isFinite(rawMarginLeftIn)
    ? clamp(rawMarginLeftIn, 0.25, 3)
    : (Number.isFinite(rawMarginLeft) ? clamp(rawMarginLeft / PX_PER_IN, 0.25, 3) : defaultHorizontalIn);

  const pageMarginTop = Math.round(pageMarginTopIn * PX_PER_IN);
  const pageMarginRight = Math.round(pageMarginRightIn * PX_PER_IN);
  const pageMarginBottom = Math.round(pageMarginBottomIn * PX_PER_IN);
  const pageMarginLeft = Math.round(pageMarginLeftIn * PX_PER_IN);

  const paperPreviewDefaults = {
    letter: 680,
    a4: 670,
    legal: 700
  };
  const defaultPreviewWidth = paperPreviewDefaults[paperSize] || 680;

  return {
    pageWidth: Number.isFinite(rawWidth) ? pageWidth : defaultPreviewWidth,
    paperSize,
    orientation,
    pageMode,
    pageMarginTopIn,
    pageMarginRightIn,
    pageMarginBottomIn,
    pageMarginLeftIn,
    pageMarginTop,
    pageMarginRight,
    pageMarginBottom,
    pageMarginLeft,
    // Backward-compatible aliases used by legacy preset flows.
    pagePadding: Math.round((pageMarginTop + pageMarginBottom) / 2),
    pageMarginX: Math.round((pageMarginLeft + pageMarginRight) / 2)
  };
}

function loadDocData(pageId) {
  const all = typeof readAllDocuments === "function"
    ? readAllDocuments()
    : (typeof readStorageJSON === "function"
        ? readStorageJSON(DOC_STORAGE_KEY, {})
        : JSON.parse(localStorage.getItem(DOC_STORAGE_KEY) || "{}"));

  return normalizeDocData(all[pageId] || {});
}

function saveDocData(pageId, data) {
  const all = typeof readAllDocuments === "function"
    ? readAllDocuments()
    : (typeof readStorageJSON === "function"
        ? readStorageJSON(DOC_STORAGE_KEY, {})
        : JSON.parse(localStorage.getItem(DOC_STORAGE_KEY) || "{}"));

  all[pageId] = normalizeDocData(data);

  if (typeof writeAllDocuments === "function") {
    writeAllDocuments(all);
  } else if (typeof writeStorageJSON === "function") {
    writeStorageJSON(DOC_STORAGE_KEY, all);
  } else {
    localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(all));
  }
}

function openDocEditor(pageId) {
  docPageId = pageId;
  docData = loadDocData(pageId);
  docSections = docData.sections;
  activeSectionIndex = 0;

  if (!docData.meta) docData.meta = normalizeDocMeta({});
  docData.meta.stats = normalizeDocStats(docData.meta.stats || {});

  const currentTotalWords = countWords(getDocTextContent());
  docData.meta.stats.totalWords = currentTotalWords;
  docData.meta.stats.sessionStartWords = currentTotalWords;

  migrateLegacyPageAnnotationsIntoSection(pageId);

  resetDocUIState();
  setDocUIState({
    editorOpen: true,
    sectionsOpen: true,
    insertOpen: false,
    inspectorOpen: false,
    activeTransient: null
  });

  document.getElementById("docEditor").classList.add("active");
  document.getElementById("pageCanvas").style.display = "none";
  const _sd = document.getElementById("splitDivider");
  if (_sd) _sd.style.display = "none";
  const _sp = document.getElementById("splitPane");
  if (_sp) _sp.style.display = "none";
  const _pbs = document.getElementById("pageBoardSurface");
  if (_pbs) _pbs.style.display = "none";

  loadThreads(pageId);
  loadAnchors(pageId);
  loadLexicon();
  renderDocSections();
  loadDocSection(activeSectionIndex);
  updateDocCounts();
  applyDocSettings(pageId);
  renderColorPresets();
  renderThreadsList();
  renderDocStats();
  renderSuggestionTray();
  syncDocLayoutState();
  syncDocViewModeUI();
}

function closeDocEditor() {
  saveCurrentDocSection();
  docData = null;

  closeDocTransientUI();
  closeInspector();
  if (typeof closeDocInsertPanel === "function") {
    closeDocInsertPanel();
  }

  const host = document.getElementById("docPagesHost");
  if (host) host.innerHTML = "";

  clearActiveDocIds();

  document.getElementById("docEditor").classList.remove("active");
  document.getElementById("pageCanvas").style.display = "";
  const _sd2 = document.getElementById("splitDivider");
  if (_sd2) _sd2.style.display = "";
  const _sp2 = document.getElementById("splitPane");
  if (_sp2) _sp2.style.display = "";
  const _pbs2 = document.getElementById("pageBoardSurface");
  if (_pbs2) _pbs2.style.display = "";
  docPageId = null;

  resetDocUIState();
  setDocUIState({
    editorOpen: false,
    sidebarOpen: false,
    pinOpen: false,
    activeTransient: null
  });
}

function saveCurrentDocSection() {
  if (docPageId === null) return;
  if (docSections[activeSectionIndex]) {
    docSections[activeSectionIndex].content = getCombinedDocContentHTML();
    if (!docData.meta) docData.meta = normalizeDocMeta({});
    docData.meta.headerHTML = getDocHeaderHTML();
    docData.meta.footerHTML = getDocFooterHTML();

    if (document.getElementById("docInspector")?.classList.contains("open")) {
      if (!docSections[activeSectionIndex].meta) docSections[activeSectionIndex].meta = {};
      docSections[activeSectionIndex].meta.status = document.getElementById("inspectorStatus")?.value || "draft";
      docSections[activeSectionIndex].meta.purpose = document.getElementById("inspectorPurpose")?.value || "";
      docSections[activeSectionIndex].meta.pov = document.getElementById("inspectorPOV")?.value || "";
      docSections[activeSectionIndex].meta.location = document.getElementById("inspectorLocation")?.value || "";
      docSections[activeSectionIndex].meta.chapter = document.getElementById("inspectorChapter")?.value || "";
      docSections[activeSectionIndex].meta.notes = document.getElementById("inspectorNotes")?.value || "";
    }
  }
  persistActiveDocData();
}

window.SanctumAssistantDocumentStore = {
  read() {
    saveCurrentDocSection();
    const all = readAllDocuments();
    return typeof structuredClone === "function"
      ? structuredClone(all)
      : JSON.parse(JSON.stringify(all));
  },
  write(nextDocuments) {
    const next = nextDocuments && typeof nextDocuments === "object" ? nextDocuments : {};
    writeAllDocuments(next);
    if (docPageId && next[docPageId]) {
      const activeSectionId = docSections[activeSectionIndex]?.id || "";
      docData = normalizeDocData(next[docPageId]);
      docSections = docData.sections;
      const nextIndex = Math.max(0, docSections.findIndex((section) => section.id === activeSectionId));
      activeSectionIndex = nextIndex;
      renderDocSections();
      loadDocSection(activeSectionIndex);
    }
    return true;
  },
};

function loadDocSection(index) {
  activeSectionIndex = index;
  if (!docData.meta) docData.meta = normalizeDocMeta({});
  renderDocPagesFromHTML(docSections[index]?.content || "", {
    preserveSelection: false,
    headerHTML: docData.meta.headerHTML || "",
    footerHTML: docData.meta.footerHTML || ""
  });

  const content = document.getElementById("docContent");
  if (content) {
    content.querySelectorAll(".doc-img-wrapper").forEach(wrapper => {
      initDocImage(wrapper);
    });
  }

  applyThreadHighlights();
  renderAnchorMarkers();
  renderSectionAnnotations();

  if (isDocEditMode()) {
    document.getElementById("docContent")?.focus();
  } else {
    document.getElementById("docContent")?.blur();
  }

  renderDocSections();
  updateDocCounts();
  renderSuggestionTray();
  scheduleDocPageDividers();
}

function getSectionStatusMeta(status = "draft") {
  const map = {
    brainstorming: {
      icon: "✦",
      label: "Brainstorming"
    },
    draft: {
      icon: "✎",
      label: "Draft"
    },
    editing: {
      icon: "◎",
      label: "Editing"
    },
    final: {
      icon: "🔒",
      label: "Final"
    }
  };

  return map[status] || map.draft;
}

function renderDocSections() {
  const list = document.getElementById("docSectionsList");
  if (!list) return;
  list.innerHTML = "";

  docSections.forEach((section, i) => {
    const item = document.createElement("div");
    item.className = "doc-section-item" + (i === activeSectionIndex ? " active" : "");

    // detect heading level from content
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = section.content || "";
    const firstHeading = tempDiv.querySelector("h1, h2, h3");
    const level = firstHeading ? parseInt(firstHeading.tagName[1]) : 3;
    item.dataset.level = level;
    item.style.paddingLeft = `${1 + (level - 1) * 4}px`;

    const fontSize = level === 1 ? "13px" : level === 2 ? "12px" : "12px";
    const fontWeight = level === 1 ? "600" : level === 2 ? "500" : "400";

    const hasNote = section.meta?.notes && section.meta.notes.trim().length > 0;
    const status = section.meta?.status || "draft";
    const statusMeta = getSectionStatusMeta(status);

    item.dataset.status = status;

    item.innerHTML = `
      <span class="doc-section-status-bar" aria-hidden="true"></span>
      <span class="doc-section-indicator" data-level="${level}">▸</span>
      <span class="doc-section-name-wrap">
        <span class="doc-section-name" contenteditable="true" spellcheck="false" style="font-size:${fontSize};font-weight:${fontWeight};">${section.title}</span>
      </span>
      <span class="doc-section-status-icon" title="${statusMeta.label}">${statusMeta.icon}</span>
      ${hasNote ? `<span class="doc-section-note-dot" title="Has notes"></span>` : ""}
      <button class="doc-section-delete" data-idx="${i}" title="Delete section">✕</button>
    `;

    item.querySelector(".doc-section-name").addEventListener("blur", (e) => {
      docSections[i].title = e.target.textContent.trim() || "Untitled";
      persistActiveDocData();
    });

    item.querySelector(".doc-section-name").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
    });

    item.querySelector(".doc-section-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      if (docSections.length <= 1) return;
      saveCurrentDocSection();
      docSections.splice(i, 1);
      if (activeSectionIndex >= docSections.length) activeSectionIndex = docSections.length - 1;
      persistActiveDocData();
      loadDocSection(activeSectionIndex);
    });

    if (hasNote) {
      const dot = item.querySelector(".doc-section-note-dot");
      dot?.addEventListener("click", (e) => {
        e.stopPropagation();
        openNoteCard(i, dot);
      });
    }

    item.addEventListener("click", (e) => {
      if (e.target.classList.contains("doc-section-delete") || e.target.classList.contains("doc-section-name")) return;
      saveCurrentDocSection();
      loadDocSection(i);
    });

    list.appendChild(item);
  });
}

function updateDocCounts() {
  const text = getCombinedDocText();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.replace(/\s/g, "").length;
  const wordEl = document.getElementById("docWordCount");
  const charEl = document.getElementById("docCharCount");
  if (wordEl) wordEl.textContent = `${words} word${words !== 1 ? "s" : ""}`;
  if (charEl) charEl.textContent = `${chars} character${chars !== 1 ? "s" : ""}`;
}

function getDocTextContent() {
  return getCombinedDocText();
}

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function updateDocStats() {
  if (!docData?.meta) return;

  const stats = normalizeDocStats(docData.meta.stats || {});
  const today = new Date().toISOString().slice(0, 10);

  const text = getDocTextContent();
  const totalWords = countWords(text);
  const previousTotal = Math.max(0, Number(stats.totalWords) || 0);
  const diff = totalWords - previousTotal;

  if (stats.lastTrackedDate !== today) {
    stats.lastTrackedDate = today;
    stats.sessionStartWords = totalWords;
  }

  if (diff > 0) {
    stats.dailyHistory = upsertDailyHistory(stats.dailyHistory, today, diff);
  }

  const todayEntry = (stats.dailyHistory || []).find((entry) => entry.date === today);

  stats.todayWords = todayEntry ? todayEntry.words : 0;
  stats.totalWords = totalWords;

  docData.meta.stats = normalizeDocStats(stats);
}

document.getElementById("docToolbar")?.addEventListener("mousedown", (e) => {
  const interactive = e.target.closest("select, input, textarea");
  if (!interactive) e.preventDefault();
});

// toolbar
document.getElementById("docToolbar")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-tool-btn");
  if (!btn) return;

  if (!canUseDocFormattingTools()) return;

  const cmd = btn.dataset.cmd;
  if (cmd) {
    const content = document.getElementById("docContent");
    if (content) {
      content.focus();
      // Ensure we have a selection or cursor in the content
      const sel = window.getSelection();
      if (!sel.rangeCount && content.textContent) {
        const range = document.createRange();
        range.selectNodeContents(content);
        range.collapse(false);
        sel.addRange(range);
      }
    }
    document.execCommand(cmd, false, null);
    document.getElementById("docContent")?.focus();
  }
});

// == Thread Color Picker ==
// == Thread Color Picker (Inspector Style) ==
document.addEventListener("DOMContentLoaded", () => {
  const colorRow = document.getElementById("docThreadColorRow");
  const colorInput = document.getElementById("docThreadColorInput");
  let selectedColor = "#ffb347";

  function selectColor(color, custom = false) {
    selectedColor = color;
    // Highlight selected swatch
    colorRow.querySelectorAll('.thread-color-swatch').forEach(btn => btn.classList.remove('selected'));
    if (custom) {
      colorRow.querySelector('.thread-color-custom').classList.add('selected');
    } else {
      const btn = colorRow.querySelector(`.thread-color-swatch[data-color="${color}"]`);
      if (btn) btn.classList.add('selected');
    }
    colorInput.value = color;
  }

  colorRow.addEventListener('click', (e) => {
    const swatch = e.target.closest('.thread-color-swatch');
    if (!swatch) return;
    if (swatch.classList.contains('thread-color-custom')) {
      colorInput.click();
      return;
    }
    const color = swatch.getAttribute('data-color');
    selectColor(color, false);
  });

  colorInput.addEventListener('input', (e) => {
    selectColor(e.target.value, true);
  });

  // Default selection
  selectColor(selectedColor, false);

  // When adding a thread, use the selected color
  document.getElementById("docThreadAddBtn")?.addEventListener("click", function(e) {
    const nameInput = document.getElementById("docThreadNameInput");
    const color = selectedColor;
    if (nameInput && nameInput.value.trim()) {
      if (typeof addThread === "function") {
        addThread(nameInput.value.trim(), color);
      }
      nameInput.value = "";
      selectColor("#ffb347", false);
    }
  });
});

document.getElementById("docHeadingSelect")?.addEventListener("change", (e) => {
  const val = e.target.value;
  const content = document.getElementById("docContent");
  if (!content) return;
  content.focus();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  // if nothing selected just format current block
  document.execCommand("formatBlock", false, val === "p" ? "p" : val);
  // reset select back to paragraph visually
  setTimeout(() => { e.target.value = "p"; }, 100);
});

document.getElementById("docInsertDivider")?.addEventListener("click", () => {
  document.execCommand("insertHTML", false, "<hr/><p><br></p>");
});

// insert image
document.getElementById("docInsertImageBtn")?.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      insertDocImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  input.click();
});

function insertDocImage(src) {
  const content = document.getElementById("docContent");
  if (!content) return;

  const wrapper = document.createElement("div");
  wrapper.className = "doc-img-wrapper";
  wrapper.contentEditable = "false";
  wrapper.style.float = "left";
  wrapper.style.width = "280px";
  wrapper.style.margin = "4px 16px 8px 0";
  wrapper.style.position = "relative";
  wrapper.style.cursor = "default";

  const img = document.createElement("img");
  img.src = src;
  img.className = "doc-img";
  img.style.width = "100%";
  img.style.display = "block";
  img.draggable = false;

  // resize handle
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "doc-img-resize";

  // float controls
  const controls = document.createElement("div");
  controls.className = "doc-img-controls";
  controls.innerHTML = `
    <button class="doc-img-ctrl doc-img-move" title="Move">⠿</button>
    <button class="doc-img-ctrl" data-float="left" title="Float left">⬱</button>
    <button class="doc-img-ctrl" data-float="none" title="No float">▣</button>
    <button class="doc-img-ctrl" data-float="right" title="Float right">⬰</button>
    <button class="doc-img-ctrl" data-action="caption" title="Add caption">T</button>
    <button class="doc-img-ctrl" data-action="delete" title="Delete">✕</button>
  `;

  // caption (hidden by default)
  const caption = document.createElement("div");
  caption.className = "doc-caption";
  caption.contentEditable = "false";
  caption.style.display = "none";
  caption.textContent = "Caption...";

  wrapper.appendChild(img);
  wrapper.appendChild(resizeHandle);
  wrapper.appendChild(controls);
  wrapper.appendChild(caption);

  // insert at cursor
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.insertNode(wrapper);
    range.setStartAfter(wrapper);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    content.appendChild(wrapper);
  }

  initDocImage(wrapper);
}

function initDocImage(wrapper) {
  const resizeHandle = wrapper.querySelector(".doc-img-resize");
  const controls = wrapper.querySelector(".doc-img-controls");
  const caption = wrapper.querySelector(".doc-caption");

  let isResizing = false;
  let isDragging = false;
  let startX, startW;
  let ghost = null;
  let dropIndicator = null;

  resizeHandle?.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startW = parseInt(wrapper.style.width || "280");
    e.preventDefault();
    e.stopPropagation();
  });

  const moveHandle = wrapper.querySelector(".doc-img-move");
  moveHandle?.addEventListener("mousedown", (e) => {
    isDragging = true;
    e.preventDefault();
    e.stopPropagation();

    // Create ghost image that follows the cursor
    ghost = wrapper.cloneNode(true);
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.opacity = "0.55";
    ghost.style.zIndex = "9999";
    ghost.style.width = wrapper.offsetWidth + "px";
    ghost.style.margin = "0";
    ghost.style.float = "none";
    ghost.style.left = e.clientX - wrapper.offsetWidth / 2 + "px";
    ghost.style.top = e.clientY - 20 + "px";
    ghost.style.boxShadow = "0 8px 24px rgba(0,0,0,0.5)";
    ghost.style.borderRadius = "4px";
    document.body.appendChild(ghost);

    // Drop indicator line
    dropIndicator = document.createElement("div");
    dropIndicator.style.cssText = `
      position: absolute; pointer-events: none; z-index: 9998;
      width: 2px; background: #aee571; border-radius: 2px;
      height: 24px; display: none;
    `;
    document.body.appendChild(dropIndicator);

    wrapper.style.opacity = "0.25";
  });

  // single mousemove handler for both resize and drag
  const onMouseMove = (e) => {
    if (isResizing) {
      const newW = Math.max(80, startW + e.clientX - startX);
      wrapper.style.width = `${newW}px`;
    }
    if (isDragging && ghost) {
      // Move ghost with cursor
      ghost.style.left = e.clientX - ghost.offsetWidth / 2 + "px";
      ghost.style.top = e.clientY - 20 + "px";

      // Show drop indicator at caret position
      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      const content = document.getElementById("docContent");
      if (range && content?.contains(range.startContainer) && dropIndicator) {
        const rect = range.getBoundingClientRect();
        dropIndicator.style.display = "block";
        dropIndicator.style.left = rect.left + "px";
        dropIndicator.style.top = rect.top - 4 + "px";
      } else if (dropIndicator) {
        dropIndicator.style.display = "none";
      }
    }
  };

  const onMouseUp = (e) => {
    if (isDragging) {
      isDragging = false;
      wrapper.style.opacity = "1";

      // Clean up ghost and indicator
      ghost?.remove();
      ghost = null;
      dropIndicator?.remove();
      dropIndicator = null;

      const content = document.getElementById("docContent");
      if (!content) return;

      const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
      if (range && content.contains(range.startContainer)) {
        wrapper.remove();
        range.insertNode(wrapper);
        // re-init since we moved it
        initDocImage(wrapper);
      }
      saveCurrentDocSection();
    }
    if (isResizing) {
      isResizing = false;
      saveCurrentDocSection();
    }
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);

  controls?.addEventListener("mousedown", (e) => {
    const btn = e.target.closest(".doc-img-ctrl");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const floatVal = btn.dataset.float;
    const action = btn.dataset.action;

    if (floatVal) {
      wrapper.style.float = floatVal;
      if (floatVal === "right") {
        wrapper.style.margin = "4px 0 8px 16px";
      } else if (floatVal === "left") {
        wrapper.style.margin = "4px 16px 8px 0";
      } else {
        wrapper.style.margin = "12px auto";
        wrapper.style.display = "block";
      }
      saveCurrentDocSection();
    }

    if (action === "caption") {
      caption.style.display = caption.style.display === "none" ? "" : "none";
      if (caption.style.display !== "none") {
        caption.contentEditable = "true";
        caption.focus();
      } else {
        caption.contentEditable = "false";
      }
    }

    if (action === "delete") {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      wrapper.remove();
      saveCurrentDocSection();
    }
  });

  wrapper.addEventListener("mouseenter", () => {
    controls.style.opacity = "1";
    resizeHandle.style.opacity = "1";
  });
  wrapper.addEventListener("mouseleave", () => {
    controls.style.opacity = "0";
    resizeHandle.style.opacity = "0";
  });
}

// insert table
document.getElementById("docInsertTableBtn")?.addEventListener("click", () => {
  const rows = 3;
  const cols = 3;
  let tableHTML = `<table class="doc-table"><thead><tr>`;
  for (let c = 0; c < cols; c++) tableHTML += `<th contenteditable="true" spellcheck="false">Column ${c + 1}</th>`;
  tableHTML += `</tr></thead><tbody>`;
  for (let r = 0; r < rows; r++) {
    tableHTML += `<tr>`;
    for (let c = 0; c < cols; c++) tableHTML += `<td contenteditable="true" spellcheck="false"></td>`;
    tableHTML += `</tr>`;
  }
  tableHTML += `</tbody></table><p><br></p>`;
  document.execCommand("insertHTML", false, tableHTML);
});

// insert quote
document.getElementById("docInsertQuoteBtn")?.addEventListener("click", () => {
  document.execCommand("insertHTML", false, `<blockquote class="doc-blockquote"><p>Quote text here...</p></blockquote><p><br></p>`);
});

// list menu
const listMenuBtn = document.getElementById("docListMenuBtn");
const listMenu = document.getElementById("docListMenu");
listMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!canUseDocFormattingTools()) return;
  const isOpen = listMenu?.classList.contains("open");

  if (isOpen) {
    listMenu?.classList.remove("open");
    setDocUIState({ activeTransient: null });
  } else {
    setActiveDocTransient("listMenu");
    listMenu?.classList.add("open");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".doc-list-wrap")) {
    listMenu?.classList.remove("open");
  }
});

listMenu?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-list-item");
  if (!btn) return;
  const cmd = btn.dataset.cmd;
  if (cmd === "checklist") {
    document.execCommand("insertHTML", false, `<ul class="doc-checklist"><li><label><input type="checkbox" /> </label></li></ul><p><br></p>`);
  } else if (cmd) {
    document.execCommand(cmd, false, null);
  }
  listMenu.classList.remove("open");
  document.getElementById("docContent")?.focus();
});

document.getElementById("docFormatMenu")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-format-item");
  if (!btn) return;

  // Submenu trigger rows are handled by their own listeners.
  if (btn.classList.contains("doc-has-submenu")) return;

  e.preventDefault();

  const format = btn.dataset.format;
  const spacing = btn.dataset.spacing;
  const cmd = btn.dataset.cmd;
  const action = btn.dataset.action;

  const needsEditMode = !!(format || spacing || cmd || action === "divider" || action === "quote");
  if (needsEditMode && !canUseDocFormattingTools()) return;

  if (format) {
    document.execCommand("formatBlock", false, format);
    document.getElementById("docContent")?.focus();
  }

  if (spacing) {
    const content = document.getElementById("docContent");
    if (content) content.style.lineHeight = spacing;
  }

  if (cmd) {
    document.execCommand(cmd, false, null);
    document.getElementById("docContent")?.focus();
  }

  if (action === "divider") {
    document.execCommand("insertHTML", false, "<hr/><p><br></p>");
    document.getElementById("docContent")?.focus();
  }

  if (action === "quote") {
    document.execCommand("insertHTML", false, `<blockquote class="doc-blockquote"><p>Quote text here...</p></blockquote><p><br></p>`);
    document.getElementById("docContent")?.focus();
  }

  if (action === "margins") {
    document.getElementById("docMarginPanel")?.classList.toggle("open");
  }

  if (action === "pagenum") {
    togglePageNumbers();
  }

  if (action === "header") {
    // coming soon — do nothing
    return;
  }

  document.getElementById("docFormatMenu")?.classList.remove("open");
});

// format menu toggle
document.getElementById("docFormatMenuBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("docFormatMenu");
  const isOpen = menu?.classList.contains("open");

  if (isOpen) {
    menu?.classList.remove("open");
    setDocUIState({ activeTransient: null });
  } else {
    setActiveDocTransient("formatMenu");
    menu?.classList.add("open");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".doc-format-wrap")) {
    document.getElementById("docFormatMenu")?.classList.remove("open");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#docInsertToggle") && !e.target.closest("#docInsertPanelEl")) {
    if (typeof closeDocInsertPanel === "function") {
      closeDocInsertPanel();
    }
  }
});


// margin panel
document.getElementById("docMarginBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("docMarginPanel")?.classList.toggle("open");
});

document.addEventListener("click", (e) => {
  if (
    !e.target.closest("#docMarginPanel") &&
    !e.target.closest("#docMarginBtn") &&
    !e.target.closest('.doc-format-item[data-action="margins"]')
  ) {
    document.getElementById("docMarginPanel")?.classList.remove("open");
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#docStatsPanel") && !e.target.closest("#docStatsToggle")) {
    document.getElementById("docStatsPanel")?.classList.remove("open");
    if (getDocUIState().activeTransient === "statsPanel") {
      setDocUIState({ activeTransient: null });
    }
  }
});

document.getElementById("docPageWidthPreset")?.addEventListener("change", (e) => {
  const val = Number(e.target.value);
  if (docPageId) {
    const settings = getDocSettings(docPageId);
    settings.pageWidth = val;
    const normalized = normalizeDocSettings(settings);
    saveDocSettings(docPageId, normalized);
    applyDocPaperSettings(normalized);
    const displayWidth = normalized.orientation === "landscape"
      ? getDocLandscapeWidth(normalized)
      : val;
    document.getElementById("docPageWidthVal").textContent = `${displayWidth}px`;
  } else {
    const page = document.querySelector(".doc-page");
    if (page) page.style.maxWidth = `${val}px`;
    document.getElementById("docPageWidthVal").textContent = `${val}px`;
  }
});

function syncDocPrintPageStyle(settings) {
  const pageSizeMap = {
    letter: "8.5in 11in",
    a4: "210mm 297mm",
    legal: "8.5in 14in"
  };
  const size = pageSizeMap[settings.paperSize] || pageSizeMap.letter;
  const orientation = settings.orientation || "portrait";
  const styleId = "docPrintPageStyle";
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@media print { @page { size: ${size} ${orientation}; margin: 0; } }`;
}

function getDocPageHeightPx(settings) {
  const MM_TO_IN = 1 / 25.4;
  const sizes = {
    letter:  { w: 8.5,            h: 11 },
    a4:      { w: 210 * MM_TO_IN, h: 297 * MM_TO_IN },
    legal:   { w: 8.5,            h: 14 }
  };
  const paper = sizes[settings.paperSize] || sizes.letter;
  const heightIn = settings.orientation === "landscape" ? paper.w : paper.h;
  return Math.round(heightIn * 96);
}

function getDocLandscapeWidth(settings) {
  const ratios = { letter: 11 / 8.5, a4: 297 / 210, legal: 14 / 8.5 };
  const ratio = ratios[settings.paperSize] || ratios.letter;
  return Math.min(Math.round((settings.pageWidth || 680) * ratio), 1100);
}

function applyDocPaperSettings(settings) {
  syncDocPrintPageStyle(settings);
  requestAnimationFrame(() => syncDocPages({ preserveSelection: false }));
}

document.getElementById("docPaperSize")?.addEventListener("change", (e) => {
  const next = String(e.target.value || "letter");
  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  settings.paperSize = next;
  const normalized = normalizeDocSettings(settings);
  applyDocPaperSettings(normalized);
  if (docPageId) saveDocSettings(docPageId, normalized);
  if (normalized.orientation === "landscape") {
    document.getElementById("docPageWidthVal").textContent = `${getDocLandscapeWidth(normalized)}px`;
  }
});

document.getElementById("docPageOrientation")?.addEventListener("change", (e) => {
  const next = String(e.target.value || "portrait");
  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  settings.orientation = next;
  const normalized = normalizeDocSettings(settings);
  applyDocPaperSettings(normalized);
  if (docPageId) saveDocSettings(docPageId, normalized);
  const displayWidth = next === "landscape"
    ? getDocLandscapeWidth(normalized)
    : normalized.pageWidth;
  document.getElementById("docPageWidthVal").textContent = `${displayWidth}px`;
});

function applyDocPageMode(settings) {
  const editor = document.getElementById("docEditor");
  const mode = settings.pageMode || "paged";
  if (editor) editor.dataset.pageMode = mode;

  // Fix live inline styles on the page shell so pageless actually grows freely
  const page = document.querySelector(".doc-page");
  const bodyWrap = page?.querySelector(".doc-page-body");
  if (page && bodyWrap) {
    if (mode === "pageless") {
      page.style.minHeight = "0";
      bodyWrap.style.minHeight = "0";
    } else {
      page.style.minHeight = "var(--doc-page-height, auto)";
      bodyWrap.style.minHeight = "var(--doc-page-body-height, auto)";
    }
  }

  requestAnimationFrame(() => syncDocPages({ preserveSelection: false }));
}

document.getElementById("docPageMode")?.addEventListener("change", (e) => {
  const next = e.target.value === "pageless" ? "pageless" : "paged";
  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  settings.pageMode = next;
  const normalized = normalizeDocSettings(settings);
  applyDocPageMode(normalized);
  if (docPageId) saveDocSettings(docPageId, normalized);
});

function applyDocPagePadding(settings) {
  requestAnimationFrame(() => syncDocPages({ preserveSelection: false }));
}

function updateDocMarginSetting(key, value, valueElId) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  const normalizedIn = Math.min(3, Math.max(0.25, Number(numeric.toFixed(2))));

  const valEl = document.getElementById(valueElId);
  if (valEl) valEl.textContent = `${normalizedIn.toFixed(2)} in`;

  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  settings[key] = normalizedIn;
  const normalizedSettings = normalizeDocSettings(settings);
  applyDocPagePadding(normalizedSettings);

  if (docPageId) {
    saveDocSettings(docPageId, normalizedSettings);
  }
}

function wireDocMarginNumberInput(inputId, key, valueId) {
  const el = document.getElementById(inputId);
  if (!el) return;

  const apply = () => {
    updateDocMarginSetting(key, el.value, valueId);
    const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({ [key]: el.value });
    const normalizedIn = Number(settings[key]);
    el.value = normalizedIn.toFixed(2);
  };

  el.addEventListener("change", apply);
  el.addEventListener("blur", apply);
}

wireDocMarginNumberInput("docPageMarginTop", "pageMarginTopIn", "docPageMarginTopVal");
wireDocMarginNumberInput("docPageMarginRight", "pageMarginRightIn", "docPageMarginRightVal");
wireDocMarginNumberInput("docPageMarginBottom", "pageMarginBottomIn", "docPageMarginBottomVal");
wireDocMarginNumberInput("docPageMarginLeft", "pageMarginLeftIn", "docPageMarginLeftVal");

document.getElementById("docPageMarginTop")?.addEventListener("input", (e) => {
  updateDocMarginSetting("pageMarginTopIn", e.target.value, "docPageMarginTopVal");
});

document.getElementById("docPageMarginRight")?.addEventListener("input", (e) => {
  updateDocMarginSetting("pageMarginRightIn", e.target.value, "docPageMarginRightVal");
});

document.getElementById("docPageMarginBottom")?.addEventListener("input", (e) => {
  updateDocMarginSetting("pageMarginBottomIn", e.target.value, "docPageMarginBottomVal");
});

document.getElementById("docPageMarginLeft")?.addEventListener("input", (e) => {
  updateDocMarginSetting("pageMarginLeftIn", e.target.value, "docPageMarginLeftVal");
});

document.querySelectorAll("[data-doc-margin-preset]")?.forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = btn.dataset.docMarginPreset;
    const map = {
      narrow: { pageMarginTopIn: 0.5, pageMarginRightIn: 0.5, pageMarginBottomIn: 0.5, pageMarginLeftIn: 0.5 },
      normal: { pageMarginTopIn: 1.0, pageMarginRightIn: 1.0, pageMarginBottomIn: 1.0, pageMarginLeftIn: 1.0 },
      wide: { pageMarginTopIn: 1.5, pageMarginRightIn: 1.25, pageMarginBottomIn: 1.5, pageMarginLeftIn: 1.25 }
    };
    const values = map[preset] || map.normal;
    const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
    Object.assign(settings, values);

    const topEl = document.getElementById("docPageMarginTop");
    const rightEl = document.getElementById("docPageMarginRight");
    const bottomEl = document.getElementById("docPageMarginBottom");
    const leftEl = document.getElementById("docPageMarginLeft");
    const normalized = normalizeDocSettings(settings);
    if (topEl) topEl.value = normalized.pageMarginTopIn;
    if (rightEl) rightEl.value = normalized.pageMarginRightIn;
    if (bottomEl) bottomEl.value = normalized.pageMarginBottomIn;
    if (leftEl) leftEl.value = normalized.pageMarginLeftIn;
    document.getElementById("docPageMarginTopVal").textContent = `${normalized.pageMarginTopIn.toFixed(2)} in`;
    document.getElementById("docPageMarginRightVal").textContent = `${normalized.pageMarginRightIn.toFixed(2)} in`;
    document.getElementById("docPageMarginBottomVal").textContent = `${normalized.pageMarginBottomIn.toFixed(2)} in`;
    document.getElementById("docPageMarginLeftVal").textContent = `${normalized.pageMarginLeftIn.toFixed(2)} in`;

    applyDocPagePadding(normalized);
    if (docPageId) saveDocSettings(docPageId, normalized);
  });
});

// doc settings (margins etc)
const DOC_SETTINGS_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.docSettings) || "sanctum_doc_settings";

function getDocSettings(pageId) {
  const all = typeof readStorageJSON === "function"
    ? readStorageJSON(DOC_SETTINGS_KEY, {})
    : JSON.parse(localStorage.getItem(DOC_SETTINGS_KEY) || "{}");

  return normalizeDocSettings(all[pageId] || {});
}

function saveDocSettings(pageId, settings) {
  const all = typeof readStorageJSON === "function"
    ? readStorageJSON(DOC_SETTINGS_KEY, {})
    : JSON.parse(localStorage.getItem(DOC_SETTINGS_KEY) || "{}");

  all[pageId] = normalizeDocSettings(settings);

  if (typeof writeStorageJSON === "function") {
    writeStorageJSON(DOC_SETTINGS_KEY, all);
  } else {
    localStorage.setItem(DOC_SETTINGS_KEY, JSON.stringify(all));
  }
}

function applyDocSettings(pageId) {
  const settings = getDocSettings(pageId);
  const normalized = normalizeDocSettings(settings);

  const pageModeEl = document.getElementById("docPageMode");
  const paperSizeEl = document.getElementById("docPaperSize");
  const orientationEl = document.getElementById("docPageOrientation");

  if (pageModeEl) pageModeEl.value = normalized.pageMode;
  if (paperSizeEl) paperSizeEl.value = normalized.paperSize;
  if (orientationEl) orientationEl.value = normalized.orientation;

  const displayWidth = normalized.orientation === "landscape"
    ? getDocLandscapeWidth(normalized)
    : normalized.pageWidth;

  const widthVal = document.getElementById("docPageWidthVal");
  if (widthVal) widthVal.textContent = `${displayWidth}px`;

  const marginMap = [
    ["docPageMarginTop", normalized.pageMarginTopIn],
    ["docPageMarginRight", normalized.pageMarginRightIn],
    ["docPageMarginBottom", normalized.pageMarginBottomIn],
    ["docPageMarginLeft", normalized.pageMarginLeftIn]
  ];

  marginMap.forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input) input.value = value;
  });

  const topVal = document.getElementById("docPageMarginTopVal");
  const rightVal = document.getElementById("docPageMarginRightVal");
  const bottomVal = document.getElementById("docPageMarginBottomVal");
  const leftVal = document.getElementById("docPageMarginLeftVal");

  if (topVal) topVal.textContent = `${normalized.pageMarginTopIn.toFixed(2)} in`;
  if (rightVal) rightVal.textContent = `${normalized.pageMarginRightIn.toFixed(2)} in`;
  if (bottomVal) bottomVal.textContent = `${normalized.pageMarginBottomIn.toFixed(2)} in`;
  if (leftVal) leftVal.textContent = `${normalized.pageMarginLeftIn.toFixed(2)} in`;

  applyDocPageMode(normalized);
  applyDocPaperSettings(normalized);
  applyDocPagePadding(normalized);
}

const docFindState = {
  query: "",
  matches: [],
  index: -1
};

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function locateOffsetInTextNodes(entries, offset) {
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    if (offset < item.end || (offset === item.end && i === entries.length - 1)) {
      return {
        node: item.node,
        offset: Math.max(0, Math.min(item.node.textContent.length, offset - item.start))
      };
    }
  }
  return null;
}

function buildDocFindMatches(query) {
  const content = document.getElementById("docContent");
  if (!content || !query) return [];

  const entries = [];
  let text = "";
  let cursor = 0;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
  let node;

  while ((node = walker.nextNode())) {
    const value = node.textContent || "";
    if (!value.length) continue;
    const start = cursor;
    cursor += value.length;
    entries.push({ node, start, end: cursor });
    text += value;
  }

  if (!entries.length || !text) return [];

  const rx = new RegExp(escapeRegExp(query), "gi");
  const matches = [];
  let m;
  while ((m = rx.exec(text))) {
    const startPos = m.index;
    const endPos = startPos + m[0].length;
    const startLoc = locateOffsetInTextNodes(entries, startPos);
    const endLoc = locateOffsetInTextNodes(entries, endPos);
    if (!startLoc || !endLoc) continue;
    const r = document.createRange();
    r.setStart(startLoc.node, startLoc.offset);
    r.setEnd(endLoc.node, endLoc.offset);
    matches.push(r);
  }

  return matches;
}

function updateDocFindCountUI() {
  const countEl = document.getElementById("docFindCount");
  if (!countEl) return;
  const total = docFindState.matches.length;
  const current = total ? docFindState.index + 1 : 0;
  countEl.textContent = `${current}/${total}`;
}

function selectDocFindMatch(index) {
  const total = docFindState.matches.length;
  if (!total) {
    docFindState.index = -1;
    updateDocFindCountUI();
    return;
  }

  const next = ((index % total) + total) % total;
  docFindState.index = next;
  const range = docFindState.matches[next].cloneRange();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  range.startContainer?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  updateDocFindCountUI();
}

function refreshDocFindMatches(selectFirst = false) {
  const input = document.getElementById("docFindInput");
  const query = (input?.value || "").trim();
  docFindState.query = query;
  docFindState.matches = buildDocFindMatches(query);
  if (!docFindState.matches.length) {
    docFindState.index = -1;
    updateDocFindCountUI();
    return;
  }
  if (selectFirst) {
    selectDocFindMatch(0);
  } else {
    if (docFindState.index < 0 || docFindState.index >= docFindState.matches.length) {
      docFindState.index = -1;
    }
    updateDocFindCountUI();
  }
}

function replaceCurrentDocFindMatch() {
  if (!docFindState.matches.length || docFindState.index < 0) return;
  const replaceText = document.getElementById("docReplaceInput")?.value || "";
  const range = docFindState.matches[docFindState.index].cloneRange();
  range.deleteContents();
  range.insertNode(document.createTextNode(replaceText));
  document.getElementById("docContent")?.normalize();
  refreshDocFindMatches(false);
  if (docFindState.matches.length) {
    selectDocFindMatch(docFindState.index);
  }
}

function replaceAllDocFindMatches() {
  if (!docFindState.matches.length) return;
  const replaceText = document.getElementById("docReplaceInput")?.value || "";
  for (let i = docFindState.matches.length - 1; i >= 0; i--) {
    const range = docFindState.matches[i].cloneRange();
    range.deleteContents();
    range.insertNode(document.createTextNode(replaceText));
  }
  document.getElementById("docContent")?.normalize();
  refreshDocFindMatches(false);
}

function keepDocFindPanelOpen() {
  const panel = document.getElementById("docFindPanel");
  if (!panel) return;
  panel.classList.add("open");
  if (getDocUIState().activeTransient !== "findPanel") {
    setDocUIState({ activeTransient: "findPanel" });
  }
}

function keepDocFindPanelOpenDeferred() {
  requestAnimationFrame(() => {
    keepDocFindPanelOpen();
  });
}

const docFindPanelEl = document.getElementById("docFindPanel");
docFindPanelEl?.addEventListener("mousedown", (e) => e.stopPropagation());
docFindPanelEl?.addEventListener("click", (e) => e.stopPropagation());

document.getElementById("docFindBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!canUseDocFormattingTools()) return;

  const panel = document.getElementById("docFindPanel");
  const isOpen = panel?.classList.contains("open");
  if (isOpen) {
    panel?.classList.remove("open");
    if (getDocUIState().activeTransient === "findPanel") {
      setDocUIState({ activeTransient: null });
    }
    return;
  }

  setActiveDocTransient("findPanel");
  panel?.classList.add("open");
  const input = document.getElementById("docFindInput");
  input?.focus();
  input?.select();
  refreshDocFindMatches(false);
});

document.getElementById("docFindCloseBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("docFindPanel")?.classList.remove("open");
  if (getDocUIState().activeTransient === "findPanel") {
    setDocUIState({ activeTransient: null });
  }
});

document.getElementById("docFindInput")?.addEventListener("input", () => {
  // While typing, only refresh counts/results and keep focus in the input.
  refreshDocFindMatches(false);
});

document.getElementById("docFindInput")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    selectDocFindMatch(docFindState.index + (e.shiftKey ? -1 : 1));
  }
});

document.getElementById("docFindPrevBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  keepDocFindPanelOpen();
  selectDocFindMatch(docFindState.index - 1);
  keepDocFindPanelOpenDeferred();
});

document.getElementById("docFindNextBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  keepDocFindPanelOpen();
  selectDocFindMatch(docFindState.index + 1);
  keepDocFindPanelOpenDeferred();
});

document.getElementById("docReplaceBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  keepDocFindPanelOpen();
  replaceCurrentDocFindMatch();
  keepDocFindPanelOpenDeferred();
});

document.getElementById("docReplaceAllBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  keepDocFindPanelOpen();
  replaceAllDocFindMatches();
  keepDocFindPanelOpenDeferred();
});

document.addEventListener("click", (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  if (!target.closest("#docFindPanel") && !target.closest("#docFindBtn")) {
    document.getElementById("docFindPanel")?.classList.remove("open");
    if (getDocUIState().activeTransient === "findPanel") {
      setDocUIState({ activeTransient: null });
    }
  }
});

document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
  if (!canUseDocFormattingTools()) return;
  e.preventDefault();
  const btn = document.getElementById("docFindBtn");
  if (btn) btn.click();
});

// == Color System ==
const DOC_RECENT_COLORS_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.recentColors)
  ? window.STORAGE_KEYS.recentColors
  : "sanctum_recent_colors";

const DOC_PALETTE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.colorPalette)
  ? window.STORAGE_KEYS.colorPalette
  : "sanctum_color_palette";

let recentColors = (typeof readStorageJSON === "function")
  ? readStorageJSON(DOC_RECENT_COLORS_KEY, [])
  : JSON.parse(localStorage.getItem("sanctum_recent_colors") || "[]");

let savedPalette = (typeof readStorageJSON === "function")
  ? readStorageJSON(DOC_PALETTE_KEY, [])
  : JSON.parse(localStorage.getItem("sanctum_color_palette") || "[]");

const DEFAULT_COLORS = [
  "#ffff00", "#ffd700", "#ff9900", "#ff6b6b",
  "#ff78c4", "#c678ff", "#78c1ff", "#a8ff78",
  "#ffffff", "#cccccc", "#888888", "#444444",
  "#1a1a1a", "#ff0000", "#00cc88", "#0066ff"
];

function saveRecentColor(color) {
  recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 8);
  if (typeof writeStorageJSON === "function") {
    writeStorageJSON(DOC_RECENT_COLORS_KEY, recentColors);
  } else {
    localStorage.setItem("sanctum_recent_colors", JSON.stringify(recentColors));
  }
}

function savePaletteColor(color) {
  if (savedPalette.includes(color)) return;
  savedPalette = [color, ...savedPalette].slice(0, 16);
  if (typeof writeStorageJSON === "function") {
    writeStorageJSON(DOC_PALETTE_KEY, savedPalette);
  } else {
    localStorage.setItem("sanctum_color_palette", JSON.stringify(savedPalette));
  }
}

function ensureDocColorDropdowns() {
  const textWrap = document.getElementById("docTextColorWrap");
  const highlightWrap = document.getElementById("docHighlightWrap");

  if (textWrap && !document.getElementById("docTextColorDropdown")) {
    const dropdown = document.createElement("div");
    dropdown.className = "doc-color-dropdown";
    dropdown.id = "docTextColorDropdown";
    textWrap.appendChild(dropdown);
  }

  if (highlightWrap && !document.getElementById("docHighlightDropdown")) {
    const dropdown = document.createElement("div");
    dropdown.className = "doc-color-dropdown";
    dropdown.id = "docHighlightDropdown";
    highlightWrap.appendChild(dropdown);
  }
}

function buildColorDropdown(dropdownEl, onColorSelect, options = {}) {
  const includeTransparent = !!options.includeTransparent;
  dropdownEl.innerHTML = "";

  const compact = document.createElement("div");
  compact.className = "doc-color-compact";

  const compactRow = document.createElement("div");
  compactRow.className = "doc-color-compact-row";

  const compactColors = [
    ...(includeTransparent ? ["transparent"] : []),
    ...recentColors.slice(0, 5)
  ];

  if (!recentColors.length) {
    compactColors.push(...DEFAULT_COLORS.slice(0, includeTransparent ? 4 : 5));
  }

  compactColors.slice(0, 6).forEach((color) => {
    const swatch = document.createElement("button");
    swatch.className = "doc-color-mini-swatch";

    if (color === "transparent") {
      swatch.classList.add("doc-color-mini-swatch-transparent");
      swatch.title = "Remove color";
      swatch.textContent = "x";
    } else {
      swatch.style.background = color;
      swatch.title = color;
    }

    swatch.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onColorSelect(color);
      if (color !== "transparent") saveRecentColor(color);
      dropdownEl.classList.remove("open");
    });

    compactRow.appendChild(swatch);
  });

  const moreBtn = document.createElement("button");
  moreBtn.className = "doc-color-more-btn";
  moreBtn.type = "button";
  moreBtn.textContent = "+";
  moreBtn.title = "More colors";
  compactRow.appendChild(moreBtn);

  compact.appendChild(compactRow);
  dropdownEl.appendChild(compact);

  const advanced = document.createElement("div");
  advanced.className = "doc-color-advanced";
  advanced.style.display = "none";

  const advancedHeader = document.createElement("div");
  advancedHeader.className = "doc-color-advanced-header";

  const backBtn = document.createElement("button");
  backBtn.className = "doc-color-back-btn";
  backBtn.type = "button";
  backBtn.textContent = "<";

  const title = document.createElement("div");
  title.className = "doc-color-advanced-title";
  title.textContent = includeTransparent ? "Highlighter Color" : "Text Color";

  advancedHeader.appendChild(backBtn);
  advancedHeader.appendChild(title);
  advanced.appendChild(advancedHeader);

  const grid = document.createElement("div");
  grid.className = "doc-color-grid";

  if (includeTransparent) {
    const clearSwatch = document.createElement("button");
    clearSwatch.className = "doc-color-swatch doc-color-swatch-transparent";
    clearSwatch.title = "Remove color";
    clearSwatch.textContent = "";
    clearSwatch.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onColorSelect("transparent");
      dropdownEl.classList.remove("open");
    });
    grid.appendChild(clearSwatch);
  }

  DEFAULT_COLORS.forEach((color) => {
    const swatch = document.createElement("button");
    swatch.className = "doc-color-swatch";
    swatch.style.background = color;
    swatch.title = color;

    swatch.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onColorSelect(color);
      saveRecentColor(color);
      dropdownEl.classList.remove("open");
    });

    grid.appendChild(swatch);
  });

  advanced.appendChild(grid);

  const customRow = document.createElement("div");
  customRow.className = "doc-color-custom-row";

  const addPresetBtn = document.createElement("button");
  addPresetBtn.className = "doc-color-add-preset";
  addPresetBtn.type = "button";
  addPresetBtn.textContent = "Add to Presets";

  const hexInput = document.createElement("input");
  hexInput.className = "doc-color-hex";
  hexInput.type = "text";
  hexInput.placeholder = "#000000";
  hexInput.maxLength = 7;

  const wheel = document.createElement("input");
  wheel.type = "color";
  wheel.className = "doc-color-wheel";
  wheel.value = "#000000";

  wheel.addEventListener("input", () => {
    hexInput.value = wheel.value.toUpperCase();
  });

  hexInput.addEventListener("input", () => {
    const value = hexInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      wheel.value = value;
    }
  });

  addPresetBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const color = /^#[0-9A-Fa-f]{6}$/.test(hexInput.value.trim())
      ? hexInput.value.trim()
      : wheel.value;

    saveRecentColor(color);
    savePaletteColor(color);
    onColorSelect(color);
    dropdownEl.classList.remove("open");
  });

  customRow.appendChild(addPresetBtn);
  customRow.appendChild(hexInput);
  customRow.appendChild(wheel);
  advanced.appendChild(customRow);

  const removeBtn = document.createElement("button");
  removeBtn.className = "doc-color-remove-btn";
  removeBtn.type = "button";
  removeBtn.textContent = includeTransparent ? "Remove Color" : "Reset Color";
  removeBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    onColorSelect(includeTransparent ? "transparent" : "");
    dropdownEl.classList.remove("open");
  });
  advanced.appendChild(removeBtn);

  dropdownEl.appendChild(advanced);

  moreBtn.addEventListener("click", (e) => {
    e.preventDefault();
    compact.style.display = "none";
    advanced.style.display = "flex";
  });

  backBtn.addEventListener("click", (e) => {
    e.preventDefault();
    advanced.style.display = "none";
    compact.style.display = "block";
  });
}

function closeDocColorPicker() {
  ["docHighlightDropdown", "docTextColorDropdown"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");

    const compact = el.querySelector(".doc-color-compact");
    const advanced = el.querySelector(".doc-color-advanced");

    if (compact) compact.style.display = "block";
    if (advanced) advanced.style.display = "none";
  });

  const active = getDocUIState().activeTransient;
  if (active === "highlightDropdown" || active === "textColorDropdown") {
    setDocUIState({ activeTransient: null });
  }
}

// Custom highlight — only touches text nodes, never block elements.
// execCommand("hiliteColor") fills entire line boxes when the range spans
// block-level elements (e.g. after Ctrl+A), producing oversized highlights.
function _docApplyHighlight(range, color) {
  const content = document.getElementById("docContent");
  if (!range || range.collapsed || !content) return;

  const removing = !color || color === "transparent";

  // Collect each text-node segment inside the range
  const segments = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
  let tn;
  while ((tn = walker.nextNode())) {
    let inside = false;
    try { inside = range.intersectsNode(tn); } catch { inside = false; }
    if (!inside) continue;
    const s = tn === range.startContainer ? range.startOffset : 0;
    const e = tn === range.endContainer   ? range.endOffset   : tn.length;
    if (s < e) segments.push({ tn, s, e });
  }

  if (removing) {
    segments.forEach(({ tn: node }) => {
      let el = node.parentElement;
      while (el && el !== content) {
        const bg = el.style && el.style.backgroundColor;
        if (el.tagName === "SPAN" && bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          el.style.removeProperty("background-color");
          if (!el.style.cssText.trim()) {
            const kids = [...el.childNodes];
            el.replaceWith(...kids);
          }
          break;
        }
        el = el.parentElement;
      }
    });
    return;
  }

  // Apply from last→first so text-node splits don't invalidate earlier offsets
  for (let i = segments.length - 1; i >= 0; i--) {
    let { tn: target, s, e } = segments[i];
    if (e < target.length) target.splitText(e);
    if (s > 0) target = target.splitText(s);

    const par = target.parentElement;
    // Reuse an existing single-child highlight span
    if (par && par !== content && par.tagName === "SPAN"
        && par.childNodes.length === 1 && par.style.backgroundColor) {
      par.style.backgroundColor = color;
    } else {
      const span = document.createElement("span");
      span.style.backgroundColor = color;
      par.insertBefore(span, target);
      span.appendChild(target);
    }
  }
}

function _docRangeCoversContent(range, content) {
  if (!range || !content) return false;
  const fullRange = document.createRange();
  fullRange.selectNodeContents(content);
  return (
    range.compareBoundaryPoints(Range.START_TO_START, fullRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0
  );
}

function _docCleanupEmptyInlineSpans(root) {
  root.querySelectorAll("span[style]").forEach((span) => {
    if (!span.getAttribute("style")?.trim()) {
      span.replaceWith(...span.childNodes);
    }
  });
}

function _docRemoveTextColorFromElement(el) {
  if (!el?.style) return;
  el.style.removeProperty("color");
  if (!el.getAttribute("style")?.trim()) {
    el.removeAttribute("style");
  }
}

function _docApplyTextColor(range, color) {
  const content = document.getElementById("docContent");
  if (!range || range.collapsed || !content) return;

  const removing = !color || color === "inherit" || color === "transparent";
  const fullDocument = _docRangeCoversContent(range, content);

  if (fullDocument) {
    const blocks = content.querySelectorAll("p,h1,h2,h3,h4,li,blockquote,td,th,figcaption,div");
    content.querySelectorAll("[style]").forEach((el) => _docRemoveTextColorFromElement(el));
    _docCleanupEmptyInlineSpans(content);

    if (removing) {
      _docRemoveTextColorFromElement(content);
      return;
    }

    content.style.color = color;
    blocks.forEach((block) => {
      block.style.color = color;
    });
    return;
  }

  const segments = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
  let tn;
  while ((tn = walker.nextNode())) {
    let inside = false;
    try { inside = range.intersectsNode(tn); } catch { inside = false; }
    if (!inside) continue;
    const s = tn === range.startContainer ? range.startOffset : 0;
    const e = tn === range.endContainer ? range.endOffset : tn.length;
    if (s < e) segments.push({ tn, s, e });
  }

  if (removing) {
    segments.forEach(({ tn: node }) => {
      let el = node.parentElement;
      while (el && el !== content) {
        if (el.style?.color) {
          _docRemoveTextColorFromElement(el);
          break;
        }
        el = el.parentElement;
      }
    });
    _docCleanupEmptyInlineSpans(content);
    return;
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    let { tn: target, s, e } = segments[i];
    if (e < target.length) target.splitText(e);
    if (s > 0) target = target.splitText(s);

    const par = target.parentElement;
    if (par && par !== content && par.tagName === "SPAN" && par.childNodes.length === 1 && par.style.color) {
      par.style.color = color;
    } else {
      const span = document.createElement("span");
      span.style.color = color;
      par.insertBefore(span, target);
      span.appendChild(target);
    }
  }
}

ensureDocColorDropdowns();

// highlight button — save selection on mousedown so the dropdown click doesn't lose it
let _savedHighlightRange = null;
document.getElementById("docHighlightBtn")?.addEventListener("mousedown", () => {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) _savedHighlightRange = sel.getRangeAt(0).cloneRange();
});

document.getElementById("docHighlightBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!canUseDocFormattingTools()) return;

  ensureDocColorDropdowns();

  const dropdown = document.getElementById("docHighlightDropdown");
  const isOpen = dropdown?.classList.contains("open");

  if (isOpen) {
    closeDocColorPicker();
    return;
  }

  buildColorDropdown(dropdown, (color) => {
    const content = document.getElementById("docContent");
    if (!content) return;

    // Restore the saved selection
    const savedRange = _savedHighlightRange;
    _savedHighlightRange = null;
    if (savedRange) {
      content.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }

    // Apply using our text-node-only implementation
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : savedRange;
    _docApplyHighlight(range, color === "transparent" ? null : color);

    document.getElementById("docHighlightPreview")?.style.setProperty(
      "background", color === "transparent" ? "#ffffff" : color
    );
    content.focus();
  }, { includeTransparent: true });

  document.getElementById("docTextColorDropdown")?.classList.remove("open");
  dropdown?.classList.add("open");
  setActiveDocTransient("highlightDropdown");
});

// text color button — save selection on mousedown
let _savedTextColorRange = null;
document.getElementById("docTextColorBtn")?.addEventListener("mousedown", () => {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) _savedTextColorRange = sel.getRangeAt(0).cloneRange();
});

document.getElementById("docTextColorBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!canUseDocFormattingTools()) return;

  ensureDocColorDropdowns();

  const dropdown = document.getElementById("docTextColorDropdown");
  const isOpen = dropdown?.classList.contains("open");

  if (isOpen) {
    closeDocColorPicker();
    return;
  }

  buildColorDropdown(dropdown, (color) => {
    const content = document.getElementById("docContent");
    if (!content) return;
    const savedRange = _savedTextColorRange;
    _savedTextColorRange = null;
    if (savedRange) {
      content.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    const docMain = document.getElementById("docMain");
    const savedScroll = docMain ? docMain.scrollTop : 0;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : savedRange;
    _docApplyTextColor(range, color);
    const preview = document.getElementById("docTextColorPreview");
    if (preview) {
      if (color) preview.style.setProperty("background", color);
      else preview.style.removeProperty("background");
    }
    if (docMain) docMain.scrollTop = savedScroll;
    saveCurrentDocSection();
    content.focus();
  }, { includeTransparent: false });

  document.getElementById("docHighlightDropdown")?.classList.remove("open");
  dropdown?.classList.add("open");
  setActiveDocTransient("textColorDropdown");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".doc-color-wrap")) {
    ["docHighlightDropdown", "docTextColorDropdown"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.classList.remove("open");

      const compact = el.querySelector(".doc-color-compact");
      const advanced = el.querySelector(".doc-color-advanced");

      if (compact) compact.style.display = "block";
      if (advanced) advanced.style.display = "none";
    });

    const active = getDocUIState().activeTransient;
    if (active === "highlightDropdown" || active === "textColorDropdown") {
      setDocUIState({ activeTransient: null });
    }
  }
});

function renderColorPresets() {
  // built on demand in buildColorDropdown
}

// font family — save range so focus loss from clicking dropdown doesn't lose selection
let _savedDocFontFamilyRange = null;
document.getElementById("docFontSelect")?.addEventListener("mousedown", () => {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    _savedDocFontFamilyRange = sel.getRangeAt(0).cloneRange();
  }
});
document.getElementById("docFontSelect")?.addEventListener("change", (e) => {
  const content = document.getElementById("docContent");
  if (!content) return;
  content.focus();
  const range = _savedDocFontFamilyRange;
  _savedDocFontFamilyRange = null;
  if (range) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand("fontName", false, e.target.value);
  syncDocToolbarFromSelection();
});

// font size — save range on mousedown (before focus leaves the editor)
let _savedDocFontRange = null;
document.getElementById("docFontSizeSelect")?.addEventListener("mousedown", () => {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    _savedDocFontRange = sel.getRangeAt(0).cloneRange();
  }
});

function _removeFontSizeFromParents(textNode, content) {
  let el = textNode?.parentElement;
  while (el && el !== content) {
    if (el.tagName === "SPAN" && el.style && el.style.fontSize) {
      el.style.removeProperty("font-size");
      if (!el.style.cssText.trim()) {
        const kids = [...el.childNodes];
        el.replaceWith(...kids);
      }
      break;
    }
    el = el.parentElement;
  }
}

// Apply font size to only text-node segments in a range.
// This avoids wrapping block elements, which causes vertical drift/reflow.
function _docApplyFontSize(range, fontSize) {
  const content = document.getElementById("docContent");
  if (!content || !range || range.collapsed) return false;

  const segments = [];
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null);
  let tn;
  while ((tn = walker.nextNode())) {
    let inside = false;
    try { inside = range.intersectsNode(tn); } catch { inside = false; }
    if (!inside) continue;
    const s = tn === range.startContainer ? range.startOffset : 0;
    const e = tn === range.endContainer ? range.endOffset : tn.length;
    if (s < e) segments.push({ tn, s, e });
  }
  if (!segments.length) return false;

  for (let i = segments.length - 1; i >= 0; i--) {
    let { tn: target, s, e } = segments[i];
    if (e < target.length) target.splitText(e);
    if (s > 0) target = target.splitText(s);

    _removeFontSizeFromParents(target, content);

    const par = target.parentElement;
    if (par && par !== content && par.tagName === "SPAN" && par.childNodes.length === 1) {
      par.style.fontSize = fontSize;
    } else {
      const span = document.createElement("span");
      span.style.fontSize = fontSize;
      par.insertBefore(span, target);
      span.appendChild(target);
    }
  }

  return true;
}

document.getElementById("docFontSizeSelect")?.addEventListener("change", (e) => {
  const content = document.getElementById("docContent");
  if (!content) return;
  content.focus();
  const range = _savedDocFontRange;
  _savedDocFontRange = null;

  const sel = window.getSelection();
  if (range) {
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const activeRange = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
  if (activeRange && !activeRange.collapsed) {
    _docApplyFontSize(activeRange, e.target.value);
    syncDocToolbarFromSelection();
  } else {
    // Fallback: apply to the current block at caret, not the whole document.
    const node = activeRange?.startContainer || sel?.anchorNode;
    const block = node && node.nodeType === Node.TEXT_NODE
      ? node.parentElement?.closest("p,h1,h2,h3,h4,blockquote,li")
      : node?.closest?.("p,h1,h2,h3,h4,blockquote,li");
    if (block) block.style.fontSize = e.target.value;
    syncDocToolbarFromSelection();
  }
});

// highlight — toggles off if the selection start is already inside a highlighted span
function _getSelectionHighlight() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const boundary = document.getElementById("docContent");
  while (node && node !== boundary) {
    const bg = node.style?.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
    node = node.parentElement;
  }
  return null;
}

function _mapFontFamilyToToolbarValue(fontFamily = "") {
  const f = String(fontFamily).toLowerCase().replace(/["']/g, "");
  if (f.includes("times new roman")) return "'Times New Roman', serif";
  if (f.includes("courier new")) return "'Courier New', monospace";
  if (f.includes("palatino")) return "'Palatino', serif";
  if (f.includes("garamond")) return "'Garamond', serif";
  if (f.includes("arial")) return "'Arial', sans-serif";
  if (f.includes("system-ui") || f.includes("segoe ui")) return "system-ui, sans-serif";
  if (f.includes("georgia")) return "Georgia, serif";
  return "";
}

function _closestFontSizeOption(fontSizePx) {
  const size = parseFloat(fontSizePx);
  if (!Number.isFinite(size)) return "";

  const options = [10, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48, 64];
  let best = options[0];
  let bestDiff = Math.abs(size - best);

  options.forEach((n) => {
    const diff = Math.abs(size - n);
    if (diff < bestDiff) {
      best = n;
      bestDiff = diff;
    }
  });

  return `${best}px`;
}

function syncDocToolbarFromSelection() {
  const content = document.getElementById("docContent");
  if (!content) return;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  let node = sel.anchorNode;
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!(node instanceof Element) || !content.contains(node)) return;

  const computed = window.getComputedStyle(node);

  const fontSelect = document.getElementById("docFontSelect");
  if (fontSelect) {
    const mapped = _mapFontFamilyToToolbarValue(computed.fontFamily);
    if (mapped && Array.from(fontSelect.options).some((o) => o.value === mapped)) {
      fontSelect.value = mapped;
    }
  }

  const sizeSelect = document.getElementById("docFontSizeSelect");
  if (sizeSelect) {
    const closest = _closestFontSizeOption(computed.fontSize);
    if (closest && Array.from(sizeSelect.options).some((o) => o.value === closest)) {
      sizeSelect.value = closest;
    }
  }

  const textPreview = document.getElementById("docTextColorPreview");
  if (textPreview && computed.color) {
    textPreview.style.background = computed.color;
  }

  const highlightPreview = document.getElementById("docHighlightPreview");
  if (highlightPreview) {
    const highlight = _getSelectionHighlight();
    highlightPreview.style.background = highlight || "#ffffff";
  }

  const spacingSelect = document.getElementById("docLineSpacing");
  if (spacingSelect) {
    const lh = computed.lineHeight;
    const fs = parseFloat(computed.fontSize) || 15;
    let ratio = 1.8;
    if (lh && lh !== "normal") {
      const px = parseFloat(lh);
      if (Number.isFinite(px) && fs > 0) ratio = px / fs;
    }
    const options = [1.4, 1.8, 2.2, 2.8];
    const best = options.reduce((a, b) => Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a, options[0]);
    spacingSelect.value = String(best);
  }
}

document.addEventListener("selectionchange", () => {
  const content = document.getElementById("docContent");
  if (!content) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const node = sel.anchorNode;
  if (!node) return;
  if (content.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node)) {
    if (!sel.isCollapsed) {
      saveDocAnnotationSelection(sel.getRangeAt(0));
    }
    syncDocToolbarFromSelection();
  }
});

// line spacing
document.getElementById("docLineSpacing")?.addEventListener("change", (e) => {
  const content = document.getElementById("docContent");
  if (content) content.style.lineHeight = e.target.value;
});

document.getElementById("docAddSection")?.addEventListener("click", () => {
  saveCurrentDocSection();
  docSections.push(normalizeDocSection({}, docSections.length));
  persistActiveDocData();
  loadDocSection(docSections.length - 1);
});

document.getElementById("docToggleSidebar")?.addEventListener("click", () => {
  const state = getDocUIState();
  setDocUIState({ sectionsOpen: !state.sectionsOpen });
});

function scheduleDocAutosave() {
  clearTimeout(window._docSaveTimer);
  window._docSaveTimer = setTimeout(() => saveCurrentDocSection(), 800);
}

function normalizePastedColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "transparent") return "transparent";
  return raw;
}

function normalizePastedFontSize(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.endsWith("px")) return raw;
  if (raw.endsWith("pt")) {
    const pt = parseFloat(raw);
    if (!Number.isFinite(pt)) return "";
    return `${Math.round(pt * 1.3333)}px`;
  }
  if (/^\d+(\.\d+)?$/.test(raw)) return `${raw}px`;

  return "";
}

function normalizePastedFontFamily(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw
    .split(",")
    .map(part => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function extractAllowedInlineStyles(styleText = "", options = {}) {
  const { allowBlockSpacing = false } = options;

  const probe = document.createElement("span");
  probe.setAttribute("style", styleText);

  const out = [];

  const color = normalizePastedColor(probe.style.color);
  if (color) out.push(`color:${color}`);

  const backgroundColor = normalizePastedColor(probe.style.backgroundColor);
  if (backgroundColor) out.push(`background-color:${backgroundColor}`);

  const fontSize = normalizePastedFontSize(probe.style.fontSize);
  if (fontSize) out.push(`font-size:${fontSize}`);

  const fontFamily = normalizePastedFontFamily(probe.style.fontFamily);
  if (fontFamily) out.push(`font-family:${fontFamily}`);

  const fontWeight = String(probe.style.fontWeight || "").trim();
  if (fontWeight) out.push(`font-weight:${fontWeight}`);

  const fontStyle = String(probe.style.fontStyle || "").trim();
  if (fontStyle) out.push(`font-style:${fontStyle}`);

  const textDecoration = String(probe.style.textDecoration || probe.style.textDecorationLine || "").trim();
  if (textDecoration) out.push(`text-decoration:${textDecoration}`);

  const textAlign = String(probe.style.textAlign || "").trim();
  if (textAlign) out.push(`text-align:${textAlign}`);

  const lineHeight = String(probe.style.lineHeight || "").trim();
  if (lineHeight) out.push(`line-height:${lineHeight}`);

  if (allowBlockSpacing) {
    const marginLeft = String(probe.style.marginLeft || "").trim();
    if (marginLeft) out.push(`margin-left:${marginLeft}`);
  }

  return out.join("; ");
}

function cleanPastedNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const tag = node.tagName.toLowerCase();

  const BLOCK_TAGS = new Set([
    "p", "div", "br", "h1", "h2", "h3",
    "ul", "ol", "li",
    "blockquote", "hr",
    "table", "thead", "tbody", "tr", "th", "td"
  ]);

  const INLINE_TAGS = new Set([
    "strong", "b", "em", "i", "u", "s", "span", "a", "mark"
  ]);

  const DROP_TAGS = new Set([
    "meta", "style", "script", "iframe", "object", "embed", "svg", "xml"
  ]);

  if (DROP_TAGS.has(tag)) {
    return null;
  }

  let outTag = tag;

  if (!BLOCK_TAGS.has(tag) && !INLINE_TAGS.has(tag)) {
    outTag = "span";
  }

  if (outTag === "b") outTag = "strong";
  if (outTag === "i") outTag = "em";
  if (outTag === "mark") outTag = "span";

  const el = document.createElement(outTag);

  if (outTag === "a") {
    const href = node.getAttribute("href") || "";
    if (href) {
      el.setAttribute("href", href);
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }

  if (outTag === "table") {
    el.classList.add("doc-table");
  }

  const cleanStyle = extractAllowedInlineStyles(
    node.getAttribute("style") || "",
    {
      allowBlockSpacing: outTag === "li" || outTag === "blockquote"
    }
  );

  if (cleanStyle) {
    el.setAttribute("style", cleanStyle);
  }

  if ((outTag === "th" || outTag === "td") && node.hasAttribute("colspan")) {
    el.setAttribute("colspan", node.getAttribute("colspan"));
  }

  if ((outTag === "th" || outTag === "td") && node.hasAttribute("rowspan")) {
    el.setAttribute("rowspan", node.getAttribute("rowspan"));
  }

  Array.from(node.childNodes).forEach((child) => {
    const cleaned = cleanPastedNode(child);
    if (cleaned) el.appendChild(cleaned);
  });

  if (outTag === "span" && !el.getAttribute("style") && !el.getAttribute("href")) {
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    return frag;
  }

  return el;
}

function isVisuallyEmptyElement(el) {
  if (!el) return true;
  if (el.querySelector("img, table, hr, ul, ol, blockquote")) return false;
  return !(el.textContent || "").replace(/\u00a0/g, " ").trim();
}

function normalizeCleanPastedBlocks(root) {
  root.querySelectorAll("p, h1, h2, h3, blockquote, ul, ol, table").forEach((el) => {
    const tag = el.tagName.toLowerCase();

    if (tag === "p") {
      el.style.margin = "0 0 1em 0";
    }

    if (tag === "h1") {
      el.style.margin = "1.2em 0 0.55em 0";
    }

    if (tag === "h2") {
      el.style.margin = "1.05em 0 0.5em 0";
    }

    if (tag === "h3") {
      el.style.margin = "0.95em 0 0.45em 0";
    }

    if (tag === "blockquote") {
      if (!el.style.marginLeft) {
        el.style.margin = "1em 0";
      }
    }

    if (tag === "ul" || tag === "ol") {
      el.style.margin = "0.7em 0 1em 0";
      el.style.paddingLeft = "1.5em";
    }

    if (tag === "table") {
      el.classList.add("doc-table");
      el.style.margin = "1em 0";
      el.style.width = "100%";
    }
  });

  root.querySelectorAll("p").forEach((p) => {
    if (isVisuallyEmptyElement(p)) {
      p.remove();
    }
  });

  root.querySelectorAll("a").forEach((a) => {
    if (!a.getAttribute("href")) {
      const frag = document.createDocumentFragment();
      while (a.firstChild) frag.appendChild(a.firstChild);
      a.replaceWith(frag);
      return;
    }

    if (!a.style.color) {
      a.style.color = "inherit";
    }
  });

  root.querySelectorAll("table").forEach((table) => {
    if (!table.querySelector("tbody")) {
      const body = document.createElement("tbody");
      Array.from(table.querySelectorAll(":scope > tr")).forEach((tr) => body.appendChild(tr));
      if (body.children.length) table.appendChild(body);
    }
  });

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const p = document.createElement("p");
      p.style.margin = "0 0 1em 0";
      p.textContent = node.textContent;
      root.replaceChild(p, node);
    }
  });
}

function normalizePastedTextToHTML(text = "") {
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const chunks = raw.split(/\n{2,}/);

  return chunks
    .map(chunk => {
      const lines = chunk.split("\n");

      // bullet list
      if (lines.every(line => /^\s*([•*-]|◦)\s+/.test(line))) {
        return `<ul>${lines.map(line => {
          const body = line.replace(/^\s*([•*-]|◦)\s+/, "");
          return `<li>${escapeHTML(body)}</li>`;
        }).join("")}</ul>`;
      }

      // numbered list
      if (lines.every(line => /^\s*\d+[.)]\s+/.test(line))) {
        return `<ol>${lines.map(line => {
          const body = line.replace(/^\s*\d+[.)]\s+/, "");
          return `<li>${escapeHTML(body)}</li>`;
        }).join("")}</ol>`;
      }

      return `<p>${lines.map(line => escapeHTML(line)).join("<br>")}</p>`;
    })
    .join("");
}

function escapeHTML(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizePastedTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach((textNode) => {
    textNode.textContent = (textNode.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\t/g, "    ");
  });
}

function unwrapElement(el) {
  const frag = document.createDocumentFragment();
  while (el.firstChild) frag.appendChild(el.firstChild);
  el.replaceWith(frag);
}

function cleanupGoogleDocsArtifacts(root) {
  root.querySelectorAll("span").forEach((span) => {
    const style = (span.getAttribute("style") || "").trim();
    const hasOnlyWhitespace = !(span.textContent || "").replace(/\u00a0/g, " ").trim();

    if (!style && !span.getAttribute("href")) {
      unwrapElement(span);
      return;
    }

    if (hasOnlyWhitespace && !style) {
      span.remove();
    }
  });

  root.querySelectorAll("a").forEach((a) => {
    const href = (a.getAttribute("href") || "").trim();
    const text = (a.textContent || "").replace(/\u00a0/g, " ").trim();

    if (!href || !text) {
      unwrapElement(a);
    }
  });

  root.querySelectorAll("p, h1, h2, h3, li, blockquote").forEach((el) => {
    el.innerHTML = el.innerHTML.replace(/(?:<br>\s*){3,}/g, "<br><br>");
  });

  root.querySelectorAll("p").forEach((p) => {
    const text = (p.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!text && !p.querySelector("img, table, br")) {
      p.remove();
    }
  });
}

function normalizePastedLooseLists(root) {
  const children = Array.from(root.children);
  let i = 0;

  while (i < children.length) {
    const el = children[i];
    if (!el || el.tagName?.toLowerCase() !== "p") {
      i++;
      continue;
    }

    const text = (el.textContent || "").trim();

    if (/^([•*-]|◦)\s+/.test(text)) {
      const ul = document.createElement("ul");
      ul.style.margin = "0.7em 0 1em 0";
      ul.style.paddingLeft = "1.5em";

      let j = i;
      while (children[j] && children[j].tagName?.toLowerCase() === "p") {
        const t = (children[j].textContent || "").trim();
        if (!/^([•*-]|◦)\s+/.test(t)) break;

        const li = document.createElement("li");
        li.innerHTML = children[j].innerHTML.replace(/^([•*-]|◦)\s+/, "");
        ul.appendChild(li);
        children[j].remove();
        j++;
      }

      root.insertBefore(ul, children[i] || null);
      i = j;
      continue;
    }

    if (/^\d+[.)]\s+/.test(text)) {
      const ol = document.createElement("ol");
      ol.style.margin = "0.7em 0 1em 0";
      ol.style.paddingLeft = "1.5em";

      let j = i;
      while (children[j] && children[j].tagName?.toLowerCase() === "p") {
        const t = (children[j].textContent || "").trim();
        if (!/^\d+[.)]\s+/.test(t)) break;

        const li = document.createElement("li");
        li.innerHTML = children[j].innerHTML.replace(/^\d+[.)]\s+/, "");
        ol.appendChild(li);
        children[j].remove();
        j++;
      }

      root.insertBefore(ol, children[i] || null);
      i = j;
      continue;
    }

    i++;
  }
}


function sanitizeRichPasteHTML(rawHTML) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHTML || "";

  wrapper.querySelectorAll("meta, style, script, iframe, object, embed, svg, xml").forEach((el) => el.remove());

  wrapper.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();

      if (
        name === "style" ||
        name === "href" ||
        name === "colspan" ||
        name === "rowspan"
      ) {
        return;
      }

      el.removeAttribute(attr.name);
    });
  });

  const cleanedRoot = document.createElement("div");

  Array.from(wrapper.childNodes).forEach((child) => {
    const cleaned = cleanPastedNode(child);
    if (cleaned) cleanedRoot.appendChild(cleaned);
  });

  cleanedRoot.querySelectorAll("div").forEach((div) => {
    if (!div.children.length && !(div.textContent || "").trim()) {
      div.replaceWith(document.createElement("p"));
      return;
    }

    const p = document.createElement("p");
    const style = div.getAttribute("style");
    if (style) p.setAttribute("style", style);

    while (div.firstChild) p.appendChild(div.firstChild);
    div.replaceWith(p);
  });

  normalizePastedTextNodes(cleanedRoot);
  cleanupGoogleDocsArtifacts(cleanedRoot);
  normalizePastedLooseLists(cleanedRoot);
  normalizeCleanPastedBlocks(cleanedRoot);

  cleanedRoot.querySelectorAll("span").forEach((span) => {
    if (!span.getAttribute("style") && !span.getAttribute("href")) {
      unwrapElement(span);
    }
  });

  return cleanedRoot.innerHTML;
}


function insertRichHTMLAtCursor(html) {
  const content = document.getElementById("docContent");
  if (!content) return;

  content.focus();

  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const temp = document.createElement("div");
    temp.innerHTML = html;

    const frag = document.createDocumentFragment();
    let lastNode = null;

    while (temp.firstChild) {
      lastNode = frag.appendChild(temp.firstChild);
    }

    range.insertNode(frag);

    if (lastNode) {
      const after = document.createRange();
      after.setStartAfter(lastNode);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
    }
  } else {
    document.execCommand("insertHTML", false, html);
  }
}

function handleDocRichPaste(e) {
  if (!isDocEditMode()) return;

  const html = e.clipboardData?.getData("text/html");
  const text = e.clipboardData?.getData("text/plain");

  if (!html && !text) return;

  e.preventDefault();

   if (html) {
    const cleanHTML = sanitizeRichPasteHTML(html);
    insertRichHTMLAtCursor(cleanHTML);
  } else {
    const textHTML = normalizePastedTextToHTML(text || "");
    insertRichHTMLAtCursor(textHTML);
  }


  updateDocCounts();
  closeSlashMenu();
  scheduleDocAutosave();
}

const docPagesHostEl = document.getElementById("docPagesHost");

docPagesHostEl?.addEventListener("mousedown", (e) => {
  if (!isDocEditMode()) return;
  if (e.target.closest(".doc-content, .doc-header, .doc-footer-area")) return;

  const body = e.target.closest(".doc-page-body");
  if (!body) return;

  const page = body.closest(".doc-page");
  const content = page?.querySelector(".doc-content");
  if (!page || !content) return;

  setActiveDocPage(page);
  requestAnimationFrame(() => {
    content.focus();
    setCaretByTextOffset(content, Number.MAX_SAFE_INTEGER);
  });
});

docPagesHostEl?.addEventListener("focusin", (e) => {
  const page = e.target.closest(".doc-page");
  if (!page) return;
  setActiveDocPage(page);
});

docPagesHostEl?.addEventListener("input", (e) => {
  if (!e.target.closest(".doc-content, .doc-header, .doc-footer-area")) return;

  if (e.target.closest(".doc-content")) {
    normalizeDocUnderscoreRule();
    updateDocCounts();
    clearSavedDocAnnotationSelection();
    checkSlashCommand();
    scheduleDocAutosave();
    scheduleDocPageDividers();
  } else {
    updateDocCounts();
    saveCurrentDocSection();
    scheduleDocPageDividers();
  }
});

docPagesHostEl?.addEventListener("keyup", (e) => {
  if (e.target.closest(".doc-content")) {
    syncDocToolbarFromSelection();
  }
});

docPagesHostEl?.addEventListener("mouseup", (e) => {
  if (e.target.closest(".doc-content")) {
    syncDocToolbarFromSelection();
  }
});

docPagesHostEl?.addEventListener("beforeinput", (e) => {
  if (e.target.closest(".doc-content")) {
    handleAnnotateBeforeInput(e);
  }
});

docPagesHostEl?.addEventListener("paste", (e) => {
  if (!e.target.closest(".doc-content")) return;
  if (getCurrentDocMode() !== "annotate") return;

  const text = e.clipboardData?.getData("text/plain") || "";
  if (!text) return;

  e.preventDefault();
  insertAnnotateSuggestionText(text);
});

docPagesHostEl?.addEventListener("click", (e) => {
  const targetContent = e.target.closest(".doc-content");
  if (!targetContent) return;
  const page = targetContent.closest(".doc-page");
  if (page) setActiveDocPage(page);

  const span = closestSuggestionSpan(e.target);
  if (!span) return;

  activeInlineSuggestionId = span.dataset.suggestId || null;
  markSuggestionSelection(activeInlineSuggestionId);
  renderSuggestionTray();
});

docPagesHostEl?.addEventListener("keydown", (e) => {
  if (!e.target.closest(".doc-content")) return;

  if (e.key === "Escape" && slashMenuActive) {
    closeSlashMenu();
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    document.execCommand("insertHTML", false, "&nbsp;&nbsp;&nbsp;&nbsp;");
  }

  // Ctrl+A — select all text content but skip image/gif wrappers
  if ((e.ctrlKey || e.metaKey) && e.key === "a") {
    const content = document.getElementById("docContent");
    if (!content) return;
    e.preventDefault();

    // Collect all text nodes and inline elements that aren't image wrappers
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement?.closest(".doc-img-wrapper")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let firstNode = null;
    let lastNode = null;
    let node;
    while ((node = walker.nextNode())) {
      if (!firstNode) firstNode = node;
      lastNode = node;
    }

    if (!firstNode || !lastNode) return;

    const range = document.createRange();
    range.setStart(firstNode, 0);
    range.setEnd(lastNode, lastNode.textContent.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

docPagesHostEl?.addEventListener("paste", (e) => {
  if (!e.target.closest(".doc-content")) return;
  handleDocRichPaste(e);
  scheduleDocRepagination(600);
});

// slash commands
const SLASH_COMMANDS = [
  { label: "Heading 1",  icon: "H1", action: () => document.execCommand("formatBlock", false, "h1") },
  { label: "Heading 2",  icon: "H2", action: () => document.execCommand("formatBlock", false, "h2") },
  { label: "Heading 3",  icon: "H3", action: () => document.execCommand("formatBlock", false, "h3") },
  { label: "Paragraph",  icon: "¶",  action: () => document.execCommand("formatBlock", false, "p") },
  { label: "Divider",    icon: "─",  action: () => document.execCommand("insertHTML", false, "<hr/><p><br></p>") },
  { label: "Bullet List",icon: "•",  action: () => document.execCommand("insertUnorderedList") },
  { label: "Numbered List", icon: "1.", action: () => document.execCommand("insertOrderedList") },
  { label: "Bold",       icon: "B",  action: () => document.execCommand("bold") },
  { label: "Italic",     icon: "I",  action: () => document.execCommand("italic") },
];

function checkSlashCommand() {
  if (!isDocEditMode()) {
    closeSlashMenu();
    return;
  }

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(document.getElementById("docContent"));
  preRange.setEnd(range.startContainer, range.startOffset);
  const text = preRange.toString();
  const slashIdx = text.lastIndexOf("/");
  if (slashIdx === -1 || text.slice(slashIdx).includes(" ")) {
    closeSlashMenu();
    return;
  }
  const query = text.slice(slashIdx + 1).toLowerCase();
  showSlashMenu(query, range);
}

function showSlashMenu(query, range) {
  let menu = document.getElementById("slashMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "slashMenu";
    menu.className = "slash-menu";
    document.body.appendChild(menu);
  }

  const matches = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(query));
  if (!matches.length) { closeSlashMenu(); return; }

  menu.innerHTML = "";
  matches.forEach((cmd, i) => {
    const item = document.createElement("div");
    item.className = "slash-menu-item" + (i === 0 ? " active" : "");
    item.innerHTML = `<span class="slash-icon">${cmd.icon}</span><span class="slash-label">${cmd.label}</span>`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      executeSlashCommand(cmd, query);
    });
    menu.appendChild(item);
  });

  const rect = range.getBoundingClientRect();
  menu.style.display = "block";
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${rect.left + window.scrollX}px`;
    slashMenuActive = true;
  setDocUIState({ activeTransient: "slash" });
}

function executeSlashCommand(cmd, query) {
  const content = document.getElementById("docContent");
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(content);
  preRange.setEnd(range.startContainer, range.startOffset);
  const text = preRange.toString();
  const slashIdx = text.lastIndexOf("/");

  const delRange = document.createRange();
  delRange.setStart(range.startContainer, range.startOffset - (text.length - slashIdx));
  delRange.setEnd(range.startContainer, range.startOffset);
  delRange.deleteContents();

  cmd.action();
  closeSlashMenu();
  content.focus();
}

function closeSlashMenu() {
  slashMenuActive = false;
  const menu = document.getElementById("slashMenu");
  if (menu) menu.style.display = "none";

  if (getDocUIState().activeTransient === "slash") {
    setDocUIState({ activeTransient: null });
  }
}

document.addEventListener("keydown", (e) => {
  const menu = document.getElementById("slashMenu");
  if (!menu || menu.style.display === "none") return;
  const items = menu.querySelectorAll(".slash-menu-item");
  const active = menu.querySelector(".slash-menu-item.active");
  let idx = Array.from(items).indexOf(active);

  if (e.key === "ArrowDown") {
    e.preventDefault();
    idx = (idx + 1) % items.length;
    items.forEach(i => i.classList.remove("active"));
    items[idx].classList.add("active");
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    idx = (idx - 1 + items.length) % items.length;
    items.forEach(i => i.classList.remove("active"));
    items[idx].classList.add("active");
  }
  if (e.key === "Enter" && active) {
    e.preventDefault();
    active.dispatchEvent(new MouseEvent("mousedown"));
  }
});

document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#slashMenu")) closeSlashMenu();
});


// == Inspector Panel ==
function openInspector() {
  if (!canOpenDocInspector()) return;
  closeDocTransientUI();
  setDocUIState({ inspectorOpen: true, activeTransient: null });
  document.getElementById("docInspector").classList.add("open");
  renderInspector();
}

function closeInspector() {
  setDocUIState({ inspectorOpen: false });
  document.getElementById("docInspector").classList.remove("open");
}

function getAllInspectorLinkablePages() {
  const pages = Array.isArray(window.userPages) ? window.userPages : [];
  const domains = Array.isArray(window.userDomains) ? window.userDomains : [];
  return [...pages, ...domains];
}

function getInspectorCandidates(category) {
  const all = getAllInspectorLinkablePages();

  if (category === "pov") {
    return all.filter(item => ["character", "person", "none"].includes(item.category || "none"));
  }

  if (category === "location") {
    return all.filter(item => ["location", "place", "none"].includes(item.category || "none"));
  }

  return [];
}

function resolveInspectorLink(category, value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  return getInspectorCandidates(category).find(item => (item.title || "").trim().toLowerCase() === text) || null;
}

function getInspectorLinkedPageById(id) {
  if (!id) return null;
  return getAllInspectorLinkablePages().find(item => item.id === id) || null;
}

function renderInspectorLinkState(type) {
  const section = docSections[activeSectionIndex];
  if (!section) return;

  const meta = section.meta || {};
  const value = type === "pov" ? (meta.pov || "") : (meta.location || "");
  const linkedId = type === "pov" ? (meta.povId || "") : (meta.locationId || "");

  const stateEl = document.getElementById(type === "pov" ? "inspectorPOVLinkState" : "inspectorLocationLinkState");
  const openBtn = document.getElementById(type === "pov" ? "inspectorPOVOpenBtn" : "inspectorLocationOpenBtn");
  const createBtn = document.getElementById(type === "pov" ? "inspectorPOVCreateBtn" : "inspectorLocationCreateBtn");

  if (!stateEl || !openBtn || !createBtn) return;

  const linkedPage = getInspectorLinkedPageById(linkedId);

  if (linkedPage) {
    stateEl.textContent = `Linked to ${linkedPage.title}`;
    openBtn.style.display = "";
    createBtn.style.display = "none";
    return;
  }

  if (value.trim()) {
    const exactMatch = resolveInspectorLink(type, value);
    if (exactMatch) {
      stateEl.textContent = `Matched to ${exactMatch.title}`;
      openBtn.style.display = "";
      createBtn.style.display = "none";
    } else {
      stateEl.textContent = "No linked page yet";
      openBtn.style.display = "none";
      createBtn.style.display = "";
    }
    return;
  }

  stateEl.textContent = "No linked page";
  openBtn.style.display = "none";
  createBtn.style.display = "none";
}

function createInspectorLinkedPage(type) {
  const input = document.getElementById(type === "pov" ? "inspectorPOV" : "inspectorLocation");
  const name = input?.value.trim();
  if (!name) return;

  const existing = resolveInspectorLink(type, name);
  if (existing) {
    saveInspectorData();
    renderInspector();
    return;
  }

  const currentDocPage = (Array.isArray(window.userPages) ? window.userPages : []).find(p => p.id === docPageId);
  const parentId = currentDocPage?.parent || "home";
  const category = type === "pov" ? "character" : "location";

  if (typeof createPage !== "function") return;

  const newPage = createPage(name, parentId, "board-canvas", category, "page", {
    reuseExisting: true,
    currentPageId: docPageId,
    includeCurrentPage: true
  });

  if (typeof ensureParentLinkCard === "function") {
    ensureParentLinkCard(newPage);
  }

  if (type === "pov") {
    document.getElementById("inspectorPOV").value = newPage.title;
  } else {
    document.getElementById("inspectorLocation").value = newPage.title;
  }

  saveInspectorData();
  renderInspector();

  if (typeof renderSidebarDomains === "function") {
    renderSidebarDomains();
  }
}

function getInspectorSuggestionsByCategory(category) {
  return getInspectorCandidates(category)
    .map(item => item.title)
    .filter(Boolean);
}

function fillInspectorDatalist(id, values) {
  const list = document.getElementById(id);
  if (!list) return;

  list.innerHTML = "";
  Array.from(new Set(values)).forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    list.appendChild(option);
  });
}

function getInspectorSuggestInput(type) {
  return document.getElementById(type === "pov" ? "inspectorPOV" : "inspectorLocation");
}

function closeInspectorSuggestPopup() {
  document.getElementById("docInspectorSuggestPopup")?.remove();
}

function renderInspectorSuggestPopup(type) {
  const input = getInspectorSuggestInput(type);
  if (!input || document.activeElement !== input) {
    closeInspectorSuggestPopup();
    return;
  }

  const term = (input.value || "").trim().toLowerCase();
  const suggestions = getInspectorSuggestionsByCategory(type)
    .filter((title) => {
      const t = String(title || "").trim().toLowerCase();
      if (!t) return false;
      return term ? t.includes(term) : true;
    })
    .slice(0, 7);

  if (!suggestions.length) {
    closeInspectorSuggestPopup();
    return;
  }

  let popup = document.getElementById("docInspectorSuggestPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "docInspectorSuggestPopup";
    popup.className = "doc-inspector-suggest-pop";
    document.body.appendChild(popup);
  }

  popup.innerHTML = "";
  suggestions.forEach((title) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "doc-inspector-suggest-item";
    item.textContent = title;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = title;
      saveInspectorData();
      renderInspectorLinkState(type);
      closeInspectorSuggestPopup();
      input.focus();
    });
    popup.appendChild(item);
  });

  const rect = input.getBoundingClientRect();
  const width = Math.max(140, Math.min(190, rect.width));
  const gap = 8;
  const leftBias = 28;

  let left = rect.left - width - gap - leftBias;
  if (left < 8) {
    left = rect.right + gap;
  }
  if (left + width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - width - 8);
  }

  let top = rect.top;
  if (top + 150 > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - 158);
  }

  popup.style.width = `${width}px`;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function renderInspector() {
  const section = docSections[activeSectionIndex];
  if (!section) return;

  const meta = section.meta || {};

  const sectionTitleEl = document.getElementById("inspectorSectionTitle");
  const statusEl = document.getElementById("inspectorStatus");
  const purposeEl = document.getElementById("inspectorPurpose");
  const povEl = document.getElementById("inspectorPOV");
  const locationEl = document.getElementById("inspectorLocation");
  const chapterEl = document.getElementById("inspectorChapter");
  const notesEl = document.getElementById("inspectorNotes");

  if (sectionTitleEl) sectionTitleEl.value = section.title || "";
  if (statusEl) statusEl.value = meta.status || "draft";
  if (purposeEl) purposeEl.value = meta.purpose || "";
  if (povEl) povEl.value = meta.pov || "";
  if (locationEl) locationEl.value = meta.location || "";
  if (chapterEl) chapterEl.value = meta.chapter || "";
  if (notesEl) notesEl.value = meta.notes || "";

  povEl?.removeAttribute("list");
  locationEl?.removeAttribute("list");

  fillInspectorDatalist("inspectorPOVList", getInspectorSuggestionsByCategory("pov"));
  fillInspectorDatalist("inspectorLocationList", getInspectorSuggestionsByCategory("location"));
  renderInspectorLinkState("pov");
  renderInspectorLinkState("location");
}

function saveInspectorData() {
  const section = docSections[activeSectionIndex];
  if (!section) return;

  section.title = document.getElementById("inspectorSectionTitle")?.value.trim() || section.title || `Section ${activeSectionIndex + 1}`;

  const povValue = document.getElementById("inspectorPOV")?.value.trim() || "";
  const locationValue = document.getElementById("inspectorLocation")?.value.trim() || "";

  const povMatch = resolveInspectorLink("pov", povValue);
  const locationMatch = resolveInspectorLink("location", locationValue);

  section.meta = {
    ...(section.meta || {}),
    status: document.getElementById("inspectorStatus")?.value || "draft",
    purpose: document.getElementById("inspectorPurpose")?.value.trim() || "",
    pov: povValue,
    povId: povMatch?.id || "",
    location: locationValue,
    locationId: locationMatch?.id || "",
    chapter: document.getElementById("inspectorChapter")?.value.trim() || "",
    notes: document.getElementById("inspectorNotes")?.value || ""
  };

  persistActiveDocData();
  renderDocSections();

  if (activeSectionIndex >= 0) {
    const current = docSections[activeSectionIndex];
    const titleEl = document.getElementById("docSectionTitle");
    if (titleEl && current) {
      titleEl.textContent = current.title || "";
    }
  }

  renderInspectorLinkState("pov");
  renderInspectorLinkState("location");
}

document.getElementById("docToggleInspector")?.addEventListener("click", () => {
  if (!canOpenDocInspector()) return;
  inspectorOpen ? closeInspector() : openInspector();
});

document.getElementById("docInspectorCloseBtn")?.addEventListener("click", () => {
  closeInspector();
});

[
  "inspectorSectionTitle",
  "inspectorStatus",
  "inspectorPurpose",
  "inspectorPOV",
  "inspectorLocation",
  "inspectorChapter",
  "inspectorNotes"
].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;

  const evt = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(evt, () => {
    saveInspectorData();
  });
});

document.getElementById("inspectorPOVOpenBtn")?.addEventListener("click", () => {
  const section = docSections[activeSectionIndex];
  const linkedId = section?.meta?.povId;
  if (linkedId && typeof openPage === "function") {
    openPage(linkedId);
  }
});

document.getElementById("inspectorLocationOpenBtn")?.addEventListener("click", () => {
  const section = docSections[activeSectionIndex];
  const linkedId = section?.meta?.locationId;
  if (linkedId && typeof openPage === "function") {
    openPage(linkedId);
  }
});

document.getElementById("inspectorPOVCreateBtn")?.addEventListener("click", () => {
  createInspectorLinkedPage("pov");
});

document.getElementById("inspectorLocationCreateBtn")?.addEventListener("click", () => {
  createInspectorLinkedPage("location");
});

[
  ["inspectorPOV", "pov"],
  ["inspectorLocation", "location"]
].forEach(([id, type]) => {
  const input = document.getElementById(id);
  if (!input) return;

  input.removeAttribute("list");

  input.addEventListener("focus", () => {
    renderInspectorSuggestPopup(type);
  });

  input.addEventListener("input", () => {
    renderInspectorSuggestPopup(type);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeInspectorSuggestPopup();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (!document.activeElement?.closest("#docInspectorSuggestPopup")) {
        closeInspectorSuggestPopup();
      }
    }, 120);
  });
});

document.addEventListener("mousedown", (e) => {
  if (!e.target.closest("#docInspectorSuggestPopup") && !e.target.closest("#inspectorPOV") && !e.target.closest("#inspectorLocation")) {
    closeInspectorSuggestPopup();
  }
});

window.addEventListener("resize", () => {
  closeInspectorSuggestPopup();
});

document.getElementById("docExportCanvasBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();

  const menu = document.getElementById("docExportMenu");
  if (!menu) return;

  const isOpen = menu.classList.contains("open");

  closeDocTransientUI("exportMenu");

  if (isOpen) {
    menu.classList.remove("open");
    setDocUIState({ activeTransient: null });
    return;
  }

  menu.classList.add("open");
  setDocUIState({ activeTransient: "exportMenu" });
});

document.getElementById("docExportExistingCanvas")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("docExportMenu")?.classList.remove("open");
  setDocUIState({ activeTransient: null });

  if (typeof showExistingCanvasPicker === "function") {
    showExistingCanvasPicker();
  }
});

document.getElementById("docExportNewCanvas")?.addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("docExportMenu")?.classList.remove("open");
  setDocUIState({ activeTransient: null });

  const title =
    (docData?.meta?.title && docData.meta.title.trim()) ||
    (typeof userPages !== "undefined"
      ? userPages.find((p) => p.id === docPageId)?.title
      : "") ||
    "Exported Canvas";

  const allParents = [
    ...(typeof userDomains !== "undefined" ? userDomains.map(d => ({ id: d.id, title: `⌂ ${d.title}` })) : []),
    ...(typeof userPages !== "undefined"
      ? userPages
          .filter(p => p.id !== docPageId)
          .map(p => ({ id: p.id, title: `${p.icon || "📄"} ${p.title}` }))
      : []),
  ];

  const picker = document.createElement("div");
  picker.className = "thread-picker";
  picker.style.position = "fixed";
  picker.style.top = "50%";
  picker.style.left = "50%";
  picker.style.transform = "translate(-50%, -50%)";
  picker.style.zIndex = "3000";
  picker.style.minWidth = "240px";
  picker.style.maxHeight = "320px";
  picker.style.overflowY = "auto";
  picker.innerHTML = `<div class="thread-picker-label">Place canvas inside...</div>`;

  allParents.forEach(parent => {
    const item = document.createElement("div");
    item.className = "thread-picker-item";
    item.textContent = parent.title;
    item.addEventListener("mousedown", (ev) => {
      ev.preventDefault();
      picker.remove();

      if (typeof createPage === "function") {
        const newPage = createPage(title, parent.id, "board-canvas", "none", "page", {
          reuseExisting: true,
          currentPageId: docPageId,
          includeCurrentPage: true
        });

        if (typeof addParentLinkCardForPage === "function") {
          addParentLinkCardForPage(newPage, parent.id);
        } else if (typeof ensureParentLinkCard === "function") {
          ensureParentLinkCard(newPage);
        }

        exportToCanvas(newPage.id, true);
      }
    });
    picker.appendChild(item);
  });

  const cancel = document.createElement("div");
  cancel.className = "thread-picker-item";
  cancel.style.borderTop = "1px solid #2a2a2a";
  cancel.style.color = "var(--muted3)";
  cancel.textContent = "Cancel";
  cancel.addEventListener("mousedown", () => picker.remove());
  picker.appendChild(cancel);

  document.body.appendChild(picker);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#docExportCanvasBtn") && !e.target.closest("#docExportMenu")) {
    document.getElementById("docExportMenu")?.classList.remove("open");
    if (getDocUIState().activeTransient === "exportMenu") {
      setDocUIState({ activeTransient: null });
    }
  }
});

// update inspector when switching sections — handled in combined patch below

// == Section Note Dots ==
function openNoteCard(sectionIndex, anchorEl) {
  // remove existing
  document.getElementById("docNoteCard")?.remove();

  const section = docSections[sectionIndex];
  if (!section) return;
  const meta = section.meta || {};

  const card = document.createElement("div");
  card.className = "doc-note-card";
  card.id = "docNoteCard";
  card.innerHTML = `
    <div class="doc-note-card-title">Section Note</div>
    <textarea class="doc-note-card-textarea" placeholder="Add a note...">${meta.notes || ""}</textarea>
    <div class="doc-note-card-actions">
      <button class="doc-note-card-btn expand">Open Inspector</button>
      <button class="doc-note-card-btn save">Save</button>
    </div>
  `;

  // position near anchor
  const rect = anchorEl.getBoundingClientRect();
  card.style.top = `${rect.bottom + 6}px`;
  card.style.left = `${rect.left}px`;

  card.querySelector(".save").addEventListener("click", () => {
    if (!section.meta) section.meta = {};
    section.meta.notes = card.querySelector("textarea").value;
    persistActiveDocData();
    renderDocSections();
    card.remove();
  });

  card.querySelector(".expand").addEventListener("click", () => {
    if (!section.meta) section.meta = {};
    section.meta.notes = card.querySelector("textarea").value;
    persistActiveDocData();
    card.remove();
    loadDocSection(sectionIndex);
    openInspector();
  });

  document.body.appendChild(card);

  // close on outside click
  setTimeout(() => {
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#docNoteCard")) card.remove();
    }, { once: true });
  }, 0);
}

// == Annotation Layer ==
let annotationMode = false;
let currentAnnotationColor = "#ffff00";
let annotationTool = ""; // "" | highlight | underline | squiggle | circle | bracket | note | wc | cl | rw | sd | np | move

const DOC_ANNOTATION_TOOL_DEFAULT_COLORS = {
};

function getDocAnnotationTool() {
  return annotationTool || "";
}

function getDocAnnotationColor() {
  return currentAnnotationColor;
}

function syncExternalDocAnnotateDockButtons() {
  if (typeof window.syncDocAnnotateDockButtons === "function") {
    window.syncDocAnnotateDockButtons();
  }
}

function applyDocAnnotationToolToSelection(tool, options = {}) {
  const { allowSaved = true, color = currentAnnotationColor } = options;
  if (!tool || tool === "note") return false;

  const range = getDocAnnotationSelectionRange({
    allowSaved,
    requestedTool: tool
  });
  if (!range) return false;

  return !!createMarkupFromSelection(tool, color, { rangeOverride: range });
}

function setDocAnnotationTool(tool, options = {}) {
  const { applyToSelection = false } = options;
  annotationTool = typeof tool === "string" ? tool : "";

  if (DOC_ANNOTATION_TOOL_DEFAULT_COLORS[annotationTool]) {
    currentAnnotationColor = DOC_ANNOTATION_TOOL_DEFAULT_COLORS[annotationTool];
  }

  syncAnnotationToolbarState();
  syncExternalDocAnnotateDockButtons();

  if (applyToSelection && annotationTool && annotationTool !== "note") {
    applyDocAnnotationToolToSelection(annotationTool, {
      allowSaved: true,
      color: currentAnnotationColor
    });
  }
}

function setDocAnnotationColor(color) {
  if (!color) return;
  currentAnnotationColor = color;
  syncAnnotationToolbarState();
  syncExternalDocAnnotateDockButtons();
}

function clearDocSectionAnnotationsFromDock() {
  clearActiveSectionAnnotations();
  renderSectionAnnotations();
  renderSuggestionTray();
}

function undoLastDocSectionAnnotationFromDock() {
  const items = getActiveSectionAnnotations();
  if (!Array.isArray(items) || !items.length) return false;

  setActiveSectionAnnotations(items.slice(0, -1));
  renderSectionAnnotations();
  renderSuggestionTray();
  return true;
}

window.getDocAnnotationTool = getDocAnnotationTool;
window.getDocAnnotationColor = getDocAnnotationColor;
window.getDocSectionAnnotationCount = getDocSectionAnnotationCount;
window.setDocAnnotationTool = setDocAnnotationTool;
window.setDocAnnotationColor = setDocAnnotationColor;
window.clearDocSectionAnnotationsFromDock = clearDocSectionAnnotationsFromDock;
window.undoLastDocSectionAnnotationFromDock = undoLastDocSectionAnnotationFromDock;

document.addEventListener("keydown", (e) => {
  if (!annotationMode) return;
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
  if (e.shiftKey) return;

  const active = document.activeElement;
  if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)) {
    return;
  }

  const didUndo = undoLastDocSectionAnnotationFromDock();
  if (didUndo) {
    e.preventDefault();
  }
});


function getDocAnnotationLayer() {
  return document.getElementById("docAnnotationLayer");
}

function clearRenderedSectionAnnotations() {
  const layer = getDocAnnotationLayer();
  if (!layer) return;
  layer.innerHTML = "";
}

function syncAnnotationToolbarPosition() {
  const toolbar = document.getElementById("annotationToolbar");
  if (!toolbar) return;

  const switcher = document.getElementById("docViewSwitcher");
  const editor = document.getElementById("docEditor");
  const annotateActive = getCurrentDocMode() === "annotate"
    && !!editor?.classList.contains("active")
    && !!switcher
    && switcher.offsetParent !== null;

  if (!annotateActive) {
    toolbar.style.display = "none";
    return;
  }

  const rect = switcher.getBoundingClientRect();
  toolbar.style.display = "flex";
  toolbar.style.top = `${Math.max(rect.bottom + 8, 12)}px`;
  toolbar.style.right = `${Math.max(window.innerWidth - rect.right, 12)}px`;
}

function syncAnnotationToolbarState() {
  const toolbar = document.getElementById("annotationToolbar");
  if (!toolbar) return;

  toolbar.querySelectorAll(".ann-tool-btn[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === annotationTool);
  });

  toolbar.querySelectorAll(".ann-color-swatch").forEach((swatch) => {
    swatch.classList.toggle("active", swatch.dataset.color === currentAnnotationColor);
  });
}

window.syncAnnotationToolbarPosition = syncAnnotationToolbarPosition;
window.addEventListener("resize", syncAnnotationToolbarPosition);
document.addEventListener("scroll", syncAnnotationToolbarPosition, true);

function renderSectionAnnotations() {
  const layer = document.getElementById("docAnnotationLayer");
  if (!layer) return;

  layer.innerHTML = "";
  const page = document.querySelector(".doc-page");
  const content = document.getElementById("docContent");
  const pageRect = page?.getBoundingClientRect() || null;
  const layerRect = layer.getBoundingClientRect();
  const legacyOffsetLeft = pageRect ? (layerRect.left - pageRect.left) : 0;
  const legacyOffsetTop = pageRect ? (layerRect.top - pageRect.top) : 0;

  function mapRectToLayer(rect, item) {
    if (!rect || typeof rect !== "object") return null;
    if (item?.coordSpace === "annotation-layer") return { ...rect };
    return {
      ...rect,
      left: rect.left - legacyOffsetLeft,
      top: rect.top - legacyOffsetTop
    };
  }

  function mapPointToLayer(point, item) {
    if (!point || typeof point !== "object") return null;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (item?.coordSpace === "annotation-layer") return { x, y };
    return {
      x: x - legacyOffsetLeft,
      y: y - legacyOffsetTop
    };
  }

  const sourceItems = getActiveSectionAnnotations().map((item, index) => ({
    ...item,
    rects: Array.isArray(item.rects)
      ? item.rects.map((rect) => mapRectToLayer(rect, item)).filter(Boolean)
      : [],
    moveFrom: mapPointToLayer(item.moveFrom, item),
    moveTo: mapPointToLayer(item.moveTo, item),
    _order: index
  }));
  const items = [...sourceItems].sort((a, b) => {
    const aPriority = a?.tool === "rw" ? 0 : 1;
    const bPriority = b?.tool === "rw" ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a._order || 0) - (b._order || 0);
  });
  const rwMaskRects = sourceItems
    .filter((it) => it && (it.tool === "wc" || it.tool === "cl"))
    .flatMap((it) => Array.isArray(it.rects) ? it.rects : []);

  function getRWVisibleSegments(rect) {
    return subtractMaskRectsFromRect(rect, rwMaskRects);
  }

  function getLaterInlineMaskRects(item) {
    if (!item || (item.tool !== "wc" && item.tool !== "cl")) return [];
    const opposite = item.tool === "wc" ? "cl" : "wc";
    return sourceItems
      .filter((it) => it._order > item._order && it.tool === opposite)
      .flatMap((it) => Array.isArray(it.rects) ? it.rects : []);
  }

  let contentLeft = 0;
  let contentRight = 680;

  if (content) {
    const contentRect = content.getBoundingClientRect();
    contentLeft = contentRect.left - layerRect.left;
    contentRight = contentRect.right - layerRect.left;
  }

  items.forEach((item) => {
    const rects = Array.isArray(item.rects) ? item.rects : [];
    const primaryRect = getPrimaryRectFromRects(rects);

    if (item.tool === "highlight") {
      rects.forEach((rect) => {
        const mark = document.createElement("div");
        mark.className = "ann-highlight";
        mark.style.left = `${rect.left}px`;
        mark.style.top = `${rect.top}px`;
        mark.style.width = `${rect.width}px`;
        mark.style.height = `${rect.height}px`;
        mark.style.background = item.color || "#ffff00";
        layer.appendChild(mark);
      });
      return;
    }

    if (item.tool === "underline") {
      rects.forEach((rect) => {
        const mark = document.createElement("div");
        mark.className = "ann-underline-mark";
        mark.style.left = `${rect.left}px`;
        mark.style.top = `${rect.top}px`;
        mark.style.width = `${rect.width}px`;
        mark.style.height = `${rect.height}px`;
        mark.style.color = item.color || "#ffffff";
        layer.appendChild(mark);
      });
      return;
    }

    if (item.tool === "squiggle" || item.tool === "cl") {
      const maskRects = item.tool === "cl" ? getLaterInlineMaskRects(item) : [];
      rects.forEach((rect) => {
        const visibleSegments = item.tool === "cl"
          ? subtractMaskRectsFromRect(rect, maskRects)
          : [{ ...rect }];
        visibleSegments.forEach((seg) => {
        const mark = document.createElement("div");
        mark.className = item.tool === "cl"
          ? "ann-underline-mark"
          : "ann-underline-mark squiggle";
        mark.style.left = `${seg.left}px`;
        mark.style.top = `${seg.top + seg.height - 2}px`;
        mark.style.width = `${seg.width}px`;
        mark.style.height = `3px`;
        mark.style.color = item.color || "#ffb86b";
        layer.appendChild(mark);
        });
      });
      if (primaryRect) {
        const label = document.createElement("div");
        label.className = "ann-side-label ann-side-label--above";
        label.dataset.tool = "cl";
        label.textContent = "CL";
        label.style.left = `${primaryRect.left}px`;
        label.style.top = `${primaryRect.top}px`;
        layer.appendChild(label);
      }
      return;
    }

    if (item.tool === "wc") {
      // Highlight each rect like a colored background
      const maskRects = getLaterInlineMaskRects(item);
      rects.forEach((rect) => {
        const visibleSegments = subtractMaskRectsFromRect(rect, maskRects);
        visibleSegments.forEach((seg) => {
        const mark = document.createElement("div");
        mark.className = "ann-highlight";
        mark.style.left = `${seg.left}px`;
        mark.style.top = `${seg.top}px`;
        mark.style.width = `${seg.width}px`;
        mark.style.height = `${seg.height}px`;
        mark.style.background = "#a8c96c";
        mark.style.opacity = "0.28";
        layer.appendChild(mark);
        });
      });
      if (primaryRect) {
        const label = document.createElement("div");
        label.className = "ann-side-label ann-side-label--above";
        label.dataset.tool = "wc";
        label.textContent = "WC";
        label.style.left = `${primaryRect.left}px`;
        label.style.top = `${primaryRect.top}px`;
        layer.appendChild(label);
      }
      return;
    }

    if (item.tool === "rw") {
      const first = rects[0];
      const last = rects[rects.length - 1];
      if (first && last) {
        const totalHeight = (last.top + last.height) - first.top;

        // Squiggly underline across each line
        rects.forEach((rect) => {
          const visibleSegments = getRWVisibleSegments(rect);
          visibleSegments.forEach((seg) => {
            const u = document.createElement("div");
            u.className = "ann-underline-mark rw-squiggle";
            u.style.left = `${seg.left}px`;
            u.style.top = `${seg.top + seg.height - 1}px`;
            u.style.width = `${seg.width}px`;
            u.style.height = `3px`;
            u.style.color = "#8fb0ff";
            layer.appendChild(u);
          });
        });

        // Determine which side has more content using content-area center
        const avgCenter = rects.reduce((sum, r) => sum + r.left + r.width / 2, 0) / rects.length;
        const contentCenter = (contentLeft + contentRight) / 2;
        const onRight = avgCenter > contentCenter;

        if (onRight) {
          // ] bracket pinned to content right edge, never mid-line
          const bracketLeft = contentRight + 6;
          const mark = document.createElement("div");
          mark.className = "ann-bracket-mark ann-bracket-mark--right";
          mark.style.left = `${bracketLeft}px`;
          mark.style.top = `${first.top}px`;
          mark.style.width = `8px`;
          mark.style.height = `${totalHeight}px`;
          mark.style.color = "#8fb0ff";
          layer.appendChild(mark);

          const label = document.createElement("div");
          label.className = "ann-side-label";
          label.dataset.tool = "rw";
          label.textContent = "RW";
          label.style.left = `${bracketLeft + 12}px`;
          label.style.top = `${first.top + totalHeight / 2}px`;
          layer.appendChild(label);
        } else {
          // [ bracket pinned to content left edge, never mid-line
          const bracketLeft = contentLeft - 14;
          const mark = document.createElement("div");
          mark.className = "ann-bracket-mark";
          mark.style.left = `${bracketLeft}px`;
          mark.style.top = `${first.top}px`;
          mark.style.width = `8px`;
          mark.style.height = `${totalHeight}px`;
          mark.style.color = "#8fb0ff";
          layer.appendChild(mark);

          const label = document.createElement("div");
          label.className = "ann-side-label";
          label.dataset.tool = "rw";
          label.textContent = "RW";
          label.style.left = `${bracketLeft - 22}px`;
          label.style.top = `${first.top + totalHeight / 2}px`;
          layer.appendChild(label);
        }
      }
      return;
    }

    if (item.tool === "sd") {
      if (primaryRect) {
        const note = document.createElement("div");
        note.className = "ann-side-note";
        note.textContent = item.noteLabel || "SD";
        note.style.left = `${primaryRect.left + primaryRect.width + 18}px`;
        note.style.top = `${primaryRect.top - 2}px`;
        layer.appendChild(note);
      }
      return;
    }

    if (item.tool === "np") {
      if (primaryRect) {
        const mark = document.createElement("div");
        mark.className = "ann-np-mark";
        mark.style.left = `${primaryRect.left}px`;
        mark.style.top = `${primaryRect.top + primaryRect.height / 2}px`;
        layer.appendChild(mark);
      }
      return;
    }

    if (item.tool === "move" && item.moveFrom && item.moveTo) {
      const from = document.createElement("div");
      from.className = "ann-move-anchor";
      from.style.left = `${item.moveFrom.x}px`;
      from.style.top = `${item.moveFrom.y}px`;

      const to = document.createElement("div");
      to.className = "ann-move-anchor";
      to.style.left = `${item.moveTo.x}px`;
      to.style.top = `${item.moveTo.y}px`;

      const dx = item.moveTo.x - item.moveFrom.x;
      const dy = item.moveTo.y - item.moveFrom.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const arrow = document.createElement("div");
      arrow.className = "ann-move-arrow";
      arrow.style.left = `${item.moveFrom.x}px`;
      arrow.style.top = `${item.moveFrom.y}px`;
      arrow.style.width = `${len}px`;
      arrow.style.transform = `rotate(${angle}deg)`;

      layer.appendChild(arrow);
      layer.appendChild(from);
      layer.appendChild(to);

      return;
    }

    if (item.tool === "circle") {
      rects.forEach((rect) => {
        const mark = document.createElement("div");
        mark.className = "ann-circle-mark";
        mark.style.left = `${rect.left - 4}px`;
        mark.style.top = `${rect.top - 3}px`;
        mark.style.width = `${rect.width + 8}px`;
        mark.style.height = `${rect.height + 6}px`;
        mark.style.color = item.color || "#ffffff";
        layer.appendChild(mark);
      });
      return;
    }

    if (item.tool === "bracket") {
      const first = rects[0];
      const last = rects[rects.length - 1];
      if (first && last) {
        const mark = document.createElement("div");
        mark.className = "ann-bracket-mark";
        mark.style.left = `${first.left - 10}px`;
        mark.style.top = `${first.top}px`;
        mark.style.width = `8px`;
        mark.style.height = `${(last.top + last.height) - first.top}px`;
        mark.style.color = item.color || "#ffffff";
        layer.appendChild(mark);
      }
      return;
    }

    if (item.type === "sticky") {
      const note = document.createElement("div");
      note.className = "ann-sticky";
      note.dataset.annotationId = item.id;
      note.style.left = `${item.left}px`;
      note.style.top = `${item.top}px`;
      note.innerHTML = `
        <div class="ann-sticky-header">
          <span class="ann-sticky-drag">⠿</span>
          <button class="ann-sticky-close">✕</button>
        </div>
        <textarea class="ann-sticky-body" placeholder="Note..."></textarea>
      `;

      const textarea = note.querySelector(".ann-sticky-body");
      if (textarea) textarea.value = item.text || "";

      bindStickyAnnotationEvents(note, item.id);
      layer.appendChild(note);
    }
  });
}

function showAnnotationToolbar() {
  let toolbar = document.getElementById("annotationToolbar");
  if (toolbar) {
    syncAnnotationToolbarState();
    syncAnnotationToolbarPosition();
    return;
  }

  toolbar = document.createElement("div");
  toolbar.id = "annotationToolbar";
  toolbar.className = "annotation-toolbar";
  toolbar.innerHTML = `
    <button class="ann-tool-btn" data-tool="highlight" title="Highlight">H</button>
    <button class="ann-tool-btn" data-tool="underline" title="Underline">U</button>
    <button class="ann-tool-btn" data-tool="squiggle" title="Squiggly underline">〰</button>
    <button class="ann-tool-btn" data-tool="circle" title="Circle">◯</button>
    <button class="ann-tool-btn" data-tool="bracket" title="Bracket">}</button>
    <button class="ann-tool-btn" data-tool="note" title="Sticky note">🗒</button>

    <div class="ann-color-row">
      <button class="ann-color-swatch active" data-color="#ffff00" style="background:#ffff00;"></button>
      <button class="ann-color-swatch" data-color="#8ec5ff" style="background:#8ec5ff;"></button>
      <button class="ann-color-swatch" data-color="#a7f3a1" style="background:#a7f3a1;"></button>
      <button class="ann-color-swatch" data-color="#ff9ecb" style="background:#ff9ecb;"></button>
      <button class="ann-color-swatch" data-color="#ffb86b" style="background:#ffb86b;"></button>
    </div>

    <button class="ann-tool-btn" id="annClearBtn" title="Clear section annotations">Clear</button>
  `;

  // position below the topbar view switcher
  toolbar.style.position = "fixed";
  toolbar.style.top = "56px";
  toolbar.style.right = "16px";

  document.body.appendChild(toolbar);

  toolbar.querySelectorAll(".ann-tool-btn[data-tool]").forEach(btn => {
    btn.addEventListener("mousedown", (e) => {
      // Keep document selection intact when clicking a tool button.
      e.preventDefault();
    });

    btn.addEventListener("click", () => {
      setDocAnnotationTool(btn.dataset.tool, { applyToSelection: true });
    });
  });

  toolbar.querySelectorAll(".ann-color-swatch").forEach(swatch => {
    swatch.addEventListener("click", () => {
      setDocAnnotationColor(swatch.dataset.color);
    });
  });

  document.getElementById("annClearBtn")?.addEventListener("click", () => {
    if (!confirm("Clear all annotations in this section?")) return;
    clearDocSectionAnnotationsFromDock();
  });

  syncAnnotationToolbarState();
  syncAnnotationToolbarPosition();
}

function hideAnnotationToolbar() {
  const toolbar = document.getElementById("annotationToolbar");
  if (toolbar) toolbar.style.display = "none";
}

let _docAnnotateApplyFrame = null;

function scheduleDocAnnotateSelectionApply() {
  if (_docAnnotateApplyFrame !== null) cancelAnimationFrame(_docAnnotateApplyFrame);
  _docAnnotateApplyFrame = requestAnimationFrame(() => {
    _docAnnotateApplyFrame = null;
    applyDocAnnotationToolToSelection(annotationTool, {
      allowSaved: false,
      color: currentAnnotationColor
    });
  });
}

function handleDocAnnotateMouseup(e) {
  if (!annotationMode) return;
  if (annotationTool === "note") return;
  if (e.target?.closest?.("#annotationToolbar, #docAnnotatePanelEl, #docAnnotateColorsPanelEl")) return;

  const range = getDocSelectionRangeInsideContent();
  if (!range) return;

  const visualTools = ["highlight", "underline", "squiggle", "circle", "bracket"];
  const shorthandTools = ["wc", "cl", "rw", "sd", "np", "move"];

  if (visualTools.includes(annotationTool)) {
    scheduleDocAnnotateSelectionApply();
    return;
  }

  if (shorthandTools.includes(annotationTool)) {
    scheduleDocAnnotateSelectionApply();
  }
}

document.addEventListener("mouseup", handleDocAnnotateMouseup);

document.getElementById("docPagesHost")?.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".doc-content")) return;
  if (!annotationMode) return;
  if (annotationTool !== "note") return;
  if (e.target.closest(".ann-sticky")) return;

  placeStickyNote(e.clientX, e.clientY);
});

function placeStickyNote(x, y) {
  const layer = document.getElementById("docAnnotationLayer");
  if (!layer) return;

  const layerRect = layer.getBoundingClientRect();

  const item = pushActiveSectionAnnotation({
    type: "sticky",
    color: currentAnnotationColor,
    left: x - layerRect.left,
    top: y - layerRect.top,
    text: ""
  });

  if (!item) return;
  renderSectionAnnotations();
}

function createVisualAnnotationFromSelection(tool, color) {
  const range = getDocSelectionRangeInsideContent();
  if (!range) return null;

  const sel = window.getSelection();
  const rects = Array.from(range.getClientRects());
  if (!rects.length) return null;

  const layer = document.getElementById("docAnnotationLayer");
  if (!layer) return null;

  const layerRect = layer.getBoundingClientRect();

  const rectData = rects.map((rect) => ({
    left: rect.left - layerRect.left,
    top: rect.top - layerRect.top,
    width: rect.width,
    height: rect.height
  }));

  const type = tool === "highlight" ? "highlight" : "underline";

  const item = pushActiveSectionAnnotation({
    type,
    tool,
    renderStyle: tool,
    color,
    rects: rectData,
    coordSpace: "annotation-layer"
  });

  renderSectionAnnotations();
  sel.removeAllRanges();
  return item;
}

function createSuggestionFromSelection(tool) {
  const range = getDocSelectionRangeInsideContent();
  if (!range) return null;

  const sel = window.getSelection();
  const text = range.toString().trim();
  if (!text) return null;

  const layer = document.getElementById("docAnnotationLayer");
  if (!layer) return null;

  const rectData = getTextTightRects(range, layer);

  const labelMap = {
    wc: "WC",
    rw: "RW",
    sd: "SD",
    np: "NP",
    move: "MOVE",
    cl: "CL"
  };

  const actionMap = {
    wc: "replace",
    rw: "replace",
    sd: "note",
    np: "paragraph",
    move: "move",
    cl: "note"
  };

  const placeholderMap = {
    wc: "",
    rw: "",
    sd: "",
    np: "",
    move: "",
    cl: ""
  };

  const item = pushActiveSectionAnnotation({
    type: tool === "cl" ? "underline" : "suggestion",
    tool,
    renderStyle: tool === "cl" ? "squiggle" : tool,
    color: tool === "cl" ? "#ffb86b" : "#9aaa82",
    action: actionMap[tool] || "note",
    status: "pending",
    originalText: text,
    suggestedText: placeholderMap[tool] || "",
    noteLabel: labelMap[tool] || tool.toUpperCase(),
    rects: rectData,
    coordSpace: "annotation-layer"
  });

  renderSectionAnnotations();
  if (typeof renderSuggestionTray === "function") renderSuggestionTray();
  sel.removeAllRanges();
  return item;
}

function bindStickyAnnotationEvents(note, annotationId) {
  const closeBtn = note.querySelector(".ann-sticky-close");
  const dragHandle = note.querySelector(".ann-sticky-drag");
  const textarea = note.querySelector(".ann-sticky-body");

  closeBtn?.addEventListener("click", () => {
    const next = getActiveSectionAnnotations().filter(item => item.id !== annotationId);
    setActiveSectionAnnotations(next);
    renderSectionAnnotations();
  });

  textarea?.addEventListener("input", () => {
    const next = getActiveSectionAnnotations().map((item) => {
      if (item.id !== annotationId) return item;
      return { ...item, text: textarea.value };
    });
    setActiveSectionAnnotations(next);
  });

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startL = 0;
  let startT = 0;

  const onMove = (e) => {
    if (!isDragging) return;
    note.style.left = `${startL + e.clientX - startX}px`;
    note.style.top = `${startT + e.clientY - startY}px`;
  };

  const onUp = () => {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    const next = getActiveSectionAnnotations().map((item) => {
      if (item.id !== annotationId) return item;
      return {
        ...item,
        left: parseInt(note.style.left || "0", 10),
        top: parseInt(note.style.top || "0", 10)
      };
    });

    setActiveSectionAnnotations(next);
  };

  dragHandle?.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startL = parseInt(note.style.left || "0", 10);
    startT = parseInt(note.style.top || "0", 10);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    e.preventDefault();
  });
}


// == View Mode Switcher ==
document.getElementById("docViewSwitcher")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-view-btn");
  if (!btn) return;

  const view = btn.dataset.view;
  const state = getDocUIState();
  if (view === state.mode) return;

  if (view === "edit") {
    closeDocPanels({
      closeInsert: false,
      closeInspector: false,
      closeSections: false,
      closeTransient: true,
      blurContent: false
    });
    setDocUIState({ mode: "edit" });
    return;
  }

  if (view === "view") {
    closeDocPanels({
      closeInsert: true,
      closeInspector: true,
      closeSections: false,
      closeTransient: true,
      blurContent: true
    });
    setDocUIState({ mode: "view" });
    return;
  }

  if (view === "annotate") {
    closeDocPanels({
      closeInsert: true,
      closeInspector: true,
      closeSections: false,
      closeTransient: true,
      blurContent: true
    });
    setDocUIState({ mode: "annotate" });
  }
});

// == Narrative Threads ==
let docThreads = []; // { id, name, color, visible }

const THREADS_KEY = "sanctum_threads";

function loadThreads(pageId) {
  const all = JSON.parse(localStorage.getItem(THREADS_KEY) || "{}");
  docThreads = all[pageId] || [];
}

function saveThreads(pageId) {
  const all = JSON.parse(localStorage.getItem(THREADS_KEY) || "{}");
  all[pageId] = docThreads;
  localStorage.setItem(THREADS_KEY, JSON.stringify(all));
}

function renderThreadsList() {
  const list = document.getElementById("docThreadsList");
  if (!list) return;
  list.innerHTML = "";

  if (!docThreads.length) {
    list.innerHTML = `<div class="doc-thread-empty">No threads yet.</div>`;
    return;
  }

  docThreads.forEach((thread, i) => {
    const item = document.createElement("div");
    item.className = "doc-thread-item";
    item.innerHTML = `
      <span class="doc-thread-color-dot" style="background:${thread.color}"></span>
      <span class="doc-thread-name">${thread.name}</span>
      <button class="doc-thread-toggle ${thread.visible ? 'active' : ''}" data-idx="${i}" title="Toggle visibility">👁</button>
      <button class="doc-thread-delete" data-idx="${i}" title="Delete thread">✕</button>
    `;

    item.querySelector(".doc-thread-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      docThreads[i].visible = !docThreads[i].visible;
      saveThreads(docPageId);
      renderThreadsList();
      applyThreadHighlights();
    });

    item.querySelector(".doc-thread-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      // remove all tags for this thread
      document.querySelectorAll(`.doc-thread-tag[data-thread-id="${thread.id}"]`).forEach(tag => {
        const parent = tag.parentNode;
        while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
        parent.removeChild(tag);
      });
      docThreads.splice(i, 1);
      saveThreads(docPageId);
      renderThreadsList();
      saveCurrentDocSection();
    });

    list.appendChild(item);
  });
}

function applyThreadHighlights() {
  document.querySelectorAll(".doc-thread-tag").forEach(tag => {
    const threadId = tag.dataset.threadId;
    const thread = docThreads.find(t => t.id === threadId);
    if (!thread) {
      // thread deleted — unwrap
      const parent = tag.parentNode;
      while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
      parent.removeChild(tag);
      return;
    }
    tag.style.borderBottom = thread.visible
      ? `2px solid ${thread.color}`
      : "none";
    tag.style.opacity = thread.visible ? "1" : "0.7";
  });
}

function tagSelectionWithThread(thread) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  const content = document.getElementById("docContent");
  if (!content || !content.contains(range.commonAncestorContainer)) return;

  const span = document.createElement("span");
  span.className = "doc-thread-tag";
  span.dataset.threadId = thread.id;
  span.style.borderBottom = `2px solid ${thread.color}`;
  span.style.cursor = "pointer";
  span.title = thread.name;

  try {
    range.surroundContents(span);
  } catch(e) {
    // selection spans multiple elements — use insertHTML instead
    const html = `<span class="doc-thread-tag" data-thread-id="${thread.id}" style="border-bottom:2px solid ${thread.color};cursor:pointer;" title="${thread.name}">${sel.toString()}</span>`;
    document.execCommand("insertHTML", false, html);
  }

  sel.removeAllRanges();
  saveCurrentDocSection();
  closeThreadPicker();
}

// thread picker popup
function showThreadPicker(x, y) {
  closeThreadPicker();
  if (!docThreads.length) return;

  const picker = document.createElement("div");
  picker.id = "threadPicker";
  picker.className = "thread-picker";
  picker.innerHTML = `<div class="thread-picker-label">Tag Thread</div>`;

  docThreads.forEach(thread => {
    const item = document.createElement("div");
    item.className = "thread-picker-item";
    item.innerHTML = `
      <span class="doc-thread-color-dot" style="background:${thread.color}"></span>
      <span>${thread.name}</span>
    `;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      tagSelectionWithThread(thread);
    });
    picker.appendChild(item);
  });

  picker.style.top = `${y}px`;
  picker.style.left = `${x}px`;
  document.body.appendChild(picker);

  setTimeout(() => {
    document.addEventListener("click", closeThreadPicker, { once: true });
  }, 0);
}

function closeThreadPicker() {
  document.getElementById("threadPicker")?.remove();
}

function closeLexiconQuickSaveMenu() {
  document.getElementById("docLexiconQuickSaveMenu")?.remove();
}

function saveLexiconLookupSelectionRange() {
  const sel = window.getSelection();
  const content = document.getElementById("docContent");
  if (!sel || !content || !sel.rangeCount || sel.isCollapsed) return;

  const range = sel.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer)) return;
  lexiconLookupSelectionRange = range.cloneRange();
}

function restoreLexiconLookupSelectionRange() {
  const content = document.getElementById("docContent");
  const range = lexiconLookupSelectionRange;
  if (!content || !range) return false;

  if (!content.contains(range.commonAncestorContainer)) {
    lexiconLookupSelectionRange = null;
    return false;
  }

  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

function normalizeLexiconLookupText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLexiconLookupText(text = "") {
  return normalizeLexiconLookupText(text)
    .split(" ")
    .filter((t) => t.length > 1)
    .map((t) => {
      if (t.endsWith("ing") && t.length > 5) return t.slice(0, -3);
      if (t.endsWith("ed") && t.length > 4) return t.slice(0, -2);
      if (t.endsWith("s") && t.length > 3) return t.slice(0, -1);
      return t;
    });
}

function scoreLexiconText(haystackRaw = "", query = "", tokens = []) {
  const haystack = normalizeLexiconLookupText(haystackRaw);
  if (!haystack) return 0;

  let score = 0;
  if (haystack === query) score += 120;
  else if (haystack.includes(query)) score += 60;

  tokens.forEach((token) => {
    if (haystack === token) score += 50;
    else if (haystack.includes(token)) score += 14;
  });

  return score;
}

function findBestLexiconMatch(rawText = "") {
  const query = normalizeLexiconLookupText(rawText);
  const tokens = tokenizeLexiconLookupText(rawText);
  if (!query || !lexiconData.length) return null;

  let best = null;

  lexiconData.forEach((group) => {
    const groupScore = scoreLexiconText(group.title, query, tokens);

    group.sections.forEach((section) => {
      const sectionScore = scoreLexiconText(section.title, query, tokens);

      let bestEntry = null;
      let bestEntryScore = 0;

      section.entries.forEach((entry) => {
        const entryScore = scoreLexiconText(entry.text, query, tokens);
        if (entryScore > bestEntryScore) {
          bestEntryScore = entryScore;
          bestEntry = entry;
        }
      });

      const totalScore = groupScore + sectionScore + bestEntryScore;
      if (!best || totalScore > best.score) {
        best = {
          score: totalScore,
          groupId: group.id,
          sectionId: section.id,
          entryId: bestEntry?.id || null
        };
      }
    });

    if (!group.sections.length && (!best || groupScore > best.score)) {
      best = {
        score: groupScore,
        groupId: group.id,
        sectionId: null,
        entryId: null
      };
    }
  });

  if (!best || best.score <= 0) return null;
  return best;
}

function openLexiconMatchesForSelection(rawText = "", { replaceMode = false } = {}) {
  const selectedText = String(rawText || "").trim();
  if (!selectedText) return false;

  lexiconInsertMode = replaceMode ? "replace" : "insert";

  const search = document.getElementById("docLexiconSearch");
  if (search) search.value = selectedText;

  const match = findBestLexiconMatch(selectedText);
  if (match) {
    activeLexiconGroupId = match.groupId;
    activeLexiconSectionId = match.sectionId;
    activeLexiconEntryId = match.entryId;
  } else {
    activeLexiconGroupId = null;
    activeLexiconSectionId = null;
    activeLexiconEntryId = null;
  }

  lexPanel?.classList.add("open");
  renderLexicon();
  return true;
}

function openLexiconQuickSaveMenu(rawText = "", x = 0, y = 0) {
  const text = String(rawText || "").trim();
  if (!text) return;

  closeLexiconQuickSaveMenu();

  const groupsWithSections = lexiconData.filter((g) => Array.isArray(g.sections) && g.sections.length);
  if (!groupsWithSections.length) {
    lexPanel?.classList.add("open");
    closeLexiconComposer();
    openLexiconComposer("entry");
    const textInput = document.getElementById("lexComposerText");
    if (textInput) textInput.value = text;
    renderLexicon();
    return;
  }

  const menu = document.createElement("div");
  menu.id = "docLexiconQuickSaveMenu";
  menu.className = "doc-lexicon-quick-save-menu";
  menu.innerHTML = `
    <div class="doc-lexicon-quick-save-title">Save to Lexicon</div>
    <div class="doc-lexicon-quick-save-preview">${text}</div>
    <label class="doc-lexicon-quick-save-label" for="docLexQuickGroup">Group</label>
    <select id="docLexQuickGroup" class="doc-lexicon-quick-save-select"></select>
    <label class="doc-lexicon-quick-save-label" for="docLexQuickSection">Section</label>
    <select id="docLexQuickSection" class="doc-lexicon-quick-save-select"></select>
    <div class="doc-lexicon-quick-save-actions">
      <button type="button" class="doc-lexicon-quick-save-btn" data-action="cancel">Cancel</button>
      <button type="button" class="doc-lexicon-quick-save-btn primary" data-action="save">Save</button>
    </div>
  `;

  document.body.appendChild(menu);

  const groupSelect = menu.querySelector("#docLexQuickGroup");
  const sectionSelect = menu.querySelector("#docLexQuickSection");

  if (!groupSelect || !sectionSelect) return;

  groupsWithSections.forEach((group) => {
    const opt = document.createElement("option");
    opt.value = group.id;
    opt.textContent = group.title;
    groupSelect.appendChild(opt);
  });

  const preferredGroupId = activeLexiconGroupId && groupsWithSections.some((g) => g.id === activeLexiconGroupId)
    ? activeLexiconGroupId
    : groupsWithSections[0].id;
  groupSelect.value = preferredGroupId;

  const syncSections = () => {
    const group = getLexiconGroupById(groupSelect.value);
    const sections = Array.isArray(group?.sections) ? group.sections : [];
    sectionSelect.innerHTML = "";

    sections.forEach((section) => {
      const opt = document.createElement("option");
      opt.value = section.id;
      opt.textContent = section.title;
      sectionSelect.appendChild(opt);
    });

    if (sections.length) {
      const preferredSectionId = activeLexiconSectionId && sections.some((s) => s.id === activeLexiconSectionId)
        ? activeLexiconSectionId
        : sections[0].id;
      sectionSelect.value = preferredSectionId;
    }
  };

  syncSections();
  groupSelect.addEventListener("change", syncSections);

  menu.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === "cancel") {
      closeLexiconQuickSaveMenu();
      return;
    }

    if (action === "save") {
      const entry = createLexiconEntry({
        groupId: groupSelect.value,
        sectionId: sectionSelect.value,
        text
      });

      if (entry) {
        activeLexiconGroupId = groupSelect.value;
        activeLexiconSectionId = sectionSelect.value;
        activeLexiconEntryId = entry.id;
        lexPanel?.classList.add("open");
        renderLexicon();
      }

      closeLexiconQuickSaveMenu();
    }
  });

  const menuWidth = 248;
  const menuHeight = 238;
  const safeLeft = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menuWidth - 8));
  const safeTop = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - menuHeight - 8));
  menu.style.left = `${safeLeft}px`;
  menu.style.top = `${safeTop}px`;
}

// right click on doc content to tag thread
document.getElementById("docPagesHost")?.addEventListener("contextmenu", (e) => {
  if (!e.target.closest(".doc-content")) return;
  e.preventDefault();
  closeLexiconQuickSaveMenu();
  const sel = window.getSelection();
  const hasSelection = sel && !sel.isCollapsed;
  const selectedText = hasSelection ? sel.toString().trim() : "";
  const target = e.target.closest("p, h1, h2, h3, li, blockquote");

  // build a unified context menu
  const menuItems = [];

  // lexicon contextual options
  if (selectedText) {
    menuItems.push({
      icon: "📚",
      label: "Open Lexicon Matches",
      action: () => {
        lexiconLookupSelectionRange = null;
        openLexiconMatchesForSelection(selectedText, { replaceMode: false });
      },
    });

    menuItems.push({
      icon: "⇄",
      label: "Replace with Lexicon",
      action: () => {
        saveLexiconLookupSelectionRange();
        openLexiconMatchesForSelection(selectedText, { replaceMode: true });
      },
    });

    menuItems.push({
      icon: "＋",
      label: "Save to Lexicon",
      action: () => {
        openLexiconQuickSaveMenu(selectedText, e.clientX, e.clientY);
      },
    });
  }

  // thread options
  if (hasSelection) {
    if (menuItems.length) menuItems.push({ divider: true });
    if (docThreads.length) {
      docThreads.forEach(thread => {
        menuItems.push({
          icon: `<span class="doc-thread-color-dot" style="background:${thread.color}"></span>`,
          label: thread.name,
          action: () => tagSelectionWithThread(thread),
        });
      });
    } else {
      menuItems.push({
        icon: "🧵",
        label: "Add threads in Inspector first",
        disabled: true,
        action: () => {},
      });
    }
  }

  // anchor option
  if (target) {
    if (menuItems.length) menuItems.push({ divider: true });
    menuItems.push({
      icon: "⚓",
      label: "Set Anchor",
      action: () => setAnchorOnParagraph(target),
    });
  }

  if (!menuItems.length) return;

  // build and show picker
  closeThreadPicker();
  const picker = document.createElement("div");
  picker.id = "threadPicker";
  picker.className = "thread-picker";

  if (hasSelection && docThreads.length) {
    const label = document.createElement("div");
    label.className = "thread-picker-label";
    label.textContent = "Tag Thread";
    picker.appendChild(label);
  }

  menuItems.forEach(item => {
    if (item.divider) {
      const div = document.createElement("div");
      div.className = "doc-list-divider";
      div.style.margin = "4px 0";
      picker.appendChild(div);
      return;
    }
    const el = document.createElement("div");
    el.className = "thread-picker-item" + (item.disabled ? " disabled" : "");
    el.innerHTML = `${item.icon}<span>${item.label}</span>`;
    if (!item.disabled) {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        item.action();
        picker.remove();
      });
    }
    picker.appendChild(el);
  });

  picker.style.top = `${e.clientY}px`;
  picker.style.left = `${e.clientX}px`;
  document.body.appendChild(picker);

  setTimeout(() => {
    document.addEventListener("click", closeThreadPicker, { once: true });
  }, 0);
});

// click on thread tag to show info
document.getElementById("docPagesHost")?.addEventListener("click", (e) => {
  if (!e.target.closest(".doc-content")) return;
  const tag = e.target.closest(".doc-thread-tag");
  if (!tag) return;
  const thread = docThreads.find(t => t.id === tag.dataset.threadId);
  if (!thread) return;

  // small tooltip
  let tip = document.getElementById("threadTip");
  if (tip) tip.remove();
  tip = document.createElement("div");
  tip.id = "threadTip";
  tip.className = "thread-tip";
  tip.innerHTML = `
    <span class="doc-thread-color-dot" style="background:${thread.color}"></span>
    <span>${thread.name}</span>
    <button id="threadTipRemove" title="Remove tag">✕</button>
  `;
  tip.style.top = `${e.clientY - 36}px`;
  tip.style.left = `${e.clientX}px`;
  document.body.appendChild(tip);

  document.getElementById("threadTipRemove")?.addEventListener("click", () => {
    const parent = tag.parentNode;
    while (tag.firstChild) parent.insertBefore(tag.firstChild, tag);
    parent.removeChild(tag);
    tip.remove();
    saveCurrentDocSection();
  });

  setTimeout(() => {
    document.addEventListener("click", () => tip?.remove(), { once: true });
  }, 0);
});

// add thread button
document.getElementById("docThreadAddBtn")?.addEventListener("click", () => {
  const nameInput = document.getElementById("docThreadNameInput");
  const colorInput = document.getElementById("docThreadColorInput");
  const name = nameInput?.value.trim();
  if (!name) return;

  const thread = {
    id: `thread-${Date.now()}`,
    name,
    color: colorInput?.value || "#78c1ff",
    visible: true,
  };

  docThreads.push(thread);
  saveThreads(docPageId);
  renderThreadsList();
  if (nameInput) nameInput.value = "";
});



// == Paragraph Linking / Anchors ==
let docAnchors = []; // { id, name, sectionIndex, elementId }

const ANCHORS_KEY = "sanctum_anchors";

function getStoredAnchorsForPage(pageId) {
  const all = typeof readStorageJSON === "function"
    ? readStorageJSON(ANCHORS_KEY, {})
    : JSON.parse(localStorage.getItem(ANCHORS_KEY) || "{}");
  return Array.isArray(all?.[pageId]) ? all[pageId] : [];
}

function loadAnchors(pageId) {
  docAnchors = getStoredAnchorsForPage(pageId);
}

function saveAnchors(pageId) {
  const all = JSON.parse(localStorage.getItem(ANCHORS_KEY) || "{}");
  all[pageId] = docAnchors;
  localStorage.setItem(ANCHORS_KEY, JSON.stringify(all));

  if (typeof window.onSanctumAnchorsChanged === "function") {
    window.onSanctumAnchorsChanged(pageId, docAnchors);
  }
}

function setAnchorOnParagraph(el) {
  const name = prompt("Name this anchor:");
  if (!name || !name.trim()) return;

  const id = `anchor-${Date.now()}`;
  el.dataset.anchorId = id;
  el.classList.add("doc-anchor");

  const anchor = {
    id,
    name: name.trim(),
    sectionIndex: activeSectionIndex,
    elementId: id,
  };

  docAnchors.push(anchor);
  saveAnchors(docPageId);
  saveCurrentDocSection();

  // show small marker
  renderAnchorMarkers();
}

function renderAnchorMarkers() {
  // remove existing markers
  document.querySelectorAll(".doc-anchor-marker").forEach(m => m.remove());

  docAnchors.forEach(anchor => {
    if (anchor.sectionIndex !== activeSectionIndex) return;
    const el = document.querySelector(`[data-anchor-id="${anchor.id}"]`);
    if (!el) return;

    const marker = document.createElement("span");
    marker.className = "doc-anchor-marker";
    marker.textContent = "⚓";
    marker.title = anchor.name;
    marker.dataset.anchorId = anchor.id;
    el.insertAdjacentElement("beforebegin", marker);
  });
}

function showAnchorPicker(x, y) {
  closeAnchorPicker();
  if (!docAnchors.length) {
    const tip = document.createElement("div");
    tip.className = "thread-tip";
    tip.style.top = `${y}px`;
    tip.style.left = `${x}px`;
    tip.textContent = "No anchors set yet. Right-click a paragraph to set one.";
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 2500);
    return;
  }

  const picker = document.createElement("div");
  picker.id = "anchorPicker";
  picker.className = "thread-picker";
  picker.innerHTML = `<div class="thread-picker-label">Jump to anchor</div>`;

  docAnchors.forEach(anchor => {
    const item = document.createElement("div");
    item.className = "thread-picker-item";
    item.innerHTML = `<span>⚓</span><span>${anchor.name}</span>${anchor.sectionIndex !== activeSectionIndex ? `<span style="font-size:10px;color:var(--muted3);margin-left:auto;">§${anchor.sectionIndex + 1}</span>` : ""}`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      jumpToAnchor(anchor);
      closeAnchorPicker();
    });
    picker.appendChild(item);
  });

  picker.style.top = `${y}px`;
  picker.style.left = `${x}px`;
  document.body.appendChild(picker);

  setTimeout(() => {
    document.addEventListener("click", closeAnchorPicker, { once: true });
  }, 0);
}

function closeAnchorPicker() {
  document.getElementById("anchorPicker")?.remove();
}

function jumpToAnchor(anchor) {
  // if different section, load it first
  if (anchor.sectionIndex !== activeSectionIndex) {
    saveCurrentDocSection();
    loadDocSection(anchor.sectionIndex);
    setTimeout(() => {
      scrollToAnchor(anchor.id);
    }, 100);
  } else {
    scrollToAnchor(anchor.id);
  }
}

function scrollToAnchor(anchorId) {
  const el = document.querySelector(`[data-anchor-id="${anchorId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  // flash highlight
  el.classList.add("doc-anchor-flash");
  setTimeout(() => el.classList.remove("doc-anchor-flash"), 1200);
}

function jumpToDocAnchorById(anchorId) {
  if (!anchorId) return false;
  const anchor = docAnchors.find((entry) => entry.id === anchorId)
    || getStoredAnchorsForPage(docPageId).find((entry) => entry.id === anchorId);
  if (!anchor) return false;
  jumpToAnchor(anchor);
  return true;
}

window.getDocAnchorsForPage = getStoredAnchorsForPage;
window.jumpToDocAnchorById = jumpToDocAnchorById;
window.getActiveDocPageId = () => docPageId;

// insert anchor link with >>
document.getElementById("docPagesHost")?.addEventListener("keyup", (e) => {
  const activeContent = e.target.closest(".doc-content");
  if (!activeContent) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(activeContent);
  preRange.setEnd(range.startContainer, range.startOffset);
  const text = preRange.toString();

  if (text.endsWith(">>")) {
    // delete the >> characters
    const delRange = document.createRange();
    delRange.setStart(range.startContainer, range.startOffset - 2);
    delRange.setEnd(range.startContainer, range.startOffset);
    delRange.deleteContents();
    showAnchorPicker(
      window.innerWidth / 2 - 90,
      window.innerHeight / 2 - 100
    );
  }
});


function exportToCanvas(targetPageId, isNew) {
  saveCurrentDocSection();

  const resolvedTargetPageId = typeof resolveCardHostId === "function"
    ? resolveCardHostId(targetPageId)
    : targetPageId;

  const breakdown = document.getElementById("docExportBreakdown")?.value || "sections";
  const blocks = getDocumentBlocks(breakdown);

  if (!blocks.length) {
    alert("Nothing to export.");
    return;
  }

  // load existing blocks for target page
  const all = JSON.parse(localStorage.getItem("sanctum_page_blocks") || "{}");
  const existing = Array.isArray(all[resolvedTargetPageId]) ? all[resolvedTargetPageId] : [];

  // find max Y of existing blocks
  let maxY = 0;
  existing.forEach(b => {
    const bottom = (b.y || 0) + (b.h || 96);
    if (bottom > maxY) maxY = bottom;
  });

  // offset new blocks to sit below existing
  const offset = maxY > 0 ? maxY + 48 : 0;
  const offsetBlocks = blocks.map((b, i) => ({
    ...b,
    id: `block-${Date.now()}-${i}`,
    z: 0,
    bg: "", borderColor: "", textColor: "", radius: "", hasNote: 0,
    linkedPageId: "", pageCardTitle: "", pageCardMeta: "", pageCardIcon: "", cardStyle: "",
    pageCardSummary: "", pageCardTypeLabel: "", containerTitle: "", containerBody: "", tableHTML: "",
    y: b.y + offset,
  }));

  all[resolvedTargetPageId] = [...existing, ...offsetBlocks];
  localStorage.setItem("sanctum_page_blocks", JSON.stringify(all));

  // navigate to canvas
  if (typeof openPage === "function") {
    const blockCount = offsetBlocks.length;
    const targetPage = (typeof userPages !== "undefined" ? userPages : []).find(p => p.id === resolvedTargetPageId);
    const targetName = targetPage?.title || "canvas";

    // show brief confirmation then navigate
    const tip = document.createElement("div");
    tip.className = "thread-tip";
    tip.style.position = "fixed";
    tip.style.bottom = "80px";
    tip.style.left = "50%";
    tip.style.transform = "translateX(-50%)";
    tip.style.zIndex = "4000";
    tip.style.padding = "8px 16px";
    tip.style.borderRadius = "6px";
    tip.textContent = `✓ ${blockCount} block${blockCount !== 1 ? "s" : ""} exported to "${targetName}"`;
    document.body.appendChild(tip);

    setTimeout(() => {
      tip.remove();
      try {
        closeDocEditor();
        openPage(resolvedTargetPageId);
      } catch (err) {
        console.error("Export navigation failed:", err);
        // reopen doc editor if navigation fails
        if (typeof openDocEditor === "function" && docPageId) {
          openDocEditor(docPageId);
        }
      }
    }, 1200);
  }
}

function showExistingCanvasPicker() {
  // get all board-canvas pages
  const canvasPages = (typeof userPages !== "undefined" ? userPages : [])
    .filter(p => p.layout === "board-canvas" || p.layout === "canvas" || !p.layout);

  if (!canvasPages.length) {
    alert("No canvas pages found. Create a canvas page first.");
    return;
  }

  // simple picker
  const picker = document.createElement("div");
  picker.id = "canvasPicker";
  picker.className = "thread-picker";
  picker.style.position = "fixed";
  picker.style.top = "50%";
  picker.style.left = "50%";
  picker.style.transform = "translate(-50%, -50%)";
  picker.style.zIndex = "3000";
  picker.style.minWidth = "240px";
  picker.innerHTML = `<div class="thread-picker-label">Send to canvas</div>`;

  canvasPages.forEach(page => {
    const item = document.createElement("div");
    item.className = "thread-picker-item";
    item.innerHTML = `<span>${page.icon || "📋"}</span><span>${page.title}</span>`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      picker.remove();
      exportToCanvas(page.id, false);
    });
    picker.appendChild(item);
  });

  const cancel = document.createElement("div");
  cancel.className = "thread-picker-item";
  cancel.style.borderTop = "1px solid #2a2a2a";
  cancel.style.color = "var(--muted3)";
  cancel.textContent = "Cancel";
  cancel.addEventListener("mousedown", () => picker.remove());
  picker.appendChild(cancel);

  document.body.appendChild(picker);
}

function resolveCardHostId(parentId) {
  if (!parentId || parentId === "home") return "home";

  const domain = (typeof userDomains !== "undefined" ? userDomains : []).find(d => d.id === parentId);
  if (domain) return domain.id;

  const page = (typeof userPages !== "undefined" ? userPages : []).find(p => p.id === parentId);
  if (!page) return "home";

  // Document parents cannot display canvas blocks; bubble up to nearest canvas-capable ancestor.
  if (page.layout === "document") return resolveCardHostId(page.parent || "home");
  return page.id;
}

function addParentLinkCardForPage(page, requestedParentId) {
  if (!page?.id) return;
  const selectedHostId = requestedParentId || page.parent || "home";
  const fallbackHostId = resolveCardHostId(selectedHostId);

  const all = JSON.parse(localStorage.getItem("sanctum_page_blocks") || "{}");

  function insertIntoHost(hostId) {
    if (!hostId) return;
    const hostBlocks = all[hostId] || [];
    const dims = typeof window.getLinkedPageCardDimensions === "function"
      ? window.getLinkedPageCardDimensions(page.title || "Untitled")
      : { width: 160, height: 24 };

    // avoid duplicates on this host
    if (hostBlocks.some(b => b.linkedPageId === page.id)) {
      all[hostId] = hostBlocks;
      return;
    }

    let maxY = 0;
    hostBlocks.forEach(b => {
      const y = parseInt(b.y || 0, 10) || 0;
      const h = parseInt(b.h || 48, 10) || 48;
      const bottom = y + h;
      if (bottom > maxY) maxY = bottom;
    });

    hostBlocks.push({
      id: `block-${Date.now()}-${hostId}`,
      type: "page",
      x: 48,
      y: maxY + 24,
      w: dims.width,
      h: dims.height,
      z: 0,
      titleHTML: "",
      bodyHTML: "",
      bg: "", borderColor: "", textColor: "", radius: "", hasNote: 0,
      linkedPageId: page.id,
      pageCardTitle: page.title,
      pageCardIcon: page.icon || "📋",
      pageCardSummary: page.summary || "",
      pageCardTypeLabel: page.type || "",
      pageCardMeta: "",
      cardStyle: "hub",
    });

    all[hostId] = hostBlocks;
  }

  // Only write to the user-selected parent.
  insertIntoHost(fallbackHostId);

  localStorage.setItem("sanctum_page_blocks", JSON.stringify(all));
}

// == Convert to Canvas ==

function getDocumentBlocks(breakdown) {
  const blocks = [];
  let y = 48;
  const xStart = 48;
  const blockW = 320;
  const gap = 24;

  if (breakdown === "sections") {
    docSections.forEach((section, si) => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = section.content || "";
      const blockData = buildCanvasBlocksFromHTML(tempDiv, section.title, xStart, y, blockW);
      blockData.forEach(b => {
        blocks.push(b);
        y += (b.h || 96) + gap;
      });
      y += gap; // extra gap between sections
    });
  } else if (breakdown === "headings") {
    docSections.forEach(section => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = section.content || "";
      let currentGroup = null;
      let groupY = y;

      Array.from(tempDiv.childNodes).forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName?.toLowerCase();
        if (tag === "h1" || tag === "h2" || tag === "h3") {
          if (currentGroup) {
            blocks.push(currentGroup);
            y += (currentGroup.h || 96) + gap;
          }
          currentGroup = {
            type: "text",
            x: xStart,
            y,
            w: blockW,
            h: 96,
            titleHTML: node.textContent,
            bodyHTML: "",
          };
          groupY = y;
        } else if (currentGroup) {
          currentGroup.bodyHTML += node.outerHTML || "";
          currentGroup.h = Math.max(96, currentGroup.bodyHTML.length / 2 + 48);
        }
      });

      if (currentGroup) {
        blocks.push(currentGroup);
        y += (currentGroup.h || 96) + gap;
      }
    });
  } else if (breakdown === "paragraphs") {
    docSections.forEach(section => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = section.content || "";

      Array.from(tempDiv.childNodes).forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName?.toLowerCase();
        if (!tag || tag === "br") return;

        let blockType = "text";
        if (tag === "ul" || tag === "ol") blockType = "list";

        const b = {
          type: blockType,
          x: xStart,
          y,
          w: blockW,
          h: 96,
          titleHTML: "",
          bodyHTML: node.outerHTML,
        };

        if (tag === "h1" || tag === "h2" || tag === "h3") {
          b.titleHTML = node.textContent;
          b.bodyHTML = "";
        }

        blocks.push(b);
        y += (b.h || 96) + gap;
      });
    });
  }

  return blocks;
}

function buildCanvasBlocksFromHTML(container, sectionTitle, x, y, w) {
  const blocks = [];
  let currentY = y;

  // title block for section
  if (sectionTitle) {
    blocks.push({
      type: "text",
      x,
      y: currentY,
      w,
      h: 48,
      titleHTML: sectionTitle,
      bodyHTML: "",
    });
    currentY += 48 + 16;
  }

  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName?.toLowerCase();
    if (!tag || tag === "br") return;

    let type = "text";
    if (tag === "ul" || tag === "ol") type = "list";

    // preserve inline links
    const html = node.outerHTML || "";

    const b = {
      type,
      x,
      y: currentY,
      w,
      h: Math.max(72, Math.min(300, html.length / 3 + 48)),
      titleHTML: (tag === "h1" || tag === "h2" || tag === "h3") ? node.textContent : "",
      bodyHTML: (tag === "h1" || tag === "h2" || tag === "h3") ? "" : html,
    };

    blocks.push(b);
    currentY += b.h + 16;
  });

  return blocks;
}



// == Document Statistics ==
let activeDocStatsTab = "overview";
let activeDocHistoryRange = 30;

document.getElementById("docStatsToggle")?.addEventListener("click", (e) => {
  e.stopPropagation();

  const panel = document.getElementById("docStatsPanel");
  if (!panel) return;

  const isOpen = panel.classList.contains("open");

  if (isOpen) {
    panel.classList.remove("open");
    setDocUIState({ activeTransient: null });
    return;
  }

  closeDocTransientUI("statsPanel");
  if (typeof closeDocInsertPanel === "function") closeDocInsertPanel();
  setDocUIState({ activeTransient: "statsPanel" });
  panel.classList.add("open");

  document.querySelectorAll(".doc-stats-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === activeDocStatsTab);
  });

  renderDocStats?.();
});

function computeTopPhrases(fullText = "") {
  const stopStarts = new Set([
    "the","a","an","and","or","but","if","then","so","because","of","in","on","at","to","for","from","with","as","by","it","is","was","are","were","be","been","that","this","these","those","he","she","they","we","you","i"
  ]);

  const words = String(fullText || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const phrases = {};

  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    if (w1.length < 3 || w2.length < 3) continue;
    if (stopStarts.has(w1) && stopStarts.has(w2)) continue;

    const phrase = `${w1} ${w2}`;
    phrases[phrase] = (phrases[phrase] || 0) + 1;
  }

  return Object.entries(phrases)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

function computeDocStats() {
  // gather all text across all sections
  const allContent = docSections.map(s => {
    const div = document.createElement("div");
    div.innerHTML = s.content || "";
    return div;
  });

  const fullText = allContent.map(d => d.innerText || "").join("\n");
  const words = fullText.trim() ? fullText.trim().split(/\s+/).filter(w => w.length > 0) : [];
  const chars = fullText.replace(/\s/g, "").length;
  const charsWithSpaces = fullText.length;

  // sentences — split on . ! ?
  const sentences = fullText.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // paragraphs — count non-empty p elements across all sections
  let paragraphs = [];
  allContent.forEach(d => {
    d.querySelectorAll("p, h1, h2, h3, li").forEach(el => {
      const txt = (el.innerText || "").trim();
      if (txt.length > 0) paragraphs.push(txt);
    });
  });

  const avgParaLength = paragraphs.length
    ? Math.round(paragraphs.map(p => p.split(/\s+/).length).reduce((a, b) => a + b, 0) / paragraphs.length)
    : 0;

  const avgSentenceLength = sentences.length
    ? Math.round(words.length / sentences.length)
    : 0;

  // paragraph length distribution
  const shortParas = paragraphs.filter(p => p.split(/\s+/).length < 30).length;
  const mediumParas = paragraphs.filter(p => { const w = p.split(/\s+/).length; return w >= 30 && w < 80; }).length;
  const longParas = paragraphs.filter(p => p.split(/\s+/).length >= 80).length;

  // dialogue vs narration
  // dialogue = text inside quotes " " or " "
  const dialogueMatches = fullText.match(/[""][^""]+[""]|"[^"]+"/g) || [];
  const dialogueWords = dialogueMatches.join(" ").split(/\s+/).filter(w => w.length > 0).length;
  const narrationWords = Math.max(0, words.length - dialogueWords);
  const dialoguePct = words.length ? Math.round((dialogueWords / words.length) * 100) : 0;
  const narrationPct = 100 - dialoguePct;

  // word frequency — top 15 non-common words
  const stopWords = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","is","was","are","were","be","been","have","has","had","it","its","this","that","these","those","i","you","he","she","we","they","my","your","his","her","our","their","not","no","so","if","as","by","from","up","out","about","into","than","then","when","where","who","what","which","how","all","each","both","few","more","most","other","some","such","only","own","same","just","because","before","after","while","though","through","between","against","during","without","within","along","following","across","behind","beyond","plus","except","up","down","off","over","under","again","further","once"]);

  const wordFreq = {};
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^a-z']/g, "");
    if (clean.length > 2 && !stopWords.has(clean)) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });

  const topWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const topPhrases = computeTopPhrases(fullText);

  // per section word count
  const sectionStats = docSections.map((s, i) => {
    const div = document.createElement("div");
    div.innerHTML = s.content || "";
    const txt = div.innerText || "";
    const wc = txt.trim() ? txt.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
    return { title: s.title || `Section ${i + 1}`, words: wc };
  });

  return {
    words: words.length,
    chars,
    charsWithSpaces,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    avgParaLength,
    avgSentenceLength,
    shortParas,
    mediumParas,
    longParas,
    topPhrases,
    dialogueWords,
    narrationWords,
    dialoguePct,
    narrationPct,
    topWords,
    sectionStats,
  };
}

function renderStatsPanel() {
  const body = document.getElementById("docStatsBody");
  if (!body) return;

  updateDocStats();

  const s = computeDocStats();
  const stats = normalizeDocStats(docData?.meta?.stats || {});
  const dailyGoal = Math.max(0, Number(stats.dailyGoal) || 0);
  const overallGoal = Math.max(0, Number(stats.overallGoal) || 0);
  const todayWords = Math.max(0, Number(stats.todayWords) || 0);
  const totalWords = Math.max(0, Number(stats.totalWords) || 0);
  const todayProgress = dailyGoal > 0 ? Math.min(100, Math.round((todayWords / dailyGoal) * 100)) : 0;
  const overallProgress = overallGoal > 0 ? Math.min(100, Math.round((totalWords / overallGoal) * 100)) : 0;
  const sessionWords = Math.max(0, totalWords - (Number(stats.sessionStartWords) || 0));

  const recentHistory = getRecentDailyHistory(stats, 7);
  const streak = computeWritingStreak(stats);
  const historyMax = Math.max(1, ...recentHistory.map((entry) => entry.words));
  const bestDay = (stats.dailyHistory || []).reduce((best, entry) => {
    if (!best || entry.words > best.words) return entry;
    return best;
  }, null);
  const last7Total = recentHistory.reduce((sum, entry) => sum + entry.words, 0);

  body.innerHTML = "";

  if (activeDocStatsTab === "overview") {
    body.innerHTML = `
      <div class="doc-stats-section">
        <div class="doc-stats-grid">
          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Words</div>
            <div class="doc-stats-card-value">${s.words}</div>
          </div>
          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Characters</div>
            <div class="doc-stats-card-value">${s.charsWithSpaces}</div>
            <div class="doc-stats-subvalue">${s.chars} without spaces</div>
          </div>
          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Sentences</div>
            <div class="doc-stats-card-value">${s.sentences}</div>
          </div>
          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Paragraphs</div>
            <div class="doc-stats-card-value">${s.paragraphs}</div>
          </div>
        </div>
      </div>
    `;

    const secSection = document.createElement("div");
    secSection.className = "doc-stats-section";
    secSection.innerHTML = `<div class="doc-stats-section-title">By Section</div>`;

    s.sectionStats.forEach((sec) => {
      const row = document.createElement("div");
      row.className = "doc-stats-row";
      row.innerHTML = `<span class="doc-stats-label">${sec.title}</span><span class="doc-stats-value">${sec.words} words</span>`;
      secSection.appendChild(row);
    });

    body.appendChild(secSection);
    return;
  }

  if (activeDocStatsTab === "goals") {
    body.innerHTML = `
      <div class="doc-stats-section">
        <div class="doc-stats-section-title">Goals</div>

        <div class="doc-stats-row doc-stats-row-input">
          <span class="doc-stats-label">Daily goal</span>
          <input id="docDailyGoal" type="text" inputmode="numeric" class="doc-stats-input" value="${dailyGoal}" />
        </div>

        <div class="doc-stats-row doc-stats-row-input">
          <span class="doc-stats-label">Overall goal</span>
          <input id="docOverallGoal" type="text" inputmode="numeric" class="doc-stats-input" value="${overallGoal}" />
        </div>
      </div>

      <div class="doc-stats-section">
        <div class="doc-stats-section-title">Today</div>

        <div class="doc-stats-row">
          <span class="doc-stats-label">Written</span>
          <span class="doc-stats-value">${todayWords} words</span>
        </div>

        <div class="doc-progress-bar">
          <div class="doc-progress-fill" style="width:${todayProgress}%"></div>
        </div>

        <div class="doc-stats-row doc-stats-row-meta">
          <span class="doc-stats-label">Progress</span>
          <span class="doc-stats-value">${todayProgress}%</span>
        </div>
      </div>

      <div class="doc-stats-section">
        <div class="doc-stats-section-title">Overall</div>

        <div class="doc-stats-row">
          <span class="doc-stats-label">Total words</span>
          <span class="doc-stats-value">${totalWords}</span>
        </div>

        <div class="doc-progress-bar">
          <div class="doc-progress-fill" style="width:${overallProgress}%"></div>
        </div>

        <div class="doc-stats-row doc-stats-row-meta">
          <span class="doc-stats-label">Progress</span>
          <span class="doc-stats-value">${overallProgress}%</span>
        </div>
      </div>

      <div class="doc-stats-section">
        <div class="doc-stats-section-title">Session</div>

        <div class="doc-stats-row">
          <span class="doc-stats-label">Words this session</span>
          <span class="doc-stats-value">${sessionWords}</span>
        </div>
      </div>
    `;

    document.getElementById("docDailyGoal")?.addEventListener("input", (e) => {
      const value = Math.max(0, Number(e.target.value) || 0);
      if (!docData.meta) docData.meta = normalizeDocMeta({});
      docData.meta.stats = normalizeDocStats({
        ...(docData.meta.stats || {}),
        dailyGoal: value
      });
      persistActiveDocData();
      renderStatsPanel();
    });

    document.getElementById("docOverallGoal")?.addEventListener("input", (e) => {
      const value = Math.max(0, Number(e.target.value) || 0);
      if (!docData.meta) docData.meta = normalizeDocMeta({});
      docData.meta.stats = normalizeDocStats({
        ...(docData.meta.stats || {}),
        overallGoal: value
      });
      persistActiveDocData();
      renderStatsPanel();
    });

    return;
  }

  if (activeDocStatsTab === "patterns") {
    const dialogueSection = document.createElement("div");
    dialogueSection.className = "doc-stats-section";
    dialogueSection.innerHTML = `
      <div class="doc-stats-section-title">Voice Balance</div>
      <div class="doc-stats-bar-wrap">
        <div class="doc-stats-bar-fill dialogue" style="width:${s.dialoguePct}%"></div>
        <div class="doc-stats-bar-fill narration" style="width:${s.narrationPct}%"></div>
      </div>
      <div class="doc-stats-bar-labels">
        <span>Dialogue ${s.dialoguePct}%</span>
        <span>Narration ${s.narrationPct}%</span>
      </div>
      <div class="doc-stats-row">
        <span class="doc-stats-label">Avg sentence length</span>
        <span class="doc-stats-value">${s.avgSentenceLength} words</span>
      </div>
      <div class="doc-stats-row">
        <span class="doc-stats-label">Avg paragraph length</span>
        <span class="doc-stats-value">${s.avgParaLength} words</span>
      </div>
    `;
    body.appendChild(dialogueSection);

    const topWordsSection = document.createElement("div");
    topWordsSection.className = "doc-stats-section";
    topWordsSection.innerHTML = `<div class="doc-stats-section-title">Most Used Words</div>`;

    if (s.topWords.length) {
      const max = s.topWords[0][1];
      s.topWords.slice(0, 8).forEach(([word, count]) => {
        const row = document.createElement("div");
        row.className = "doc-stats-freq-row";
        row.innerHTML = `
          <span class="doc-stats-freq-word">${word}</span>
          <div class="doc-stats-freq-bar-wrap">
            <div class="doc-stats-freq-bar" style="width:${Math.max(8, (count / max) * 100)}%"></div>
          </div>
          <span class="doc-stats-freq-count">${count}</span>
        `;
        topWordsSection.appendChild(row);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "doc-stats-empty";
      empty.textContent = "Not enough text yet.";
      topWordsSection.appendChild(empty);
    }

    body.appendChild(topWordsSection);

    const topPhrasesSection = document.createElement("div");
    topPhrasesSection.className = "doc-stats-section";
    topPhrasesSection.innerHTML = `<div class="doc-stats-section-title">Most Used Phrases</div>`;

    if (s.topPhrases.length) {
      const max = s.topPhrases[0][1];
      s.topPhrases.slice(0, 8).forEach(([phrase, count]) => {
        const row = document.createElement("div");
        row.className = "doc-stats-freq-row";
        row.innerHTML = `
          <span class="doc-stats-freq-word">${phrase}</span>
          <div class="doc-stats-freq-bar-wrap">
            <div class="doc-stats-freq-bar" style="width:${Math.max(8, (count / max) * 100)}%"></div>
          </div>
          <span class="doc-stats-freq-count">${count}</span>
        `;
        topPhrasesSection.appendChild(row);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "doc-stats-empty";
      empty.textContent = "Not enough repeated phrases yet.";
      topPhrasesSection.appendChild(empty);
    }

    body.appendChild(topPhrasesSection);
    return;
  }

  if (activeDocStatsTab === "history") {
    const rangeDays = Math.max(1, Number(activeDocHistoryRange) || 30);
    const historyEntries = getHistoryEntriesForRange(stats, rangeDays);
    const historyMaxLocal = Math.max(1, ...historyEntries.map((entry) => entry.words));
    const currentStreak = computeWritingStreak(stats);
    const longestStreak = computeLongestWritingStreak(stats);
    const summary = computeHistorySummary(historyEntries);
    const monthlyTotals = groupHistoryByMonth(historyEntries, rangeDays >= 365 ? 12 : rangeDays >= 90 ? 6 : 3);

    body.innerHTML = `
      <div class="doc-stats-section">
        <div class="doc-stats-history-range">
          <button class="doc-history-range-btn ${rangeDays === 7 ? "active" : ""}" data-days="7">7D</button>
          <button class="doc-history-range-btn ${rangeDays === 30 ? "active" : ""}" data-days="30">30D</button>
          <button class="doc-history-range-btn ${rangeDays === 90 ? "active" : ""}" data-days="90">90D</button>
          <button class="doc-history-range-btn ${rangeDays === 365 ? "active" : ""}" data-days="365">Year</button>
        </div>
      </div>

      <div class="doc-stats-section">
        <div class="doc-stats-grid">
          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Current Streak</div>
            <div class="doc-stats-card-value">${currentStreak}</div>
            <div class="doc-stats-subvalue">day${currentStreak === 1 ? "" : "s"}</div>
          </div>

          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Longest Streak</div>
            <div class="doc-stats-card-value">${longestStreak}</div>
            <div class="doc-stats-subvalue">day${longestStreak === 1 ? "" : "s"}</div>
          </div>

          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Active Days</div>
            <div class="doc-stats-card-value">${summary.activeDays}</div>
            <div class="doc-stats-subvalue">in this range</div>
          </div>

          <div class="doc-stats-card">
            <div class="doc-stats-card-label">Range Total</div>
            <div class="doc-stats-card-value">${summary.totalWords}</div>
            <div class="doc-stats-subvalue">words</div>
          </div>
        </div>
      </div>
    `;

    const summarySection = document.createElement("div");
    summarySection.className = "doc-stats-section";
    summarySection.innerHTML = `
      <div class="doc-stats-section-title">Summary</div>
      <div class="doc-stats-row">
        <span class="doc-stats-label">Best day</span>
        <span class="doc-stats-value">${summary.bestDay ? `${formatStatsShortDate(summary.bestDay.date)} · ${summary.bestDay.words} words` : "No history yet"}</span>
      </div>
      <div class="doc-stats-row">
        <span class="doc-stats-label">Average per day</span>
        <span class="doc-stats-value">${summary.avgPerDay} words</span>
      </div>
      <div class="doc-stats-row">
        <span class="doc-stats-label">Average on active days</span>
        <span class="doc-stats-value">${summary.avgActiveDay} words</span>
      </div>
    `;
    body.appendChild(summarySection);

    const historySection = document.createElement("div");
    historySection.className = "doc-stats-section";
    historySection.innerHTML = `<div class="doc-stats-section-title">Last ${rangeDays} Days</div>`;

    historyEntries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "doc-stats-history-row";
      row.innerHTML = `
        <span class="doc-stats-history-date">${formatStatsShortDate(entry.date)}</span>
        <div class="doc-stats-history-bar-wrap">
          <div class="doc-stats-history-bar" style="width:${historyMaxLocal ? (entry.words / historyMaxLocal) * 100 : 0}%"></div>
        </div>
        <span class="doc-stats-history-value">${entry.words}</span>
      `;
      historySection.appendChild(row);
    });

    body.appendChild(historySection);

    const monthSection = document.createElement("div");
    monthSection.className = "doc-stats-section";
    monthSection.innerHTML = `<div class="doc-stats-section-title">By Month</div>`;

    if (monthlyTotals.length) {
      monthlyTotals.forEach((entry) => {
        const row = document.createElement("div");
        row.className = "doc-stats-month-row";
        row.innerHTML = `
          <span class="doc-stats-month-label">${formatStatsMonth(entry.month)}</span>
          <span class="doc-stats-month-value">${entry.words} words</span>
        `;
        monthSection.appendChild(row);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "doc-stats-empty";
      empty.textContent = "No monthly history yet.";
      monthSection.appendChild(empty);
    }

    body.appendChild(monthSection);
    return;
  }
}

document.getElementById("docStatsTabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-stats-tab");
  if (!btn) return;

  const nextTab = btn.dataset.tab;
  if (!nextTab) return;

  activeDocStatsTab = nextTab;

  document.querySelectorAll(".doc-stats-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === nextTab);
  });

  renderStatsPanel();
});

document.getElementById("docStatsBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".doc-history-range-btn");
  if (!btn) return;

  e.stopPropagation();
  const nextDays = Math.max(1, Number(btn.dataset.days) || 30);
  activeDocHistoryRange = nextDays;
  renderStatsPanel();
});

function renderDocStats() {
  renderStatsPanel();
}

document.getElementById("docStatsBtn")?.addEventListener("click", () => {
  const panel = document.getElementById("docStatsPanel");
  if (!panel) return;
  const isOpen = panel.classList.contains("open");
  if (isOpen) {
    panel.classList.remove("open");
  } else {
    renderStatsPanel();
    panel.classList.add("open");
  }
});

document.getElementById("docStatsClose")?.addEventListener("click", () => {
  document.getElementById("docStatsPanel")?.classList.remove("open");
});

function getCurrentDocSelectionText() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return "";

  const range = sel.getRangeAt(0);
  const content = document.getElementById("docContent");
  if (!content || !content.contains(range.commonAncestorContainer)) return "";

  return sel.toString().trim();
}

function insertLexiconTextAtCursor(text) {
  const content = document.getElementById("docContent");
  if (!content || !text) return;

  content.focus();
  document.execCommand("insertText", false, text);
  saveCurrentDocSection();
  updateDocCounts();
}

function replaceSelectionWithLexiconText(text) {
  const sel = window.getSelection();
  const content = document.getElementById("docContent");
  if (!sel || !content || !text) return false;
  if (!sel.rangeCount || sel.isCollapsed) return false;

  const range = sel.getRangeAt(0);
  if (!content.contains(range.commonAncestorContainer)) return false;

  document.execCommand("insertText", false, text);
  saveCurrentDocSection();
  updateDocCounts();
  return true;
}

async function copyLexiconText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn("Clipboard copy failed", err);
  }
}

function getFilteredLexiconGroups() {
  const search = document.getElementById("docLexiconSearch")?.value?.toLowerCase().trim() || "";

  let groups = [...lexiconData];

  if (activeLexShelf !== "all") {
    groups = groups.filter((g) => g.shelf === activeLexShelf || g.sections.some((s) => s.type === activeLexShelf));
  }

  if (search) {
    groups = groups.filter((g) => {
      const haystack = [
        g.title,
        g.shelf,
        ...g.sections.flatMap((s) => [s.title, s.type, ...s.entries.map((e) => e.text)])
      ].join(" ").toLowerCase();

      return haystack.includes(search);
    });
  }

  return groups;
}

function getActiveLexiconGroup() {
  return getLexiconGroupById(activeLexiconGroupId);
}

function getActiveLexiconSection() {
  return getLexiconSectionById(activeLexiconGroupId, activeLexiconSectionId);
}

function getLexiconViewLabel(view) {
  if (view === "favorites") return "Favorites";
  if (view === "recent") return "Recent";
  return "All";
}

function syncLexiconTopControls() {
  const shelfSelect = document.getElementById("docLexiconShelfSelect");
  if (shelfSelect) {
    shelfSelect.value = activeLexShelf;
  }

  const sortBtn = document.getElementById("docLexiconSortBtn");
  if (sortBtn) {
    sortBtn.textContent = `Sort: ${getLexiconViewLabel(activeLexiconView)}`;
  }

  document.querySelectorAll("#docLexiconSortMenu button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === activeLexiconView);
  });
}

function clearLexiconSelection() {
  activeLexiconEntryId = null;
  editingLexiconEntry = null;
}

function populateLexiconComposerSections(groupId, preferredSectionId = null) {
  const sectionSelect = document.getElementById("lexComposerSectionSelect");
  if (!sectionSelect) return;

  const group = getLexiconGroupById(groupId);
  const sections = Array.isArray(group?.sections) ? group.sections : [];

  sectionSelect.innerHTML = "";

  if (!sections.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No sections yet";
    sectionSelect.appendChild(opt);
    sectionSelect.value = "";
    return;
  }

  sections.forEach((section) => {
    const opt = document.createElement("option");
    opt.value = section.id;
    opt.textContent = section.title;
    sectionSelect.appendChild(opt);
  });

  if (preferredSectionId && sections.some((s) => s.id === preferredSectionId)) {
    sectionSelect.value = preferredSectionId;
  } else {
    sectionSelect.value = sections[0].id;
  }
}

function populateLexiconComposerTargets(preferredGroupId = null, preferredSectionId = null) {
  const groupSelect = document.getElementById("lexComposerGroupSelect");
  if (!groupSelect) return;

  groupSelect.innerHTML = "";

  if (!lexiconData.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No groups yet";
    groupSelect.appendChild(opt);
    groupSelect.value = "";
    populateLexiconComposerSections("", "");
    return;
  }

  lexiconData.forEach((group) => {
    const opt = document.createElement("option");
    opt.value = group.id;
    opt.textContent = group.title;
    groupSelect.appendChild(opt);
  });

  if (preferredGroupId && lexiconData.some((g) => g.id === preferredGroupId)) {
    groupSelect.value = preferredGroupId;
  } else {
    groupSelect.value = lexiconData[0].id;
  }

  populateLexiconComposerSections(groupSelect.value, preferredSectionId);
}

function openLexiconComposer(mode) {
  lexiconComposerMode = mode;
  const composer = document.getElementById("docLexiconComposer");
  const title = document.getElementById("lexComposerTitle");
  const name = document.getElementById("lexComposerName");
  const groupSelect = document.getElementById("lexComposerGroupSelect");
  const sectionSelect = document.getElementById("lexComposerSectionSelect");
  const type = document.getElementById("lexComposerType");
  const text = document.getElementById("lexComposerText");

  if (!composer || !title || !name || !groupSelect || !sectionSelect || !type || !text) return;

  composer.style.display = "flex";
  name.value = "";
  text.value = "";
  groupSelect.style.display = "none";
  sectionSelect.style.display = "none";
  type.style.display = "none";
  text.style.display = "none";

  if (mode === "group") {
    title.textContent = "New Group";
    name.placeholder = "Group name";
  }

  if (mode === "section") {
    title.textContent = "New Section";
    name.placeholder = "Section name";
    type.style.display = "";
  }

  if (mode === "entry") {
    title.textContent = "New Entry";
    name.style.display = "none";
    groupSelect.style.display = "";
    sectionSelect.style.display = "";
    text.style.display = "";
    text.placeholder = "Entry text...";
    populateLexiconComposerTargets(activeLexiconGroupId, activeLexiconSectionId);
  }

  if (mode === "edit-entry") {
    title.textContent = "Edit Entry";
    name.style.display = "none";
    groupSelect.style.display = "";
    sectionSelect.style.display = "";
    text.style.display = "";
    populateLexiconComposerTargets(activeLexiconGroupId, activeLexiconSectionId);
  } else {
    if (mode !== "entry") {
      name.style.display = "";
    }
  }
}

function closeLexiconComposer() {
  lexiconComposerMode = null;
  editingLexiconEntry = null;
  const composer = document.getElementById("docLexiconComposer");
  const name = document.getElementById("lexComposerName");
  const groupSelect = document.getElementById("lexComposerGroupSelect");
  const sectionSelect = document.getElementById("lexComposerSectionSelect");
  const type = document.getElementById("lexComposerType");
  const text = document.getElementById("lexComposerText");

  if (composer) composer.style.display = "none";
  if (name) { name.value = ""; name.style.display = ""; }
  if (groupSelect) { groupSelect.innerHTML = ""; groupSelect.style.display = "none"; }
  if (sectionSelect) { sectionSelect.innerHTML = ""; sectionSelect.style.display = "none"; }
  if (type) { type.value = "description"; type.style.display = "none"; }
  if (text) { text.value = ""; text.style.display = "none"; }
}

function closeLexiconEntryMenu() {
  document.getElementById("docLexiconEntryMenu")?.remove();
}

function closeLexiconBrowserMenu() {
  document.getElementById("docLexiconBrowserMenu")?.remove();
}

function openLexiconBrowserMenu(anchorEl, payload) {
  closeLexiconEntryMenu();
  closeLexiconBrowserMenu();

  const menu = document.createElement("div");
  menu.id = "docLexiconBrowserMenu";
  menu.className = "doc-lexicon-entry-popup-menu";
  menu.innerHTML = `
    <button class="doc-lexicon-entry-popup-item" data-action="rename">Rename</button>
    <button class="doc-lexicon-entry-popup-item danger" data-action="delete">Delete</button>
  `;

  document.body.appendChild(menu);

  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.right - 110}px`;

  const showRenameEditor = (initialValue, onSave) => {
    menu.innerHTML = `
      <div class="doc-lexicon-popup-rename-wrap">
        <input class="doc-lexicon-popup-rename-input" type="text" value="${initialValue.replace(/"/g, "&quot;")}" />
        <div class="doc-lexicon-popup-rename-actions">
          <button class="doc-lexicon-entry-popup-item" data-action="rename-save">Save</button>
          <button class="doc-lexicon-entry-popup-item" data-action="rename-cancel">Cancel</button>
        </div>
      </div>
    `;

    const input = menu.querySelector(".doc-lexicon-popup-rename-input");
    if (!input) return;
    input.focus();
    input.select();

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        const nextValue = input.value.trim();
        if (nextValue) onSave(nextValue);
        closeLexiconBrowserMenu();
      }

      if (evt.key === "Escape") {
        evt.preventDefault();
        closeLexiconBrowserMenu();
      }
    });
  };

  menu.addEventListener("click", (e) => {
    e.preventDefault();

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "rename-cancel") {
      closeLexiconBrowserMenu();
      return;
    }

    if (payload.level === "group") {
      const group = getLexiconGroupById(payload.groupId);
      if (!group) {
        closeLexiconBrowserMenu();
        return;
      }

      if (action === "rename") {
        showRenameEditor(group.title, (nextTitle) => {
          group.title = nextTitle;
          saveLexicon();
          renderLexicon();
        });
        return;
      }

      if (action === "rename-save") {
        const input = menu.querySelector(".doc-lexicon-popup-rename-input");
        const nextTitle = input?.value.trim();
        if (nextTitle) {
          group.title = nextTitle;
          saveLexicon();
          renderLexicon();
        }
        closeLexiconBrowserMenu();
        return;
      }

      if (action === "delete") {
        lexiconData = lexiconData.filter((g) => g.id !== payload.groupId);
        if (activeLexiconGroupId === payload.groupId) {
          activeLexiconGroupId = null;
          activeLexiconSectionId = null;
          activeLexiconEntryId = null;
        }
        saveLexicon();
        closeLexiconBrowserMenu();
        renderLexicon();
      }
      return;
    }

    if (payload.level === "section") {
      const group = getLexiconGroupById(payload.groupId);
      if (!group) {
        closeLexiconBrowserMenu();
        return;
      }

      const section = group.sections.find((s) => s.id === payload.sectionId);
      if (!section) {
        closeLexiconBrowserMenu();
        return;
      }

      if (action === "rename") {
        showRenameEditor(section.title, (nextTitle) => {
          section.title = nextTitle;
          saveLexicon();
          renderLexicon();
        });
        return;
      }

      if (action === "rename-save") {
        const input = menu.querySelector(".doc-lexicon-popup-rename-input");
        const nextTitle = input?.value.trim();
        if (nextTitle) {
          section.title = nextTitle;
          saveLexicon();
          renderLexicon();
        }
        closeLexiconBrowserMenu();
        return;
      }

      if (action === "delete") {
        group.sections = group.sections.filter((s) => s.id !== payload.sectionId);
        if (activeLexiconSectionId === payload.sectionId) {
          activeLexiconSectionId = null;
          activeLexiconEntryId = null;
        }
        saveLexicon();
        closeLexiconBrowserMenu();
        renderLexicon();
      }
    }
  });
}

function openLexiconEntryMenu(anchorEl, { groupId, sectionId, entryId }) {
  closeLexiconBrowserMenu();
  closeLexiconEntryMenu();

  const initialEntry = getLexiconEntryById(groupId, sectionId, entryId);
  if (!initialEntry) return;

  const menu = document.createElement("div");
  menu.id = "docLexiconEntryMenu";
  menu.className = "doc-lexicon-entry-popup-menu";
  menu.innerHTML = `
    <button class="doc-lexicon-entry-popup-item" data-action="edit">Edit</button>
    <button class="doc-lexicon-entry-popup-item" data-action="copy">Copy</button>
    <button class="doc-lexicon-entry-popup-item" data-action="favorite">${initialEntry.favorite ? "Unfavorite" : "Favorite"}</button>
    <button class="doc-lexicon-entry-popup-item danger" data-action="delete">Delete</button>
  `;

  document.body.appendChild(menu);

  const rect = anchorEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.right - 110}px`;

  menu.addEventListener("mousedown", async (e) => {
    e.preventDefault();

    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    const entry = getLexiconEntryById(groupId, sectionId, entryId);
    const section = getLexiconSectionById(groupId, sectionId);
    if (!entry || !section) {
      closeLexiconEntryMenu();
      return;
    }

    if (action === "copy") {
      await copyLexiconText(entry.text);
      bumpLexiconEntryUsage(groupId, sectionId, entryId);
      closeLexiconEntryMenu();
      return;
    }

    if (action === "favorite") {
      entry.favorite = !entry.favorite;
      saveLexicon();
      closeLexiconEntryMenu();
      renderLexicon();
      return;
    }

    if (action === "edit") {
      editingLexiconEntry = { groupId, sectionId, entryId };
      openLexiconComposer("edit-entry");
      document.getElementById("lexComposerText").value = entry.text;
      closeLexiconEntryMenu();
      return;
    }

    if (action === "delete") {
      section.entries = section.entries.filter((e2) => e2.id !== entryId);
      if (activeLexiconEntryId === entryId) activeLexiconEntryId = null;
      saveLexicon();
      closeLexiconEntryMenu();
      renderLexicon();
    }
  });
}

// == Lexicon ==
const lexPanel = document.getElementById("docLexiconPanel");

function renderLexicon() {
  const list = document.getElementById("docLexiconList");
  const breadcrumb = document.getElementById("docLexiconBreadcrumb");
  const backBtn = document.getElementById("lexBackBtn");
  const addSectionBtn = document.getElementById("lexAddSectionBtn");
  const addEntryBtn = document.getElementById("lexAddEntryBtn");
  const insertBtn = document.getElementById("lexInsertSelectedBtn");

  if (!list || !breadcrumb || !backBtn || !addSectionBtn || !addEntryBtn || !insertBtn) return;

  const group = getActiveLexiconGroup();
  const section = getActiveLexiconSection();

  list.innerHTML = "";
  const groupStillValid = activeLexiconGroupId && getLexiconGroupById(activeLexiconGroupId);
  const sectionStillValid = activeLexiconSectionId && getLexiconSectionById(activeLexiconGroupId, activeLexiconSectionId);
  const entryStillValid = activeLexiconEntryId && getLexiconEntryById(activeLexiconGroupId, activeLexiconSectionId, activeLexiconEntryId);

  if (!groupStillValid) activeLexiconGroupId = null;
  if (!sectionStillValid) activeLexiconSectionId = null;
  if (!entryStillValid) activeLexiconEntryId = null;

  backBtn.style.display = (group || section) ? "" : "none";
  addSectionBtn.style.display = group && !section ? "" : "none";
  addEntryBtn.style.display = section ? "" : "none";
  insertBtn.style.display = section && activeLexiconEntryId ? "" : "none";

  const addGroupBtn = document.getElementById("lexAddGroupBtn");
  if (addGroupBtn) {
    addGroupBtn.style.display = !group ? "" : "none";
  }

  if (!group) {
    breadcrumb.textContent = "Groups";

    const groups = getFilteredLexiconGroups();

    if (!groups.length) {
      list.innerHTML = `<div class="doc-lexicon-empty">No groups yet.</div>`;
      return;
    }

    groups.forEach((g) => {
      const row = document.createElement("div");
      row.className = "doc-lexicon-browser-row";
      row.innerHTML = `
        <div class="doc-lexicon-browser-main">
          <div class="doc-lexicon-browser-title">${g.title}</div>
          <div class="doc-lexicon-browser-meta">${g.shelf}</div>
        </div>
        <div class="doc-lexicon-browser-tools">
          <div class="doc-lexicon-browser-count">${g.sections.length}</div>
          <button class="doc-lexicon-browser-menu" data-action="delete-group">⋮</button>
        </div>
      `;

      row.querySelector('[data-action="delete-group"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        openLexiconBrowserMenu(e.currentTarget, {
          level: "group",
          groupId: g.id
        });
        renderLexicon();
      });

      row.addEventListener("click", () => {
        activeLexiconGroupId = g.id;
        activeLexiconSectionId = null;
        renderLexicon();
      });
      list.appendChild(row);
    });

    return;
  }

  if (!section) {
    breadcrumb.textContent = `${group.title} / Sections`;

    if (!group.sections.length) {
      list.innerHTML = `<div class="doc-lexicon-empty">No sections yet.</div>`;
      return;
    }

    group.sections.forEach((s) => {
      const row = document.createElement("div");
      row.className = "doc-lexicon-browser-row";
      row.innerHTML = `
        <div class="doc-lexicon-browser-main">
          <div class="doc-lexicon-browser-title">${s.title}</div>
          <div class="doc-lexicon-browser-meta">${s.type}</div>
        </div>
        <div class="doc-lexicon-browser-tools">
          <div class="doc-lexicon-browser-count">${s.entries.length}</div>
          <button class="doc-lexicon-browser-menu" data-action="delete-section">⋮</button>
        </div>
      `;

      row.querySelector('[data-action="delete-section"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        openLexiconBrowserMenu(e.currentTarget, {
          level: "section",
          groupId: group.id,
          sectionId: s.id
        });
        renderLexicon();
      });

      row.addEventListener("click", () => {
        activeLexiconSectionId = s.id;
        renderLexicon();
      });
      list.appendChild(row);
    });

    return;
  }

  breadcrumb.textContent = `${group.title} / ${section.title}`;

  const sortedEntries = [...section.entries].sort((a, b) => {
    if (!!b.favorite !== !!a.favorite) return Number(b.favorite) - Number(a.favorite);

    const aRecent = Number(a.lastUsedAt || 0);
    const bRecent = Number(b.lastUsedAt || 0);
    if (bRecent !== aRecent) return bRecent - aRecent;

    const aCount = Number(a.useCount || 0);
    const bCount = Number(b.useCount || 0);
    if (bCount !== aCount) return bCount - aCount;

    return Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });

  let visibleEntries = sortedEntries;

  if (activeLexiconView === "favorites") {
    visibleEntries = visibleEntries.filter((entry) => entry.favorite);
  }

  if (activeLexiconView === "recent") {
    visibleEntries = visibleEntries.filter((entry) => Number(entry.lastUsedAt || 0) > 0);
  }

  if (activeLexiconEntryId && !visibleEntries.some((entry) => entry.id === activeLexiconEntryId)) {
    activeLexiconEntryId = null;
  }
  insertBtn.style.display = section && activeLexiconEntryId ? "" : "none";

  if (!visibleEntries.length) {
    if (!section.entries.length && activeLexiconView === "all") {
      list.innerHTML = `<div class="doc-lexicon-empty">No entries here yet.</div>`;
    } else {
      list.innerHTML = `<div class="doc-lexicon-empty">No matching entries here.</div>`;
    }
    return;
  }

  visibleEntries.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "doc-lexicon-entry-row";
    row.dataset.entryId = entry.id;

    row.innerHTML = `
      <div class="doc-lexicon-entry-text">${entry.text}</div>
      ${entry.favorite ? '<span class="doc-lexicon-entry-star">★</span>' : ""}
      <button class="doc-lexicon-entry-menu" data-action="menu">⋮</button>
    `;

    row.classList.toggle("selected", activeLexiconEntryId === entry.id);

    row.addEventListener("click", () => {
      activeLexiconEntryId = entry.id;
      renderLexicon();
    });

    row.querySelector(".doc-lexicon-entry-menu")?.addEventListener("click", (e) => {
      e.stopPropagation();
      activeLexiconEntryId = entry.id;
      openLexiconEntryMenu(e.currentTarget, {
        groupId: group.id,
        sectionId: section.id,
        entryId: entry.id
      });
      renderLexicon();
    });

    list.appendChild(row);
  });
}

document.getElementById("docLexiconToggle")?.addEventListener("click", () => {
  lexPanel.classList.toggle("open");
  renderLexicon();
});

document.getElementById("docLexiconClose")?.addEventListener("click", () => {
  lexPanel.classList.remove("open");
});

document.getElementById("docLexiconSaveSelection")?.addEventListener("click", () => {
  const selected = getCurrentDocSelectionText();
  const group = getActiveLexiconGroup();
  const section = getActiveLexiconSection();

  if (section && selected) {
    const entry = createLexiconEntry({
      groupId: group.id,
      sectionId: section.id,
      text: selected
    });

    if (entry) {
      activeLexiconEntryId = entry.id;
      renderLexicon();
    }
    return;
  }

  if (section && !selected) {
    closeLexiconComposer();
    openLexiconComposer("entry");
    return;
  }

  if (group && !section) {
    closeLexiconComposer();
    openLexiconComposer("entry");
    populateLexiconComposerTargets(group.id);
    return;
  }

  closeLexiconComposer();
  openLexiconComposer("entry");

  if (selected) {
    const text = document.getElementById("lexComposerText");
    if (text) text.value = selected;
  }
});

document.getElementById("lexAddGroupBtn")?.addEventListener("click", () => {
  closeLexiconComposer();
  openLexiconComposer("group");
});

document.getElementById("lexAddSectionBtn")?.addEventListener("click", () => {
  if (!activeLexiconGroupId) return;
  closeLexiconComposer();
  openLexiconComposer("section");
});

document.getElementById("lexAddEntryBtn")?.addEventListener("click", () => {
  if (!activeLexiconGroupId || !activeLexiconSectionId) return;
  closeLexiconComposer();
  openLexiconComposer("entry");
});

document.getElementById("lexComposerCancelBtn")?.addEventListener("click", () => {
  closeLexiconComposer();
});

document.getElementById("lexComposerGroupSelect")?.addEventListener("change", (e) => {
  const nextGroupId = e.target.value;
  populateLexiconComposerSections(nextGroupId, null);
});

document.getElementById("lexComposerSaveBtn")?.addEventListener("click", () => {
  const name = document.getElementById("lexComposerName")?.value.trim() || "";
  const type = document.getElementById("lexComposerType")?.value || "description";
  const text = document.getElementById("lexComposerText")?.value.trim() || "";
  const groupSelect = document.getElementById("lexComposerGroupSelect");
  const sectionSelect = document.getElementById("lexComposerSectionSelect");

  if (lexiconComposerMode === "group") {
    const group = createLexiconGroup({
      shelf: activeLexShelf === "all" ? "general" : activeLexShelf,
      title: name
    });
    if (group) {
      activeLexiconGroupId = group.id;
      activeLexiconSectionId = null;
      activeLexiconEntryId = null;
    }
  }

  if (lexiconComposerMode === "section") {
    const section = createLexiconSection({ groupId: activeLexiconGroupId, title: name, type });
    if (section) {
      activeLexiconSectionId = section.id;
      activeLexiconEntryId = null;
    }
  }

  if (lexiconComposerMode === "entry") {
    const targetGroupId = groupSelect?.value || activeLexiconGroupId;
    const targetSectionId = sectionSelect?.value || activeLexiconSectionId;

    const entry = createLexiconEntry({
      groupId: targetGroupId,
      sectionId: targetSectionId,
      text
    });

    if (entry) {
      activeLexiconGroupId = targetGroupId;
      activeLexiconSectionId = targetSectionId;
      activeLexiconEntryId = entry.id;
    }
  }

  if (lexiconComposerMode === "edit-entry" && editingLexiconEntry) {
    const targetGroupId = groupSelect?.value || editingLexiconEntry.groupId;
    const targetSectionId = sectionSelect?.value || editingLexiconEntry.sectionId;

    if (
      targetGroupId !== editingLexiconEntry.groupId ||
      targetSectionId !== editingLexiconEntry.sectionId
    ) {
      const oldSection = getLexiconSectionById(editingLexiconEntry.groupId, editingLexiconEntry.sectionId);
      const oldEntry = getLexiconEntryById(editingLexiconEntry.groupId, editingLexiconEntry.sectionId, editingLexiconEntry.entryId);

      if (oldSection && oldEntry) {
        oldSection.entries = oldSection.entries.filter((e) => e.id !== oldEntry.id);

        const newEntry = createLexiconEntry({
          groupId: targetGroupId,
          sectionId: targetSectionId,
          text
        });

        activeLexiconGroupId = targetGroupId;
        activeLexiconSectionId = targetSectionId;
        activeLexiconEntryId = newEntry?.id || null;
      }
    } else {
      updateLexiconEntry({
        groupId: editingLexiconEntry.groupId,
        sectionId: editingLexiconEntry.sectionId,
        entryId: editingLexiconEntry.entryId,
        text
      });

      activeLexiconGroupId = editingLexiconEntry.groupId;
      activeLexiconSectionId = editingLexiconEntry.sectionId;
      activeLexiconEntryId = editingLexiconEntry.entryId;
    }

    saveLexicon();
  }

  closeLexiconComposer();
  closeLexiconEntryMenu();
  renderLexicon();
});

document.getElementById("lexInsertSelectedBtn")?.addEventListener("click", () => {
  if (!activeLexiconGroupId || !activeLexiconSectionId || !activeLexiconEntryId) return;

  const entry = getLexiconEntryById(activeLexiconGroupId, activeLexiconSectionId, activeLexiconEntryId);
  if (!entry) return;

  let replaced = false;
  if (lexiconInsertMode === "replace" && restoreLexiconLookupSelectionRange()) {
    replaced = replaceSelectionWithLexiconText(entry.text);
  }

  if (!replaced) {
    replaced = replaceSelectionWithLexiconText(entry.text);
  }

  if (!replaced) insertLexiconTextAtCursor(entry.text);

  lexiconInsertMode = "insert";
  lexiconLookupSelectionRange = null;
  bumpLexiconEntryUsage(activeLexiconGroupId, activeLexiconSectionId, activeLexiconEntryId);
});

document.getElementById("lexBackBtn")?.addEventListener("click", () => {
  if (activeLexiconSectionId) {
    activeLexiconSectionId = null;
    renderLexicon();
    return;
  }

  if (activeLexiconGroupId) {
    activeLexiconGroupId = null;
    renderLexicon();
  }
});

document.getElementById("docLexiconBreadcrumb")?.addEventListener("click", () => {
  if (activeLexiconSectionId) {
    activeLexiconSectionId = null;
    renderLexicon();
    return;
  }

  if (activeLexiconGroupId) {
    activeLexiconGroupId = null;
    renderLexicon();
  }
});

document.getElementById("docLexiconSearch")?.addEventListener("input", () => {
  activeLexiconGroupId = null;
  activeLexiconSectionId = null;
  activeLexiconEntryId = null;
  renderLexicon();
});

document.getElementById("docLexiconShelfSelect")?.addEventListener("change", (e) => {
  activeLexShelf = e.target.value || "all";
  activeLexiconGroupId = null;
  activeLexiconSectionId = null;
  activeLexiconEntryId = null;
  renderLexicon();
});

document.getElementById("docLexiconSortBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = document.getElementById("docLexiconSortMenu");
  const btn = document.getElementById("docLexiconSortBtn");
  if (!menu || !btn) return;

  const isOpen = menu.classList.toggle("open");
  btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
});

document.getElementById("docLexiconSortMenu")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  activeLexiconView = btn.dataset.view || "all";
  syncLexiconTopControls();

  const menu = document.getElementById("docLexiconSortMenu");
  const sortBtn = document.getElementById("docLexiconSortBtn");
  menu?.classList.remove("open");
  sortBtn?.setAttribute("aria-expanded", "false");
  renderLexicon();
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#docLexiconEntryMenu") && !e.target.closest(".doc-lexicon-entry-menu")) {
    closeLexiconEntryMenu();
  }

  if (!e.target.closest("#docLexiconBrowserMenu") && !e.target.closest(".doc-lexicon-browser-menu")) {
    closeLexiconBrowserMenu();
  }

  if (!e.target.closest(".doc-lexicon-sort-wrap")) {
    const menu = document.getElementById("docLexiconSortMenu");
    const sortBtn = document.getElementById("docLexiconSortBtn");
    menu?.classList.remove("open");
    sortBtn?.setAttribute("aria-expanded", "false");
  }

  if (!e.target.closest("#docLexiconQuickSaveMenu")) {
    closeLexiconQuickSaveMenu();
  }
});

syncLexiconTopControls();

// == Page Numbers ==
let pageNumbersVisible = false;

function renderDocPageBreaks() {
  syncDocPages({ preserveSelection: true });
}

function togglePageNumbers() {
  pageNumbersVisible = !pageNumbersVisible;

  document.querySelectorAll(".doc-page-num-marker").forEach((el) => el.remove());

  if (!pageNumbersVisible) return;

  document.querySelectorAll(".doc-page").forEach((page, index) => {
    const marker = document.createElement("div");
    marker.className = "doc-page-num-marker";
    marker.textContent = `Page ${index + 1}`;
    page.appendChild(marker);
  });
}

document.getElementById("docPagesHost")?.addEventListener("input", (e) => {
  if (!e.target.closest(".doc-content")) return;
  clearTimeout(window._pageNumTimer);
  window._pageNumTimer = setTimeout(() => {
    syncDocPages({ preserveSelection: true });
  }, 500);
});



// == Writing Style Kit ==
const STYLE_KITS_KEY = "sanctum_style_kits";
const PAGE_PRESETS_KEY = "sanctum_page_presets";

function loadStyleKits() {
  return JSON.parse(localStorage.getItem(STYLE_KITS_KEY) || "[]");
}

function saveStyleKits(kits) {
  localStorage.setItem(STYLE_KITS_KEY, JSON.stringify(kits));
}

function loadPagePresets() {
  return JSON.parse(localStorage.getItem(PAGE_PRESETS_KEY) || "[]");
}

function savePagePresets(presets) {
  localStorage.setItem(PAGE_PRESETS_KEY, JSON.stringify(presets));
}

const DEFAULT_STYLE_KIT = {
  name: "Default",
  h1: { font: "system-ui, sans-serif", size: "28px", weight: "700", color: "" },
  h2: { font: "system-ui, sans-serif", size: "22px", weight: "600", color: "" },
  h3: { font: "system-ui, sans-serif", size: "17px", weight: "600", color: "" },
  paragraph: { font: "Georgia, serif", size: "15px", lineHeight: "1.8", color: "" },
  background: "",
  emphasis: { bold: "", italic: "" },
};

const DEFAULT_PAGE_PRESET = {
  name: "Default",
  pageWidth: 680,
  pagePadding: 40,
  pageBackground: "#1e1e1e",
  surroundBackground: "#171717",
  lineSpacing: "1.8",
  scrollBehavior: "normal",
};

function normalizeCssLength(value, fallback) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return /^\d+(\.\d+)?$/.test(raw) ? `${raw}px` : raw;
}

function applyStyleKit(kit) {
  let styleEl = document.getElementById("docStyleKitStyle");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "docStyleKitStyle";
    document.head.appendChild(styleEl);
  }

  const h1Size = normalizeCssLength(kit?.h1?.size, "28px");
  const h2Size = normalizeCssLength(kit?.h2?.size, "22px");
  const h3Size = normalizeCssLength(kit?.h3?.size, "17px");
  const bodySize = normalizeCssLength(kit?.paragraph?.size, "15px");
  const bodyFont = kit?.paragraph?.font || "Georgia, serif";
  const bodyLineHeight = kit?.paragraph?.lineHeight || "1.8";

  styleEl.textContent = `
    #docContent {
      font-family: ${bodyFont};
      font-size: ${bodySize};
      line-height: ${bodyLineHeight};
      ${kit.paragraph.color ? `color: ${kit.paragraph.color};` : ""}
    }
    #docContent h1 {
      font-family: ${kit.h1.font || "system-ui"};
      font-size: ${h1Size};
      font-weight: ${kit.h1.weight || "700"};
      ${kit.h1.color ? `color: ${kit.h1.color};` : ""}
    }
    #docContent h2 {
      font-family: ${kit.h2.font || "system-ui"};
      font-size: ${h2Size};
      font-weight: ${kit.h2.weight || "600"};
      ${kit.h2.color ? `color: ${kit.h2.color};` : ""}
    }
    #docContent h3 {
      font-family: ${kit.h3.font || "system-ui"};
      font-size: ${h3Size};
      font-weight: ${kit.h3.weight || "600"};
      ${kit.h3.color ? `color: ${kit.h3.color};` : ""}
    }
    #docContent p, #docContent li, #docContent div {
      font-family: ${bodyFont};
      font-size: ${bodySize};
      line-height: ${bodyLineHeight};
      ${kit.paragraph.color ? `color: ${kit.paragraph.color};` : ""}
    }
    ${kit.background ? `#docContent { background: ${kit.background}; }` : ""}
    ${kit.emphasis?.bold ? `#docContent strong { color: ${kit.emphasis.bold}; }` : ""}
    ${kit.emphasis?.italic ? `#docContent em { color: ${kit.emphasis.italic}; }` : ""}
  `;
}

function clearStyleKit() {
  const styleEl = document.getElementById("docStyleKitStyle");
  if (styleEl) styleEl.textContent = "";
}

function applyPagePreset(preset) {
  const wrap = document.querySelector(".doc-body-wrap");
  if (wrap) {
    wrap.style.paddingTop = `${preset.pagePadding}px`;
    wrap.style.background = preset.surroundBackground || "#171717";

    if (wrap._slowScrollHandler) {
      wrap.removeEventListener("wheel", wrap._slowScrollHandler);
      wrap._slowScrollHandler = null;
    }

    if (preset.scrollBehavior === "slow") {
      wrap._slowScrollHandler = (e) => {
        e.preventDefault();
        wrap.scrollTop += e.deltaY * 0.3;
      };
      wrap.addEventListener("wheel", wrap._slowScrollHandler, { passive: false });
    }
  }

  document.querySelectorAll(".doc-content").forEach((content) => {
    content.style.lineHeight = preset.lineSpacing || "1.8";
  });

  const settings = docPageId ? getDocSettings(docPageId) : normalizeDocSettings({});
  settings.pageWidth = preset.pageWidth || settings.pageWidth;
  requestAnimationFrame(() => syncDocPages({ preserveSelection: false }));
}

function openStyleKitEditor(existing = null) {
  const kit = existing ? { ...existing } : { ...DEFAULT_STYLE_KIT, name: "New Style" };

  const overlay = document.createElement("div");
  overlay.className = "doc-kit-overlay";
  overlay.id = "docKitOverlay";

  overlay.innerHTML = `
    <div class="doc-kit-modal">
      <div class="doc-kit-header">
        <input class="doc-kit-name-input" id="kitNameInput" value="${kit.name}" placeholder="Style name..." />
        <button class="doc-kit-close" id="docKitClose">✕</button>
      </div>
      <div class="doc-kit-body">
        <div class="doc-kit-section-title">Headings</div>
        ${["h1","h2","h3"].map(h => `
          <div class="doc-kit-row">
            <span class="doc-kit-label">${h.toUpperCase()}</span>
            <select class="doc-kit-select" id="kit_${h}_font">
              <option value="Georgia, serif" ${kit[h].font === "Georgia, serif" ? "selected" : ""}>Georgia</option>
              <option value="system-ui, sans-serif" ${kit[h].font === "system-ui, sans-serif" ? "selected" : ""}>System UI</option>
              <option value="'Times New Roman', serif" ${kit[h].font === "'Times New Roman', serif" ? "selected" : ""}>Times New Roman</option>
              <option value="'Arial', sans-serif" ${kit[h].font === "'Arial', sans-serif" ? "selected" : ""}>Arial</option>
              <option value="'Courier New', monospace" ${kit[h].font === "'Courier New', monospace" ? "selected" : ""}>Courier New</option>
              <option value="'Palatino', serif" ${kit[h].font === "'Palatino', serif" ? "selected" : ""}>Palatino</option>
              <option value="'Garamond', serif" ${kit[h].font === "'Garamond', serif" ? "selected" : ""}>Garamond</option>
            </select>
            <input class="doc-kit-size" id="kit_${h}_size" type="text" value="${kit[h].size}" placeholder="28px" />
            <select class="doc-kit-select" id="kit_${h}_weight">
              <option value="400" ${kit[h].weight === "400" ? "selected" : ""}>Regular</option>
              <option value="500" ${kit[h].weight === "500" ? "selected" : ""}>Medium</option>
              <option value="600" ${kit[h].weight === "600" ? "selected" : ""}>Semibold</option>
              <option value="700" ${kit[h].weight === "700" ? "selected" : ""}>Bold</option>
            </select>
            <input type="color" class="doc-kit-color" id="kit_${h}_color" value="${kit[h].color || "#ffffff"}" />
          </div>
        `).join("")}

        <div class="doc-kit-section-title" style="margin-top:14px;">Paragraph</div>
        <div class="doc-kit-row">
          <span class="doc-kit-label">Body</span>
          <select class="doc-kit-select" id="kit_p_font">
            <option value="Georgia, serif" ${kit.paragraph.font === "Georgia, serif" ? "selected" : ""}>Georgia</option>
            <option value="system-ui, sans-serif" ${kit.paragraph.font === "system-ui, sans-serif" ? "selected" : ""}>System UI</option>
            <option value="'Times New Roman', serif" ${kit.paragraph.font === "'Times New Roman', serif" ? "selected" : ""}>Times New Roman</option>
            <option value="'Arial', sans-serif" ${kit.paragraph.font === "'Arial', sans-serif" ? "selected" : ""}>Arial</option>
            <option value="'Courier New', monospace" ${kit.paragraph.font === "'Courier New', monospace" ? "selected" : ""}>Courier New</option>
            <option value="'Palatino', serif" ${kit.paragraph.font === "'Palatino', serif" ? "selected" : ""}>Palatino</option>
            <option value="'Garamond', serif" ${kit.paragraph.font === "'Garamond', serif" ? "selected" : ""}>Garamond</option>
          </select>
          <input class="doc-kit-size" id="kit_p_size" type="text" value="${kit.paragraph.size}" placeholder="15px" />
          <select class="doc-kit-select" id="kit_p_lineHeight">
            <option value="1.4" ${kit.paragraph.lineHeight === "1.4" ? "selected" : ""}>Tight</option>
            <option value="1.8" ${kit.paragraph.lineHeight === "1.8" ? "selected" : ""}>Normal</option>
            <option value="2.2" ${kit.paragraph.lineHeight === "2.2" ? "selected" : ""}>Relaxed</option>
            <option value="2.8" ${kit.paragraph.lineHeight === "2.8" ? "selected" : ""}>Double</option>
          </select>
          <input type="color" class="doc-kit-color" id="kit_p_color" value="${kit.paragraph.color || "#ebebeb"}" />
        </div>

        <div class="doc-kit-section-title" style="margin-top:14px;">Colors</div>
        <div class="doc-kit-row">
          <span class="doc-kit-label">Bold color</span>
          <input type="color" class="doc-kit-color" id="kit_bold" value="${kit.emphasis?.bold || "#ffffff"}" />
          <span class="doc-kit-label" style="margin-left:12px;">Italic color</span>
          <input type="color" class="doc-kit-color" id="kit_italic" value="${kit.emphasis?.italic || "#cccccc"}" />
        </div>

        <div class="doc-kit-section-title" style="margin-top:14px;">Apply to</div>
        <div class="doc-kit-row">
          <label class="doc-kit-radio"><input type="radio" name="kitScope" value="doc" checked /> Whole document</label>
          <label class="doc-kit-radio"><input type="radio" name="kitScope" value="section" /> This section only</label>
        </div>
      </div>
      <div class="doc-kit-footer">
        <button class="doc-kit-btn preview" id="kitPreviewBtn">Preview</button>
        <button class="doc-kit-btn save" id="kitSaveBtn">Save & Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("docKitClose")?.addEventListener("click", () => {
    overlay.remove();
    clearStyleKit();
    const section = docSections[activeSectionIndex];
    if (section?.styleKit) {
      const kits = loadStyleKits();
      const saved = kits.find(k => k.name === section.styleKit);
      if (saved) applyStyleKit(saved);
    }
  });

  document.getElementById("kitPreviewBtn")?.addEventListener("click", () => {
    applyStyleKit(readKitFromModal());
  });

  document.getElementById("kitSaveBtn")?.addEventListener("click", () => {
    const newKit = readKitFromModal();
    const kits = loadStyleKits();
    const existingIdx = kits.findIndex(k => k.name === newKit.name);
    if (existingIdx >= 0) kits[existingIdx] = newKit;
    else kits.push(newKit);
    saveStyleKits(kits);

    const scope = overlay.querySelector("input[name='kitScope']:checked")?.value || "doc";
    if (scope === "section") {
      docSections[activeSectionIndex].styleKit = newKit.name;
      persistActiveDocData();
    } else {
      // apply to all sections
      docSections.forEach(s => { s.styleKit = newKit.name; });
      persistActiveDocData();
    }

    applyStyleKit(newKit);
    renderStyleKitList();
    overlay.remove();
  });
}

function readKitFromModal() {
  return {
    name: document.getElementById("kitNameInput")?.value.trim() || "Unnamed",
    h1: {
      font: document.getElementById("kit_h1_font")?.value || "system-ui",
      size: document.getElementById("kit_h1_size")?.value || "28px",
      weight: document.getElementById("kit_h1_weight")?.value || "700",
      color: document.getElementById("kit_h1_color")?.value || "",
    },
    h2: {
      font: document.getElementById("kit_h2_font")?.value || "system-ui",
      size: document.getElementById("kit_h2_size")?.value || "22px",
      weight: document.getElementById("kit_h2_weight")?.value || "600",
      color: document.getElementById("kit_h2_color")?.value || "",
    },
    h3: {
      font: document.getElementById("kit_h3_font")?.value || "system-ui",
      size: document.getElementById("kit_h3_size")?.value || "17px",
      weight: document.getElementById("kit_h3_weight")?.value || "600",
      color: document.getElementById("kit_h3_color")?.value || "",
    },
    paragraph: {
      font: document.getElementById("kit_p_font")?.value || "Georgia, serif",
      size: document.getElementById("kit_p_size")?.value || "15px",
      lineHeight: document.getElementById("kit_p_lineHeight")?.value || "1.8",
      color: document.getElementById("kit_p_color")?.value || "",
    },
    background: "",
    emphasis: {
      bold: document.getElementById("kit_bold")?.value || "",
      italic: document.getElementById("kit_italic")?.value || "",
    },
  };
}

function openPagePresetEditor(existing = null) {
  const preset = existing ? { ...existing } : { ...DEFAULT_PAGE_PRESET, name: "New Preset" };

  const overlay = document.createElement("div");
  overlay.className = "doc-kit-overlay";
  overlay.id = "docPagePresetOverlay";

  overlay.innerHTML = `
    <div class="doc-kit-modal">
      <div class="doc-kit-header">
        <input class="doc-kit-name-input" id="presetNameInput" value="${preset.name}" placeholder="Preset name..." />
        <button class="doc-kit-close" id="docPresetClose">✕</button>
      </div>
      <div class="doc-kit-body">
        <div class="doc-kit-section-title">Page</div>
        <div class="doc-kit-row">
          <span class="doc-kit-label">Width</span>
          <input class="doc-kit-size" id="preset_width" type="number" value="${preset.pageWidth}" min="300" max="1200" />
          <span class="doc-kit-label" style="margin-left:12px;">Background</span>
          <input type="color" class="doc-kit-color" id="preset_pageBg" value="${preset.pageBackground || "#1e1e1e"}" />
        </div>
        <div class="doc-kit-row" style="margin-top:8px;">
          <span class="doc-kit-label">Padding</span>
          <input class="doc-kit-size" id="preset_padding" type="number" value="${preset.pagePadding}" min="10" max="120" />
          <span class="doc-kit-label" style="margin-left:12px;">Surround</span>
          <input type="color" class="doc-kit-color" id="preset_surroundBg" value="${preset.surroundBackground || "#171717"}" />
        </div>

        <div class="doc-kit-section-title" style="margin-top:14px;">Typography</div>
        <div class="doc-kit-row">
          <span class="doc-kit-label">Line spacing</span>
          <select class="doc-kit-select" id="preset_spacing">
            <option value="1.4" ${preset.lineSpacing === "1.4" ? "selected" : ""}>Tight</option>
            <option value="1.8" ${preset.lineSpacing === "1.8" ? "selected" : ""}>Normal</option>
            <option value="2.2" ${preset.lineSpacing === "2.2" ? "selected" : ""}>Relaxed</option>
            <option value="2.8" ${preset.lineSpacing === "2.8" ? "selected" : ""}>Double</option>
          </select>
        </div>

        <div class="doc-kit-section-title" style="margin-top:14px;">Behavior</div>
        <div class="doc-kit-row">
          <span class="doc-kit-label">Scroll</span>
          <select class="doc-kit-select" id="preset_scroll">
            <option value="normal" ${preset.scrollBehavior === "normal" ? "selected" : ""}>Normal</option>
            <option value="slow" ${preset.scrollBehavior === "slow" ? "selected" : ""}>Slow</option>
          </select>
        </div>
      </div>
      <div class="doc-kit-footer">
        <button class="doc-kit-btn preview" id="presetPreviewBtn">Preview</button>
        <button class="doc-kit-btn save" id="presetSaveBtn">Save & Apply</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("docPresetClose")?.addEventListener("click", () => overlay.remove());

  document.getElementById("presetPreviewBtn")?.addEventListener("click", () => {
    applyPagePreset(readPresetFromModal());
  });

  document.getElementById("presetSaveBtn")?.addEventListener("click", () => {
    const newPreset = readPresetFromModal();
    const presets = loadPagePresets();
    const existingIdx = presets.findIndex(p => p.name === newPreset.name);
    if (existingIdx >= 0) presets[existingIdx] = newPreset;
    else presets.push(newPreset);
    savePagePresets(presets);

    // save to doc settings
    saveDocSettings(docPageId, {
      ...getDocSettings(docPageId),
      pageWidth: newPreset.pageWidth,
      pagePadding: newPreset.pagePadding,
    });

    applyPagePreset(newPreset);
    renderPagePresetList();
    overlay.remove();
  });
}

function readPresetFromModal() {
  return {
    name: document.getElementById("presetNameInput")?.value.trim() || "Unnamed",
    pageWidth: parseInt(document.getElementById("preset_width")?.value || "680"),
    pagePadding: parseInt(document.getElementById("preset_padding")?.value || "40"),
    pageBackground: document.getElementById("preset_pageBg")?.value || "#1e1e1e",
    surroundBackground: document.getElementById("preset_surroundBg")?.value || "#171717",
    lineSpacing: document.getElementById("preset_spacing")?.value || "1.8",
    scrollBehavior: document.getElementById("preset_scroll")?.value || "normal",
  };
}

function renderStyleKitList() {
  const list = document.getElementById("docStyleKitList");
  if (!list) return;
  const kits = loadStyleKits();
  list.innerHTML = "";

  if (!kits.length) {
    list.innerHTML = `<div class="doc-submenu-empty">No styles saved yet.</div>`;
    return;
  }

  kits.forEach(kit => {
    const item = document.createElement("div");
    item.className = "doc-submenu-item";
    const currentKit = docSections[activeSectionIndex]?.styleKit;
    if (currentKit === kit.name) item.classList.add("active");
    item.innerHTML = `<span>${kit.name}</span><button class="doc-submenu-edit" data-name="${kit.name}">✎</button>`;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".doc-submenu-edit")) return;
      applyStyleKit(kit);
      docSections[activeSectionIndex].styleKit = kit.name;
      persistActiveDocData();
      closeAllSubmenus();
    });
    item.querySelector(".doc-submenu-edit").addEventListener("click", () => {
      openStyleKitEditor(kit);
      closeAllSubmenus();
    });
    list.appendChild(item);
  });
}

function renderPagePresetList() {
  const list = document.getElementById("docPagePresetList");
  if (!list) return;
  const presets = loadPagePresets();
  list.innerHTML = "";

  if (!presets.length) {
    list.innerHTML = `<div class="doc-submenu-empty">No presets saved yet.</div>`;
    return;
  }

  presets.forEach(preset => {
    const item = document.createElement("div");
    item.className = "doc-submenu-item";
    item.innerHTML = `<span>${preset.name}</span><button class="doc-submenu-edit" data-name="${preset.name}">✎</button>`;
    item.addEventListener("click", (e) => {
      if (e.target.closest(".doc-submenu-edit")) return;
      applyPagePreset(preset);
      closeAllSubmenus();
    });
    item.querySelector(".doc-submenu-edit").addEventListener("click", () => {
      openPagePresetEditor(preset);
      closeAllSubmenus();
    });
    list.appendChild(item);
  });
}

function closeAllSubmenus() {
  document.getElementById("docStyleKitSubmenu")?.classList.remove("open");
  document.getElementById("docPagePresetSubmenu")?.classList.remove("open");
  document.getElementById("docFormatMenu")?.classList.remove("open");
}

// wire up submenu triggers
document.getElementById("docStyleKitBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  renderStyleKitList();
  const sub = document.getElementById("docStyleKitSubmenu");
  const other = document.getElementById("docPagePresetSubmenu");
  other?.classList.remove("open");
  sub?.classList.toggle("open");
});

document.getElementById("docPagePresetBtn")?.addEventListener("click", (e) => {
  e.stopPropagation();
  renderPagePresetList();
  const sub = document.getElementById("docPagePresetSubmenu");
  const other = document.getElementById("docStyleKitSubmenu");
  other?.classList.remove("open");
  sub?.classList.toggle("open");
});

document.getElementById("docNewStyleKit")?.addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllSubmenus();
  openStyleKitEditor();
});

document.getElementById("docNewPagePreset")?.addEventListener("click", (e) => {
  e.stopPropagation();
  closeAllSubmenus();
  openPagePresetEditor();
});

// Combined patch: inspector refresh + style kit apply on section load
const _origLoadDocSection = loadDocSection;
loadDocSection = function(index) {
  _origLoadDocSection(index);
  if (inspectorOpen) renderInspector();
  const section = docSections[index];
  if (section?.styleKit) {
    const kits = loadStyleKits();
    const kit = kits.find(k => k.name === section.styleKit);
    if (kit) applyStyleKit(kit);
    else clearStyleKit();
  } else {
    clearStyleKit();
  }
  setTimeout(syncDocToolbarFromSelection, 0);
};
