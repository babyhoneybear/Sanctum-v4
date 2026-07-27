const test = require("node:test");
const assert = require("node:assert/strict");

const { createPageAdapter } = require("../assistant-page-adapter.js");
const transactions = require("../assistant-transactions.js");

function makeHarness() {
  let pages = [{
    id: "archive",
    title: "The Archive",
    parent: "workshop",
    layout: "board-canvas",
    category: "none",
    containerType: "hub",
  }];
  const parents = new Map([
    ["archive", pages[0]],
    ["workshop", { id: "workshop", title: "Workshop", kind: "domain" }],
  ]);
  const blocks = { archive: [] };
  const documents = {};
  const journals = {};
  const environment = {
    readPages: () => pages,
    getParent: (parentId) => parents.get(parentId) || pages.find((page) => page.id === parentId) || null,
    readPageBlocks: () => blocks,
    readDocuments: () => documents,
    readJournals: () => journals,
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
      delete journals[pageId];
      return true;
    },
  };
  return {
    adapter: createPageAdapter(environment),
    getPages: () => pages,
    blocks,
    documents,
    journals,
  };
}

function preparedPageOperation(
  pageId = "page-assistant-test-recipe",
  layout = "board-canvas"
) {
  return {
    version: 1,
    id: "prepared-create-page",
    proposalId: "proposal-create-page",
    status: "prepared",
    summary: "Create a recipe page",
    operations: [{
      id: "create-recipe",
      type: "create-page",
      targetRef: "page:archive",
      parentRef: "page:archive",
      parentId: "archive",
      parentTitle: "The Archive",
      pageId,
      pageTitle: "Recipe Index",
      layout,
      category: "none",
      containerType: "page",
      basis: "explicit",
    }],
  };
}

test("creates a reviewed page and Undo removes it exactly", async () => {
  const harness = makeHarness();
  const receipt = await transactions.executePreparedTransaction(
    preparedPageOperation(),
    { page: harness.adapter }
  );

  assert.equal(harness.getPages().some((page) => page.id === "page-assistant-test-recipe"), true);
  assert.deepEqual(harness.blocks["page-assistant-test-recipe"], []);
  assert.equal(receipt.adapters[0].result.changedItems[0].kind, "page");

  const undone = await transactions.undoTransaction(receipt, { page: harness.adapter });
  assert.equal(undone.status, "undone");
  assert.equal(harness.getPages().some((page) => page.id === "page-assistant-test-recipe"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(harness.blocks, "page-assistant-test-recipe"), false);
});

test("Undo refuses to delete a created page after the user adds content", async () => {
  const harness = makeHarness();
  const receipt = await transactions.executePreparedTransaction(
    preparedPageOperation("page-assistant-test-changed"),
    { page: harness.adapter }
  );
  harness.blocks["page-assistant-test-changed"].push({
    id: "user-block",
    type: "text",
    bodyHTML: "<p>User content</p>",
  });

  await assert.rejects(
    transactions.undoTransaction(receipt, { page: harness.adapter }),
    /affected data changed/
  );
  assert.equal(harness.getPages().some((page) => page.id === "page-assistant-test-changed"), true);
});

test("creates document and journal layouts through the reviewed page adapter", async () => {
  for (const layout of ["document", "journal"]) {
    const harness = makeHarness();
    const pageId = `page-assistant-test-${layout}`;
    const receipt = await transactions.executePreparedTransaction(
      preparedPageOperation(pageId, layout),
      { page: harness.adapter }
    );

    const created = harness.getPages().find((page) => page.id === pageId);
    assert.equal(created.layout, layout);
    if (layout === "document") {
      harness.documents[pageId] = {
        meta: {
          defaultMode: "edit",
          updatedAt: new Date().toISOString(),
          stats: {
            dailyGoal: 500,
            overallGoal: 5000,
            lastTrackedDate: "2026-07-25",
            sessionStartWords: 0,
          },
        },
        viewPrefs: { showAnnotations: false, visibleAnnotationLayers: [] },
        annotation: {
          layers: { notes: true, threads: true, marks: true, stickies: true },
        },
        sections: [{
          id: "generated-on-open",
          title: "Section 1",
          content: "<p><br></p>",
          meta: { status: "draft" },
        }],
      };
    }
    const undone = await transactions.undoTransaction(receipt, { page: harness.adapter });
    assert.equal(undone.status, "undone");
    assert.equal(harness.getPages().some((page) => page.id === pageId), false);
  }
});

test("Undo refuses to delete a created document after writing begins", async () => {
  const harness = makeHarness();
  const pageId = "page-assistant-test-document-writing";
  const receipt = await transactions.executePreparedTransaction(
    preparedPageOperation(pageId, "document"),
    { page: harness.adapter }
  );
  harness.documents[pageId] = {
    sections: [{ id: "opening", title: "Opening", content: "<p>User writing</p>" }],
  };

  await assert.rejects(
    transactions.undoTransaction(receipt, { page: harness.adapter }),
    /affected data changed/
  );
  assert.equal(harness.getPages().some((page) => page.id === pageId), true);
});
