(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SanctumDatabaseStructureTransactionAdapter = api.createAdapter({
      readPageBlocks: () => root.SanctumAssistantPageBlockStore?.read?.() || root.readAllPageBlocks?.() || {},
      writePageBlocks: (next) => root.SanctumAssistantPageBlockStore?.write?.(next) ?? false,
      hasPage: (pageId) => root.SanctumAssistantPageBlockStore?.hasPage?.(pageId) || false,
      getPage: (pageId) => root.SanctumAssistantPageBlockStore?.getPage?.(pageId) || null,
      readPages: () => root.SanctumAssistantPageRegistryStore?.read?.() || [],
      createDatabasePage: (config) => root.SanctumAssistantPageRegistryStore?.create?.({
        ...config,
        layout: "sheet",
        category: "none",
        containerType: "page",
        recordKind: "database"
      }),
      createRowPages: (items) => root.SanctumAssistantPageRegistryStore?.createDatabaseRowPages?.(items),
      deletePages: (pageIds) => root.SanctumAssistantPageRegistryStore?.deleteMany?.(pageIds),
      readPageDatabases: () => root.SanctumAssistantPageDatabaseStore?.read?.() || {},
      writePageDatabases: (next) => root.SanctumAssistantPageDatabaseStore?.write?.(next) ?? false,
      readDocuments: () => root.SanctumAssistantDocumentStore?.read?.() || root.readAllDocuments?.() || {},
    });
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;
  const SUPPORTED_VIEWS = new Set(["table", "board", "gallery", "calendar", "checklist"]);

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

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stableFingerprint(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `database-structure-${(hash >>> 0).toString(16)}-${text.length}`;
  }

  function requireFunction(environment, name) {
    if (typeof environment?.[name] !== "function") {
      throw new Error(`Database structure adapter cannot access ${name}.`);
    }
    return environment[name];
  }

  function getBlockBottom(block = {}) {
    const y = Number(block.y);
    const h = Number(block.h);
    return (Number.isFinite(y) ? y : 0) + (Number.isFinite(h) && h > 0 ? h : 0);
  }

  function makeDatabaseBlock(operation, view, viewIndex, viewCount, databasePageId, baseY, topZ) {
    const blockId = safeString(view.blockId, 180).trim();
    const usePairedLayout = viewCount > 1;
    const defaultWidth = usePairedLayout ? 720 : 960;
    const defaultHeight = 432;
    const column = usePairedLayout ? viewIndex % 2 : 0;
    const row = usePairedLayout ? Math.floor(viewIndex / 2) : viewIndex;
    return {
      id: blockId,
      type: "calendar",
      x: Number.isFinite(Number(view.x))
        ? Math.round(Number(view.x) / 24) * 24
        : 48 + (column * (defaultWidth + 24)),
      y: Number.isFinite(Number(view.y))
        ? Math.round(Number(view.y) / 24) * 24
        : baseY + (row * (defaultHeight + 48)),
      w: Number.isFinite(Number(view.w)) && Number(view.w) > 0
        ? Math.round(Number(view.w) / 24) * 24
        : defaultWidth,
      h: Number.isFinite(Number(view.h)) && Number(view.h) > 0
        ? Math.round(Number(view.h) / 24) * 24
        : defaultHeight,
      z: topZ + viewIndex + 1,
      titleHTML: "",
      bodyHTML: "",
      containerTitle: "",
      containerBody: "",
      containerItems: [],
      tableHTML: "",
      bg: "",
      borderColor: "",
      textColor: "",
      padding: "",
      radius: "",
      imageCropShape: "original",
      imageFrameStyle: "none",
      hasNote: 0,
      linkedPageId: "",
      pageCardTitle: "",
      pageCardMeta: "",
      pageCardIcon: "",
      pageCardSummary: "",
      pageCardTypeLabel: "",
      pageCardImageSrc: "",
      pageCardImageMode: "none",
      pageCardImagePos: 50,
      pageCardView: "default",
      pageCardHideIcon: 0,
      cardStyle: "",
      calendarTitle: safeString(operation.databaseTitle, 180).trim() || "Database",
      calendarView: SUPPORTED_VIEWS.has(view.view) ? view.view : "table",
      calendarMonth: "",
      calendarItems: "[]",
      dbProperties: "[]",
      dbRows: "[]",
      dbColumnWidths: "{}",
      dbFilters: JSON.stringify(asArray(view.filters)),
      dbSorts: JSON.stringify(asArray(view.sorts)),
      dbGroupBy: safeString(view.groupBy, 180).trim(),
      dbHiddenPropertyIds: "[]",
      dbFolderState: "{}",
      dbResetConfig: "{}",
      dbChecklistAutomation: "{}",
      dbStatusAutomation: "{}",
      dbGalleryCardSize: "medium",
      dbGalleryCardFields: "0",
      dbGalleryCardPropertyIds: "[]",
      dbGalleryOpenMode: "peek",
      dbRowPageLayout: "document",
      dbRowPageKind: "database-row",
      // Every inline block is a view over one canonical full-page database.
      // Rows and properties never live in the canvas block itself.
      dbSourceKind: "page",
      dbSourcePageId: databasePageId,
      dbSourceBlockId: "",
      dbViewTitle: safeString(view.title, 180).trim() || safeString(operation.databaseTitle, 180).trim(),
      calendarCollapsed: "",
      calendarExpandedWidth: "",
    };
  }

  function compactCreatedBlock(block = {}) {
    return clone(block);
  }

  function createAdapter(environment = {}) {
    function readBlocks() {
      return clone(asObject(requireFunction(environment, "readPageBlocks")()));
    }

    function readPages() {
      return clone(asArray(requireFunction(environment, "readPages")()));
    }

    function readPageDatabases() {
      return clone(asObject(requireFunction(environment, "readPageDatabases")()));
    }

    function affectedState(operations = []) {
      const blocks = readBlocks();
      const pages = readPages();
      const pageDatabases = readPageDatabases();
      const documents = typeof environment.readDocuments === "function"
        ? clone(asObject(environment.readDocuments()))
        : {};
      return asArray(operations).map((operation) => {
        const blockIds = asArray(operation.views).map((view) => view.blockId);
        const rowPageIds = asArray(operation.databaseRows).map((row) => row.pageId).filter(Boolean);
        const pageBlocks = asArray(blocks[operation.pageId]);
        const databasePageId = safeString(operation.databasePageId, 180).trim();
        const databasePage = pages.find((entry) => entry?.id === databasePageId) || null;
        return {
          operationId: operation.id,
          pageId: operation.pageId,
          databasePageId,
          databasePage: databasePage ? clone(databasePage) : null,
          database: Object.prototype.hasOwnProperty.call(pageDatabases, databasePageId)
            ? clone(pageDatabases[databasePageId])
            : null,
          blocks: blockIds.map((blockId) => {
            const block = pageBlocks.find((entry) => entry?.id === blockId);
            return block ? compactCreatedBlock(block) : null;
          }),
          rowPages: rowPageIds.map((pageId) => {
            const page = pages.find((entry) => entry?.id === pageId) || null;
            return {
              pageId,
              page: page ? clone(page) : null,
              blocks: Object.prototype.hasOwnProperty.call(blocks, pageId) ? clone(blocks[pageId]) : null,
              document: Object.prototype.hasOwnProperty.call(documents, pageId) ? clone(documents[pageId]) : null,
            };
          }),
        };
      });
    }

    return {
      sourceType: "database-structure",
      preflight(operations) {
        const blocks = readBlocks();
        const pages = readPages();
        const allBlockIds = new Set(
          Object.values(blocks).flatMap((items) => asArray(items).map((item) => item?.id).filter(Boolean))
        );
        const allPageIds = new Set(pages.map((page) => page?.id).filter(Boolean));
        const proposedBlockIds = new Set();
        const proposedPageIds = new Set();

        asArray(operations).forEach((operation) => {
          if (operation.type !== "create-inline-database") {
            throw new Error("Unsupported database structure operation.");
          }
          const pageId = safeString(operation.pageId, 180).trim();
          if (!pageId) throw new Error("Inline database creation has no target page.");
          if (!operation.createdPageOperationId) {
            const page = requireFunction(environment, "getPage")(pageId);
            if (!page || !["board-canvas", "infinite-canvas"].includes(page.layout || "")) {
              throw new Error("Inline databases can only be added to an existing board page.");
            }
          }
          if (!safeString(operation.databaseTitle, 180).trim()) {
            throw new Error("Inline database creation needs a title.");
          }
          const databasePageId = safeString(operation.databasePageId, 180).trim();
          if (
            !databasePageId
            || allPageIds.has(databasePageId)
            || proposedPageIds.has(databasePageId)
          ) {
            throw new Error("The canonical database page is invalid or already exists.");
          }
          proposedPageIds.add(databasePageId);
          const properties = asArray(operation.databaseProperties);
          if (!properties.length || !properties.some((property) => property?.id === "name" && property?.type === "title")) {
            throw new Error("Inline database creation needs one title property.");
          }
          const views = asArray(operation.views);
          if (!views.length) throw new Error("Inline database creation needs at least one view.");
          views.forEach((view) => {
            const blockId = safeString(view?.blockId, 180).trim();
            if (!blockId || allBlockIds.has(blockId) || proposedBlockIds.has(blockId)) {
              throw new Error("A proposed inline database block already exists.");
            }
            proposedBlockIds.add(blockId);
          });
          asArray(operation.databaseRows).forEach((row) => {
            const pageIdForRow = safeString(row?.pageId, 180).trim();
            if (!pageIdForRow || allPageIds.has(pageIdForRow) || proposedPageIds.has(pageIdForRow)) {
              throw new Error("A proposed database row page already exists.");
            }
            proposedPageIds.add(pageIdForRow);
          });
        });
        return true;
      },
      snapshot(operations) {
        return {
          version: VERSION,
          items: asArray(operations).map((operation) => ({
            operationId: operation.id,
            pageId: operation.pageId,
            databasePageId: operation.databasePageId,
            blockIds: asArray(operation.views).map((view) => view.blockId),
            rowPageIds: asArray(operation.databaseRows).map((row) => row.pageId).filter(Boolean),
          })),
        };
      },
      apply(operations) {
        const allBlocks = readBlocks();
        const allPageDatabases = readPageDatabases();
        const rowPages = [];
        const changedItems = [];
        const createdDatabasePages = [];

        asArray(operations).forEach((operation) => {
          const pageId = operation.pageId;
          const databasePageId = safeString(operation.databasePageId, 180).trim();
          if (!requireFunction(environment, "hasPage")(pageId)) {
            throw new Error("The target board page no longer exists.");
          }
          const databasePage = requireFunction(environment, "createDatabasePage")({
            pageId: databasePageId,
            title: operation.databaseTitle,
            parentId: pageId,
          });
          if (!databasePage?.id || databasePage.id !== databasePageId) {
            throw new Error("The canonical database page could not be created.");
          }
          createdDatabasePages.push(databasePageId);
          if (!Object.prototype.hasOwnProperty.call(allBlocks, databasePageId)) {
            allBlocks[databasePageId] = [];
          }
          allPageDatabases[databasePageId] = {
            title: operation.databaseTitle,
            view: "table",
            properties: clone(asArray(operation.databaseProperties)),
            rows: clone(asArray(operation.databaseRows)),
            filters: [],
            sorts: [],
            groupBy: "",
            columnWidths: {},
            folderState: {},
            resetConfig: {},
            checklistAutomation: {},
            statusAutomation: {},
            galleryCardSize: "medium",
            galleryCardFields: false,
            galleryCardPropertyIds: [],
            galleryOpenMode: "peek",
            rowPageLayout: "document",
            rowPageKind: "database-row",
          };
          changedItems.push({
            kind: "database-page",
            targetRef: `page:${databasePageId}`,
            targetTitle: operation.databaseTitle || "Database",
            pageId: databasePageId,
            blockId: "",
          });

          const pageBlocks = asArray(allBlocks[pageId]).slice();
          const maxBottom = pageBlocks.reduce((max, block) => Math.max(max, getBlockBottom(block)), 0);
          const maxZ = pageBlocks.reduce((max, block) => Math.max(max, Number(block?.z) || 0), 0);
          const baseY = Math.ceil((maxBottom + 48) / 24) * 24;

          operation.views.forEach((view, viewIndex) => {
            const block = makeDatabaseBlock(
              operation,
              view,
              viewIndex,
              operation.views.length,
              databasePageId,
              baseY,
              maxZ
            );
            pageBlocks.push(block);
            changedItems.push({
              kind: viewIndex === 0 ? "inline-database" : "database-view",
              targetRef: `canvas-block:${pageId}:${block.id}`,
              targetTitle: view.title || operation.databaseTitle || "Database view",
              pageId,
              blockId: block.id,
            });
          });
          allBlocks[pageId] = pageBlocks;

          asArray(operation.databaseRows).forEach((row) => {
            rowPages.push({
              id: row.pageId,
              title: safeString(row.values?.name || row.title, 180).trim() || "Untitled row",
              parentId: databasePageId,
              sourceKind: "page",
              sourcePageId: databasePageId,
              sourceBlockId: "",
              rowId: row.id,
            });
          });
        });

        const wroteDatabases = requireFunction(environment, "writePageDatabases")(allPageDatabases);
        if (wroteDatabases === false) throw new Error("The canonical database page data could not be saved.");
        const wrote = requireFunction(environment, "writePageBlocks")(allBlocks);
        if (wrote === false) throw new Error("The inline database blocks could not be saved.");
        const createdPages = requireFunction(environment, "createRowPages")(rowPages);
        if (!Array.isArray(createdPages) || createdPages.length !== rowPages.length) {
          throw new Error("The database row pages could not be created.");
        }
        return {
          changedItems,
          createdDatabasePageCount: createdDatabasePages.length,
          createdRowPageCount: createdPages.length
        };
      },
      restore(snapshot) {
        const items = asArray(snapshot?.items);
        const allBlocks = readBlocks();
        items.forEach((item) => {
          const createdIds = new Set(asArray(item.blockIds));
          allBlocks[item.pageId] = asArray(allBlocks[item.pageId]).filter((block) => !createdIds.has(block?.id));
        });
        const wrote = requireFunction(environment, "writePageBlocks")(allBlocks);
        if (wrote === false) throw new Error("The generated inline database blocks could not be removed.");

        const allPageDatabases = readPageDatabases();
        items.forEach((item) => {
          delete allPageDatabases[safeString(item.databasePageId, 180).trim()];
        });
        const wroteDatabases = requireFunction(environment, "writePageDatabases")(allPageDatabases);
        if (wroteDatabases === false) throw new Error("The generated database page data could not be removed.");

        const pageIds = items.flatMap((item) => [
          ...asArray(item.rowPageIds),
          safeString(item.databasePageId, 180).trim()
        ]).filter(Boolean);
        if (pageIds.length) {
          const deleted = requireFunction(environment, "deletePages")(pageIds);
          if (deleted === false) throw new Error("The generated database and row pages could not be removed.");
        }
        return true;
      },
      fingerprint(snapshot) {
        const operations = asArray(snapshot?.items).map((item) => ({
          id: item.operationId,
          pageId: item.pageId,
          databasePageId: item.databasePageId,
          views: asArray(item.blockIds).map((blockId) => ({ blockId })),
          databaseRows: asArray(item.rowPageIds).map((pageId) => ({ pageId })),
        }));
        return stableFingerprint(affectedState(operations));
      },
    };
  }

  return {
    VERSION,
    createAdapter,
  };
});
