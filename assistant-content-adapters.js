(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SanctumAssistantContentAdapters = api;
    root.SanctumContentTransactionAdapters = api.createAdapters({
      readNotes: () => root.SanctumAssistantNoteStore?.read?.() || [],
      writeNotes: (notes) => root.SanctumAssistantNoteStore?.write?.(notes),
      readDocuments: () => root.SanctumAssistantDocumentStore?.read?.() || root.readAllDocuments?.() || {},
      writeDocuments: (documents) => root.SanctumAssistantDocumentStore?.write?.(documents)
        ?? root.writeAllDocuments?.(documents),
      readPageBlocks: () => root.SanctumAssistantPageBlockStore?.read?.() || root.readAllPageBlocks?.() || {},
      writePageBlocks: (blocks) => root.SanctumAssistantPageBlockStore?.write?.(blocks)
        ?? root.writeAllPageBlocks?.(blocks),
      hasPage: (pageId) => root.SanctumAssistantPageBlockStore?.hasPage?.(pageId)
        ?? [
          ...(Array.isArray(root.userPages) ? root.userPages : []),
          ...(Array.isArray(root.userDomains) ? root.userDomains : [])
        ].some((page) => page?.id === pageId),
      getPage: (pageId) => root.SanctumAssistantPageBlockStore?.getPage?.(pageId) || null,
      replaceVisibleTextInHTML: (html, matchText, replacementText) => (
        api.replaceVisibleTextInHTML(html, matchText, replacementText, root.document)
      ),
      notify: (detail) => {
        if (typeof root.CustomEvent === "function" && typeof root.dispatchEvent === "function") {
          root.dispatchEvent(new root.CustomEvent("sanctum:assistant-content-changed", { detail }));
        }
      }
    });
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = 1;

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeString(value, max = 10000) {
    if (value === null || value === undefined) return "";
    return String(value).slice(0, max);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHTML(value = "") {
    return safeString(value, 10000)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripHTML(value = "") {
    return safeString(value, 50000)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;/gi, "'")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function appendVisibleParagraph(existingHTML = "", content = "") {
    const paragraph = `<p>${escapeHTML(content).replace(/\n/g, "<br>")}</p>`;
    return `${safeString(existingHTML, 100000).trim()}${existingHTML ? "\n" : ""}${paragraph}`;
  }

  function countOccurrences(text = "", matchText = "") {
    if (!matchText) return 0;
    let count = 0;
    let fromIndex = 0;
    while (fromIndex <= text.length) {
      const foundAt = text.indexOf(matchText, fromIndex);
      if (foundAt === -1) break;
      count += 1;
      fromIndex = foundAt + matchText.length;
    }
    return count;
  }

  function replaceVisibleTextInHTML(html = "", matchText = "", replacementText = "", domDocument = null) {
    const sourceHTML = safeString(html, 100000);
    const match = safeString(matchText, 4000);
    const replacement = safeString(replacementText, 4000);
    if (!match || !replacement) return { html: sourceHTML, count: 0 };

    if (domDocument?.createElement) {
      const template = domDocument.createElement("template");
      template.innerHTML = sourceHTML;
      const showText = domDocument.defaultView?.NodeFilter?.SHOW_TEXT || 4;
      const walker = domDocument.createTreeWalker(template.content, showText);
      const nodes = [];
      let combined = "";
      let node = walker.nextNode();
      while (node) {
        const value = safeString(node.nodeValue, 100000);
        nodes.push({ node, start: combined.length, end: combined.length + value.length });
        combined += value;
        node = walker.nextNode();
      }
      const count = countOccurrences(combined, match);
      if (count !== 1) return { html: sourceHTML, count };
      const start = combined.indexOf(match);
      const end = start + match.length;
      const first = nodes.find((entry) => start >= entry.start && start < entry.end);
      const last = [...nodes].reverse().find((entry) => end > entry.start && end <= entry.end);
      if (!first || !last) return { html: sourceHTML, count: 0 };
      const prefix = safeString(first.node.nodeValue).slice(0, start - first.start);
      const suffix = safeString(last.node.nodeValue).slice(end - last.start);
      if (first === last) {
        first.node.nodeValue = `${prefix}${replacement}${suffix}`;
      } else {
        first.node.nodeValue = `${prefix}${replacement}${suffix}`;
        const firstIndex = nodes.indexOf(first);
        const lastIndex = nodes.indexOf(last);
        for (let index = firstIndex + 1; index <= lastIndex; index += 1) {
          nodes[index].node.nodeValue = "";
        }
      }
      return { html: template.innerHTML, count: 1 };
    }

    const rawCount = countOccurrences(sourceHTML, match);
    if (rawCount === 1) return { html: sourceHTML.replace(match, escapeHTML(replacement)), count: 1 };
    const escapedMatch = escapeHTML(match);
    const escapedCount = countOccurrences(sourceHTML, escapedMatch);
    if (escapedCount === 1) {
      return { html: sourceHTML.replace(escapedMatch, escapeHTML(replacement)), count: 1 };
    }
    return { html: sourceHTML, count: Math.max(rawCount, escapedCount) };
  }

  function replaceHTML(environment, html, matchText, replacementText) {
    const replacer = typeof environment.replaceVisibleTextInHTML === "function"
      ? environment.replaceVisibleTextInHTML
      : replaceVisibleTextInHTML;
    const result = replacer(html, matchText, replacementText);
    if (!result || result.count !== 1) {
      const count = Number(result?.count) || 0;
      throw new Error(count > 1
        ? "The exact passage appears more than once in the target."
        : "The exact passage is no longer present in the target.");
    }
    return result.html;
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

  function comparableDocumentState(value) {
    const documentData = asObject(value);
    const meta = asObject(documentData.meta);
    const stats = asObject(meta.stats);
    const viewPrefs = asObject(documentData.viewPrefs);
    const layers = asObject(asObject(documentData.annotation).layers);
    const dailyGoal = Number.isFinite(Number(stats.dailyGoal)) ? Number(stats.dailyGoal) : 500;
    const overallGoal = Number.isFinite(Number(stats.overallGoal)) ? Number(stats.overallGoal) : 5000;
    return {
      meta: {
        title: safeString(meta.title, 500),
        defaultMode: safeString(meta.defaultMode || "edit", 80),
        headerHTML: safeString(meta.headerHTML, 100000),
        footerHTML: safeString(meta.footerHTML, 100000),
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
      sections: asArray(documentData.sections).map((section, index) => {
        const item = asObject(section);
        const sectionMeta = asObject(item.meta);
        return {
          id: safeString(item.id, 240),
          title: safeString(item.title || `Section ${index + 1}`, 500),
          content: safeString(item.content, 100000),
          styleKit: safeString(item.styleKit, 240),
          meta: {
            status: safeString(sectionMeta.status || "draft", 80),
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
      }),
    };
  }

  function uniqueStrings(values = []) {
    return [...new Set(asArray(values).map((item) => safeString(item, 240).trim()).filter(Boolean))];
  }

  function requireFunction(environment, name) {
    if (typeof environment?.[name] !== "function") {
      throw new Error(`Content adapter cannot access ${name}.`);
    }
    return environment[name];
  }

  function noteIdsForOperations(operations = []) {
    return uniqueStrings(operations.map((operation) => operation?.source?.noteId));
  }

  function documentPageIdsForOperations(operations = []) {
    return uniqueStrings(operations.map((operation) => operation?.source?.pageId));
  }

  function canvasPageIdsForOperations(operations = []) {
    return uniqueStrings(operations.map((operation) => operation?.source?.pageId || operation?.pageId));
  }

  function createNoteAdapter(environment = {}) {
    function noteContentState(note = {}) {
      return {
        bodyHTML: safeString(note.bodyHTML, 100000),
        bodyText: safeString(note.bodyText, 50000),
        preview: safeString(note.preview, 1000)
      };
    }

    function noteMetadataState(note = {}) {
      const {
        bodyHTML: _bodyHTML,
        bodyText: _bodyText,
        preview: _preview,
        updatedAt: _updatedAt,
        ...metadata
      } = asObject(note);
      return metadata;
    }

    function readNotes() {
      return clone(requireFunction(environment, "readNotes")());
    }

    function writeNotes(notes) {
      const result = requireFunction(environment, "writeNotes")(clone(notes));
      if (result === false || result === undefined) throw new Error("Notes could not be saved.");
    }

    function affectedState(operations) {
      const ids = noteIdsForOperations(operations);
      const notes = readNotes();
      return ids.map((id) => {
        const note = notes.find((entry) => entry?.id === id);
        return {
          id,
          exists: !!note,
          value: note ? noteContentState(note) : null,
          fullValue: note ? clone(note) : null,
          metadataFingerprint: note ? stableFingerprint(noteMetadataState(note)) : ""
        };
      });
    }

    return {
      sourceType: "note",
      preflight(operations) {
        const states = affectedState(operations);
        asArray(operations).forEach((operation) => {
          if (!["append-note-content", "replace-note-text"].includes(operation.type)) {
            throw new Error("Unsupported note operation.");
          }
          if (operation.type === "append-note-content" && !safeString(operation.content, 4000).trim()) {
            throw new Error("Note append has no content.");
          }
          const noteId = safeString(operation?.source?.noteId, 240).trim();
          const state = states.find((entry) => entry.id === noteId);
          if (!state?.exists) throw new Error("The target note no longer exists.");
          if (operation.type === "replace-note-text") {
            replaceHTML(environment, state.value?.bodyHTML || "", operation.matchText, operation.replacementText);
          }
        });
        return true;
      },
      snapshot(operations) {
        return { version: VERSION, items: affectedState(operations) };
      },
      apply(operations) {
        const notes = readNotes();
        const changedItems = [];
        asArray(operations).forEach((operation) => {
          const noteId = safeString(operation?.source?.noteId, 240).trim();
          const note = notes.find((entry) => entry?.id === noteId);
          if (!note) throw new Error("The target note no longer exists.");
          note.bodyHTML = operation.type === "replace-note-text"
            ? replaceHTML(environment, note.bodyHTML, operation.matchText, operation.replacementText)
            : appendVisibleParagraph(note.bodyHTML, operation.content);
          note.bodyText = stripHTML(note.bodyHTML);
          note.preview = note.bodyText.length > 110 ? `${note.bodyText.slice(0, 107)}…` : (note.bodyText || "Empty note");
          note.updatedAt = Date.now();
          changedItems.push({
            kind: "note",
            targetRef: operation.targetRef,
            targetTitle: operation.targetTitle || note.title || "Untitled note",
            noteId
          });
        });
        writeNotes(notes);
        environment.notify?.({ sourceType: "note", changedItems: clone(changedItems) });
        return { changedItems };
      },
      restore(snapshot) {
        const notes = readNotes();
        asArray(snapshot?.items).forEach((item) => {
          const index = notes.findIndex((entry) => entry?.id === item.id);
          if (item.exists) {
            if (index === -1) {
              notes.push(clone(item.fullValue));
            } else {
              const metadataUnchanged = stableFingerprint(noteMetadataState(notes[index]))
                === item.metadataFingerprint;
              const restored = {
                ...notes[index],
                ...clone(item.value)
              };
              if (metadataUnchanged) {
                if (Object.prototype.hasOwnProperty.call(asObject(item.fullValue), "updatedAt")) {
                  restored.updatedAt = item.fullValue.updatedAt;
                } else {
                  delete restored.updatedAt;
                }
              }
              notes[index] = restored;
            }
          } else if (index !== -1) {
            notes.splice(index, 1);
          }
        });
        writeNotes(notes);
        environment.notify?.({ sourceType: "note", restored: true });
        return true;
      },
      fingerprint(snapshot) {
        const ids = asArray(snapshot?.items).map((item) => item.id);
        const notes = readNotes();
        return stableFingerprint(ids.map((id) => {
          const note = notes.find((entry) => entry?.id === id);
          return { id, exists: !!note, value: note ? noteContentState(note) : null };
        }));
      }
    };
  }

  function createDocumentAdapter(environment = {}) {
    function readDocuments() {
      return clone(requireFunction(environment, "readDocuments")());
    }

    function writeDocuments(documents) {
      const result = requireFunction(environment, "writeDocuments")(clone(documents));
      if (result === false) throw new Error("Documents could not be saved.");
    }

    function affectedState(operations) {
      const pageIds = documentPageIdsForOperations(operations);
      const documents = readDocuments();
      return pageIds.map((pageId) => ({
        pageId,
        exists: Object.prototype.hasOwnProperty.call(documents, pageId),
        value: Object.prototype.hasOwnProperty.call(documents, pageId) ? clone(documents[pageId]) : null
      }));
    }

    return {
      sourceType: "document",
      preflight(operations) {
        const documents = readDocuments();
        asArray(operations).forEach((operation) => {
          if (!["append-document-section", "replace-document-section-text"].includes(operation.type)) {
            throw new Error("Unsupported document operation.");
          }
          if (operation.type === "append-document-section" && !safeString(operation.content, 4000).trim()) {
            throw new Error("Document append has no content.");
          }
          const pageId = safeString(operation?.source?.pageId, 240).trim();
          const sectionId = safeString(operation?.source?.sectionId, 240).trim();
          const section = asArray(documents?.[pageId]?.sections).find((entry) => entry?.id === sectionId);
          if (!section && !operation.createdPageOperationId) {
            throw new Error("The target document section no longer exists.");
          }
          if (!section && operation.targetPageLayout !== "document") {
            throw new Error("Starter document content requires a newly created document page.");
          }
          if (operation.type === "replace-document-section-text") {
            if (!section) throw new Error("A blank new document has no existing passage to replace.");
            replaceHTML(environment, section.content || "", operation.matchText, operation.replacementText);
          }
        });
        return true;
      },
      snapshot(operations) {
        return { version: VERSION, items: affectedState(operations) };
      },
      apply(operations) {
        const documents = readDocuments();
        const changedItems = [];
        asArray(operations).forEach((operation) => {
          const pageId = safeString(operation?.source?.pageId, 240).trim();
          const sectionId = safeString(operation?.source?.sectionId, 240).trim();
          let documentData = documents[pageId];
          let section = asArray(documentData?.sections).find((entry) => entry?.id === sectionId);
          if (!section && operation.createdPageOperationId) {
            documentData = documentData && typeof documentData === "object"
              ? documentData
              : { meta: {}, sections: [] };
            documentData.sections = asArray(documentData.sections);
            section = {
              id: sectionId,
              title: "Section 1",
              content: "",
              styleKit: "",
              meta: { status: "draft" },
              annotations: [],
              suggestedChanges: []
            };
            documentData.sections.push(section);
            documents[pageId] = documentData;
          }
          if (!section) throw new Error("The target document section no longer exists.");
          section.content = operation.type === "replace-document-section-text"
            ? replaceHTML(environment, section.content, operation.matchText, operation.replacementText)
            : appendVisibleParagraph(section.content, operation.content);
          section.updatedAt = new Date().toISOString();
          documentData.meta = { ...asObject(documentData.meta), updatedAt: new Date().toISOString() };
          changedItems.push({
            kind: "document-section",
            targetRef: operation.targetRef,
            targetTitle: operation.targetTitle || section.title || "Document section",
            pageId,
            sectionId
          });
        });
        writeDocuments(documents);
        environment.notify?.({ sourceType: "document", changedItems: clone(changedItems) });
        return { changedItems };
      },
      restore(snapshot) {
        const documents = readDocuments();
        asArray(snapshot?.items).forEach((item) => {
          if (item.exists) documents[item.pageId] = clone(item.value);
          else delete documents[item.pageId];
        });
        writeDocuments(documents);
        environment.notify?.({ sourceType: "document", restored: true });
        return true;
      },
      fingerprint(snapshot) {
        const documents = readDocuments();
        return stableFingerprint(asArray(snapshot?.items).map((item) => ({
          pageId: item.pageId,
          exists: Object.prototype.hasOwnProperty.call(documents, item.pageId),
          value: Object.prototype.hasOwnProperty.call(documents, item.pageId)
            ? comparableDocumentState(documents[item.pageId])
            : null
        })));
      }
    };
  }

  function makeTextBlock(operation, existingBlocks = [], offset = 0) {
    const maxBottom = asArray(existingBlocks).reduce((maximum, block) => {
      const y = Number(block?.y);
      const height = Number(block?.h);
      return Math.max(maximum, (Number.isFinite(y) ? y : 0) + (Number.isFinite(height) ? height : 0));
    }, 0);
    const y = Math.ceil((maxBottom + 24 + (offset * 120)) / 24) * 24;
    return {
      id: `assistant-content-${Date.now()}-${safeString(operation.id, 80) || offset}`,
      type: "text",
      x: 24,
      y,
      w: 432,
      h: 96,
      z: 0,
      titleHTML: "",
      bodyHTML: `<div>${escapeHTML(operation.content).replace(/\n/g, "<br>")}</div>`,
      containerTitle: "",
      containerBody: "",
      containerItems: [],
      tableHTML: "",
      bg: "",
      borderColor: "",
      textColor: "",
      padding: "",
      radius: "",
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
      assistantContentOperationId: safeString(operation.id, 120)
    };
  }

  function replaceTextInBlock(environment, block = {}, operation = {}) {
    const fields = [
      "titleHTML", "bodyHTML", "containerTitle", "containerBody",
      "tableHTML", "pageCardTitle", "pageCardSummary"
    ];
    const replacer = typeof environment.replaceVisibleTextInHTML === "function"
      ? environment.replaceVisibleTextInHTML
      : replaceVisibleTextInHTML;
    const results = fields.map((field) => ({
      field,
      result: replacer(block[field] || "", operation.matchText, operation.replacementText)
    }));
    const total = results.reduce((sum, entry) => sum + (Number(entry.result?.count) || 0), 0);
    if (total !== 1) {
      throw new Error(total > 1
        ? "The exact passage appears more than once in the target block."
        : "The exact passage is no longer present in the target block.");
    }
    const changed = results.find((entry) => entry.result?.count === 1);
    return { ...block, [changed.field]: changed.result.html };
  }

  function createCanvasAdapter(environment = {}) {
    function readBlocks() {
      return clone(requireFunction(environment, "readPageBlocks")());
    }

    function writeBlocks(blocks) {
      const result = requireFunction(environment, "writePageBlocks")(clone(blocks));
      if (result === false) throw new Error("Page blocks could not be saved.");
    }

    function affectedState(operations) {
      const pageIds = canvasPageIdsForOperations(operations);
      const allBlocks = readBlocks();
      return pageIds.map((pageId) => ({
        pageId,
        exists: Object.prototype.hasOwnProperty.call(allBlocks, pageId),
        value: clone(asArray(allBlocks[pageId]))
      }));
    }

    return {
      sourceType: "canvas",
      preflight(operations) {
        const allBlocks = readBlocks();
        asArray(operations).forEach((operation) => {
          if (!["add-page-text-block", "replace-canvas-block-text"].includes(operation.type)) {
            throw new Error("Unsupported page-content operation.");
          }
          if (operation.type === "add-page-text-block" && !safeString(operation.content, 4000).trim()) {
            throw new Error("Page text block has no content.");
          }
          const pageId = safeString(operation?.source?.pageId || operation.pageId, 240).trim();
          const pageExists = !!pageId && (
            typeof environment.hasPage !== "function"
            || environment.hasPage(pageId)
          );
          if (!pageExists && !operation.createdPageOperationId) {
            throw new Error("The target page no longer exists.");
          }
          const page = typeof environment.getPage === "function" ? environment.getPage(pageId) : null;
          const layout = page?.layout || operation.targetPageLayout || "";
          if (["document", "journal"].includes(layout)) {
            throw new Error("This page requires a document or journal destination instead of a canvas text block.");
          }
          if (!pageExists && !["board-canvas", "infinite-canvas"].includes(layout)) {
            throw new Error("Starter text blocks require a newly created board page.");
          }
          if (operation.type === "replace-canvas-block-text") {
            const blockId = safeString(operation?.source?.blockId, 240).trim();
            const block = asArray(allBlocks[pageId]).find((entry) => entry?.id === blockId);
            if (!block) throw new Error("The target canvas block no longer exists.");
            replaceTextInBlock(environment, block, operation);
          }
        });
        return true;
      },
      snapshot(operations) {
        return { version: VERSION, items: affectedState(operations) };
      },
      apply(operations) {
        const allBlocks = readBlocks();
        const changedItems = [];
        asArray(operations).forEach((operation, index) => {
          const pageId = safeString(operation?.source?.pageId || operation.pageId, 240).trim();
          const current = asArray(allBlocks[pageId]);
          let block;
          if (operation.type === "replace-canvas-block-text") {
            const blockId = safeString(operation?.source?.blockId, 240).trim();
            const blockIndex = current.findIndex((entry) => entry?.id === blockId);
            if (blockIndex === -1) throw new Error("The target canvas block no longer exists.");
            block = replaceTextInBlock(environment, current[blockIndex], operation);
            allBlocks[pageId] = current.map((entry, currentIndex) => currentIndex === blockIndex ? block : entry);
          } else {
            block = makeTextBlock(operation, current, index);
            allBlocks[pageId] = [...current, block];
          }
          changedItems.push({
            kind: operation.type === "replace-canvas-block-text" ? "canvas-block" : "page-text-block",
            targetRef: operation.targetRef,
            targetTitle: operation.targetTitle || "Page",
            pageId,
            blockId: block.id
          });
        });
        writeBlocks(allBlocks);
        environment.notify?.({ sourceType: "canvas", changedItems: clone(changedItems) });
        return { changedItems };
      },
      restore(snapshot) {
        const allBlocks = readBlocks();
        asArray(snapshot?.items).forEach((item) => {
          if (item.exists) allBlocks[item.pageId] = clone(item.value);
          else delete allBlocks[item.pageId];
        });
        writeBlocks(allBlocks);
        environment.notify?.({ sourceType: "canvas", restored: true });
        return true;
      },
      fingerprint(snapshot) {
        const allBlocks = readBlocks();
        return stableFingerprint(asArray(snapshot?.items).map((item) => ({
          pageId: item.pageId,
          exists: Object.prototype.hasOwnProperty.call(allBlocks, item.pageId),
          value: asArray(allBlocks[item.pageId])
        })));
      }
    };
  }

  function createAdapters(environment = {}) {
    return {
      note: createNoteAdapter(environment),
      document: createDocumentAdapter(environment),
      canvas: createCanvasAdapter(environment)
    };
  }

  return {
    VERSION,
    createAdapters,
    appendVisibleParagraph,
    replaceVisibleTextInHTML
  };
});
