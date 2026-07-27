const test = require("node:test");
const assert = require("node:assert/strict");

const transactions = require("../assistant-transactions.js");
const { createPageAdapter } = require("../assistant-page-adapter.js");
const contentAdapters = require("../assistant-content-adapters.js");

function makeHarness() {
  let pages = [{
    id: "archive",
    title: "The Archive",
    parent: "workshop",
    layout: "board-canvas",
    category: "none",
    containerType: "hub",
  }];
  let blocks = { archive: [] };
  let documents = {};

  const pageEnvironment = {
    readPages: () => structuredClone(pages),
    getParent: (parentId) => (
      pages.find((page) => page.id === parentId)
      || (parentId === "workshop" ? { id: "workshop", title: "Workshop", kind: "domain" } : null)
    ),
    readPageBlocks: () => structuredClone(blocks),
    readDocuments: () => structuredClone(documents),
    readJournals: () => ({}),
    createPage(config) {
      const page = {
        id: config.pageId,
        title: config.title,
        parent: config.parentId,
        layout: config.layout,
        category: config.category,
        containerType: config.containerType,
      };
      pages.push(page);
      blocks[page.id] = [];
      return page;
    },
    deletePage(pageId) {
      pages = pages.filter((page) => page.id !== pageId);
      delete blocks[pageId];
      delete documents[pageId];
      return true;
    },
  };
  const contentEnvironment = {
    readNotes: () => [],
    writeNotes: () => true,
    readDocuments: () => structuredClone(documents),
    writeDocuments(next) {
      documents = structuredClone(next);
      return true;
    },
    readPageBlocks: () => structuredClone(blocks),
    writePageBlocks(next) {
      blocks = structuredClone(next);
      return true;
    },
    hasPage: (pageId) => pages.some((page) => page.id === pageId),
    getPage: (pageId) => pages.find((page) => page.id === pageId) || null,
    notify: () => {},
  };
  return {
    adapters: {
      page: createPageAdapter(pageEnvironment),
      ...contentAdapters.createAdapters(contentEnvironment),
    },
    state: () => structuredClone({ pages, blocks, documents }),
    normalizeDocument(pageId) {
      const documentData = documents[pageId];
      documentData.meta = {
        version: 1,
        title: "",
        createdAt: "",
        updatedAt: new Date().toISOString(),
        defaultMode: "edit",
        headerHTML: "",
        footerHTML: "",
        stats: {
          totalWords: 3,
          dailyGoal: 500,
          overallGoal: 5000,
          todayWords: 0,
          lastTrackedDate: "2026-07-25",
          sessionStartWords: 3,
          dailyHistory: [],
        },
      };
      documentData.viewPrefs = {
        showAnnotations: false,
        visibleAnnotationLayers: [],
      };
      documentData.annotation = {
        layers: { notes: true, threads: true, marks: true, stickies: true },
      };
      documentData.sections = documentData.sections.map((section) => ({
        ...section,
        styleKit: "",
        meta: {
          status: "draft",
          purpose: "",
          pov: "",
          povId: "",
          location: "",
          locationId: "",
          chapter: "",
          notes: "",
        },
        annotations: [],
        suggestedChanges: [],
      }));
    },
  };
}

test("creates dependent pages and starter content atomically, then Undo removes the whole build", async () => {
  const harness = makeHarness();
  const before = harness.state();
  const hubId = "page-assistant-composed-hub";
  const guideId = "page-assistant-composed-guide";
  const receipt = await transactions.executePreparedTransaction({
    id: "prepared-composed-build",
    proposalId: "composed-build",
    status: "prepared",
    summary: "Create a meal planning hub",
    operations: [
      {
        id: "create-hub",
        type: "create-page",
        targetRef: "page:archive",
        parentRef: "page:archive",
        parentId: "archive",
        parentTitle: "The Archive",
        pageId: hubId,
        pageTitle: "Meal Planning",
        layout: "board-canvas",
        category: "none",
        containerType: "hub",
      },
      {
        id: "create-guide",
        type: "create-page",
        targetRef: "@create-hub",
        parentRef: "@create-hub",
        parentOperationId: "create-hub",
        parentId: hubId,
        parentTitle: "Meal Planning",
        pageId: guideId,
        pageTitle: "Meal Planning Guide",
        layout: "document",
        category: "none",
        containerType: "page",
      },
      {
        id: "seed-hub",
        type: "add-page-text-block",
        targetRef: "@create-hub",
        targetTitle: "Meal Planning",
        createdPageOperationId: "create-hub",
        targetPageLayout: "board-canvas",
        pageId: hubId,
        source: { kind: "page", pageId: hubId },
        content: "Plan this week's meals here.",
      },
      {
        id: "seed-guide",
        type: "append-document-section",
        targetRef: "@create-guide",
        targetTitle: "Meal Planning Guide · Section 1",
        createdPageOperationId: "create-guide",
        targetPageLayout: "document",
        pageId: guideId,
        source: {
          kind: "document-section",
          pageId: guideId,
          sectionId: "assistant-section-seed-guide",
        },
        content: "Start with the meals you already enjoy.",
      },
    ],
  }, harness.adapters);

  const applied = harness.state();
  assert.equal(applied.pages.find((page) => page.id === guideId).parent, hubId);
  assert.match(applied.blocks[hubId][0].bodyHTML, /Plan this week&#39;s meals here/);
  assert.match(applied.documents[guideId].sections[0].content, /meals you already enjoy/);
  assert.deepEqual(receipt.adapters.map((entry) => entry.sourceType), ["page", "document", "canvas"]);

  harness.normalizeDocument(guideId);
  const undone = await transactions.undoTransaction(receipt, harness.adapters);
  assert.equal(undone.status, "undone");
  assert.deepEqual(harness.state(), before);
});

test("dependent operations must reference an earlier create-page operation", () => {
  assert.throws(() => transactions.createEnvelope({
    id: "bad-order",
    proposalId: "bad-order",
    status: "prepared",
    operations: [{
      id: "seed-first",
      type: "add-page-text-block",
      targetRef: "@create-later",
      createdPageOperationId: "create-later",
      source: { kind: "page", pageId: "page-assistant-later" },
      content: "Too soon",
    }, {
      id: "create-later",
      type: "create-page",
      parentId: "archive",
      pageId: "page-assistant-later",
      pageTitle: "Later",
      layout: "board-canvas",
      category: "none",
      containerType: "page",
    }],
  }), /earlier create-page/);
});
