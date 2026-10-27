(function () {
  const GRAPH_EDGE_LABELS = {
    contains: "Hierarchy",
    "page-card": "page card",
    mention: "mention",
    backlink: "backlink",
    "database-row": "database row",
    relation: "relation",
    semantic: "semantic"
  };
  const GRAPH_SETTINGS_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.relationshipGraphSettings) || "sanctum.relationshipGraph.settings.v1";
  const DEFAULT_GRAPH_ACCENT = "#5b4936";
  const DEFAULT_TYPE_COLORS = {
    home: "#6f563a",
    domain: "#6f563a",
    hub: "#735942",
    project: "#7a6347",
    page: "#a8adb6",
    "database-row": "#777168"
  };
  const GRAPH_THEMES = {
    obsidian: { label: "Obsidian", accent: "#5b4936" },
    walnut: { label: "Walnut", accent: "#6f563a" },
    cedar: { label: "Cedar", accent: "#315d50" },
    ember: { label: "Ember", accent: "#694239" },
    moon: { label: "Moon", accent: "#4d5875" }
  };
  const GRAPH_EDGE_FILTER_TYPES = ["contains", "page-card", "mention", "semantic", "relation", "database-row"];
  const DEFAULT_EDGE_FILTERS = {
    contains: true,
    "page-card": true,
    mention: true,
    semantic: true,
    relation: true,
    "database-row": true
  };
  let graphModelCache = null;
  let graphModelRevision = "";

  function readGraphSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GRAPH_SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function writeGraphSettings(settings = {}) {
    try {
      localStorage.setItem(GRAPH_SETTINGS_KEY, JSON.stringify(settings));
    } catch (_error) {}
  }

  function getGraphAccent() {
    const settings = readGraphSettings();
    const value = String(settings.accent || "").trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_GRAPH_ACCENT;
  }

  function setGraphAccent(value = DEFAULT_GRAPH_ACCENT) {
    const next = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : DEFAULT_GRAPH_ACCENT;
    const settings = readGraphSettings();
    settings.accent = next;
    writeGraphSettings(settings);
    document.querySelectorAll(".relationship-graph-modal").forEach((modal) => {
      modal.style.setProperty("--relationship-graph-accent", next);
    });
  }

  function getGraphSettings() {
    const settings = readGraphSettings();
    const typeColors = settings.typeColors && typeof settings.typeColors === "object" ? settings.typeColors : {};
    const nodeColors = settings.nodeColors && typeof settings.nodeColors === "object" ? settings.nodeColors : {};
    return {
      accent: getGraphAccent(),
      showOrphans: settings.showOrphans === true,
      showDatabaseRows: settings.showDatabaseRows === true,
      theme: GRAPH_THEMES[settings.theme] ? settings.theme : "obsidian",
      colorMode: ["single", "node", "path", "level"].includes(settings.colorMode) ? settings.colorMode : "single",
      typeColors: {
        home: /^#[0-9a-f]{6}$/i.test(typeColors.home || "") ? typeColors.home : DEFAULT_TYPE_COLORS.home,
        domain: /^#[0-9a-f]{6}$/i.test(typeColors.domain || "") ? typeColors.domain : DEFAULT_TYPE_COLORS.domain,
        hub: /^#[0-9a-f]{6}$/i.test(typeColors.hub || "") ? typeColors.hub : DEFAULT_TYPE_COLORS.hub,
        project: /^#[0-9a-f]{6}$/i.test(typeColors.project || "") ? typeColors.project : DEFAULT_TYPE_COLORS.project,
        page: /^#[0-9a-f]{6}$/i.test(typeColors.page || "") ? typeColors.page : DEFAULT_TYPE_COLORS.page,
        "database-row": /^#[0-9a-f]{6}$/i.test(typeColors["database-row"] || "") ? typeColors["database-row"] : DEFAULT_TYPE_COLORS["database-row"]
      },
      nodeColors,
      centerForce: Number.isFinite(Number(settings.centerForce)) ? Math.max(0, Math.min(100, Number(settings.centerForce))) : 58,
      repelForce: Number.isFinite(Number(settings.repelForce)) ? Math.max(0, Math.min(100, Number(settings.repelForce))) : 42,
      linkForce: Number.isFinite(Number(settings.linkForce)) ? Math.max(0, Math.min(100, Number(settings.linkForce))) : 62,
      linkDistance: Number.isFinite(Number(settings.linkDistance)) ? Math.max(20, Math.min(220, Number(settings.linkDistance))) : 78,
      nodeSize: Number.isFinite(Number(settings.nodeSize)) ? Math.max(50, Math.min(180, Number(settings.nodeSize))) : 82,
      linkThickness: Number.isFinite(Number(settings.linkThickness)) ? Math.max(40, Math.min(180, Number(settings.linkThickness))) : 90,
      textFade: Number.isFinite(Number(settings.textFade)) ? Math.max(0, Math.min(12, Number(settings.textFade))) : 1,
      localDepth: Number.isFinite(Number(settings.localDepth)) ? Math.max(1, Math.min(4, Number(settings.localDepth))) : 2,
      searchIsolate: settings.searchIsolate === true,
      edgeFilters: normalizeEdgeFilters(settings.edgeFilters)
    };
  }

  function normalizeEdgeFilters(raw = {}) {
    const filters = { ...DEFAULT_EDGE_FILTERS };
    if (!raw || typeof raw !== "object") return filters;
    GRAPH_EDGE_FILTER_TYPES.forEach((type) => {
      if (typeof raw[type] === "boolean") filters[type] = raw[type];
    });
    return filters;
  }

  function updateGraphEdgeFilter(edgeType = "", enabled = true) {
    if (!GRAPH_EDGE_FILTER_TYPES.includes(edgeType)) return;
    const settings = readGraphSettings();
    settings.edgeFilters = normalizeEdgeFilters(settings.edgeFilters);
    settings.edgeFilters[edgeType] = enabled === true;
    writeGraphSettings(settings);
  }

  function updateGraphSetting(key, value) {
    const settings = readGraphSettings();
    if (key === "showOrphans") settings.showOrphans = value === true;
    else if (key === "showDatabaseRows") settings.showDatabaseRows = value === true;
    else if (key === "searchIsolate") settings.searchIsolate = value === true;
    else if (key === "localDepth") settings.localDepth = Math.max(1, Math.min(4, Number(value) || 2));
    else if (key === "colorMode") settings.colorMode = String(value || "single");
    else if (key === "theme") {
      const theme = GRAPH_THEMES[String(value || "")] ? String(value || "") : "obsidian";
      settings.theme = theme;
      settings.accent = GRAPH_THEMES[theme].accent;
    }
    else settings[key] = value;
    writeGraphSettings(settings);
  }

  function updateGraphNodeColor(nodeId = "", color = "") {
    if (!nodeId) return;
    const settings = readGraphSettings();
    const nodeColors = settings.nodeColors && typeof settings.nodeColors === "object" ? { ...settings.nodeColors } : {};
    if (/^#[0-9a-f]{6}$/i.test(String(color || ""))) nodeColors[nodeId] = color;
    else delete nodeColors[nodeId];
    settings.nodeColors = nodeColors;
    writeGraphSettings(settings);
  }

  function updateGraphTypeColor(type = "page", color = "") {
    if (!/^#[0-9a-f]{6}$/i.test(String(color || ""))) return;
    const settings = readGraphSettings();
    const typeColors = settings.typeColors && typeof settings.typeColors === "object" ? { ...settings.typeColors } : {};
    typeColors[type] = color;
    settings.typeColors = typeColors;
    writeGraphSettings(settings);
  }

  function syncGraphRangeFill(input) {
    if (!input || input.type !== "range") return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value || 0);
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--range-pct", `${Math.max(0, Math.min(100, pct))}%`);
  }

  function escapeHTML(value = "") {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCurrentId() {
    return typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home";
  }

  function clampText(value = "", fallback = "Untitled", maxLength = 28) {
    let text = String(value ?? "").replace(/\s+/g, " ").trim();
    const looksLikeBlob = /^data:image\//i.test(text)
      || /^https?:\/\/.+\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(text)
      || /^[A-Za-z0-9+/=]{48,}$/.test(text);
    if (!text || looksLikeBlob) text = fallback;
    if (text.length > maxLength) text = `${text.slice(0, Math.max(4, maxLength - 3)).trim()}...`;
    return text;
  }

  function getSafeIcon(value = "", type = "page") {
    const icon = String(value || "").trim();
    if (!icon || /^data:image\//i.test(icon) || /^https?:\/\//i.test(icon) || icon.length > 4) {
      if (type === "domain" || type === "home") return "Home";
      if (type === "hub") return "Hub";
      if (type === "database-row") return "Row";
      return "Page";
    }
    return icon;
  }

  function getPageRecords() {
    const domains = Array.isArray(window.userDomains) ? window.userDomains : [];
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    return [
      { id: "home", title: "Home", type: "home", icon: "Home", parent: "" },
      ...domains.map((domain) => ({ ...domain, type: "domain", icon: domain.icon || "Home", parent: "home" })),
      ...pages.map((page) => ({ ...page, type: "page", icon: page.icon || "Page" }))
    ];
  }

  function getRecordMap(canvasHosts = null) {
    const sources = getPageRecords();
    const map = new Map();

    sources.forEach((record) => {
      if (!record?.id) return;
      map.set(record.id, {
        id: record.id,
        type: record.containerType === "database-row"
          ? "database-row"
          : record.containerType === "hub"
            ? "hub"
            : record.containerType === "project"
              ? "project"
              : record.containerType === "detail"
                ? "detail"
                : (record.type || "page"),
        title: String(record.title || '').trim() || 'Untitled',
        icon: getSafeIcon(record.icon, record.type),
        category: clampText(window.SanctumCustomTypes?.label(record.category) || record.containerType || record.layout || "", "", 80),
        layout: record.layout || "",
        containerType: record.containerType || "",
        parent: "",
        databaseRowRef: record.databaseRowRef && typeof record.databaseRowRef === "object" ? record.databaseRowRef : null,
        knowledgeProperties: safeArray(record.knowledgeProperties)
      });
    });

    const hostMap = canvasHosts || buildCanvasHostMap(map);

    sources.forEach((record) => {
      if (!record?.id || !map.has(record.id)) return;
      const entry = map.get(record.id);
      entry.parent = resolveRecordParent(record, map, hostMap);
    });

    return map;
  }

  function addNode(nodes, node) {
    if (!node?.id || nodes.has(node.id)) return;
    nodes.set(node.id, {
      id: node.id,
      type: node.type || "page",
      title: String(node.title || '').trim() || 'Untitled',
      icon: getSafeIcon(node.icon, node.type),
      category: clampText(node.category || "", "", 18),
      layout: node.layout || "",
      containerType: node.containerType || "",
      parent: node.parent || ""
    });
  }

  function addEdge(edges, edge) {
    if (!edge?.from || !edge?.to || edge.from === edge.to) return;
    const type = edge.type || "reference";
    const key = `${edge.from}->${edge.to}->${type}`;
    const existing = edges.get(key);
    if (existing) {
      existing.count += 1;
      if (edge.label && !existing.label.split("; ").includes(edge.label)) existing.label += `; ${edge.label}`;
      return;
    }
    edges.set(key, {
      id: key,
      from: edge.from,
      to: edge.to,
      type,
      label: edge.label || GRAPH_EDGE_LABELS[type] || type,
      count: 1,
      source: edge.source || ""
    });
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeParseStoredJSON(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function resolveRecordParent(record = {}, records = null, canvasHosts = null) {
    const registryParent = String(record.parent || "").trim();
    const databaseParent = String(record.databaseRowRef?.sourcePageId || "").trim();
    const canvasHost = canvasHosts?.get(record.id) || "";
    const hasRecord = (id = "") => !records || records.has(id);

    if (registryParent && hasRecord(registryParent)) return registryParent;
    if (canvasHost && hasRecord(canvasHost)) return canvasHost;
    if (databaseParent && hasRecord(databaseParent)) return databaseParent;

    if (typeof window.getVaultTopLevelScopeId === "function" && record.id) {
      const scopeId = String(window.getVaultTopLevelScopeId(record.id) || "").trim();
      if (scopeId && scopeId !== record.id && hasRecord(scopeId)) return scopeId;
    }

    return registryParent || canvasHost || databaseParent || "";
  }

  function buildCanvasHostMap(records = new Map()) {
    const hosts = new Map();
    const allBlocks = getAllPageBlocks();

    const registerHost = (hostPageId = "", linkedPageId = "") => {
      const host = String(hostPageId || "").trim();
      const linked = String(linkedPageId || "").trim();
      if (!host || !linked || host === linked || !records.has(host) || !records.has(linked)) return;
      if (!hosts.has(linked)) hosts.set(linked, host);
    };

    const visit = (value, hostPageId = "", depth = 0) => {
      if (value == null || depth > 12) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => visit(entry, hostPageId, depth + 1));
        return;
      }
      if (typeof value !== "object") return;

      registerHost(hostPageId, value.linkedPageId || "");
      getBlockHTMLFields(value).split("\n").forEach((html) => {
        findPageIdsInHTML(html).forEach((targetId) => registerHost(hostPageId, targetId));
      });
      Object.values(value).forEach((entry) => visit(entry, hostPageId, depth + 1));
    };

    Object.entries(allBlocks).forEach(([hostPageId, blocks]) => {
      if (!records.has(hostPageId)) return;
      safeArray(blocks).forEach((block) => {
        visit(block, hostPageId);
        safeArray(block.containerItems).forEach((item) => visit(item, hostPageId));
      });
    });

    return hosts;
  }

  function getDatabaseRowRefKey(ref = {}, hostPageId = "", sourceBlockId = "", rowId = "") {
    const sourceKind = ref?.sourceKind === "block" ? "block" : "page";
    const pageId = String(ref?.sourcePageId || hostPageId || "").trim();
    const blockId = String(ref?.sourceBlockId || sourceBlockId || "").trim();
    const safeRowId = String(ref?.rowId || rowId || "").trim();
    if (!pageId || !safeRowId) return "";
    return `${sourceKind}:${pageId}:${blockId}:${safeRowId}`;
  }

  function buildDatabaseRowRefLookup() {
    const byRefKey = new Map();
    const byHostRow = new Map();
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    pages.forEach((page) => {
      const pageId = String(page?.id || "").trim();
      const ref = page?.databaseRowRef;
      if (!pageId || !ref || typeof ref !== "object") return;
      const key = getDatabaseRowRefKey(ref);
      if (key) byRefKey.set(key, pageId);
      const hostId = String(ref.sourcePageId || "").trim();
      const rowId = String(ref.rowId || "").trim();
      if (hostId && rowId) byHostRow.set(`${hostId}:${rowId}`, pageId);
    });
    return { byRefKey, byHostRow };
  }

  function resolveDatabaseRowPageId(database = {}, row = {}, rowRefIndexes = { byRefKey: new Map(), byHostRow: new Map() }) {
    const linkedPageId = String(row?.pageId || "").trim();
    if (linkedPageId) return linkedPageId;

    const sourceKind = database.sourceKind === "block" ? "block" : "page";
    const key = getDatabaseRowRefKey(
      { sourceKind },
      database.hostPageId || "",
      database.sourceBlockId || "",
      row?.id || ""
    );
    const fromRefKey = key ? String(rowRefIndexes.byRefKey?.get(key) || "").trim() : "";
    if (fromRefKey) return fromRefKey;

    const hostRowKey = `${database.hostPageId || ""}:${row?.id || ""}`;
    return String(rowRefIndexes.byHostRow?.get(hostRowKey) || "").trim();
  }

  function ensureCanvasHostedEdges(records, edges) {
    const allBlocks = getAllPageBlocks();
    const seen = new Set();

    const linkHostedPage = (hostPageId = "", targetPageId = "", source = "canvas-host") => {
      const host = String(hostPageId || "").trim();
      const target = String(targetPageId || "").trim();
      if (!host || !target || host === target || !records.has(host) || !records.has(target)) return;
      addCanvasPageLink(edges, host, target, source, seen);
    };

    const scanValue = (value, hostPageId = "", source = "canvas", depth = 0) => {
      if (value == null || depth > 12) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => scanValue(entry, hostPageId, source, depth + 1));
        return;
      }
      if (typeof value !== "object") return;

      const linkedPageId = String(value.linkedPageId || "").trim();
      if (linkedPageId) linkHostedPage(hostPageId, linkedPageId, value.id || source);

      getBlockHTMLFields(value).split("\n").forEach((html) => {
        findPageIdsInHTML(html).forEach((targetId) => linkHostedPage(hostPageId, targetId, value.id || source));
      });

      Object.values(value).forEach((entry) => scanValue(entry, hostPageId, source, depth + 1));
    };

    Object.entries(allBlocks).forEach(([hostPageId, blocks]) => {
      if (!records.has(hostPageId)) return;
      safeArray(blocks).forEach((block) => {
        scanValue(block, hostPageId, block.id || "block");
        safeArray(block.containerItems).forEach((item) => {
          scanValue(item, hostPageId, item.id || block.id || "container-item");
        });
      });
    });
  }

  function ensureProjectDescendantEdges(records, edges) {
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    const childrenByParent = new Map();

    pages.forEach((page) => {
      const pageId = String(page?.id || "").trim();
      const parentId = String(page?.parent || "").trim();
      if (!pageId || !parentId) return;
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId).push(pageId);
    });

    const collectDescendants = (rootId = "") => {
      const descendants = [];
      const stack = [String(rootId || "").trim()];
      const seen = new Set();
      while (stack.length) {
        const parentId = stack.pop();
        safeArray(childrenByParent.get(parentId)).forEach((childId) => {
          if (!childId || seen.has(childId)) return;
          seen.add(childId);
          descendants.push(childId);
          stack.push(childId);
        });
      }
      return descendants;
    };

    pages.forEach((page) => {
      const isProject = page?.containerType === "project" || page?.isScopeBoundary === true;
      if (!isProject) return;
      const projectId = String(page?.id || "").trim();
      if (!projectId || !records.has(projectId)) return;
      collectDescendants(projectId).forEach((childId) => {
        if (!records.has(childId)) return;
        addEdge(edges, { from: projectId, to: childId, type: "contains", source: "project-descendant" });
      });
    });
  }

  function getEmbedSourceFromBlock(block = {}) {
    const sourceKind = String(block.dbSourceKind || "").trim().toLowerCase();
    const pageId = String(block.dbSourcePageId || "").trim();
    const blockId = String(block.dbSourceBlockId || "").trim();
    if (sourceKind === "page" && pageId) return { kind: "page", pageId, blockId: "" };
    if (sourceKind === "block" && pageId && blockId) return { kind: "block", pageId, blockId };
    return null;
  }

  function getBlockDatabaseTitle(block = {}) {
    return String(block.calendarTitle || "").trim() || "Database";
  }

  function getGraphDatabaseCatalog() {
    const catalog = [];
    const seen = new Set();
    const allBlocks = getAllPageBlocks();

    const addEntry = (hostPageId = "", database = {}, meta = {}) => {
      const safeHost = String(hostPageId || "").trim();
      if (!safeHost || !database) return;
      const key = `${meta.sourceKind || "page"}:${safeHost}:${meta.sourceBlockId || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      catalog.push({
        hostPageId: safeHost,
        title: database.title || "Database",
        rows: safeArray(database.rows),
        ...meta
      });
    };

    Object.entries(getPageDatabases() || {}).forEach(([pageId, value]) => {
      const database = getDatabaseForPage(pageId, value);
      if (database) addEntry(pageId, database, { sourceKind: "page" });
    });

    Object.entries(allBlocks || {}).forEach(([hostPageId, blocks]) => {
      safeArray(blocks).forEach((block) => {
        if (!block || block.type !== "calendar" || !block.id) return;

        const embed = getEmbedSourceFromBlock(block);
        if (embed) {
          if (embed.kind === "page") {
            const database = getDatabaseForPage(embed.pageId, getPageDatabases()[embed.pageId]);
            if (database) addEntry(embed.pageId, database, { sourceKind: "page" });
            return;
          }
          const embedBlocks = safeArray(allBlocks[embed.pageId]);
          const embedBlock = embedBlocks.find((entry) => entry?.id === embed.blockId);
          if (embedBlock) {
            addEntry(embed.pageId, {
              title: getBlockDatabaseTitle(embedBlock),
              rows: safeParseStoredJSON(embedBlock.dbRows, [])
            }, { sourceKind: "block", sourceBlockId: embed.blockId });
          }
          return;
        }

        addEntry(hostPageId, {
          title: getBlockDatabaseTitle(block),
          rows: safeParseStoredJSON(block.dbRows, [])
        }, { sourceKind: "block", sourceBlockId: block.id });
      });
    });

    return catalog;
  }

  function getGraphDatabaseRowSignature() {
    const parts = [];
    getGraphDatabaseCatalog().forEach((entry) => {
      entry.rows.forEach((row) => {
        parts.push(`${entry.hostPageId}:${row?.id || ""}:${row?.pageId || ""}`);
      });
    });
    return parts.sort().join("|");
  }

  function findLayoutParentId(node = {}, nodeIds = new Set(), recordById = new Map(), parentHints = new Map()) {
    let parentId = String(parentHints.get(node.id) || node.parent || "").trim();
    const seen = new Set();
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      if (nodeIds.has(parentId)) return parentId;
      const parentRecord = recordById.get(parentId);
      parentId = resolveRecordParent(parentRecord || {}, recordById);
    }
    return "";
  }

  function addCanvasPageLink(edges, hostPageId = "", targetPageId = "", source = "", seen = null) {
    const host = String(hostPageId || "").trim();
    const target = String(targetPageId || "").trim();
    if (!host || !target || host === target) return;
    const pairKey = `${host}->${target}`;
    if (seen) {
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
    }
    addEdge(edges, { from: host, to: target, type: "page-card", label: "canvas link", source: source || "canvas" });
  }

  function extractCanvasLinksFromValue(value, hostPageId = "", records, edges, source = "canvas", seen = new Set(), depth = 0) {
    if (value == null || depth > 10) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => extractCanvasLinksFromValue(entry, hostPageId, records, edges, source, seen, depth + 1));
      return;
    }
    if (typeof value !== "object") return;

    const linkedPageId = String(value.linkedPageId || "").trim();
    if (linkedPageId && records.has(linkedPageId)) {
      addCanvasPageLink(edges, hostPageId, linkedPageId, value.id || source, seen);
    }

    const targetPageId = String(value.targetPageId || value.parentPageId || "").trim();
    if (targetPageId && records.has(targetPageId)) {
      addEdge(edges, { from: hostPageId, to: targetPageId, type: "mention", source: value.id || source || "button" });
    }

    Object.values(value).forEach((entry) => {
      extractCanvasLinksFromValue(entry, hostPageId, records, edges, source, seen, depth + 1);
    });
  }

  function extractCanvasLinksFromBlock(block = {}, hostPageId = "", records, edges, seen = new Set()) {
    if (!block || typeof block !== "object" || !hostPageId) return;
    extractCanvasLinksFromValue(block, hostPageId, records, edges, block.id || "block", seen);

    if (block.type === "button" && block.buttonConfig) {
      const config = safeParseStoredJSON(block.buttonConfig, {});
      extractCanvasLinksFromValue(config, hostPageId, records, edges, block.id || "button", seen);
    }

    const htmlFields = [
      block.titleHTML,
      block.bodyHTML,
      block.containerBody,
      block.tableHTML,
      block.pageCardSummary
    ];
    htmlFields.forEach((html) => {
      findPageIdsInHTML(html).forEach((targetId) => {
        if (records.has(targetId)) addCanvasPageLink(edges, hostPageId, targetId, block.id || "html", seen);
      });
      for (const match of String(html || "").matchAll(/data-callout-open-page=["']([^"']+)["']/g)) {
        if (match[1] && records.has(match[1])) addCanvasPageLink(edges, hostPageId, match[1], block.id || "callout", seen);
      }
    });

    const walkItems = (items, depth = 0) => {
      if (depth > 8) return;
      safeArray(items).forEach((item) => {
        extractCanvasLinksFromValue(item, hostPageId, records, edges, item?.id || block.id || "container-item", seen, 0);
        if (safeArray(item?.containerItems).length) walkItems(item.containerItems, depth + 1);
      });
    };
    walkItems(block.containerItems);
  }

  function ensureVaultParentEdges(records, edges, canvasHosts = null) {
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    pages.forEach((page) => {
      const pageId = String(page?.id || "").trim();
      if (!pageId || !records.has(pageId)) return;
      const parentId = resolveRecordParent(page, records, canvasHosts);
      if (!parentId || !records.has(parentId)) return;
      addEdge(edges, { from: parentId, to: pageId, type: "contains", source: "vault-parent" });
    });
  }

  function buildEffectiveParentMap(nodes = [], edges = [], recordById = new Map()) {
    const map = new Map();
    nodes.forEach((node) => {
      const record = recordById.get(node.id) || node;
      const parentId = resolveRecordParent(record, recordById);
      if (parentId) map.set(node.id, parentId);
    });
    edges.forEach((edge) => {
      if (edge.type === "contains" && !map.has(edge.to)) map.set(edge.to, edge.from);
    });
    edges.forEach((edge) => {
      if (edge.type === "page-card" && !map.has(edge.to)) map.set(edge.to, edge.from);
    });
    return map;
  }

  function applyEffectiveParents(nodes = [], edges = [], recordById = new Map()) {
    const parentMap = buildEffectiveParentMap(nodes, edges, recordById);
    return nodes.map((node) => ({
      ...node,
      parent: parentMap.get(node.id) || node.parent || ""
    }));
  }

  function getAllPageBlocks() {
    if (typeof window.readAllPageBlocks === "function") return window.readAllPageBlocks() || {};
    const key = window.STORAGE_KEYS?.pageBlocks || "sanctum_page_blocks";
    return window.readStorageJSON?.(key, {}) || {};
  }

  function getBlockContainerItems(block = {}) {
    return safeArray(block.containerItems);
  }

  function getBlockHTMLFields(block = {}) {
    const fields = [
      block.titleHTML,
      block.bodyHTML,
      block.body,
      block.containerBody,
      block.pageCardSummary
    ];
    getBlockContainerItems(block).forEach((item) => {
      fields.push(item.bodyHTML, item.titleHTML, item.pageCardSummary);
    });
    return fields.filter(Boolean).join("\n");
  }

  function findPageIdsInHTML(html = "") {
    const ids = new Set();
    const text = String(html || "");
    const patterns = [
      /data-page-id=["']([^"']+)["']/g,
      /data-linked-page-id=["']([^"']+)["']/g,
      /data-link-page-id=["']([^"']+)["']/g
    ];
    patterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) ids.add(match[1]);
      }
    });
    return Array.from(ids);
  }

  function findPageIdsInValue(value, records) {
    const ids = new Set();
    const visit = (entry) => {
      if (entry == null) return;
      if (typeof entry === "string") {
        records.forEach((_record, pageId) => {
          if (entry.includes(pageId)) ids.add(pageId);
        });
        return;
      }
      if (Array.isArray(entry)) {
        entry.forEach(visit);
        return;
      }
      if (typeof entry === "object") {
        ["id", "pageId", "linkedPageId", "targetPageId", "targetId", "value"].forEach((key) => {
          if (entry[key]) visit(entry[key]);
        });
      }
    };
    visit(value);
    return Array.from(ids);
  }

  function addSemanticEdgesFromObject(edges, records, fromId = "", source = "", object = {}) {
    if (!fromId || !object || typeof object !== "object") return;
    [
      "relatedPageIds",
      "semanticPageIds",
      "relationPageIds",
      "referencePageIds",
      "references",
      "relations",
      "linkedPages"
    ].forEach((key) => {
      findPageIdsInValue(object[key], records).forEach((targetId) => {
        if (records.has(targetId)) addEdge(edges, { from: fromId, to: targetId, type: "semantic", source });
      });
    });
  }

  function findWikiMentionPageIds(text = "", records) {
    const ids = [];
    const byTitle = new Map();
    records.forEach((record, id) => {
      const title = String(record.title || "").trim().toLowerCase();
      if (title) byTitle.set(title, id);
    });
    for (const match of String(text || "").matchAll(/\[\[([^\]]+)\]\]/g)) {
      const title = String(match[1] || "").split("|")[0].trim().toLowerCase();
      const id = byTitle.get(title);
      if (id) ids.push(id);
    }
    return ids;
  }

  function readDocuments() {
    const key = window.STORAGE_KEYS?.documents || "sanctum_documents";
    return window.readStorageJSON?.(key, {}) || {};
  }

  function getPageDatabases() {
    const key = window.STORAGE_KEYS?.pageDatabases || "sanctum_page_databases";
    return window.readStorageJSON?.(key, {}) || {};
  }

  function getDatabaseForPage(pageId, value) {
    if (!value || typeof value !== "object") return null;
    if (Array.isArray(value.rows) || Array.isArray(value.properties)) {
      return {
        id: value.id || `database:${pageId}`,
        pageId,
        title: value.title || "Database",
        rows: safeArray(value.rows),
        properties: safeArray(value.properties)
      };
    }
    if (value.database && typeof value.database === "object") {
      return getDatabaseForPage(pageId, value.database);
    }
    return null;
  }

  function getDatabaseEntries() {
    const raw = getPageDatabases();
    if (!raw || typeof raw !== "object") return [];
    return Object.entries(raw)
      .map(([pageId, value]) => getDatabaseForPage(pageId, value))
      .filter(Boolean);
  }

  function getGraphDataRevision() {
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    const domains = Array.isArray(window.userDomains) ? window.userDomains : [];
    const blocks = getAllPageBlocks();
    const documents = readDocuments();
    const databases = getPageDatabases();
    let blockCount = 0;
    Object.values(blocks).forEach((entry) => {
      if (Array.isArray(entry)) blockCount += entry.length;
    });
    return [
      pages.length,
      domains.length,
      pages.map((page) => `${page.id}:${page.parent || ""}:${page.containerType || ""}:${page.databaseRowRef?.sourcePageId || ""}:${page.databaseRowRef?.rowId || ""}:${page.databaseRowRef?.sourceBlockId || ""}`).sort().join("|"),
      domains.map((domain) => domain.id).sort().join(","),
      Object.keys(blocks).sort().join(","),
      blockCount,
      Object.keys(documents).sort().join(","),
      Object.keys(databases).sort().join(","),
      getGraphDatabaseRowSignature(),
      JSON.stringify(readRelationProperties())
    ].join("|");
  }

  function invalidateRelationshipGraphCache() {
    graphModelCache = null;
    graphModelRevision = "";
  }

  function readRelationProperties() {
    return window.readStorageJSON?.(window.STORAGE_KEYS?.pageProps || "sanctum_page_props_v1", {}) || {};
  }

  function isSyntheticDatabaseRowNodeId(nodeId = "") {
    return String(nodeId || "").startsWith("dbrow:");
  }

  function passesDatabaseEdgeRules(edge = {}, settings = getGraphSettings()) {
    if (!settings.showDatabaseRows) {
      if (edge.type === "database-row") {
        return !isSyntheticDatabaseRowNodeId(edge.to) && !isSyntheticDatabaseRowNodeId(edge.from);
      }
      if (edge.type === "relation" && (isSyntheticDatabaseRowNodeId(edge.from) || isSyntheticDatabaseRowNodeId(edge.to))) {
        return false;
      }
    }
    return true;
  }

  function isRenderableGraphEdge(edge = {}) {
    return !!edge && edge.type !== "backlink";
  }

  function filterEdgesForDisplay(edges = [], settings = getGraphSettings()) {
    const filters = settings.edgeFilters || DEFAULT_EDGE_FILTERS;
    return safeArray(edges).filter((edge) => {
      if (!isRenderableGraphEdge(edge)) return false;
      if (!passesDatabaseEdgeRules(edge, settings)) return false;
      return filters[edge.type] !== false;
    });
  }

  function filterEdgesForExpansion(edges = [], settings = getGraphSettings()) {
    return filterEdgesForDisplay(edges, settings);
  }

  function filterGraphNodes(nodes = [], settings = getGraphSettings()) {
    return settings.showDatabaseRows
      ? safeArray(nodes)
      : safeArray(nodes).filter((node) => node.type !== "database-row");
  }

  function getGraphModel() {
    const revision = getGraphDataRevision();
    if (graphModelCache && graphModelRevision === revision) {
      return graphModelCache;
    }

    const nodes = new Map();
    const edges = new Map();
    const provisionalRecords = new Map(getPageRecords().filter((record) => record?.id).map((record) => [record.id, record]));
    const canvasHosts = buildCanvasHostMap(provisionalRecords);
    const records = getRecordMap(canvasHosts);

    records.forEach((record) => addNode(nodes, record));
    records.forEach((record) => addSemanticEdgesFromObject(edges, records, record.id, "record", record));

    records.forEach((record) => {
      if (record.id === "home") return;
      let parentId = resolveRecordParent(record, records, canvasHosts) || (record.type === "domain" ? "home" : "");
      if (!parentId || !records.has(parentId)) return;
      addEdge(edges, {
        from: parentId,
        to: record.id,
        type: "contains",
        source: record.databaseRowRef?.sourcePageId ? "database-row-ref" : "registry"
      });
    });

    records.forEach((record) => {
      const databaseSourceId = String(record.databaseRowRef?.sourcePageId || "").trim();
      const rowId = String(record.databaseRowRef?.rowId || "").trim();
      if (!databaseSourceId || databaseSourceId === record.id || !records.has(databaseSourceId)) return;
      addEdge(edges, {
        from: databaseSourceId,
        to: record.id,
        type: "database-row",
        label: record.containerType === "project" ? "database project" : "database item",
        source: rowId || "database-row-ref"
      });
    });

    const allBlocks = getAllPageBlocks();
    const canvasLinkSeen = new Set();
    Object.entries(allBlocks).forEach(([hostPageId, blocks]) => {
      if (!records.has(hostPageId)) return;
      safeArray(blocks).forEach((block) => {
        extractCanvasLinksFromBlock(block, hostPageId, records, edges, canvasLinkSeen);

        const blockText = getBlockHTMLFields(block);
        findPageIdsInHTML(blockText).forEach((targetId) => {
          if (records.has(targetId)) {
            addEdge(edges, { from: hostPageId, to: targetId, type: "mention", source: block.id || "" });
          }
        });
        findWikiMentionPageIds(blockText, records).forEach((targetId) => {
          addEdge(edges, { from: hostPageId, to: targetId, type: "semantic", source: block.id || "" });
        });

        addSemanticEdgesFromObject(edges, records, hostPageId, block.id || "block", block);
        getBlockContainerItems(block).forEach((item) => {
          addSemanticEdgesFromObject(edges, records, hostPageId, item.id || block.id || "container-item", item);
        });
      });
    });

    ensureVaultParentEdges(records, edges, canvasHosts);
    ensureCanvasHostedEdges(records, edges);

    records.forEach((record) => {
      safeArray(record.knowledgeProperties).forEach((property) => {
        if (property?.type !== "relation" || !property.relationPageId || !records.has(property.relationPageId)) return;
        addEdge(edges, {
          from: record.id,
          to: property.relationPageId,
          type: "relation",
          label: property.name || "field link",
          source: property.id || "page-field"
        });
      });
    });

    (window.SanctumPageRelations?.collect(Array.from(records.values()), readRelationProperties()) || []).forEach(relation => {
      addEdge(edges, {
        ...relation, type: "relation", source: `page-property:${relation.propertyId}`,
        label: [relation.label, relation.detail].filter(Boolean).join(" · ")
      });
    });

    const documents = readDocuments();
    Object.entries(documents).forEach(([docPageId, documentData]) => {
      if (!records.has(docPageId)) return;
      safeArray(documentData?.sections).forEach((section) => {
        const sectionText = section?.content || "";
        findPageIdsInHTML(sectionText).forEach((targetId) => {
          if (records.has(targetId)) {
            addEdge(edges, { from: docPageId, to: targetId, type: "mention", source: section.id || "" });
          }
        });
        findWikiMentionPageIds(sectionText, records).forEach((targetId) => {
          addEdge(edges, { from: docPageId, to: targetId, type: "semantic", source: section.id || "" });
        });
      });
    });

    const rowRefIndexes = buildDatabaseRowRefLookup();

    getGraphDatabaseCatalog().forEach((database) => {
      const hostPageId = database.hostPageId;
      if (!records.has(hostPageId)) return;
      safeArray(database.rows).forEach((row, rowIndex) => {
        const resolvedPageId = resolveDatabaseRowPageId(database, row, rowRefIndexes);
        const rowPageId = resolvedPageId && records.has(resolvedPageId) ? resolvedPageId : "";
        const syntheticId = `dbrow:${hostPageId}:${row.id || rowIndex}`;
        const rowId = rowPageId || syntheticId;
        if (!rowPageId) {
          const rowTitle = String(row?.title || row?.values?.name || "").trim() || `Row ${rowIndex + 1}`;
          addNode(nodes, {
            id: syntheticId,
            type: "database-row",
            title: rowTitle,
            icon: "Row",
            category: database.title || "Database",
            parent: hostPageId
          });
        } else {
          addEdge(edges, {
            from: hostPageId,
            to: rowPageId,
            type: "contains",
            label: "database host",
            source: database.sourceBlockId || database.sourceKind || "database"
          });
        }
        addEdge(edges, {
          from: hostPageId,
          to: rowId,
          type: "database-row",
          label: database.title || "database row",
          source: database.sourceBlockId || database.sourceKind || "database"
        });

        Object.values(row.values || {}).forEach((value) => {
          const safeValue = String(value || "");
          records.forEach((_record, pageId) => {
            if (safeValue.includes(pageId)) {
              addEdge(edges, { from: rowId, to: pageId, type: "relation", source: database.sourceBlockId || hostPageId });
            }
          });
        });
        addSemanticEdgesFromObject(edges, records, rowId, database.sourceBlockId || hostPageId, row);
      });
    });

    Array.from(edges.values()).forEach((edge) => {
      if (nodes.has(edge.from) && nodes.has(edge.to)) {
        addEdge(edges, { from: edge.to, to: edge.from, type: "backlink", source: edge.id });
      }
    });

    const model = {
      nodes: Array.from(nodes.values()),
      edges: Array.from(edges.values())
    };
    graphModelCache = model;
    graphModelRevision = revision;
    return model;
  }

  function getLocalGraph(focusId = getCurrentId(), depth = 2, settings = getGraphSettings()) {
    const model = getGraphModel();
    const nodesById = new Map(model.nodes.map((node) => [node.id, node]));
    const expansionEdges = filterEdgesForExpansion(model.edges, settings);
    const displayEdges = filterEdgesForDisplay(model.edges, settings);
    const selected = new Set(nodesById.has(focusId) ? [focusId] : [getCurrentId()]);

    for (let level = 0; level < Math.max(1, depth); level += 1) {
      const next = new Set(selected);
      expansionEdges.forEach((edge) => {
        if (selected.has(edge.from)) next.add(edge.to);
        if (selected.has(edge.to)) next.add(edge.from);
      });
      next.forEach((id) => selected.add(id));
    }

    const visibleNodes = filterGraphNodes(
      Array.from(selected).map((id) => nodesById.get(id)).filter(Boolean),
      settings
    );
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const edges = displayEdges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
    return {
      focusId: visibleIds.has(focusId) ? focusId : visibleNodes[0]?.id || focusId,
      nodes: visibleNodes,
      edges
    };
  }

  function getGlobalGraph(settings = getGraphSettings()) {
    const model = getGraphModel();
    const visibleNodes = filterGraphNodes(model.nodes, settings);
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const expansionEdges = filterEdgesForExpansion(model.edges, settings).filter((edge) => (
      visibleIds.has(edge.from) && visibleIds.has(edge.to)
    ));
    const visibleEdges = filterEdgesForDisplay(model.edges, settings).filter((edge) => (
      visibleIds.has(edge.from) && visibleIds.has(edge.to)
    ));
    const degrees = getNodeDegrees(visibleNodes, expansionEdges);
    const filteredNodes = settings.showOrphans
      ? visibleNodes
      : visibleNodes.filter((node) => node.id === "home" || (degrees.get(node.id) || 0) > 0);
    const filteredIds = new Set(filteredNodes.map((node) => node.id));
    const filteredEdges = visibleEdges.filter((edge) => filteredIds.has(edge.from) && filteredIds.has(edge.to));
    return {
      focusId: "home",
      nodes: filteredNodes,
      edges: filteredEdges,
      hiddenCount: model.nodes.length - filteredNodes.length
    };
  }

  function getGraphForMode(mode = "local", focusId = getCurrentId(), settings = getGraphSettings()) {
    if (mode === "global") return getGlobalGraph(settings);
    return getLocalGraph(focusId, settings.localDepth, settings);
  }

  function removeGraphModal() {
    const overlay = document.querySelector(".relationship-graph-overlay");
    overlay?.__cleanup?.();
    overlay?.remove();
  }

  function getNodeClass(type = "") {
    if (type === "home") return "home";
    if (type === "domain") return "domain";
    if (type === "hub") return "hub";
    if (type === "project") return "project";
    if (type === "database-row") return "row";
    return "page";
  }

  function hashNumber(value = "") {
    let hash = 2166136261;
    String(value || "").split("").forEach((char) => {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return Math.abs(hash >>> 0);
  }

  function getNodeDegrees(nodes = [], edges = []) {
    const degrees = new Map(nodes.map((node) => [node.id, 0]));
    bundleGraphEdges(edges).forEach((edge) => {
      if (degrees.has(edge.from)) degrees.set(edge.from, degrees.get(edge.from) + 1);
      if (degrees.has(edge.to)) degrees.set(edge.to, degrees.get(edge.to) + 1);
    });
    return degrees;
  }

  // A pair has one spring and one visible line, regardless of how many sources link it.
  // Keep the original directed relationships for the inspector.
  function bundleGraphEdges(edges = []) {
    const pairs = new Map();
    edges.flatMap((edge) => edge.relationships || [edge]).forEach((edge) => {
      if (edge.from === edge.to) return;
      const id = JSON.stringify([edge.from, edge.to].sort());
      let pair = pairs.get(id);
      if (!pair) {
        pair = { ...edge, id, types: [], relationships: [] };
        pairs.set(id, pair);
      }
      if (!pair.types.includes(edge.type)) pair.types.push(edge.type);
      pair.relationships.push(edge);
      if (edge.type === "contains") pair.type = "contains";
    });
    return Array.from(pairs.values());
  }

  function getNodeRadius(node = {}, degree = 0, mode = "local", settings = getGraphSettings()) {
    const scale = (settings.nodeSize || 100) / 100;
    const influence = Math.sqrt(Math.max(0, degree));
    if (node.type === "home") return Math.min(21, 10.5 + influence * 1.35) * scale;
    if (node.type === "domain") return Math.min(19, 8.2 + influence * 1.45) * scale;
    if (node.type === "hub" || node.containerType === "hub") return Math.min(17, 7 + influence * 1.18) * scale;
    if (node.containerType === "project") return Math.min(15, 5.8 + influence * 1.05) * scale;
    if (node.type === "database-row") return Math.min(5.4, 2.4 + influence * 0.42) * scale;
    if (node.layout === "database") return Math.min(8.5, 3.4 + influence * 0.68) * scale;
    return Math.min(mode === "global" ? 12 : 13, 4.4 + influence * 0.9) * scale;
  }

  function getNodeTypeColorKey(node = {}) {
    if (node.type === "home") return "home";
    if (node.type === "domain") return "domain";
    if (node.type === "hub" || node.containerType === "hub") return "hub";
    if (node.containerType === "project") return "project";
    if (node.type === "database-row") return "database-row";
    return "page";
  }

  function findRootDomain(node = {}, nodeById = new Map()) {
    let cursor = node;
    const seen = new Set();
    while (cursor?.parent && !seen.has(cursor.parent)) {
      seen.add(cursor.parent);
      const parent = nodeById.get(cursor.parent);
      if (!parent) break;
      if (parent.type === "domain") return parent;
      cursor = parent;
    }
    return node.type === "domain" ? node : null;
  }

  function generatedPathColor(node = {}) {
    const palette = ["#6f563a", "#694239", "#315d50", "#4d5875", "#6a5a35", "#5c4a65", "#53643c"];
    return palette[hashNumber(node.id || node.title || "path") % palette.length];
  }

  function findNearestColoredAncestor(node = {}, nodeById = new Map(), settings = getGraphSettings()) {
    let cursor = node;
    const seen = new Set();
    while (cursor?.id && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      const direct = settings.nodeColors?.[cursor.id];
      if (/^#[0-9a-f]{6}$/i.test(String(direct || ""))) {
        return { node: cursor, color: direct };
      }
      cursor = cursor.parent ? nodeById.get(cursor.parent) : null;
    }
    return null;
  }

  function resolveGraphNodeColor(node = {}, nodeById = new Map(), settings = getGraphSettings()) {
    const direct = settings.nodeColors?.[node.id];
    if (settings.colorMode === "node") return direct || settings.accent;
    if (settings.colorMode === "level") return settings.typeColors?.[getNodeTypeColorKey(node)] || settings.accent;
    if (settings.colorMode === "path") {
      const inherited = findNearestColoredAncestor(node, nodeById, settings);
      if (inherited?.color) return inherited.color;
      const root = findRootDomain(node, nodeById) || (node.type === "home" ? node : null);
      if (root) return settings.nodeColors?.[root.id] || generatedPathColor(root);
      return direct || settings.accent;
    }
    return direct || settings.accent;
  }

  function layoutGraph(nodes = [], edges = [], focusId = "", width = 900, height = 560, mode = "local", settings = getGraphSettings()) {
    const cx = width / 2;
    const cy = height / 2;
    const recordById = getRecordMap();
    const laidOutNodes = applyEffectiveParents(nodes, edges, recordById);
    const degrees = getNodeDegrees(laidOutNodes, edges);
    if (mode === 'global') {
      return layoutGlobalBranches(laidOutNodes.map((node) => ({
        ...node, degree: degrees.get(node.id) || 0,
        radius: getNodeRadius(node, degrees.get(node.id) || 0, mode, settings)
      })), width, height, settings);
    }
    const positions = new Map();
    const nodeIds = new Set(laidOutNodes.map((node) => node.id));
    const parentHints = buildEffectiveParentMap(laidOutNodes, edges, recordById);
    const spread = Math.min(width, height) * (mode === "global" ? 0.30 : 0.38);

    const domainNodes = laidOutNodes.filter((node) => node.type === "domain" || node.type === "home");
    domainNodes.forEach((node, index) => {
      const seed = hashNumber(node.id || index);
      const angle = node.type === "home"
        ? -Math.PI / 2
        : ((index - 1) / Math.max(1, domainNodes.length - 1)) * Math.PI * 2 - Math.PI / 2;
      const ring = node.type === "home" ? 0 : 0.44 + ((seed % 140) / 700);
      positions.set(node.id, {
        x: cx + Math.cos(angle) * spread * ring,
        y: cy + Math.sin(angle) * spread * ring,
        vx: 0,
        vy: 0
      });
    });

    laidOutNodes
      .filter((node) => node.type !== "domain" && node.type !== "home")
      .forEach((node, index) => {
        const seed = hashNumber(node.id || index);
        const layoutParentId = findLayoutParentId(node, nodeIds, recordById, parentHints);
        const parent = positions.get(layoutParentId);
        const angle = ((seed % 360) / 360) * Math.PI * 2;
        const ring = 0.24 + ((seed % 1000) / 1000) * 0.34;
        positions.set(node.id, {
          x: (parent?.x ?? cx) + Math.cos(angle) * spread * ring,
          y: (parent?.y ?? cy) + Math.sin(angle) * spread * ring,
          vx: 0,
          vy: 0
        });
      });

    const focusPosition = positions.get(focusId);
    if (focusPosition) {
      focusPosition.x = cx;
      focusPosition.y = cy;
    }

    const laidOut = laidOutNodes.map((node) => ({
      ...node, ...positions.get(node.id),
      degree: degrees.get(node.id) || 0,
      radius: getNodeRadius(node, degrees.get(node.id) || 0, mode, settings)
    }));
    const nodeById = new Map(laidOut.map((node) => [node.id, node]));
    const links = bundleGraphEdges(edges);
    for (let i = 0; i < 200; i += 1) {
      stepGraphPhysics(laidOut, links, nodeById, width, height, settings, 1 - i / 240);
    }
    return laidOut;
  }

  // Pack page groups, not individual dots. A database with many rows needs its
  // own footprint; cross-links must not pull unrelated branches into that space.
  function layoutGlobalBranches(nodes, width, height, settings) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const parents = new Set(nodes.map(node => node.parent).filter(id => byId.has(id)));
    const groups = new Map(), owner = new Map();
    const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
    // A hub owns its immediate leaf pages. Nested hubs get separate footprints,
    // rather than recursively inflating the radius of every ancestor.
    ordered.forEach(node => {
      const id = !parents.has(node.id) && byId.has(node.parent) ? node.parent : node.id;
      owner.set(node.id, id);
      if (!groups.has(id)) groups.set(id, { id, nodes: [], neighbors: new Set() });
      groups.get(id).nodes.push(node);
    });
    const gap = 24 + (settings.linkDistance ?? 78) * 0.22;
    groups.forEach(group => {
      const hub = byId.get(group.id);
      const placed = [{ x: 0, y: 0, radius: hub.radius + 16 }];
      group.radius = hub.radius + 16;
      group.nodes.sort((a,b) => a.id.localeCompare(b.id));
      group.nodes = group.nodes.map(node => {
        const position = node.id === group.id ? { x: 0, y: 0 } : placeGraphBranch(placed, node.radius + 10, gap);
        if (node.id !== group.id) placed.push({ ...position, radius: node.radius + 10 });
        group.radius = Math.max(group.radius, Math.hypot(position.x, position.y) + node.radius + 18);
        return { ...node, ...position };
      });
    });
    nodes.forEach(node => {
      const a = owner.get(node.id), b = owner.get(node.parent);
      if (a && b && a !== b) { groups.get(a).neighbors.add(b); groups.get(b).neighbors.add(a); }
    });
    const pending = [...groups.values()], placed = [], positioned = new Map(), result = [];
    while (pending.length) {
      const connections = g => [...g.neighbors].filter(id => positioned.has(id)).length;
      pending.sort((a,b) => connections(b) - connections(a) ||
        (positioned.size === 0 ? Number(b.id === 'home') - Number(a.id === 'home') : 0) || b.radius - a.radius || a.id.localeCompare(b.id));
      const group = pending.shift();
      const neighbors = [...group.neighbors].map(id => positioned.get(id)).filter(Boolean);
      const target = neighbors.length ? {
        x: neighbors.reduce((sum, p) => sum + p.x, 0) / neighbors.length,
        y: neighbors.reduce((sum, p) => sum + p.y, 0) / neighbors.length
      } : { x: 0, y: 0 };
      const position = placed.length ? placeGraphBranch(placed, group.radius, gap * 2, target) : { x: 0, y: 0 };
      placed.push({ ...position, radius: group.radius });
      positioned.set(group.id, position);
      group.nodes.forEach(node => result.push({ ...node, x: node.x + position.x, y: node.y + position.y }));
    }
    if (!result.length) return [];
    const cx = (Math.min(...result.map(n => n.x)) + Math.max(...result.map(n => n.x))) / 2;
    const cy = (Math.min(...result.map(n => n.y)) + Math.max(...result.map(n => n.y))) / 2;
    return result.map(node => {
      const x = node.x - cx + width / 2, y = node.y - cy + height / 2;
      return { ...node, x, y, vx: 0, vy: 0, anchorX: x, anchorY: y };
    });
  }

  function placeGraphBranch(placed, radius, gap, target = { x: 0, y: 0 }) {
    let best = null, bestScore = Infinity;
    const consider = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (placed.some((circle) => Math.hypot(x - circle.x, y - circle.y) < radius + circle.radius + gap - 0.01)) return;
      const score = Math.hypot(x - target.x, y - target.y) + Math.hypot(x, y) * 0.25;
      if (score < bestScore - 0.01) { best = { x, y }; bestScore = score; }
    };
    placed.forEach((a, index) => {
      const ra = a.radius + radius + gap;
      for (let step = 0; step < 12; step += 1) {
        const angle = step * Math.PI / 6 - Math.PI / 2;
        consider(a.x + Math.cos(angle) * ra, a.y + Math.sin(angle) * ra);
      }
      placed.slice(0, index).forEach((b) => {
        const rb = b.radius + radius + gap;
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
        if (!distance || distance > ra + rb || distance < Math.abs(ra - rb)) return;
        const along = (ra * ra - rb * rb + distance * distance) / (2 * distance);
        const across = Math.sqrt(Math.max(0, ra * ra - along * along));
        const x = a.x + along * dx / distance, y = a.y + along * dy / distance;
        consider(x - across * dy / distance, y + across * dx / distance);
        consider(x + across * dy / distance, y - across * dx / distance);
      });
    });
    // Deterministic safe fallback for floating-point degeneracies.
    return best || { x: Math.max(...placed.map(c => c.x + c.radius)) + radius + gap, y: 0 };
  }

  function stepGraphPhysics(nodes, edges, byId, width, height, settings, energy) {
    const repel = 8000 * (settings.repelForce ?? 42) / 42;
    const spring = 0.025 * (settings.linkForce ?? 62) / 62;
    const center = 0.0012 * (settings.centerForce ?? 58) / 58;
    for (let a = 0; a < nodes.length; a += 1) {
      for (let b = a + 1; b < nodes.length; b += 1) {
        const left = nodes[a], right = nodes[b];
        const dx = right.x - left.x || 0.1, dy = right.y - left.y || 0.1;
        const distance = Math.max(1, Math.hypot(dx, dy));
        // Collision spacing remains active even when repulsion is switched off.
        const gap = (left.radius || 5) + (right.radius || 5) + 24;
        const force = (repel / Math.max(100, distance * distance) + Math.max(0, gap - distance) * 0.35) * energy;
        const fx = dx / distance * force, fy = dy / distance * force;
        if (!left.fixed) { left.vx -= fx; left.vy -= fy; }
        if (!right.fixed) { right.vx += fx; right.vy += fy; }
      }
    }
    edges.forEach((edge) => {
      const from = byId.get(edge.from), to = byId.get(edge.to);
      if (!from || !to) return;
      const dx = to.x - from.x, dy = to.y - from.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const anchored = Number.isFinite(from.anchorX) && Number.isFinite(to.anchorX);
      const length = anchored
        ? Math.hypot(to.anchorX - from.anchorX, to.anchorY - from.anchorY)
        : (settings.linkDistance ?? 78) + from.radius + to.radius;
      const force = (distance - length) * spring * energy;
      const fx = dx / distance * force, fy = dy / distance * force;
      if (!from.fixed) { from.vx += fx; from.vy += fy; }
      if (!to.fixed) { to.vx -= fx; to.vy -= fy; }
    });
    nodes.forEach((node) => {
      if (node.fixed) return;
      const anchored = Number.isFinite(node.anchorX);
      const pull = anchored ? 0.08 + center : center;
      node.vx = (node.vx + ((anchored ? node.anchorX : width / 2) - node.x) * pull * energy) * 0.65;
      node.vy = (node.vy + ((anchored ? node.anchorY : height / 2) - node.y) * pull * energy) * 0.65;
      const speed = Math.hypot(node.vx, node.vy);
      if (speed > 8) { node.vx *= 8 / speed; node.vy *= 8 / speed; }
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  function updateGraphLabels(surface) {
    const sim = surface.__relationshipGraphSimulation;
    if (!sim) return;
    const scale = getGraphViewportState(surface).scale;
    const accepted = [];
    [...sim.nodes].sort((a, b) => {
      const priority = (n) => (sim.nodeEls.get(n.id)?.matches('.is-selected, .is-search-match, :hover') ? 10000 : 0)
        + (n.id === sim.focusId ? 1000 : 0) + (n.type === 'domain' ? 100 : 0) + n.degree;
      return priority(b) - priority(a);
    }).forEach((node) => {
      const el = sim.nodeEls.get(node.id);
      if (!el || el.classList.contains('is-search-hidden')) return;
      const label = el.querySelector('text');
      const minRadius = node.type === 'home' ? 6 : node.type === 'domain' ? 5 : node.type === 'hub' ? 4 : 2.8;
      const radius = Math.max(node.radius, minRadius / scale);
      el.querySelector('.relationship-graph-node-dot').setAttribute('r', String(radius));
      el.querySelector('.rg-node-hit').setAttribute('r', String(Math.max(radius + 3, 9 / scale)));
      const w = Math.min(28, (node.title || 'Untitled').length) * 6.4 + 10;
      const box = { x: node.x * scale - w / 2, y: node.y * scale + radius * scale + 7, w, h: 17 };
      const forced = el.matches('.is-selected, .is-search-match, :hover');
      const overview = sim.mode === 'global' && scale < 0.6;
      const important = node.degree > 1 || node.type === 'domain' || node.type === 'home';
      const visible = forced || ((!overview || important) && !accepted.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y));
      el.classList.toggle('is-labelled', visible);
      label.setAttribute('y', String(radius + 17 / scale));
      if (visible) accepted.push(box);
    });
  }

  function fitGraphToViewport(nodes = [], width = 900, height = 560) {
    if (!nodes.length) return nodes;
    const pad = 118;
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);
    const scale = Math.min(1.18, Math.max(0.42, Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH)));
    const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = height / 2 - ((minY + maxY) / 2) * scale;
    return nodes.map((node) => ({
      ...node,
      x: node.x * scale + offsetX,
      y: node.y * scale + offsetY
    }));
  }

  function openNode(nodeId = "") {
    if (!nodeId || nodeId.startsWith("dbrow:")) return;
    if (typeof window.openPage === "function") {
      removeGraphModal();
      window.openPage(nodeId);
    }
  }

  function getGraphViewportState(surface) {
    if (!surface.__relationshipGraphViewport) {
      surface.__relationshipGraphViewport = { x: 0, y: 0, scale: 1 };
    }
    return surface.__relationshipGraphViewport;
  }

  function applyGraphViewport(surface) {
    const svg = surface?.querySelector(".relationship-graph-svg");
    if (!svg) return;
    const state = getGraphViewportState(surface);
    const rect = surface.getBoundingClientRect();
    // Zoom the vector coordinate system, not a composited HTML bitmap. This keeps
    // text and circle edges sharp even at 300% and on high-density displays.
    const x = -state.x / state.scale;
    const y = -state.y / state.scale;
    const width = Math.max(1, rect.width) / state.scale;
    const height = Math.max(1, rect.height) / state.scale;
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    const grid = svg.querySelector('.rg-grid');
    if (grid) {
      Object.entries({ x, y, width, height }).forEach(([key, value]) => grid.setAttribute(key, String(value)));
    }
    surface.style.setProperty("--relationship-graph-zoom", String(state.scale));
    const zoom = surface.closest('.relationship-graph-modal')?.querySelector('.rg-zoom-value');
    if (zoom) zoom.textContent = `${Math.round(state.scale * 100)}%`;
    updateGraphLabels(surface);
  }

  function animateGraphViewport(surface, target = {}, duration = 900) {
    if (!surface) return;
    const state = getGraphViewportState(surface);
    const startX = state.x || 0;
    const startY = state.y || 0;
    const startScale = state.scale || 1;
    const targetX = Number.isFinite(Number(target.x)) ? Number(target.x) : startX;
    const targetY = Number.isFinite(Number(target.y)) ? Number(target.y) : startY;
    const targetScale = Number.isFinite(Number(target.scale)) ? Number(target.scale) : startScale;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(surface.__relationshipGraphPanRaf);
      Object.assign(state, { x: targetX, y: targetY, scale: targetScale });
      applyGraphViewport(surface);
      return;
    }
    const startTime = performance.now();
    if (surface.__relationshipGraphPanRaf) cancelAnimationFrame(surface.__relationshipGraphPanRaf);
    const animate = (now) => {
      const progress = Math.min(1, (now - startTime) / Math.max(120, duration));
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      state.scale = startScale + (targetScale - startScale) * eased;
      state.x = startX + (targetX - startX) * eased;
      state.y = startY + (targetY - startY) * eased;
      applyGraphViewport(surface);
      if (progress < 1) {
        surface.__relationshipGraphPanRaf = requestAnimationFrame(animate);
      } else {
        surface.__relationshipGraphPanRaf = 0;
      }
    };
    surface.__relationshipGraphPanRaf = requestAnimationFrame(animate);
  }

  function resetGraphViewport(surface) {
    cancelAnimationFrame(surface?.__relationshipGraphPanRaf);
    const simulation = surface?.__relationshipGraphSimulation;
    if (simulation?.nodes?.length) {
      const rect = surface.getBoundingClientRect();
      const visible = simulation.nodes.filter((n) => !simulation.nodeEls.get(n.id)?.classList.contains('is-search-hidden'));
      fitViewportToNodes(surface, visible, rect.width || 900, rect.height || 560);
      return;
    }
    const state = getGraphViewportState(surface);
    state.x = 0;
    state.y = 0;
    state.scale = 1;
    applyGraphViewport(surface);
  }

  function fitViewportToNodes(surface, nodes = [], width = 900, height = 560) {
    if (!surface || !nodes.length) return;
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const graphW = Math.max(1, maxX - minX);
    const graphH = Math.max(1, maxY - minY);
    const padX = Math.min(105, width * 0.22);
    const padY = Math.min(70, height * 0.20);
    const scale = Math.max(0.02, Math.min(1.5, (width - padX * 2) / (graphW + 40), (height - padY * 2) / (graphH + 40)));
    const state = getGraphViewportState(surface);
    const target = {
      scale,
      x: width / 2 - ((minX + maxX) / 2) * scale,
      y: height / 2 - ((minY + maxY) / 2) * scale
    };
    if (state.__instantFit !== false) {
      state.scale = target.scale;
      state.x = target.x;
      state.y = target.y;
      applyGraphViewport(surface);
    } else {
      animateGraphViewport(surface, target, 1000);
    }
  }

  function centerViewportOnNode(surface, node = {}) {
    if (!surface || !node) return;
    const rect = surface.getBoundingClientRect();
    const state = getGraphViewportState(surface);
    const targetScale = state.scale;
    const targetX = (rect.width || 900) / 2 - node.x * targetScale;
    const targetY = (rect.height || 560) / 2 - node.y * targetScale;
    animateGraphViewport(surface, { x: targetX, y: targetY, scale: targetScale }, 280);
  }

  function getPointerGraphPoint(surface, event) {
    const rect = surface.getBoundingClientRect();
    const state = getGraphViewportState(surface);
    return {
      x: (event.clientX - rect.left - state.x) / state.scale,
      y: (event.clientY - rect.top - state.y) / state.scale
    };
  }

  function syncGraphElements(surface) {
    const simulation = surface?.__relationshipGraphSimulation;
    if (!simulation) return;
    simulation.nodes.forEach((node) => {
      const el = simulation.nodeEls.get(node.id);
      if (!el) return;
      el.setAttribute("transform", `translate(${Math.round(node.x)} ${Math.round(node.y)})`);
    });
    simulation.edges.forEach((edge) => {
      const line = simulation.lineEls.get(edge.id);
      const from = simulation.nodeById.get(edge.from);
      const to = simulation.nodeById.get(edge.to);
      if (!line || !from || !to) return;
      line.setAttribute("x1", String(Math.round(from.x)));
      line.setAttribute("y1", String(Math.round(from.y)));
      line.setAttribute("x2", String(Math.round(to.x)));
      line.setAttribute("y2", String(Math.round(to.y)));
    });
    updateGraphLabels(surface);
  }

  function applyGraphColors(surface) {
    const simulation = surface?.__relationshipGraphSimulation;
    if (!simulation) return;
    const settings = getGraphSettings();
    simulation.nodeEls.forEach((el, nodeId) => {
      const node = simulation.nodeById.get(nodeId);
      if (!node) return;
      el.style.setProperty("--node-color", resolveGraphNodeColor(node, simulation.nodeById, settings));
    });
    simulation.lineEls.forEach((line, edgeId) => {
      const edge = simulation.edges.find((entry) => entry.id === edgeId);
      if (!edge) return;
      const from = simulation.nodeById.get(edge.from);
      const to = simulation.nodeById.get(edge.to);
      if (!from || !to) return;
      const edgeColor = edge.type === "contains"
        ? resolveGraphNodeColor(to, simulation.nodeById, settings)
        : resolveGraphNodeColor(from, simulation.nodeById, settings);
      line.style.setProperty("--edge-color", edgeColor);
    });
  }

  function stopGraphSimulation(surface) {
    const simulation = surface?.__relationshipGraphSimulation;
    if (simulation?.raf) cancelAnimationFrame(simulation.raf);
    if (surface) surface.__relationshipGraphSimulation = null;
  }

  function startGraphSimulation(surface, nodes = [], edges = [], width = 900, height = 560, focusId = "", mode = "local", settings = getGraphSettings()) {
    if (!surface) return;
    stopGraphSimulation(surface);
    const nodeById = new Map(nodes.map((node) => [node.id, {
      ...node,
      vx: node.vx || 0,
      vy: node.vy || 0,
      fixed: false
    }]));
    const liveNodes = Array.from(nodeById.values());
    const liveEdges = edges.filter((edge) => nodeById.has(edge.from) && nodeById.has(edge.to));
    const simulation = {
      nodes: liveNodes,
      edges: liveEdges,
      nodeById,
      nodeEls: new Map(Array.from(surface.querySelectorAll(".relationship-graph-node")).map((el) => [el.dataset.nodeId, el])),
      lineEls: new Map(Array.from(surface.querySelectorAll(".relationship-graph-line")).map((line) => [line.dataset.edgeId, line])),
      width,
      height,
      focusId,
      mode,
      settings,
      energy: 1,
      paused: surface.__paused === true,
      raf: 0
    };
    surface.__relationshipGraphSimulation = simulation;

    const tick = () => {
      simulation.raf = 0;
      if (!surface.isConnected || simulation.paused) return;
      stepGraphPhysics(liveNodes, liveEdges, nodeById, width, height, simulation.settings, simulation.energy);
      syncGraphElements(surface);
      simulation.energy *= simulation.drag ? 0.988 : 0.96;
      const hasDrag = !!simulation.drag;
      const stillMoving = liveNodes.some((node) => Math.abs(node.vx) + Math.abs(node.vy) > 0.05);
      if (hasDrag || (stillMoving && simulation.energy > 0.03)) {
        simulation.raf = requestAnimationFrame(tick);
      } else {
        liveNodes.forEach((node) => {
          node.vx = 0;
          node.vy = 0;
        });
      }
    };

    syncGraphElements(surface);
    simulation.raf = requestAnimationFrame(tick);
    simulation.tick = tick;
  }

  function wakeGraphSimulation(surface, amount = 1) {
    const simulation = surface?.__relationshipGraphSimulation;
    if (!simulation || simulation.paused) return;
    simulation.energy = Math.max(simulation.energy || 0, amount);
    if (!simulation.raf && typeof simulation.tick === "function") simulation.raf = requestAnimationFrame(simulation.tick);
  }

  function enableGraphPanZoom(surface) {
    if (!surface || surface.dataset.graphPanZoomReady === "true") return;
    surface.dataset.graphPanZoomReady = "true";
    let pan = null;

    surface.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (surface.__relationshipGraphPanRaf) {
        cancelAnimationFrame(surface.__relationshipGraphPanRaf);
        surface.__relationshipGraphPanRaf = 0;
      }
      const rect = surface.getBoundingClientRect();
      const state = getGraphViewportState(surface);
      const oldScale = state.scale;
      const delta = Math.max(-120, Math.min(120, Number(event.deltaY) || 0));
      const zoomFactor = Math.exp(-delta * 0.0018);
      const nextScale = Math.max(0.02, Math.min(3, oldScale * zoomFactor));
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const graphX = (pointerX - state.x) / oldScale;
      const graphY = (pointerY - state.y) / oldScale;
      state.scale = nextScale;
      state.x = pointerX - graphX * nextScale;
      state.y = pointerY - graphY * nextScale;
      applyGraphViewport(surface);
    }, { passive: false });

    surface.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest(".relationship-graph-node")) return;
      cancelAnimationFrame(surface.__relationshipGraphPanRaf);
      const state = getGraphViewportState(surface);
      pan = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: state.x,
        y: state.y
      };
      surface.classList.add("is-panning");
      surface.setPointerCapture?.(event.pointerId);
    });

    surface.addEventListener("pointermove", (event) => {
      if (!pan) return;
      const state = getGraphViewportState(surface);
      state.x = pan.x + event.clientX - pan.startX;
      state.y = pan.y + event.clientY - pan.startY;
      applyGraphViewport(surface);
    });

    const stopPan = (event) => {
      if (pan && Math.hypot(event.clientX - pan.startX, event.clientY - pan.startY) > 5) {
        surface.__relationshipGraphDraggingRecently = true;
        setTimeout(() => { surface.__relationshipGraphDraggingRecently = false; }, 140);
      }
      pan = null;
      surface.classList.remove("is-panning");
    };
    surface.addEventListener("pointerup", stopPan);
    surface.addEventListener("pointercancel", stopPan);
    surface.addEventListener("dblclick", (event) => {
      if (event.target.closest(".relationship-graph-node")) return;
      resetGraphViewport(surface);
    });
  }

  function renderGraphEmptyDetail(detail) {
    if (!detail) return;
    detail.innerHTML = `<span class="rg-detail-empty">Click a node to inspect</span>`;
  }

  function clearGraphSelection(surface) {
    if (!surface) return;
    surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
      el.classList.remove("is-selected", "is-dim");
    });
    surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
      line.classList.remove("is-active", "is-dim");
    });
    clearGraphHoverHighlight(surface);
    renderGraphEmptyDetail(surface.closest(".relationship-graph-modal")?.querySelector(".relationship-graph-detail"));
  }

  function getGraphNeighborIds(nodeId = "", edges = []) {
    const relatedIds = new Set([nodeId]);
    safeArray(edges).forEach((edge) => {
      if (edge.from === nodeId) relatedIds.add(edge.to);
      if (edge.to === nodeId) relatedIds.add(edge.from);
    });
    return relatedIds;
  }

  function clearGraphHoverHighlight(surface) {
    if (!surface) return;
    surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
      el.classList.remove("is-hover-related", "is-hover-dim");
    });
    surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
      line.classList.remove("is-hover-active", "is-hover-dim");
    });
  }

  function setGraphHoverHighlight(surface, nodeId = "", active = false) {
    if (!surface) return;
    const graph = surface.__relationshipGraphData?.graph;
    if (!active || !nodeId || !graph) {
      clearGraphHoverHighlight(surface);
      return;
    }
    if (surface.querySelector(".relationship-graph-node.is-selected")) return;
    const relatedIds = getGraphNeighborIds(nodeId, graph.edges);
    surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
      const isRelated = relatedIds.has(el.dataset.nodeId);
      el.classList.toggle("is-hover-related", isRelated);
      el.classList.toggle("is-hover-dim", !isRelated);
    });
    surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
      const isRelated = line.dataset.from === nodeId || line.dataset.to === nodeId;
      line.classList.toggle("is-hover-active", isRelated);
      line.classList.toggle("is-hover-dim", !isRelated);
    });
  }

  function clearGraphSearchState(surface) {
    if (!surface) return;
    surface.classList.remove("has-graph-search");
    surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
      el.classList.remove("is-search-match", "is-search-dim", "is-search-hidden");
    });
    surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
      line.classList.remove("is-search-hidden");
    });
  }

  function applyGraphSearch(surface, query = "", isolate = false) {
    if (!surface) return;
    const graph = surface.__relationshipGraphData?.graph;
    const simulation = surface.__relationshipGraphSimulation;
    if (!graph || !simulation) return;

    clearGraphSearchState(surface);
    const results = surface.closest('.relationship-graph-modal')?.querySelector('.rg-search-results');
    if (results) { results.innerHTML = ''; results.hidden = true; }
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) { updateGraphLabels(surface); return; }

    const matchIds = new Set();
    simulation.nodes.forEach((node) => {
      const title = String(node.title || "").toLowerCase();
      if (title.includes(needle)) matchIds.add(node.id);
    });
    if (results) {
      results.hidden = false;
      const matches = simulation.nodes.filter((node) => matchIds.has(node.id));
      results.innerHTML = `<div class="rg-search-summary" role="status">${matches.length ? `${matches.length} matching page${matches.length === 1 ? '' : 's'}${matches.length > 30 ? ' · showing first 30' : ''}` : 'No matches in this view. Try Global or another search.'}</div>`
        + matches.slice(0, 30).map((node) => `<button type="button" data-result-id="${escapeHTML(node.id)}">${escapeHTML(node.title)}<small>${escapeHTML(node.type)}</small></button>`).join('');
      results.querySelectorAll('[data-result-id]').forEach((button) => button.addEventListener('click', () => {
        simulation.nodeEls.get(button.dataset.resultId)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        results.hidden = true;
      }));
    }
    if (!matchIds.size) {
      surface.classList.add("has-graph-search");
      surface.querySelectorAll(".relationship-graph-node").forEach((el) => el.classList.add("is-search-dim"));
      surface.querySelectorAll(".relationship-graph-line").forEach((line) => line.classList.add("is-search-hidden"));
      return;
    }

    let visibleIds = matchIds;
    if (isolate) {
      visibleIds = new Set(matchIds);
      graph.edges.forEach((edge) => {
        if (matchIds.has(edge.from)) visibleIds.add(edge.to);
        if (matchIds.has(edge.to)) visibleIds.add(edge.from);
      });
    }

    surface.classList.add("has-graph-search");
    surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
      const nodeId = el.dataset.nodeId;
      const isMatch = matchIds.has(nodeId);
      el.classList.toggle("is-search-match", isMatch);
      if (isolate) {
        el.classList.toggle("is-search-hidden", !visibleIds.has(nodeId));
      } else {
        el.classList.toggle("is-search-dim", !isMatch);
      }
    });
    surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
      if (isolate) {
        const show = visibleIds.has(line.dataset.from) && visibleIds.has(line.dataset.to);
        line.classList.toggle("is-search-hidden", !show);
      }
    });
    updateGraphLabels(surface);
  }

  function renderGraphSurface(surface, graph, mode) {
    if (!surface || !surface.isConnected) return;
    stopGraphSimulation(surface);
    cancelAnimationFrame(surface.__relationshipGraphPanRaf);
    graph = { ...graph, edges: bundleGraphEdges(graph.edges) };
    const settings = getGraphSettings();
    const rect = surface.getBoundingClientRect();
    const viewportWidth = Math.max(1, Math.floor(rect.width || 900));
    const viewportHeight = Math.max(1, Math.floor(rect.height || 560));
    const width = Math.max(1400, Math.floor(viewportWidth * 1.9));
    const height = Math.max(920, Math.floor(viewportHeight * 1.9));
    const nodes = layoutGraph(graph.nodes, graph.edges, graph.focusId || getCurrentId(), width, height, mode, settings);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const edgeLines = graph.edges
      .map((edge) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return "";
        const edgeColor = edge.type === "contains"
          ? resolveGraphNodeColor(to, nodeById, settings)
          : resolveGraphNodeColor(from, nodeById, settings);
        return `<line class="relationship-graph-line edge-${escapeHTML(edge.type)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" data-edge-id="${escapeHTML(edge.id)}" data-from="${escapeHTML(edge.from)}" data-to="${escapeHTML(edge.to)}" data-label="${escapeHTML(edge.label)}" style="--link-thickness:${(settings.linkThickness || 90) / 100};--edge-color:${escapeHTML(edgeColor)};" />`;
      })
      .join("");
    const nodeGroups = nodes.map((node, index) => `
      <g role="button" tabindex="0" aria-label="${escapeHTML(node.title || 'Untitled')}" class="relationship-graph-node node-${getNodeClass(node.type)}${node.containerType === "project" ? " node-project" : ""}${node.layout === "database" ? " node-database" : ""}${node.id === graph.focusId ? " is-focus" : ""}${node.labelVisible ? " is-labelled" : ""}" data-node-id="${escapeHTML(node.id)}" transform="translate(${Math.round(node.x)} ${Math.round(node.y)})" style="--node-size:${node.radius || 5}px;--node-color:${escapeHTML(resolveGraphNodeColor(node, nodeById, settings))};">
        <circle class="rg-node-hit" r="${Math.max(14, node.radius + 5)}" fill="transparent"></circle>
        <g class="rg-node-inner" style="animation-delay:${Math.min(index * 14, 480)}ms">
          <circle class="relationship-graph-node-dot" r="${node.radius || 5}"></circle>
          <text class="relationship-graph-node-title" x="0" y="${(node.radius || 5) + 15}" text-anchor="middle">${escapeHTML(clampText(node.title, "Untitled", 28))}</text>
        </g>
        <title>${escapeHTML(node.title || "Untitled")}</title>
      </g>
    `).join("");

    surface.innerHTML = `
      <div class="relationship-graph-viewport">
        <svg class="relationship-graph-svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" aria-label="Relationship graph">
          <defs>
            <pattern id="graph-dot-grid" x="0" y="0" width="44" height="44" patternUnits="userSpaceOnUse">
              <circle cx="22" cy="22" r="1" fill="rgba(255,255,255,0.10)"/>
            </pattern>
          </defs>
          <rect class="rg-grid" width="${width}" height="${height}" fill="url(#graph-dot-grid)" pointer-events="none"/>
          <g class="relationship-graph-edge-layer">${edgeLines}</g>
          <g class="relationship-graph-node-layer">${nodeGroups}</g>
        </svg>
      </div>
      <div class="relationship-graph-hint">Drag to explore · Scroll to zoom · Click to inspect · Double-click to open</div>
      ${!nodes.length ? `<div class="relationship-graph-empty">No relationships found yet.</div>` : ""}
    `;
    applyGraphViewport(surface);
    surface.onclick = (event) => {
      if (event.target.closest(".relationship-graph-node")) return;
      if (surface.__relationshipGraphDraggingRecently) return;
      clearGraphSelection(surface);
    };

    surface.__relationshipGraphData = { graph, mode };
    renderGraphEmptyDetail(surface.closest('.relationship-graph-modal')?.querySelector('.relationship-graph-detail'));
    surface.querySelectorAll(".relationship-graph-node").forEach((nodeEl) => {
      nodeEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); nodeEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
      nodeEl.addEventListener("dblclick", () => openNode(nodeEl.dataset.nodeId));
      nodeEl.addEventListener("mouseenter", () => setGraphHoverHighlight(surface, nodeEl.dataset.nodeId, true));
      nodeEl.addEventListener("mouseleave", () => setGraphHoverHighlight(surface, nodeEl.dataset.nodeId, false));
      nodeEl.addEventListener("click", (event) => {
        event.stopPropagation();
        if (surface.__relationshipGraphDraggingRecently) return;
        clearGraphHoverHighlight(surface);
        surface.querySelectorAll(".relationship-graph-node").forEach((el) => el.classList.remove("is-selected"));
        nodeEl.classList.add("is-selected");
        const node = surface.__relationshipGraphSimulation?.nodeById.get(nodeEl.dataset.nodeId)
          || nodeById.get(nodeEl.dataset.nodeId);
        surface.__showPanel?.();
        centerViewportOnNode(surface, node);
        const relatedIds = getGraphNeighborIds(nodeEl.dataset.nodeId, graph.edges);
        surface.querySelectorAll(".relationship-graph-node").forEach((el) => {
          el.classList.toggle("is-dim", !relatedIds.has(el.dataset.nodeId));
        });
        surface.querySelectorAll(".relationship-graph-line").forEach((line) => {
          const isRelated = line.dataset.from === nodeEl.dataset.nodeId || line.dataset.to === nodeEl.dataset.nodeId;
          line.classList.toggle("is-active", isRelated);
          line.classList.toggle("is-dim", !isRelated);
        });
        const detail = surface.closest(".relationship-graph-modal")?.querySelector(".relationship-graph-detail");
        if (detail && node) {
          const connected = graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
          const activeSettings = getGraphSettings();
          const nodeColor = resolveGraphNodeColor(node, surface.__relationshipGraphSimulation?.nodeById || nodeById, activeSettings);
          const colorLabel = activeSettings.colorMode === "path" ? "Branch color" : "Node color";
          const colorHint = activeSettings.colorMode === "path"
            ? `<div class="rg-node-color-hint">Applies here and downward.</div>`
            : "";
          detail.innerHTML = `
            <div class="rg-node-name">${escapeHTML(node.title)}</div>
            <div class="rg-node-meta">
              <span class="rg-node-badge">${escapeHTML(node.type)}</span>
              <span class="rg-node-conns">${connected.length} link${connected.length === 1 ? "" : "s"}</span>
            </div>
            <label class="rg-node-color-field">
              <span>${escapeHTML(colorLabel)}</span>
              <input type="color" value="${escapeHTML(nodeColor)}" data-rg-node-color="${escapeHTML(node.id)}">
            </label>
            ${colorHint}
            <button type="button" class="rg-node-color-clear">Use mode color</button>
            ${!node.id.startsWith("dbrow:") ? `<button type="button" class="relationship-graph-open-node icon-with-label">${getUIIcon("external-link")}Open page</button>` : ""}
            <button type="button" class="rg-explore-node icon-with-label">${getUIIcon("network")}Explore connections</button>
            <div class="rg-connections-heading">Connected pages</div>
            <div class="rg-connections">${connected.map((edge) => {
              const other = nodeById.get(edge.from === node.id ? edge.to : edge.from);
              const descriptions = [...new Set((edge.relationships || [edge]).map((link) => `${link.from === node.id ? '→' : '←'} ${GRAPH_EDGE_LABELS[link.type] || link.type}`))];
              return `<button type="button" data-neighbor-id="${escapeHTML(other.id)}"><span>${escapeHTML(other.title)}</span><small>${escapeHTML(descriptions.join(' · '))}</small></button>`;
            }).join('') || '<span class="rg-detail-empty">No visible connections. Try enabling more link types.</span>'}</div>
          `;
          detail.querySelector('.rg-explore-node')?.addEventListener('click', () => surface.__focusNode?.(node.id));
          detail.querySelectorAll('[data-neighbor-id]').forEach((button) => button.addEventListener('click', () => {
            surface.__relationshipGraphSimulation?.nodeEls.get(button.dataset.neighborId)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }));
          detail.querySelector("[data-rg-node-color]")?.addEventListener("input", (event) => {
            updateGraphNodeColor(node.id, event.target.value);
            applyGraphColors(surface);
          });
          detail.querySelector(".rg-node-color-clear")?.addEventListener("click", () => {
            updateGraphNodeColor(node.id, "");
            applyGraphColors(surface);
            const colorInput = detail.querySelector("[data-rg-node-color]");
            if (colorInput) colorInput.value = resolveGraphNodeColor(node, surface.__relationshipGraphSimulation?.nodeById || nodeById, getGraphSettings());
          });
          detail.querySelector(".relationship-graph-open-node")?.addEventListener("click", () => openNode(node.id));
        }
        updateGraphLabels(surface);
      });
    });

    fitViewportToNodes(surface, nodes, viewportWidth, viewportHeight);
    startGraphSimulation(surface, nodes, graph.edges, width, height, graph.focusId || getCurrentId(), mode, settings);
    enableGraphPanZoom(surface);
    enableNodeDragging(surface);
    const countEl = surface.closest(".relationship-graph-modal")?.querySelector(".relationship-graph-count");
    if (countEl) {
      const hidden = graph.hiddenCount ? ` - ${graph.hiddenCount} hidden items` : "";
      const depthLabel = mode === "local" ? ` - depth ${settings.localDepth}` : "";
      countEl.textContent = `${graph.nodes.length} pages · ${graph.edges.length} connections${depthLabel}${hidden}`;
    }

    const modal = surface.closest(".relationship-graph-modal");
    const searchInput = modal?.querySelector("[data-graph-search]");
    if (searchInput) {
      applyGraphSearch(surface, searchInput.value, getGraphSettings().searchIsolate);
    }
  }

  function enableNodeDragging(surface) {
    if (!surface || surface.dataset.graphNodeDragReady === "true") return;
    surface.dataset.graphNodeDragReady = "true";

    surface.addEventListener("pointerdown", (event) => {
      const nodeEl = event.target.closest(".relationship-graph-node");
      if (!nodeEl || event.button !== 0) return;
      event.stopPropagation();
      cancelAnimationFrame(surface.__relationshipGraphPanRaf);
      const simulation = surface.__relationshipGraphSimulation;
      const node = simulation?.nodeById.get(nodeEl.dataset.nodeId);
      if (!simulation || !node) return;
      const point = getPointerGraphPoint(surface, event);
      simulation.pendingDrag = {
        node,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        dx: point.x - node.x,
        dy: point.y - node.y,
        nodeEl
      };
      nodeEl.setPointerCapture?.(event.pointerId);
    });

    surface.addEventListener("pointermove", (event) => {
      const simulation = surface.__relationshipGraphSimulation;
      if (!simulation) return;
      if (simulation.pendingDrag) {
        if (simulation.pendingDrag.pointerId !== event.pointerId) return;
        const moved = Math.hypot(
          event.clientX - simulation.pendingDrag.startClientX,
          event.clientY - simulation.pendingDrag.startClientY
        );
        if (moved < 5) return;
        simulation.drag = simulation.pendingDrag;
        simulation.pendingDrag = null;
        simulation.drag.node.fixed = true;
        simulation.drag.node.vx = 0;
        simulation.drag.node.vy = 0;
        simulation.energy = 1;
      }
      if (!simulation.drag) return;
      const point = getPointerGraphPoint(surface, event);
      const node = simulation.drag.node;
      const nextX = point.x - simulation.drag.dx;
      const nextY = point.y - simulation.drag.dy;
      const dx = nextX - node.x;
      const dy = nextY - node.y;
      node.x = nextX;
      node.y = nextY;
      if (Number.isFinite(node.anchorX)) { node.anchorX = nextX; node.anchorY = nextY; }
      simulation.edges.forEach((edge) => {
        const otherId = edge.from === node.id ? edge.to : edge.to === node.id ? edge.from : "";
        if (!otherId) return;
        const other = simulation.nodeById.get(otherId);
        if (!other || other.fixed) return;
        other.vx += dx * 0.045;
        other.vy += dy * 0.045;
      });
      simulation.energy = 1;
      syncGraphElements(surface);
      wakeGraphSimulation(surface, 1);
    });

    const stopDrag = () => {
      const simulation = surface.__relationshipGraphSimulation;
      if (simulation?.pendingDrag) {
        simulation.pendingDrag = null;
        return;
      }
      if (!simulation?.drag) return;
      simulation.drag.node.fixed = false;
      simulation.drag = null;
      surface.__relationshipGraphDraggingRecently = true;
      window.setTimeout(() => {
        surface.__relationshipGraphDraggingRecently = false;
      }, 140);
      wakeGraphSimulation(surface, 0.8);
    };
    surface.addEventListener("pointerup", stopDrag);
    surface.addEventListener("pointercancel", stopDrag);
  }

  function repairOrphanedCanvasPageParents(canvasHosts = new Map()) {
    const pages = Array.isArray(window.userPages) ? window.userPages : [];
    let changed = false;

    canvasHosts.forEach((hostId, pageId) => {
      const page = pages.find((entry) => entry?.id === pageId);
      const host = pages.find((entry) => entry?.id === hostId);
      if (!page || String(page.parent || "").trim()) return;
      if (!host || !["hub", "project"].includes(host.containerType || "")) return;
      if (page.containerType === "hub" || page.containerType === "project") return;
      page.parent = hostId;
      changed = true;
    });

    if (changed && typeof window.saveSanctumRegistry === "function") {
      window.saveSanctumRegistry();
    }
    return changed;
  }

  function openRelationshipGraph(options = {}) {
    let focusId = options.focusId || getCurrentId();
    let mode = options.mode || "local";
    invalidateRelationshipGraphCache();
    removeGraphModal();
    const initialSettings = getGraphSettings();

    const overlay = document.createElement("div");
    overlay.className = "relationship-graph-overlay";
    overlay.innerHTML = `
      <div class="relationship-graph-modal" role="dialog" aria-modal="true" aria-label="Relationship graph">
        <div class="relationship-graph-head">
          <div class="relationship-graph-head-main">
            <div class="relationship-graph-title">Relationship graph</div>
            <div class="relationship-graph-count"></div>
          </div>
          <div class="rg-search-wrap">
            <input type="search" class="rg-graph-search" placeholder="Search nodes…" data-graph-search aria-label="Search graph nodes">
            <label class="rg-search-isolate relationship-graph-toggle">
              <input type="checkbox" data-graph-setting="searchIsolate" ${initialSettings.searchIsolate ? "checked" : ""}>
              <span>Isolate</span>
            </label>
            <div class="rg-search-results" hidden></div>
          </div>
          <div class="relationship-graph-actions">
            <div class="relationship-graph-segment">
              <button type="button" data-graph-mode="local">${getUIIcon("focus")}Local</button>
              <button type="button" data-graph-mode="global">${getUIIcon("globe")}Global</button>
            </div>
            <button type="button" class="rg-fit-button" title="Fit graph (F)">${getUIIcon("scan")}Fit</button>
            <button type="button" class="rg-panel-toggle" title="Hide panel" aria-label="Toggle graph panel" aria-expanded="true">${getUIIcon("panel-right")}Panel</button>
            <button type="button" class="relationship-graph-close" aria-label="Close" title="Close graph">${getUIIcon("x")}</button>
          </div>
        </div>
        <div class="relationship-graph-body">
          <div class="relationship-graph-surface"></div>
          <div class="rg-map-controls"><button type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out">${getUIIcon("minus")}</button><span class="rg-zoom-value">100%</span><button type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in">${getUIIcon("plus")}</button><button type="button" class="rg-pause" aria-pressed="false">${getUIIcon("pause")}Pause</button></div>
          <aside class="relationship-graph-side">
            <button class="rg-panel-x" type="button" title="Close panel" aria-label="Close panel">${getUIIcon("x")}</button>
            <div class="rg-panel-section">
              <div class="rg-panel-heading">Node</div>
              <div class="relationship-graph-detail">
                <span class="rg-detail-empty">Click a node to inspect</span>
              </div>
            </div>
            <div class="rg-panel-section">
              <div class="rg-panel-heading">Display</div>
              <label class="relationship-graph-field rg-local-depth-field" title="How many link hops from the focus page to include in local view">
                <span>Local depth</span>
                <input type="range" min="1" max="4" value="${initialSettings.localDepth}" data-graph-setting="localDepth">
                <span class="rg-val">${initialSettings.localDepth}</span>
              </label>
              <label class="relationship-graph-toggle">
                <input type="checkbox" data-graph-setting="showOrphans" ${initialSettings.showOrphans ? "checked" : ""}>
                <span>Unconnected pages</span>
              </label>
              <label class="relationship-graph-toggle">
                <input type="checkbox" data-graph-setting="showDatabaseRows" ${initialSettings.showDatabaseRows ? "checked" : ""}>
                <span>Database rows</span>
              </label>
              <label class="relationship-graph-field">
                <span>Theme</span>
                <select data-graph-setting="theme">
                  ${Object.entries(GRAPH_THEMES).map(([themeKey, theme]) => (
                    `<option value="${escapeHTML(themeKey)}" ${initialSettings.theme === themeKey ? "selected" : ""}>${escapeHTML(theme.label)}</option>`
                  )).join("")}
                </select>
              </label>
              <label class="relationship-graph-field">
                <span>Color by</span>
                <select data-graph-setting="colorMode">
                  <option value="single" ${initialSettings.colorMode === "single" ? "selected" : ""}>One color</option>
                  <option value="node" ${initialSettings.colorMode === "node" ? "selected" : ""}>Per node</option>
                  <option value="path" ${initialSettings.colorMode === "path" ? "selected" : ""}>Path / domain</option>
                  <option value="level" ${initialSettings.colorMode === "level" ? "selected" : ""}>Level / type</option>
                </select>
              </label>
              <label class="relationship-graph-field rg-default-color-field">
                <span>Default color</span>
                <input type="color" value="${escapeHTML(getGraphAccent())}" data-graph-accent-input>
              </label>
              <div class="rg-type-colors">
                <label title="Home node color"><span>Home</span><input type="color" value="${escapeHTML(initialSettings.typeColors.home)}" data-graph-type-color="home"></label>
                <label title="Domain node color"><span>Domain</span><input type="color" value="${escapeHTML(initialSettings.typeColors.domain)}" data-graph-type-color="domain"></label>
                <label title="Hub node color"><span>Hub</span><input type="color" value="${escapeHTML(initialSettings.typeColors.hub)}" data-graph-type-color="hub"></label>
                <label title="Project node color"><span>Project</span><input type="color" value="${escapeHTML(initialSettings.typeColors.project)}" data-graph-type-color="project"></label>
                <label title="Page node color"><span>Page</span><input type="color" value="${escapeHTML(initialSettings.typeColors.page)}" data-graph-type-color="page"></label>
                <label title="Database row node color"><span>DB row</span><input type="color" value="${escapeHTML(initialSettings.typeColors["database-row"])}" data-graph-type-color="database-row"></label>
              </div>
            </div>
            <div class="rg-panel-section">
              <div class="rg-panel-heading">Link types</div>
              <div class="rg-edge-filters">
                ${GRAPH_EDGE_FILTER_TYPES.map((edgeType) => `
                  <label class="relationship-graph-toggle" title="${escapeHTML(GRAPH_EDGE_LABELS[edgeType] || edgeType)}">
                    <input type="checkbox" data-graph-edge-filter="${escapeHTML(edgeType)}" ${initialSettings.edgeFilters[edgeType] !== false ? "checked" : ""}>
                    <span>${escapeHTML(GRAPH_EDGE_LABELS[edgeType] || edgeType)}</span>
                  </label>
                `).join("")}
              </div>
            </div>
            <div class="rg-panel-section">
              <div class="rg-panel-heading">Physics <span class="rg-hint-label">— hover for info</span></div>
              <button type="button" class="rg-reset-layout icon-with-label">${getUIIcon("rotate-ccw")}Reset layout settings</button>
              <div class="relationship-graph-controls">
                <label title="Pulls all nodes toward the center. Higher = tighter cluster.">Center <input type="range" min="0" max="100" value="${initialSettings.centerForce}" data-graph-setting="centerForce"><span class="rg-val">${initialSettings.centerForce}</span></label>
                <label title="Repulsion between all nodes. Higher = more spread out.">Repel <input type="range" min="0" max="100" value="${initialSettings.repelForce}" data-graph-setting="repelForce"><span class="rg-val">${initialSettings.repelForce}</span></label>
                <label title="How strongly edges pull connected nodes together.">Link force <input type="range" min="0" max="100" value="${initialSettings.linkForce}" data-graph-setting="linkForce"><span class="rg-val">${initialSettings.linkForce}</span></label>
                <label title="Natural resting distance between connected nodes.">Distance <input type="range" min="20" max="220" value="${initialSettings.linkDistance}" data-graph-setting="linkDistance"><span class="rg-val">${initialSettings.linkDistance}</span></label>
                <label title="Scales all node circles up or down.">Node size <input type="range" min="50" max="180" value="${initialSettings.nodeSize}" data-graph-setting="nodeSize"><span class="rg-val">${initialSettings.nodeSize}</span></label>
                <label title="Thickness of the connection lines.">Line weight <input type="range" min="40" max="180" value="${initialSettings.linkThickness}" data-graph-setting="linkThickness"><span class="rg-val">${initialSettings.linkThickness}</span></label>
              </div>
            </div>
            <div class="rg-panel-footer">
              <div class="relationship-graph-legend">
                <span><i class="legend-domain"></i>Domain</span>
                <span><i class="legend-hub"></i>Hub</span>
                <span><i class="legend-project"></i>Project</span>
                <span><i class="legend-page"></i>Page</span>
                <span><i class="legend-row"></i>DB row</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const modal = overlay.querySelector(".relationship-graph-modal");
    const surface = overlay.querySelector(".relationship-graph-surface");
    modal?.style.setProperty("--relationship-graph-accent", getGraphAccent());

    const syncLocalDepthVisibility = () => {
      const depthField = overlay.querySelector(".rg-local-depth-field");
      if (depthField) depthField.style.display = mode === "local" ? "" : "none";
    };

    const render = () => {
      const activeGraphSettings = getGraphSettings();
      modal.dataset.colorMode = activeGraphSettings.colorMode;
      modal.dataset.graphTheme = activeGraphSettings.theme;
      modal.style.setProperty("--relationship-graph-accent", activeGraphSettings.accent);
      overlay.querySelectorAll("[data-graph-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.graphMode === mode);
        button.setAttribute('aria-pressed', String(button.dataset.graphMode === mode));
      });
      syncLocalDepthVisibility();
      const centerControl = overlay.querySelector('[data-graph-setting="centerForce"]')?.closest('label');
      const distanceControl = overlay.querySelector('[data-graph-setting="linkDistance"]')?.closest('label');
      if (centerControl) centerControl.title = mode === 'global'
        ? 'Keeps nodes near their branch positions. Higher = firmer grouping.'
        : 'Pulls nodes toward the center. Higher = tighter cluster.';
      if (distanceControl) {
        distanceControl.title = mode === 'global'
          ? 'Room between pages and groups in the global graph. Higher = more spread out.'
          : 'Natural resting distance between connected nodes.';
        distanceControl.firstChild.textContent = mode === 'global' ? 'Spacing ' : 'Distance ';
      }
      window.requestAnimationFrame(() => renderGraphSurface(surface, getGraphForMode(mode, focusId), mode));
    };

    const resizeAc = new AbortController();
    const closeGraph = () => { resizeAc.abort(); removeGraphModal(); };
    const previousFocus = document.activeElement;
    overlay.__cleanup = () => {
      resizeAc.abort();
      clearTimeout(searchTimer);
      clearTimeout(resizeTimer);
      cancelAnimationFrame(surface.__relationshipGraphPanRaf);
      stopGraphSimulation(surface);
      previousFocus?.focus?.();
    };
    surface.__focusNode = (id) => { focusId = id; mode = 'local'; render(); };
    overlay.querySelector('.rg-reset-layout')?.addEventListener('click', () => {
      const defaults = { centerForce: 58, repelForce: 42, linkForce: 62, linkDistance: 78, nodeSize: 82, linkThickness: 90 };
      Object.entries(defaults).forEach(([key, value]) => {
        updateGraphSetting(key, value);
        const input = overlay.querySelector(`[data-graph-setting="${key}"]`);
        input.value = value;
        input.parentElement.querySelector('.rg-val').textContent = value;
        syncGraphRangeFill(input);
      });
      render();
    });
    overlay.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => {
      cancelAnimationFrame(surface.__relationshipGraphPanRaf);
      const state = getGraphViewportState(surface), rect = surface.getBoundingClientRect();
      const scale = Math.max(0.02, Math.min(3, state.scale * (button.dataset.zoom === 'in' ? 1.25 : 0.8)));
      state.x = rect.width / 2 - (rect.width / 2 - state.x) * scale / state.scale;
      state.y = rect.height / 2 - (rect.height / 2 - state.y) * scale / state.scale;
      state.scale = scale;
      applyGraphViewport(surface);
    }));
    overlay.querySelector('.rg-pause')?.addEventListener('click', (event) => {
      const sim = surface.__relationshipGraphSimulation;
      if (!sim) return;
      sim.paused = !sim.paused;
      surface.__paused = sim.paused;
      event.currentTarget.innerHTML = getUIIcon(sim.paused ? 'play' : 'pause') + (sim.paused ? 'Resume' : 'Pause');
      event.currentTarget.setAttribute('aria-pressed', String(sim.paused));
      if (sim.paused) { cancelAnimationFrame(sim.raf); sim.raf = 0; }
      else wakeGraphSimulation(surface);
    });

    overlay.querySelector(".relationship-graph-close")?.addEventListener("click", closeGraph);
    overlay.querySelector(".rg-fit-button")?.addEventListener("click", () => resetGraphViewport(surface));
    overlay.querySelector("[data-graph-accent-input]")?.addEventListener("input", (event) => {
      setGraphAccent(event.target.value);
      applyGraphColors(surface);
    });

    const side = overlay.querySelector(".relationship-graph-side");
    const panelToggle = overlay.querySelector(".rg-panel-toggle");
    const setPanelVisible = (visible) => {
      const hiding = !visible;
      side.style.display = hiding ? "none" : "";
      modal.classList.toggle('is-panel-hidden', hiding);
      if (panelToggle) {
        panelToggle.innerHTML = getUIIcon('panel-right') + 'Panel';
        panelToggle.title = hiding ? "Show panel" : "Hide panel";
        panelToggle.setAttribute('aria-expanded', String(visible));
      }
      resetGraphViewport(surface);
    };
    const togglePanel = () => setPanelVisible(side.style.display === 'none');
    surface.__showPanel = () => { if (side.style.display === 'none') setPanelVisible(true); };
    panelToggle?.addEventListener("click", togglePanel);
    overlay.querySelector(".rg-panel-x")?.addEventListener("click", togglePanel);

    let searchTimer = 0;
    overlay.querySelector('[data-graph-search]')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        const result = overlay.querySelector('[data-result-id]');
        if (result) { event.preventDefault(); event.key === 'Enter' ? result.click() : result.focus(); }
      }
    });
    overlay.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.rg-search-wrap')) overlay.querySelector('.rg-search-results').hidden = true;
    });
    overlay.querySelector("[data-graph-search]")?.addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        applyGraphSearch(surface, event.target.value, getGraphSettings().searchIsolate);
      }, 120);
    });

    const physicsLiveKeys = new Set(["repelForce", "centerForce", "linkForce", "linkDistance"]);
    overlay.querySelectorAll("[data-graph-setting]").forEach((input) => {
      syncGraphRangeFill(input);
      input.addEventListener("input", () => {
        const key = input.dataset.graphSetting;
        const value = input.type === "checkbox"
          ? input.checked
          : input.tagName === "SELECT"
            ? input.value
            : Number(input.value);
        updateGraphSetting(key, value);
        if (key === "colorMode" && modal) modal.dataset.colorMode = String(value || "single");
        if (key === "theme" && modal) {
          const active = getGraphSettings();
          modal.dataset.graphTheme = active.theme;
          modal.style.setProperty("--relationship-graph-accent", active.accent);
          const accentInput = overlay.querySelector("[data-graph-accent-input]");
          if (accentInput) accentInput.value = active.accent;
        }
        if (input.type === "range") {
          syncGraphRangeFill(input);
          const valEl = input.parentElement?.querySelector(".rg-val");
          if (valEl) valEl.textContent = input.value;
        }
        if (key === "searchIsolate") {
          const searchInput = overlay.querySelector("[data-graph-search]");
          applyGraphSearch(surface, searchInput?.value || "", value === true);
        } else if (['theme', 'colorMode'].includes(key)) {
          applyGraphColors(surface);
        } else if (key === 'linkDistance' && mode === 'global') {
          render();
        } else if (physicsLiveKeys.has(key)) {
          const sim = surface.__relationshipGraphSimulation;
          if (sim) { sim.settings = getGraphSettings(); wakeGraphSimulation(surface, 1); }
        } else if (key === "linkThickness") {
          const t = value / 100;
          surface.querySelectorAll(".relationship-graph-line").forEach((l) => l.style.setProperty("--link-thickness", t));
        } else {
          render();
        }
      });
    });
    overlay.querySelectorAll("[data-graph-edge-filter]").forEach((input) => {
      input.addEventListener("change", () => {
        updateGraphEdgeFilter(input.dataset.graphEdgeFilter, input.checked);
        render();
      });
    });
    overlay.querySelectorAll("[data-graph-type-color]").forEach((input) => {
      input.addEventListener("input", () => {
        updateGraphTypeColor(input.dataset.graphTypeColor, input.value);
        applyGraphColors(surface);
      });
    });
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) closeGraph();
    });
    modal?.addEventListener("mousedown", (event) => event.stopPropagation());
    overlay.querySelectorAll("[data-graph-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.graphMode || "local";
        render();
      });
    });
    let resizeTimer = 0;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => resetGraphViewport(surface), 180); }, { signal: resizeAc.signal });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeGraph(); return; }
      const editing = event.target.matches('input, select, textarea');
      if (!editing && event.key.toLowerCase() === 'f') { event.preventDefault(); resetGraphViewport(surface); }
      if (!editing && event.key === '/') { event.preventDefault(); overlay.querySelector('[data-graph-search]').focus(); }
      if (event.key === 'Tab') {
        const items = [...overlay.querySelectorAll('button, input, select, [tabindex="0"]')].filter((el) => !el.disabled && el.getClientRects().length && !el.closest('.is-search-hidden'));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    render();
    overlay.querySelector('[data-graph-search]').focus();
  }

  window.buildRelationshipGraphModel = getGraphModel;
  window.buildLocalRelationshipGraph = getLocalGraph;
  window.openRelationshipGraph = openRelationshipGraph;
  window.invalidateRelationshipGraphCache = invalidateRelationshipGraphCache;
})();
