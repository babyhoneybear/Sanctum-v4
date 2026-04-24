(() => {
  const PAGE_DB_KEY = "sanctum_page_databases";
  const LEGACY_PAGE_DB_KEY = "sanctum_calendar_databases";
  const STATUS_OPTIONS = ["Not started", "In progress", "Done"];
  const STATUS_COLOR_OPTIONS = [
    { value: "gray", label: "Gray" },
    { value: "light-brown", label: "Light Brown" },
    { value: "coffee-brown", label: "Coffee Brown" },
    { value: "orange", label: "Orange" },
    { value: "burgundy", label: "Burgundy" },
    { value: "deep-green", label: "Deep Green" },
    { value: "blue", label: "Blue" },
    { value: "green", label: "Green" },
    { value: "yellow", label: "Yellow" },
    { value: "red", label: "Red" },
    { value: "purple", label: "Purple" },
    { value: "pink", label: "Pink" }
  ];
  const TAG_COLOR_OPTIONS = [
    { value: "none", label: "No color" },
    ...STATUS_COLOR_OPTIONS
  ];
  const ROW_COLOR_VALUES = {
    gray: "186 181 171",
    "light-brown": "167 130 96",
    "coffee-brown": "108 77 53",
    orange: "206 113 36",
    burgundy: "110 34 50",
    "deep-green": "34 95 68",
    blue: "49 125 223",
    green: "61 145 96",
    yellow: "176 132 25",
    red: "170 63 63",
    purple: "115 79 169",
    pink: "181 86 133"
  };
  const PROPERTY_ICON_PRESETS = [
    { value: "Aa", label: "Aa" },
    { value: "#", label: "#" },
    { value: "≣", label: "List" },
    { value: "☑", label: "Checkbox" },
    { value: "↗", label: "Link" },
    { value: "Σ", label: "Summary" },
    { value: "fx", label: "Formula" },
    { value: "📅", label: "Calendar" },
    { value: "◑", label: "Status" },
    { value: "🏷", label: "Tag" },
    { value: "📝", label: "Notes" },
    { value: "★", label: "Star" },
    { value: "●", label: "Dot" }
  ];
  const DATE_FORMAT_OPTIONS = [
    { value: "full", label: "Full date" },
    { value: "short", label: "Short date" },
    { value: "iso", label: "YYYY-MM-DD" }
  ];
  const SUMMARY_TYPE_OPTIONS = [
    { value: "count", label: "Count linked rows" },
    { value: "sum", label: "Sum number field" },
    { value: "latest-date", label: "Latest date" }
  ];
  const FORMULA_SIMPLE_OPTIONS = [
    { value: "sum", label: "Sum" },
    { value: "subtract", label: "Subtract" },
    { value: "count", label: "Count" },
    { value: "average", label: "Average" },
    { value: "percentage", label: "Percentage" },
    { value: "days-until-date", label: "Days until date" },
    { value: "compare", label: "Compare" },
    { value: "auto-complete", label: "Auto-complete" }
  ];
  const PROPERTY_TYPES = [
    { value: "text", label: "Text" },
    { value: "number", label: "Number" },
    { value: "select", label: "Select" },
    { value: "checkbox", label: "Checkbox" },
    { value: "relation", label: "Link" },
    { value: "summary", label: "Summary" },
    { value: "formula", label: "Formula" },
    { value: "date", label: "Date" },
    { value: "status", label: "Status" },
    { value: "tag", label: "Tag" },
    { value: "notes", label: "Notes" }
  ];
  const DATABASE_MENU_ID = "sanctum-database-menu";
  const DATABASE_SUBMENU_ID = "sanctum-database-submenu";
  const ROW_MENU_ID = "sanctum-database-row-menu";
  const PROPERTY_COMPOSER_ID = "sanctum-database-property-composer";
  const PROPERTY_PANEL_ID = "sanctum-database-property-panel";
  const DB_CONTROL_WIDTH = 36;

  let draggingCalendarItem = null;
  let draggingDatabaseProperty = null;
  let pendingDatabaseFocus = null;
  let activeColumnResize = null;

  function escapeHTML(text = "") {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createId(prefix = "db") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toDayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function getMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function normalizeMonthKey(value = "", fallback = new Date()) {
    const [yearText = "", monthText = ""] = String(value || "").split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}`;
    }
    return getMonthKey(fallback);
  }

  function normalizeDayKey(value = "", fallback = "") {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    if (fallback instanceof Date) return toDayKey(fallback);
    if (typeof fallback === "string" && fallback) return normalizeDayKey(fallback, "");
    return "";
  }

  function shiftMonthKey(value = "", delta = 0) {
    const normalized = normalizeMonthKey(value);
    const [yearText, monthText] = normalized.split("-");
    const next = new Date(Number(yearText), Number(monthText) - 1, 1);
    next.setMonth(next.getMonth() + delta);
    return getMonthKey(next);
  }

  function formatMonthLabel(value = "") {
    const normalized = normalizeMonthKey(value);
    const [yearText, monthText] = normalized.split("-");
    return new Date(Number(yearText), Number(monthText) - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  function normalizeDateFormat(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return DATE_FORMAT_OPTIONS.some((entry) => entry.value === safe) ? safe : "full";
  }

  function normalizeTimeValue(value = "") {
    const match = String(value || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return "";
    return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
  }

  function formatTimeValue(value = "") {
    const normalized = normalizeTimeValue(value);
    if (!normalized) return "";
    const [hoursText, minutesText] = normalized.split(":");
    const date = new Date(2000, 0, 1, Number(hoursText), Number(minutesText));
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function parseDateCellValue(value = "") {
    const defaults = {
      start: "",
      end: "",
      startTime: "",
      endTime: "",
      dateFormat: "full",
      includeTime: false,
      remind: "none"
    };

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return {
        start: normalizeDayKey(value.start || value.date || "", ""),
        end: normalizeDayKey(value.end || value.endDate || "", ""),
        startTime: normalizeTimeValue(value.startTime || value.time || ""),
        endTime: normalizeTimeValue(value.endTime || ""),
        dateFormat: normalizeDateFormat(value.dateFormat || value.format || "full"),
        includeTime: !!value.includeTime,
        remind: String(value.remind || "none").trim() || "none"
      };
    }

    const safeValue = String(value || "").trim();
    if (!safeValue) return defaults;

    if (/^\{/.test(safeValue)) {
      try {
        return parseDateCellValue(JSON.parse(safeValue));
      } catch (error) {
        return defaults;
      }
    }

    const rangeMatch = safeValue.match(/^(\d{4}-\d{2}-\d{2})\s*\.\.\s*(\d{4}-\d{2}-\d{2})$/);
    if (rangeMatch) {
      return {
        ...defaults,
        start: normalizeDayKey(rangeMatch[1], ""),
        end: normalizeDayKey(rangeMatch[2], "")
      };
    }

    return {
      ...defaults,
      start: normalizeDayKey(safeValue, "")
    };
  }

  function serializeDateCellValue(value = "") {
    const parsed = parseDateCellValue(value);
    if (!parsed.start) return "";
    if (!parsed.end && parsed.dateFormat === "full" && !parsed.includeTime && parsed.remind === "none") {
      return parsed.start;
    }
    const payload = { start: parsed.start };
    if (parsed.end) payload.end = parsed.end;
    if (parsed.includeTime && parsed.startTime) payload.startTime = parsed.startTime;
    if (parsed.includeTime && parsed.endTime) payload.endTime = parsed.endTime;
    if (parsed.dateFormat !== "full") payload.dateFormat = parsed.dateFormat;
    if (parsed.includeTime) payload.includeTime = true;
    if (parsed.remind !== "none") payload.remind = parsed.remind;
    return JSON.stringify(payload);
  }

  function getDateStartValue(value = "") {
    return parseDateCellValue(value).start;
  }

  function getDateSortValue(value = "") {
    const parsed = parseDateCellValue(value);
    return `${parsed.start || ""}|${parsed.startTime || ""}|${parsed.end || ""}|${parsed.endTime || ""}`;
  }

  function formatDayKey(dayKey = "", dateFormat = "full") {
    const normalized = normalizeDayKey(dayKey, "");
    if (!normalized) return "";
    const [yearText, monthText, dayText] = normalized.split("-");
    const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
    if (Number.isNaN(parsed.getTime())) return normalized;
    if (dateFormat === "iso") return normalized;
    if (dateFormat === "short") {
      return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateValueLabel(value = "") {
    const parsed = parseDateCellValue(value);
    if (!parsed.start) return "";
    const startLabel = formatDayKey(parsed.start, parsed.dateFormat);
    const startTimeLabel = parsed.includeTime ? formatTimeValue(parsed.startTime) : "";
    const startFull = startTimeLabel ? `${startLabel} ${startTimeLabel}` : startLabel;
    if (!parsed.end) return startFull;
    const endLabel = formatDayKey(parsed.end, parsed.dateFormat);
    const endTimeLabel = parsed.includeTime ? formatTimeValue(parsed.endTime) : "";
    return `${startFull} → ${endTimeLabel ? `${endLabel} ${endTimeLabel}` : endLabel}`;
  }

  function safeParseArray(rawValue = "[]") {
    if (Array.isArray(rawValue)) return rawValue;
    try {
      const parsed = JSON.parse(String(rawValue || "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function safeParseObject(rawValue = "{}") {
    if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) return rawValue;
    try {
      const parsed = JSON.parse(String(rawValue || "{}"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function normalizeEmbedView(value = "", fallback = "table") {
    const safe = String(value || "").trim().toLowerCase();
    if (safe === "board") return "board";
    if (safe === "table") return "table";
    return fallback === "board" ? "board" : "table";
  }

  function getEmbedSourceTarget(record = {}) {
    if (!record) return null;
    const sourceKind = String(record?.dataset?.dbSourceKind || record?.dbSourceKind || "").trim().toLowerCase();
    const pageId = String(record?.dataset?.dbSourcePageId || record?.dbSourcePageId || "").trim();
    const blockId = String(record?.dataset?.dbSourceBlockId || record?.dbSourceBlockId || "").trim();

    if (sourceKind === "page" && pageId) {
      return { kind: "page", pageId, blockId: "" };
    }

    if (sourceKind === "block" && pageId && blockId) {
      return { kind: "block", pageId, blockId };
    }

    return null;
  }

  function setEmbedSourceTarget(hostEl, source) {
    if (!hostEl?.dataset) return;
    const normalized = source?.kind === "block"
      ? { kind: "block", pageId: String(source.pageId || "").trim(), blockId: String(source.blockId || "").trim() }
      : { kind: "page", pageId: String(source?.pageId || "").trim(), blockId: "" };

    if (!normalized.pageId || (normalized.kind === "block" && !normalized.blockId)) {
      delete hostEl.dataset.dbSourceKind;
      delete hostEl.dataset.dbSourcePageId;
      delete hostEl.dataset.dbSourceBlockId;
      return;
    }

    hostEl.dataset.dbSourceKind = normalized.kind;
    hostEl.dataset.dbSourcePageId = normalized.pageId;
    if (normalized.kind === "block") {
      hostEl.dataset.dbSourceBlockId = normalized.blockId;
    } else {
      delete hostEl.dataset.dbSourceBlockId;
    }
  }

  function isSourceBoundDatabaseRecord(record = {}) {
    return !!getEmbedSourceTarget(record);
  }

  function getInlineDatabaseSourceLabel(source) {
    const resolved = getDatabaseSourceByTarget(source);
    return resolved?.title || resolved?.label || "Choose database";
  }

  function getInlineDatabaseViewData(database) {
    if (database.view === "board") return buildBoardViewHTML(database, { readOnly: true });
    return buildTableViewHTML(database, { readOnly: true });
  }

  function isInlineDatabaseCollapsed(surfaceEl) {
    return surfaceEl?.dataset?.calendarCollapsed === "1";
  }

  function syncInlineDatabaseBlockTone(surfaceEl) {
    if (!surfaceEl?.style) return;
    const tone = String(surfaceEl.style.backgroundColor || "").trim();
    if (tone && tone !== "transparent" && tone !== "rgba(0, 0, 0, 0)") {
      surfaceEl.style.setProperty("--inline-db-accent", tone);
      surfaceEl.classList.add("has-inline-db-accent");
    } else {
      surfaceEl.style.removeProperty("--inline-db-accent");
      surfaceEl.classList.remove("has-inline-db-accent");
    }
  }

  function syncInlineDatabaseBlockSize(contextOrSurfaceEl) {
    const surfaceEl = contextOrSurfaceEl?.nodeType === 1
      ? contextOrSurfaceEl
      : getInlineDatabaseHost(contextOrSurfaceEl);
    if (!surfaceEl || surfaceEl.dataset.calendarScope === "page") return;

    const shellEl = surfaceEl.querySelector(".page-database-block-shell");
    if (!shellEl) return;

    window.requestAnimationFrame(() => {
      if (!surfaceEl.isConnected) return;
      const nextHeight = Math.max(26, Math.ceil(shellEl.scrollHeight || shellEl.getBoundingClientRect().height || 0));
      if (nextHeight > 0) {
        surfaceEl.style.height = `${nextHeight}px`;
      }
      if (typeof window.expandGrid === "function") window.expandGrid();
    });
  }

  function getInlineViewLabel(view = "table") {
    return normalizeEmbedView(view, "table") === "board" ? "Board" : "Table";
  }

  function normalizeDatabaseTitle(value = "") {
    return String(value || "").trim() || "Database";
  }

  function normalizeViewMode(value = "", fallback = "table") {
    const safe = String(value || "").trim().toLowerCase();
    if (safe === "calendar" || safe === "table" || safe === "board") return safe;
    if (fallback === "calendar" || fallback === "board") return fallback;
    return "table";
  }

  function normalizePropertyType(value = "", fallback = "text") {
    const safe = String(value || "").trim().toLowerCase();
    const aliased = safe === "link" ? "relation" : safe;
    const allowed = new Set(["title", ...PROPERTY_TYPES.map((item) => item.value)]);
    return allowed.has(aliased) ? aliased : fallback;
  }

  function createNameProperty() {
    return { id: "name", name: "Name", type: "title" };
  }

  function normalizeRowColor(value = "") {
    const safe = String(value || "").trim();
    if (!safe) return "";
    const named = safe.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ROW_COLOR_VALUES, named)) return named;
    if (/^#([0-9a-f]{3,8})$/i.test(safe)) return safe.toLowerCase();
    if (/^(?:rgb|hsl)a?\(/i.test(safe)) return safe;
    return "";
  }

  function getRowToneColor(value = "") {
    const normalized = normalizeRowColor(value);
    if (!normalized) return "";
    return Object.prototype.hasOwnProperty.call(ROW_COLOR_VALUES, normalized)
      ? `rgb(${ROW_COLOR_VALUES[normalized]})`
      : normalized;
  }

  function normalizeRowCellColors(value = {}, properties = [createNameProperty()]) {
    const source = value && typeof value === "object" ? value : {};
    const validPropertyIds = new Set((properties || []).map((property) => String(property?.id || "").trim()).filter(Boolean));
    const next = {};

    Object.entries(source).forEach(([propertyId, color]) => {
      const safePropertyId = String(propertyId || "").trim();
      const normalizedColor = normalizeRowColor(color);
      if (!safePropertyId || !normalizedColor || !validPropertyIds.has(safePropertyId)) return;
      next[safePropertyId] = normalizedColor;
    });

    return next;
  }

  function normalizePropertyHeaderColor(value = "") {
    return normalizeRowColor(value);
  }
 
  function createDefaultStatusGroups() {
    return [
      {
        id: "todo",
        label: "To-do",
        options: [
          { id: createId("status"), name: "Not started", color: "gray", isDefault: true },
          { id: createId("status"), name: "In the works", color: "gray", isDefault: false }
        ]
      },
      {
        id: "in-progress",
        label: "In progress",
        options: [
          { id: createId("status"), name: "In progress", color: "blue", isDefault: false }
        ]
      },
      {
        id: "complete",
        label: "Complete",
        options: [
          { id: createId("status"), name: "Done", color: "green", isDefault: false }
        ]
      }
    ];
  }

  function normalizeStatusOption(raw = {}, fallbackName = "Option") {
    const safeColor = new Set(["gray", "light-brown", "coffee-brown", "orange", "burgundy", "deep-green", "blue", "green", "yellow", "red", "purple", "pink"]);
    return {
      id: typeof raw?.id === "string" && raw.id ? raw.id : createId("status"),
      name: String(raw?.name || fallbackName || "Option").trim() || "Option",
      color: safeColor.has(String(raw?.color || "").trim().toLowerCase()) ? String(raw.color).trim().toLowerCase() : "gray",
      isDefault: !!raw?.isDefault
    };
  }

  function normalizeStatusGroups(rawGroups = []) {
    const sourceGroups = Array.isArray(rawGroups) && rawGroups.length ? rawGroups : createDefaultStatusGroups();
    const usedNames = new Set();
    const groups = sourceGroups.map((group, groupIndex) => {
      const options = safeParseArray(group?.options || []).map((option, optionIndex) => {
        const normalized = normalizeStatusOption(option, `Option ${optionIndex + 1}`);
        let safeName = normalized.name;
        while (usedNames.has(safeName.toLowerCase())) {
          safeName = `${normalized.name} ${optionIndex + 1}`;
        }
        usedNames.add(safeName.toLowerCase());
        return { ...normalized, name: safeName };
      });

      return {
        id: typeof group?.id === "string" && group.id ? group.id : createId("status-group"),
        label: String(group?.label || ["To-do", "In progress", "Complete"][groupIndex] || `Group ${groupIndex + 1}`).trim() || `Group ${groupIndex + 1}`,
        options
      };
    }).filter((group) => group.options.length);

    if (!groups.some((group) => group.options.some((option) => option.isDefault)) && groups[0]?.options[0]) {
      groups[0].options[0].isDefault = true;
    }

    return groups;
  }

  function cloneStatusGroups(groups = []) {
    return normalizeStatusGroups(JSON.parse(JSON.stringify(groups || [])));
  }

  function normalizeTagOption(raw = {}, fallbackName = "Tag") {
    const safeColor = new Set(TAG_COLOR_OPTIONS.map((entry) => entry.value));
    return {
      id: typeof raw?.id === "string" && raw.id ? raw.id : createId("tag"),
      name: String(raw?.name || fallbackName || "Tag").trim() || "Tag",
      color: safeColor.has(String(raw?.color || "").trim().toLowerCase()) ? String(raw.color).trim().toLowerCase() : "none"
    };
  }

  function normalizeTagOptions(rawOptions = []) {
    const usedNames = new Set();
    return safeParseArray(rawOptions)
      .map((option, optionIndex) => {
        const normalized = normalizeTagOption(option, `Tag ${optionIndex + 1}`);
        let safeName = normalized.name;
        while (usedNames.has(safeName.toLowerCase())) {
          safeName = `${normalized.name} ${optionIndex + 1}`;
        }
        usedNames.add(safeName.toLowerCase());
        return { ...normalized, name: safeName };
      });
  }

  function cloneTagOptions(options = []) {
    return normalizeTagOptions(JSON.parse(JSON.stringify(options || [])));
  }

  function normalizeSelectOption(raw = {}, fallbackName = "Option") {
    const safeColor = new Set(TAG_COLOR_OPTIONS.map((entry) => entry.value));
    return {
      id: typeof raw?.id === "string" && raw.id ? raw.id : createId("select"),
      name: String(raw?.name || fallbackName || "Option").trim() || "Option",
      color: safeColor.has(String(raw?.color || "").trim().toLowerCase()) ? String(raw.color).trim().toLowerCase() : "none"
    };
  }

  function normalizeSelectOptions(rawOptions = []) {
    const usedNames = new Set();
    return safeParseArray(rawOptions)
      .map((option, optionIndex) => {
        const normalized = normalizeSelectOption(option, `Option ${optionIndex + 1}`);
        let safeName = normalized.name;
        while (usedNames.has(safeName.toLowerCase())) {
          safeName = `${normalized.name} ${optionIndex + 1}`;
        }
        usedNames.add(safeName.toLowerCase());
        return { ...normalized, name: safeName };
      });
  }

  function cloneSelectOptions(options = []) {
    return normalizeSelectOptions(JSON.parse(JSON.stringify(options || [])));
  }

  function normalizeRelationTarget(raw = {}) {
    const kind = raw?.kind === "block" ? "block" : "page";
    return {
      kind,
      pageId: typeof raw?.pageId === "string" ? raw.pageId : "",
      blockId: kind === "block" && typeof raw?.blockId === "string" ? raw.blockId : "",
      label: String(raw?.label || "").trim()
    };
  }

  function normalizeSummaryMode(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return SUMMARY_TYPE_OPTIONS.some((entry) => entry.value === safe) ? safe : "count";
  }

  function normalizeSummaryConfig(raw = {}) {
    return {
      relationPropertyId: typeof raw?.relationPropertyId === "string" ? raw.relationPropertyId : "",
      mode: normalizeSummaryMode(raw?.mode || "count"),
      targetPropertyId: typeof raw?.targetPropertyId === "string" ? raw.targetPropertyId : ""
    };
  }

  function normalizeFormulaSimpleType(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return FORMULA_SIMPLE_OPTIONS.some((entry) => entry.value === safe) ? safe : "sum";
  }

  function normalizeFormulaMode(value = "") {
    return String(value || "").trim().toLowerCase() === "advanced" ? "advanced" : "simple";
  }

  function normalizeFormulaConfig(raw = {}) {
    return {
      mode: normalizeFormulaMode(raw?.mode || "simple"),
      simpleType: normalizeFormulaSimpleType(raw?.simpleType || "sum"),
      relationPropertyId: typeof raw?.relationPropertyId === "string" ? raw.relationPropertyId : "",
      targetPropertyId: typeof raw?.targetPropertyId === "string" ? raw.targetPropertyId : "",
      leftPropertyId: typeof raw?.leftPropertyId === "string" ? raw.leftPropertyId : "",
      rightPropertyId: typeof raw?.rightPropertyId === "string" ? raw.rightPropertyId : "",
      checkboxPropertyId: typeof raw?.checkboxPropertyId === "string" ? raw.checkboxPropertyId : "",
      datePropertyId: typeof raw?.datePropertyId === "string" ? raw.datePropertyId : "",
      expression: String(raw?.expression || "").trim()
    };
  }

  function parseRelationValues(value = "") {
    if (Array.isArray(value)) {
      const seen = new Set();
      return value
        .map((entry) => typeof entry === "string" ? entry : String(entry?.rowId || entry?.id || ""))
        .map((entry) => String(entry || "").trim())
        .filter((entry) => entry && !seen.has(entry) && seen.add(entry));
    }

    const safeValue = String(value || "").trim();
    if (!safeValue) return [];

    if (/^\[/.test(safeValue)) {
      try {
        return parseRelationValues(JSON.parse(safeValue));
      } catch (error) {
        return [];
      }
    }

    return parseRelationValues(safeValue.split(","));
  }

  function serializeRelationValue(value = "") {
    const rowIds = parseRelationValues(value);
    return rowIds.length ? JSON.stringify(rowIds) : "";
  }

  function hasRelationValue(value = "", rowId = "") {
    const safeRowId = String(rowId || "").trim();
    if (!safeRowId) return false;
    return parseRelationValues(value).includes(safeRowId);
  }

  function toggleRelationValue(value = "", rowId = "") {
    const safeRowId = String(rowId || "").trim();
    if (!safeRowId) return serializeRelationValue(value);
    if (hasRelationValue(value, safeRowId)) {
      return serializeRelationValue(parseRelationValues(value).filter((entry) => entry !== safeRowId));
    }
    return serializeRelationValue([...parseRelationValues(value), safeRowId]);
  }

  function getPropertySelectOptions(property) {
    if (!property || property.type !== "select") return [];
    return normalizeSelectOptions(property.selectOptions || []);
  }

  function getNextSelectColor(property) {
    const palette = TAG_COLOR_OPTIONS.filter((entry) => entry.value !== "none").map((entry) => entry.value);
    const usedColors = new Set(getPropertySelectOptions(property).map((option) => option.color).filter((color) => color && color !== "none"));
    const unused = palette.find((color) => !usedColors.has(color));
    if (unused) return unused;
    const options = getPropertySelectOptions(property);
    return palette[options.length % palette.length] || "gray";
  }

  function ensureSelectValueInProperty(property, value = "") {
    if (!property || property.type !== "select") return;
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    const options = getPropertySelectOptions(property);
    if (options.some((option) => option.name === safeValue)) return;
    property.selectOptions = cloneSelectOptions([
      ...options,
      { id: createId("select"), name: safeValue, color: getNextSelectColor(property) }
    ]);
  }

  function isCheckboxCheckedValue(value = "") {
    return String(value || "").trim() === "true";
  }

  function getCheckboxValueLabel(value = "") {
    return isCheckboxCheckedValue(value) ? "Checked" : "Unchecked";
  }

  function getSummaryModeLabel(mode = "") {
    return SUMMARY_TYPE_OPTIONS.find((entry) => entry.value === normalizeSummaryMode(mode))?.label || "Count linked rows";
  }

  function getFormulaSimpleTypeLabel(type = "") {
    return FORMULA_SIMPLE_OPTIONS.find((entry) => entry.value === normalizeFormulaSimpleType(type))?.label || "Sum";
  }

  function getPropertyTypeLabel(type = "") {
    if (type === "title") return "Title";
    return PROPERTY_TYPES.find((entry) => entry.value === type)?.label || "Text";
  }

  function getPropertyTagOptions(property) {
    if (!property || property.type !== "tag") return [];
    return normalizeTagOptions(property.tagOptions || []);
  }

  function getNextTagColor(property) {
    const palette = TAG_COLOR_OPTIONS.filter((entry) => entry.value !== "none").map((entry) => entry.value);
    const usedColors = new Set(getPropertyTagOptions(property).map((option) => option.color).filter((color) => color && color !== "none"));
    const unused = palette.find((color) => !usedColors.has(color));
    if (unused) return unused;
    const options = getPropertyTagOptions(property);
    return palette[options.length % palette.length] || "gray";
  }

  function ensureTagValueInProperty(property, value = "") {
    if (!property || property.type !== "tag") return;
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    const options = getPropertyTagOptions(property);
    if (options.some((option) => option.name === safeValue)) return;
    property.tagOptions = cloneTagOptions([
      ...options,
      { id: createId("tag"), name: safeValue, color: getNextTagColor(property) }
    ]);
  }

  function parseTagValues(value = "") {
    const parts = Array.isArray(value)
      ? value
      : String(value || "").split(",");
    const seen = new Set();
    return parts
      .map((entry) => String(entry || "").trim())
      .filter((entry) => entry && !seen.has(entry.toLowerCase()) && seen.add(entry.toLowerCase()));
  }

  function joinTagValues(values = []) {
    return parseTagValues(values).join(", ");
  }

  function hasTagValue(value = "", tagName = "") {
    const safeTag = String(tagName || "").trim().toLowerCase();
    if (!safeTag) return false;
    return parseTagValues(value).some((entry) => entry.toLowerCase() === safeTag);
  }

  function addTagValue(value = "", tagName = "") {
    return joinTagValues([...parseTagValues(value), String(tagName || "").trim()]);
  }

  function toggleTagValue(value = "", tagName = "") {
    const safeTag = String(tagName || "").trim();
    if (!safeTag) return joinTagValues(parseTagValues(value));
    if (hasTagValue(value, safeTag)) {
      return joinTagValues(parseTagValues(value).filter((entry) => entry.toLowerCase() !== safeTag.toLowerCase()));
    }
    return addTagValue(value, safeTag);
  }

  function getPropertyStatusGroups(property) {
    if (!property || property.type !== "status") return [];
    return normalizeStatusGroups(property.statusGroups || []);
  }

  function getStatusOptions(property) {
    return getPropertyStatusGroups(property).flatMap((group) => {
      return group.options.map((option) => ({ ...option, groupId: group.id, groupLabel: group.label }));
    });
  }

  function getDefaultStatusName(property) {
    return getStatusOptions(property).find((option) => option.isDefault)?.name || getStatusOptions(property)[0]?.name || "";
  }

  function ensureStatusValueInProperty(property, value = "") {
    if (!property || property.type !== "status") return;
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    const options = getStatusOptions(property);
    if (options.some((option) => option.name === safeValue)) return;
    const groups = getPropertyStatusGroups(property);
    if (!groups.length) {
      property.statusGroups = createDefaultStatusGroups();
      return ensureStatusValueInProperty(property, safeValue);
    }
    groups[0].options.push({ id: createId("status"), name: safeValue, color: "gray", isDefault: false });
    property.statusGroups = cloneStatusGroups(groups);
  }

  function normalizePropertyName(name = "", type = "text", index = 0) {
    const trimmed = String(name || "").trim();
    if (type === "title") return trimmed || "Name";
    if (trimmed) return trimmed;

    const fallbackLabels = {
      text: `Property ${index + 1}`,
      number: "Number",
      select: "Select",
      checkbox: "Checkbox",
      relation: "Link",
      summary: "Summary",
      formula: "Formula",
      date: "Date",
      status: "Status",
      tag: "Tag",
      notes: "Notes"
    };

    return fallbackLabels[type] || `Property ${index + 1}`;
  }

  function normalizeProperty(raw = {}, index = 0) {
    const type = normalizePropertyType(raw.type || "", index === 0 ? "title" : "text");
    const property = {
      id: typeof raw.id === "string" && raw.id ? raw.id : (type === "title" ? "name" : createId("prop")),
      name: normalizePropertyName(raw.name || "", type, index),
      type,
      icon: typeof raw.icon === "string" ? raw.icon : "",
      showIcon: raw.showIcon !== false,
      hidden: raw.hidden === true,
      headerColor: normalizePropertyHeaderColor(raw.headerColor || "")
    };
    if (type === "status") property.statusGroups = normalizeStatusGroups(raw.statusGroups || []);
    if (type === "tag") property.tagOptions = normalizeTagOptions(raw.tagOptions || []);
    if (type === "select") property.selectOptions = normalizeSelectOptions(raw.selectOptions || []);
    if (type === "relation") property.relationTarget = normalizeRelationTarget(raw.relationTarget || {});
    if (type === "summary") property.summaryConfig = normalizeSummaryConfig(raw.summaryConfig || {});
    if (type === "formula") property.formulaConfig = normalizeFormulaConfig(raw.formulaConfig || {});
    return property;
  }

  function ensureTitleProperty(properties = []) {
    const normalized = Array.isArray(properties)
      ? properties.map((prop, index) => normalizeProperty(prop, index))
      : [];

    const titleIndex = normalized.findIndex((prop) => prop.type === "title" || prop.id === "name");
    const seen = new Set();
    const deduped = normalized.map((prop, index) => {
      const isTitle = index === titleIndex || prop.type === "title" || prop.id === "name";
      let id = isTitle ? "name" : (prop.id || createId("prop"));
      while (seen.has(id)) id = createId("prop");
      seen.add(id);
      return {
        ...prop,
        id,
        type: isTitle ? "title" : prop.type,
        name: normalizePropertyName(prop.name || "", isTitle ? "title" : prop.type, index)
      };
    });

    if (!deduped.some((prop) => prop.type === "title" || prop.id === "name")) {
      deduped.unshift(createNameProperty());
    }

    return deduped.map((prop, index) => {
      if (prop.type === "title") {
        return {
          ...prop,
          id: "name",
          type: "title",
          name: normalizePropertyName(prop.name || "", "title", index)
        };
      }
      return prop;
    });
  }

  function normalizeCellValue(property, value) {
    if (!property) return String(value ?? "").trim();
    if (property.type === "date") return serializeDateCellValue(value || "");
    if (property.type === "number") {
      const safeValue = String(value ?? "").trim().replace(/,/g, "");
      return safeValue && Number.isFinite(Number(safeValue)) ? safeValue : "";
    }
    if (property.type === "relation") {
      return serializeRelationValue(value);
    }
    if (property.type === "summary") {
      return "";
    }
    if (property.type === "formula") {
      return "";
    }
    if (property.type === "checkbox") {
      return value === true || value === "true" || value === 1 || value === "1" || value === "on" ? "true" : "";
    }
    if (property.type === "status") {
      const safeValue = String(value ?? "").trim();
      if (safeValue) ensureStatusValueInProperty(property, safeValue);
      return safeValue;
    }
    if (property.type === "select") {
      const safeValue = String(value ?? "").trim();
      if (safeValue) ensureSelectValueInProperty(property, safeValue);
      return safeValue;
    }
    if (property.type === "tag") {
      const safeValues = parseTagValues(value);
      safeValues.forEach((entry) => ensureTagValueInProperty(property, entry));
      return joinTagValues(safeValues);
    }
    return String(value ?? "").trim();
  }

  function normalizeRow(raw = {}, properties = [createNameProperty()]) {
    const row = {
      id: typeof raw.id === "string" && raw.id ? raw.id : createId("row"),
      icon: typeof raw.icon === "string" ? raw.icon : "",
      color: normalizeRowColor(raw.color || raw.rowColor || ""),
      cellColors: normalizeRowCellColors(raw.cellColors || {}, properties),
      values: {}
    };

    const sourceValues = raw.values && typeof raw.values === "object" ? raw.values : {};

    properties.forEach((property) => {
      const fallbackValue = property.id === "name"
        ? (sourceValues[property.id] ?? raw.title ?? raw.name ?? "")
        : (sourceValues[property.id] ?? raw[property.id] ?? "");

      row.values[property.id] = normalizeCellValue(property, fallbackValue);
    });

    return row;
  }

  function normalizeFilters(rawFilters = []) {
    return safeParseArray(rawFilters)
      .map((entry) => ({
        propertyId: typeof entry?.propertyId === "string" ? entry.propertyId : "",
        mode: typeof entry?.mode === "string" ? entry.mode : "equals",
        value: String(entry?.value ?? "")
      }))
      .filter((entry) => entry.propertyId);
  }

  function normalizeSorts(rawSorts = []) {
    return safeParseArray(rawSorts)
      .map((entry) => ({
        propertyId: typeof entry?.propertyId === "string" ? entry.propertyId : "",
        direction: entry?.direction === "desc" ? "desc" : "asc"
      }))
      .filter((entry) => entry.propertyId);
  }

  function normalizeIdList(rawIds = []) {
    const seen = new Set();
    return safeParseArray(rawIds)
      .map((value) => String(value || "").trim())
      .filter((value) => value && !seen.has(value) && seen.add(value));
  }

  function normalizeCalculations(rawValue = {}) {
    const allowed = new Set(["count-all", "count-filled", "percent-filled"]);
    const parsed = safeParseObject(rawValue);
    return Object.entries(parsed).reduce((next, [propertyId, mode]) => {
      if (typeof propertyId === "string" && allowed.has(String(mode || ""))) {
        next[propertyId] = String(mode);
      }
      return next;
    }, {});
  }

  function normalizeBoardCardPreview(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return safe === "page-cover" ? "page-cover" : "none";
  }

  function normalizeBoardCardSize(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return ["small", "medium", "large"].includes(safe) ? safe : "large";
  }

  function normalizeBoardCardLayout(value = "") {
    const safe = String(value || "").trim().toLowerCase();
    return ["compact", "list", "default"].includes(safe) ? safe : "default";
  }

  function getDefaultPropertyWidth(property) {
    if (!property) return 180;
    if (property.type === "title") return 340;
    if (property.type === "notes") return 280;
    if (property.type === "number") return 130;
    if (property.type === "select") return 150;
    if (property.type === "checkbox") return 110;
    if (property.type === "relation") return 190;
    if (property.type === "summary") return 170;
    if (property.type === "formula") return 170;
    if (property.type === "date") return 160;
    if (property.type === "status") return 160;
    if (property.type === "tag") return 170;
    return 180;
  }

  function normalizeColumnWidths(rawValue = {}, properties = []) {
    const parsed = safeParseObject(rawValue);
    const propertyIds = new Set((properties || []).map((property) => property.id));
    return Object.entries(parsed).reduce((next, [propertyId, width]) => {
      const safeWidth = Math.round(Number(width));
      if (propertyIds.has(propertyId) && Number.isFinite(safeWidth)) {
        next[propertyId] = Math.max(120, Math.min(640, safeWidth));
      }
      return next;
    }, {});
  }

  function buildLegacyProperties(items = []) {
    const properties = [createNameProperty()];
    if (items.some((item) => item.date)) properties.push({ id: "date", name: "Date", type: "date" });
    if (items.some((item) => item.status)) properties.push({ id: "status", name: "Status", type: "status" });
    if (items.some((item) => item.tag)) properties.push({ id: "tag", name: "Tag", type: "tag" });
    if (items.some((item) => item.notes)) properties.push({ id: "notes", name: "Notes", type: "notes" });
    return properties;
  }

  function normalizeDatabase(raw = {}, options = {}) {
    const defaultView = options.defaultView || "table";
    let properties = safeParseArray(raw.properties || raw.dbProperties || "[]");
    let rows = safeParseArray(raw.rows || raw.dbRows || "[]");
    const legacyItems = safeParseArray(raw.items || raw.calendarItems || "[]");

    if (!properties.length) properties = [createNameProperty()];
    properties = ensureTitleProperty(properties);

    if (!rows.length && legacyItems.length) {
      if (!safeParseArray(raw.properties || raw.dbProperties || "[]").length) {
        properties = ensureTitleProperty(buildLegacyProperties(legacyItems));
      }

      rows = legacyItems.map((item) => normalizeRow({
        id: item.id,
        title: item.title || "",
        values: {
          date: item.date || "",
          status: item.status || "",
          tag: item.tag || "",
          notes: item.notes || ""
        }
      }, properties));
    } else {
      rows = rows.map((row) => normalizeRow(row, properties));
    }

    return {
      title: normalizeDatabaseTitle(raw.title || raw.calendarTitle || ""),
      view: normalizeViewMode(raw.view || raw.calendarView || "", defaultView),
      month: normalizeMonthKey(raw.month || raw.calendarMonth || "", new Date()),
      showPageIcon: !!raw.showPageIcon,
      boardCardPreview: normalizeBoardCardPreview(raw.boardCardPreview || "none"),
      boardCardSize: normalizeBoardCardSize(raw.boardCardSize || "large"),
      boardCardLayout: normalizeBoardCardLayout(raw.boardCardLayout || "default"),
      filters: normalizeFilters(raw.filters || []),
      sorts: normalizeSorts(raw.sorts || []),
      groupBy: typeof raw.groupBy === "string" ? raw.groupBy : "",
      frozenPropertyIds: normalizeIdList(raw.frozenPropertyIds || []),
      unwrappedPropertyIds: normalizeIdList(raw.unwrappedPropertyIds || []),
      calculations: normalizeCalculations(raw.calculations || {}),
      columnWidths: normalizeColumnWidths(raw.columnWidths || {}, properties),
      properties,
      rows
    };
  }

  function getCurrentPageId() {
    return typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home";
  }

  function getCurrentPageRecord(pageId = getCurrentPageId()) {
    return (Array.isArray(window.userPages) ? window.userPages : []).find((page) => page.id === pageId) || null;
  }

  function isCalendarDatabasePage(pageId = getCurrentPageId()) {
    const page = getCurrentPageRecord(pageId);
    return !!(page && page.layout === "sheet");
  }

  function readPageDatabases() {
    if (typeof window.readStorageJSON !== "function") return {};
    const primary = window.readStorageJSON(PAGE_DB_KEY, null);
    if (primary && typeof primary === "object" && !Array.isArray(primary)) return primary;

    const legacy = window.readStorageJSON(LEGACY_PAGE_DB_KEY, {});
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
      window.writeStorageJSON(PAGE_DB_KEY, legacy);
      return legacy;
    }

    return {};
  }

  function writePageDatabases(allDatabases) {
    if (typeof window.writeStorageJSON !== "function") return false;
    const safeValue = allDatabases || {};
    window.writeStorageJSON(PAGE_DB_KEY, safeValue);
    window.writeStorageJSON(LEGACY_PAGE_DB_KEY, safeValue);
    return true;
  }

  function getPageDatabase(pageId = getCurrentPageId()) {
    const page = getCurrentPageRecord(pageId);
    const all = readPageDatabases();
    const normalized = normalizeDatabase({
      ...(all[pageId] || {}),
      title: page?.title || "Database"
    }, { defaultView: "table" });

    all[pageId] = normalized;
    writePageDatabases(all);
    return normalized;
  }

  function savePageDatabase(pageId, database) {
    const page = getCurrentPageRecord(pageId);
    const all = readPageDatabases();
    all[pageId] = normalizeDatabase({
      ...(database || {}),
      title: page?.title || database?.title || "Database"
    }, { defaultView: "table" });
    writePageDatabases(all);
  }

  function serializeLegacyItems(database) {
    const titleProperty = getTitleProperty(database);
    const dateProperty = getDateProperty(database);
    const statusProperty = database.properties.find((property) => property.type === "status") || null;
    const tagProperty = database.properties.find((property) => property.type === "tag") || null;
    const notesProperty = database.properties.find((property) => property.type === "notes") || null;

    return database.rows.map((row) => ({
      id: row.id,
      icon: row.icon || "",
      title: String(row.values?.[titleProperty.id] || "").trim() || "Untitled",
      date: dateProperty ? getDateStartValue(row.values?.[dateProperty.id] || "") : "",
      status: statusProperty ? (row.values?.[statusProperty.id] || "") : "",
      tag: tagProperty ? (row.values?.[tagProperty.id] || "") : "",
      notes: notesProperty ? (row.values?.[notesProperty.id] || "") : ""
    }));
  }

  function getBlockDatabase(block) {
    const source = getEmbedSourceTarget(block);
    if (source && !(source.kind === "block" && source.pageId === getCurrentPageId() && source.blockId === (block?.id || block?.dataset?.frameChildId || ""))) {
      const sourceDatabase = getDatabaseFromSource(source);
      if (sourceDatabase) {
        return normalizeDatabase({
          ...sourceDatabase,
          title: sourceDatabase.title || getInlineDatabaseSourceLabel(source),
          view: normalizeEmbedView(block?.dataset?.calendarView || sourceDatabase.view || "table", "table")
        }, { defaultView: "table" });
      }
    }

    return normalizeDatabase({
      title: block?.dataset?.calendarTitle || "Database view",
      view: normalizeEmbedView(block?.dataset?.calendarView || "table", "table"),
      month: block?.dataset?.calendarMonth || getMonthKey(),
      properties: block?.dataset?.dbProperties || "[]",
      rows: block?.dataset?.dbRows || "[]",
      columnWidths: block?.dataset?.dbColumnWidths || "{}",
      items: block?.dataset?.calendarItems || "[]"
    }, { defaultView: "table" });
  }

  function saveBlockDatabase(block, database) {
    if (!block) return;
    const normalized = normalizeDatabase(database, { defaultView: "table" });
    block.dataset.calendarTitle = normalized.title;
    block.dataset.calendarView = normalizeEmbedView(normalized.view, "table");
    if (!isSourceBoundDatabaseRecord(block)) {
      block.dataset.calendarMonth = normalized.month;
      block.dataset.dbProperties = JSON.stringify(normalized.properties);
      block.dataset.dbRows = JSON.stringify(normalized.rows);
      block.dataset.dbColumnWidths = JSON.stringify(normalized.columnWidths || {});
      block.dataset.calendarItems = JSON.stringify(serializeLegacyItems(normalized));
    }
    if (typeof saveState === "function") saveState();
  }

  function stripHTML(value = "") {
    const div = document.createElement("div");
    div.innerHTML = String(value || "");
    return String(div.textContent || div.innerText || "").trim();
  }

  function getDatabaseSourceKey(target = {}) {
    return target?.kind === "block"
      ? `block:${target.pageId || ""}:${target.blockId || ""}`
      : `page:${target?.pageId || ""}`;
  }

  function getStoredBlockDatabase(blockData = {}) {
    const source = getEmbedSourceTarget(blockData);
    if (source) {
      const sourceDatabase = getDatabaseFromSource(source);
      if (sourceDatabase) {
        return normalizeDatabase({
          ...sourceDatabase,
          title: sourceDatabase.title || getInlineDatabaseSourceLabel(source),
          view: normalizeEmbedView(blockData?.calendarView || sourceDatabase.view || "table", "table")
        }, { defaultView: "table" });
      }
    }

    return normalizeDatabase({
      title: blockData?.calendarTitle || stripHTML(blockData?.titleHTML || "") || "Database view",
      view: normalizeEmbedView(blockData?.calendarView || "table", "table"),
      month: blockData?.calendarMonth || getMonthKey(),
      properties: blockData?.dbProperties || "[]",
      rows: blockData?.dbRows || "[]",
      items: blockData?.calendarItems || "[]"
    }, { defaultView: "table" });
  }

  function getDatabaseTableSources() {
    const sources = [];
    const seen = new Set();
    const pages = Array.isArray(window.userPages) ? window.userPages : [];

    pages.forEach((page) => {
      if (!page || page.layout !== "sheet") return;
      const source = {
        kind: "page",
        pageId: page.id || "",
        blockId: "",
        label: String(page.title || "Database").trim() || "Database",
        hostLabel: "",
        title: String(page.title || "Database").trim() || "Database"
      };
      const key = getDatabaseSourceKey(source);
      if (!source.pageId || seen.has(key)) return;
      seen.add(key);
      sources.push(source);
    });

    const allBlocks = typeof window.readAllPageBlocks === "function" ? window.readAllPageBlocks() : {};
    Object.entries(allBlocks || {}).forEach(([hostPageId, blocks]) => {
      const hostTitle = getCurrentPageRecord(hostPageId)?.title || "Page";
      safeParseArray(blocks).forEach((blockData) => {
        if (!blockData || blockData.type !== "calendar") return;
        if (isSourceBoundDatabaseRecord(blockData)) return;
        const title = String(blockData.calendarTitle || stripHTML(blockData.titleHTML || "") || "Database view").trim() || "Database view";
        const source = {
          kind: "block",
          pageId: hostPageId,
          blockId: typeof blockData.id === "string" ? blockData.id : "",
          label: `${hostTitle} / ${title}`,
          hostLabel: hostTitle,
          title
        };
        const key = getDatabaseSourceKey(source);
        if (!source.blockId || seen.has(key)) return;
        seen.add(key);
        sources.push(source);
      });
    });

    return sources.sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true }));
  }

  function getDatabasePageSources() {
    return getDatabaseTableSources().filter((source) => source.kind === "page");
  }

  function getDatabaseSourceByTarget(target = {}) {
    const normalized = normalizeRelationTarget(target);
    const key = getDatabaseSourceKey(normalized);
    return getDatabaseTableSources().find((source) => getDatabaseSourceKey(source) === key) || null;
  }

  function getDatabaseFromSource(source) {
    if (!source) return null;
    if (source.kind === "page") {
      return getPageDatabase(source.pageId || "");
    }
    const allBlocks = typeof window.readAllPageBlocks === "function" ? window.readAllPageBlocks() : {};
    const blockData = safeParseArray(allBlocks?.[source.pageId] || []).find((entry) => entry?.id === source.blockId) || null;
    const nestedSource = getEmbedSourceTarget(blockData || {});
    if (nestedSource && nestedSource.kind === "block" && nestedSource.pageId === source.pageId && nestedSource.blockId === source.blockId) {
      return normalizeDatabase({
        title: blockData?.calendarTitle || stripHTML(blockData?.titleHTML || "") || "Database view",
        view: normalizeEmbedView(blockData?.calendarView || "table", "table"),
        month: blockData?.calendarMonth || getMonthKey(),
        properties: blockData?.dbProperties || "[]",
        rows: blockData?.dbRows || "[]",
        items: blockData?.calendarItems || "[]"
      }, { defaultView: "table" });
    }
    return blockData ? getStoredBlockDatabase(blockData) : null;
  }

  function saveDatabaseToSource(source, database) {
    if (!source || !database) return false;
    if (source.kind === "page") {
      savePageDatabase(source.pageId || "", database);
      return true;
    }

    if (typeof window.readAllPageBlocks !== "function" || typeof window.writeAllPageBlocks !== "function") {
      return false;
    }

    const allBlocks = window.readAllPageBlocks() || {};
    const blocks = safeParseArray(allBlocks[source.pageId] || []);
    const blockIndex = blocks.findIndex((entry) => entry?.id === source.blockId);
    if (blockIndex === -1) return false;

    const normalized = normalizeDatabase(database, { defaultView: "table" });
    const nextBlock = {
      ...blocks[blockIndex],
      calendarTitle: normalized.title,
      calendarView: normalized.view,
      calendarMonth: normalized.month,
      calendarItems: JSON.stringify(serializeLegacyItems(normalized)),
      dbProperties: JSON.stringify(normalized.properties),
      dbRows: JSON.stringify(normalized.rows),
      dbColumnWidths: JSON.stringify(normalized.columnWidths || {})
    };

    blocks[blockIndex] = nextBlock;
    allBlocks[source.pageId] = blocks;
    window.writeAllPageBlocks(allBlocks);
    return true;
  }

  function getContextDatabaseSource(context) {
    if (!context) return null;
    if (context.kind === "page") {
      return {
        kind: "page",
        pageId: context.pageId || getCurrentPageId(),
        blockId: "",
        label: getPageTitleText(context.pageId || getCurrentPageId(), "Database")
      };
    }

    const blockEl = context.blockEl || document.getElementById(context.blockId);
    const linkedSource = getEmbedSourceTarget(blockEl);
    if (linkedSource?.kind === "page") {
      const linkedRecord = getCurrentPageRecord(linkedSource.pageId);
      return {
        kind: "page",
        pageId: linkedSource.pageId,
        blockId: "",
        label: String(linkedRecord?.title || getInlineDatabaseSourceLabel(linkedSource) || "Database").trim() || "Database"
      };
    }

    const hostPageId = context.pageId || getCurrentPageId();
    const blockDatabase = getBlockDatabase(blockEl);
    return {
      kind: "block",
      pageId: hostPageId,
      blockId: context.blockId || "",
      label: `${getPageTitleText(hostPageId, "Page")} / ${blockDatabase.title || "Database view"}`
    };
  }

  function rerenderDatabaseSourceIfVisible(source) {
    if (!source) return;
    if (source.kind === "page") {
      if (getCurrentPageId() === source.pageId) {
        renderPageCalendarDatabase(source.pageId);
      }
      document.querySelectorAll(`.block[data-type="calendar"][data-db-source-kind="page"][data-db-source-page-id="${source.pageId}"]`).forEach((blockEl) => {
        renderDatabaseSurface(blockEl, getBlockDatabase(blockEl));
      });
    }
  }

  function getBacklinkRelationProperties(database, source) {
    const sourceKey = getDatabaseSourceKey(source);
    return getRelationProperties(database).filter((property) => {
      const targetKey = getDatabaseSourceKey(property.relationTarget || {});
      return targetKey === sourceKey;
    });
  }

  function addRelationRowId(value = "", rowId = "") {
    const safeRowId = String(rowId || "").trim();
    if (!safeRowId) return serializeRelationValue(value);
    if (hasRelationValue(value, safeRowId)) return serializeRelationValue(value);
    return serializeRelationValue([...parseRelationValues(value), safeRowId]);
  }

  function removeRelationRowId(value = "", rowId = "") {
    const safeRowId = String(rowId || "").trim();
    if (!safeRowId) return serializeRelationValue(value);
    return serializeRelationValue(parseRelationValues(value).filter((entry) => entry !== safeRowId));
  }

  function syncRelationBacklinks(source, sourceDatabase, rowId = "", relationProperty, previousValue = "", nextValue = "") {
    if (!source || !sourceDatabase || !relationProperty || normalizePropertyType(relationProperty.type || "", "") !== "relation") return;
    const targetSource = getRelationSource(relationProperty);
    const targetDatabase = getDatabaseFromSource(targetSource);
    if (!targetSource || !targetDatabase) return;

    const backlinkProperties = getBacklinkRelationProperties(targetDatabase, source);
    if (!backlinkProperties.length) return;

    const previousIds = new Set(parseRelationValues(previousValue));
    const nextIds = new Set(parseRelationValues(nextValue));
    const changedTargetIds = new Set([...previousIds, ...nextIds]);
    let changed = false;

    changedTargetIds.forEach((targetRowId) => {
      const targetRow = getRowById(targetDatabase, targetRowId);
      if (!targetRow) return;

      backlinkProperties.forEach((backlinkProperty) => {
        const currentValue = String(targetRow.values?.[backlinkProperty.id] || "");
        const wantsLink = nextIds.has(targetRowId);
        const nextBacklinkValue = wantsLink
          ? addRelationRowId(currentValue, rowId)
          : removeRelationRowId(currentValue, rowId);

        if (nextBacklinkValue !== currentValue) {
          targetRow.values[backlinkProperty.id] = nextBacklinkValue;
          changed = true;
        }
      });
    });

    if (!changed) return;
    saveDatabaseToSource(targetSource, targetDatabase);
    rerenderDatabaseSourceIfVisible(targetSource);
  }

  function syncRowBacklinksOnDelete(source, database, row) {
    if (!source || !database || !row) return;
    getRelationProperties(database).forEach((property) => {
      syncRelationBacklinks(source, database, row.id, property, getRowValue(row, property.id), "");
    });
  }

  function getRelationSource(property) {
    if (!property || property.type !== "relation") return null;
    return getDatabaseSourceByTarget(property.relationTarget || {});
  }

  function getRelationRowEntries(property, value = "") {
    const rowIds = parseRelationValues(value);
    const source = getRelationSource(property);
    const sourceDatabase = getDatabaseFromSource(source);
    if (!source || !sourceDatabase) return [];
    return rowIds.map((rowId) => {
      const row = getRowById(sourceDatabase, rowId);
      if (!row) return null;
      return {
        id: rowId,
        row,
        label: getRowTitle(sourceDatabase, row),
        source,
        database: sourceDatabase
      };
    }).filter(Boolean);
  }

  function getRelationValueLabels(property, value = "") {
    return getRelationRowEntries(property, value).map((entry) => entry.label);
  }

  function getRelationValueLabel(property, value = "") {
    return getRelationValueLabels(property, value).join(", ");
  }

  function getSummaryRelationProperty(database, property) {
    if (!property || property.type !== "summary") return null;
    const configuredRelation = getPropertyById(database, property.summaryConfig?.relationPropertyId || "");
    if (normalizePropertyType(configuredRelation?.type || "", "") === "relation") return configuredRelation;
    return getRelationProperties(database)[0] || null;
  }

  function getSummaryTargetProperty(database, property) {
    const relationProperty = getSummaryRelationProperty(database, property);
    const source = getRelationSource(relationProperty);
    const sourceDatabase = getDatabaseFromSource(source);
    if (!sourceDatabase) return null;
    return getPropertyById(sourceDatabase, property.summaryConfig?.targetPropertyId || "") || null;
  }

  function getSummaryTargetCandidates(database, property) {
    const relationProperty = getSummaryRelationProperty(database, property);
    const source = getRelationSource(relationProperty);
    const sourceDatabase = getDatabaseFromSource(source);
    if (!sourceDatabase) return [];
    const mode = normalizeSummaryMode(property?.summaryConfig?.mode || "count");
    if (mode === "sum") return sourceDatabase.properties.filter((entry) => entry.type === "number");
    if (mode === "latest-date") return sourceDatabase.properties.filter((entry) => entry.type === "date");
    return [];
  }

  function getComputedSummaryRawValue(database, row, property) {
    if (!property || property.type !== "summary") return "";
    const relationProperty = getSummaryRelationProperty(database, property);
    if (!relationProperty) return "";

    const relationValue = getRowValue(row, relationProperty.id);
    const linkedRowIds = parseRelationValues(relationValue);
    const mode = normalizeSummaryMode(property.summaryConfig?.mode || "count");
    if (mode === "count") return String(linkedRowIds.length);

    const relatedEntries = getRelationRowEntries(relationProperty, relationValue);

    const sourceDatabase = relatedEntries[0]?.database || getDatabaseFromSource(getRelationSource(relationProperty));
    const targetProperty = sourceDatabase ? getPropertyById(sourceDatabase, property.summaryConfig?.targetPropertyId || "") : null;
    if (!sourceDatabase || !targetProperty) return "";

    if (mode === "sum") {
      const total = relatedEntries.reduce((sum, entry) => {
        const numeric = Number(getRowValue(entry.row, targetProperty.id) || 0);
        return Number.isFinite(numeric) ? sum + numeric : sum;
      }, 0);
      return String(total);
    }

    if (mode === "latest-date") {
      return relatedEntries.reduce((latest, entry) => {
        const current = String(getRowValue(entry.row, targetProperty.id) || "").trim();
        if (!current) return latest;
        if (!latest) return current;
        return getDateSortValue(current) > getDateSortValue(latest) ? current : latest;
      }, "");
    }

    return "";
  }

  function getComputedPropertyRawValue(database, row, property, visited = new Set()) {
    if (!property) return "";
    if (property.type === "summary") return getComputedSummaryRawValue(database, row, property);
    if (property.type === "formula") return getComputedFormulaRawValue(database, row, property, visited);
    return String(getRowValue(row, property.id) || "");
  }

  function getComparablePropertyValue(database, row, property) {
    if (!property) return "";
    if (property.type === "relation") return getRelationValueLabel(property, getRowValue(row, property.id));
    return getComputedPropertyRawValue(database, row, property);
  }

  function getSummaryDisplayValue(database, row, property) {
    const rawValue = getComputedSummaryRawValue(database, row, property);
    if (!rawValue) return "";
    const mode = normalizeSummaryMode(property?.summaryConfig?.mode || "count");
    if (mode === "latest-date") return formatDateValueLabel(rawValue) || "";
    const numeric = Number(rawValue);
    if (Number.isFinite(numeric)) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(numeric);
    }
    return rawValue;
  }

  function getFormulaNumberCandidates(database, propertyId = "") {
    return safeParseArray(database?.properties || []).filter((property) => {
      return property.id !== propertyId && (property.type === "number" || property.type === "summary" || property.type === "formula");
    });
  }

  function getFormulaDateCandidates(database, propertyId = "") {
    return safeParseArray(database?.properties || []).filter((property) => property.id !== propertyId && property.type === "date");
  }

  function getFormulaRelationCandidates(database, propertyId = "") {
    return safeParseArray(database?.properties || []).filter((property) => property.id !== propertyId && property.type === "relation");
  }

  function getFormulaCheckboxCandidates(database, propertyId = "") {
    return safeParseArray(database?.properties || []).filter((property) => property.id !== propertyId && property.type === "checkbox");
  }

  function getFormulaRelatedFieldCandidates(database, property, type = "number") {
    const relationProperty = getPropertyById(database, property?.formulaConfig?.relationPropertyId || "");
    const source = getRelationSource(relationProperty);
    const sourceDatabase = getDatabaseFromSource(source);
    if (!sourceDatabase) return [];
    return safeParseArray(sourceDatabase.properties).filter((entry) => entry.type === type);
  }

  function resolveFormulaFieldProperty(database, reference = "") {
    const safe = String(reference || "").trim();
    if (!safe) return null;
    const byId = getPropertyById(database, safe);
    if (byId) return byId;
    return safeParseArray(database?.properties || []).find((property) => String(property.name || "").trim().toLowerCase() === safe.toLowerCase()) || null;
  }

  function resolveFormulaValueReference(database, row, reference, visited = new Set()) {
    if (typeof reference === "number") return reference;
    if (typeof reference === "boolean") return reference;
    const safe = String(reference || "").trim();
    if (!safe) return "";
    const property = resolveFormulaFieldProperty(database, safe);
    if (property) return getComputedPropertyRawValue(database, row, property, visited);
    return safe;
  }

  function getFormulaNumericOperand(database, row, reference, visited = new Set()) {
    const resolved = resolveFormulaValueReference(database, row, reference, visited);
    const numeric = Number(String(resolved || "").replace(/%$/, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function getFormulaDateOperand(database, row, reference, visited = new Set()) {
    const resolved = resolveFormulaValueReference(database, row, reference, visited);
    return parseDateCellValue(resolved).start || normalizeDayKey(resolved, "");
  }

  function getFormulaRelationEntries(database, row, relationReference = "") {
    const relationProperty = resolveFormulaFieldProperty(database, relationReference);
    if (!relationProperty || relationProperty.type !== "relation") return [];
    return getRelationRowEntries(relationProperty, getRowValue(row, relationProperty.id));
  }

  function computeFormulaSimpleRawValue(database, row, property, visited = new Set()) {
    const config = normalizeFormulaConfig(property?.formulaConfig || {});

    if (config.simpleType === "sum") {
      const entries = getFormulaRelationEntries(database, row, config.relationPropertyId);
      const total = entries.reduce((sum, entry) => {
        const numeric = getFormulaNumericOperand(entry.database, entry.row, config.targetPropertyId, visited);
        return sum + numeric;
      }, 0);
      return String(total);
    }

    if (config.simpleType === "average") {
      const entries = getFormulaRelationEntries(database, row, config.relationPropertyId);
      if (!entries.length) return "";
      const total = entries.reduce((sum, entry) => {
        const numeric = getFormulaNumericOperand(entry.database, entry.row, config.targetPropertyId, visited);
        return sum + numeric;
      }, 0);
      return String(total / entries.length);
    }

    if (config.simpleType === "count") {
      const entries = getFormulaRelationEntries(database, row, config.relationPropertyId);
      if (!config.checkboxPropertyId) return String(entries.length);
      const count = entries.reduce((sum, entry) => {
        return sum + (isCheckboxCheckedValue(resolveFormulaValueReference(entry.database, entry.row, config.checkboxPropertyId, visited)) ? 1 : 0);
      }, 0);
      return String(count);
    }

    if (config.simpleType === "subtract") {
      return String(getFormulaNumericOperand(database, row, config.leftPropertyId, visited) - getFormulaNumericOperand(database, row, config.rightPropertyId, visited));
    }

    if (config.simpleType === "percentage") {
      const numerator = getFormulaNumericOperand(database, row, config.leftPropertyId, visited);
      const denominator = getFormulaNumericOperand(database, row, config.rightPropertyId, visited);
      if (!denominator) return "";
      return String((numerator / denominator) * 100);
    }

    if (config.simpleType === "days-until-date") {
      const dateKey = getFormulaDateOperand(database, row, config.datePropertyId, visited);
      if (!dateKey) return "";
      const [year, month, day] = dateKey.split("-").map((value) => Number(value));
      const target = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      return String(Math.round((target.getTime() - today.getTime()) / 86400000));
    }

    if (config.simpleType === "compare") {
      return String(getFormulaNumericOperand(database, row, config.leftPropertyId, visited) - getFormulaNumericOperand(database, row, config.rightPropertyId, visited));
    }

    if (config.simpleType === "auto-complete") {
      if (!config.checkboxPropertyId) return "In progress";
      return isCheckboxCheckedValue(resolveFormulaValueReference(database, row, config.checkboxPropertyId, visited)) ? "Complete" : "In progress";
    }

    return "";
  }

  function computeFormulaAdvancedRawValue(database, row, property, visited = new Set()) {
    const config = normalizeFormulaConfig(property?.formulaConfig || {});
    const expression = String(config.expression || "").trim();
    if (!expression) return "";

    const prepared = expression
      .replace(/\[([^\]]+)\]/g, (_match, label) => `__field(${JSON.stringify(String(label || "").trim())})`)
      .replace(/\bif\s*\(/gi, "ifFn(");

    const countFn = (relationRef, checkboxRef = "") => {
      const entries = getFormulaRelationEntries(database, row, relationRef);
      if (!checkboxRef) return entries.length;
      return entries.reduce((sum, entry) => sum + (isCheckboxCheckedValue(resolveFormulaValueReference(entry.database, entry.row, checkboxRef, visited)) ? 1 : 0), 0);
    };

    const sumFn = (relationRef, fieldRef) => {
      return getFormulaRelationEntries(database, row, relationRef).reduce((sum, entry) => {
        return sum + getFormulaNumericOperand(entry.database, entry.row, fieldRef, visited);
      }, 0);
    };

    const averageFn = (relationRef, fieldRef) => {
      const entries = getFormulaRelationEntries(database, row, relationRef);
      if (!entries.length) return 0;
      return sumFn(relationRef, fieldRef) / entries.length;
    };

    const percentFn = (leftRef, rightRef) => {
      const right = getFormulaNumericOperand(database, row, rightRef, visited);
      if (!right) return 0;
      return (getFormulaNumericOperand(database, row, leftRef, visited) / right) * 100;
    };

    const daysUntilFn = (dateRef) => {
      const dateKey = getFormulaDateOperand(database, row, dateRef, visited);
      if (!dateKey) return 0;
      const [year, month, day] = dateKey.split("-").map((value) => Number(value));
      const target = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      return Math.round((target.getTime() - today.getTime()) / 86400000);
    };

    const compareFn = (leftRef, rightRef) => getFormulaNumericOperand(database, row, leftRef, visited) - getFormulaNumericOperand(database, row, rightRef, visited);
    const checkedFn = (fieldRef) => isCheckboxCheckedValue(resolveFormulaValueReference(database, row, fieldRef, visited));
    const allCheckedFn = (relationRef, checkboxRef) => {
      const entries = getFormulaRelationEntries(database, row, relationRef);
      return entries.length > 0 && entries.every((entry) => isCheckboxCheckedValue(resolveFormulaValueReference(entry.database, entry.row, checkboxRef, visited)));
    };

    try {
      const evaluator = new Function(
        "__field",
        "sum",
        "average",
        "count",
        "percent",
        "daysUntil",
        "compare",
        "checked",
        "allChecked",
        "ifFn",
        `"use strict"; return (${prepared});`
      );

      const result = evaluator(
        (fieldRef) => resolveFormulaValueReference(database, row, fieldRef, visited),
        sumFn,
        averageFn,
        countFn,
        percentFn,
        daysUntilFn,
        compareFn,
        checkedFn,
        allCheckedFn,
        (condition, whenTrue, whenFalse) => condition ? whenTrue : whenFalse
      );

      if (result === null || typeof result === "undefined") return "";
      return String(result);
    } catch (_error) {
      return "";
    }
  }

  function getComputedFormulaRawValue(database, row, property, visited = new Set()) {
    if (!property || property.type !== "formula") return "";
    const key = `${row?.id || "row"}:${property.id}`;
    if (visited.has(key)) return "";
    visited.add(key);

    const config = normalizeFormulaConfig(property.formulaConfig || {});
    const value = config.mode === "advanced"
      ? computeFormulaAdvancedRawValue(database, row, property, visited)
      : computeFormulaSimpleRawValue(database, row, property, visited);

    visited.delete(key);
    return value;
  }

  function getFormulaDisplayValue(database, row, property) {
    const rawValue = getComputedFormulaRawValue(database, row, property);
    if (!rawValue) return "";

    const config = normalizeFormulaConfig(property?.formulaConfig || {});
    if (config.mode === "simple") {
      if (config.simpleType === "percentage") {
        const numeric = Number(rawValue);
        return Number.isFinite(numeric)
          ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric)}%`
          : rawValue;
      }

      if (config.simpleType === "days-until-date") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric)) return rawValue;
        if (numeric === 0) return "Today";
        if (numeric < 0) return `${Math.abs(numeric)} day${Math.abs(numeric) === 1 ? "" : "s"} ago`;
        return `${numeric} day${numeric === 1 ? "" : "s"}`;
      }

      if (config.simpleType === "auto-complete") {
        return rawValue;
      }
    }

    const numeric = Number(rawValue);
    if (Number.isFinite(numeric) && String(rawValue).trim() !== "") {
      const maxDigits = config.mode === "simple" && config.simpleType === "average" ? 2 : 6;
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDigits }).format(numeric);
    }

    return rawValue;
  }

  function getCalendarContext(target) {
    const propertyPanel = target?.closest?.(`#${PROPERTY_PANEL_ID}`);
    if (propertyPanel) {
      if (propertyPanel.dataset.kind === "page") {
        return {
          kind: "page",
          pageId: propertyPanel.dataset.pageId || getCurrentPageId(),
          surfaceEl: document.querySelector(`.calendar-db-surface[data-page-id="${propertyPanel.dataset.pageId || getCurrentPageId()}"]`)
        };
      }

      const blockId = propertyPanel.dataset.blockId || "";
      return {
        kind: "block",
        blockId,
        blockEl: document.getElementById(blockId),
        surfaceEl: document.getElementById(blockId)
      };
    }

    const pageSurface = target?.closest?.('.calendar-db-surface[data-calendar-scope="page"]');
    if (pageSurface) {
      return {
        kind: "page",
        pageId: pageSurface.dataset.pageId || getCurrentPageId(),
        surfaceEl: pageSurface
      };
    }

    const block = target?.closest?.('.block[data-type="calendar"]');
    if (block) {
      return {
        kind: "block",
        blockId: block.id || "",
        blockEl: block,
        surfaceEl: block
      };
    }

    return null;
  }

  function sameContext(left, right) {
    if (!left || !right || left.kind !== right.kind) return false;
    return left.kind === "page"
      ? left.pageId === right.pageId
      : left.blockId === right.blockId;
  }

  function getDatabaseForContext(context) {
    if (!context) return normalizeDatabase({});
    return context.kind === "page"
      ? getPageDatabase(context.pageId)
      : getBlockDatabase(context.blockEl || document.getElementById(context.blockId));
  }

  function saveDatabaseForContext(context, database) {
    if (!context) return;
    if (context.kind === "page") {
      savePageDatabase(context.pageId, database);
    } else {
      const blockEl = context.blockEl || document.getElementById(context.blockId);
      const linkedSource = getEmbedSourceTarget(blockEl);
      if (linkedSource?.kind === "page") {
        const linkedDatabase = getPageDatabase(linkedSource.pageId);
        savePageDatabase(linkedSource.pageId, {
          ...database,
          view: linkedDatabase.view,
          month: linkedDatabase.month
        });
        saveBlockDatabase(blockEl, database);
      } else {
        saveBlockDatabase(blockEl, database);
      }
    }
  }

  function getTitleProperty(database) {
    return database.properties.find((property) => property.type === "title") || database.properties[0] || createNameProperty();
  }

  function getDateProperty(database) {
    return database.properties.find((property) => property.type === "date") || null;
  }

  function getStatusProperty(database) {
    return database.properties.find((property) => property.type === "status") || null;
  }

  function getPropertyById(database, propertyId = "") {
    return database.properties.find((property) => property.id === propertyId) || null;
  }

  function getRelationProperties(database) {
    return safeParseArray(database?.properties || []).filter((property) => normalizePropertyType(property?.type || "", "") === "relation");
  }

  function getRowById(database, rowId = "") {
    return database.rows.find((row) => row.id === rowId) || null;
  }

  function getRowValue(row, propertyId = "") {
    return row?.values?.[propertyId] ?? "";
  }

  function getRowTitle(database, row) {
    const property = getTitleProperty(database);
    const title = String(getRowValue(row, property.id) || "").trim();
    return title || "Untitled";
  }

  function formatCellDisplay(property, value = "") {
    const safeValue = String(value || "").trim();
    if (!safeValue) return "—";

    if (property?.type === "summary") {
      const mode = normalizeSummaryMode(property.summaryConfig?.mode || "count");
      if (mode === "latest-date") {
        return formatDateValueLabel(safeValue) || "—";
      }
      const numeric = Number(safeValue);
      if (Number.isFinite(numeric)) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(numeric);
      }
    }

    if (property?.type === "formula") {
      const config = normalizeFormulaConfig(property.formulaConfig || {});
      if (config.mode === "simple" && config.simpleType === "percentage") {
        const numeric = Number(safeValue);
        return Number.isFinite(numeric)
          ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numeric)}%`
          : safeValue;
      }
      if (config.mode === "simple" && config.simpleType === "days-until-date") {
        const numeric = Number(safeValue);
        if (!Number.isFinite(numeric)) return safeValue;
        if (numeric === 0) return "Today";
        if (numeric < 0) return `${Math.abs(numeric)} day${Math.abs(numeric) === 1 ? "" : "s"} ago`;
        return `${numeric} day${numeric === 1 ? "" : "s"}`;
      }
      const numeric = Number(safeValue);
      if (Number.isFinite(numeric) && safeValue !== "") {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: config.mode === "simple" && config.simpleType === "average" ? 2 : 6 }).format(numeric);
      }
      return safeValue;
    }

    if (property?.type === "date") {
      return formatDateValueLabel(safeValue) || "—";
    }

    if (property?.type === "number") {
      const numeric = Number(safeValue);
      if (Number.isFinite(numeric)) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(numeric);
      }
    }

    if (property?.type === "notes" && safeValue.length > 72) {
      return `${safeValue.slice(0, 72).trimEnd()}…`;
    }

    return safeValue;
  }

  function statusClassName(status = "") {
    return `status-${String(status).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  function hasPageIcon(database) {
    return !!database?.showPageIcon;
  }

  function isPropertyFrozen(database, propertyId = "") {
    return Array.isArray(database?.frozenPropertyIds) && database.frozenPropertyIds.includes(propertyId);
  }

  function isPropertyUnwrapped(database, propertyId = "") {
    return Array.isArray(database?.unwrappedPropertyIds) && database.unwrappedPropertyIds.includes(propertyId);
  }

  function getRowIcon(row) {
    return String(row?.icon || "").trim() || "◌";
  }

  function isImageLikeValue(value = "") {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) return false;
    return /^(data:image\/|blob:|https?:\/\/|file:|\/|\.\/|\.\.\/)/i.test(trimmed);
  }

  function buildRowIconHTML(row, className = "page-database-board-card-icon") {
    const iconValue = getRowIcon(row);
    if (typeof window.getIconMarkup === "function") {
      return window.getIconMarkup(iconValue, "◌", className);
    }
    return `<span class="${escapeHTML(className)}">${escapeHTML(iconValue)}</span>`;
  }

  function getBoardCardPreviewMode(database) {
    return normalizeBoardCardPreview(database?.boardCardPreview || "none");
  }

  function getBoardCardSize(database) {
    return normalizeBoardCardSize(database?.boardCardSize || "large");
  }

  function getBoardCardLayout(database) {
    return normalizeBoardCardLayout(database?.boardCardLayout || "default");
  }

  function getBoardCardPreviewLabel(mode = "") {
    return mode === "page-cover" ? "Page cover" : "None";
  }

  function getBoardCardSizeLabel(size = "") {
    const normalized = normalizeBoardCardSize(size);
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function getBoardCardLayoutLabel(layout = "") {
    const normalized = normalizeBoardCardLayout(layout);
    if (normalized === "compact") return "Compact";
    if (normalized === "list") return "List";
    return "Default";
  }

  function saveAndRerenderDatabaseSettings(context, database) {
    saveDatabaseForContext(context, database);
    rerenderCalendarContext(context);
    closeDatabaseMenus();
  }

  function openBoardLayoutSettingsMenu(anchorEl, context, database) {
    return openPropertySubmenu(anchorEl, "Layout", (submenuEl) => {
      appendMenuLabel(submenuEl, `Card preview: ${getBoardCardPreviewLabel(getBoardCardPreviewMode(database))}`);
      appendMenuButton(submenuEl, "None", () => {
        database.boardCardPreview = "none";
        saveAndRerenderDatabaseSettings(context, database);
      }, { active: getBoardCardPreviewMode(database) === "none" });
      appendMenuButton(submenuEl, "Page cover", () => {
        database.boardCardPreview = "page-cover";
        saveAndRerenderDatabaseSettings(context, database);
      }, { active: getBoardCardPreviewMode(database) === "page-cover" });
      appendMenuDivider(submenuEl);
      appendMenuLabel(submenuEl, `Card size: ${getBoardCardSizeLabel(getBoardCardSize(database))}`);
      ["large", "medium", "small"].forEach((size) => {
        appendMenuButton(submenuEl, getBoardCardSizeLabel(size), () => {
          database.boardCardSize = size;
          saveAndRerenderDatabaseSettings(context, database);
        }, { active: getBoardCardSize(database) === size });
      });
      appendMenuDivider(submenuEl);
      appendMenuLabel(submenuEl, `Card layout: ${getBoardCardLayoutLabel(getBoardCardLayout(database))}`);
      [["default", "Default"], ["compact", "Compact"], ["list", "List"]].forEach(([layout, label]) => {
        appendMenuButton(submenuEl, label, () => {
          database.boardCardLayout = layout;
          saveAndRerenderDatabaseSettings(context, database);
        }, { active: getBoardCardLayout(database) === layout });
      });
    });
  }

  function getBoardCardPreviewSource(row) {
    const iconValue = String(row?.icon || "").trim();
    return isImageLikeValue(iconValue) ? iconValue : "";
  }

  function setRowPreviewImage(database, rowId = "", imageSource = "") {
    const row = getRowById(database, rowId);
    if (!row) return false;
    const nextValue = String(imageSource || "").trim();
    row.icon = isImageLikeValue(nextValue) ? nextValue : "";
    return true;
  }

  function applyBoardCardPreviewImage(context, database, rowId = "", imageSource = "") {
    if (!setRowPreviewImage(database, rowId, imageSource)) return;
    saveDatabaseForContext(context, database);
    rerenderCalendarContext(context);
    closeDatabaseMenus();
  }

  function pickBoardCardPreviewFile(context, database, rowId = "") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.gif";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const source = String(event?.target?.result || "").trim();
        if (!source) return;
        applyBoardCardPreviewImage(context, database, rowId, source);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function openBoardCardPreviewMenu(anchorEl, context, database, rowId = "") {
    const row = getRowById(database, rowId);
    if (!row) return;
    const currentSource = getBoardCardPreviewSource(row);
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, {
      align: "right"
    });
    appendMenuLabel(menuEl, "Card cover");
    appendMenuButton(menuEl, currentSource ? "Replace image" : "Upload image", () => {
      closeDatabaseMenus();
      pickBoardCardPreviewFile(context, database, rowId);
    });
    appendMenuButton(menuEl, "Image link...", () => {
      const nextValue = window.prompt?.("Enter an image URL or local image path", currentSource) || "";
      if (nextValue === currentSource) return;
      applyBoardCardPreviewImage(context, database, rowId, nextValue);
    });
    if (currentSource) {
      appendMenuButton(menuEl, "Remove cover", () => {
        applyBoardCardPreviewImage(context, database, rowId, "");
      }, { danger: true });
    }
    return menuEl;
  }

  function getPropertyDefaultIcon(property) {
    if (property?.type === "title") return "Aa";
    if (property?.type === "number") return "#";
    if (property?.type === "select") return "≣";
    if (property?.type === "checkbox") return "☑";
    if (property?.type === "relation") return "↗";
    if (property?.type === "summary") return "Σ";
    if (property?.type === "formula") return "fx";
    if (property?.type === "date") return "📅";
    if (property?.type === "status") return "◑";
    if (property?.type === "tag") return "🏷";
    if (property?.type === "notes") return "📝";
    return "T";
  }

  function getPropertyIconLabel(property) {
    return property?.showIcon === false ? "No icon" : (getPropertyIcon(property) || "No icon");
  }

  function buildPropertyIconHTML(property, className = "page-database-col-icon") {
    const icon = getPropertyIcon(property);
    return icon ? `<span class="${escapeHTML(className)}">${escapeHTML(icon)}</span>` : "";
  }

  function getRowToneAttributes(row) {
    const color = normalizeRowColor(row?.color || "");
    if (!color) return "";
    return ` class="has-row-color" data-row-color="${escapeHTML(color)}" style="--page-db-row-accent:${escapeHTML(getRowToneColor(color))};"`;
  }

  function getPropertyHeaderToneColor(property) {
    return getRowToneColor(property?.headerColor || "");
  }

  function getCellToneColor(row, propertyId = "") {
    return getRowToneColor(row?.cellColors?.[propertyId] || "");
  }

  function setRowColor(database, rowId = "", color = "") {
    const row = getRowById(database, rowId);
    if (!row) return;
    row.color = normalizeRowColor(color);
  }

  function setCellColor(database, rowId = "", propertyId = "", color = "") {
    const row = getRowById(database, rowId);
    if (!row || !propertyId) return;
    const normalizedColor = normalizeRowColor(color);
    const nextColors = { ...(row.cellColors || {}) };

    if (normalizedColor) nextColors[propertyId] = normalizedColor;
    else delete nextColors[propertyId];

    row.cellColors = normalizeRowCellColors(nextColors, database.properties);
  }

  function setPropertyHeaderColor(database, propertyId = "", color = "") {
    const property = getPropertyById(database, propertyId);
    if (!property) return;
    property.headerColor = normalizePropertyHeaderColor(color);
  }

  function isPropertyVisibleInTable(property) {
    return property?.hidden !== true;
  }

  function getVisibleTableProperties(database) {
    return (database?.properties || []).filter((property) => isPropertyVisibleInTable(property));
  }

  function setPropertyVisibility(database, propertyId = "", visible = true) {
    const property = getPropertyById(database, propertyId);
    if (!property) return;
    property.hidden = !visible;
  }

  function setAllPropertyVisibility(database, visible = true) {
    (database?.properties || []).forEach((property) => {
      property.hidden = !visible;
    });
  }

  function setPropertyIcon(database, propertyId = "", icon = "", options = {}) {
    const property = getPropertyById(database, propertyId);
    if (!property) return;
    property.icon = String(icon || "").trim();
    property.showIcon = options.show !== false;
  }

  function getSelectedInlineDatabaseRowId(surfaceEl) {
    return String(surfaceEl?.dataset?.selectedDbRowId || "").trim();
  }

  function getSelectedInlineDatabasePropId(surfaceEl) {
    return String(surfaceEl?.dataset?.selectedDbPropId || "").trim();
  }

  function getSelectedInlineDatabaseHeaderPropId(surfaceEl) {
    return String(surfaceEl?.dataset?.selectedDbHeaderPropId || "").trim();
  }

  function syncInlineDatabaseSelectedRow(surfaceEl) {
    if (!surfaceEl) return;
    const selectedRowId = getSelectedInlineDatabaseRowId(surfaceEl);
    const selectedPropId = getSelectedInlineDatabasePropId(surfaceEl);
    const selectedHeaderPropId = getSelectedInlineDatabaseHeaderPropId(surfaceEl);
    let matchedRow = false;
    let matchedCell = false;
    let matchedHeader = false;

    surfaceEl.querySelectorAll('.page-database-row-shell[data-db-row-shell-id], .page-database-board-card[data-item-id]').forEach((entry) => {
      const entryRowId = String(entry.dataset.dbRowShellId || entry.dataset.itemId || "").trim();
      const isActive = !!selectedRowId && !selectedPropId && entryRowId === selectedRowId;
      entry.classList.toggle('is-row-selected', isActive);
      matchedRow = matchedRow || (!!selectedRowId && entryRowId === selectedRowId);
    });

    surfaceEl.querySelectorAll('.page-database-cell[data-db-row-id][data-db-prop-id]').forEach((cell) => {
      const cellRowId = String(cell.dataset.dbRowId || "").trim();
      const cellPropId = String(cell.dataset.dbPropId || "").trim();
      const isActive = !!selectedRowId && !!selectedPropId && cellRowId === selectedRowId && cellPropId === selectedPropId;
      cell.classList.toggle('is-cell-selected', isActive);
      matchedCell = matchedCell || isActive;
    });

    surfaceEl.querySelectorAll('.page-database-col-head-wrap[data-db-header-prop-id]').forEach((header) => {
      const propId = String(header.dataset.dbHeaderPropId || "").trim();
      const isActive = !selectedRowId && !selectedPropId && !!selectedHeaderPropId && propId === selectedHeaderPropId;
      header.classList.toggle('is-header-selected', isActive);
      matchedHeader = matchedHeader || isActive;
    });

    if (selectedHeaderPropId && !matchedHeader) {
      delete surfaceEl.dataset.selectedDbHeaderPropId;
      if (typeof window.refreshCanvasDockToolState === 'function') window.refreshCanvasDockToolState();
      return;
    }

    if (selectedRowId && selectedPropId && !matchedCell) {
      delete surfaceEl.dataset.selectedDbRowId;
      delete surfaceEl.dataset.selectedDbPropId;
      if (typeof window.refreshCanvasDockToolState === 'function') window.refreshCanvasDockToolState();
      return;
    }

    if (selectedRowId && !selectedPropId && !matchedRow) {
      delete surfaceEl.dataset.selectedDbRowId;
      if (typeof window.refreshCanvasDockToolState === 'function') window.refreshCanvasDockToolState();
    }
  }

  function setSelectedInlineDatabaseRow(surfaceEl, rowId = "", propertyId = "", headerPropId = "") {
    if (!surfaceEl) return;
    const safeRowId = String(rowId || "").trim();
    const safePropertyId = String(propertyId || "").trim();
    const safeHeaderPropId = String(headerPropId || "").trim();
    if (safeRowId) surfaceEl.dataset.selectedDbRowId = safeRowId;
    else delete surfaceEl.dataset.selectedDbRowId;
    if (safeRowId && safePropertyId) surfaceEl.dataset.selectedDbPropId = safePropertyId;
    else delete surfaceEl.dataset.selectedDbPropId;
    if (!safeRowId && safeHeaderPropId) surfaceEl.dataset.selectedDbHeaderPropId = safeHeaderPropId;
    else delete surfaceEl.dataset.selectedDbHeaderPropId;
    syncInlineDatabaseSelectedRow(surfaceEl);
    if (typeof window.refreshCanvasDockToolState === 'function') window.refreshCanvasDockToolState();
  }

  function getSelectedInlineDatabaseRow(blockEl) {
    const safeRowId = getSelectedInlineDatabaseRowId(blockEl);
    if (!blockEl || !safeRowId) return null;
    return getRowById(getBlockDatabase(blockEl), safeRowId) || null;
  }

  function getSelectedInlineDatabaseCell(blockEl) {
    const row = getSelectedInlineDatabaseRow(blockEl);
    const propertyId = getSelectedInlineDatabasePropId(blockEl);
    if (!row || !propertyId) return null;
    return { row, propertyId };
  }

  function getSelectedInlineDatabaseHeaderProperty(blockEl) {
    const propertyId = getSelectedInlineDatabaseHeaderPropId(blockEl);
    if (!blockEl || !propertyId) return null;
    return getPropertyById(getBlockDatabase(blockEl), propertyId) || null;
  }

  function getSelectedInlineDatabaseRowColor(blockEl) {
    const headerProperty = getSelectedInlineDatabaseHeaderProperty(blockEl);
    if (headerProperty) return getPropertyHeaderToneColor(headerProperty);
    const cell = getSelectedInlineDatabaseCell(blockEl);
    if (cell) return getCellToneColor(cell.row, cell.propertyId);
    return getRowToneColor(getSelectedInlineDatabaseRow(blockEl)?.color || "");
  }

  function applySelectedInlineDatabaseRowColor(blockEl, color = "") {
    const rowId = getSelectedInlineDatabaseRowId(blockEl);
    const propertyId = getSelectedInlineDatabasePropId(blockEl);
    const headerPropId = getSelectedInlineDatabaseHeaderPropId(blockEl);
    if (!blockEl || (!rowId && !headerPropId)) return false;

    const context = {
      kind: 'block',
      blockId: blockEl.id || '',
      blockEl,
      surfaceEl: blockEl
    };
    const database = getDatabaseForContext(context);
    if (headerPropId && !rowId) {
      if (!getPropertyById(database, headerPropId)) {
        setSelectedInlineDatabaseRow(blockEl, '', '', '');
        return false;
      }
      setPropertyHeaderColor(database, headerPropId, color);
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      return true;
    }

    const row = getRowById(database, rowId);
    if (!row) {
      setSelectedInlineDatabaseRow(blockEl, '');
      return false;
    }

    if (propertyId) {
      if (!getPropertyById(database, propertyId)) {
        setSelectedInlineDatabaseRow(blockEl, rowId, '');
        return false;
      }
      setCellColor(database, rowId, propertyId, color);
    } else {
      setRowColor(database, rowId, color);
    }
    saveDatabaseForContext(context, database);
    rerenderCalendarContext(context);
    return true;
  }

  function buildFallbackIconMarkup(value = "", className = "") {
    const safeClass = className ? ` class="${className}"` : "";
    return `<span${safeClass}>${escapeHTML(value || "📄")}</span>`;
  }

  function getPageTitleText(pageId = getCurrentPageId(), fallback = "Untitled") {
    return getCurrentPageRecord(pageId)?.title || fallback;
  }

  function getPageIconMarkup(pageId = getCurrentPageId()) {
    const page = getCurrentPageRecord(pageId);
    const iconValue = page?.icon || "";
    if (typeof window.getIconMarkup === "function") {
      return window.getIconMarkup(iconValue, "📄", "page-database-page-icon");
    }
    return buildFallbackIconMarkup(iconValue || "📄", "page-database-page-icon");
  }

  function comparePropertyValues(property, leftValue = "", rightValue = "") {
    if (property?.type === "summary") {
      const mode = normalizeSummaryMode(property.summaryConfig?.mode || "count");
      if (mode === "latest-date") {
        return getDateSortValue(leftValue).localeCompare(getDateSortValue(rightValue));
      }
      const leftNumber = Number(leftValue || 0);
      const rightNumber = Number(rightValue || 0);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
    }
    if (property?.type === "formula") {
      const leftNumber = Number(String(leftValue || "").replace(/%$/, ""));
      const rightNumber = Number(String(rightValue || "").replace(/%$/, ""));
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
    }
    if (property?.type === "date") {
      return getDateSortValue(leftValue).localeCompare(getDateSortValue(rightValue));
    }
    if (property?.type === "number") {
      const leftNumber = Number(leftValue || 0);
      const rightNumber = Number(rightValue || 0);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }
    }
    return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function rowMatchesFilter(database, row, filter) {
    const property = getPropertyById(database, filter.propertyId);
    if (!property) return true;

    const rawValue = String(getComparablePropertyValue(database, row, property) || "").trim();
    const filterValue = String(filter.value || "").trim();

    if (property.type === "relation") {
      if (filter.mode === "empty") return !rawValue;
      if (filter.mode === "contains") return rawValue.toLowerCase().includes(filterValue.toLowerCase());
      return rawValue === filterValue;
    }

    if (property.type === "summary") {
      const mode = normalizeSummaryMode(property.summaryConfig?.mode || "count");
      if (mode === "latest-date") {
        const parsed = parseDateCellValue(rawValue);
        const dateText = [parsed.start, parsed.end, formatCellDisplay(property, rawValue)].join(" ").toLowerCase();
        if (filter.mode === "empty") return !parsed.start;
        if (filter.mode === "contains") return dateText.includes(filterValue.toLowerCase());
        const normalizedFilterDay = normalizeDayKey(filterValue, "");
        return rawValue === filterValue || parsed.start === normalizedFilterDay || parsed.end === normalizedFilterDay;
      }
      if (filter.mode === "empty") return !rawValue;
      if (filter.mode === "contains") return formatCellDisplay(property, rawValue).toLowerCase().includes(filterValue.toLowerCase());
      return rawValue === filterValue || formatCellDisplay(property, rawValue) === filterValue;
    }

    if (property.type === "tag") {
      if (filter.mode === "empty") return !parseTagValues(rawValue).length;

    if (property.type === "formula") {
      if (filter.mode === "empty") return !rawValue;
      if (filter.mode === "contains") return getFormulaDisplayValue(database, row, property).toLowerCase().includes(filterValue.toLowerCase());
      return rawValue === filterValue || getFormulaDisplayValue(database, row, property) === filterValue;
    }
      if (filter.mode === "contains") {
        return parseTagValues(rawValue).some((entry) => entry.toLowerCase().includes(filterValue.toLowerCase()));
      }
      return hasTagValue(rawValue, filterValue);
    }

    if (property.type === "date") {
      const parsed = parseDateCellValue(rawValue);
      const dateText = [parsed.start, parsed.end, formatDateValueLabel(rawValue)].join(" ").toLowerCase();
      if (filter.mode === "empty") return !parsed.start;
      if (filter.mode === "contains") return dateText.includes(filterValue.toLowerCase());
      const normalizedFilterDay = normalizeDayKey(filterValue, "");
      return rawValue === filterValue || parsed.start === normalizedFilterDay || parsed.end === normalizedFilterDay;
    }

    if (property.type === "checkbox") {
      const checkboxLabel = getCheckboxValueLabel(rawValue);
      if (filter.mode === "empty") return !isCheckboxCheckedValue(rawValue);
      if (filter.mode === "contains") return checkboxLabel.toLowerCase().includes(filterValue.toLowerCase());
      return checkboxLabel === filterValue || rawValue === filterValue;
    }

    if (filter.mode === "empty") return !rawValue;
    if (filter.mode === "contains") {
      return rawValue.toLowerCase().includes(filterValue.toLowerCase());
    }
    return rawValue === filterValue;
  }

  function getVisibleRows(database) {
    let rows = Array.isArray(database.rows) ? database.rows.slice() : [];

    if (Array.isArray(database.filters) && database.filters.length) {
      rows = rows.filter((row) => database.filters.every((filter) => rowMatchesFilter(database, row, filter)));
    }

    if (Array.isArray(database.sorts) && database.sorts.length) {
      rows.sort((left, right) => {
        for (const sort of database.sorts) {
          const property = getPropertyById(database, sort.propertyId);
          if (!property) continue;
          const result = comparePropertyValues(
            property,
            getComparablePropertyValue(database, left, property),
            getComparablePropertyValue(database, right, property)
          );
          if (result !== 0) return sort.direction === "desc" ? -result : result;
        }
        return 0;
      });
    }

    return rows;
  }

  function getGroupedRows(database, rows = []) {
    const property = getPropertyById(database, database.groupBy || "");
    if (!property) return [{ key: "", label: "", rows }];

    const groups = new Map();
    rows.forEach((row) => {
      const value = String(getComparablePropertyValue(database, row, property) || "").trim();
      const groupValue = property.type === "checkbox" ? getCheckboxValueLabel(value) : value;
      const key = groupValue || "__empty__";
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: groupValue ? formatCellDisplay(property, groupValue) : `No ${property.name}`,
          rows: []
        });
      }
      groups.get(key).rows.push(row);
    });

    return Array.from(groups.values());
  }

  function getDistinctPropertyValues(database, propertyId = "") {
    const values = new Set();
    const property = getPropertyById(database, propertyId);
    database.rows.forEach((row) => {
      const value = String(getComparablePropertyValue(database, row, property) || "").trim();
      if (property?.type === "checkbox") {
        values.add(getCheckboxValueLabel(value));
        return;
      }
      if (property?.type === "relation") {
        getRelationValueLabels(property, getRowValue(row, propertyId)).forEach((entry) => values.add(entry));
        return;
      }
      if (property?.type === "formula") {
        if (!value) return;
        values.add(formatCellDisplay(property, value));
        return;
      }
      if (!value) return;
      if (property?.type === "date") {
        values.add(serializeDateCellValue(value));
        return;
      }
      if (property?.type === "tag") {
        parseTagValues(value).forEach((entry) => values.add(entry));
        return;
      }
      values.add(value);
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
  }

  function commitCellValue(context, database, rowId = "", propertyId = "", value = "", options = {}) {
    const property = getPropertyById(database, propertyId);
    const row = getRowById(database, rowId);
    const previousValue = property && row ? getRowValue(row, propertyId) : "";
    updateRowValue(database, rowId, propertyId, value);
    saveDatabaseForContext(context, database);
    if (property && normalizePropertyType(property.type || "", "") === "relation") {
      syncRelationBacklinks(getContextDatabaseSource(context), database, rowId, property, previousValue, getRowValue(getRowById(database, rowId), propertyId));
    }
    rerenderCalendarContext(context);
    if (options.closeMenus !== false) closeDatabaseMenus();
  }

  function findPropertyHeaderButton(context, propertyId = "") {
    return context?.surfaceEl?.querySelector?.(`.page-database-col-head[data-prop-id="${propertyId}"]`) || null;
  }

  function buildValuePillHTML(property, value = "") {
    const safeValue = String(value || "").trim();
    if (!safeValue) return `<span class="page-db-cell-trigger-placeholder">${escapeHTML(property?.type === "date" ? "Empty" : property?.name || "Empty")}</span>`;

    if (property?.type === "status") {
      const statusOption = getStatusOptions(property).find((option) => option.name === safeValue);
      return `<span class="page-db-cell-pill ${escapeHTML(statusClassName(statusOption?.color || safeValue))}"><span class="page-db-cell-pill-dot"></span><span>${escapeHTML(safeValue)}</span></span>`;
    }

    if (property?.type === "tag") {
      const tags = parseTagValues(safeValue);
      return `<span class="page-db-cell-tag-list">${tags.map((tag) => {
        const tagOption = getPropertyTagOptions(property).find((option) => option.name === tag);
        const colorClass = tagOption?.color && tagOption.color !== "none" ? ` ${escapeHTML(statusClassName(tagOption.color))}` : " tag-no-color";
        return `<span class="page-db-cell-pill page-db-cell-pill-tag${colorClass}">${escapeHTML(tag)}</span>`;
      }).join("")}</span>`;
    }

    if (property?.type === "select") {
      const selectOption = getPropertySelectOptions(property).find((option) => option.name === safeValue);
      const colorClass = selectOption?.color && selectOption.color !== "none" ? ` ${escapeHTML(statusClassName(selectOption.color))}` : " tag-no-color";
      return `<span class="page-db-cell-pill page-db-cell-pill-select${colorClass}">${escapeHTML(safeValue)}</span>`;
    }

    if (property?.type === "relation") {
      const labels = getRelationValueLabels(property, safeValue);
      if (!labels.length) {
        return `<span class="page-db-cell-trigger-placeholder">${escapeHTML(property?.name || "Link")}</span>`;
      }
      return `<span class="page-db-cell-tag-list">${labels.map((label) => `<span class="page-db-cell-pill page-db-cell-pill-relation">${escapeHTML(label)}</span>`).join("")}</span>`;
    }

    if (property?.type === "date") {
      return `<span class="page-db-cell-date-value">${escapeHTML(formatCellDisplay(property, safeValue))}</span>`;
    }

    return escapeHTML(safeValue);
  }

  function openStatusValueMenu(anchorEl, context, database, row, property) {
    const currentValue = String(getRowValue(row, property.id) || "").trim();
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-value-menu", anchorEl, { align: "left" });
    const groups = getPropertyStatusGroups(property);

    groups.forEach((group, index) => {
      appendMenuLabel(menuEl, group.label);
      group.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `topbar-dropdown-btn page-database-value-option${currentValue === option.name ? " active" : ""}`;
        button.innerHTML = buildValuePillHTML(property, option.name);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          commitCellValue(context, database, row.id, property.id, currentValue === option.name ? "" : option.name);
        });
        menuEl.appendChild(button);
      });
      if (index < groups.length - 1) appendMenuDivider(menuEl);
    });

    appendMenuDivider(menuEl);
    appendMenuButton(menuEl, "Edit property", () => {
      openPropertyPanel(context, database, property.id);
    });
  }

  function openTagColorMenu(anchorEl, context, database, propertyId = "", tagName = "", options = {}) {
    const property = getPropertyById(database, propertyId);
    const option = getPropertyTagOptions(property).find((entry) => entry.name === String(tagName || "").trim());
    if (!property || property.type !== "tag" || !option) return;

    const menuEl = mountDatabaseFloatingEl(DATABASE_SUBMENU_ID, "topbar-dropdown page-database-floating-menu page-database-submenu page-database-color-menu", anchorEl, {
      align: "right",
      offset: 2,
      closeAll: false
    });
    appendMenuLabel(menuEl, "Color");
    TAG_COLOR_OPTIONS.forEach((entry) => {
      const swatchClass = entry.value === "none" ? "tag-none" : statusClassName(entry.value);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `topbar-dropdown-btn page-database-color-option${option.color === entry.value ? " active" : ""}`;
      button.innerHTML = `<span class="page-database-color-option-main"><span class="page-database-color-swatch ${escapeHTML(swatchClass)}"></span><span>${escapeHTML(entry.label)}</span></span>`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setTagOptionColor(database, propertyId, tagName, entry.value);
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        document.getElementById(DATABASE_SUBMENU_ID)?.remove();
        options.onChange?.();
      });
      menuEl.appendChild(button);
    });
  }

  function openTagValueMenu(anchorEl, context, database, row, property) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-value-menu page-database-tag-menu", anchorEl, { align: "left" });
    menuEl.innerHTML = `
      <input class="page-database-value-search" type="text" placeholder="Search for an option..." autocomplete="off" />
      <div class="page-database-value-list"></div>
    `;

    const searchEl = menuEl.querySelector(".page-database-value-search");
    const listEl = menuEl.querySelector(".page-database-value-list");
    const getCurrentValue = () => String(getRowValue(getRowById(database, row.id), property.id) || "").trim();

    const renderOptions = () => {
      const query = String(searchEl?.value || "").trim();
      const normalizedQuery = query.toLowerCase();
      const allOptions = getPropertyTagOptions(property);
      const currentValue = getCurrentValue();
      const matching = allOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
      listEl.innerHTML = "";

      if (query) {
        const createButton = document.createElement("button");
        createButton.type = "button";
        createButton.className = "topbar-dropdown-btn page-database-value-create";
        createButton.textContent = matching.some((option) => option.name.toLowerCase() === normalizedQuery)
          ? `Select ${query}`
          : `Create \"${query}\"`;
        createButton.addEventListener("click", (event) => {
          event.stopPropagation();
          ensureTagValueInProperty(property, query);
          commitCellValue(context, database, row.id, property.id, addTagValue(getCurrentValue(), query));
        });
        listEl.appendChild(createButton);
      }

      if (!matching.length && !query) {
        const empty = document.createElement("div");
        empty.className = "page-database-value-empty";
        empty.textContent = "Select an option or create one";
        listEl.appendChild(empty);
        return;
      }

      matching.forEach((option) => {
        const rowEl = document.createElement("div");
        rowEl.className = "page-database-tag-option-row";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = `topbar-dropdown-btn page-database-value-option${hasTagValue(currentValue, option.name) ? " active" : ""}`;
        selectButton.innerHTML = buildValuePillHTML(property, option.name);
        selectButton.addEventListener("click", (event) => {
          event.stopPropagation();
          commitCellValue(context, database, row.id, property.id, toggleTagValue(getCurrentValue(), option.name));
        });

        const colorButton = document.createElement("button");
        colorButton.type = "button";
        colorButton.className = "page-database-tag-color-btn";
        colorButton.innerHTML = `<span class="page-database-color-swatch ${escapeHTML(option.color === 'none' ? 'tag-none' : statusClassName(option.color))}"></span>`;
        colorButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openTagColorMenu(colorButton, context, database, property.id, option.name, { onChange: renderOptions });
        });

        rowEl.appendChild(selectButton);
        rowEl.appendChild(colorButton);
        listEl.appendChild(rowEl);
      });
    };

    searchEl?.addEventListener("input", renderOptions);
    searchEl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const query = String(searchEl.value || "").trim();
        if (query) {
          ensureTagValueInProperty(property, query);
          commitCellValue(context, database, row.id, property.id, addTagValue(getCurrentValue(), query));
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatabaseMenus();
      }
    });

    renderOptions();
    requestAnimationFrame(() => searchEl?.focus());
  }

  function openSelectColorMenu(anchorEl, context, database, propertyId = "", optionName = "", options = {}) {
    const property = getPropertyById(database, propertyId);
    const option = getPropertySelectOptions(property).find((entry) => entry.name === String(optionName || "").trim());
    if (!property || property.type !== "select" || !option) return;

    const menuEl = mountDatabaseFloatingEl(DATABASE_SUBMENU_ID, "topbar-dropdown page-database-floating-menu page-database-submenu page-database-color-menu", anchorEl, {
      align: "right",
      offset: 2,
      closeAll: false
    });
    appendMenuLabel(menuEl, "Color");
    TAG_COLOR_OPTIONS.forEach((entry) => {
      const swatchClass = entry.value === "none" ? "tag-none" : statusClassName(entry.value);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `topbar-dropdown-btn page-database-color-option${option.color === entry.value ? " active" : ""}`;
      button.innerHTML = `<span class="page-database-color-option-main"><span class="page-database-color-swatch ${escapeHTML(swatchClass)}"></span><span>${escapeHTML(entry.label)}</span></span>`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectOptionColor(database, propertyId, optionName, entry.value);
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        document.getElementById(DATABASE_SUBMENU_ID)?.remove();
        options.onChange?.();
      });
      menuEl.appendChild(button);
    });
  }

  function openSelectValueMenu(anchorEl, context, database, row, property) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-value-menu page-database-tag-menu", anchorEl, { align: "left" });
    menuEl.innerHTML = `
      <input class="page-database-value-search" type="text" placeholder="Search for an option..." autocomplete="off" />
      <div class="page-database-value-list"></div>
    `;

    const searchEl = menuEl.querySelector(".page-database-value-search");
    const listEl = menuEl.querySelector(".page-database-value-list");
    const getCurrentValue = () => String(getRowValue(getRowById(database, row.id), property.id) || "").trim();

    const renderOptions = () => {
      const query = String(searchEl?.value || "").trim();
      const normalizedQuery = query.toLowerCase();
      const allOptions = getPropertySelectOptions(property);
      const currentValue = getCurrentValue();
      const matching = allOptions.filter((option) => option.name.toLowerCase().includes(normalizedQuery));
      listEl.innerHTML = "";

      if (query) {
        const createButton = document.createElement("button");
        createButton.type = "button";
        createButton.className = "topbar-dropdown-btn page-database-value-create";
        createButton.textContent = matching.some((option) => option.name.toLowerCase() === normalizedQuery)
          ? `Select ${query}`
          : `Create \"${query}\"`;
        createButton.addEventListener("click", (event) => {
          event.stopPropagation();
          ensureSelectValueInProperty(property, query);
          commitCellValue(context, database, row.id, property.id, query);
        });
        listEl.appendChild(createButton);
      }

      if (!matching.length && !query) {
        const empty = document.createElement("div");
        empty.className = "page-database-value-empty";
        empty.textContent = "Select an option or create one";
        listEl.appendChild(empty);
        return;
      }

      matching.forEach((option) => {
        const rowEl = document.createElement("div");
        rowEl.className = "page-database-tag-option-row";

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.className = `topbar-dropdown-btn page-database-value-option${currentValue === option.name ? " active" : ""}`;
        selectButton.innerHTML = buildValuePillHTML(property, option.name);
        selectButton.addEventListener("click", (event) => {
          event.stopPropagation();
          commitCellValue(context, database, row.id, property.id, currentValue === option.name ? "" : option.name);
        });

        const colorButton = document.createElement("button");
        colorButton.type = "button";
        colorButton.className = "page-database-tag-color-btn";
        colorButton.innerHTML = `<span class="page-database-color-swatch ${escapeHTML(option.color === 'none' ? 'tag-none' : statusClassName(option.color))}"></span>`;
        colorButton.addEventListener("click", (event) => {
          event.stopPropagation();
          openSelectColorMenu(colorButton, context, database, property.id, option.name, { onChange: renderOptions });
        });

        rowEl.appendChild(selectButton);
        rowEl.appendChild(colorButton);
        listEl.appendChild(rowEl);
      });
    };

    searchEl?.addEventListener("input", renderOptions);
    searchEl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const query = String(searchEl.value || "").trim();
        if (query) {
          ensureSelectValueInProperty(property, query);
          commitCellValue(context, database, row.id, property.id, query);
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatabaseMenus();
      }
    });

    renderOptions();
    requestAnimationFrame(() => searchEl?.focus());
  }

  function openRelationValueMenu(anchorEl, context, database, row, property) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-value-menu page-database-tag-menu", anchorEl, { align: "left" });
    const source = getRelationSource(property);
    const sourceDatabase = getDatabaseFromSource(source);

    if (!source || !sourceDatabase) {
      menuEl.innerHTML = `<div class="page-database-value-empty">Choose a linked table in the property settings first</div>`;
      appendMenuDivider(menuEl);
      appendMenuButton(menuEl, "Edit property", () => {
        openPropertyPanel(context, database, property.id);
      });
      return;
    }

    menuEl.innerHTML = `
      <div class="page-database-value-menu-head">${escapeHTML(source.label || source.title || "Linked table")}</div>
      <input class="page-database-value-search" type="text" placeholder="Search rows..." autocomplete="off" />
      <div class="page-database-value-list"></div>
    `;

    const searchEl = menuEl.querySelector(".page-database-value-search");
    const listEl = menuEl.querySelector(".page-database-value-list");
    const getCurrentValue = () => String(getRowValue(getRowById(database, row.id), property.id) || "").trim();

    const renderOptions = () => {
      const query = String(searchEl?.value || "").trim().toLowerCase();
      const rows = getVisibleRows(sourceDatabase)
        .map((entry) => ({ row: entry, label: getRowTitle(sourceDatabase, entry) }))
        .filter((entry) => !query || entry.label.toLowerCase().includes(query));

      listEl.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "page-database-value-empty";
        empty.textContent = query ? "No matching rows" : "No rows in this table yet";
        listEl.appendChild(empty);
        return;
      }

      rows.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `topbar-dropdown-btn page-database-value-option${hasRelationValue(getCurrentValue(), entry.row.id) ? " active" : ""}`;
        button.innerHTML = `<span class="page-db-cell-pill page-db-cell-pill-relation">${escapeHTML(entry.label)}</span>`;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          commitCellValue(context, database, row.id, property.id, toggleRelationValue(getCurrentValue(), entry.row.id), { closeMenus: false });
          renderOptions();
        });
        listEl.appendChild(button);
      });
    };

    searchEl?.addEventListener("input", renderOptions);
    searchEl?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatabaseMenus();
      }
    });

    renderOptions();
    appendMenuDivider(menuEl);
    appendMenuButton(menuEl, "Edit property", () => {
      openPropertyPanel(context, database, property.id);
    });
    requestAnimationFrame(() => searchEl?.focus());
  }

  function openDateValueMenu(anchorEl, context, database, row, property) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-value-menu page-database-date-menu", anchorEl, { align: "left" });
    const initialValue = parseDateCellValue(getRowValue(row, property.id));
    const state = {
      start: initialValue.start,
      end: initialValue.end,
      startTime: initialValue.startTime,
      endTime: initialValue.endTime,
      dateFormat: initialValue.dateFormat,
      includeTime: initialValue.includeTime,
      remind: initialValue.remind,
      month: normalizeMonthKey(initialValue.start || toDayKey(new Date())),
      activeTarget: initialValue.end ? "end" : "start"
    };

    const saveState = () => {
      commitCellValue(context, database, row.id, property.id, {
        start: state.start,
        end: state.end,
        startTime: state.startTime,
        endTime: state.endTime,
        dateFormat: state.dateFormat,
        includeTime: state.includeTime,
        remind: state.remind
      }, { closeMenus: false });
    };

    const selectDate = (dayKey) => {
      if (!dayKey) return;
      if (state.activeTarget === "end") {
        if (!state.start) {
          state.start = dayKey;
          state.end = "";
          state.activeTarget = "end";
        } else if (dayKey < state.start) {
          state.start = dayKey;
          state.end = "";
          state.activeTarget = "end";
        } else {
          state.end = dayKey;
        }
      } else {
        state.start = dayKey;
        if (state.end && state.end < state.start) state.end = "";
      }
      if (state.includeTime && !state.startTime) state.startTime = "09:00";
      if (state.includeTime && (state.end || state.activeTarget === "end") && !state.endTime) state.endTime = state.startTime || "09:00";
      state.month = normalizeMonthKey(dayKey, new Date());
      saveState();
      renderDateMenu();
    };

    const renderDateMenu = () => {
      const normalizedMonth = normalizeMonthKey(state.month);
      const [yearText, monthText] = normalizedMonth.split("-");
      const monthDate = new Date(Number(yearText), Number(monthText) - 1, 1);
      const gridStart = new Date(monthDate);
      gridStart.setDate(1 - monthDate.getDay());
      const todayKey = toDayKey(new Date());
      const formatLabel = DATE_FORMAT_OPTIONS.find((entry) => entry.value === state.dateFormat)?.label || "Full date";
      const remindLabel = state.remind === "none"
        ? "None"
        : state.remind === "day-before"
          ? "1 day before"
          : "At time of event";
      const startTimeValue = state.startTime || "09:00";
      const endTimeValue = state.endTime || state.startTime || "09:00";

      menuEl.innerHTML = `
        <div class="page-database-date-summary">${escapeHTML(formatDateValueLabel({ start: state.start, end: state.end, startTime: state.startTime, endTime: state.endTime, includeTime: state.includeTime, dateFormat: state.dateFormat }) || "Pick a date")}</div>
        <div class="page-database-date-monthbar">
          <div class="page-database-date-monthlabel">${escapeHTML(formatMonthLabel(normalizedMonth))}</div>
          <div class="page-database-date-monthactions">
            <button type="button" class="page-database-date-nav" data-date-action="today">Today</button>
            <button type="button" class="page-database-date-nav" data-date-action="prev">‹</button>
            <button type="button" class="page-database-date-nav" data-date-action="next">›</button>
          </div>
        </div>
        <div class="page-database-date-weekdays">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => `<span>${label}</span>`).join("")}</div>
        <div class="page-database-date-grid">${Array.from({ length: 42 }, (_, index) => {
          const cellDate = new Date(gridStart);
          cellDate.setDate(gridStart.getDate() + index);
          const dayKey = toDayKey(cellDate);
          const classes = ["page-database-date-day"];
          if (cellDate.getMonth() !== monthDate.getMonth()) classes.push("outside");
          if (dayKey === todayKey) classes.push("today");
          if (dayKey === state.start) classes.push("selected-start");
          if (dayKey === state.end) classes.push("selected-end");
          if (state.start && state.end && dayKey > state.start && dayKey < state.end) classes.push("in-range");
          if (state.activeTarget === "end" && !state.end && dayKey === state.start) classes.push("active-anchor");
          return `<button type="button" class="${classes.join(" ")}" data-date-day="${dayKey}">${cellDate.getDate()}</button>`;
        }).join("")}</div>
        <div class="page-database-date-settings">
          <button type="button" class="page-database-date-setting" data-date-action="toggle-end"><span class="page-database-date-setting-label">End date</span><span class="page-database-date-switch${state.end || state.activeTarget === "end" ? " on" : ""}"><span></span></span></button>
          <button type="button" class="page-database-date-setting" data-date-action="cycle-format"><span class="page-database-date-setting-label">Date format</span><span class="page-database-date-setting-value">${escapeHTML(formatLabel)} <span class="page-database-date-chevron">›</span></span></button>
          <button type="button" class="page-database-date-setting" data-date-action="toggle-time"><span class="page-database-date-setting-label">Include time</span><span class="page-database-date-switch${state.includeTime ? " on" : ""}"><span></span></span></button>
          ${state.includeTime ? `
            <label class="page-database-date-setting page-database-date-setting-time">
              <span class="page-database-date-setting-label">Start time</span>
              <input type="time" class="page-database-date-time-input" data-date-time-input="start" value="${escapeHTML(startTimeValue)}" />
            </label>
            ${state.end || state.activeTarget === "end" ? `
              <label class="page-database-date-setting page-database-date-setting-time">
                <span class="page-database-date-setting-label">End time</span>
                <input type="time" class="page-database-date-time-input" data-date-time-input="end" value="${escapeHTML(endTimeValue)}" />
              </label>
            ` : ""}
          ` : ""}
          <button type="button" class="page-database-date-setting" data-date-action="cycle-remind"><span class="page-database-date-setting-label">Remind</span><span class="page-database-date-setting-value">${escapeHTML(remindLabel)} <span class="page-database-date-chevron">›</span></span></button>
          <button type="button" class="page-database-date-setting clear-row" data-date-action="clear"><span class="page-database-date-setting-label">Clear</span><span></span></button>
          <div class="page-database-date-footnote">Learn about reminders</div>
        </div>
      `;

      menuEl.querySelectorAll("[data-date-day]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          selectDate(button.dataset.dateDay || "");
        });
      });

      menuEl.querySelectorAll("[data-date-time-input]").forEach((input) => {
        input.addEventListener("input", (event) => {
          event.stopPropagation();
          const timeValue = normalizeTimeValue(input.value || "");
          if (input.dataset.dateTimeInput === "end") state.endTime = timeValue;
          else state.startTime = timeValue;
          saveState();
        });
      });

      menuEl.querySelectorAll("[data-date-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const action = button.dataset.dateAction || "";
          if (action === "prev") {
            state.month = shiftMonthKey(normalizedMonth, -1);
            renderDateMenu();
            return;
          }
          if (action === "next") {
            state.month = shiftMonthKey(normalizedMonth, 1);
            renderDateMenu();
            return;
          }
          if (action === "today") {
            selectDate(toDayKey(new Date()));
            return;
          }
          if (action === "toggle-end") {
            if (state.end || state.activeTarget === "end") {
              state.end = "";
              state.endTime = "";
              state.activeTarget = "start";
            } else {
              state.activeTarget = "end";
              if (state.includeTime && !state.endTime) state.endTime = state.startTime || "09:00";
            }
            saveState();
            renderDateMenu();
            return;
          }
          if (action === "cycle-format") {
            const formats = DATE_FORMAT_OPTIONS.map((entry) => entry.value);
            const currentIndex = formats.indexOf(state.dateFormat);
            state.dateFormat = formats[(currentIndex + 1 + formats.length) % formats.length] || "full";
            saveState();
            renderDateMenu();
            return;
          }
          if (action === "toggle-time") {
            state.includeTime = !state.includeTime;
            if (state.includeTime) {
              if (!state.startTime) state.startTime = "09:00";
              if ((state.end || state.activeTarget === "end") && !state.endTime) state.endTime = state.startTime || "09:00";
            } else {
              state.startTime = "";
              state.endTime = "";
            }
            saveState();
            renderDateMenu();
            return;
          }
          if (action === "cycle-remind") {
            const reminders = ["none", "at-time", "day-before"];
            const currentIndex = reminders.indexOf(state.remind);
            state.remind = reminders[(currentIndex + 1 + reminders.length) % reminders.length] || "none";
            saveState();
            renderDateMenu();
            return;
          }
          if (action === "clear") {
            state.start = "";
            state.end = "";
            state.startTime = "";
            state.endTime = "";
            state.includeTime = false;
            state.remind = "none";
            state.activeTarget = "start";
            commitCellValue(context, database, row.id, property.id, "", { closeMenus: false });
            renderDateMenu();
          }
        });
      });
    };

    renderDateMenu();
  }

  function openCellValueMenu(anchorEl, context, database, rowId = "", propertyId = "") {
    const row = getRowById(database, rowId);
    const property = getPropertyById(database, propertyId);
    if (!row || !property) return;

    if (property.type === "status") {
      openStatusValueMenu(anchorEl, context, database, row, property);
      return;
    }

    if (property.type === "tag") {
      openTagValueMenu(anchorEl, context, database, row, property);
      return;
    }

    if (property.type === "select") {
      openSelectValueMenu(anchorEl, context, database, row, property);
      return;
    }

    if (property.type === "relation") {
      openRelationValueMenu(anchorEl, context, database, row, property);
      return;
    }

    if (property.type === "date") {
      openDateValueMenu(anchorEl, context, database, row, property);
    }
  }

  function setPropertyFilter(database, propertyId = "", mode = "equals", value = "") {
    const next = (database.filters || []).filter((entry) => entry.propertyId !== propertyId);
    if (mode) {
      next.push({ propertyId, mode, value: String(value || "") });
    }
    database.filters = next;
  }

  function setPropertySort(database, propertyId = "", direction = "") {
    database.sorts = (database.sorts || []).filter((entry) => entry.propertyId !== propertyId);
    if (direction === "asc" || direction === "desc") {
      database.sorts.push({ propertyId, direction });
    }
  }

  function toggleFrozenProperty(database, propertyId = "") {
    const next = new Set(database.frozenPropertyIds || []);
    if (next.has(propertyId)) next.delete(propertyId);
    else next.add(propertyId);
    database.frozenPropertyIds = Array.from(next);
  }

  function toggleUnwrappedProperty(database, propertyId = "") {
    const next = new Set(database.unwrappedPropertyIds || []);
    if (next.has(propertyId)) next.delete(propertyId);
    else next.add(propertyId);
    database.unwrappedPropertyIds = Array.from(next);
  }

  function setPropertyCalculation(database, propertyId = "", mode = "") {
    database.calculations = { ...(database.calculations || {}) };
    if (!mode) delete database.calculations[propertyId];
    else database.calculations[propertyId] = mode;
  }

  function renameProperty(database, propertyId = "", name = "") {
    const property = getPropertyById(database, propertyId);
    if (!property) return;
    property.name = normalizePropertyName(name, property.type, database.properties.indexOf(property));
  }

  function setPropertyType(database, propertyId = "", nextType = "text") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type === "title") return;

    const safeType = normalizePropertyType(nextType, property.type);
    if (safeType === "title") return;

    property.type = safeType;
    if (safeType === "status") property.statusGroups = normalizeStatusGroups(property.statusGroups || []);
    else delete property.statusGroups;
    if (safeType === "tag") property.tagOptions = normalizeTagOptions(property.tagOptions || []);
    else delete property.tagOptions;
    if (safeType === "select") property.selectOptions = normalizeSelectOptions(property.selectOptions || []);
    else delete property.selectOptions;
    if (safeType === "relation") property.relationTarget = normalizeRelationTarget(property.relationTarget || {});
    else delete property.relationTarget;
    if (safeType === "summary") property.summaryConfig = normalizeSummaryConfig(property.summaryConfig || {});
    else delete property.summaryConfig;
    if (safeType === "formula") property.formulaConfig = normalizeFormulaConfig(property.formulaConfig || {});
    else delete property.formulaConfig;
    database.rows = database.rows.map((row) => {
      const nextRow = normalizeRow(row, database.properties);
      nextRow.values[property.id] = normalizeCellValue(property, row?.values?.[property.id] ?? "");
      return nextRow;
    });
  }

  function setRelationTarget(database, propertyId = "", target = {}) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "relation") return;
    property.relationTarget = normalizeRelationTarget(target);
    const source = getRelationSource(property);
    const sourceDatabase = getDatabaseFromSource(source);
    const validRowIds = new Set((sourceDatabase?.rows || []).map((row) => row.id));
    database.rows = database.rows.map((row) => {
      const nextRow = normalizeRow(row, database.properties);
      nextRow.values[property.id] = serializeRelationValue(parseRelationValues(nextRow.values?.[property.id] || "").filter((rowId) => validRowIds.has(rowId)));
      return nextRow;
    });
  }

  function setSummaryConfig(database, propertyId = "", nextConfig = {}) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "summary") return;
    property.summaryConfig = normalizeSummaryConfig({
      ...(property.summaryConfig || {}),
      ...(nextConfig || {})
    });
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
  }

  function setFormulaConfig(database, propertyId = "", nextConfig = {}) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "formula") return;
    property.formulaConfig = normalizeFormulaConfig({
      ...(property.formulaConfig || {}),
      ...(nextConfig || {})
    });
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
  }

  function setStatusGroups(database, propertyId = "", groups = []) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    property.statusGroups = normalizeStatusGroups(groups);
    const validNames = new Set(getStatusOptions(property).map((option) => option.name));
    const fallback = getDefaultStatusName(property);
    database.rows = database.rows.map((row) => {
      const nextRow = normalizeRow(row, database.properties);
      const currentValue = String(nextRow.values?.[property.id] || "").trim();
      if (currentValue && !validNames.has(currentValue)) nextRow.values[property.id] = fallback;
      return nextRow;
    });
  }

  function updateStatusOptionName(database, propertyId = "", groupIndex = -1, optionIndex = -1, name = "") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const groups = cloneStatusGroups(property.statusGroups || []);
    const option = groups[groupIndex]?.options?.[optionIndex];
    if (!option) return;
    option.name = String(name || "").trim() || option.name;
    setStatusGroups(database, propertyId, groups);
  }

  function addStatusOption(database, propertyId = "", groupIndex = 0) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const groups = cloneStatusGroups(property.statusGroups || []);
    const group = groups[groupIndex];
    if (!group) return;
    group.options.push({ id: createId("status"), name: "New status", color: "gray", isDefault: false });
    setStatusGroups(database, propertyId, groups);
  }

  function deleteStatusOption(database, propertyId = "", groupIndex = -1, optionIndex = -1) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const groups = cloneStatusGroups(property.statusGroups || []);
    const group = groups[groupIndex];
    if (!group || group.options.length <= 1) return;
    group.options.splice(optionIndex, 1);
    setStatusGroups(database, propertyId, groups.filter((entry) => entry.options.length));
  }

  function setDefaultStatusOption(database, propertyId = "", groupIndex = -1, optionIndex = -1) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const groups = cloneStatusGroups(property.statusGroups || []);
    groups.forEach((group) => group.options.forEach((option) => { option.isDefault = false; }));
    const option = groups[groupIndex]?.options?.[optionIndex];
    if (!option) return;
    option.isDefault = true;
    setStatusGroups(database, propertyId, groups);
  }

  function cycleStatusOptionColor(database, propertyId = "", groupIndex = -1, optionIndex = -1) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const palette = STATUS_COLOR_OPTIONS.map((entry) => entry.value);
    const groups = cloneStatusGroups(property.statusGroups || []);
    const option = groups[groupIndex]?.options?.[optionIndex];
    if (!option) return;
    const currentIndex = Math.max(0, palette.indexOf(option.color || "gray"));
    option.color = palette[(currentIndex + 1) % palette.length];
    setStatusGroups(database, propertyId, groups);
  }

  function setStatusOptionColor(database, propertyId = "", groupIndex = -1, optionIndex = -1, color = "gray") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "status") return;
    const groups = cloneStatusGroups(property.statusGroups || []);
    const option = groups[groupIndex]?.options?.[optionIndex];
    if (!option) return;
    option.color = STATUS_COLOR_OPTIONS.some((entry) => entry.value === color) ? color : "gray";
    setStatusGroups(database, propertyId, groups);
  }

  function setTagOptions(database, propertyId = "", options = []) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "tag") return;
    property.tagOptions = normalizeTagOptions(options);
    const validNames = new Set(getPropertyTagOptions(property).map((option) => option.name));
    database.rows = database.rows.map((row) => {
      const nextRow = normalizeRow(row, database.properties);
      const currentValue = String(nextRow.values?.[property.id] || "").trim();
      if (currentValue) {
        nextRow.values[property.id] = joinTagValues(parseTagValues(currentValue).filter((entry) => validNames.has(entry)));
      }
      return nextRow;
    });
  }

  function setTagOptionColor(database, propertyId = "", tagName = "", color = "none") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "tag") return;
    const options = cloneTagOptions(property.tagOptions || []);
    const option = options.find((entry) => entry.name === String(tagName || "").trim());
    if (!option) return;
    option.color = TAG_COLOR_OPTIONS.some((entry) => entry.value === color) ? color : "none";
    setTagOptions(database, propertyId, options);
  }

  function setSelectOptions(database, propertyId = "", options = []) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "select") return;
    property.selectOptions = normalizeSelectOptions(options);
    const validNames = new Set(getPropertySelectOptions(property).map((option) => option.name));
    database.rows = database.rows.map((row) => {
      const nextRow = normalizeRow(row, database.properties);
      const currentValue = String(nextRow.values?.[property.id] || "").trim();
      if (currentValue && !validNames.has(currentValue)) nextRow.values[property.id] = "";
      return nextRow;
    });
  }

  function setSelectOptionColor(database, propertyId = "", optionName = "", color = "none") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "select") return;
    const options = cloneSelectOptions(property.selectOptions || []);
    const option = options.find((entry) => entry.name === String(optionName || "").trim());
    if (!option) return;
    option.color = TAG_COLOR_OPTIONS.some((entry) => entry.value === color) ? color : "none";
    setSelectOptions(database, propertyId, options);
  }

  function updateSelectOptionName(database, propertyId = "", optionIndex = -1, name = "") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "select") return;
    const options = cloneSelectOptions(property.selectOptions || []);
    const option = options[optionIndex];
    if (!option) return;
    option.name = String(name || "").trim() || option.name;
    setSelectOptions(database, propertyId, options);
  }

  function addSelectOption(database, propertyId = "") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "select") return;
    const options = cloneSelectOptions(property.selectOptions || []);
    options.push({ id: createId("select"), name: "New option", color: getNextSelectColor(property) });
    setSelectOptions(database, propertyId, options);
  }

  function deleteSelectOption(database, propertyId = "", optionIndex = -1) {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type !== "select") return;
    const options = cloneSelectOptions(property.selectOptions || []);
    if (!options[optionIndex]) return;
    options.splice(optionIndex, 1);
    setSelectOptions(database, propertyId, options);
  }

  function addPropertyAtIndex(database, property, insertIndex = null) {
    const nextProperties = database.properties.slice();
    const normalized = normalizeProperty(property, Math.max(0, insertIndex ?? nextProperties.length));
    const safeIndex = Number.isInteger(insertIndex) ? Math.max(0, Math.min(insertIndex, nextProperties.length)) : nextProperties.length;
    nextProperties.splice(safeIndex, 0, normalized);
    database.properties = ensureTitleProperty(nextProperties);
    database.columnWidths = { ...(database.columnWidths || {}) };
    if (!database.columnWidths[normalized.id]) database.columnWidths[normalized.id] = getDefaultPropertyWidth(normalized);
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
  }

  function movePropertyInDatabase(database, propertyId = "", targetPropertyId = "", position = "before") {
    const sourceIndex = database.properties.findIndex((property) => property.id === propertyId);
    const targetIndex = database.properties.findIndex((property) => property.id === targetPropertyId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

    const nextProperties = database.properties.slice();
    const [movedProperty] = nextProperties.splice(sourceIndex, 1);
    if (!movedProperty) return false;

    let nextIndex = nextProperties.findIndex((property) => property.id === targetPropertyId);
    if (nextIndex < 0) return false;
    if (position === "after") nextIndex += 1;

    nextProperties.splice(nextIndex, 0, movedProperty);
    database.properties = ensureTitleProperty(nextProperties);
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
    return true;
  }

  function deletePropertyFromDatabase(database, propertyId = "") {
    const property = getPropertyById(database, propertyId);
    if (!property || property.type === "title") return;
    database.properties = database.properties.filter((entry) => entry.id !== propertyId);
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
    database.filters = (database.filters || []).filter((entry) => entry.propertyId !== propertyId);
    database.sorts = (database.sorts || []).filter((entry) => entry.propertyId !== propertyId);
    if (database.groupBy === propertyId) database.groupBy = "";
    database.frozenPropertyIds = (database.frozenPropertyIds || []).filter((entry) => entry !== propertyId);
    database.unwrappedPropertyIds = (database.unwrappedPropertyIds || []).filter((entry) => entry !== propertyId);
    if (database.calculations && typeof database.calculations === "object") {
      delete database.calculations[propertyId];
    }
    if (database.columnWidths && typeof database.columnWidths === "object") {
      delete database.columnWidths[propertyId];
    }
  }

  function setPropertyWidth(database, propertyId = "", width = 0) {
    const property = getPropertyById(database, propertyId);
    if (!property) return;
    const safeWidth = Math.max(120, Math.min(640, Math.round(Number(width) || getDefaultPropertyWidth(property))));
    database.columnWidths = { ...(database.columnWidths || {}), [propertyId]: safeWidth };
  }

  function getStatusOptionsForValue(value = "") {
    const current = String(value || "").trim();
    return current && !STATUS_OPTIONS.includes(current)
      ? [current, ...STATUS_OPTIONS]
      : STATUS_OPTIONS.slice();
  }

  function buildRowChipsHTML(database, row) {
    const chips = database.properties
      .filter((property) => property.type !== "title" && property.type !== "date" && property.type !== "notes" && property.type !== "checkbox" && property.type !== "summary" && property.type !== "formula")
      .map((property) => ({
        property,
        value: property.type === "relation"
          ? getRelationValueLabel(property, getRowValue(row, property.id))
          : String(getRowValue(row, property.id) || "").trim()
      }))
      .filter((entry) => entry.value)
      .slice(0, 2);

    return chips.map(({ property, value }) => {
      const extraClass = property.type === "status"
        ? statusClassName(value)
        : property.type === "tag" || property.type === "select"
          ? "page-calendar-chip-tag"
          : "";
      return `<span class="page-calendar-chip ${extraClass}">${escapeHTML(value)}</span>`;
    }).join("");
  }

  function addRowToDatabase(database, defaults = {}) {
    database.properties = ensureTitleProperty(database.properties);
    const row = normalizeRow({ id: createId("row"), values: defaults }, database.properties);
    database.rows.push(row);
    return row;
  }

  function duplicateRowInDatabase(database, rowId = "") {
    const source = getRowById(database, rowId);
    if (!source) return null;

    const duplicate = normalizeRow({
      id: createId("row"),
      icon: source.icon || "",
      color: source.color || "",
      values: { ...(source.values || {}) }
    }, database.properties);

    const rowIndex = database.rows.findIndex((row) => row.id === rowId);
    if (rowIndex === -1) database.rows.push(duplicate);
    else database.rows.splice(rowIndex + 1, 0, duplicate);
    return duplicate;
  }

  function deleteRowFromDatabase(database, rowId = "") {
    database.rows = database.rows.filter((row) => row.id !== rowId);
  }

  function updateRowValue(database, rowId = "", propertyId = "", value = "") {
    const row = getRowById(database, rowId);
    const property = getPropertyById(database, propertyId);
    if (!row || !property) return;
    row.values[propertyId] = normalizeCellValue(property, value);
  }

  function addPropertyToDatabase(database, property) {
    database.properties = ensureTitleProperty([...database.properties, property]);
    database.rows = database.rows.map((row) => normalizeRow(row, database.properties));
  }

  function promptForPropertyDefinition() {
    const name = window.prompt("Property name", "");
    if (name === null) return null;

    const typeInput = window.prompt(
      "Property type: text, number, select, checkbox, relation, summary, formula, date, status, tag, or notes",
      "text"
    );
    if (typeInput === null) return null;

    const type = normalizePropertyType(typeInput, "text");
    if (type === "title") {
      window.showAppToast?.("The Name property already exists.", "info");
      return null;
    }

    return normalizeProperty({
      id: createId("prop"),
      name,
      type
    }, 1);
  }

  function getPageEditorGridTemplate(database) {
    const cols = getVisibleTableProperties(database).map((property) => {
      const width = database.columnWidths?.[property.id] || getDefaultPropertyWidth(property);
      return `${width}px`;
    });
    return cols.join(" ");
  }

  function getPropertyIcon(property) {
    if (property?.showIcon === false) return "";
    return String(property?.icon || "").trim() || getPropertyDefaultIcon(property);
  }

  function getPropertyFilter(database, propertyId = "") {
    return (database.filters || []).find((entry) => entry.propertyId === propertyId) || null;
  }

  function getPropertySort(database, propertyId = "") {
    return (database.sorts || []).find((entry) => entry.propertyId === propertyId) || null;
  }

  function getPropertyCalculationMode(database, propertyId = "") {
    return database.calculations?.[propertyId] || "";
  }

  function buildPropertyIndicatorsHTML(database, property) {
    const markers = [];
    const sort = getPropertySort(database, property.id);
    const filter = getPropertyFilter(database, property.id);
    const calculation = getPropertyCalculationMode(database, property.id);

    if (filter) markers.push(`<span class="page-database-col-marker">F</span>`);
    if (sort) markers.push(`<span class="page-database-col-marker">${sort.direction === "desc" ? "↓" : "↑"}</span>`);
    if (database.groupBy === property.id) markers.push(`<span class="page-database-col-marker">G</span>`);
    if (isPropertyFrozen(database, property.id)) markers.push(`<span class="page-database-col-marker">P</span>`);
    if (calculation) markers.push(`<span class="page-database-col-marker">Σ</span>`);
    return markers.join("");
  }

  function buildEditableCellHTML(database, row, property) {
    const value = String(getRowValue(row, property.id) || "");
    const baseAttrs = `data-db-row-id="${escapeHTML(row.id)}" data-db-prop-id="${escapeHTML(property.id)}"`;
    const cellClasses = ["page-database-cell"];
    const cellColor = getCellToneColor(row, property.id);
    if (property.type === "title") cellClasses.push("is-title");
    if (isPropertyFrozen(database, property.id)) cellClasses.push("is-frozen");
    if (property.type === "date" || property.type === "status" || property.type === "tag" || property.type === "select" || property.type === "relation" || property.type === "checkbox") cellClasses.push("has-value-trigger");
    if (cellColor) cellClasses.push("has-cell-color");

    let controlHTML = "";

    if (property.type === "date") {
      controlHTML = `
        <button type="button" class="page-db-cell-trigger page-db-cell-date-trigger${value ? " has-value" : ""}" ${baseAttrs} data-db-action="open-cell-value-menu">
          ${buildValuePillHTML(property, value)}
          <span class="page-db-cell-trigger-icon">🗓</span>
        </button>
      `;
    } else if (property.type === "status") {
      controlHTML = `
        <button type="button" class="page-db-cell-trigger page-db-cell-status-trigger${value ? " has-value" : ""}" ${baseAttrs} data-db-action="open-cell-value-menu">
          ${buildValuePillHTML(property, value)}
        </button>
      `;
    } else if (property.type === "tag") {
      controlHTML = `
        <button type="button" class="page-db-cell-trigger page-db-cell-tag-trigger${value ? " has-value" : ""}" ${baseAttrs} data-db-action="open-cell-value-menu">
          ${buildValuePillHTML(property, value)}
        </button>
      `;
    } else if (property.type === "select") {
      controlHTML = `
        <button type="button" class="page-db-cell-trigger page-db-cell-select-trigger${value ? " has-value" : ""}" ${baseAttrs} data-db-action="open-cell-value-menu">
          ${buildValuePillHTML(property, value)}
        </button>
      `;
    } else if (property.type === "relation") {
      controlHTML = `
        <button type="button" class="page-db-cell-trigger page-db-cell-relation-trigger${value ? " has-value" : ""}" ${baseAttrs} data-db-action="open-cell-value-menu">
          ${buildValuePillHTML(property, value)}
        </button>
      `;
    } else if (property.type === "summary") {
      controlHTML = `<div class="page-db-cell-summary">${escapeHTML(getSummaryDisplayValue(database, row, property) || "—")}</div>`;
    } else if (property.type === "formula") {
      const formulaDisplay = getFormulaDisplayValue(database, row, property) || "—";
      const formulaConfig = normalizeFormulaConfig(property.formulaConfig || {});
      if (formulaConfig.mode === "simple" && formulaConfig.simpleType === "auto-complete" && formulaDisplay !== "—") {
        const formulaStateClass = formulaDisplay === "Complete" ? "status-green" : "status-gray";
        controlHTML = `<div class="page-db-cell-summary"><span class="page-db-cell-pill ${formulaStateClass}"><span class="page-db-cell-pill-dot"></span><span>${escapeHTML(formulaDisplay)}</span></span></div>`;
      } else {
        controlHTML = `<div class="page-db-cell-summary">${escapeHTML(formulaDisplay)}</div>`;
      }
    } else if (property.type === "checkbox") {
      controlHTML = `
        <button type="button" class="page-db-checkbox-trigger${value === "true" ? " checked" : ""}" ${baseAttrs} data-db-action="toggle-checkbox">
          <span class="page-db-checkbox-box">${value === "true" ? "✓" : ""}</span>
        </button>
      `;
    } else {
      const placeholder = property.type === "title"
        ? "Untitled"
        : property.type === "notes"
          ? "Empty"
          : property.name;
      const usesTextarea = property.type !== "title" && property.type !== "number" && !isPropertyUnwrapped(database, property.id);

      controlHTML = usesTextarea
        ? `<textarea class="page-db-cell-input page-db-cell-textarea${property.type === "title" ? " title-cell" : ""}" ${baseAttrs} placeholder="${escapeHTML(placeholder)}" spellcheck="false" rows="1">${escapeHTML(value)}</textarea>`
        : `<input type="${property.type === "number" ? "number" : "text"}" class="page-db-cell-input${property.type === "title" ? " title-cell" : ""}${property.type === "number" ? " page-db-cell-number-input" : ""}" ${baseAttrs} value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" spellcheck="false" ${property.type === "number" ? 'step="any" inputmode="decimal"' : ""} />`;
    }

    const pageIconHTML = property.type === "title" && hasPageIcon(database)
      ? `<span class="page-db-row-icon" aria-hidden="true">${escapeHTML(getRowIcon(row))}</span>`
      : "";

    return `
      <div class="${cellClasses.join(" ")}" data-db-prop-col="${escapeHTML(property.id)}" data-db-row-id="${escapeHTML(row.id)}" data-db-prop-id="${escapeHTML(property.id)}"${cellColor ? ` style="--page-db-cell-accent:${escapeHTML(cellColor)};"` : ""}>
        ${pageIconHTML}
        ${controlHTML}
      </div>
    `;
  }

  function getCalculationText(mode = "", rows = [], property, database) {
    if (!mode) return "";
    const filled = rows.filter((row) => String(getComparablePropertyValue(database, row, property) || "").trim()).length;
    if (mode === "count-all") return String(rows.length);
    if (mode === "count-filled") return String(filled);
    if (mode === "percent-filled") {
      if (!rows.length) return "0%";
      return `${Math.round((filled / rows.length) * 100)}%`;
    }
    return "";
  }

  function buildCalculationCellHTML(database, property, rows = []) {
    const mode = getPropertyCalculationMode(database, property.id);
    const value = getCalculationText(mode, rows, property, database);
    const classes = ["page-database-cell", "page-database-footer-cell"];
    if (isPropertyFrozen(database, property.id)) classes.push("is-frozen");

    return `
      <div class="${classes.join(" ")}" data-db-prop-col="${escapeHTML(property.id)}">
        <span class="page-database-footer-value">${escapeHTML(value || "")}</span>
      </div>
    `;
  }

  function buildPageTableEditorHTML(database) {
    const gridTemplate = getPageEditorGridTemplate(database);
    const visibleProperties = getVisibleTableProperties(database);
    const visibleRows = getVisibleRows(database);
    const groupedRows = getGroupedRows(database, visibleRows);
    const headTemplate = `${gridTemplate} ${DB_CONTROL_WIDTH}px`;
    const rowTemplate = `${gridTemplate} ${DB_CONTROL_WIDTH}px`;

    const headerCols = visibleProperties
      .map((property) => {
        const classes = ["page-database-col-head-wrap"];
        const headerColor = getPropertyHeaderToneColor(property);
        if (getPropertyFilter(database, property.id) || getPropertySort(database, property.id) || database.groupBy === property.id || isPropertyFrozen(database, property.id) || getPropertyCalculationMode(database, property.id)) {
          classes.push("is-active");
        }
        if (headerColor) classes.push("has-header-color");

        return `
          <div class="${classes.join(" ")}" data-db-prop-col="${escapeHTML(property.id)}" data-db-header-prop-id="${escapeHTML(property.id)}" draggable="true"${headerColor ? ` style="--page-db-header-accent:${escapeHTML(headerColor)};"` : ""}>
            <button type="button" class="page-database-col-head" data-db-action="open-property-menu" data-prop-id="${escapeHTML(property.id)}" aria-haspopup="menu">
              <span class="page-database-col-main">
                ${buildPropertyIconHTML(property)}
                <span class="page-database-col-label">${escapeHTML(property.name)}</span>
              </span>
              <span class="page-database-col-markers">${buildPropertyIndicatorsHTML(database, property)}</span>
            </button>
            <span class="page-database-col-resize" data-db-resize="property" data-prop-id="${escapeHTML(property.id)}" aria-hidden="true"></span>
          </div>
        `;
      })
      .join("");

    const rowsHTML = visibleRows.length
      ? groupedRows.map((group) => {
          const groupHeader = database.groupBy
            ? `<div class="page-database-group-row"><span>${escapeHTML(group.label)}</span><span>${group.rows.length}</span></div>`
            : "";
          const groupRows = group.rows.map((row) => `
            <div class="page-database-row-shell${row.color ? " has-row-color" : ""}" data-db-row-shell-id="${escapeHTML(row.id)}"${row.color ? ` data-row-color="${escapeHTML(row.color)}" style="--page-db-row-accent:${escapeHTML(getRowToneColor(row.color))};"` : ""}>
              <div class="page-database-row-actions page-database-row-actions-left">
                <button type="button" class="page-database-row-action page-database-row-menu-trigger" data-db-action="open-row-menu" data-row-id="${escapeHTML(row.id)}" aria-label="Row options">⋮</button>
              </div>
              <div class="page-database-row-editor page-database-data-row" style="grid-template-columns:${rowTemplate};">
                ${visibleProperties.map((property) => buildEditableCellHTML(database, row, property)).join("")}
                <div class="page-database-cell-pad"></div>
              </div>
            </div>
          `).join("");
          return `${groupHeader}${groupRows}`;
        }).join("")
      : `
          <div class="page-database-row-editor page-database-row-empty" style="grid-template-columns:${rowTemplate};">
            ${visibleProperties.map((property) => `<div class="page-database-cell page-database-cell-pad" data-db-prop-col="${escapeHTML(property.id)}"></div>`).join("")}
            <div class="page-database-cell-pad"></div>
          </div>
        `;

    const footerHTML = visibleProperties.some((property) => getPropertyCalculationMode(database, property.id))
      ? `
          <div class="page-database-row-editor page-database-row-footer" style="grid-template-columns:${rowTemplate};">
            ${visibleProperties.map((property) => buildCalculationCellHTML(database, property, visibleRows)).join("")}
            <div class="page-database-cell-pad"></div>
          </div>
        `
      : "";

    const filteredNote = !visibleRows.length && database.rows.length
      ? `<div class="page-database-empty-note">No pages match the current filters.</div>`
      : "";
    const hiddenNote = !visibleProperties.length
      ? `<div class="page-database-empty-note">All properties are hidden in table view.</div>`
      : "";

    return `
      <div class="page-database-table-shell">
        <div class="page-database-table-scroll">
          <div class="page-database-table-editor">
            <div class="page-database-row-shell page-database-row-shell-head">
              <div class="page-database-row-actions page-database-row-actions-left" aria-hidden="true"></div>
              <div class="page-database-row-editor page-database-row-head" style="grid-template-columns:${headTemplate};">
                ${headerCols}
                <button type="button" class="page-database-head-control" data-db-action="add-property" aria-label="Add property">+</button>
              </div>
            </div>
            ${rowsHTML}
            ${footerHTML}
          </div>
        </div>
        ${filteredNote}
        ${hiddenNote}
        <button type="button" class="page-database-new-row" data-db-action="add-row">+ New page</button>
      </div>
    `;
  }

  function buildPageCalendarShellHTML(database) {
    const viewData = buildCalendarViewHTML(database);
    return `
      <div class="page-database-calendar-shell">
        <div class="page-calendar-toolbar">
          <div class="page-calendar-nav">
            <button type="button" class="page-calendar-nav-btn" data-calendar-action="prev">←</button>
            <button type="button" class="page-calendar-nav-btn today" data-calendar-action="today">Today</button>
            <button type="button" class="page-calendar-nav-btn" data-calendar-action="next">→</button>
          </div>
          <div class="page-calendar-month">${escapeHTML(viewData.monthLabel)}</div>
        </div>
        <div class="page-calendar-weekdays">${viewData.weekdaysHTML}</div>
        <div class="page-calendar-grid">${viewData.bodyHTML}</div>
      </div>
    `;
  }

  function getBoardColumns(database, rows, statusProperty) {
    const options = getStatusOptions(statusProperty);
    const columns = options.map((option) => ({
      value: option.name,
      label: option.name,
      colorClass: option.color && option.color !== "none" ? statusClassName(option.color) : "",
      rows: []
    }));
    const columnMap = new Map(columns.map((column) => [column.value.toLowerCase(), column]));
    const fallbackValue = getDefaultStatusName(statusProperty) || columns[0]?.value || "";

    rows.forEach((row) => {
      const rawValue = String(getRowValue(row, statusProperty.id) || "").trim();
      const columnValue = rawValue || fallbackValue;
      if (!columnValue) return;

      let column = columnMap.get(columnValue.toLowerCase());
      if (!column) {
        column = {
          value: columnValue,
          label: columnValue,
          colorClass: "status-gray",
          rows: []
        };
        columnMap.set(columnValue.toLowerCase(), column);
        columns.push(column);
      }

      column.rows.push(row);
    });

    return columns;
  }

  function buildBoardCardHTML(database, row, dateProperty, tagProperty) {
    const dateValue = dateProperty ? String(getRowValue(row, dateProperty.id) || "").trim() : "";
    const tagValue = tagProperty ? String(getRowValue(row, tagProperty.id) || "").trim() : "";
    const previewMode = getBoardCardPreviewMode(database);
    const previewSource = previewMode === "page-cover" ? getBoardCardPreviewSource(row) : "";
    const cardSize = getBoardCardSize(database);
    const cardLayout = getBoardCardLayout(database);
    const iconHTML = cardSize !== "small" && hasPageIcon(database)
      ? `<span class="page-database-board-card-icon-wrap" aria-hidden="true">${buildRowIconHTML(row)}</span>`
      : "";
    const boardFields = cardSize === "large"
      ? (database.properties || [])
          .filter((property) => isPropertyVisibleInTable(property))
          .filter((property) => property.type !== "title" && property.type !== "status")
          .map((property) => {
            const rawValue = property.type === "summary"
              ? getComputedPropertyRawValue(database, row, property)
              : property.type === "relation"
                ? getComparablePropertyValue(database, row, property)
                : getRowValue(row, property.id);
            const displayValue = String(formatCellDisplay(property, rawValue) || "").trim();
            if (!displayValue) return null;
            if (property.type === "tag") {
              const pillHTML = buildValuePillHTML(property, displayValue);
              if (!pillHTML) return null;
              return `
                <div class="page-database-board-card-field is-tag">
                  <span class="page-database-board-card-field-label">${escapeHTML(property.name)}</span>
                  <span class="page-database-board-card-field-value">${pillHTML}</span>
                </div>
              `;
            }
            return `
              <div class="page-database-board-card-field">
                <span class="page-database-board-card-field-label">${escapeHTML(property.name)}</span>
                <span class="page-database-board-card-field-value">${escapeHTML(displayValue)}</span>
              </div>
            `;
          })
          .filter(Boolean)
          .slice(0, 3)
      : [];
    const legacyDateHTML = dateValue
      ? `<div class="page-database-board-card-date">${escapeHTML(formatCellDisplay(dateProperty, dateValue))}</div>`
      : "";
    const legacyTagHTML = tagValue
      ? `<div class="page-database-board-card-tags">${buildValuePillHTML(tagProperty, tagValue)}</div>`
      : "";
    const metaHTML = cardSize === "small"
      ? ""
      : cardSize === "large"
        ? (boardFields.length
            ? `<div class="page-database-board-card-meta page-database-board-card-fields">${boardFields.join("")}</div>`
            : "")
        : (legacyDateHTML || legacyTagHTML
            ? `<div class="page-database-board-card-meta">${legacyDateHTML}${legacyTagHTML}</div>`
            : "");

    const showPreview = previewMode === "page-cover" && !!previewSource;
    const showAddCoverButton = previewMode === "page-cover" && !previewSource;

    return `
      <div class="page-database-board-card size-${escapeHTML(cardSize)} layout-${escapeHTML(cardLayout)}${previewSource ? " has-preview" : ""}${showAddCoverButton ? " can-add-cover" : ""}${row.color ? " has-row-color" : ""}" data-item-id="${escapeHTML(row.id)}"${row.color ? ` data-row-color="${escapeHTML(row.color)}" style="--page-db-row-accent:${escapeHTML(getRowToneColor(row.color))};"` : ""} draggable="true">
        ${showPreview
          ? `<button type="button" class="page-database-board-card-preview has-image" data-db-action="set-board-card-preview" data-row-id="${escapeHTML(row.id)}" aria-label="Replace cover"><img src="${escapeHTML(previewSource)}" alt="" /></button>`
          : ""}
        ${showAddCoverButton
          ? `<button type="button" class="page-database-board-card-cover-btn" data-db-action="set-board-card-preview" data-row-id="${escapeHTML(row.id)}" aria-label="Add cover">Add cover</button>`
          : ""}
        <div class="page-database-board-card-body">
          <div class="page-database-board-card-title-row">${iconHTML}<div class="page-database-board-card-title">${escapeHTML(getRowTitle(database, row))}</div></div>
          ${metaHTML}
        </div>
      </div>
    `;
  }

  function buildBoardViewHTML(database, options = {}) {
    const readOnly = !!options.readOnly;
    const statusProperty = getStatusProperty(database);
    const visibleRows = getVisibleRows(database);

    if (!statusProperty) {
      return {
        weekdaysHTML: "",
        bodyHTML: `
          <div class="page-calendar-empty">
            <div class="page-calendar-empty-title">This view needs a Status property.</div>
            <div class="page-calendar-empty-copy">Add a Status property first, then the board can group rows into columns.</div>
          </div>
        `,
        metaText: `${visibleRows.length} row${visibleRows.length === 1 ? "" : "s"} in this view`,
        monthLabel: "Board view"
      };
    }

    const dateProperty = getDateProperty(database);
    const tagProperty = database.properties.find((property) => property.type === "tag") || null;
    const columns = getBoardColumns(database, visibleRows, statusProperty);
    const boardSize = getBoardCardSize(database);
    const boardLayout = getBoardCardLayout(database);
    const boardPreview = getBoardCardPreviewMode(database);

    return {
      weekdaysHTML: "",
      bodyHTML: `
        <div class="page-database-board size-${escapeHTML(boardSize)} layout-${escapeHTML(boardLayout)} preview-${escapeHTML(boardPreview)}">
          ${columns.map((column) => `
            <div class="page-database-board-column" data-status-prop-id="${escapeHTML(statusProperty.id)}" data-status-value="${escapeHTML(column.value)}">
              <div class="page-database-board-column-head">
                <div class="page-database-board-column-title">
                  <span class="page-database-color-swatch${column.colorClass ? ` ${escapeHTML(column.colorClass)}` : ""}"></span>
                  <span>${escapeHTML(column.label)}</span>
                </div>
                <span class="page-database-board-column-count">${column.rows.length}</span>
              </div>
              <div class="page-database-board-column-body">
                ${column.rows.length
                  ? column.rows.map((row) => buildBoardCardHTML(database, row, dateProperty, tagProperty)).join("")
                  : `<div class="page-database-board-empty">No rows</div>`}
              </div>
              ${readOnly ? "" : `
                <button
                  type="button"
                  class="page-database-board-add-btn"
                  data-db-action="add-row"
                  data-status-prop-id="${escapeHTML(statusProperty.id)}"
                  data-status-value="${escapeHTML(column.value)}"
                >+ New</button>
              `}
            </div>
          `).join("")}
        </div>
      `,
      metaText: `${visibleRows.length} row${visibleRows.length === 1 ? "" : "s"} in this view`,
      monthLabel: "Board view"
    };
  }

  function buildPageEditorHTML(database) {
    return database.view === "calendar"
      ? buildPageCalendarShellHTML(database)
      : database.view === "board"
        ? buildBoardViewHTML(database).bodyHTML
      : buildPageTableEditorHTML(database);
  }

  function buildTableViewHTML(database, options = {}) {
    const readOnly = !!options.readOnly;
    const visibleProperties = getVisibleTableProperties(database).slice(0, 4);

    if (!visibleProperties.length) {
      return {
        weekdaysHTML: "",
        bodyHTML: `
          <div class="page-calendar-empty">
            <div class="page-calendar-empty-title">All table properties are hidden.</div>
            <div class="page-calendar-empty-copy">Open Settings and change Property visibility to show columns again.</div>
          </div>
        `,
        metaText: `${database.rows.length} row${database.rows.length === 1 ? "" : "s"} in this view`,
        monthLabel: "Table view"
      };
    }

    const gridTemplate = visibleProperties.map((property) => {
      if (property.type === "title") return "minmax(180px, 1.4fr)";
      if (property.type === "notes") return "minmax(180px, 1.3fr)";
      return "minmax(120px, 1fr)";
    }).join(" ");

    const rowsHTML = database.rows.length
      ? database.rows.map((row) => `
          <div class="page-calendar-row" data-item-id="${escapeHTML(row.id)}" draggable="true" style="grid-template-columns:${gridTemplate}; min-width: 100%;">
            ${visibleProperties.map((property, index) => {
              const rawValue = property.type === "summary"
                ? getComputedPropertyRawValue(database, row, property)
                : property.type === "relation"
                  ? getComparablePropertyValue(database, row, property)
                  : getRowValue(row, property.id);
              const formatted = formatCellDisplay(property, rawValue);
              const className = index === 0 ? "page-calendar-row-title" : "";
              return `<span class="${className}">${escapeHTML(formatted)}</span>`;
            }).join("")}
          </div>
        `).join("")
      : `
          <div class="page-calendar-empty">
            <div class="page-calendar-empty-title">This view is empty.</div>
            <div class="page-calendar-empty-copy">Rows are created on the source database page and can be shown here as a view.</div>
            ${readOnly ? "" : `<button type="button" class="page-calendar-add-btn" data-db-action="add-row">+ New row</button>`}
          </div>
        `;

    return {
      weekdaysHTML: "",
      bodyHTML: `
        <div class="page-calendar-table">
          <div class="page-calendar-row page-calendar-row-head" style="grid-template-columns:${gridTemplate}; min-width: 100%;">
            ${visibleProperties.map((property) => `<span>${escapeHTML(property.name)}</span>`).join("")}
          </div>
          ${rowsHTML}
        </div>
      `,
      metaText: `${database.rows.length} row${database.rows.length === 1 ? "" : "s"} in this view`,
      monthLabel: "Table view"
    };
  }

  function buildCalendarViewHTML(database) {
    const dateProperty = getDateProperty(database);
    if (!dateProperty) {
      return {
        weekdaysHTML: "",
        bodyHTML: `
          <div class="page-calendar-empty">
            <div class="page-calendar-empty-title">This view needs a Date property.</div>
            <div class="page-calendar-empty-copy">Add a Date property on the source database page, then the calendar can place rows on days.</div>
          </div>
        `,
        metaText: `${database.rows.length} row${database.rows.length === 1 ? "" : "s"} in this view`,
        monthLabel: "Calendar view"
      };
    }

    const monthKey = normalizeMonthKey(database.month);
    const [yearText, monthText] = monthKey.split("-");
    const monthDate = new Date(Number(yearText), Number(monthText) - 1, 1);
    const startDate = new Date(monthDate);
    startDate.setDate(1 - monthDate.getDay());
    const todayKey = toDayKey(new Date());
    const rowsByDay = new Map();

    database.rows.forEach((row) => {
      const dayKey = getDateStartValue(getRowValue(row, dateProperty.id));
      if (!dayKey) return;
      if (!rowsByDay.has(dayKey)) rowsByDay.set(dayKey, []);
      rowsByDay.get(dayKey).push(row);
    });

    const weekdaysHTML = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      .map((label) => `<span>${label}</span>`)
      .join("");

    const daysHTML = Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(startDate);
      cellDate.setDate(startDate.getDate() + index);
      const dayKey = toDayKey(cellDate);
      const rows = (rowsByDay.get(dayKey) || []).slice().sort((left, right) => getRowTitle(database, left).localeCompare(getRowTitle(database, right)));
      const isOutside = cellDate.getMonth() !== monthDate.getMonth();
      const isToday = dayKey === todayKey;
      const visibleItems = rows.slice(0, 3).map((row) => `
        <div class="page-calendar-event" data-item-id="${escapeHTML(row.id)}" draggable="true">
          <span class="page-calendar-event-title">${escapeHTML(getRowTitle(database, row))}</span>
          <span class="page-calendar-event-props">${buildRowChipsHTML(database, row)}</span>
        </div>
      `).join("");

      return `
        <div class="page-calendar-day${isOutside ? " outside" : ""}${isToday ? " today" : ""}" data-calendar-date="${dayKey}">
          <div class="page-calendar-day-top">
            <span class="page-calendar-day-number">${cellDate.getDate()}</span>
            ${rows.length ? `<span class="page-calendar-day-count">${rows.length}</span>` : ""}
          </div>
          <div class="page-calendar-day-events">
            ${visibleItems}
            <button type="button" class="page-calendar-add-inline" data-db-action="add-row" data-date="${dayKey}">+ New</button>
            ${rows.length > 3 ? `<div class="page-calendar-more">+${rows.length - 3} more</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    return {
      weekdaysHTML,
      bodyHTML: daysHTML,
      metaText: `${database.rows.length} row${database.rows.length === 1 ? "" : "s"} in this view`,
      monthLabel: formatMonthLabel(monthKey)
    };
  }

  function autoGrowDatabaseTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 34)}px`;
  }

  function autoGrowDatabaseTextareas(surfaceEl) {
    surfaceEl?.querySelectorAll?.(".page-db-cell-textarea")?.forEach(autoGrowDatabaseTextarea);
  }

  function applyFrozenColumns(surfaceEl, database) {
    const tableShell = surfaceEl?.querySelector?.(".page-database-table-editor");
    if (!tableShell) return;

    tableShell.querySelectorAll("[data-db-prop-col]").forEach((node) => {
      node.classList.remove("is-frozen-active");
      node.style.position = "";
      node.style.left = "";
      node.style.zIndex = "";
    });

    (database.frozenPropertyIds || []).forEach((propertyId) => {
      const headerCell = tableShell.querySelector(`.page-database-row-head [data-db-prop-col="${propertyId}"]`);
      if (!headerCell) return;
      const stickyLeft = headerCell.offsetLeft;
      tableShell.querySelectorAll(`[data-db-prop-col="${propertyId}"]`).forEach((node) => {
        node.classList.add("is-frozen-active");
        node.style.position = "sticky";
        node.style.left = `${stickyLeft}px`;
        node.style.zIndex = node.classList.contains("page-database-col-head-wrap") ? "6" : "4";
      });
    });
  }

  function refreshPropertyPanel(context, database, propertyId = "") {
    const panel = document.getElementById(PROPERTY_PANEL_ID);
    const property = getPropertyById(database, propertyId);
    if (!panel || !property || !["status", "select", "relation", "summary", "formula"].includes(property.type)) return;
    panel.dataset.propertyId = propertyId;
    panel.innerHTML = property.type === "status"
      ? buildStatusPropertyPanelHTML(property, database)
      : property.type === "select"
        ? buildSelectPropertyPanelHTML(property, database)
        : property.type === "relation"
          ? buildRelationPropertyPanelHTML(property, database)
          : property.type === "summary"
            ? buildSummaryPropertyPanelHTML(property, database)
            : buildFormulaPropertyPanelHTML(property, database);
  }

  function closeDatabaseMenus() {
    document.getElementById(DATABASE_MENU_ID)?.remove();
    document.getElementById(DATABASE_SUBMENU_ID)?.remove();
    document.getElementById(ROW_MENU_ID)?.remove();
    document.getElementById(PROPERTY_COMPOSER_ID)?.remove();
    document.getElementById(PROPERTY_PANEL_ID)?.remove();
  }

  function positionDatabaseFloatingEl(floatingEl, anchorEl, { align = "left", offset = 6 } = {}) {
    if (!floatingEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const width = floatingEl.offsetWidth || 280;
    const height = floatingEl.offsetHeight || 240;
    const viewportPadding = 12;

    let left = rect.left;
    let top = rect.bottom + offset;

    if (align === "right") {
      left = rect.right - width;
    }

    if (align === "submenu-right") {
      left = rect.right + offset;
      top = rect.top;
      if (left + width > window.innerWidth - viewportPadding) {
        left = rect.left - width - offset;
      }
    }

    left = Math.max(viewportPadding, Math.min(window.innerWidth - width - viewportPadding, left));

    if (align === "submenu-right") {
      top = Math.max(viewportPadding, Math.min(window.innerHeight - height - viewportPadding, top));
    } else if (top + height > window.innerHeight - viewportPadding) {
      top = Math.max(viewportPadding, rect.top - height - offset);
    }

    floatingEl.style.left = `${left}px`;
    floatingEl.style.top = `${top}px`;
  }

  function mountDatabaseFloatingEl(id, className, anchorEl, { align = "left", offset = 6, closeAll = true } = {}) {
    if (closeAll) closeDatabaseMenus();
    else document.getElementById(id)?.remove();
    const floatingEl = document.createElement("div");
    floatingEl.id = id;
    floatingEl.className = className;
    floatingEl.addEventListener("mousedown", (event) => event.stopPropagation());
    document.body.appendChild(floatingEl);
    positionDatabaseFloatingEl(floatingEl, anchorEl, { align, offset });
    return floatingEl;
  }

  function appendMenuLabel(menuEl, text) {
    const el = document.createElement("div");
    el.className = "topbar-dropdown-label";
    el.textContent = text;
    menuEl.appendChild(el);
  }

  function appendMenuDivider(menuEl) {
    const el = document.createElement("div");
    el.className = "topbar-dropdown-divider";
    menuEl.appendChild(el);
  }

  function appendMenuButton(menuEl, label, onClick, options = {}) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `topbar-dropdown-btn${options.danger ? " danger" : ""}${options.active ? " active" : ""}`;
    el.textContent = label;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick?.();
    });
    menuEl.appendChild(el);
    return el;
  }

  function appendMenuSubmenuButton(menuEl, label, onOpen, options = {}) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `topbar-dropdown-btn topbar-dropdown-submenu-btn${options.active ? " active" : ""}`;
    el.innerHTML = `<span>${escapeHTML(label)}</span><span class="topbar-dropdown-submenu-arrow">›</span>`;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpen?.(el);
    });
    menuEl.appendChild(el);
    return el;
  }

  function openPropertySubmenu(anchorEl, label, buildItems) {
    const submenuEl = mountDatabaseFloatingEl(DATABASE_SUBMENU_ID, "topbar-dropdown page-database-floating-menu page-database-submenu", anchorEl, {
      align: "submenu-right",
      offset: 4,
      closeAll: false
    });
    appendMenuLabel(submenuEl, label);
    buildItems?.(submenuEl);
    return submenuEl;
  }

  function openRowMenu(anchorEl, context, database, rowId = "") {
    const row = getRowById(database, rowId);
    if (!row) return;
    const menuEl = mountDatabaseFloatingEl(ROW_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, {
      align: "right",
      closeAll: false
    });
    appendMenuSubmenuButton(menuEl, "Color", (buttonEl) => {
      openPropertySubmenu(buttonEl, "Row color", (submenuEl) => {
        appendMenuButton(submenuEl, "Clear color", () => {
          setRowColor(database, rowId, "");
          saveDatabaseForContext(context, database);
          rerenderCalendarContext(context);
          closeDatabaseMenus();
        }, { active: !row.color });
        appendMenuDivider(submenuEl);
        STATUS_COLOR_OPTIONS.forEach((entry) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `topbar-dropdown-btn page-database-color-option${row.color === entry.value ? " active" : ""}`;
          button.innerHTML = `<span class="page-database-color-option-main"><span class="page-database-color-swatch ${escapeHTML(statusClassName(entry.value))}"></span><span>${escapeHTML(entry.label)}</span></span>`;
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            setRowColor(database, rowId, entry.value);
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          });
          submenuEl.appendChild(button);
        });
      });
    }, { active: !!row.color });
    appendMenuButton(menuEl, "Duplicate", () => {
      const nextRow = duplicateRowInDatabase(database, rowId);
      saveDatabaseForContext(context, database);
      if (context.kind === "page" && nextRow) {
        pendingDatabaseFocus = {
          context,
          rowId: nextRow.id,
          propId: getTitleProperty(database).id
        };
      }
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    });
    appendMenuButton(menuEl, "Delete", () => {
      syncRowBacklinksOnDelete(getContextDatabaseSource(context), database, row);
      deleteRowFromDatabase(database, rowId);
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { danger: true });
  }

  function openPropertyIconMenu(anchorEl, context, database, propertyId = "", options = {}) {
    const property = getPropertyById(database, propertyId);
    if (!property) return;

    const closeIconMenus = () => {
      document.getElementById(DATABASE_MENU_ID)?.remove();
      document.getElementById(DATABASE_SUBMENU_ID)?.remove();
      document.getElementById(ROW_MENU_ID)?.remove();
    };

    openPropertySubmenu(anchorEl, "Icon", (submenuEl) => {
      appendMenuButton(submenuEl, "Hide icon", () => {
        setPropertyIcon(database, propertyId, property.icon || "", { show: false });
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        options.onChange?.();
        closeIconMenus();
      }, { active: property.showIcon === false });
      appendMenuButton(submenuEl, "Use default", () => {
        setPropertyIcon(database, propertyId, "", { show: true });
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        options.onChange?.();
        closeIconMenus();
      }, { active: property.showIcon !== false && !String(property.icon || "").trim() });
      appendMenuButton(submenuEl, "Custom...", () => {
        const nextIcon = window.prompt?.("Enter an icon or short label", getPropertyIcon(property) || getPropertyDefaultIcon(property)) || "";
        if (!String(nextIcon).trim()) return;
        setPropertyIcon(database, propertyId, nextIcon, { show: true });
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        options.onChange?.();
        closeIconMenus();
      });
      appendMenuDivider(submenuEl);
      PROPERTY_ICON_PRESETS.forEach((entry) => {
        appendMenuButton(submenuEl, `${entry.value} ${entry.label}`, () => {
          setPropertyIcon(database, propertyId, entry.value, { show: true });
          saveDatabaseForContext(context, database);
          rerenderCalendarContext(context);
          options.onChange?.();
          closeIconMenus();
        }, { active: property.showIcon !== false && String(property.icon || "").trim() === entry.value });
      });
    });
  }

  function startColumnResize(handleEl, event) {
    const context = getCalendarContext(handleEl);
    if (!context) return;
    const database = getDatabaseForContext(context);
    const propertyId = handleEl.dataset.propId || "";
    const property = getPropertyById(database, propertyId);
    if (!property) return;

    activeColumnResize = {
      context,
      database,
      propertyId,
      startX: event?.clientX || 0,
      startWidth: database.columnWidths?.[propertyId] || getDefaultPropertyWidth(property)
    };
    document.body.classList.add("db-column-resizing");
  }

  function openViewMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl);
    appendMenuLabel(menuEl, "View");
    appendMenuButton(menuEl, "Table", () => {
      database.view = "table";
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: database.view === "table" });
    if (context.kind === "page") {
      appendMenuButton(menuEl, "Calendar", () => {
        database.view = "calendar";
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        closeDatabaseMenus();
      }, { active: database.view === "calendar" });
    }
    appendMenuButton(menuEl, "Board", () => {
      database.view = "board";
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: database.view === "board" });
  }

  function getInlineDatabaseHost(context) {
    return context?.surfaceEl || context?.blockEl || document.getElementById(context?.blockId || "");
  }

  function setInlineDatabaseSource(hostEl, source) {
    if (!hostEl) return;
    setEmbedSourceTarget(hostEl, source);
    const sourceDatabase = source ? getDatabaseFromSource(source) : null;
    hostEl.dataset.calendarTitle = sourceDatabase?.title || getInlineDatabaseSourceLabel(source) || "Database";
    hostEl.dataset.calendarView = normalizeEmbedView(hostEl.dataset.calendarView || "table", "table");
    saveBlockDatabase(hostEl, getBlockDatabase(hostEl));
  }

  function createInlineDatabasePage(context, options = {}) {
    const hostEl = getInlineDatabaseHost(context);
    if (!hostEl) return null;

    const createPageFn = typeof window.createPage === "function"
      ? window.createPage
      : (typeof createPage === "function" ? createPage : null);
    if (typeof createPageFn !== "function") return null;

    const parentPageId = context?.pageId || getCurrentPageId();
    const page = createPageFn("New database", parentPageId, "sheet", "none", "page");
    if (!page?.id) return null;

    savePageDatabase(page.id, normalizeDatabase({
      title: page.title,
      view: "table",
      properties: [createNameProperty()],
      rows: []
    }, { defaultView: "table" }));

    setInlineDatabaseSource(hostEl, { kind: "page", pageId: page.id, blockId: "" });
    rerenderCalendarContext({
      kind: "block",
      blockId: hostEl.id || "",
      blockEl: hostEl,
      surfaceEl: hostEl
    });

    if (options.openAsPage) {
      const openPageFn = typeof window.openPage === "function"
        ? window.openPage
        : (typeof openPage === "function" ? openPage : null);
      openPageFn?.(page.id);
    }

    return page;
  }

  function appendInlineSourceMenuItems(menuEl, context) {
    const hostEl = getInlineDatabaseHost(context);
    const currentSource = getEmbedSourceTarget(hostEl);
    const pageSources = getDatabasePageSources();

    appendMenuButton(menuEl, "New database", () => {
      createInlineDatabasePage(context);
      closeDatabaseMenus();
    });

    if (pageSources.length) {
      appendMenuDivider(menuEl);
      pageSources.forEach((source) => {
        appendMenuButton(menuEl, source.label, () => {
          setInlineDatabaseSource(hostEl, source);
          rerenderCalendarContext(context);
          closeDatabaseMenus();
        }, { active: getDatabaseSourceKey(source) === getDatabaseSourceKey(currentSource || {}) });
      });
      return;
    }

    appendMenuLabel(menuEl, "No database pages yet");
  }

  function openInlineSourceMenu(anchorEl, context, options = {}) {
    if (options.submenu) {
      return openPropertySubmenu(anchorEl, "Source", (submenuEl) => {
        appendInlineSourceMenuItems(submenuEl, context);
      });
    }

    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu page-database-embed-picker", anchorEl, {
      align: "left",
      closeAll: true
    });
    appendMenuLabel(menuEl, "Source");
    appendInlineSourceMenuItems(menuEl, context);
    return menuEl;
  }

  function openInlineViewMenu(anchorEl, context, database) {
    const hostEl = getInlineDatabaseHost(context);
    const source = getEmbedSourceTarget(hostEl);
    const activeView = normalizeEmbedView(database.view, "table");
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, { align: "right" });

    appendMenuLabel(menuEl, getInlineViewLabel(activeView));

    if (source?.kind === "page") {
      appendMenuButton(menuEl, "Rename", () => {
        closeDatabaseMenus();
        if (typeof window.openRenameModal === "function") {
          window.openRenameModal(source.pageId, getPageTitleText(source.pageId, "Untitled"));
        }
      });
    }

    appendMenuSubmenuButton(menuEl, "Edit view", (submenuAnchor) => {
      openPropertySubmenu(submenuAnchor, "Edit view", (submenuEl) => {
        appendMenuButton(submenuEl, "Table", () => {
          database.view = "table";
          saveDatabaseForContext(context, database);
          rerenderCalendarContext(context);
          closeDatabaseMenus();
        }, { active: activeView === "table" });
        appendMenuButton(submenuEl, "Board", () => {
          database.view = "board";
          saveDatabaseForContext(context, database);
          rerenderCalendarContext(context);
          closeDatabaseMenus();
        }, { active: activeView === "board" });
      });
    });

    appendMenuSubmenuButton(menuEl, "Source", (submenuAnchor) => {
      openInlineSourceMenu(submenuAnchor, context, { submenu: true });
    });
  }

  function openInlinePageMenu(anchorEl, context) {
    const hostEl = getInlineDatabaseHost(context);
    const source = getEmbedSourceTarget(hostEl);
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, {
      align: "left",
      closeAll: true
    });

    appendMenuLabel(menuEl, "Page");

    if (source?.kind === "page") {
      appendMenuButton(menuEl, "Open as page", () => {
        closeDatabaseMenus();
        if (typeof window.openPage === "function") {
          window.openPage(source.pageId);
        }
      });
      return;
    }

    appendMenuButton(menuEl, "New database", () => {
      createInlineDatabasePage(context);
      closeDatabaseMenus();
    });
    appendMenuButton(menuEl, "Link existing", () => {
      closeDatabaseMenus();
      openInlineSourceMenu(anchorEl, context);
    });
  }

  function openEmbedPicker(anchorEl, context) {
    return openInlineSourceMenu(anchorEl, context);
  }

  function renderVisibleDatabaseEmbeds() {
    document.querySelectorAll('.block[data-type="calendar"]').forEach((hostEl) => {
      renderDatabaseSurface(hostEl, getBlockDatabase(hostEl));
    });
  }

  function getDatabaseViewLabel(database) {
    return database.view === "calendar"
      ? "Calendar"
      : database.view === "board"
        ? "Board"
        : "Table";
  }

  function openPropertyVisibilityMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_SUBMENU_ID, "topbar-dropdown page-database-floating-menu page-database-submenu page-database-visibility-menu", anchorEl, {
      align: "submenu-right",
      offset: 4,
      closeAll: false
    });

    menuEl.innerHTML = `
      <div class="page-database-visibility-head">Property visibility</div>
      <input class="page-database-menu-name-input page-database-visibility-search" type="text" placeholder="Search for a property..." autocomplete="off" />
      <div class="page-database-visibility-toolbar">
        <span class="page-database-visibility-caption">Shown in table</span>
        <button type="button" class="page-database-visibility-link"></button>
      </div>
      <div class="page-database-visibility-list"></div>
    `;

    const searchEl = menuEl.querySelector(".page-database-visibility-search");
    const toggleAllEl = menuEl.querySelector(".page-database-visibility-link");
    const listEl = menuEl.querySelector(".page-database-visibility-list");

    const persistAndRefresh = () => {
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      positionDatabaseFloatingEl(menuEl, anchorEl, { align: "submenu-right", offset: 4 });
    };

    const renderList = () => {
      const query = String(searchEl?.value || "").trim().toLowerCase();
      const visibleCount = getVisibleTableProperties(database).length;
      const hasHidden = visibleCount !== database.properties.length;
      toggleAllEl.textContent = hasHidden ? "Show all" : "Hide all";

      const matchingProperties = database.properties.filter((property) => {
        const propertyText = `${property.name} ${getPropertyTypeLabel(property.type)}`.toLowerCase();
        return !query || propertyText.includes(query);
      });

      listEl.innerHTML = "";
      if (!matchingProperties.length) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "page-database-visibility-empty";
        emptyEl.textContent = "No properties match your search.";
        listEl.appendChild(emptyEl);
        positionDatabaseFloatingEl(menuEl, anchorEl, { align: "submenu-right", offset: 4 });
        return;
      }

      matchingProperties.forEach((property) => {
        const isVisible = isPropertyVisibleInTable(property);
        const itemEl = document.createElement("button");
        itemEl.type = "button";
        itemEl.className = `page-database-visibility-item${isVisible ? " is-visible" : " is-hidden"}`;
        itemEl.innerHTML = `
          <span class="page-database-visibility-item-main">
            ${buildPropertyIconHTML(property)}
            <span class="page-database-visibility-item-labels">
              <span class="page-database-visibility-item-name">${escapeHTML(property.name)}</span>
              <span class="page-database-visibility-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
            </span>
          </span>
          <span class="page-database-visibility-item-state" aria-hidden="true">${isVisible ? "●" : "○"}</span>
        `;
        itemEl.addEventListener("click", (event) => {
          event.stopPropagation();
          setPropertyVisibility(database, property.id, !isVisible);
          persistAndRefresh();
          renderList();
        });
        listEl.appendChild(itemEl);
      });

      positionDatabaseFloatingEl(menuEl, anchorEl, { align: "submenu-right", offset: 4 });
    };

    searchEl?.addEventListener("input", renderList);
    toggleAllEl?.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldShowAll = getVisibleTableProperties(database).length !== database.properties.length;
      setAllPropertyVisibility(database, shouldShowAll);
      persistAndRefresh();
      renderList();
    });

    renderList();
    requestAnimationFrame(() => searchEl?.focus());
    return menuEl;
  }

  function openDatabaseSummaryMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu page-database-settings-menu", anchorEl, { align: "submenu-right", offset: 4 });
    const hasFilters = Array.isArray(database.filters) && database.filters.length > 0;
    const hasSorts = Array.isArray(database.sorts) && database.sorts.length > 0;
    const hasGrouping = !!database.groupBy;
    const hasFrozen = Array.isArray(database.frozenPropertyIds) && database.frozenPropertyIds.length > 0;
    const hasCalculations = Object.keys(database.calculations || {}).length > 0;
    const visiblePropertyCount = getVisibleTableProperties(database).length;

    appendMenuLabel(menuEl, "View settings");
    appendMenuButton(menuEl, `View: ${getDatabaseViewLabel(database)}`, () => {
      openViewMenu(anchorEl, context, database);
    });
    if (database.view === "board") {
      appendMenuSubmenuButton(menuEl, "Layout", (buttonEl) => {
        openBoardLayoutSettingsMenu(buttonEl, context, database);
      });
    }
    appendMenuSubmenuButton(menuEl, `Property visibility (${visiblePropertyCount}/${database.properties.length})`, (buttonEl) => {
      openPropertyVisibilityMenu(buttonEl, context, database);
    });
    appendMenuButton(menuEl, `Filter${hasFilters ? ` (${database.filters.length})` : ""}`, () => {
      openDatabaseFilterMenu(anchorEl, context, database);
    }, { active: hasFilters });
    appendMenuButton(menuEl, `Sort${hasSorts ? ` (${database.sorts.length})` : ""}`, () => {
      openDatabaseSortMenu(anchorEl, context, database);
    }, { active: hasSorts });
    appendMenuButton(menuEl, `Group${hasGrouping ? ": On" : ""}`, () => {
      openDatabaseGroupMenu(anchorEl, context, database);
    }, { active: hasGrouping });
    appendMenuSubmenuButton(menuEl, `Edit properties (${database.properties.length})`, (buttonEl) => {
      openPropertySubmenu(buttonEl, "Edit properties", (submenuEl) => {
        database.properties.forEach((property) => {
          appendMenuButton(submenuEl, property.name, () => {
            closeDatabaseMenus();
            const propertyAnchor = findPropertyHeaderButton(context, property.id) || anchorEl;
            openPropertyMenu(propertyAnchor, context, database, property.id);
          });
        });
        appendMenuDivider(submenuEl);
        appendMenuButton(submenuEl, "Add property", () => {
          closeDatabaseMenus();
          openPropertyComposer(anchorEl, context, database);
        });
      });
    });

    appendMenuDivider(menuEl);
    appendMenuLabel(menuEl, "Cleanup");
    appendMenuButton(menuEl, "Clear Filters", () => {
      database.filters = [];
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: hasFilters });
    appendMenuButton(menuEl, "Clear Sorts", () => {
      database.sorts = [];
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: hasSorts });
    appendMenuButton(menuEl, "Clear Grouping", () => {
      database.groupBy = "";
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: hasGrouping });
    appendMenuButton(menuEl, "Clear Frozen Columns", () => {
      database.frozenPropertyIds = [];
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: hasFrozen });
    appendMenuButton(menuEl, "Clear Calculations", () => {
      database.calculations = {};
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: hasCalculations });
  }

  function openDatabaseFilterMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, { align: "right" });
    appendMenuLabel(menuEl, "Filter");
    if ((database.filters || []).length) {
      appendMenuButton(menuEl, "Clear all filters", () => {
        database.filters = [];
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        closeDatabaseMenus();
      });
      appendMenuDivider(menuEl);
    }

    database.properties.forEach((property) => {
      appendMenuSubmenuButton(menuEl, property.name, (buttonEl) => {
        openPropertySubmenu(buttonEl, property.name, (submenuEl) => {
          appendMenuButton(submenuEl, "Filter empty", () => {
            const active = getPropertyFilter(database, property.id)?.mode === "empty";
            setPropertyFilter(database, property.id, active ? "" : "empty", "");
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          }, { active: getPropertyFilter(database, property.id)?.mode === "empty" });

          appendMenuButton(submenuEl, "Clear filter", () => {
            setPropertyFilter(database, property.id, "", "");
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          }, { active: !getPropertyFilter(database, property.id) });

          getDistinctPropertyValues(database, property.id).slice(0, 6).forEach((value) => {
            const active = getPropertyFilter(database, property.id)?.mode === "equals" && getPropertyFilter(database, property.id)?.value === value;
            appendMenuButton(submenuEl, formatCellDisplay(property, value), () => {
              setPropertyFilter(database, property.id, active ? "" : "equals", value);
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              closeDatabaseMenus();
            }, { active });
          });
        });
      }, { active: !!getPropertyFilter(database, property.id) });
    });
  }

  function openDatabaseSortMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, { align: "right" });
    appendMenuLabel(menuEl, "Sort");
    if ((database.sorts || []).length) {
      appendMenuButton(menuEl, "Clear all sorts", () => {
        database.sorts = [];
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        closeDatabaseMenus();
      });
      appendMenuDivider(menuEl);
    }

    database.properties.forEach((property) => {
      appendMenuSubmenuButton(menuEl, property.name, (buttonEl) => {
        openPropertySubmenu(buttonEl, property.name, (submenuEl) => {
          appendMenuButton(submenuEl, "Ascending", () => {
            setPropertySort(database, property.id, "asc");
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          }, { active: getPropertySort(database, property.id)?.direction === "asc" });
          appendMenuButton(submenuEl, "Descending", () => {
            setPropertySort(database, property.id, "desc");
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          }, { active: getPropertySort(database, property.id)?.direction === "desc" });
          appendMenuButton(submenuEl, "Clear sort", () => {
            setPropertySort(database, property.id, "");
            saveDatabaseForContext(context, database);
            rerenderCalendarContext(context);
            closeDatabaseMenus();
          }, { active: !getPropertySort(database, property.id) });
        });
      }, { active: !!getPropertySort(database, property.id) });
    });
  }

  function openDatabaseGroupMenu(anchorEl, context, database) {
    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "topbar-dropdown page-database-floating-menu", anchorEl, { align: "right" });
    appendMenuLabel(menuEl, "Group");
    appendMenuButton(menuEl, "No grouping", () => {
      database.groupBy = "";
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    }, { active: !database.groupBy });
    appendMenuDivider(menuEl);
    database.properties.forEach((property) => {
      appendMenuButton(menuEl, property.name, () => {
        database.groupBy = database.groupBy === property.id ? "" : property.id;
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        closeDatabaseMenus();
      }, { active: database.groupBy === property.id });
    });
  }

  function openPropertyComposer(anchorEl, context, database, options = {}) {
    const insertIndex = Number.isInteger(options.insertIndex) ? options.insertIndex : database.properties.length;
    const composerEl = mountDatabaseFloatingEl(PROPERTY_COMPOSER_ID, "page-database-composer topbar-dropdown", anchorEl);
    composerEl.innerHTML = `
      <div class="page-database-composer-head">New property</div>
      <input class="page-database-composer-input" type="text" placeholder="Type property name..." autocomplete="off" />
      <div class="page-database-composer-types"></div>
    `;

    const inputEl = composerEl.querySelector(".page-database-composer-input");
    const typesEl = composerEl.querySelector(".page-database-composer-types");

    const commit = (type) => {
      const propertyId = createId("prop");
      addPropertyAtIndex(database, {
        id: propertyId,
        name: inputEl?.value || "",
        type
      }, insertIndex);
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      if (["status", "select", "relation", "summary", "formula"].includes(type)) {
        closeDatabaseMenus();
        openPropertyPanel(context, database, propertyId);
        return;
      }
      closeDatabaseMenus();
    };

    PROPERTY_TYPES.forEach((type) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "page-database-type-btn";
      button.innerHTML = `<span class="page-database-type-btn-icon">${getPropertyIcon({ type: type.value })}</span><span>${type.label}</span>`;
      button.addEventListener("click", () => commit(type.value));
      typesEl?.appendChild(button);
    });

    inputEl?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit("text");
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatabaseMenus();
      }
    });

    requestAnimationFrame(() => inputEl?.focus());
  }

  function buildStatusEditorOptionRow(groupIndex, option, optionIndex, defaultName = "") {
    const defaultLabel = defaultName === option.name ? "DEFAULT" : "";
    return `
      <div class="page-database-status-option-row" data-status-group-index="${groupIndex}" data-status-option-index="${optionIndex}">
        <span class="page-database-status-grip">⋮⋮</span>
        <button type="button" class="page-database-status-chip-btn" data-db-action="set-default-status" data-status-group-index="${groupIndex}" data-status-option-index="${optionIndex}">
          ${buildValuePillHTML({ type: "status", statusGroups: [{ id: "preview", label: "Preview", options: [option] }] }, option.name)}
        </button>
        <input class="page-database-status-option-input" type="text" value="${escapeHTML(option.name)}" data-db-action="status-option-name" data-status-group-index="${groupIndex}" data-status-option-index="${optionIndex}" />
        <span class="page-database-status-default-badge${defaultLabel ? " is-active" : ""}">${defaultLabel}</span>
        <button type="button" class="page-database-status-inline-btn" data-db-action="open-status-color-menu" data-status-group-index="${groupIndex}" data-status-option-index="${optionIndex}" aria-label="Choose status color">›</button>
        <button type="button" class="page-database-status-inline-btn danger" data-db-action="delete-status-option" data-status-group-index="${groupIndex}" data-status-option-index="${optionIndex}">×</button>
      </div>
    `;
  }

  function openStatusColorMenu(anchorEl, context, database, propertyId = "", groupIndex = -1, optionIndex = -1) {
    const property = getPropertyById(database, propertyId);
    const option = getPropertyStatusGroups(property)[groupIndex]?.options?.[optionIndex];
    if (!property || property.type !== "status" || !option) return;

    const menuEl = mountDatabaseFloatingEl(DATABASE_SUBMENU_ID, "topbar-dropdown page-database-floating-menu page-database-submenu page-database-color-menu", anchorEl, {
      align: "right",
      offset: 2,
      closeAll: false
    });
    appendMenuLabel(menuEl, "Color");
    STATUS_COLOR_OPTIONS.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `topbar-dropdown-btn page-database-color-option${option.color === entry.value ? " active" : ""}`;
      button.innerHTML = `<span class="page-database-color-option-main"><span class="page-database-color-swatch ${escapeHTML(statusClassName(entry.value))}"></span><span>${escapeHTML(entry.label)}</span></span>`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        setStatusOptionColor(database, propertyId, groupIndex, optionIndex, entry.value);
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        document.getElementById(DATABASE_SUBMENU_ID)?.remove();
      });
      menuEl.appendChild(button);
    });
  }

  function buildStatusPropertyPanelHTML(property, database) {
    const groups = getPropertyStatusGroups(property);
    const defaultName = getDefaultStatusName(property);
    return `
      <div class="page-database-property-panel-backdrop" data-db-action="close-property-panel"></div>
      <aside class="page-database-property-panel-sheet" role="dialog" aria-label="Edit property">
        <div class="page-database-property-panel-header">
          <button type="button" class="page-database-property-panel-back" data-db-action="close-property-panel">←</button>
          <div class="page-database-property-panel-title">Edit property</div>
          <button type="button" class="page-database-property-panel-close" data-db-action="close-property-panel">×</button>
        </div>
        <div class="page-database-property-panel-body">
          <div class="page-database-property-name-row">
            <span class="page-database-menu-head-icon">${getPropertyIcon(property)}</span>
            <input class="page-database-property-panel-name" type="text" value="${escapeHTML(property.name)}" data-db-action="property-panel-name" />
          </div>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-type-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Type</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-icon-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Icon</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyIconLabel(property))}</span>
          </button>
          ${groups.map((group, groupIndex) => `
            <section class="page-database-status-group">
              <div class="page-database-status-group-head">
                <span>${escapeHTML(group.label)}</span>
                <button type="button" class="page-database-status-add-btn" data-db-action="add-status-option" data-status-group-index="${groupIndex}">+</button>
              </div>
              <div class="page-database-status-group-list">
                ${group.options.map((option, optionIndex) => buildStatusEditorOptionRow(groupIndex, option, optionIndex, defaultName)).join("")}
              </div>
            </section>
          `).join("")}
          <div class="page-database-property-panel-divider"></div>
          <button type="button" class="page-database-property-panel-toggle${isPropertyUnwrapped(database, property.id) ? " active" : ""}" data-db-action="toggle-property-wrap" data-prop-id="${escapeHTML(property.id)}">
            <span>Wrap content</span>
            <span class="page-database-menu-toggle-switch"><span></span></span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="duplicate-property-panel" data-prop-id="${escapeHTML(property.id)}">Duplicate property</button>
          <button type="button" class="page-database-property-panel-item danger" data-db-action="delete-property-panel" data-prop-id="${escapeHTML(property.id)}">Delete property</button>
        </div>
      </aside>
    `;
  }

  function buildSelectEditorOptionRow(option, optionIndex) {
    return `
      <div class="page-database-status-option-row page-database-select-option-row" data-select-option-index="${optionIndex}">
        <span class="page-database-status-grip">⋮⋮</span>
        <span class="page-database-status-chip-btn page-database-select-chip-preview">${buildValuePillHTML({ type: "select", selectOptions: [option] }, option.name)}</span>
        <input class="page-database-status-option-input" type="text" value="${escapeHTML(option.name)}" data-db-action="select-option-name" data-select-option-index="${optionIndex}" />
        <span class="page-database-status-default-badge"></span>
        <button type="button" class="page-database-status-inline-btn" data-db-action="open-select-color-menu" data-select-option-index="${optionIndex}" aria-label="Choose select color">›</button>
        <button type="button" class="page-database-status-inline-btn danger" data-db-action="delete-select-option" data-select-option-index="${optionIndex}">×</button>
      </div>
    `;
  }

  function buildSelectPropertyPanelHTML(property, database) {
    const options = getPropertySelectOptions(property);
    return `
      <div class="page-database-property-panel-backdrop" data-db-action="close-property-panel"></div>
      <aside class="page-database-property-panel-sheet" role="dialog" aria-label="Edit property">
        <div class="page-database-property-panel-header">
          <button type="button" class="page-database-property-panel-back" data-db-action="close-property-panel">←</button>
          <div class="page-database-property-panel-title">Edit property</div>
          <button type="button" class="page-database-property-panel-close" data-db-action="close-property-panel">×</button>
        </div>
        <div class="page-database-property-panel-body">
          <div class="page-database-property-name-row">
            <span class="page-database-menu-head-icon">${getPropertyIcon(property)}</span>
            <input class="page-database-property-panel-name" type="text" value="${escapeHTML(property.name)}" data-db-action="property-panel-name" />
          </div>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-type-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Type</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-icon-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Icon</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyIconLabel(property))}</span>
          </button>
          <section class="page-database-status-group page-database-select-group">
            <div class="page-database-status-group-head page-database-select-group-head">
              <span>Options</span>
              <button type="button" class="page-database-status-add-btn" data-db-action="add-select-option">+</button>
            </div>
            <div class="page-database-status-group-list page-database-select-group-list">
              ${options.map((option, optionIndex) => buildSelectEditorOptionRow(option, optionIndex)).join("")}
            </div>
          </section>
          <div class="page-database-property-panel-divider"></div>
          <button type="button" class="page-database-property-panel-toggle${isPropertyUnwrapped(database, property.id) ? " active" : ""}" data-db-action="toggle-property-wrap" data-prop-id="${escapeHTML(property.id)}">
            <span>Wrap content</span>
            <span class="page-database-menu-toggle-switch"><span></span></span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="duplicate-property-panel" data-prop-id="${escapeHTML(property.id)}">Duplicate property</button>
          <button type="button" class="page-database-property-panel-item danger" data-db-action="delete-property-panel" data-prop-id="${escapeHTML(property.id)}">Delete property</button>
        </div>
      </aside>
    `;
  }

  function buildRelationPropertyPanelHTML(property, database) {
    const source = getRelationSource(property);
    return `
      <div class="page-database-property-panel-backdrop" data-db-action="close-property-panel"></div>
      <aside class="page-database-property-panel-sheet" role="dialog" aria-label="Edit property">
        <div class="page-database-property-panel-header">
          <button type="button" class="page-database-property-panel-back" data-db-action="close-property-panel">←</button>
          <div class="page-database-property-panel-title">Edit property</div>
          <button type="button" class="page-database-property-panel-close" data-db-action="close-property-panel">×</button>
        </div>
        <div class="page-database-property-panel-body">
          <div class="page-database-property-name-row">
            <span class="page-database-menu-head-icon">${getPropertyIcon(property)}</span>
            <input class="page-database-property-panel-name" type="text" value="${escapeHTML(property.name)}" data-db-action="property-panel-name" />
          </div>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-type-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Type</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-icon-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Icon</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyIconLabel(property))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-relation-table-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Link</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(source?.label || "Choose table")}</span>
          </button>
          <div class="page-database-property-panel-note">Select another table, then each row can link one or more rows from it.</div>
          <div class="page-database-property-panel-divider"></div>
          <button type="button" class="page-database-property-panel-toggle${isPropertyUnwrapped(database, property.id) ? " active" : ""}" data-db-action="toggle-property-wrap" data-prop-id="${escapeHTML(property.id)}">
            <span>Wrap content</span>
            <span class="page-database-menu-toggle-switch"><span></span></span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="duplicate-property-panel" data-prop-id="${escapeHTML(property.id)}">Duplicate property</button>
          <button type="button" class="page-database-property-panel-item danger" data-db-action="delete-property-panel" data-prop-id="${escapeHTML(property.id)}">Delete property</button>
        </div>
      </aside>
    `;
  }

  function buildSummaryPropertyPanelHTML(property, database) {
    const relationProperty = getSummaryRelationProperty(database, property);
    const targetProperty = getSummaryTargetProperty(database, property);
    const mode = normalizeSummaryMode(property.summaryConfig?.mode || "count");
    const needsTarget = mode === "sum" || mode === "latest-date";
    return `
      <div class="page-database-property-panel-backdrop" data-db-action="close-property-panel"></div>
      <aside class="page-database-property-panel-sheet" role="dialog" aria-label="Edit property">
        <div class="page-database-property-panel-header">
          <button type="button" class="page-database-property-panel-back" data-db-action="close-property-panel">←</button>
          <div class="page-database-property-panel-title">Edit property</div>
          <button type="button" class="page-database-property-panel-close" data-db-action="close-property-panel">×</button>
        </div>
        <div class="page-database-property-panel-body">
          <div class="page-database-property-name-row">
            <span class="page-database-menu-head-icon">${getPropertyIcon(property)}</span>
            <input class="page-database-property-panel-name" type="text" value="${escapeHTML(property.name)}" data-db-action="property-panel-name" />
          </div>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-type-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Type</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-icon-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Icon</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyIconLabel(property))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-summary-relation-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Relation</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(relationProperty?.name || "Choose relation")}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-summary-mode-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Summary</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getSummaryModeLabel(mode))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item${needsTarget ? "" : " is-disabled"}" data-db-action="open-summary-target-property-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Field</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(needsTarget ? (targetProperty?.name || "Choose field") : "Not needed")}</span>
          </button>
          <div class="page-database-property-panel-note">Summary values are computed from the linked rows and update automatically.</div>
          <div class="page-database-property-panel-divider"></div>
          <button type="button" class="page-database-property-panel-item" data-db-action="duplicate-property-panel" data-prop-id="${escapeHTML(property.id)}">Duplicate property</button>
          <button type="button" class="page-database-property-panel-item danger" data-db-action="delete-property-panel" data-prop-id="${escapeHTML(property.id)}">Delete property</button>
        </div>
      </aside>
    `;
  }

  function getFormulaSimpleDescription(property) {
    const config = normalizeFormulaConfig(property?.formulaConfig || {});
    if (config.simpleType === "sum") return "Add up a number field across linked rows.";
    if (config.simpleType === "subtract") return "Show the difference between two number fields on this row.";
    if (config.simpleType === "count") return "Count linked rows, or count linked rows with a checked box.";
    if (config.simpleType === "average") return "Average a number field across linked rows.";
    if (config.simpleType === "percentage") return "Divide one number field by another and show a percent.";
    if (config.simpleType === "days-until-date") return "Count down from today to a date field.";
    if (config.simpleType === "compare") return "Compare two number fields like budget and actual.";
    if (config.simpleType === "auto-complete") return "Show Complete when a checkbox on this row is checked.";
    return "Choose what this formula should do.";
  }

  function buildFormulaPropertyPanelHTML(property, database) {
    const config = normalizeFormulaConfig(property.formulaConfig || {});
    const simpleType = normalizeFormulaSimpleType(config.simpleType || "sum");
    const relationProperty = getPropertyById(database, config.relationPropertyId || "");
    const targetNumberProperty = relationProperty ? getFormulaRelatedFieldCandidates(database, property, "number").find((entry) => entry.id === config.targetPropertyId) : null;
    const targetCheckboxProperty = simpleType === "auto-complete"
      ? getFormulaCheckboxCandidates(database, property.id).find((entry) => entry.id === config.checkboxPropertyId)
      : (relationProperty ? getFormulaRelatedFieldCandidates(database, property, "checkbox").find((entry) => entry.id === config.checkboxPropertyId) : null);
    const leftProperty = getPropertyById(database, config.leftPropertyId || "");
    const rightProperty = getPropertyById(database, config.rightPropertyId || "");
    const dateProperty = getPropertyById(database, config.datePropertyId || "");
    const needsRelation = ["sum", "count", "average"].includes(simpleType);
    const needsRelatedNumber = ["sum", "average"].includes(simpleType);
    const needsCheckbox = ["count", "auto-complete"].includes(simpleType);
    const needsPair = ["subtract", "percentage", "compare"].includes(simpleType);
    const needsDate = simpleType === "days-until-date";
    return `
      <div class="page-database-property-panel-backdrop" data-db-action="close-property-panel"></div>
      <aside class="page-database-property-panel-sheet" role="dialog" aria-label="Edit property">
        <div class="page-database-property-panel-header">
          <button type="button" class="page-database-property-panel-back" data-db-action="close-property-panel">←</button>
          <div class="page-database-property-panel-title">Edit property</div>
          <button type="button" class="page-database-property-panel-close" data-db-action="close-property-panel">×</button>
        </div>
        <div class="page-database-property-panel-body">
          <div class="page-database-property-name-row">
            <span class="page-database-menu-head-icon">${getPropertyIcon(property)}</span>
            <input class="page-database-property-panel-name" type="text" value="${escapeHTML(property.name)}" data-db-action="property-panel-name" />
          </div>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-type-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Type</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyTypeLabel(property.type))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="open-property-icon-menu" data-prop-id="${escapeHTML(property.id)}">
            <span>Icon</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(getPropertyIconLabel(property))}</span>
          </button>
          <button type="button" class="page-database-property-panel-item" data-db-action="toggle-formula-mode" data-prop-id="${escapeHTML(property.id)}">
            <span>Mode</span>
            <span class="page-database-property-panel-item-meta">${escapeHTML(config.mode === "advanced" ? "Advanced" : "Simple")}</span>
          </button>
          ${config.mode === "simple" ? `
            <button type="button" class="page-database-property-panel-item" data-db-action="open-formula-simple-type-menu" data-prop-id="${escapeHTML(property.id)}">
              <span>What should this do?</span>
              <span class="page-database-property-panel-item-meta">${escapeHTML(getFormulaSimpleTypeLabel(simpleType))}</span>
            </button>
            ${needsRelation ? `
              <button type="button" class="page-database-property-panel-item" data-db-action="open-formula-relation-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>Look at this link field</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(relationProperty?.name || "Choose link field")}</span>
              </button>
            ` : ""}
            ${needsRelatedNumber ? `
              <button type="button" class="page-database-property-panel-item${relationProperty ? "" : " is-disabled"}" data-db-action="open-formula-target-number-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>Use this number field</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(targetNumberProperty?.name || "Choose number field")}</span>
              </button>
            ` : ""}
            ${needsCheckbox ? `
              <button type="button" class="page-database-property-panel-item${simpleType === "count" && !relationProperty ? " is-disabled" : ""}" data-db-action="open-formula-checkbox-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>${simpleType === "count" ? "Only count rows with this checkbox" : "Use this checkbox field"}</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(targetCheckboxProperty?.name || (simpleType === "count" ? "Optional" : "Choose checkbox field"))}</span>
              </button>
            ` : ""}
            ${needsPair ? `
              <button type="button" class="page-database-property-panel-item" data-db-action="open-formula-left-number-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>${simpleType === "percentage" ? "Use this number first" : "First number"}</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(leftProperty?.name || "Choose number field")}</span>
              </button>
              <button type="button" class="page-database-property-panel-item" data-db-action="open-formula-right-number-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>${simpleType === "percentage" ? "Then divide by this number" : "Second number"}</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(rightProperty?.name || "Choose number field")}</span>
              </button>
            ` : ""}
            ${needsDate ? `
              <button type="button" class="page-database-property-panel-item" data-db-action="open-formula-date-menu" data-prop-id="${escapeHTML(property.id)}">
                <span>Count down to this date</span>
                <span class="page-database-property-panel-item-meta">${escapeHTML(dateProperty?.name || "Choose date field")}</span>
              </button>
            ` : ""}
            <div class="page-database-property-panel-note">${escapeHTML(getFormulaSimpleDescription(property))}</div>
          ` : `
            <label class="page-database-formula-advanced">
              <span class="page-database-formula-advanced-label">Formula</span>
              <textarea class="page-database-formula-advanced-input" data-db-action="formula-expression" placeholder="Example: percent([Spent], [Budget])">${escapeHTML(config.expression || "")}</textarea>
            </label>
            <div class="page-database-property-panel-note">Use field names in square brackets, like [Budget] - [Actual]. You can also use helpers like sum("Tasks", "Hours"), count("Tasks"), average("Tasks", "Hours"), percent([Done], [Total]), daysUntil([Due]), compare([Budget], [Actual]), and if(allChecked("Tasks", "Done"), "Complete", "In progress").</div>
          `}
          <button type="button" class="page-database-property-panel-link page-database-property-panel-link-quiet" data-db-action="toggle-formula-mode" data-prop-id="${escapeHTML(property.id)}">${config.mode === "advanced" ? "Back to simple" : "Advanced"}</button>
          <div class="page-database-property-panel-divider"></div>
          <button type="button" class="page-database-property-panel-item" data-db-action="duplicate-property-panel" data-prop-id="${escapeHTML(property.id)}">Duplicate property</button>
          <button type="button" class="page-database-property-panel-item danger" data-db-action="delete-property-panel" data-prop-id="${escapeHTML(property.id)}">Delete property</button>
        </div>
      </aside>
    `;
  }

  function openPropertyPanel(context, database, propertyId = "") {
    const property = getPropertyById(database, propertyId);
    if (!property || !["status", "select", "relation", "summary", "formula"].includes(property.type)) return;
    closeDatabaseMenus();
    const panel = document.createElement("div");
    panel.id = PROPERTY_PANEL_ID;
    panel.className = "page-database-property-panel";
    panel.dataset.kind = context.kind || "page";
    panel.dataset.pageId = context.pageId || "";
    panel.dataset.blockId = context.blockId || "";
    panel.dataset.propertyId = propertyId;
    panel.innerHTML = property.type === "status"
      ? buildStatusPropertyPanelHTML(property, database)
      : property.type === "select"
        ? buildSelectPropertyPanelHTML(property, database)
        : property.type === "relation"
          ? buildRelationPropertyPanelHTML(property, database)
          : property.type === "summary"
            ? buildSummaryPropertyPanelHTML(property, database)
            : buildFormulaPropertyPanelHTML(property, database);
    panel.addEventListener("mousedown", (event) => event.stopPropagation());
    document.body.appendChild(panel);
  }

  function openPropertyMenu(anchorEl, context, database, propertyId = "") {
    const property = getPropertyById(database, propertyId);
    if (!property) return;

    if (["status", "select", "relation", "summary", "formula"].includes(property.type)) {
      openPropertyPanel(context, database, property.id);
      return;
    }

    const menuEl = mountDatabaseFloatingEl(DATABASE_MENU_ID, "page-database-property-menu topbar-dropdown", anchorEl);
    menuEl.innerHTML = `
      <div class="page-database-menu-head">
        <span class="page-database-menu-head-icon">${escapeHTML(getPropertyIcon(property))}</span>
        <input class="page-database-menu-name-input" type="text" value="${escapeHTML(property.name)}" />
      </div>
      <div class="page-database-menu-section" data-db-menu-section="actions"></div>
      <div class="page-database-menu-section" data-db-menu-section="filters"></div>
    `;

    const nameInput = menuEl.querySelector(".page-database-menu-name-input");
    const actionsEl = menuEl.querySelector('[data-db-menu-section="actions"]');
    const filtersEl = menuEl.querySelector('[data-db-menu-section="filters"]');

    const commit = () => {
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      closeDatabaseMenus();
    };

    const renameAndSave = () => {
      renameProperty(database, property.id, nameInput?.value || property.name);
      commit();
    };

    nameInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        renameAndSave();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeDatabaseMenus();
      }
    });
    nameInput?.addEventListener("change", renameAndSave);

    if (property.type === "title") {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `page-database-menu-toggle${hasPageIcon(database) ? " active" : ""}`;
      toggle.innerHTML = `<span>Show page icon</span><span class="page-database-menu-toggle-switch"><span></span></span>`;
      toggle.addEventListener("click", () => {
        database.showPageIcon = !database.showPageIcon;
        commit();
      });
      actionsEl?.appendChild(toggle);
      appendMenuDivider(actionsEl);
    }

    if (property.type !== "title") {
      appendMenuSubmenuButton(actionsEl, "Property type", (buttonEl) => {
        openPropertySubmenu(buttonEl, "Property Type", (submenuEl) => {
          PROPERTY_TYPES.forEach((type) => {
            appendMenuButton(submenuEl, type.label, () => {
              setPropertyType(database, property.id, type.value);
              commit();
            }, { active: property.type === type.value });
          });
        });
      });
    }

    appendMenuSubmenuButton(actionsEl, "Icon", (buttonEl) => {
      openPropertyIconMenu(buttonEl, context, database, property.id);
    }, { active: property.showIcon === false || !!String(property.icon || "").trim() });

    appendMenuSubmenuButton(actionsEl, "Sort", (buttonEl) => {
      openPropertySubmenu(buttonEl, "Sort", (submenuEl) => {
        appendMenuButton(submenuEl, "Ascending", () => {
          setPropertySort(database, property.id, "asc");
          commit();
        }, { active: getPropertySort(database, property.id)?.direction === "asc" });
        appendMenuButton(submenuEl, "Descending", () => {
          setPropertySort(database, property.id, "desc");
          commit();
        }, { active: getPropertySort(database, property.id)?.direction === "desc" });
        appendMenuButton(submenuEl, "Clear sort", () => {
          setPropertySort(database, property.id, "");
          commit();
        }, { active: !getPropertySort(database, property.id) });
      });
    }, { active: !!getPropertySort(database, property.id) });

    appendMenuButton(actionsEl, database.groupBy === property.id ? "Ungroup" : "Group", () => {
      database.groupBy = database.groupBy === property.id ? "" : property.id;
      commit();
    }, { active: database.groupBy === property.id });
    appendMenuButton(actionsEl, isPropertyFrozen(database, property.id) ? "Unfreeze" : "Freeze", () => {
      toggleFrozenProperty(database, property.id);
      commit();
    }, { active: isPropertyFrozen(database, property.id) });
    appendMenuButton(actionsEl, isPropertyUnwrapped(database, property.id) ? "Wrap content" : "Unwrap content", () => {
      toggleUnwrappedProperty(database, property.id);
      commit();
    }, { active: isPropertyUnwrapped(database, property.id) });

    appendMenuSubmenuButton(actionsEl, "Calculate", (buttonEl) => {
      openPropertySubmenu(buttonEl, "Calculate", (submenuEl) => {
        appendMenuButton(submenuEl, "Count filled", () => {
          setPropertyCalculation(database, property.id, getPropertyCalculationMode(database, property.id) === "count-filled" ? "" : "count-filled");
          commit();
        }, { active: getPropertyCalculationMode(database, property.id) === "count-filled" });
        appendMenuButton(submenuEl, "Percent filled", () => {
          setPropertyCalculation(database, property.id, getPropertyCalculationMode(database, property.id) === "percent-filled" ? "" : "percent-filled");
          commit();
        }, { active: getPropertyCalculationMode(database, property.id) === "percent-filled" });
        appendMenuButton(submenuEl, "Clear calculation", () => {
          setPropertyCalculation(database, property.id, "");
          commit();
        }, { active: !getPropertyCalculationMode(database, property.id) });
      });
    }, { active: !!getPropertyCalculationMode(database, property.id) });

    appendMenuSubmenuButton(actionsEl, "Insert", (buttonEl) => {
      openPropertySubmenu(buttonEl, "Insert", (submenuEl) => {
        appendMenuButton(submenuEl, "Insert left", () => {
          const index = database.properties.findIndex((entry) => entry.id === property.id);
          openPropertyComposer(anchorEl, context, database, { insertIndex: Math.max(0, index) });
        });
        appendMenuButton(submenuEl, "Insert right", () => {
          const index = database.properties.findIndex((entry) => entry.id === property.id);
          openPropertyComposer(anchorEl, context, database, { insertIndex: Math.max(0, index + 1) });
        });
      });
    });

    if (property.type !== "title") {
      appendMenuDivider(actionsEl);
      appendMenuButton(actionsEl, "Delete property", () => {
        deletePropertyFromDatabase(database, property.id);
        commit();
      }, { danger: true });
    }

    appendMenuSubmenuButton(filtersEl, "Filter", (buttonEl) => {
      openPropertySubmenu(buttonEl, "Filter", (submenuEl) => {
        appendMenuButton(submenuEl, "Filter empty", () => {
          const active = getPropertyFilter(database, property.id)?.mode === "empty";
          setPropertyFilter(database, property.id, active ? "" : "empty", "");
          commit();
        }, { active: getPropertyFilter(database, property.id)?.mode === "empty" });
        appendMenuButton(submenuEl, "Clear filter", () => {
          setPropertyFilter(database, property.id, "", "");
          commit();
        }, { active: !getPropertyFilter(database, property.id) });

        getDistinctPropertyValues(database, property.id).slice(0, 6).forEach((value) => {
          const active = getPropertyFilter(database, property.id)?.mode === "equals" && getPropertyFilter(database, property.id)?.value === value;
          appendMenuButton(submenuEl, value, () => {
            setPropertyFilter(database, property.id, active ? "" : "equals", value);
            commit();
          }, { active });
        });
      });
    }, { active: !!getPropertyFilter(database, property.id) });

    requestAnimationFrame(() => nameInput?.focus());
  }

  function applyPendingFocus(surfaceEl, context) {
    if (!surfaceEl || !pendingDatabaseFocus || !sameContext(context, pendingDatabaseFocus.context)) return;

    const selector = `[data-db-row-id="${pendingDatabaseFocus.rowId}"][data-db-prop-id="${pendingDatabaseFocus.propId}"]`;
    const target = surfaceEl.querySelector(selector);
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.focus();
      if (typeof target.select === "function") target.select();
      pendingDatabaseFocus = null;
    });
  }

  function renderPageEditorSurface(surfaceEl, database) {
    const pageIconBtn = surfaceEl.querySelector(".page-database-page-icon-btn");
    const pageTitleEl = surfaceEl.querySelector(".page-database-page-title");
    const viewPillEl = surfaceEl.querySelector(".page-database-view-pill");
    const editorHost = surfaceEl.querySelector(".page-database-editor-host");
    const pageId = surfaceEl.dataset.pageId || getCurrentPageId();

    if (pageIconBtn) {
      pageIconBtn.innerHTML = getPageIconButtonMarkup(pageId);
      pageIconBtn.classList.toggle("is-empty", !getCurrentPageRecord(pageId)?.icon);
    }

    if (pageTitleEl) {
      const pageTitle = getPageTitleText(pageId, database.title || "Untitled");
      if (pageTitleEl.textContent !== pageTitle) pageTitleEl.textContent = pageTitle;
    }

    if (viewPillEl) viewPillEl.textContent = getViewPillLabel(database);

    if (editorHost) editorHost.innerHTML = buildPageEditorHTML(database);
    autoGrowDatabaseTextareas(surfaceEl);
    applyFrozenColumns(surfaceEl, database);

    applyPendingFocus(surfaceEl, {
      kind: "page",
      pageId,
      surfaceEl
    });
  }

  function renderBlockViewSurface(surfaceEl, database) {
    const blockShell = surfaceEl.querySelector(".page-database-block-shell");
    const pageMenuBtn = surfaceEl.querySelector(".page-database-block-page-menu");
    const titleEl = surfaceEl.querySelector(".page-database-block-title");
    const viewButton = surfaceEl.querySelector(".page-database-block-view-btn");
    const settingsButton = surfaceEl.querySelector('[data-db-action="open-database-settings-menu"]');
    const collapseButton = surfaceEl.querySelector(".page-database-block-collapse-btn");
    const toolbarActionsEl = surfaceEl.querySelector(".page-database-block-toolbar-actions");
    const filterButton = surfaceEl.querySelector('[data-db-action="open-filter-menu"]');
    const sortButton = surfaceEl.querySelector('[data-db-action="open-sort-menu"]');
    const groupButton = surfaceEl.querySelector('[data-db-action="open-group-menu"]');
    const moreButton = surfaceEl.querySelector('[data-db-action="open-database-menu"]');
    const newButton = surfaceEl.querySelector('.page-database-block-toolbar-actions [data-db-action="add-row"]');
    const contentEl = surfaceEl.querySelector(".page-database-block-content");
    const source = getEmbedSourceTarget(surfaceEl);
    const activeView = normalizeEmbedView(database.view, "table");
    const collapsed = isInlineDatabaseCollapsed(surfaceEl);

    syncInlineDatabaseBlockTone(surfaceEl);

    if (pageMenuBtn) {
      pageMenuBtn.classList.toggle("is-empty", !source);
    }

    if (titleEl) {
      titleEl.textContent = source ? getInlineDatabaseSourceLabel(source) : "Untitled";
      titleEl.classList.toggle("is-empty", !source);
    }

    if (viewButton) {
      viewButton.textContent = getInlineViewLabel(activeView);
      viewButton.disabled = !source;
    }

    if (collapseButton) {
      collapseButton.textContent = collapsed ? "<<" : ">>";
      collapseButton.setAttribute("aria-label", collapsed ? "Expand inline toolbar" : "Collapse inline toolbar");
    }

    surfaceEl.classList.toggle("is-inline-toolbar-collapsed", !!source && collapsed);

    if (toolbarActionsEl) {
      toolbarActionsEl.hidden = !source || collapsed;
    }

    if (filterButton) filterButton.classList.toggle("active", Array.isArray(database.filters) && database.filters.length > 0);
    if (sortButton) sortButton.classList.toggle("active", Array.isArray(database.sorts) && database.sorts.length > 0);
    if (groupButton) groupButton.classList.toggle("active", !!database.groupBy);

    [filterButton, sortButton, groupButton, moreButton, newButton, settingsButton].forEach((button) => {
      if (button) button.disabled = !source;
    });

    if (contentEl) {
      if (!source) {
        contentEl.innerHTML = `
          <div class="page-database-block-empty-state">
            <div class="page-database-block-empty-title">Create or link a database</div>
            <div class="page-database-block-empty-actions">
              <button type="button" class="page-database-block-empty-action" data-db-action="create-inline-database">New database</button>
              <button type="button" class="page-database-block-empty-action is-secondary" data-db-action="open-inline-source-menu">Link existing</button>
            </div>
          </div>
        `;
        contentEl.classList.remove("board-mode", "table-mode");
        syncInlineDatabaseBlockSize(surfaceEl);
        return;
      }

      contentEl.innerHTML = activeView === "board"
        ? buildBoardViewHTML({ ...database, view: "board" }).bodyHTML
        : buildPageTableEditorHTML({ ...database, view: "table" });
      contentEl.classList.toggle("board-mode", activeView === "board");
      contentEl.classList.toggle("table-mode", activeView === "table");

      const blockScroll = surfaceEl.querySelector(".page-database-block-scroll");
      if (blockShell && blockScroll) {
        blockShell.style.width = "100%";
        blockScroll.style.maxWidth = "100%";
      }

      autoGrowDatabaseTextareas(surfaceEl);
      applyFrozenColumns(surfaceEl, database);
      syncInlineDatabaseSelectedRow(surfaceEl);
      applyPendingFocus(surfaceEl, {
        kind: "block",
        blockId: surfaceEl.id || "",
        blockEl: surfaceEl,
        surfaceEl
      });
      syncInlineDatabaseBlockSize(surfaceEl);
    }
  }

  function renderDatabaseSurface(surfaceEl, database) {
    if (!surfaceEl) return;
    const normalized = normalizeDatabase(database, {
      defaultView: surfaceEl.dataset.calendarScope === "page" ? "table" : "table"
    });

    if (surfaceEl.dataset.calendarScope === "page") {
      renderPageEditorSurface(surfaceEl, normalized);
      return;
    }

    renderBlockViewSurface(surfaceEl, normalized);
  }

  function getViewPillLabel(database) {
    return database.view === "calendar"
      ? "🗓 Calendar"
      : database.view === "board"
        ? "▥ Board"
        : "▦ Table";
  }

  function getPageIconButtonMarkup(pageId) {
    const page = getCurrentPageRecord(pageId);
    if (page?.icon) return getPageIconMarkup(pageId);
    return `<span class="page-database-page-icon page-database-page-icon-empty">+</span>`;
  }

  function buildPageDatabaseHTML(pageId, database = getPageDatabase(pageId)) {
    const pageTitle = getPageTitleText(pageId, "Untitled");
    const hasFilters = Array.isArray(database.filters) && database.filters.length;
    const hasSorts = Array.isArray(database.sorts) && database.sorts.length;
    const hasGrouping = !!database.groupBy;

    return `
      <section class="calendar-db-surface calendar-db-page" data-calendar-scope="page" data-page-id="${escapeHTML(pageId)}">
        <div class="page-calendar-shell page-calendar-shell-large">
          <div class="page-database-header">
            <div class="page-database-title-row">
              <button type="button" class="page-database-page-icon-btn" data-db-action="open-page-icon" aria-label="Edit page icon">${getPageIconButtonMarkup(pageId)}</button>
              <button type="button" class="page-database-page-title-btn" data-db-action="rename-page"><span class="page-database-page-title">${escapeHTML(pageTitle)}</span></button>
            </div>
            <div class="page-database-toolbar-row">
              <button type="button" class="page-database-view-pill" data-db-action="open-view-menu">${escapeHTML(getViewPillLabel(database))}</button>
              <button type="button" class="page-database-settings-btn" data-db-action="open-database-settings-menu" aria-haspopup="menu" aria-label="Open database settings">
                <span class="page-database-settings-btn-icon" aria-hidden="true">⚙</span>
              </button>
              <div class="page-database-toolbar-actions">
                <button type="button" class="page-database-toolbar-btn${hasFilters ? " active" : ""}" data-db-action="open-filter-menu">Filter</button>
                <button type="button" class="page-database-toolbar-btn${hasSorts ? " active" : ""}" data-db-action="open-sort-menu">Sort</button>
                <button type="button" class="page-database-toolbar-btn${hasGrouping ? " active" : ""}" data-db-action="open-group-menu">Group</button>
                <button type="button" class="page-database-toolbar-new-btn" data-db-action="add-row">New</button>
              </div>
            </div>
          </div>
          <div class="page-database-editor-host"></div>
        </div>
      </section>
    `;
  }

  function renderPageCalendarDatabase(pageId = getCurrentPageId()) {
    const pageContent = document.getElementById("pageContent");
    const grid = document.getElementById("grid");
    if (!pageContent || !grid) return;

    if (!isCalendarDatabasePage(pageId)) {
      if (pageContent.dataset.surfaceType === "calendar-db") {
        pageContent.innerHTML = "";
        pageContent.classList.remove("system-page-content", "calendar-db-page-host");
        pageContent.style.display = "none";
        pageContent.dataset.surfaceType = "";
      }
      grid.style.display = "";
      return;
    }

    const database = getPageDatabase(pageId);

    document.body.classList.remove("editing", "block-selected", "block-type-text", "block-type-list", "block-type-image", "block-type-container", "block-type-table");
    pageContent.classList.add("system-page-content", "calendar-db-page-host");
    pageContent.style.display = "block";
    pageContent.dataset.surfaceType = "calendar-db";
    const inheritedFont = document.getElementById("breadcrumbBar")?.style.fontFamily || document.getElementById("pageTitle")?.style.fontFamily || "";
    if (inheritedFont) {
      pageContent.dataset.pageFontFamily = "true";
      pageContent.style.setProperty("--page-font-family", inheritedFont);
    } else {
      delete pageContent.dataset.pageFontFamily;
      pageContent.style.removeProperty("--page-font-family");
    }
    grid.style.display = "none";
    pageContent.innerHTML = buildPageDatabaseHTML(pageId, database);

    const surfaceEl = pageContent.querySelector('.calendar-db-surface[data-calendar-scope="page"]');
    renderDatabaseSurface(surfaceEl, database);
  }

  function rerenderCalendarContext(context) {
    if (!context) return;
    if (context.kind === "page") {
      renderPageCalendarDatabase(context.pageId);
      return;
    }

    const hostEl = context.surfaceEl || context.blockEl || document.getElementById(context.blockId || "");
    if (!hostEl) return;
    renderDatabaseSurface(hostEl, getBlockDatabase(hostEl));
  }

  document.addEventListener("mousedown", (event) => {
    const resizeHandle = event.target.closest("[data-db-resize]");
    if (resizeHandle) {
      event.preventDefault();
      event.stopPropagation();
      startColumnResize(resizeHandle, event);
      return;
    }

    if (!event.target.closest(`#${DATABASE_MENU_ID}, #${DATABASE_SUBMENU_ID}, #${ROW_MENU_ID}, #${PROPERTY_COMPOSER_ID}`) && !event.target.closest("[data-db-action]")) {
      closeDatabaseMenus();
    }
    const interactive = event.target.closest(".page-calendar-shell, .page-database-block-shell");
    if (interactive) event.stopPropagation();

    if (!document.body.classList.contains("editing")) return;

    const selectedHeaderTarget = event.target.closest('.block[data-type="calendar"] .page-database-col-head-wrap[data-db-header-prop-id], .block[data-type="calendar"] .page-database-col-head[data-prop-id]');
    if (selectedHeaderTarget) {
      const hostEl = selectedHeaderTarget.closest('.block[data-type="calendar"]');
      const headerWrap = selectedHeaderTarget.closest('.page-database-col-head-wrap[data-db-header-prop-id]');
      const propertyId = headerWrap?.dataset?.dbHeaderPropId || selectedHeaderTarget.dataset.propId || "";
      if (hostEl && propertyId) {
        window.selectCanvasBlock?.(hostEl);
        setSelectedInlineDatabaseRow(hostEl, "", "", propertyId);
      }
      return;
    }

    const selectedCellTarget = event.target.closest('.block[data-type="calendar"] .page-database-cell[data-db-row-id][data-db-prop-id]');
    if (selectedCellTarget) {
      const hostEl = selectedCellTarget.closest('.block[data-type="calendar"]');
      const rowId = selectedCellTarget.dataset.dbRowId || "";
      const propertyId = selectedCellTarget.dataset.dbPropId || "";
      if (hostEl && rowId && propertyId) {
        window.selectCanvasBlock?.(hostEl);
        setSelectedInlineDatabaseRow(hostEl, rowId, propertyId);
      }
      return;
    }

    const selectedRowTarget = event.target.closest('.block[data-type="calendar"] .page-database-row-shell[data-db-row-shell-id], .block[data-type="calendar"] .page-database-board-card[data-item-id]');
    if (selectedRowTarget) {
      const hostEl = selectedRowTarget.closest('.block[data-type="calendar"]');
      const rowId = selectedRowTarget.dataset.dbRowShellId || selectedRowTarget.dataset.itemId || "";
      if (hostEl && rowId) {
        window.selectCanvasBlock?.(hostEl);
        setSelectedInlineDatabaseRow(hostEl, rowId);
      }
      return;
    }

    const calendarBlock = event.target.closest('.block[data-type="calendar"]');
    if (calendarBlock) {
      window.selectCanvasBlock?.(calendarBlock);
      setSelectedInlineDatabaseRow(calendarBlock, "");
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (!activeColumnResize) return;
    const nextWidth = activeColumnResize.startWidth + (event.clientX - activeColumnResize.startX);
    setPropertyWidth(activeColumnResize.database, activeColumnResize.propertyId, nextWidth);
    const surfaceEl = activeColumnResize.context.kind === "page"
      ? (activeColumnResize.context.surfaceEl || document.querySelector(`.calendar-db-surface[data-page-id="${activeColumnResize.context.pageId || ""}"]`))
      : (activeColumnResize.context.surfaceEl || activeColumnResize.context.blockEl || document.getElementById(activeColumnResize.context.blockId || ""));
    renderDatabaseSurface(surfaceEl, activeColumnResize.database);
  });

  document.addEventListener("mouseup", () => {
    if (!activeColumnResize) return;
    saveDatabaseForContext(activeColumnResize.context, activeColumnResize.database);
    rerenderCalendarContext(activeColumnResize.context);
    activeColumnResize = null;
    document.body.classList.remove("db-column-resizing");
  });

  document.addEventListener("click", (event) => {
    const dbControl = event.target.closest("[data-db-action]");
    if (dbControl) {
      const context = getCalendarContext(dbControl);
      if (!context) return;

      event.preventDefault();
      event.stopPropagation();

      const database = getDatabaseForContext(context);
      const action = dbControl.dataset.dbAction;

      if (action === "add-row") {
        const defaults = {};
        const dateProperty = getDateProperty(database);
        const statusProperty = getStatusProperty(database);
        if (dateProperty && dbControl.dataset.date) {
          defaults[dateProperty.id] = serializeDateCellValue({ start: normalizeDayKey(dbControl.dataset.date, "") });
        }

        if (statusProperty) {
          const requestedStatus = String(dbControl.dataset.statusValue || "").trim();
          if (requestedStatus && statusProperty.id === (dbControl.dataset.statusPropId || statusProperty.id)) {
            defaults[statusProperty.id] = requestedStatus;
          } else if (database.view === "board") {
            defaults[statusProperty.id] = getDefaultStatusName(statusProperty);
          }
        }

        const row = addRowToDatabase(database, defaults);
        saveDatabaseForContext(context, database);

        pendingDatabaseFocus = {
          context,
          rowId: row.id,
          propId: getTitleProperty(database).id
        };

        rerenderCalendarContext(context);
        return;
      }

      if (action === "open-view-menu") {
        openViewMenu(dbControl, context, database);
        return;
      }

      if (action === "open-database-settings-menu") {
        openDatabaseSummaryMenu(dbControl, context, database);
        return;
      }

      if (action === "open-property-icon-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        if (!propertyId) return;
        openPropertyIconMenu(dbControl, context, database, propertyId, {
          onChange: () => refreshPropertyPanel(context, database, propertyId)
        });
        return;
      }

      if (action === "open-inline-page-menu") {
        openInlinePageMenu(dbControl, context);
        return;
      }

      if (action === "open-inline-view-menu") {
        openInlineViewMenu(dbControl, context, database);
        return;
      }

      if (action === "open-inline-source-menu") {
        openInlineSourceMenu(dbControl, context);
        return;
      }

      if (action === "toggle-inline-collapse") {
        const hostEl = getInlineDatabaseHost(context);
        if (!hostEl) return;

        if (isInlineDatabaseCollapsed(hostEl)) {
          delete hostEl.dataset.calendarCollapsed;
        } else {
          hostEl.dataset.calendarCollapsed = "1";
        }

        delete hostEl.dataset.calendarExpandedWidth;

        saveBlockDatabase(hostEl, getBlockDatabase(hostEl));
        rerenderCalendarContext(context);
        return;
      }

      if (action === "create-inline-database") {
        createInlineDatabasePage(context);
        closeDatabaseMenus();
        return;
      }

      if (action === "open-embed-picker") {
        openEmbedPicker(dbControl, context);
        return;
      }

      if (action === "set-embed-view") {
        database.view = normalizeEmbedView(dbControl.dataset.view || database.view || "table", "table");
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        return;
      }

      if (action === "open-filter-menu") {
        openDatabaseFilterMenu(dbControl, context, database);
        return;
      }

      if (action === "open-sort-menu") {
        openDatabaseSortMenu(dbControl, context, database);
        return;
      }

      if (action === "open-group-menu") {
        openDatabaseGroupMenu(dbControl, context, database);
        return;
      }

      if (action === "open-database-menu") {
        openDatabaseSummaryMenu(dbControl, context, database);
        return;
      }

      if (action === "open-row-menu") {
        openRowMenu(dbControl, context, database, dbControl.dataset.rowId || "");
        return;
      }

      if (action === "open-cell-value-menu") {
        openCellValueMenu(dbControl, context, database, dbControl.dataset.dbRowId || "", dbControl.dataset.dbPropId || "");
        return;
      }

      if (action === "toggle-checkbox") {
        const rowId = dbControl.dataset.dbRowId || "";
        const propertyId = dbControl.dataset.dbPropId || "";
        const row = getRowById(database, rowId);
        const nextValue = String(row?.values?.[propertyId] || "") === "true" ? "" : "true";
        commitCellValue(context, database, rowId, propertyId, nextValue);
        return;
      }

      if (action === "set-board-card-preview") {
        openBoardCardPreviewMenu(dbControl, context, database, dbControl.dataset.rowId || "");
        return;
      }

      if (action === "close-property-panel") {
        document.getElementById(PROPERTY_PANEL_ID)?.remove();
        return;
      }

      if (action === "open-property-menu") {
        openPropertyMenu(dbControl, context, database, dbControl.dataset.propId || "");
        return;
      }

      if (action === "add-status-option") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        addStatusOption(database, propertyId, Number(dbControl.dataset.statusGroupIndex || 0));
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "add-select-option") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        addSelectOption(database, propertyId);
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "delete-status-option") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        deleteStatusOption(database, propertyId, Number(dbControl.dataset.statusGroupIndex || -1), Number(dbControl.dataset.statusOptionIndex || -1));
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "delete-select-option") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        deleteSelectOption(database, propertyId, Number(dbControl.dataset.selectOptionIndex || -1));
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "set-default-status") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        setDefaultStatusOption(database, propertyId, Number(dbControl.dataset.statusGroupIndex || -1), Number(dbControl.dataset.statusOptionIndex || -1));
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "open-status-color-menu") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        openStatusColorMenu(
          dbControl,
          context,
          database,
          propertyId,
          Number(dbControl.dataset.statusGroupIndex || -1),
          Number(dbControl.dataset.statusOptionIndex || -1)
        );
        return;
      }

      if (action === "open-select-color-menu") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        const option = getPropertySelectOptions(property)[Number(dbControl.dataset.selectOptionIndex || -1)];
        if (!option) return;
        openSelectColorMenu(dbControl, context, database, propertyId, option.name, {
          onChange: () => refreshPropertyPanel(context, database, propertyId)
        });
        return;
      }

      if (action === "open-relation-table-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        if (!property || property.type !== "relation") return;
        openPropertySubmenu(dbControl, "Link", (submenuEl) => {
          getDatabaseTableSources().forEach((source) => {
            appendMenuButton(submenuEl, source.label, () => {
              setRelationTarget(database, propertyId, source);
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getDatabaseSourceKey(source) === getDatabaseSourceKey(property.relationTarget || {}) });
          });
        });
        return;
      }

      if (action === "open-summary-relation-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        openPropertySubmenu(dbControl, "Relation", (submenuEl) => {
          getRelationProperties(database).forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setSummaryConfig(database, propertyId, { relationPropertyId: entry.id, targetPropertyId: "" });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.summaryConfig?.relationPropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "open-summary-mode-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        openPropertySubmenu(dbControl, "Summary", (submenuEl) => {
          SUMMARY_TYPE_OPTIONS.forEach((entry) => {
            appendMenuButton(submenuEl, entry.label, () => {
              setSummaryConfig(database, propertyId, { mode: entry.value, targetPropertyId: entry.value === "count" ? "" : getPropertyById(database, propertyId)?.summaryConfig?.targetPropertyId || "" });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: normalizeSummaryMode(getPropertyById(database, propertyId)?.summaryConfig?.mode || "count") === entry.value });
          });
        });
        return;
      }

      if (action === "open-summary-target-property-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        if (!property || property.type !== "summary") return;
        const candidates = getSummaryTargetCandidates(database, property);
        if (!candidates.length) return;
        openPropertySubmenu(dbControl, "Field", (submenuEl) => {
          candidates.forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setSummaryConfig(database, propertyId, { targetPropertyId: entry.id });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.summaryConfig?.targetPropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "toggle-formula-mode") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        if (!property || property.type !== "formula") return;
        const nextMode = normalizeFormulaConfig(property.formulaConfig || {}).mode === "advanced" ? "simple" : "advanced";
        setFormulaConfig(database, propertyId, { mode: nextMode });
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "open-formula-simple-type-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        openPropertySubmenu(dbControl, "Formula", (submenuEl) => {
          FORMULA_SIMPLE_OPTIONS.forEach((entry) => {
            appendMenuButton(submenuEl, entry.label, () => {
              setFormulaConfig(database, propertyId, {
                simpleType: entry.value,
                relationPropertyId: ["sum", "count", "average"].includes(entry.value) ? getPropertyById(database, propertyId)?.formulaConfig?.relationPropertyId || "" : "",
                targetPropertyId: ["sum", "average"].includes(entry.value) ? getPropertyById(database, propertyId)?.formulaConfig?.targetPropertyId || "" : "",
                checkboxPropertyId: ["count", "auto-complete"].includes(entry.value) ? getPropertyById(database, propertyId)?.formulaConfig?.checkboxPropertyId || "" : "",
                leftPropertyId: ["subtract", "percentage", "compare"].includes(entry.value) ? getPropertyById(database, propertyId)?.formulaConfig?.leftPropertyId || "" : "",
                rightPropertyId: ["subtract", "percentage", "compare"].includes(entry.value) ? getPropertyById(database, propertyId)?.formulaConfig?.rightPropertyId || "" : "",
                datePropertyId: entry.value === "days-until-date" ? getPropertyById(database, propertyId)?.formulaConfig?.datePropertyId || "" : ""
              });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: normalizeFormulaSimpleType(getPropertyById(database, propertyId)?.formulaConfig?.simpleType || "sum") === entry.value });
          });
        });
        return;
      }

      if (action === "open-formula-relation-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        openPropertySubmenu(dbControl, "Link field", (submenuEl) => {
          getFormulaRelationCandidates(database, propertyId).forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setFormulaConfig(database, propertyId, { relationPropertyId: entry.id, targetPropertyId: "", checkboxPropertyId: "" });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.formulaConfig?.relationPropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "open-formula-target-number-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        if (!property || property.type !== "formula") return;
        openPropertySubmenu(dbControl, "Number field", (submenuEl) => {
          getFormulaRelatedFieldCandidates(database, property, "number").forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setFormulaConfig(database, propertyId, { targetPropertyId: entry.id });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.formulaConfig?.targetPropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "open-formula-checkbox-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const property = getPropertyById(database, propertyId);
        if (!property || property.type !== "formula") return;
        openPropertySubmenu(dbControl, "Checkbox field", (submenuEl) => {
          const config = normalizeFormulaConfig(property.formulaConfig || {});
          if (config.simpleType === "count") {
            appendMenuButton(submenuEl, "Count all linked rows", () => {
              setFormulaConfig(database, propertyId, { checkboxPropertyId: "" });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: !config.checkboxPropertyId });
            appendMenuDivider(submenuEl);
          }
          const candidates = config.simpleType === "auto-complete"
            ? getFormulaCheckboxCandidates(database, propertyId)
            : getFormulaRelatedFieldCandidates(database, property, "checkbox");
          candidates.forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setFormulaConfig(database, propertyId, { checkboxPropertyId: entry.id });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: config.checkboxPropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "open-formula-left-number-menu" || action === "open-formula-right-number-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        const configKey = action === "open-formula-left-number-menu" ? "leftPropertyId" : "rightPropertyId";
        const title = action === "open-formula-left-number-menu" ? "First number" : "Second number";
        openPropertySubmenu(dbControl, title, (submenuEl) => {
          getFormulaNumberCandidates(database, propertyId).forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setFormulaConfig(database, propertyId, { [configKey]: entry.id });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.formulaConfig?.[configKey] === entry.id });
          });
        });
        return;
      }

      if (action === "open-formula-date-menu") {
        const propertyId = dbControl.dataset.propId || dbControl.closest(`#${PROPERTY_PANEL_ID}`)?.dataset.propertyId || "";
        openPropertySubmenu(dbControl, "Date field", (submenuEl) => {
          getFormulaDateCandidates(database, propertyId).forEach((entry) => {
            appendMenuButton(submenuEl, entry.name, () => {
              setFormulaConfig(database, propertyId, { datePropertyId: entry.id });
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              refreshPropertyPanel(context, database, propertyId);
              document.getElementById(DATABASE_SUBMENU_ID)?.remove();
            }, { active: getPropertyById(database, propertyId)?.formulaConfig?.datePropertyId === entry.id });
          });
        });
        return;
      }

      if (action === "cycle-status-color") {
        const panel = dbControl.closest(`#${PROPERTY_PANEL_ID}`);
        const propertyId = panel?.dataset.propertyId || "";
        cycleStatusOptionColor(database, propertyId, Number(dbControl.dataset.statusGroupIndex || -1), Number(dbControl.dataset.statusOptionIndex || -1));
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, propertyId);
        return;
      }

      if (action === "toggle-property-wrap") {
        toggleUnwrappedProperty(database, dbControl.dataset.propId || "");
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        refreshPropertyPanel(context, database, dbControl.dataset.propId || "");
        return;
      }

      if (action === "duplicate-property-panel") {
        const property = getPropertyById(database, dbControl.dataset.propId || "");
        if (!property) return;
        const index = database.properties.findIndex((entry) => entry.id === property.id);
        addPropertyAtIndex(database, { ...JSON.parse(JSON.stringify(property)), id: createId("prop"), name: `${property.name} copy` }, index + 1);
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        return;
      }

      if (action === "delete-property-panel") {
        deletePropertyFromDatabase(database, dbControl.dataset.propId || "");
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
        closeDatabaseMenus();
        return;
      }

      if (action === "open-property-type-menu") {
        const propertyId = dbControl.dataset.propId || "";
        openPropertySubmenu(dbControl, "Property Type", (submenuEl) => {
          PROPERTY_TYPES.forEach((type) => {
            appendMenuButton(submenuEl, type.label, () => {
              setPropertyType(database, propertyId, type.value);
              saveDatabaseForContext(context, database);
              rerenderCalendarContext(context);
              if (["status", "select", "relation", "summary", "formula"].includes(type.value)) refreshPropertyPanel(context, database, propertyId);
              else closeDatabaseMenus();
            }, { active: getPropertyById(database, propertyId)?.type === type.value });
          });
        });
        return;
      }

      if (action === "open-page-icon") {
        if (typeof window.openPageIconPicker === "function") {
          window.openPageIconPicker(context.pageId || getCurrentPageId());
        }
        return;
      }

      if (action === "rename-page") {
        if (typeof window.openRenameModal === "function") {
          window.openRenameModal(context.pageId || getCurrentPageId(), getPageTitleText(context.pageId || getCurrentPageId(), "Untitled"));
        }
        return;
      }

      if (action === "add-property") {
        openPropertyComposer(dbControl, context, database);
        return;
      }
    }

    const control = event.target.closest("[data-calendar-action]");
    if (!control) return;

    const context = getCalendarContext(control);
    if (!context) return;

    event.preventDefault();
    event.stopPropagation();

    const database = getDatabaseForContext(context);
    const action = control.dataset.calendarAction;

    if (action === "prev") {
      database.month = shiftMonthKey(database.month, -1);
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      return;
    }

    if (action === "next") {
      database.month = shiftMonthKey(database.month, 1);
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      return;
    }

    if (action === "today") {
      database.month = getMonthKey();
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      return;
    }

    if (action === "switch-view") {
      database.view = normalizeViewMode(control.dataset.view || "table", "table");
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
    }
  });

  document.addEventListener("input", (event) => {
    const formulaInput = event.target.closest(`#${PROPERTY_PANEL_ID} [data-db-action="formula-expression"]`);
    if (formulaInput) {
      const context = getCalendarContext(formulaInput);
      if (!context) return;
      const database = getDatabaseForContext(context);
      const panel = formulaInput.closest(`#${PROPERTY_PANEL_ID}`);
      const propertyId = panel?.dataset.propertyId || "";
      setFormulaConfig(database, propertyId, { expression: formulaInput.value || "" });
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      return;
    }

    const cellInput = event.target.closest("[data-db-row-id][data-db-prop-id]");
    if (cellInput) {
      const context = getCalendarContext(cellInput);
      if (!context) return;

      if (cellInput.classList.contains("page-db-cell-textarea")) {
        autoGrowDatabaseTextarea(cellInput);
      }

      const database = getDatabaseForContext(context);
      updateRowValue(database, cellInput.dataset.dbRowId || "", cellInput.dataset.dbPropId || "", cellInput.value || "");
      saveDatabaseForContext(context, database);
      syncInlineDatabaseBlockSize(context);
      return;
    }

    const titleInput = event.target.closest('.page-calendar-title-input');
    if (!titleInput) return;

    const context = getCalendarContext(titleInput);
    if (!context) return;

    const database = getDatabaseForContext(context);
    database.title = normalizeDatabaseTitle(titleInput.value);
    saveDatabaseForContext(context, database);
  });

  document.addEventListener("change", (event) => {
    const panelInput = event.target.closest(`#${PROPERTY_PANEL_ID} [data-db-action]`);
    if (panelInput) {
      const context = getCalendarContext(panelInput);
      if (!context) return;
      const database = getDatabaseForContext(context);
      const panel = panelInput.closest(`#${PROPERTY_PANEL_ID}`);
      const propertyId = panel?.dataset.propertyId || "";

      if (panelInput.dataset.dbAction === "property-panel-name") {
        renameProperty(database, propertyId, panelInput.value || "");
      }

      if (panelInput.dataset.dbAction === "status-option-name") {
        updateStatusOptionName(database, propertyId, Number(panelInput.dataset.statusGroupIndex || -1), Number(panelInput.dataset.statusOptionIndex || -1), panelInput.value || "");
      }

      if (panelInput.dataset.dbAction === "select-option-name") {
        updateSelectOptionName(database, propertyId, Number(panelInput.dataset.selectOptionIndex || -1), panelInput.value || "");
      }

      if (panelInput.dataset.dbAction === "formula-expression") {
        setFormulaConfig(database, propertyId, { expression: panelInput.value || "" });
      }

      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      refreshPropertyPanel(context, database, propertyId);
      return;
    }

    const cellInput = event.target.closest("[data-db-row-id][data-db-prop-id]");
    if (!cellInput) return;

    const context = getCalendarContext(cellInput);
    if (!context) return;

    const database = getDatabaseForContext(context);
    updateRowValue(database, cellInput.dataset.dbRowId || "", cellInput.dataset.dbPropId || "", cellInput.value || "");
    saveDatabaseForContext(context, database);
    syncInlineDatabaseBlockSize(context);
  });

  document.addEventListener("keydown", (event) => {
    const titleInput = event.target.closest('.page-calendar-title-input');
    if (titleInput && event.key === "Enter") {
      event.preventDefault();
      titleInput.blur();
    }
  });

  document.addEventListener("dragstart", (event) => {
    const propertyHeader = event.target.closest('.page-database-col-head-wrap[data-db-header-prop-id][draggable="true"]');
    if (propertyHeader && !event.target.closest('[data-db-resize="property"]')) {
      const context = getCalendarContext(propertyHeader);
      if (!context) return;

      draggingDatabaseProperty = {
        context,
        propertyId: propertyHeader.dataset.dbHeaderPropId || ""
      };

      propertyHeader.classList.add("is-dragging-property");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggingDatabaseProperty.propertyId);
      }
      return;
    }

    const itemEl = event.target.closest('.page-calendar-event, .page-calendar-row, .page-database-board-card');
    if (!itemEl) return;

    const context = getCalendarContext(itemEl);
    if (!context) return;

    draggingCalendarItem = {
      context,
      itemId: itemEl.dataset.itemId || ""
    };

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggingCalendarItem.itemId);
    }
  });

  document.addEventListener("dragover", (event) => {
    const propertyHeader = event.target.closest('.page-database-col-head-wrap[data-db-header-prop-id]');
    if (propertyHeader && draggingDatabaseProperty) {
      const context = getCalendarContext(propertyHeader);
      if (!sameContext(context, draggingDatabaseProperty.context)) return;
      const targetPropertyId = propertyHeader.dataset.dbHeaderPropId || "";
      if (!targetPropertyId || targetPropertyId === draggingDatabaseProperty.propertyId) return;

      event.preventDefault();
      const rect = propertyHeader.getBoundingClientRect();
      const position = event.clientX < rect.left + (rect.width / 2) ? "before" : "after";
      document.querySelectorAll('.page-database-col-head-wrap.db-prop-drop-before, .page-database-col-head-wrap.db-prop-drop-after').forEach((node) => {
        node.classList.remove('db-prop-drop-before', 'db-prop-drop-after');
      });
      propertyHeader.classList.add(position === "before" ? "db-prop-drop-before" : "db-prop-drop-after");
      return;
    }

    const boardColumn = event.target.closest('.page-database-board-column[data-status-prop-id][data-status-value]');
    if (boardColumn && draggingCalendarItem) {
      const context = getCalendarContext(boardColumn);
      if (!sameContext(context, draggingCalendarItem.context)) return;
      event.preventDefault();
      boardColumn.classList.add("drag-over");
      return;
    }

    const day = event.target.closest('.page-calendar-day[data-calendar-date]');
    if (!day || !draggingCalendarItem) return;
    const context = getCalendarContext(day);
    if (!sameContext(context, draggingCalendarItem.context)) return;
    event.preventDefault();
    day.classList.add("drag-over");
  });

  document.addEventListener("dragleave", (event) => {
    const propertyHeader = event.target.closest('.page-database-col-head-wrap[data-db-header-prop-id]');
    if (propertyHeader) propertyHeader.classList.remove("db-prop-drop-before", "db-prop-drop-after");

    const boardColumn = event.target.closest('.page-database-board-column[data-status-prop-id][data-status-value]');
    if (boardColumn) boardColumn.classList.remove("drag-over");

    const day = event.target.closest('.page-calendar-day[data-calendar-date]');
    if (day) day.classList.remove("drag-over");
  });

  document.addEventListener("drop", (event) => {
    const propertyHeader = event.target.closest('.page-database-col-head-wrap[data-db-header-prop-id]');
    if (propertyHeader && draggingDatabaseProperty) {
      const context = getCalendarContext(propertyHeader);
      if (!sameContext(context, draggingDatabaseProperty.context)) return;

      const targetPropertyId = propertyHeader.dataset.dbHeaderPropId || "";
      const position = propertyHeader.classList.contains("db-prop-drop-after") ? "after" : "before";
      document.querySelectorAll('.page-database-col-head-wrap.db-prop-drop-before, .page-database-col-head-wrap.db-prop-drop-after, .page-database-col-head-wrap.is-dragging-property').forEach((node) => {
        node.classList.remove('db-prop-drop-before', 'db-prop-drop-after', 'is-dragging-property');
      });

      if (!targetPropertyId || targetPropertyId === draggingDatabaseProperty.propertyId) {
        draggingDatabaseProperty = null;
        return;
      }

      event.preventDefault();
      const database = getDatabaseForContext(context);
      if (movePropertyInDatabase(database, draggingDatabaseProperty.propertyId, targetPropertyId, position)) {
        saveDatabaseForContext(context, database);
        rerenderCalendarContext(context);
      }
      draggingDatabaseProperty = null;
      return;
    }

    const boardColumn = event.target.closest('.page-database-board-column[data-status-prop-id][data-status-value]');
    if (boardColumn && draggingCalendarItem) {
      const context = getCalendarContext(boardColumn);
      if (!sameContext(context, draggingCalendarItem.context)) return;

      event.preventDefault();
      boardColumn.classList.remove("drag-over");

      const database = getDatabaseForContext(context);
      const row = getRowById(database, draggingCalendarItem.itemId);
      const property = getPropertyById(database, boardColumn.dataset.statusPropId || "");
      if (!row || !property || property.type !== "status") return;

      row.values[property.id] = normalizeCellValue(property, boardColumn.dataset.statusValue || "");
      saveDatabaseForContext(context, database);
      rerenderCalendarContext(context);
      draggingCalendarItem = null;
      return;
    }

    const day = event.target.closest('.page-calendar-day[data-calendar-date]');
    if (!day || !draggingCalendarItem) return;

    const context = getCalendarContext(day);
    if (!sameContext(context, draggingCalendarItem.context)) return;

    event.preventDefault();
    day.classList.remove("drag-over");

    const database = getDatabaseForContext(context);
    const row = getRowById(database, draggingCalendarItem.itemId);
    const dateProperty = getDateProperty(database);
    if (!row || !dateProperty) return;

    row.values[dateProperty.id] = serializeDateCellValue({ start: normalizeDayKey(day.dataset.calendarDate || "", "") });
    saveDatabaseForContext(context, database);
    rerenderCalendarContext(context);
    draggingCalendarItem = null;
  });

  document.addEventListener("dragend", () => {
    draggingDatabaseProperty = null;
    document.querySelectorAll('.page-database-col-head-wrap.db-prop-drop-before, .page-database-col-head-wrap.db-prop-drop-after, .page-database-col-head-wrap.is-dragging-property').forEach((node) => {
      node.classList.remove('db-prop-drop-before', 'db-prop-drop-after', 'is-dragging-property');
    });
    draggingCalendarItem = null;
    document.querySelectorAll('.page-database-board-column.drag-over').forEach((column) => column.classList.remove("drag-over"));
    document.querySelectorAll('.page-calendar-day.drag-over').forEach((day) => day.classList.remove("drag-over"));
  });

  const previousPageOpenHook = window.onSanctumPageOpen;
  window.onSanctumPageOpen = function onSanctumPageOpen(pageId) {
    if (typeof previousPageOpenHook === "function") {
      previousPageOpenHook(pageId);
    }
    window.requestAnimationFrame(() => {
      renderPageCalendarDatabase(pageId);
      renderVisibleDatabaseEmbeds();
    });
  };

  const previousRegistryHook = window.onSanctumRegistryChanged;
  window.onSanctumRegistryChanged = function onSanctumRegistryChanged(payload) {
    if (typeof previousRegistryHook === "function") {
      previousRegistryHook(payload);
    }
    window.requestAnimationFrame(() => {
      renderPageCalendarDatabase(getCurrentPageId());
      renderVisibleDatabaseEmbeds();
    });
  };

  window.renderPageCalendarDatabase = renderPageCalendarDatabase;
  window.syncInlineDatabaseBlockTone = syncInlineDatabaseBlockTone;
  window.applySelectedInlineDatabaseRowColor = applySelectedInlineDatabaseRowColor;
  window.getSelectedInlineDatabaseRowColor = getSelectedInlineDatabaseRowColor;
  window.mountDatabaseEmbedBlock = function mountDatabaseEmbedBlock(hostEl, options = {}) {
    if (!hostEl) return null;
    if (!hostEl.querySelector(".page-database-block-shell")) return null;
    renderDatabaseSurface(hostEl, getBlockDatabase(hostEl));
    if (options.openPicker) {
      const anchor = hostEl.querySelector(".page-database-block-view-btn, .page-database-block-empty-action") || hostEl;
      openInlineSourceMenu(anchor, {
        kind: "block",
        blockId: hostEl.id || "",
        blockEl: hostEl,
        surfaceEl: hostEl
      });
    }
    return hostEl;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      renderPageCalendarDatabase(getCurrentPageId());
      renderVisibleDatabaseEmbeds();
    }, { once: true });
  } else {
    renderPageCalendarDatabase(getCurrentPageId());
    renderVisibleDatabaseEmbeds();
  }
})();
