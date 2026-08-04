(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumJournalData = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 2;
  const PAPER_TYPES = ["plain", "ruled", "grid", "dotted", "warm", "kraft"];
  const ELEMENT_TYPES = ["text", "image", "shape", "sticker", "tape"];
  const MIN_TEXT_SIZE = 10;
  const MAX_TEXT_SIZE = 72;
  const DEFAULT_TEXT_SIZE = 14;

  function createId(prefix = "item") {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function cleanText(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
  }

  function createPage(options = {}) {
    const now = Number(options.now) || Date.now();
    return {
      id: cleanText(options.id) || createId("journal-page"),
      title: cleanText(options.title),
      paper: PAPER_TYPES.includes(options.paper)
        ? options.paper
        : options.paper === "blue"
          ? "plain"
          : "warm",
      createdAt: Number(options.createdAt) || now,
      updatedAt: Number(options.updatedAt) || now,
      elements: Array.isArray(options.elements)
        ? options.elements.map(normalizeElement).filter(Boolean)
        : []
    };
  }

  function normalizeElement(element = {}) {
    const type = ELEMENT_TYPES.includes(element.type) ? element.type : "";
    if (!type) return null;
    const normalized = {
      id: cleanText(element.id) || createId("journal-element"),
      type,
      x: clamp(element.x, 0, 960, type === "text" ? 160 : 120),
      y: clamp(element.y, 0, 1360, type === "text" ? 180 : 180),
      w: clamp(element.w, 40, 1000, type === "text" ? 680 : type === "tape" ? 300 : 520),
      h: clamp(element.h, 40, 1400, type === "text" ? 180 : type === "tape" ? 74 : 420),
      rotation: clamp(element.rotation, -180, 180, 0),
      z: clamp(element.z, 0, 9999, 1)
    };
    if (type === "text") {
      normalized.text = cleanText(element.text, "Write something…");
      normalized.font = ["serif", "sans", "hand"].includes(element.font) ? element.font : "serif";
      normalized.fontSize = clamp(element.fontSize, MIN_TEXT_SIZE, MAX_TEXT_SIZE, DEFAULT_TEXT_SIZE);
      normalized.color = /^#[0-9a-f]{6}$/i.test(element.color || "") ? element.color : "#352d26";
      normalized.background = /^#[0-9a-f]{6}$/i.test(element.background || "") ? element.background : "";
      normalized.borderColor = /^#[0-9a-f]{6}$/i.test(element.borderColor || "") ? element.borderColor : "";
      normalized.borderWidth = clamp(element.borderWidth, 0, 8, normalized.borderColor ? 1 : 0);
      normalized.padding = clamp(element.padding, 0, 48, 0);
      normalized.radius = clamp(element.radius, 0, 40, 0);
      normalized.align = ["left", "center", "right"].includes(element.align) ? element.align : "left";
      normalized.bold = element.bold === true;
      normalized.italic = element.italic === true;
    } else if (type === "image") {
      normalized.src = cleanText(element.src);
      normalized.alt = cleanText(element.alt, "Journal photo");
      normalized.fit = element.fit === "contain" ? "contain" : "cover";
      normalized.cropShape = ["original", "rectangle", "landscape", "portrait", "square", "circle", "arch-tall", "arch-short"].includes(element.cropShape)
        ? element.cropShape
        : "original";
      normalized.frameStyle = ["none", "hairline", "dashed", "double", "mat"].includes(element.frameStyle)
        ? element.frameStyle
        : "none";
    } else if (type === "shape") {
      normalized.shape = ["rectangle", "ellipse", "triangle", "diamond", "line"].includes(element.shape)
        ? element.shape
        : "rectangle";
      normalized.fill = /^#[0-9a-f]{6}$/i.test(element.fill || "") ? element.fill : "#f1dfbd";
      normalized.stroke = /^#[0-9a-f]{6}$/i.test(element.stroke || "") ? element.stroke : "#5b4b3d";
      normalized.strokeWidth = clamp(element.strokeWidth, 0, 16, 3);
    } else if (type === "sticker") {
      normalized.variant = ["note", "label", "star", "heart", "flower", "sparkles", "dot", "check"].includes(element.variant)
        ? element.variant
        : "note";
      normalized.label = cleanText(element.label);
      normalized.color = /^#[0-9a-f]{6}$/i.test(element.color || "") ? element.color : "#e3c99e";
    } else if (type === "tape") {
      normalized.color = /^#[0-9a-f]{6}$/i.test(element.color || "") ? element.color : "#d6b58d";
      normalized.pattern = ["solid", "stripe", "grid", "dots"].includes(element.pattern) ? element.pattern : "solid";
      normalized.opacity = clamp(element.opacity, 0.2, 1, 0.82);
    }
    normalized.x = Math.min(normalized.x, Math.max(0, 1000 - normalized.w));
    normalized.y = Math.min(normalized.y, Math.max(0, 1400 - normalized.h));
    return normalized;
  }

  function normalizePage(page = {}, index = 0) {
    return createPage({
      ...page,
      title: cleanText(page.title, `Page ${index + 1}`),
      elements: Array.isArray(page.elements) ? page.elements : []
    });
  }

  function createCoverCanvas(options = {}, context = {}) {
    const now = Number(options.updatedAt || options.createdAt || context.now) || Date.now();
    const side = context.side === "back" ? "back" : "front";
    const initialized = options.initialized === true;
    let elements = Array.isArray(options.elements)
      ? options.elements.map(normalizeElement).filter(Boolean)
      : [];
    if (!initialized && !elements.length && side === "front") {
      elements = [
        normalizeElement({
          id: `${context.journalId}-cover-title`,
          type: "text",
          text: context.title || "Journal",
          x: 140,
          y: 430,
          w: 720,
          h: 240,
          font: "serif",
          fontSize: 64,
          color: "#f5ecdf",
          align: "center",
          bold: true,
          z: 1
        }),
        normalizeElement({
          id: `${context.journalId}-cover-year`,
          type: "text",
          text: cleanText(options.subtitle, String(new Date(now).getFullYear())),
          x: 650,
          y: 1180,
          w: 220,
          h: 80,
          font: "sans",
          fontSize: 22,
          color: "#d8c9ba",
          align: "right",
          z: 2
        })
      ];
    }
    return {
      id: cleanText(options.id) || `${context.journalId}-${side}-cover`,
      kind: "cover",
      side,
      color: String(options.color).toLowerCase() === "#29334b"
        ? "#4b4036"
        : /^#[0-9a-f]{6}$/i.test(options.color || "") ? options.color : "#4b4036",
      subtitle: cleanText(options.subtitle, String(new Date(now).getFullYear())),
      initialized: true,
      createdAt: Number(options.createdAt) || now,
      updatedAt: Number(options.updatedAt) || now,
      elements
    };
  }

  function createJournal(options = {}) {
    const now = Number(options.now) || Date.now();
    const journalId = cleanText(options.id) || createId("journal");
    const title = cleanText(options.title, "Journal");
    const pageCount = Math.max(1, Math.min(100, Math.round(Number(options.pageCount) || 6)));
    return {
      version: VERSION,
      id: journalId,
      title,
      createdAt: Number(options.createdAt) || now,
      updatedAt: Number(options.updatedAt) || now,
      cover: createCoverCanvas(options.cover, { journalId, title, side: "front", now }),
      backCover: createCoverCanvas(options.backCover, { journalId, title, side: "back", now }),
      pages: Array.isArray(options.pages) && options.pages.length
        ? options.pages.map(normalizePage)
        : Array.from({ length: pageCount }, (_, index) => createPage({ title: `Page ${index + 1}`, now }))
    };
  }

  function normalizeJournal(input, options = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return createJournal(options);
    }
    const legacyPages = Array.isArray(input.pages)
      ? input.pages
      : Array.isArray(input.entries)
        ? input.entries
        : [];
    return createJournal({
      ...options,
      ...input,
      id: cleanText(input.id, options.id),
      title: cleanText(input.title, options.title || "Journal"),
      pages: legacyPages.length ? legacyPages : undefined,
      pageCount: legacyPages.length ? legacyPages.length : options.pageCount
    });
  }

  function clone(journal) {
    return JSON.parse(JSON.stringify(journal));
  }

  function touch(journal, now = Date.now()) {
    journal.updatedAt = Number(now) || Date.now();
    journal.version = VERSION;
    return journal;
  }

  function addPage(journal, afterId = "", pageOptions = {}) {
    const next = clone(normalizeJournal(journal));
    const page = createPage(pageOptions);
    const afterIndex = next.pages.findIndex((item) => item.id === afterId);
    next.pages.splice(afterIndex >= 0 ? afterIndex + 1 : next.pages.length, 0, page);
    touch(next);
    return { journal: next, page };
  }

  function duplicatePage(journal, pageId) {
    const next = clone(normalizeJournal(journal));
    const index = next.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return { journal: next, page: null };
    const source = next.pages[index];
    const page = createPage({
      ...source,
      id: createId("journal-page"),
      title: source.title ? `${source.title} copy` : "",
      elements: source.elements.map((element) => ({
        ...element,
        id: createId("journal-element")
      }))
    });
    next.pages.splice(index + 1, 0, page);
    touch(next);
    return { journal: next, page };
  }

  function deletePage(journal, pageId) {
    const next = clone(normalizeJournal(journal));
    if (next.pages.length <= 1) return { journal: next, removed: null };
    const index = next.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return { journal: next, removed: null };
    const [removed] = next.pages.splice(index, 1);
    touch(next);
    return { journal: next, removed };
  }

  function movePage(journal, pageId, toIndex) {
    const next = clone(normalizeJournal(journal));
    const fromIndex = next.pages.findIndex((page) => page.id === pageId);
    if (fromIndex < 0) return next;
    const target = Math.round(clamp(toIndex, 0, next.pages.length - 1, fromIndex));
    const [page] = next.pages.splice(fromIndex, 1);
    next.pages.splice(target, 0, page);
    touch(next);
    return next;
  }

  function updatePage(journal, pageId, patch = {}) {
    const next = clone(normalizeJournal(journal));
    const index = next.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return next;
    next.pages[index] = normalizePage({
      ...next.pages[index],
      ...patch,
      id: next.pages[index].id,
      updatedAt: Date.now()
    }, index);
    touch(next);
    return next;
  }

  function updateElement(journal, pageId, elementId, patch = {}) {
    const next = clone(normalizeJournal(journal));
    const page = next.pages.find((item) => item.id === pageId);
    if (!page) return next;
    const index = page.elements.findIndex((element) => element.id === elementId);
    if (index < 0) return next;
    page.elements[index] = normalizeElement({ ...page.elements[index], ...patch, id: elementId });
    page.updatedAt = Date.now();
    touch(next);
    return next;
  }

  return {
    VERSION,
    PAPER_TYPES,
    MIN_TEXT_SIZE,
    MAX_TEXT_SIZE,
    DEFAULT_TEXT_SIZE,
    createId,
    createPage,
    createJournal,
    normalizeElement,
    normalizeJournal,
    addPage,
    duplicatePage,
    deletePage,
    movePage,
    updatePage,
    updateElement
  };
});
