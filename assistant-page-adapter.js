(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SanctumPageTransactionAdapter = api.createPageAdapter({
      readPages: () => root.SanctumAssistantPageRegistryStore?.read?.() || [],
      getParent: (parentId) => root.SanctumAssistantPageRegistryStore?.getParent?.(parentId) || null,
      createPage: (config) => root.SanctumAssistantPageRegistryStore?.create?.(config),
      deletePage: (pageId) => root.SanctumAssistantPageRegistryStore?.delete?.(pageId),
      readPageBlocks: () => root.SanctumAssistantPageBlockStore?.read?.() || root.readAllPageBlocks?.() || {},
      readDocuments: () => root.SanctumAssistantDocumentStore?.read?.() || root.readAllDocuments?.() || {},
      readJournals: () => root.readAllJournals?.() || {},
    });
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;
  const PAGE_LAYOUTS = new Set(["board-canvas", "infinite-canvas", "document", "journal"]);

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
    return `page-${(hash >>> 0).toString(16)}-${text.length}`;
  }

  function documentContentIsMeaningful(content = "") {
    const html = safeString(content, 500000);
    const visibleText = html
      .replace(/<br\s*\/?>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;|&#160;/gi, "")
      .trim();
    return !!visibleText || /<(?:img|table|hr|figure|iframe|video|audio|canvas|svg)\b/i.test(html);
  }

  function compactDocumentState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const meta = asObject(value.meta);
    const stats = asObject(meta.stats);
    const viewPrefs = asObject(value.viewPrefs);
    const layers = asObject(asObject(value.annotation).layers);
    const sections = asArray(value.sections);
    const dailyGoal = Number.isFinite(Number(stats.dailyGoal)) ? Number(stats.dailyGoal) : 500;
    const overallGoal = Number.isFinite(Number(stats.overallGoal)) ? Number(stats.overallGoal) : 5000;
    const meaningfulSections = sections.map((section, index) => {
      const item = asObject(section);
      const sectionMeta = asObject(item.meta);
      const expectedTitle = `Section ${index + 1}`;
      const compact = {
        index,
        title: safeString(item.title, 500).trim() === expectedTitle ? "" : safeString(item.title, 500),
        content: documentContentIsMeaningful(item.content) ? safeString(item.content, 500000) : "",
        styleKit: safeString(item.styleKit, 240),
        meta: {
          status: sectionMeta.status && sectionMeta.status !== "draft" ? safeString(sectionMeta.status, 80) : "",
          purpose: safeString(sectionMeta.purpose, 1000),
          pov: safeString(sectionMeta.pov, 500),
          povId: safeString(sectionMeta.povId, 240),
          location: safeString(sectionMeta.location, 500),
          locationId: safeString(sectionMeta.locationId, 240),
          chapter: safeString(sectionMeta.chapter, 500),
          notes: safeString(sectionMeta.notes, 5000),
        },
        annotations: asArray(item.annotations),
        suggestedChanges: asArray(item.suggestedChanges),
      };
      const hasMeaning = compact.title
        || compact.content
        || compact.styleKit
        || Object.values(compact.meta).some(Boolean)
        || compact.annotations.length
        || compact.suggestedChanges.length;
      return hasMeaning ? compact : null;
    }).filter(Boolean);
    const state = {
      sectionCount: sections.length > 1 ? sections.length : 1,
      sections: meaningfulSections,
      meta: {
        title: safeString(meta.title, 500),
        defaultMode: meta.defaultMode && meta.defaultMode !== "edit" ? safeString(meta.defaultMode, 80) : "",
        headerHTML: documentContentIsMeaningful(meta.headerHTML) ? safeString(meta.headerHTML, 500000) : "",
        footerHTML: documentContentIsMeaningful(meta.footerHTML) ? safeString(meta.footerHTML, 500000) : "",
        dailyGoal,
        overallGoal,
        dailyHistory: asArray(stats.dailyHistory),
      },
      viewPrefs: {
        showAnnotations: viewPrefs.showAnnotations === true,
        visibleAnnotationLayers: asArray(viewPrefs.visibleAnnotationLayers),
      },
      annotationLayers: {
        notes: layers.notes !== false,
        threads: layers.threads !== false,
        marks: layers.marks !== false,
        stickies: layers.stickies !== false,
      },
    };
    const isDefault = state.sectionCount === 1
      && !state.sections.length
      && !state.meta.title
      && !state.meta.defaultMode
      && !state.meta.headerHTML
      && !state.meta.footerHTML
      && state.meta.dailyGoal === 500
      && state.meta.overallGoal === 5000
      && !state.meta.dailyHistory.length
      && !state.viewPrefs.showAnnotations
      && !state.viewPrefs.visibleAnnotationLayers.length
      && Object.values(state.annotationLayers).every(Boolean);
    return isDefault ? null : state;
  }

  function requireFunction(environment, name) {
    if (typeof environment?.[name] !== "function") {
      throw new Error(`Page adapter cannot access ${name}.`);
    }
    return environment[name];
  }

  function createPageAdapter(environment = {}) {
    function readPages() {
      return clone(requireFunction(environment, "readPages")());
    }

    function pageState(pageId) {
      const page = readPages().find((entry) => entry?.id === pageId) || null;
      const blocks = asObject(requireFunction(environment, "readPageBlocks")());
      const documents = typeof environment.readDocuments === "function"
        ? asObject(environment.readDocuments())
        : {};
      const journals = typeof environment.readJournals === "function"
        ? asObject(environment.readJournals())
        : {};
      return {
        pageId,
        exists: !!page,
        page: page ? clone(page) : null,
        blocks: Object.prototype.hasOwnProperty.call(blocks, pageId) ? clone(blocks[pageId]) : null,
        document: Object.prototype.hasOwnProperty.call(documents, pageId)
          ? compactDocumentState(documents[pageId])
          : null,
        journal: Object.prototype.hasOwnProperty.call(journals, pageId) ? clone(journals[pageId]) : null,
      };
    }

    function affectedState(operations = []) {
      return asArray(operations).map((operation) => pageState(safeString(operation.pageId, 180).trim()));
    }

    return {
      sourceType: "page",
      preflight(operations) {
        const pages = readPages();
        const seenPageIds = new Set();
        const proposedPages = new Map();
        const seenSiblingTitles = new Set();
        asArray(operations).forEach((operation) => {
          if (operation.type !== "create-page") throw new Error("Unsupported page operation.");
          const pageId = safeString(operation.pageId, 180).trim();
          const parentId = safeString(operation.parentId, 180).trim();
          const title = safeString(operation.pageTitle, 180).trim();
          const layout = safeString(operation.layout, 80).trim();
          if (!pageId || !parentId || !title) throw new Error("Page creation is missing an ID, parent, or title.");
          if (!PAGE_LAYOUTS.has(layout)) throw new Error("The proposed page layout is not supported.");
          if (
            layout === "journal"
            && (operation.category !== "none" || operation.containerType !== "page")
          ) {
            throw new Error("Journal pages must use the standard page container.");
          }
          if (seenPageIds.has(pageId) || pages.some((page) => page?.id === pageId)) {
            throw new Error("The proposed page already exists.");
          }
          seenPageIds.add(pageId);
          const siblingTitleKey = `${parentId}\u0000${title.toLowerCase()}`;
          if (seenSiblingTitles.has(siblingTitleKey)) {
            throw new Error("This transaction proposes the same sibling page more than once.");
          }
          seenSiblingTitles.add(siblingTitleKey);
          const parent = requireFunction(environment, "getParent")(parentId);
          const proposedParent = proposedPages.get(parentId);
          if (!parent && !proposedParent) throw new Error("The proposed parent page no longer exists.");
          if (operation.parentOperationId && proposedParent?.operationId !== operation.parentOperationId) {
            throw new Error("A dependent child page must follow its reviewed parent operation.");
          }
          const duplicate = pages.some((page) => (
            page?.parent === parentId
            && safeString(page?.title, 180).trim().toLowerCase() === title.toLowerCase()
          ));
          if (duplicate) throw new Error("A page with that title already exists under the selected parent.");
          proposedPages.set(pageId, {
            id: pageId,
            operationId: operation.id,
            title,
            parent: parentId,
            layout
          });
        });
        return true;
      },
      snapshot(operations) {
        return { version: VERSION, items: affectedState(operations) };
      },
      apply(operations) {
        const changedItems = [];
        asArray(operations).forEach((operation) => {
          const created = requireFunction(environment, "createPage")({
            pageId: operation.pageId,
            title: operation.pageTitle,
            parentId: operation.parentId,
            layout: operation.layout,
            category: operation.category,
            containerType: operation.containerType,
          });
          if (
            !created
            || created.id !== operation.pageId
            || created.parent !== operation.parentId
            || created.layout !== operation.layout
          ) {
            throw new Error("The page could not be created with its reviewed identity.");
          }
          changedItems.push({
            kind: "page",
            targetRef: `page:${created.id}`,
            targetTitle: created.title || operation.pageTitle || "Untitled page",
            pageId: created.id,
          });
        });
        return { changedItems };
      },
      restore(snapshot) {
        for (const item of [...asArray(snapshot?.items)].reverse()) {
          if (item.exists) {
            throw new Error("Page creation restore cannot overwrite a page that existed before Apply.");
          }
          const deleted = requireFunction(environment, "deletePage")(item.pageId);
          if (deleted === false) throw new Error("The created page could not be removed.");
        }
        return true;
      },
      fingerprint(snapshot) {
        return stableFingerprint(asArray(snapshot?.items).map((item) => pageState(item.pageId)));
      },
    };
  }

  return {
    VERSION,
    createPageAdapter,
  };
});
