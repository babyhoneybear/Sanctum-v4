(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SanctumAssistantOperations = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;
  const OPERATION_TYPES = new Set([
    "create-database-row",
    "update-database-row",
    "update-database-rows",
    "relate-database-rows",
    "append-database-field",
    "set-database-checklist-state",
    "append-note-content",
    "append-document-section",
    "add-page-text-block",
    "create-page",
    "create-inline-database",
    "replace-note-text",
    "replace-document-section-text",
    "replace-canvas-block-text"
  ]);
  const CONTENT_OPERATION_TYPES = new Set([
    "append-note-content",
    "append-document-section",
    "add-page-text-block",
    "replace-note-text",
    "replace-document-section-text",
    "replace-canvas-block-text"
  ]);
  const REPLACE_CONTENT_OPERATION_TYPES = new Set([
    "replace-note-text",
    "replace-document-section-text",
    "replace-canvas-block-text"
  ]);
  const PAGE_LAYOUTS = new Set(["board-canvas", "infinite-canvas", "document", "journal"]);
  const PAGE_CONTAINER_TYPES = new Set(["page", "detail", "hub", "project"]);
  const DATABASE_PROPERTY_TYPES = new Set([
    "title", "text", "number", "select", "checkbox", "relation", "date", "status", "tag", "notes"
  ]);
  const DATABASE_VIEW_TYPES = new Set(["table", "board", "gallery", "calendar", "checklist"]);
  const PAGE_CATEGORIES = new Set([
    "none", "character", "spell", "item", "location", "event",
    "medication", "condition", "note"
  ]);
  const EDITABLE_PROPERTY_TYPES = new Set([
    "title", "text", "number", "select", "checkbox", "relation",
    "date", "status", "tag", "notes"
  ]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeString(value, max = 1000) {
    if (value === null || value === undefined) return "";
    return String(value).slice(0, max);
  }

  function clampConfidence(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
  }

  function stableFingerprint(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `content-${(hash >>> 0).toString(16)}-${text.length}`;
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function databaseRefFromSource(source = {}) {
    const kind = source.kind === "block" ? "block" : "page";
    const pageId = safeString(source.pageId, 180).trim();
    const blockId = kind === "block" ? safeString(source.blockId, 180).trim() : "";
    return pageId ? `database:${kind}:${pageId}:${blockId}` : "";
  }

  function normalizeSource(source = {}) {
    const kind = source.kind === "block" ? "block" : "page";
    return {
      kind,
      pageId: safeString(source.pageId, 180).trim(),
      blockId: kind === "block" ? safeString(source.blockId, 180).trim() : ""
    };
  }

  function sanitizeValue(value, depth = 0) {
    if (depth > 4) return null;
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value.slice(0, 4000);
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
    if (typeof value === "object") {
      return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => (
        [safeString(key, 160), sanitizeValue(item, depth + 1)]
      )));
    }
    return safeString(value, 4000);
  }

  function normalizeRowIds(value) {
    const raw = Array.isArray(value)
      ? value
      : (typeof value === "string" ? value.split(",") : []);
    return [...new Set(raw.map((item) => safeString(item, 180).trim()).filter(Boolean))].slice(0, 30);
  }

  function makeCatalogIndex(catalog = {}) {
    const schemas = asArray(catalog.schemas);
    const records = asArray(catalog.records);
    return {
      schemaByRef: new Map(schemas.map((schema) => [schema.ref, schema])),
      recordByRef: new Map(records.map((record) => [record.ref, record])),
      rowsByDatabaseRef: records.reduce((map, record) => {
        if (record.kind !== "database-row" || !record.parentRef) return map;
        if (!map.has(record.parentRef)) map.set(record.parentRef, new Map());
        map.get(record.parentRef).set(record.id, record);
        return map;
      }, new Map())
    };
  }

  function getAllowedContentRefs(options = {}) {
    return new Set(asArray(options.allowedContentRefs)
      .map((item) => safeString(item, 240).trim())
      .filter(Boolean));
  }

  function getAllowedDatabaseRefs(routePlan = {}, options = {}) {
    const explicit = asArray(options.allowedDatabaseRefs).map((item) => safeString(item, 240).trim()).filter(Boolean);
    if (explicit.length) return new Set(explicit);
    return new Set(asArray(routePlan?.selections)
      .map((selection) => safeString(selection?.databaseRef || selection?.ref, 240).trim())
      .filter(Boolean));
  }

  function resolveDatabaseRef(operation = {}) {
    const explicit = safeString(operation.databaseRef, 240).trim();
    return explicit || databaseRefFromSource(operation.source || {});
  }

  function getProperty(schema = {}, propertyId = "") {
    const safeId = safeString(propertyId, 160).trim();
    return asArray(schema?.properties).find((property) => property.id === safeId) || null;
  }

  function getRelationTargetRef(property = {}) {
    return databaseRefFromSource(property.relationTarget || {});
  }

  function normalizePropertyValue(property, value, index) {
    if (!property || !EDITABLE_PROPERTY_TYPES.has(property.type)) {
      return { ok: false, reason: "Property is not editable." };
    }
    const clean = sanitizeValue(value);
    if (property.type === "number") {
      const parsed = Number(typeof clean === "string" ? clean.replace(/,/g, "") : clean);
      if (!Number.isFinite(parsed)) return { ok: false, reason: `"${property.name}" requires a number.` };
      return { ok: true, value: parsed };
    }
    if (property.type === "checkbox") {
      if (typeof clean === "boolean") return { ok: true, value: clean };
      if (clean === "true" || clean === "1") return { ok: true, value: true };
      if (clean === "false" || clean === "0") return { ok: true, value: false };
      return { ok: false, reason: `"${property.name}" requires true or false.` };
    }
    if (property.type === "relation") {
      const targetRef = getRelationTargetRef(property);
      if (!targetRef || !index.schemaByRef.has(targetRef)) {
        return { ok: false, reason: `"${property.name}" has no valid relation target.` };
      }
      const rowIds = normalizeRowIds(clean);
      const targetRows = index.rowsByDatabaseRef.get(targetRef) || new Map();
      if (rowIds.some((rowId) => !targetRows.has(rowId))) {
        return { ok: false, reason: `"${property.name}" references an unknown row.` };
      }
      return { ok: true, value: rowIds };
    }
    if (property.type === "date") {
      if (typeof clean === "string" && clean.trim()) return { ok: true, value: clean.trim() };
      if (clean && typeof clean === "object" && (clean.start || clean.date)) return { ok: true, value: clean };
      return { ok: false, reason: `"${property.name}" requires a date.` };
    }
    return { ok: true, value: clean };
  }

  function normalizeValues(schema, rawValues, index, existingRow = null) {
    const values = {};
    const changes = [];
    const rejected = [];
    Object.entries(asObject(rawValues)).slice(0, 40).forEach(([propertyId, rawValue]) => {
      const property = getProperty(schema, propertyId);
      if (!property) {
        rejected.push(`Unknown property "${safeString(propertyId, 160)}".`);
        return;
      }
      const normalized = normalizePropertyValue(property, rawValue, index);
      if (!normalized.ok) {
        rejected.push(normalized.reason);
        return;
      }
      values[property.id] = normalized.value;
      const existingProperty = asArray(existingRow?.properties).find((entry) => entry.id === property.id);
      changes.push({
        propertyId: property.id,
        propertyName: property.name,
        propertyType: property.type,
        oldValue: existingRow ? (existingProperty?.value ?? existingProperty?.displayValue ?? "") : null,
        newValue: normalized.value
      });
    });
    return { values, changes, rejected };
  }

  function normalizeCommon(operation = {}, context = {}) {
    const basis = ["explicit", "inferred"].includes(operation.basis) ? operation.basis : "inferred";
    return {
      id: context.id || "",
      basis,
      confidence: clampConfidence(operation.confidence),
      reason: safeString(operation.reason, 500).trim(),
      assumptions: asArray(operation.assumptions)
        .map((item) => safeString(item, 500).trim())
        .filter(Boolean)
        .slice(0, 8),
      evidenceRefs: asArray(operation.evidenceRefs)
        .map((item) => safeString(item, 240).trim())
        .filter((ref) => ref && context.index?.recordByRef?.has(ref))
        .slice(0, 12)
    };
  }

  function normalizeCreateOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) return { error: "Database was not selected by the context router." };
    const schema = context.index.schemaByRef.get(databaseRef);
    if (!schema) return { error: "Database does not exist." };
    const normalized = normalizeValues(schema, operation.values, context.index, null);
    if (!Object.keys(normalized.values).length) {
      return { error: normalized.rejected[0] || "Create operation has no valid values." };
    }
    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "create-database-row",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Database",
        temporaryRowRef: `@${context.id}`,
        values: normalized.values,
        changes: normalized.changes,
        warnings: normalized.rejected
      }
    };
  }

  function normalizeUpdateOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) return { error: "Database was not selected by the context router." };
    const schema = context.index.schemaByRef.get(databaseRef);
    const rowId = safeString(operation.rowId, 180).trim();
    const row = context.index.rowsByDatabaseRef.get(databaseRef)?.get(rowId) || null;
    if (!schema || !row) return { error: "Update operation references an unknown database row." };
    const normalized = normalizeValues(schema, operation.values, context.index, row);
    if (!Object.keys(normalized.values).length) {
      return { error: normalized.rejected[0] || "Update operation has no valid values." };
    }
    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "update-database-row",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Database",
        rowId,
        rowTitle: row.title || "Untitled record",
        values: normalized.values,
        changes: normalized.changes,
        warnings: normalized.rejected
      }
    };
  }

  function normalizeBulkUpdateOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) return { error: "Database was not selected by the context router." };
    const schema = context.index.schemaByRef.get(databaseRef);
    if (!schema) return { error: "Database does not exist." };

    const rowUpdates = [];
    const warnings = [];
    const compactColumns = asArray(operation.columns)
      .map((column) => safeString(column, 160).trim())
      .filter(Boolean)
      .slice(0, 20);
    asArray(operation.rowUpdates || operation.rows).slice(0, 100).forEach((rawUpdate, updateIndex) => {
      const compactUpdate = Array.isArray(rawUpdate);
      const rowId = safeString(
        compactUpdate ? rawUpdate[0] : (rawUpdate?.rowId || rawUpdate?.id),
        180
      ).trim();
      const row = context.index.rowsByDatabaseRef.get(databaseRef)?.get(rowId) || null;
      if (!row) {
        warnings.push(`Update ${updateIndex + 1} references an unknown database row.`);
        return;
      }
      const rawValues = compactUpdate
        ? Object.fromEntries(compactColumns.map((column, columnIndex) => (
            [column, rawUpdate[columnIndex + 1]]
          )))
        : rawUpdate?.values;
      const normalized = normalizeValues(schema, rawValues, context.index, row);
      if (!Object.keys(normalized.values).length) {
        warnings.push(normalized.rejected[0] || `Update ${updateIndex + 1} has no valid values.`);
        return;
      }
      rowUpdates.push({
        rowId,
        rowTitle: row.title || "Untitled record",
        values: normalized.values,
        changes: normalized.changes
      });
      warnings.push(...normalized.rejected);
    });

    if (!rowUpdates.length) {
      return { error: warnings[0] || "Bulk update has no valid database rows." };
    }
    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "update-database-rows",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Database",
        rowUpdates,
        changes: [],
        warnings
      }
    };
  }

  function normalizeRelationOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) return { error: "Database was not selected by the context router." };
    const schema = context.index.schemaByRef.get(databaseRef);
    const property = getProperty(schema, operation.propertyId);
    if (!schema || !property || property.type !== "relation") {
      return { error: "Relation operation requires an existing relation property." };
    }

    const rowId = safeString(operation.rowId || operation.sourceRowId, 180).trim();
    const sourceRow = context.index.rowsByDatabaseRef.get(databaseRef)?.get(rowId) || null;
    const createdOperation = rowId.startsWith("@")
      ? context.createdOperations.get(rowId.slice(1))
      : null;
    if (!sourceRow && (!createdOperation || createdOperation.databaseRef !== databaseRef)) {
      return { error: "Relation operation references an unknown source row." };
    }

    const expectedTargetRef = getRelationTargetRef(property);
    const requestedTargetRef = safeString(operation.targetDatabaseRef, 240).trim()
      || databaseRefFromSource(operation.targetSource || {})
      || expectedTargetRef;
    if (!expectedTargetRef || requestedTargetRef !== expectedTargetRef) {
      return { error: "Relation target does not match the property schema." };
    }
    const targetSchema = context.index.schemaByRef.get(expectedTargetRef);
    const targetRows = context.index.rowsByDatabaseRef.get(expectedTargetRef) || new Map();
    const targetRowIds = normalizeRowIds(operation.targetRowIds || operation.value);
    if (!targetSchema || !targetRowIds.length || targetRowIds.some((targetRowId) => !targetRows.has(targetRowId))) {
      return { error: "Relation operation references an unknown target row." };
    }

    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "relate-database-rows",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Database",
        rowId,
        rowTitle: sourceRow?.title || createdOperation?.rowTitle || "New record",
        propertyId: property.id,
        propertyName: property.name,
        targetDatabaseRef: expectedTargetRef,
        targetSource: normalizeSource(targetSchema.source),
        targetDatabaseTitle: targetSchema.title || "Database",
        targetRowIds,
        targetRows: targetRowIds.map((targetRowId) => ({
          rowId: targetRowId,
          title: targetRows.get(targetRowId)?.title || "Untitled record"
        }))
      }
    };
  }

  function normalizeAppendOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) return { error: "Database was not selected by the context router." };
    const schema = context.index.schemaByRef.get(databaseRef);
    const rowId = safeString(operation.rowId, 180).trim();
    const row = context.index.rowsByDatabaseRef.get(databaseRef)?.get(rowId) || null;
    const property = getProperty(schema, operation.propertyId);
    if (!schema || !row || !property || !["text", "notes"].includes(property.type)) {
      return { error: "Append operation requires an existing text or notes field." };
    }
    const content = safeString(operation.content ?? operation.value, 4000).trim();
    if (!content) return { error: "Append operation has no content." };
    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "append-database-field",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Database",
        rowId,
        rowTitle: row.title || "Untitled record",
        propertyId: property.id,
        propertyName: property.name,
        content,
        oldValue: asArray(row.properties).find((entry) => entry.id === property.id)?.value || ""
      }
    };
  }

  function normalizeChecklistStateOperation(operation, context) {
    const databaseRef = resolveDatabaseRef(operation);
    if (!context.allowedRefs.has(databaseRef)) {
      return { error: "Database was not selected by the context router." };
    }
    const schema = context.index.schemaByRef.get(databaseRef);
    if (!schema || schema.view !== "checklist") {
      return { error: "Checklist state can only be changed in a checklist database." };
    }
    const rowId = safeString(operation.rowId, 180).trim();
    const row = context.index.rowsByDatabaseRef.get(databaseRef)?.get(rowId) || null;
    if (!row) return { error: "Checklist operation references an unknown database row." };

    const rawChecked = operation.checked ?? operation.completed;
    let checked = null;
    if (typeof rawChecked === "boolean") checked = rawChecked;
    if (rawChecked === "true" || rawChecked === "1") checked = true;
    if (rawChecked === "false" || rawChecked === "0") checked = false;
    if (checked === null) return { error: "Checklist operation requires checked to be true or false." };

    const oldChecked = row.checklistState === "checked";
    if (oldChecked === checked) {
      return { error: `${row.title || "This task"} is already ${checked ? "complete" : "incomplete"}.` };
    }
    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "set-database-checklist-state",
        databaseRef,
        source: normalizeSource(schema.source),
        databaseTitle: schema.title || "Checklist",
        rowId,
        rowTitle: row.title || "Untitled task",
        checked,
        changes: [{
          propertyId: "__checklist_checked",
          propertyName: "Completed",
          propertyType: "checkbox",
          oldValue: oldChecked,
          newValue: checked
        }]
      }
    };
  }

  function normalizeCreatePageOperation(operation, context) {
    const parentRef = safeString(operation.parentRef || operation.targetRef, 240).trim();
    const parentOperationId = parentRef.startsWith("@") ? parentRef.slice(1) : "";
    const createdParent = parentOperationId
      ? context.createdOperations.get(parentOperationId)
      : null;
    if (!parentRef || (!createdParent && !context.allowedContentRefs.has(parentRef))) {
      return { error: "Page creation parent was not retrieved for this request." };
    }
    if (parentOperationId && createdParent?.type !== "create-page") {
      return { error: "A new page can only be nested under an earlier create-page operation." };
    }
    const parent = createdParent
      ? {
          id: createdParent.pageId,
          pageId: createdParent.pageId,
          title: createdParent.pageTitle,
          kind: "page"
        }
      : context.index.recordByRef.get(parentRef);
    if (!parent || !["page", "scope"].includes(parent.kind)) {
      return { error: "Page creation requires an existing page or area as its parent." };
    }
    const parentId = safeString(parent.pageId || parent.source?.pageId || parent.id, 180).trim();
    const pageTitle = safeString(operation.pageTitle || operation.title, 180).trim();
    if (!parentId || !pageTitle) return { error: "Page creation requires a parent and title." };

    const layout = safeString(operation.layout || "board-canvas", 80).trim();
    if (!PAGE_LAYOUTS.has(layout)) {
      return { error: "This adapter creates board, infinite-board, document, or journal pages only." };
    }
    let category = safeString(operation.category || "none", 80).trim();
    if (!PAGE_CATEGORIES.has(category)) return { error: "Page creation uses an unsupported category." };
    let containerType = safeString(operation.containerType || "page", 80).trim();
    if (!PAGE_CONTAINER_TYPES.has(containerType)) {
      return { error: "Page creation uses an unsupported page type." };
    }
    if (layout === "journal") {
      category = "none";
      containerType = "page";
    }

    const duplicate = [...context.index.recordByRef.values()].some((record) => (
      record.parentRef === parentRef
      && safeString(record.title, 180).trim().toLowerCase() === pageTitle.toLowerCase()
    )) || [...context.createdOperations.values()].some((created) => (
      created?.type === "create-page"
      && created.parentRef === parentRef
      && safeString(created.pageTitle, 180).trim().toLowerCase() === pageTitle.toLowerCase()
    ));
    if (duplicate) return { error: "A page with that title already exists under the selected parent." };

    const suppliedPageId = safeString(operation.pageId, 180).trim();
    const operationSlug = safeString(context.id, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page";
    const pageId = /^page-assistant-[a-z0-9_-]+$/i.test(suppliedPageId)
      ? suppliedPageId
      : `page-assistant-${Date.now()}-${operationSlug}`;
    if (context.index.recordByRef.has(`page:${pageId}`)) {
      return { error: "The proposed page identity already exists." };
    }

    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "create-page",
        targetRef: parentRef,
        parentRef,
        parentId,
        parentTitle: parent.title || "Untitled parent",
        parentOperationId,
        pageId,
        pageTitle,
        layout,
        category,
        containerType,
        changes: [{
          propertyId: "pageTitle",
          propertyName: "Page title",
          propertyType: "title",
          oldValue: null,
          newValue: pageTitle
        }, {
          propertyId: "layout",
          propertyName: "Page type",
          propertyType: "page-layout",
          oldValue: null,
          newValue: layout
        }]
      }
    };
  }

  function makeStructureSlug(value = "", fallback = "item") {
    return safeString(value, 120)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback;
  }

  function normalizeStructurePropertyId(rawId = "", name = "", type = "text", operationSlug = "", usedIds = new Set()) {
    if (type === "title") return "name";
    const supplied = safeString(rawId, 120).trim();
    const base = /^[a-z][a-z0-9_-]*$/i.test(supplied)
      ? supplied
      : `prop-assistant-${operationSlug}-${makeStructureSlug(name, "field")}`;
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate) || candidate === "name") {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function resolveStructureRelationTarget(rawProperty = {}, context = {}) {
    const rawTarget = asObject(rawProperty.relationTarget);
    const targetRef = safeString(
      rawProperty.relationTargetRef
      || rawProperty.targetDatabaseRef
      || rawTarget.databaseRef
      || (typeof rawProperty.relationTarget === "string" ? rawProperty.relationTarget : ""),
      240
    ).trim();
    const createdOperationId = targetRef.startsWith("@") ? targetRef.slice(1) : "";
    const createdTarget = createdOperationId
      ? context.createdOperations?.get(createdOperationId)
      : null;
    if (createdOperationId) {
      if (createdTarget?.type !== "create-inline-database" || !createdTarget.databasePageId) return null;
      return {
        source: { kind: "page", pageId: createdTarget.databasePageId, blockId: "" },
        databaseRef: createdTarget.databaseRef,
        rowIds: new Set(asArray(createdTarget.rowIds)),
      };
    }

    const directRef = targetRef || databaseRefFromSource(rawTarget);
    if (!directRef || !context.allowedRefs?.has(directRef)) return null;
    const schema = context.index?.schemaByRef?.get(directRef);
    if (!schema) return null;
    const source = normalizeSource(schema.source);
    return {
      source,
      databaseRef: directRef,
      rowIds: new Set(context.index?.rowsByDatabaseRef?.get(directRef)?.keys?.() || []),
    };
  }

  function normalizeStructureProperties(operation = {}, operationSlug = "", context = {}) {
    const rawProperties = asArray(operation.databaseProperties || operation.properties).slice(0, 20);
    const source = rawProperties.length
      ? rawProperties
      : [{ id: "name", name: "Name", type: "title" }];
    const usedIds = new Set();
    const aliases = new Map();
    let hasTitle = false;
    const properties = [];
    const relationRowIds = new Map();
    const errors = [];

    source.forEach((rawProperty, index) => {
      const requestedType = safeString(rawProperty?.type || (index === 0 ? "title" : "text"), 80).trim().toLowerCase();
      const type = DATABASE_PROPERTY_TYPES.has(requestedType) ? requestedType : (index === 0 ? "title" : "text");
      if (type === "title" && hasTitle) return;
      const finalType = type === "title" || (!hasTitle && index === 0) ? "title" : type;
      const name = safeString(rawProperty?.name || (finalType === "title" ? "Name" : `Property ${index + 1}`), 180).trim()
        || (finalType === "title" ? "Name" : `Property ${index + 1}`);
      const id = normalizeStructurePropertyId(rawProperty?.id, name, finalType, operationSlug, usedIds);
      usedIds.add(id);
      if (finalType === "title") hasTitle = true;
      const property = {
        id,
        name,
        type: finalType,
        icon: safeString(rawProperty?.icon, 40),
        showIcon: rawProperty?.showIcon !== false,
        hidden: rawProperty?.hidden === true,
      };
      if (finalType === "select") property.selectOptions = sanitizeValue(rawProperty?.selectOptions || []);
      if (finalType === "tag") property.tagOptions = sanitizeValue(rawProperty?.tagOptions || []);
      if (finalType === "status") property.statusGroups = sanitizeValue(rawProperty?.statusGroups || []);
      if (finalType === "relation") {
        const relationTarget = resolveStructureRelationTarget(rawProperty, context);
        if (!relationTarget) {
          errors.push(`Relation property "${name}" must target a routed database or an earlier database operation.`);
          return;
        }
        property.relationTarget = relationTarget.source;
        relationRowIds.set(id, relationTarget.rowIds);
      }
      properties.push(property);
      [
        rawProperty?.id,
        rawProperty?.name,
        id,
        name,
      ].forEach((alias) => {
        const key = safeString(alias, 180).trim().toLowerCase();
        if (key) aliases.set(key, id);
      });
    });

    if (!hasTitle) {
      properties.unshift({ id: "name", name: "Name", type: "title", icon: "", showIcon: true, hidden: false });
      aliases.set("name", "name");
    }
    return { properties, aliases, relationRowIds, errors };
  }

  function normalizeStructureCellValue(property = {}, value) {
    const clean = sanitizeValue(value);
    if (property.type === "checkbox") {
      return clean === true || clean === 1 || clean === "1" || clean === "true" || clean === "on";
    }
    if (property.type === "number") {
      const parsed = Number(typeof clean === "string" ? clean.replace(/,/g, "") : clean);
      return Number.isFinite(parsed) ? parsed : "";
    }
    if (property.type === "tag") {
      if (Array.isArray(clean)) return clean.map((item) => safeString(item, 180).trim()).filter(Boolean).slice(0, 20);
      return safeString(clean, 1000).trim();
    }
    if (property.type === "relation") return normalizeRowIds(clean);
    return clean;
  }

  function normalizeStructureRows(
    operation = {},
    properties = [],
    aliases = new Map(),
    operationSlug = "",
    relationRowIds = new Map()
  ) {
    const rawRows = asArray(operation.databaseRows || operation.rows).slice(0, 50);
    const titleProperty = properties.find((property) => property.type === "title") || properties[0];
    const nowIso = new Date().toISOString();
    const rows = [];
    const warnings = [];

    rawRows.forEach((rawRow, rowIndex) => {
      const rawValues = asObject(rawRow?.values && typeof rawRow.values === "object" ? rawRow.values : rawRow);
      const values = {};
      Object.entries(rawValues).forEach(([rawKey, rawValue]) => {
        if (["id", "pageId", "createdAt", "updatedAt", "title"].includes(rawKey)) return;
        const propertyId = aliases.get(safeString(rawKey, 180).trim().toLowerCase()) || "";
        const property = properties.find((entry) => entry.id === propertyId);
        if (!property) return;
        values[property.id] = normalizeStructureCellValue(property, rawValue);
      });
      if (!Object.prototype.hasOwnProperty.call(values, titleProperty.id)) {
        values[titleProperty.id] = normalizeStructureCellValue(
          titleProperty,
          rawRow?.title ?? rawRow?.name ?? rawValues[titleProperty.id]
        );
      }
      const title = safeString(values[titleProperty.id], 180).trim();
      if (!title) {
        warnings.push(`Row ${rowIndex + 1} has no title and was withheld.`);
        return;
      }
      properties.forEach((property) => {
        if (!Object.prototype.hasOwnProperty.call(values, property.id)) {
          values[property.id] = property.type === "checkbox"
            ? false
            : property.type === "relation"
              ? []
              : "";
        }
        if (property.type === "relation") {
          const allowedRowIds = relationRowIds.get(property.id) || new Set();
          const requestedRowIds = normalizeRowIds(values[property.id]);
          const validRowIds = requestedRowIds.filter((rowId) => allowedRowIds.has(rowId));
          if (validRowIds.length !== requestedRowIds.length) {
            warnings.push(`Row ${rowIndex + 1} included an unknown link target; the unknown link was withheld.`);
          }
          values[property.id] = validRowIds;
        }
      });

      const suppliedRowId = safeString(rawRow?.id, 180).trim();
      const suppliedPageId = safeString(rawRow?.pageId, 180).trim();
      const rowToken = `${operationSlug}-${rowIndex + 1}-${makeStructureSlug(title, "row")}`;
      rows.push({
        id: /^row-assistant-[a-z0-9_-]+$/i.test(suppliedRowId)
          ? suppliedRowId
          : `row-assistant-${rowToken}`,
        pageId: /^page-assistant-row-[a-z0-9_-]+$/i.test(suppliedPageId)
          ? suppliedPageId
          : `page-assistant-row-${rowToken}`,
        createdAt: safeString(rawRow?.createdAt, 80).trim() || nowIso,
        updatedAt: safeString(rawRow?.updatedAt, 80).trim() || nowIso,
        archived: false,
        checklistChecked: false,
        icon: safeString(rawRow?.icon, 400),
        color: "",
        cellColors: {},
        values,
      });
    });
    return { rows, warnings };
  }

  function normalizeStructurePropertyRef(value, aliases = new Map()) {
    const safe = safeString(value, 180).trim();
    if (safe === "__last_opened") return safe;
    return aliases.get(safe.toLowerCase()) || "";
  }

  function normalizeOptionalStructureNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && !value.trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeStructureViews(operation = {}, aliases = new Map(), operationSlug = "", databaseTitle = "") {
    const rawViews = asArray(operation.views).length
      ? asArray(operation.views).slice(0, 6)
      : [{ title: databaseTitle, view: "table" }];
    return rawViews.map((rawView, viewIndex) => {
      const suppliedBlockId = safeString(rawView?.blockId, 180).trim();
      const viewToken = `${operationSlug}-${viewIndex + 1}-${makeStructureSlug(rawView?.title || rawView?.view, "view")}`;
      const viewType = safeString(rawView?.view || "table", 80).trim().toLowerCase();
      const filters = asArray(rawView?.filters).slice(0, 8).map((filter) => ({
        propertyId: normalizeStructurePropertyRef(filter?.propertyId || filter?.propertyName, aliases),
        mode: ["equals", "contains", "empty"].includes(filter?.mode) ? filter.mode : "equals",
        value: safeString(filter?.value, 1000),
      })).filter((filter) => filter.propertyId && filter.propertyId !== "__last_opened");
      const sorts = asArray(rawView?.sorts).slice(0, 4).map((sort) => ({
        propertyId: normalizeStructurePropertyRef(sort?.propertyId || sort?.propertyName, aliases),
        direction: sort?.direction === "asc" ? "asc" : "desc",
      })).filter((sort) => sort.propertyId);
      const groupBy = normalizeStructurePropertyRef(rawView?.groupBy, aliases);
      return {
        blockId: /^block-assistant-database-[a-z0-9_-]+$/i.test(suppliedBlockId)
          ? suppliedBlockId
          : `block-assistant-database-${viewToken}`,
        title: safeString(rawView?.title, 180).trim() || (viewIndex === 0 ? databaseTitle : `${databaseTitle} view ${viewIndex + 1}`),
        view: DATABASE_VIEW_TYPES.has(viewType) ? viewType : "table",
        filters,
        sorts,
        groupBy: groupBy === "__last_opened" ? "" : groupBy,
        x: normalizeOptionalStructureNumber(rawView?.x),
        y: normalizeOptionalStructureNumber(rawView?.y),
        w: normalizeOptionalStructureNumber(rawView?.w),
        h: normalizeOptionalStructureNumber(rawView?.h),
      };
    });
  }

  function normalizeCreateInlineDatabaseOperation(operation, context) {
    const targetRef = safeString(operation.targetRef || operation.parentRef, 240).trim();
    const createdPageOperationId = targetRef.startsWith("@") ? targetRef.slice(1) : "";
    const createdPage = createdPageOperationId
      ? context.createdOperations.get(createdPageOperationId)
      : null;
    if (!targetRef || (!createdPage && !context.allowedContentRefs.has(targetRef))) {
      return { error: "Inline database target was not retrieved for this request." };
    }
    if (createdPageOperationId && createdPage?.type !== "create-page") {
      return { error: "An inline database can only target an earlier create-page operation." };
    }
    if (createdPage && !["board-canvas", "infinite-canvas"].includes(createdPage.layout)) {
      return { error: "Inline databases can only target a board or infinite-board page." };
    }
    const target = createdPage
      ? {
          pageId: createdPage.pageId,
          title: createdPage.pageTitle,
          kind: "page",
        }
      : context.index.recordByRef.get(targetRef);
    if (!target || !["page", "scope"].includes(target.kind)) {
      return { error: "Inline database creation requires an existing page or area." };
    }
    const pageId = safeString(target.pageId || target.source?.pageId || target.id, 180).trim();
    const databaseTitle = safeString(operation.databaseTitle || operation.title, 180).trim();
    if (!pageId || !databaseTitle) return { error: "Inline database creation requires a target page and title." };

    const operationSlug = makeStructureSlug(context.id, "database");
    const suppliedDatabasePageId = safeString(operation.databasePageId, 180).trim();
    const databasePageToken = makeStructureSlug(
      `${context.id}-${operation.id || databaseTitle}`,
      "database"
    );
    const databasePageId = /^page-assistant-database-[a-z0-9_-]+$/i.test(suppliedDatabasePageId)
      ? suppliedDatabasePageId
      : `page-assistant-database-${databasePageToken}`;
    const normalizedProperties = normalizeStructureProperties(operation, operationSlug, context);
    if (normalizedProperties.errors.length) return { error: normalizedProperties.errors[0] };
    const normalizedRows = normalizeStructureRows(
      operation,
      normalizedProperties.properties,
      normalizedProperties.aliases,
      operationSlug,
      normalizedProperties.relationRowIds
    );
    const views = normalizeStructureViews(
      operation,
      normalizedProperties.aliases,
      operationSlug,
      databaseTitle
    );
    if (!views.length) return { error: "Inline database creation requires at least one view." };

    return {
      value: {
        ...normalizeCommon(operation, context),
        type: "create-inline-database",
        targetRef,
        pageId,
        targetTitle: target.title || "Untitled page",
        createdPageOperationId,
        databaseTitle,
        databasePageId,
        databaseProperties: normalizedProperties.properties,
        databaseRows: normalizedRows.rows,
        views,
        warnings: normalizedRows.warnings,
        changes: [],
      },
    };
  }

  function contentRecordFingerprint(record = {}) {
    return stableFingerprint({
      ref: safeString(record.ref, 240),
      kind: safeString(record.kind, 80),
      text: safeString(record.text, 20000),
      source: asObject(record.source)
    });
  }

  function normalizeContentOperation(operation, context) {
    const targetRef = safeString(operation.targetRef || operation.recordRef, 240).trim();
    const createdPageOperationId = targetRef.startsWith("@") ? targetRef.slice(1) : "";
    const createdPage = createdPageOperationId
      ? context.createdOperations.get(createdPageOperationId)
      : null;
    if (!targetRef || (!createdPage && !context.allowedContentRefs.has(targetRef))) {
      return { error: "Content target was not retrieved for this request." };
    }
    if (createdPageOperationId && createdPage?.type !== "create-page") {
      return { error: "Content can only target a page created by an earlier create-page operation." };
    }
    if (createdPage && REPLACE_CONTENT_OPERATION_TYPES.has(operation.type)) {
      return { error: "A newly created blank page has no existing passage to replace." };
    }
    if (
      createdPage
      && operation.type === "add-page-text-block"
      && !["board-canvas", "infinite-canvas"].includes(createdPage.layout)
    ) {
      return { error: "Starter text blocks can only target a newly created board page." };
    }
    if (
      createdPage
      && operation.type === "append-document-section"
      && createdPage.layout !== "document"
    ) {
      return { error: "Document starter text can only target a newly created document page." };
    }
    if (
      createdPage
      && !["add-page-text-block", "append-document-section"].includes(operation.type)
    ) {
      return { error: "This content operation cannot target a newly created page." };
    }
    const createdSectionId = createdPage && operation.type === "append-document-section"
      ? `assistant-section-${safeString(context.id, 100).replace(/[^a-z0-9_-]+/gi, "-")}`
      : "";
    const record = createdPage
      ? {
          id: createdPage.pageId,
          ref: targetRef,
          kind: operation.type === "append-document-section" ? "document-section" : "page",
          title: operation.type === "append-document-section"
            ? `${createdPage.pageTitle} · Section 1`
            : createdPage.pageTitle,
          pageId: createdPage.pageId,
          text: "",
          source: {
            kind: operation.type === "append-document-section" ? "document-section" : "page",
            pageId: createdPage.pageId,
            sectionId: createdSectionId
          }
        }
      : context.index.recordByRef.get(targetRef);
    if (!record) return { error: "Content target no longer exists." };

    const expectedKind = ["append-note-content", "replace-note-text"].includes(operation.type)
      ? "note"
      : ["append-document-section", "replace-document-section-text"].includes(operation.type)
        ? "document-section"
        : operation.type === "replace-canvas-block-text"
          ? "canvas-block"
          : "page";
    if (record.kind !== expectedKind) {
      return { error: `${operation.type} requires an existing ${expectedKind} target.` };
    }

    const source = asObject(record.source);
    if (expectedKind === "note" && !safeString(source.noteId, 180).trim()) {
      return { error: "Note target has no valid source ID." };
    }
    if (expectedKind === "document-section"
      && (!safeString(source.pageId, 180).trim() || !safeString(source.sectionId, 180).trim())) {
      return { error: "Document target has no valid page and section IDs." };
    }
    if (expectedKind === "page" && !safeString(source.pageId, 180).trim()) {
      return { error: "Page target has no valid page ID." };
    }
    if (expectedKind === "canvas-block"
      && (!safeString(source.pageId, 180).trim() || !safeString(source.blockId || record.id, 180).trim())) {
      return { error: "Canvas block target has no valid page and block IDs." };
    }

    const replacing = REPLACE_CONTENT_OPERATION_TYPES.has(operation.type);
    const content = replacing ? "" : safeString(operation.content ?? operation.value, 4000).trim();
    const matchText = replacing ? safeString(operation.matchText ?? operation.oldText, 4000).trim() : "";
    const replacementText = replacing
      ? safeString(operation.replacementText ?? operation.newText ?? operation.value, 4000).trim()
      : "";
    if (!replacing && !content) return { error: "Content operation has no text." };
    if (replacing && (!matchText || !replacementText)) {
      return { error: "Targeted replacement requires both the exact existing text and replacement text." };
    }
    if (replacing && matchText === replacementText) {
      return { error: "Targeted replacement does not change the text." };
    }
    if (replacing) {
      const sourceText = safeString(record.text, 30000);
      let occurrenceCount = 0;
      let fromIndex = 0;
      while (matchText && fromIndex <= sourceText.length) {
        const foundAt = sourceText.indexOf(matchText, fromIndex);
        if (foundAt === -1) break;
        occurrenceCount += 1;
        fromIndex = foundAt + matchText.length;
      }
      if (occurrenceCount === 0) {
        return { error: "The exact existing text was not found in the target." };
      }
      if (occurrenceCount > 1) {
        return { error: "The exact existing text appears more than once. Choose a more specific passage." };
      }
    }
    const currentFingerprint = createdPage ? "" : contentRecordFingerprint(record);
    const expectedFingerprint = safeString(operation.expectedSourceFingerprint, 240).trim();
    if (expectedFingerprint && expectedFingerprint !== currentFingerprint) {
      return { error: "Content target changed after this proposal was created." };
    }

    return {
      value: {
        ...normalizeCommon(operation, context),
        type: operation.type,
        targetRef,
        targetKind: record.kind,
        targetTitle: record.title || "Untitled",
        createdPageOperationId,
        targetPageLayout: createdPage?.layout || "",
        pageId: safeString(record.pageId || source.pageId, 180).trim(),
        source: {
          kind: record.kind,
          noteId: safeString(source.noteId, 180).trim(),
          pageId: safeString(source.pageId || record.pageId, 180).trim(),
          sectionId: safeString(source.sectionId, 180).trim(),
          blockId: safeString(source.blockId || (record.kind === "canvas-block" ? record.id : ""), 180).trim()
        },
        content,
        matchText,
        replacementText,
        changes: replacing ? [{
          propertyId: "replacementText",
          propertyName: "Replacement",
          propertyType: "text",
          oldValue: matchText,
          newValue: replacementText
        }] : [],
        expectedSourceFingerprint: currentFingerprint
      }
    };
  }

  function normalizeProposal(rawProposal = {}, catalog = {}, routePlan = {}, options = {}) {
    if (!rawProposal || typeof rawProposal !== "object") return null;
    const index = makeCatalogIndex(catalog);
    const allowedRefs = getAllowedDatabaseRefs(routePlan, options);
    const allowedContentRefs = getAllowedContentRefs(options);
    const operations = [];
    const rejectedOperations = [];
    const createdOperations = new Map();
    const seenIds = new Set();
    const acceptedIds = new Set();

    asArray(rawProposal.operations).slice(0, 20).forEach((rawOperation, operationIndex) => {
      const type = safeString(rawOperation?.type, 80).trim();
      let id = safeString(rawOperation?.id, 120).trim() || `operation-${operationIndex + 1}`;
      while (seenIds.has(id)) id = `${id}-${operationIndex + 1}`;
      seenIds.add(id);
      if (options.entityResolutionStatus === "ambiguous") {
        rejectedOperations.push({
          index: operationIndex,
          reason: "The named entity is ambiguous. Ask the user to choose a destination before proposing changes."
        });
        return;
      }
      if (!OPERATION_TYPES.has(type)) {
        rejectedOperations.push({ index: operationIndex, reason: "Unsupported operation type." });
        return;
      }
      const context = { id, index, allowedRefs, allowedContentRefs, createdOperations };
      const result = type === "create-database-row"
        ? normalizeCreateOperation(rawOperation, context)
        : type === "create-page"
          ? normalizeCreatePageOperation(rawOperation, context)
        : type === "create-inline-database"
          ? normalizeCreateInlineDatabaseOperation(rawOperation, context)
        : type === "set-database-checklist-state"
          ? normalizeChecklistStateOperation(rawOperation, context)
        : type === "update-database-row"
          ? normalizeUpdateOperation(rawOperation, context)
        : type === "update-database-rows"
          ? normalizeBulkUpdateOperation(rawOperation, context)
          : type === "relate-database-rows"
            ? normalizeRelationOperation(rawOperation, context)
            : type === "append-database-field"
              ? normalizeAppendOperation(rawOperation, context)
              : normalizeContentOperation(rawOperation, context);
      if (!result?.value) {
        rejectedOperations.push({ index: operationIndex, reason: result?.error || "Invalid operation." });
        return;
      }
      operations.push(result.value);
      acceptedIds.add(result.value.id);
      if (result.value.type === "create-database-row") {
        const titleChange = result.value.changes.find((change) => change.propertyType === "title");
        createdOperations.set(result.value.id, {
          databaseRef: result.value.databaseRef,
          rowTitle: safeString(titleChange?.newValue || "New record", 240)
        });
      } else if (result.value.type === "create-page") {
        createdOperations.set(result.value.id, {
          type: "create-page",
          pageId: result.value.pageId,
          pageTitle: result.value.pageTitle,
          layout: result.value.layout,
          parentRef: result.value.parentRef
        });
      } else if (result.value.type === "create-inline-database") {
        createdOperations.set(result.value.id, {
          type: "create-inline-database",
          databasePageId: result.value.databasePageId,
          databaseRef: `database:page:${result.value.databasePageId}:`,
          rowIds: asArray(result.value.databaseRows).map((row) => row.id).filter(Boolean),
        });
      }
    });

    const questions = asArray(rawProposal.questions)
      .map((question, questionIndex) => ({
        id: safeString(question?.id, 120).trim() || `question-${questionIndex + 1}`,
        question: safeString(question?.question || question, 600).trim(),
        operationIds: asArray(question?.operationIds)
          .map((item) => safeString(item, 120).trim())
          .filter((item) => acceptedIds.has(item))
      }))
      .filter((question) => question.question)
      .slice(0, 8);

    if (!operations.length && !questions.length && !rejectedOperations.length) return null;
    const selectedOperationIds = operations
      .filter((operation) => operation.basis === "explicit")
      .map((operation) => operation.id);
    const initialErrors = !operations.length && rejectedOperations.length
      ? rejectedOperations.map((rejection) => `Suggested change was withheld: ${rejection.reason}`)
      : [];
    return {
      version: VERSION,
      id: safeString(rawProposal.id, 120).trim() || `proposal-${Date.now()}`,
      status: "proposed",
      summary: safeString(rawProposal.summary, 600).trim() || "Suggested database changes",
      operations,
      questions,
      rejectedOperations,
      allowedDatabaseRefs: [...allowedRefs],
      allowedContentRefs: [...allowedContentRefs],
      review: {
        status: initialErrors.length ? "invalid" : "reviewing",
        selectedOperationIds,
        answers: {},
        errors: initialErrors
      },
      preparedTransaction: null,
      executable: false
    };
  }

  function cloneProposal(proposal = {}) {
    return {
      ...proposal,
      operations: asArray(proposal.operations).map((operation) => ({
        ...operation,
        values: operation.values ? { ...operation.values } : operation.values,
        changes: asArray(operation.changes).map((change) => ({ ...change })),
        databaseProperties: asArray(operation.databaseProperties).map((property) => cloneValue(property)),
        databaseRows: asArray(operation.databaseRows).map((row) => cloneValue(row)),
        rowUpdates: asArray(operation.rowUpdates).map((row) => cloneValue(row)),
        views: asArray(operation.views).map((view) => cloneValue(view)),
        targetRowIds: operation.targetRowIds ? [...operation.targetRowIds] : operation.targetRowIds,
        targetRows: asArray(operation.targetRows).map((row) => ({ ...row })),
        assumptions: asArray(operation.assumptions).slice(),
        evidenceRefs: asArray(operation.evidenceRefs).slice()
      })),
      questions: asArray(proposal.questions).map((question) => ({
        ...question,
        operationIds: asArray(question.operationIds).slice()
      })),
      rejectedOperations: asArray(proposal.rejectedOperations).map((rejection) => ({ ...rejection })),
      allowedDatabaseRefs: asArray(proposal.allowedDatabaseRefs).slice(),
      allowedContentRefs: asArray(proposal.allowedContentRefs).slice(),
      review: {
        status: safeString(proposal.review?.status, 40).trim() || "reviewing",
        selectedOperationIds: asArray(proposal.review?.selectedOperationIds).slice(),
        answers: { ...asObject(proposal.review?.answers) },
        errors: asArray(proposal.review?.errors).slice()
      },
      preparedTransaction: proposal.preparedTransaction || null,
      executable: false
    };
  }

  function invalidatePreparedReview(proposal = {}) {
    const next = cloneProposal(proposal);
    next.status = "proposed";
    next.review.status = "reviewing";
    next.review.errors = [];
    next.preparedTransaction = null;
    next.executable = false;
    return next;
  }

  function setOperationSelected(proposal, operationId, selected) {
    const next = invalidatePreparedReview(proposal);
    const validIds = new Set(next.operations.map((operation) => operation.id));
    const requestedId = safeString(operationId, 120).trim();
    const selectedIds = new Set(next.review.selectedOperationIds.filter((id) => validIds.has(id)));
    if (validIds.has(requestedId)) {
      if (selected) selectedIds.add(requestedId);
      else selectedIds.delete(requestedId);
    }
    next.review.selectedOperationIds = next.operations
      .map((operation) => operation.id)
      .filter((id) => selectedIds.has(id));
    return next;
  }

  function setQuestionAnswer(proposal, questionId, answer) {
    const next = invalidatePreparedReview(proposal);
    const validIds = new Set(next.questions.map((question) => question.id));
    const requestedId = safeString(questionId, 120).trim();
    if (validIds.has(requestedId)) {
      next.review.answers[requestedId] = safeString(answer, 2000);
    }
    return next;
  }

  function editOperationValue(proposal, operationId, propertyId, value) {
    const next = invalidatePreparedReview(proposal);
    const operation = next.operations.find((entry) => entry.id === safeString(operationId, 120).trim());
    if (!operation) return next;
    const safePropertyId = safeString(propertyId, 160).trim();
    if (operation.type === "create-database-row" || operation.type === "update-database-row") {
      if (!Object.prototype.hasOwnProperty.call(asObject(operation.values), safePropertyId)) return next;
      operation.values[safePropertyId] = sanitizeValue(value);
      const change = operation.changes.find((entry) => entry.propertyId === safePropertyId);
      if (change) change.newValue = sanitizeValue(value);
    } else if (operation.type === "append-database-field" && safePropertyId === operation.propertyId) {
      operation.content = safeString(value, 4000);
    } else if (operation.type === "create-page" && safePropertyId === "pageTitle") {
      operation.pageTitle = safeString(value, 180);
      const change = operation.changes.find((entry) => entry.propertyId === "pageTitle");
      if (change) change.newValue = safeString(value, 180);
    } else if (operation.type === "create-page" && safePropertyId === "layout") {
      const layout = safeString(value, 80).trim();
      if (!PAGE_LAYOUTS.has(layout)) return next;
      operation.layout = layout;
      if (layout === "journal") {
        operation.category = "none";
        operation.containerType = "page";
      }
      const change = operation.changes.find((entry) => entry.propertyId === "layout");
      if (change) change.newValue = layout;
    } else if (operation.type === "set-database-checklist-state" && safePropertyId === "__checklist_checked") {
      operation.checked = value === true || value === "true" || value === "1";
      const change = operation.changes.find((entry) => entry.propertyId === "__checklist_checked");
      if (change) change.newValue = operation.checked;
    } else if (CONTENT_OPERATION_TYPES.has(operation.type) && safePropertyId === "content") {
      operation.content = safeString(value, 4000);
    } else if (REPLACE_CONTENT_OPERATION_TYPES.has(operation.type) && safePropertyId === "replacementText") {
      operation.replacementText = safeString(value, 4000);
      const change = operation.changes.find((entry) => entry.propertyId === "replacementText");
      if (change) change.newValue = safeString(value, 4000);
    }
    return next;
  }

  function setRelationTargets(proposal, operationId, rowIds) {
    const next = invalidatePreparedReview(proposal);
    const operation = next.operations.find((entry) => entry.id === safeString(operationId, 120).trim());
    if (!operation || operation.type !== "relate-database-rows") return next;
    operation.targetRowIds = normalizeRowIds(rowIds);
    operation.targetRows = operation.targetRowIds.map((rowId) => {
      const existing = asArray(operation.targetRows).find((row) => row.rowId === rowId);
      return existing || { rowId, title: rowId };
    });
    return next;
  }

  function questionAppliesToSelection(question, selectedIds) {
    const operationIds = asArray(question.operationIds);
    return !operationIds.length || operationIds.some((id) => selectedIds.has(id));
  }

  function prepareProposal(proposal, catalog = {}) {
    const next = cloneProposal(proposal);
    const operationById = new Map(next.operations.map((operation) => [operation.id, operation]));
    const selectedIds = new Set(next.review.selectedOperationIds.filter((id) => operationById.has(id)));
    const selectedOperations = next.operations.filter((operation) => selectedIds.has(operation.id));
    const errors = [];

    if (!selectedOperations.length) errors.push("Select at least one change to prepare.");

    const unansweredQuestions = next.questions.filter((question) => (
      questionAppliesToSelection(question, selectedIds)
      && !safeString(next.review.answers[question.id], 2000).trim()
    ));
    unansweredQuestions.forEach((question) => {
      errors.push(`Answer before preparing: ${question.question}`);
    });

    let validated = null;
    if (selectedOperations.length) {
      validated = normalizeProposal({
        id: next.id,
        summary: next.summary,
        operations: selectedOperations,
        // Keep normalization's rejection details even when every selected operation is invalid.
        questions: [{ id: "__review-validation", question: "Internal review validation" }]
      }, catalog, {}, {
        allowedDatabaseRefs: next.allowedDatabaseRefs,
        allowedContentRefs: next.allowedContentRefs
      });
      if (!validated || validated.operations.length !== selectedOperations.length) {
        asArray(validated?.rejectedOperations).forEach((rejection) => {
          errors.push(`Change could not be prepared: ${rejection.reason}`);
        });
        if (!asArray(validated?.rejectedOperations).length) {
          errors.push("One or more selected changes are no longer valid.");
        }
      }
      asArray(validated?.operations).forEach((operation) => {
        asArray(operation.warnings).forEach((warning) => {
          errors.push(`Change could not be prepared: ${warning}`);
        });
      });
    }

    next.executable = false;
    next.review.selectedOperationIds = next.operations
      .map((operation) => operation.id)
      .filter((id) => selectedIds.has(id));
    next.review.errors = [...new Set(errors)];

    if (next.review.errors.length) {
      next.status = "proposed";
      next.review.status = "invalid";
      next.preparedTransaction = null;
      return next;
    }

    const answers = Object.fromEntries(next.questions
      .filter((question) => questionAppliesToSelection(question, selectedIds))
      .map((question) => [question.id, safeString(next.review.answers[question.id], 2000).trim()])
      .filter(([, answer]) => answer));
    next.status = "prepared";
    next.review.status = "prepared";
    next.operations = next.operations.map((operation) => {
      const refreshed = validated.operations.find((entry) => entry.id === operation.id);
      return refreshed || operation;
    });
    next.preparedTransaction = {
      version: VERSION,
      id: `prepared-${next.id}-${Date.now()}`,
      proposalId: next.id,
      status: "prepared",
      summary: next.summary,
      operations: validated.operations,
      answers,
      createdAt: Date.now(),
      executable: false,
      applyAvailable: false
    };
    return next;
  }

  function describeOperation(operation = {}) {
    if (operation.type === "create-inline-database") {
      const rowCount = asArray(operation.databaseRows).length;
      const viewCount = asArray(operation.views).length;
      return `Create ${operation.databaseTitle || "database"} on ${operation.targetTitle || "the selected page"} with ${rowCount} row${rowCount === 1 ? "" : "s"} and ${viewCount} view${viewCount === 1 ? "" : "s"}`;
    }
    if (operation.type === "create-page") {
      const layoutLabel = {
        "board-canvas": "board page",
        "infinite-canvas": "infinite board",
        document: "document",
        journal: "journal"
      }[operation.layout] || "page";
      return `Create ${layoutLabel} ${operation.pageTitle || "Untitled"} under ${operation.parentTitle || "the selected page"}`;
    }
    if (operation.type === "create-database-row") {
      const title = asArray(operation.changes).find((change) => change.propertyType === "title")?.newValue;
      return `Add ${safeString(title || "a record", 180)} to ${operation.databaseTitle || "database"}`;
    }
    if (operation.type === "update-database-row") {
      const fields = asArray(operation.changes).map((change) => change.propertyName).filter(Boolean).join(", ");
      return `Update ${operation.rowTitle || "record"} in ${operation.databaseTitle || "database"}${fields ? `: ${fields}` : ""}`;
    }
    if (operation.type === "update-database-rows") {
      const count = asArray(operation.rowUpdates).length;
      const fields = [...new Set(asArray(operation.rowUpdates)
        .flatMap((row) => asArray(row.changes))
        .map((change) => change.propertyName)
        .filter(Boolean))].join(", ");
      return `Update ${count} record${count === 1 ? "" : "s"} in ${operation.databaseTitle || "database"}${fields ? `: ${fields}` : ""}`;
    }
    if (operation.type === "relate-database-rows") {
      const targets = asArray(operation.targetRows).map((row) => row.title).filter(Boolean).join(", ");
      return `Link ${operation.rowTitle || "record"} to ${targets || "related records"} through ${operation.propertyName || "relation"}`;
    }
    if (operation.type === "append-database-field") {
      return `Append to ${operation.propertyName || "field"} on ${operation.rowTitle || "record"}`;
    }
    if (operation.type === "set-database-checklist-state") {
      return `${operation.checked ? "Complete" : "Reopen"} ${operation.rowTitle || "task"} in ${operation.databaseTitle || "checklist"}`;
    }
    if (operation.type === "append-note-content") {
      return `Add visible text to note ${operation.targetTitle || "Untitled note"}`;
    }
    if (operation.type === "append-document-section") {
      return `Add visible text to ${operation.targetTitle || "document section"}`;
    }
    if (operation.type === "add-page-text-block") {
      return `Add a visible text block to ${operation.targetTitle || "page"}`;
    }
    if (operation.type === "replace-note-text") {
      return `Correct text in note ${operation.targetTitle || "Untitled note"}`;
    }
    if (operation.type === "replace-document-section-text") {
      return `Correct text in ${operation.targetTitle || "document section"}`;
    }
    if (operation.type === "replace-canvas-block-text") {
      return `Correct text in a block on ${operation.targetTitle || "page"}`;
    }
    return "Suggested change";
  }

  return {
    VERSION,
    EXECUTION_SUPPORTED: false,
    OPERATION_TYPES: [...OPERATION_TYPES],
    CONTENT_OPERATION_TYPES: [...CONTENT_OPERATION_TYPES],
    REPLACE_CONTENT_OPERATION_TYPES: [...REPLACE_CONTENT_OPERATION_TYPES],
    normalizeProposal,
    setOperationSelected,
    setQuestionAnswer,
    editOperationValue,
    setRelationTargets,
    prepareProposal,
    describeOperation,
    databaseRefFromSource
  };
});
