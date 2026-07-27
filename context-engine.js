(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumContextEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;
  const SYSTEM_PAGE_IDS = new Set(["home", "search", "settings", "inbox", "notes"]);
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "about", "can", "could", "did", "do", "does",
    "for", "from", "have", "how", "i", "in", "is", "it", "know", "me", "my",
    "of", "on", "or", "that", "the", "this", "to", "was", "what", "when",
    "where", "which", "who", "with", "would"
  ]);
  const ENTITY_INTENT_WORDS = new Set([
    "add", "added", "append", "capture", "change", "create", "database", "document",
    "character", "edit", "existing", "fact", "feet", "field", "food", "foot", "forgot",
    "height", "idea", "info", "information", "log", "note", "page", "person", "preferences",
    "profile", "put", "record", "remember", "save", "set", "stuff", "tall", "text", "thing",
    "things", "update", "visible", "write"
  ]);
  const ENTITY_KINDS = new Set([
    "database-row", "page", "note", "document-section", "canvas-block"
  ]);
  const PRIMARY_ENTITY_KINDS = new Set(["database-row", "page"]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeString(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  function stripHTML(value = "") {
    return safeString(value)
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeSearchText(value = "") {
    return stripHTML(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenize(value = "") {
    const all = normalizeSearchText(value)
      .split(" ")
      .filter((token) => token.length > 1);
    const useful = all.filter((token) => !STOP_WORDS.has(token));
    return [...new Set(useful.length ? useful : all)];
  }

  function dedupeStrings(values = []) {
    return [...new Set(asArray(values).map((item) => safeString(item).trim()).filter(Boolean))];
  }

  function parseMaybeJSON(value, fallback) {
    if (value && typeof value === "object") return value;
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function parseRelationValues(value) {
    const parsed = parseMaybeJSON(value, null);
    if (Array.isArray(parsed)) return dedupeStrings(parsed);
    if (parsed && typeof parsed === "object") {
      return dedupeStrings(parsed.rowIds || parsed.ids || parsed.values || []);
    }
    return dedupeStrings(safeString(value).split(","));
  }

  function sourceKey(source = {}) {
    const kind = source.kind === "block" ? "block" : "page";
    const pageId = safeString(source.pageId).trim();
    const blockId = kind === "block" ? safeString(source.blockId).trim() : "";
    return `${kind}:${pageId}:${blockId}`;
  }

  function databaseRef(source = {}) {
    return `database:${sourceKey(source)}`;
  }

  function databaseRowRef(source = {}, rowId = "") {
    return `${databaseRef(source)}:row:${safeString(rowId).trim()}`;
  }

  function pageRef(pageId = "") {
    return `page:${safeString(pageId).trim()}`;
  }

  function addRelation(record, relation = {}) {
    const targetRef = safeString(relation.targetRef).trim();
    if (!record || !targetRef || targetRef === record.ref) return;
    const kind = safeString(relation.kind || "related").trim() || "related";
    const key = `${kind}:${targetRef}`;
    if (record.__relationKeys.has(key)) return;
    record.__relationKeys.add(key);
    record.relations.push({
      kind,
      targetRef,
      label: safeString(relation.label).trim()
    });
  }

  function createRecord(input = {}) {
    const ref = safeString(input.ref).trim();
    if (!ref) return null;
    const title = stripHTML(input.title || "Untitled") || "Untitled";
    const text = stripHTML(input.text || "");
    const properties = asArray(input.properties).map((property) => ({
      id: safeString(property?.id).trim(),
      name: stripHTML(property?.name || property?.label || "Property") || "Property",
      type: safeString(property?.type || "text").trim() || "text",
      value: property?.value ?? "",
      displayValue: stripHTML(property?.displayValue ?? property?.value ?? "")
    }));
    const record = {
      ref,
      id: safeString(input.id || ref).trim(),
      kind: safeString(input.kind || "record").trim() || "record",
      type: safeString(input.type || input.kind || "record").trim() || "record",
      title,
      text,
      scopeId: safeString(input.scopeId).trim(),
      scopeTitle: stripHTML(input.scopeTitle || ""),
      pageId: safeString(input.pageId).trim(),
      parentRef: safeString(input.parentRef).trim(),
      breadcrumb: asArray(input.breadcrumb).map(stripHTML).filter(Boolean),
      properties,
      relations: [],
      createdAt: input.createdAt || "",
      updatedAt: input.updatedAt || "",
      checklistState: safeString(input.checklistState).trim(),
      source: { ...asObject(input.source) },
      archived: input.archived === true,
      __relationKeys: new Set()
    };
    asArray(input.relations).forEach((relation) => addRelation(record, relation));
    return record;
  }

  function finishRecord(record) {
    const propertyText = record.properties
      .map((property) => `${property.name} ${property.displayValue}`)
      .join(" ");
    record.searchText = normalizeSearchText([
      record.title,
      record.text,
      record.type,
      record.kind,
      record.checklistState,
      record.scopeTitle,
      record.breadcrumb.join(" "),
      propertyText
    ].join(" "));
    delete record.__relationKeys;
    return record;
  }

  function getPageCollections(snapshot = {}) {
    const domains = asArray(snapshot.domains).map((domain) => ({
      ...domain,
      type: "domain",
      parent: "home",
      isScopeBoundary: true
    }));
    const pages = asArray(snapshot.pages);
    return { domains, pages, all: [...domains, ...pages] };
  }

  function isScopeBoundary(page = {}) {
    return page.type === "domain"
      || page.isScopeBoundary === true
      || page.definesScope === true
      || page.containerType === "project";
  }

  function createPageResolver(snapshot = {}) {
    const collections = getPageCollections(snapshot);
    const pageById = new Map(collections.all.filter((page) => page?.id).map((page) => [page.id, page]));

    function path(pageId = "") {
      const result = [];
      const visited = new Set();
      let current = pageById.get(pageId) || null;
      while (current?.id && !visited.has(current.id)) {
        visited.add(current.id);
        result.unshift(current);
        if (!current.parent || current.parent === "home") break;
        current = pageById.get(current.parent) || null;
      }
      return result;
    }

    function scope(pageId = "") {
      const pagePath = path(pageId);
      for (let index = pagePath.length - 1; index >= 0; index -= 1) {
        if (isScopeBoundary(pagePath[index])) return pagePath[index];
      }
      return null;
    }

    return { ...collections, pageById, path, scope };
  }

  function getScopeInfo(resolver, pageId = "") {
    const scope = resolver.scope(pageId);
    return {
      scopeId: scope?.id || "",
      scopeTitle: scope?.title || "",
      breadcrumb: resolver.path(pageId).map((page) => page.title || "Untitled")
    };
  }

  function normalizePageProperties(raw = {}) {
    return asArray(raw?.properties).map((property) => {
      const linkedIds = dedupeStrings(property?.linkedPageIds);
      return {
        id: safeString(property?.id).trim(),
        name: safeString(property?.label || property?.name || "Property"),
        type: safeString(property?.type || "text"),
        value: property?.type === "relation" ? linkedIds : (property?.value ?? ""),
        displayValue: property?.type === "relation" ? linkedIds.join(", ") : (property?.value ?? ""),
        linkedPageIds: linkedIds
      };
    });
  }

  function collectNestedBlockContent(items = [], output = { text: [], linkedPageIds: [] }, depth = 0) {
    if (depth > 8) return output;
    asArray(items).forEach((item) => {
      [
        item?.titleHTML,
        item?.bodyHTML,
        item?.containerTitle,
        item?.containerBody,
        item?.tableHTML,
        item?.pageCardTitle,
        item?.pageCardSummary,
        item?.externalUrl
      ].forEach((value) => {
        const clean = stripHTML(value || "");
        if (clean) output.text.push(clean);
      });
      if (item?.linkedPageId) output.linkedPageIds.push(item.linkedPageId);
      collectNestedBlockContent(item?.containerItems, output, depth + 1);
    });
    return output;
  }

  function normalizeDatabaseProperty(property = {}) {
    const type = safeString(property.type || "text").trim() || "text";
    return {
      id: safeString(property.id).trim(),
      name: stripHTML(property.name || "Property") || "Property",
      type,
      relationTarget: type === "relation" ? { ...asObject(property.relationTarget) } : null
    };
  }

  function formatDatabaseValue(property = {}, value) {
    if (property.type === "checkbox") {
      return value === true || value === "true" || value === "1" ? "Yes" : "No";
    }
    if (property.type === "relation") return parseRelationValues(value).join(", ");
    if (Array.isArray(value)) return value.map(safeString).filter(Boolean).join(", ");
    const parsed = parseMaybeJSON(value, null);
    if (parsed && typeof parsed === "object") {
      if (parsed.start || parsed.end) return [parsed.start, parsed.end].filter(Boolean).join(" to ");
      return safeString(parsed);
    }
    return safeString(value);
  }

  function buildCatalog(snapshot = {}) {
    const resolver = createPageResolver(snapshot);
    const records = [];
    const recordByRef = new Map();
    const schemas = [];

    function register(input) {
      const record = createRecord(input);
      if (!record) return null;
      const existing = recordByRef.get(record.ref);
      if (existing) return existing;
      records.push(record);
      recordByRef.set(record.ref, record);
      return record;
    }

    resolver.all.forEach((page) => {
      if (!page?.id || SYSTEM_PAGE_IDS.has(page.id)) return;
      const scopeInfo = getScopeInfo(resolver, page.id);
      const rawProps = asObject(snapshot.pageProps)[page.id] || {};
      const properties = normalizePageProperties(rawProps);
      const record = register({
        ref: pageRef(page.id),
        id: page.id,
        kind: isScopeBoundary(page) ? "scope" : "page",
        type: page.category || page.containerType || page.layout || page.type || "page",
        title: page.title || "Untitled page",
        text: [page.summary, page.description].filter(Boolean).join("\n"),
        scopeId: scopeInfo.scopeId,
        scopeTitle: scopeInfo.scopeTitle,
        pageId: page.id,
        parentRef: page.parent && page.parent !== "home" ? pageRef(page.parent) : "",
        breadcrumb: scopeInfo.breadcrumb,
        properties,
        createdAt: page.createdAt || "",
        updatedAt: page.updatedAt || "",
        source: { kind: "page", pageId: page.id }
      });
      if (page.parent && page.parent !== "home") {
        addRelation(record, { kind: "contained-by", targetRef: pageRef(page.parent), label: "Parent page" });
      }
      properties.forEach((property) => {
        asArray(property.linkedPageIds).forEach((linkedPageId) => {
          addRelation(record, {
            kind: property.name || "related",
            targetRef: pageRef(linkedPageId),
            label: property.name || "Related page"
          });
        });
      });
    });

    resolver.all.forEach((page) => {
      if (!page?.id || SYSTEM_PAGE_IDS.has(page.id)) return;
      const parent = page.parent && page.parent !== "home" ? recordByRef.get(pageRef(page.parent)) : null;
      if (parent) addRelation(parent, { kind: "contains", targetRef: pageRef(page.id), label: page.title || "Child page" });
    });

    Object.entries(asObject(snapshot.blocksByPage)).forEach(([pageId, blocks]) => {
      const scopeInfo = getScopeInfo(resolver, pageId);
      asArray(blocks).forEach((block, index) => {
        const collected = collectNestedBlockContent([block]);
        const linkedPageIds = dedupeStrings(collected.linkedPageIds);
        const title = stripHTML(block?.titleHTML || block?.containerTitle || block?.pageCardTitle || "")
          || `${safeString(block?.type || "canvas")} block`;
        const text = collected.text.join("\n");
        if (!text && !linkedPageIds.length) return;
        const blockId = safeString(block?.id || `block-${index}`).trim();
        const ref = `canvas-block:${pageId}:${blockId}`;
        const record = register({
          ref,
          id: blockId,
          kind: "canvas-block",
          type: block?.type || "canvas-block",
          title,
          text,
          scopeId: scopeInfo.scopeId,
          scopeTitle: scopeInfo.scopeTitle,
          pageId,
          parentRef: pageRef(pageId),
          breadcrumb: scopeInfo.breadcrumb,
          source: { kind: "canvas-block", pageId, blockId }
        });
        addRelation(record, { kind: "appears-on", targetRef: pageRef(pageId), label: "Canvas page" });
        linkedPageIds.forEach((linkedPageId) => {
          addRelation(record, { kind: "links-to", targetRef: pageRef(linkedPageId), label: "Linked page" });
        });
      });
    });

    Object.entries(asObject(snapshot.documentsByPage)).forEach(([pageId, documentData]) => {
      const scopeInfo = getScopeInfo(resolver, pageId);
      asArray(documentData?.sections).forEach((section, index) => {
        const sectionId = safeString(section?.id || `section-${index}`).trim();
        const meta = asObject(section?.meta);
        const properties = Object.entries(meta)
          .filter(([, value]) => value !== null && value !== undefined && safeString(value).trim())
          .map(([name, value]) => ({ id: name, name, type: "text", value, displayValue: value }));
        const text = stripHTML(section?.content || "");
        if (!text && !section?.title) return;
        const record = register({
          ref: `document-section:${pageId}:${sectionId}`,
          id: sectionId,
          kind: "document-section",
          type: "document",
          title: section?.title || `Section ${index + 1}`,
          text,
          scopeId: scopeInfo.scopeId,
          scopeTitle: scopeInfo.scopeTitle,
          pageId,
          parentRef: pageRef(pageId),
          breadcrumb: [...scopeInfo.breadcrumb, section?.title || `Section ${index + 1}`],
          properties,
          createdAt: section?.createdAt || documentData?.meta?.createdAt || "",
          updatedAt: section?.updatedAt || documentData?.meta?.updatedAt || "",
          source: { kind: "document-section", pageId, sectionId }
        });
        addRelation(record, { kind: "section-of", targetRef: pageRef(pageId), label: "Document page" });
      });
    });

    asArray(snapshot.notes).forEach((note) => {
      if (!note?.id) return;
      const linkedPageIds = dedupeStrings([
        ...asArray(note.directPageIds),
        note.contextPageId
      ]);
      const anchorPageId = note.contextPageId || linkedPageIds[0] || "";
      const scopeInfo = getScopeInfo(resolver, anchorPageId);
      const record = register({
        ref: `note:${note.id}`,
        id: note.id,
        kind: "note",
        type: note.sourceType || "note",
        title: note.title || "Untitled note",
        text: note.bodyText || note.bodyHTML || note.preview || "",
        scopeId: scopeInfo.scopeId,
        scopeTitle: scopeInfo.scopeTitle,
        pageId: anchorPageId,
        parentRef: anchorPageId ? pageRef(anchorPageId) : "",
        breadcrumb: asArray(note.contextBreadcrumbTitles).length
          ? note.contextBreadcrumbTitles
          : scopeInfo.breadcrumb,
        properties: [
          { id: "tags", name: "Tags", type: "tag", value: dedupeStrings([...(note.visibleTags || []), ...(note.helperTags || [])]) },
          { id: "status", name: "Status", type: "status", value: note.status || note.sortState || "" }
        ],
        createdAt: note.createdAt || "",
        updatedAt: note.updatedAt || "",
        archived: note.archived === true,
        source: { kind: "note", noteId: note.id, pageId: anchorPageId }
      });
      linkedPageIds.forEach((linkedPageId) => {
        addRelation(record, { kind: "linked-to", targetRef: pageRef(linkedPageId), label: "Linked page" });
      });
    });

    const databaseEntries = asArray(snapshot.databases)
      .filter((entry) => entry?.source?.pageId && entry?.database)
      .map((entry) => {
        const source = {
          kind: entry.source.kind === "block" ? "block" : "page",
          pageId: safeString(entry.source.pageId).trim(),
          blockId: entry.source.kind === "block" ? safeString(entry.source.blockId).trim() : ""
        };
        const database = asObject(entry.database);
        const properties = asArray(database.properties).map(normalizeDatabaseProperty);
        return { source, database, properties };
      });

    databaseEntries.forEach(({ source, database, properties }) => {
      const scopeInfo = getScopeInfo(resolver, source.pageId);
      const hostPage = resolver.pageById.get(source.pageId) || {};
      const dbRef = databaseRef(source);
      const dbRecord = register({
        ref: dbRef,
        id: sourceKey(source),
        kind: "database",
        type: "database",
        title: database.title || "Database",
        text: properties.map((property) => `${property.name} (${property.type})`).join(", "),
        scopeId: scopeInfo.scopeId,
        scopeTitle: scopeInfo.scopeTitle,
        pageId: source.pageId,
        parentRef: pageRef(source.pageId),
        breadcrumb: [...scopeInfo.breadcrumb, database.title || "Database"],
        source: { kind: "database", ...source }
      });
      addRelation(dbRecord, { kind: "appears-on", targetRef: pageRef(source.pageId), label: "Database page" });

      schemas.push({
        ref: dbRef,
        title: database.title || "Database",
        scopeId: scopeInfo.scopeId,
        scopeTitle: scopeInfo.scopeTitle,
        pageTitle: hostPage.title || "",
        pageType: hostPage.category || hostPage.containerType || hostPage.layout || hostPage.type || "page",
        breadcrumb: scopeInfo.breadcrumb,
        rowCount: asArray(database.rows).filter((row) => row?.archived !== true).length,
        view: safeString(database.view || "table").trim() || "table",
        source,
        properties: properties.map((property) => ({
          id: property.id,
          name: property.name,
          type: property.type,
          relationTarget: property.relationTarget
        }))
      });

      asArray(database.rows).forEach((row, rowIndex) => {
        const rowId = safeString(row?.id || `row-${rowIndex}`).trim();
        const rowRef = databaseRowRef(source, rowId);
        const rowValues = asObject(row?.values);
        const rowProperties = properties.map((property) => {
          const value = rowValues[property.id];
          return {
            id: property.id,
            name: property.name,
            type: property.type,
            value,
            displayValue: formatDatabaseValue(property, value),
            relationTarget: property.relationTarget
          };
        });
        const titleProperty = properties.find((property) => property.type === "title" || property.id === "name");
        const title = row.title
          || (titleProperty ? formatDatabaseValue(titleProperty, rowValues[titleProperty.id]) : "")
          || "Untitled record";
        const record = register({
          ref: rowRef,
          id: rowId,
          kind: "database-row",
          type: database.title || "database-row",
          title,
          text: rowProperties
            .filter((property) => property.type === "notes" || property.type === "text")
            .map((property) => property.displayValue)
            .filter(Boolean)
            .join("\n"),
          scopeId: scopeInfo.scopeId,
          scopeTitle: scopeInfo.scopeTitle,
          pageId: row.pageId || source.pageId,
          parentRef: dbRef,
          breadcrumb: [...scopeInfo.breadcrumb, database.title || "Database", title],
          properties: rowProperties,
          createdAt: row.createdAt || rowValues.createdAt || "",
          updatedAt: row.updatedAt || rowValues.updatedAt || "",
          checklistState: database.view === "checklist"
            ? (row.checklistChecked === true ? "checked" : "unchecked")
            : "",
          archived: row.archived === true,
          source: {
            kind: "database-row",
            ...source,
            rowId,
            rowPageId: safeString(row.pageId).trim()
          }
        });
        addRelation(record, { kind: "row-of", targetRef: dbRef, label: database.title || "Database" });
        addRelation(dbRecord, { kind: "contains", targetRef: rowRef, label: title });

        rowProperties.forEach((property) => {
          if (property.type !== "relation" || !property.relationTarget) return;
          const targetSource = {
            kind: property.relationTarget.kind === "block" ? "block" : "page",
            pageId: safeString(property.relationTarget.pageId).trim(),
            blockId: property.relationTarget.kind === "block"
              ? safeString(property.relationTarget.blockId).trim()
              : ""
          };
          if (!targetSource.pageId) return;
          parseRelationValues(property.value).forEach((targetRowId) => {
            addRelation(record, {
              kind: property.name || "related",
              targetRef: databaseRowRef(targetSource, targetRowId),
              label: property.name || "Related record"
            });
          });
        });
      });
    });

    records.forEach((record) => {
      const pageRecord = record.pageId ? recordByRef.get(pageRef(record.pageId)) : null;
      if (pageRecord && record.ref !== pageRecord.ref) {
        addRelation(pageRecord, {
          kind: "has-content",
          targetRef: record.ref,
          label: record.title
        });
      }
    });

    records.forEach(finishRecord);
    return {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      records,
      schemas
    };
  }

  function getRecord(catalog = {}, reference = "") {
    const safeRef = safeString(reference).trim();
    if (!safeRef) return null;
    const records = asArray(catalog.records);
    return records.find((record) => record.ref === safeRef)
      || records.find((record) => record.id === safeRef)
      || null;
  }

  function recordMatchesScope(record, scopeId, includeUnscoped = false) {
    if (!scopeId) return true;
    return record.scopeId === scopeId || (includeUnscoped && !record.scopeId);
  }

  function scoreRecord(record, query, tokens, options = {}) {
    const title = normalizeSearchText(record.title);
    const text = normalizeSearchText(record.text);
    const breadcrumb = normalizeSearchText(record.breadcrumb.join(" "));
    const properties = normalizeSearchText(record.properties
      .map((property) => `${property.name} ${property.displayValue}`)
      .join(" "));
    const phrase = normalizeSearchText(query);
    let score = 0;

    if (phrase && title === phrase) score += 40;
    else if (phrase && title.includes(phrase)) score += 22;
    if (phrase && properties.includes(phrase)) score += 12;
    if (phrase && text.includes(phrase)) score += 8;

    tokens.forEach((token) => {
      if (title.includes(token)) score += 9;
      if (properties.includes(token)) score += 5;
      if (breadcrumb.includes(token)) score += 4;
      if (text.includes(token)) score += 2;
      if (normalizeSearchText(record.type).includes(token)) score += 2;
    });

    if (options.preferScopeId && record.scopeId === options.preferScopeId) score += 3;
    if (options.currentPageId && record.pageId === options.currentPageId) score += 4;
    if (record.archived) score -= 6;
    return score;
  }

  function search(catalog = {}, query = "", options = {}) {
    const tokens = tokenize(query);
    const kindFilter = new Set(asArray(options.kinds).map(safeString).filter(Boolean));
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 12));
    return asArray(catalog.records)
      .filter((record) => !kindFilter.size || kindFilter.has(record.kind))
      .filter((record) => recordMatchesScope(record, options.scopeId || "", options.includeUnscoped === true))
      .map((record) => ({ record, score: scoreRecord(record, query, tokens, options) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score
        || safeString(right.record.updatedAt).localeCompare(safeString(left.record.updatedAt))
        || left.record.title.localeCompare(right.record.title))
      .slice(0, limit)
      .map((entry) => ({ ...entry.record, score: entry.score }));
  }

  function getRecordAliases(record = {}) {
    const aliases = [safeString(record.title).trim()];
    asArray(record.properties).forEach((property) => {
      const name = normalizeSearchText(property?.name || "");
      if (!/\b(alias|aka|nickname|name|title)\b/.test(name)) return;
      const value = stripHTML(property?.displayValue ?? property?.value ?? "");
      if (value && value.length <= 160) aliases.push(value);
    });
    return dedupeStrings(aliases);
  }

  function getEntityQueryTokens(query = "") {
    return tokenize(query).filter((token) => (
      !ENTITY_INTENT_WORDS.has(token)
      && !/^\d+(?:\.\d+)?$/.test(token)
    ));
  }

  function scoreEntityCandidate(record, normalizedQuery, entityTokens, tokenFrequency, options = {}) {
    const aliases = getRecordAliases(record);
    const normalizedAliases = aliases.map(normalizeSearchText).filter(Boolean);
    const aliasTokens = new Set(normalizedAliases.flatMap((alias) => alias.split(" ").filter(Boolean)));
    const matchedTokens = entityTokens.filter((token) => aliasTokens.has(token));
    if (!matchedTokens.length) return null;

    let score = 0;
    normalizedAliases.forEach((alias) => {
      if (alias && normalizedQuery === alias) score = Math.max(score, 70);
      else if (alias && normalizedQuery.includes(alias) && alias.split(" ").length > 1) score = Math.max(score, 52);
    });
    matchedTokens.forEach((token) => {
      const frequency = Math.max(1, Number(tokenFrequency.get(token)) || 1);
      score += Math.max(10, 24 - Math.min(12, frequency - 1));
    });
    if (record.kind === "database-row") score += 8;
    else if (record.kind === "note") score += 7;
    else if (record.kind === "page") score += 6;
    else if (record.kind === "document-section") score += 5;
    else if (record.kind === "canvas-block") score += 3;
    if (options.preferScopeId && record.scopeId === options.preferScopeId) score += 3;
    if (options.currentPageId && record.pageId === options.currentPageId) score += 4;
    if (record.archived) score -= 10;

    return {
      record,
      score,
      aliases,
      matchedTokens,
      exactTitle: normalizedQuery.includes(normalizeSearchText(record.title))
        && normalizeSearchText(record.title).split(" ").length > 1
    };
  }

  function resolveEntities(catalog = {}, query = "", options = {}) {
    const normalizedQuery = normalizeSearchText(query);
    const entityTokens = getEntityQueryTokens(query);
    if (!normalizedQuery || !entityTokens.length) {
      return {
        status: "none",
        confidence: 0,
        queryTokens: entityTokens,
        entityKey: "",
        candidates: [],
        groups: [],
        allowedDatabaseRefs: []
      };
    }

    const eligibleRecords = asArray(catalog.records).filter((record) => (
      ENTITY_KINDS.has(record.kind) && record.archived !== true
    ));
    const tokenFrequency = new Map();
    eligibleRecords.forEach((record) => {
      const tokens = new Set(getRecordAliases(record).flatMap((alias) => tokenize(alias)));
      entityTokens.forEach((token) => {
        if (tokens.has(token)) tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);
      });
    });

    const scored = eligibleRecords
      .map((record) => scoreEntityCandidate(
        record,
        normalizedQuery,
        entityTokens,
        tokenFrequency,
        options
      ))
      .filter(Boolean)
      .sort((left, right) => right.score - left.score
        || Number(right.exactTitle) - Number(left.exactTitle)
        || left.record.title.localeCompare(right.record.title));

    const maxCandidates = Math.max(1, Math.min(20, Number(options.limit) || 10));
    const candidates = scored.slice(0, maxCandidates);
    const groupsByKey = new Map();
    candidates.forEach((candidate) => {
      const matchedKey = candidate.matchedTokens.join("+");
      const scopeKey = candidate.record.scopeId || "unscoped";
      const groupKey = `${scopeKey}:${matchedKey}`;
      if (!groupsByKey.has(groupKey)) {
        groupsByKey.set(groupKey, {
          key: groupKey,
          scopeId: candidate.record.scopeId || "",
          scopeTitle: candidate.record.scopeTitle || "",
          matchedTokens: candidate.matchedTokens,
          score: candidate.score,
          candidates: []
        });
      }
      const group = groupsByKey.get(groupKey);
      group.score = Math.max(group.score, candidate.score);
      group.candidates.push(candidate);
    });
    const groups = [...groupsByKey.values()].sort((left, right) => right.score - left.score);
    const topGroup = groups[0] || null;
    const secondGroup = groups[1] || null;
    const duplicatePrimaryTitles = topGroup
      ? topGroup.candidates.filter((candidate) => PRIMARY_ENTITY_KINDS.has(candidate.record.kind))
          .reduce((identitiesByTitle, candidate) => {
            const title = normalizeSearchText(candidate.record.title);
            if (!identitiesByTitle.has(title)) identitiesByTitle.set(title, new Set());
            const rowPageId = candidate.record.kind === "database-row"
              ? safeString(candidate.record.source?.rowPageId).trim()
              : "";
            const identityKey = rowPageId
              ? `page:${rowPageId}`
              : candidate.record.kind === "page"
                ? `page:${candidate.record.id}`
                : `${candidate.record.kind}:${candidate.record.ref}`;
            identitiesByTitle.get(title).add(identityKey);
            return identitiesByTitle;
          }, new Map())
      : new Map();
    const hasPrimaryCollision = [...duplicatePrimaryTitles.values()].some((identities) => identities.size > 1);
    const closeCompetingScope = !!(topGroup && secondGroup
      && topGroup.scopeId !== secondGroup.scopeId
      && secondGroup.score >= topGroup.score - 6);
    const ambiguous = hasPrimaryCollision || closeCompetingScope;
    const topScore = Number(topGroup?.score) || 0;
    const confidence = !topGroup
      ? 0
      : ambiguous
        ? Math.min(0.64, topScore / 100)
        : Math.max(0.55, Math.min(0.98, topScore / 72));
    const selectedGroups = ambiguous ? groups.slice(0, 3) : groups.slice(0, 1);
    const selectedCandidates = selectedGroups
      .flatMap((group) => group.candidates)
      .slice(0, maxCandidates);
    const allowedDatabaseRefs = dedupeStrings(selectedCandidates
      .filter((candidate) => candidate.record.kind === "database-row")
      .map((candidate) => candidate.record.parentRef));

    return {
      status: topGroup ? (ambiguous ? "ambiguous" : "resolved") : "none",
      confidence,
      queryTokens: entityTokens,
      entityKey: ambiguous ? "" : (topGroup?.key || ""),
      candidates: selectedCandidates.map((candidate) => ({
        ref: candidate.record.ref,
        kind: candidate.record.kind,
        title: candidate.record.title,
        scopeId: candidate.record.scopeId || "",
        scopeTitle: candidate.record.scopeTitle || "",
        pageId: candidate.record.pageId || "",
        breadcrumb: asArray(candidate.record.breadcrumb),
        source: { ...asObject(candidate.record.source) },
        score: candidate.score,
        matchedTokens: candidate.matchedTokens,
        aliases: candidate.aliases
      })),
      groups: selectedGroups.map((group) => ({
        key: group.key,
        scopeId: group.scopeId,
        scopeTitle: group.scopeTitle,
        matchedTokens: group.matchedTokens,
        score: group.score,
        candidateRefs: group.candidates.map((candidate) => candidate.record.ref)
      })),
      allowedDatabaseRefs
    };
  }

  function getRelated(catalog = {}, reference = "", options = {}) {
    const record = getRecord(catalog, reference);
    if (!record) return [];
    const kindFilter = new Set(asArray(options.kinds).map(safeString).filter(Boolean));
    const relationKinds = new Set(asArray(options.relationKinds).map(safeString).filter(Boolean));
    const relatedRefs = new Map();

    asArray(record.relations).forEach((relation) => {
      if (relationKinds.size && !relationKinds.has(relation.kind)) return;
      relatedRefs.set(relation.targetRef, relation.kind);
    });

    if (options.includeIncoming !== false) {
      asArray(catalog.records).forEach((candidate) => {
        asArray(candidate.relations).forEach((relation) => {
          if (relation.targetRef !== record.ref) return;
          if (relationKinds.size && !relationKinds.has(relation.kind)) return;
          if (!relatedRefs.has(candidate.ref)) relatedRefs.set(candidate.ref, `incoming:${relation.kind}`);
        });
      });
    }

    return [...relatedRefs.entries()]
      .map(([ref, relationKind]) => {
        const target = getRecord(catalog, ref);
        return target ? { ...target, relationKind } : null;
      })
      .filter(Boolean)
      .filter((candidate) => !kindFilter.size || kindFilter.has(candidate.kind))
      .slice(0, Math.max(1, Math.min(100, Number(options.limit) || 20)));
  }

  function parseDateValue(value) {
    if (!value) return null;
    const parsed = parseMaybeJSON(value, value);
    const candidate = parsed && typeof parsed === "object"
      ? (parsed.start || parsed.date || parsed.value || "")
      : parsed;
    const timestamp = Date.parse(candidate);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  function getRecordDates(record = {}) {
    const dates = [];
    const add = (value, label) => {
      const iso = parseDateValue(value);
      if (iso) dates.push({ iso, label });
    };
    add(record.createdAt, "Created");
    add(record.updatedAt, "Updated");
    asArray(record.properties).forEach((property) => {
      if (["date", "created-time", "edited-time"].includes(property.type)) {
        add(property.value, property.name);
      }
    });
    return dates;
  }

  function getTimeline(catalog = {}, options = {}) {
    const from = options.from ? Date.parse(options.from) : Number.NEGATIVE_INFINITY;
    const to = options.to ? Date.parse(options.to) : Number.POSITIVE_INFINITY;
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    let records = asArray(catalog.records);
    if (options.query) {
      const refs = new Set(search(catalog, options.query, { ...options, limit: 200 }).map((record) => record.ref));
      records = records.filter((record) => refs.has(record.ref));
    } else if (options.scopeId) {
      records = records.filter((record) => recordMatchesScope(record, options.scopeId, options.includeUnscoped === true));
    }

    return records
      .flatMap((record) => getRecordDates(record).map((date) => ({
        ref: record.ref,
        kind: record.kind,
        type: record.type,
        title: record.title,
        scopeId: record.scopeId,
        scopeTitle: record.scopeTitle,
        pageId: record.pageId,
        date: date.iso,
        dateLabel: date.label,
        source: record.source
      })))
      .filter((entry) => {
        const timestamp = Date.parse(entry.date);
        return timestamp >= from && timestamp <= to;
      })
      .sort((left, right) => Date.parse(right.date) - Date.parse(left.date))
      .slice(0, limit);
  }

  function toAssistantRecord(record = {}, options = {}) {
    const maxText = Math.max(120, Math.min(4000, Number(options.maxText) || 1200));
    return {
      ref: record.ref,
      kind: record.kind,
      type: record.type,
      title: record.title,
      scope: record.scopeTitle || "",
      scopeId: record.scopeId || "",
      pageId: record.pageId || "",
      breadcrumb: asArray(record.breadcrumb),
      text: safeString(record.text).slice(0, maxText),
      properties: asArray(record.properties)
        .filter((property) => property.displayValue !== "")
        .slice(0, 24)
        .map((property) => ({
          name: property.name,
          type: property.type,
          value: safeString(property.displayValue).slice(0, 500)
        })),
      relations: asArray(record.relations).slice(0, 16),
      updatedAt: record.updatedAt || "",
      checklistState: record.checklistState || "",
      source: record.source
    };
  }

  function getRelevantSchemas(catalog = {}, records = [], options = {}) {
    const limit = Math.max(1, Math.min(30, Number(options.limit) || 12));
    const databaseRefs = new Set();
    const scopeIds = new Set();
    asArray(records).forEach((record) => {
      if (record.kind === "database") databaseRefs.add(record.ref);
      if (record.kind === "database-row" && record.parentRef) databaseRefs.add(record.parentRef);
      if (record.scopeId) scopeIds.add(record.scopeId);
    });
    return asArray(catalog.schemas)
      .filter((schema) => databaseRefs.has(schema.ref)
        || (options.includeScopeSchemas === true && schema.scopeId && scopeIds.has(schema.scopeId)))
      .slice(0, limit);
  }

  function toAssistantSchema(schema = {}) {
    return {
      ref: schema.ref || "",
      title: schema.title || "Database",
      scopeId: schema.scopeId || "",
      scopeTitle: schema.scopeTitle || "",
      pageTitle: schema.pageTitle || "",
      pageType: schema.pageType || "",
      breadcrumb: asArray(schema.breadcrumb),
      rowCount: Number(schema.rowCount) || 0,
      view: schema.view || "table",
      source: { ...asObject(schema.source) },
      properties: asArray(schema.properties).slice(0, 40).map((property) => ({
        id: property.id || "",
        name: property.name || "Property",
        type: property.type || "text",
        relationTarget: property.relationTarget && typeof property.relationTarget === "object"
          ? { ...property.relationTarget }
          : null
      }))
    };
  }

  function normalizeRoutePlan(catalog = {}, rawPlan = {}, options = {}) {
    const schemaByRef = new Map(asArray(catalog.schemas).map((schema) => [schema.ref, schema]));
    const maxDatabases = Math.max(1, Math.min(12, Number(options.maxDatabases) || 6));
    const maxRowsPerDatabase = Math.max(1, Math.min(100, Number(options.maxRowsPerDatabase) || 60));
    const rawSelections = asArray(rawPlan?.selections || rawPlan?.databases || rawPlan?.databaseSelections);
    const seen = new Set();
    const selections = [];

    rawSelections.forEach((selection) => {
      const ref = safeString(
        typeof selection === "string"
          ? selection
          : (selection?.databaseRef || selection?.ref)
      ).trim();
      if (!ref || seen.has(ref) || !schemaByRef.has(ref) || selections.length >= maxDatabases) return;
      seen.add(ref);
      const requestedMode = safeString(selection?.rowMode || selection?.mode || "matching").trim().toLowerCase();
      const rowMode = ["all", "matching", "recent", "none"].includes(requestedMode)
        ? requestedMode
        : "matching";
      selections.push({
        databaseRef: ref,
        rowMode,
        rowQuery: safeString(selection?.rowQuery || selection?.query || rawPlan?.supportingQuery || "").trim(),
        reason: safeString(selection?.reason).trim(),
        limit: Math.max(1, Math.min(
          maxRowsPerDatabase,
          Number(selection?.limit) || (rowMode === "all" ? maxRowsPerDatabase : 16)
        ))
      });
    });

    const includeInput = asObject(rawPlan?.include);
    return {
      selections,
      include: {
        notes: includeInput.notes === true || rawPlan?.includeNotes === true,
        documents: includeInput.documents === true || rawPlan?.includeDocuments === true,
        canvas: includeInput.canvas === true || rawPlan?.includeCanvas === true,
        pages: includeInput.pages === true || rawPlan?.includePages === true,
        currentPage: includeInput.currentPage !== false && rawPlan?.includeCurrentPage !== false
      },
      supportingQuery: safeString(rawPlan?.supportingQuery || "").trim(),
      reasoning: safeString(rawPlan?.reasoning || rawPlan?.reason || "").trim()
    };
  }

  function getDatabaseRows(catalog = {}, databaseReference = "", options = {}) {
    const ref = safeString(databaseReference).trim();
    if (!ref) return [];
    const mode = ["all", "matching", "recent", "none"].includes(options.mode)
      ? options.mode
      : "matching";
    if (mode === "none") return [];
    const limit = Math.max(1, Math.min(60, Number(options.limit) || 16));
    const rows = asArray(catalog.records).filter((record) => (
      record.kind === "database-row"
      && record.parentRef === ref
      && record.archived !== true
    ));

    if (mode === "recent") {
      return [...rows]
        .sort((left, right) => safeString(right.updatedAt || right.createdAt)
          .localeCompare(safeString(left.updatedAt || left.createdAt)))
        .slice(0, limit);
    }

    if (mode === "matching") {
      const query = safeString(options.query).trim();
      if (!query) return rows.slice(0, limit);
      const tokens = tokenize(query);
      return rows
        .map((record) => ({ record, score: scoreRecord(record, query, tokens, options) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score
          || left.record.title.localeCompare(right.record.title))
        .slice(0, limit)
        .map((entry) => ({ ...entry.record, score: entry.score }));
    }

    return rows.slice(0, limit);
  }

  function routeSchemasDeterministically(catalog = {}, query = "", options = {}) {
    const tokens = tokenize(query);
    const phrase = normalizeSearchText(query);
    const currentPageId = safeString(options.currentPageId).trim();
    const preferScopeId = safeString(options.preferScopeId).trim();
    const refersToCurrent = /\b(this|here|current)\b/.test(phrase);
    const scored = asArray(catalog.schemas).map((schema) => {
      const title = normalizeSearchText(schema.title);
      const page = normalizeSearchText(`${schema.pageTitle || ""} ${schema.pageType || ""}`);
      const path = normalizeSearchText(asArray(schema.breadcrumb).join(" "));
      const fields = normalizeSearchText(asArray(schema.properties).map((property) => (
        `${property.name || ""} ${property.type || ""}`
      )).join(" "));
      let score = 0;
      if (phrase && title.includes(phrase)) score += 20;
      tokens.forEach((token) => {
        if (title.includes(token)) score += 8;
        if (page.includes(token)) score += 5;
        if (path.includes(token)) score += 3;
        if (fields.includes(token)) score += 2;
      });
      const hasSchemaMatch = score > 0;
      if (hasSchemaMatch && currentPageId && schema.source?.pageId === currentPageId) score += 4;
      if (hasSchemaMatch && preferScopeId && schema.scopeId === preferScopeId) score += 2;
      if (!hasSchemaMatch && refersToCurrent && currentPageId && schema.source?.pageId === currentPageId) score += 4;
      return { schema, score };
    }).sort((left, right) => right.score - left.score);

    const positive = scored.filter((entry) => entry.score > 0);
    const selected = positive.length
      ? positive.slice(0, Math.max(1, Math.min(6, Number(options.limit) || 4)))
      : scored.filter((entry) => entry.schema.source?.pageId === currentPageId).slice(0, 2);
    const normalizedQuery = phrase;
    const needsCurrentContent = refersToCurrent && !selected.length;
    const looksLikeCapture = /\b(add|record|save|remember|log|put|forgot to add)\b/.test(normalizedQuery);
    return normalizeRoutePlan(catalog, {
      selections: selected.map(({ schema }) => ({
        databaseRef: schema.ref,
        rowMode: "matching",
        rowQuery: query,
        reason: "Local schema match"
      })),
      include: {
        notes: /\b(note|notes|wrote|write|remember)\b/.test(normalizedQuery) || needsCurrentContent || looksLikeCapture,
        documents: /\b(document|documents|draft|chapter|reference|lore)\b/.test(normalizedQuery) || needsCurrentContent || looksLikeCapture,
        canvas: /\b(canvas|board|layout|visual)\b/.test(normalizedQuery) || needsCurrentContent || looksLikeCapture,
        pages: /\b(page|pages|where)\b/.test(normalizedQuery) || needsCurrentContent || looksLikeCapture,
        currentPage: refersToCurrent
      },
      supportingQuery: query,
      reasoning: "Local fallback routing"
    }, options);
  }

  function retrieveByRoutePlan(catalog = {}, rawPlan = {}, options = {}) {
    const plan = normalizeRoutePlan(catalog, rawPlan, options);
    const query = safeString(options.query || plan.supportingQuery).trim();
    const currentPageId = safeString(options.currentPageId).trim();
    const records = [];
    const schemas = [];
    const seenRecords = new Set();
    const seenSchemas = new Set();

    const addRecord = (record) => {
      if (!record?.ref || seenRecords.has(record.ref)) return;
      seenRecords.add(record.ref);
      records.push(record);
    };
    const addSchema = (schema) => {
      if (!schema?.ref || seenSchemas.has(schema.ref)) return;
      seenSchemas.add(schema.ref);
      schemas.push(schema);
    };
    const schemaByRef = new Map(asArray(catalog.schemas).map((schema) => [schema.ref, schema]));
    const entityResolution = resolveEntities(catalog, query, {
      preferScopeId: options.preferScopeId || "",
      currentPageId,
      limit: 10
    });

    // Structured selections are the primary context. Add their rows before
    // entity and supporting-content expansion so a bounded result cannot cut
    // off requested database rows after unrelated supporting records.
    plan.selections.forEach((selection) => {
      const schema = schemaByRef.get(selection.databaseRef);
      const database = getRecord(catalog, selection.databaseRef);
      if (schema) addSchema(schema);
      if (database) addRecord(database);
      getDatabaseRows(catalog, selection.databaseRef, {
        mode: selection.rowMode,
        query: selection.rowQuery || query,
        limit: selection.limit
      }).forEach(addRecord);
    });

    entityResolution.candidates.forEach((candidate) => {
      const record = getRecord(catalog, candidate.ref);
      if (!record) return;
      addRecord(record);
      if (record.kind === "database-row" && record.parentRef) {
        addRecord(getRecord(catalog, record.parentRef));
        addSchema(schemaByRef.get(record.parentRef));
      }
      getRelated(catalog, record.ref, {
        includeIncoming: true,
        kinds: ["page", "note", "document-section", "canvas-block", "database-row"],
        limit: 6
      }).forEach((related) => {
        addRecord(related);
        if (related.kind === "database-row" && related.parentRef) {
          addRecord(getRecord(catalog, related.parentRef));
          addSchema(schemaByRef.get(related.parentRef));
        }
      });
    });

    plan.selections.forEach((selection) => {
      const schema = schemaByRef.get(selection.databaseRef);
      const database = getRecord(catalog, selection.databaseRef);
      if (schema) addSchema(schema);
      if (database) addRecord(database);
      getDatabaseRows(catalog, selection.databaseRef, {
        mode: selection.rowMode,
        query: selection.rowQuery || query,
        limit: selection.limit
      }).forEach((row) => {
        addRecord(row);
        getRelated(catalog, row.ref, {
          includeIncoming: false,
          limit: 10
        }).forEach((related) => {
          if (related.kind !== "database-row") return;
          addRecord(related);
          if (related.parentRef && schemaByRef.has(related.parentRef)) {
            addSchema(schemaByRef.get(related.parentRef));
            addRecord(getRecord(catalog, related.parentRef));
          }
        });
      });
    });

    const supportingKinds = [];
    if (plan.include.notes) supportingKinds.push("note");
    if (plan.include.documents) supportingKinds.push("document-section");
    if (plan.include.canvas) supportingKinds.push("canvas-block");
    if (plan.include.pages) supportingKinds.push("page", "scope");
    if (supportingKinds.length && query) {
      search(catalog, query, {
        kinds: supportingKinds,
        preferScopeId: options.preferScopeId || "",
        currentPageId,
        limit: 10
      }).forEach(addRecord);
    }

    if (plan.include.currentPage && currentPageId) {
      const currentPage = getRecord(catalog, pageRef(currentPageId));
      if (currentPage) addRecord(currentPage);
      if (plan.include.canvas || plan.include.documents || plan.include.notes) {
        getRelated(catalog, pageRef(currentPageId), {
          includeIncoming: true,
          kinds: ["canvas-block", "document-section", "note"],
          limit: 8
        }).forEach(addRecord);
      }
    }

    return {
      plan,
      entityResolution,
      records: records.slice(0, Math.max(1, Math.min(60, Number(options.maxRecords) || 42))),
      schemas: schemas.slice(0, Math.max(1, Math.min(12, Number(options.maxSchemas) || 8)))
    };
  }

  return {
    VERSION,
    buildCatalog,
    search,
    getRecord,
    getRelated,
    getTimeline,
    getRelevantSchemas,
    getDatabaseRows,
    resolveEntities,
    routeSchemasDeterministically,
    normalizeRoutePlan,
    retrieveByRoutePlan,
    toAssistantRecord,
    toAssistantSchema,
    stripHTML,
    tokenize,
    sourceKey,
    databaseRef,
    databaseRowRef,
    pageRef
  };
});
