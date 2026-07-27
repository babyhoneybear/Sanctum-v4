const test = require("node:test");
const assert = require("node:assert/strict");

const transactions = require("../assistant-transactions.js");
const structureAdapter = require("../assistant-database-structure-adapter.js");

const GAME_TITLES = [
  "The Last of Us Part I",
  "The Last of Us Part II",
  "Apex Legends",
  "Overwatch",
  "Fortnite",
  "Call of Duty: Zombies",
  "Plants vs. Zombies: Battle for Neighborville",
  "The Sims",
  "Stardew Valley",
  "Minecraft",
  "Paralives",
  "Overcooked",
  "Medieval Dynasty",
  "ARK",
  "The Forest",
  "Grand Theft Auto",
  "It Takes Two",
  "Dead or Alive",
  "Mortal Kombat",
  "God of War",
  "Dying Light",
  "Dead by Daylight",
  "For Honor",
  "Monster Hunter",
  "Gran Turismo",
  "Nioh",
  "Nioh 2",
];

function makeHarness() {
  let pages = [{
    id: "gaming",
    title: "Gaming",
    parent: "workshop",
    layout: "board-canvas",
    category: "none",
    containerType: "page",
  }];
  let blocks = {
    gaming: [{
      id: "existing-note",
      type: "text",
      x: 24,
      y: 24,
      w: 360,
      h: 144,
      z: 1,
      bodyHTML: "Keep me",
    }],
  };
  let documents = {};
  let pageDatabases = {};

  const environment = {
    readPageBlocks: () => structuredClone(blocks),
    writePageBlocks(next) {
      blocks = structuredClone(next);
      return true;
    },
    hasPage: (pageId) => pages.some((page) => page.id === pageId),
    getPage: (pageId) => pages.find((page) => page.id === pageId) || null,
    readPages: () => structuredClone(pages),
    createDatabasePage(config) {
      const page = {
        id: config.pageId,
        title: config.title,
        parent: config.parentId,
        layout: "sheet",
        category: "none",
        containerType: "page",
      };
      pages.push(page);
      blocks[page.id] = [];
      return structuredClone(page);
    },
    readPageDatabases: () => structuredClone(pageDatabases),
    writePageDatabases(next) {
      pageDatabases = structuredClone(next);
      return true;
    },
    createRowPages(items) {
      const created = items.map((item) => {
        const page = {
          id: item.id,
          title: item.title,
          parent: item.parentId,
          layout: "document",
          category: "database-row",
          containerType: "database-row",
          openBehavior: "peek",
          hiddenInSidebar: true,
          databaseRowRef: {
            sourceKind: item.sourceKind === "page" ? "page" : "block",
            sourcePageId: item.sourcePageId,
            sourceBlockId: item.sourceKind === "page" ? "" : item.sourceBlockId,
            rowId: item.rowId,
          },
        };
        pages.push(page);
        blocks[page.id] = [];
        return structuredClone(page);
      });
      return created;
    },
    deletePages(pageIds) {
      const targets = new Set(pageIds);
      pages = pages.filter((page) => !targets.has(page.id));
      targets.forEach((pageId) => {
        delete blocks[pageId];
        delete documents[pageId];
        delete pageDatabases[pageId];
      });
      return true;
    },
    readDocuments: () => structuredClone(documents),
  };

  return {
    adapter: structureAdapter.createAdapter(environment),
    state: () => structuredClone({ pages, blocks, documents, pageDatabases }),
    mutateBlock(blockId, patch) {
      const block = blocks.gaming.find((entry) => entry.id === blockId);
      Object.assign(block, patch);
    },
  };
}

function createGamesOperation() {
  const sourceBlockId = "block-assistant-database-games-recent";
  const worldBlockId = "block-assistant-database-games-worlds";
  return {
    id: "create-games",
    type: "create-inline-database",
    targetRef: "page:gaming",
    pageId: "gaming",
    databasePageId: "page-assistant-database-games",
    targetTitle: "Gaming",
    databaseTitle: "My Games",
    databaseProperties: [
      { id: "name", name: "Game", type: "title", icon: "", showIcon: true, hidden: false },
      {
        id: "world_building",
        name: "World Building",
        type: "checkbox",
        icon: "",
        showIcon: true,
        hidden: false,
      },
    ],
    databaseRows: GAME_TITLES.map((title, index) => ({
      id: `row-assistant-games-${index + 1}`,
      pageId: `page-assistant-row-games-${index + 1}`,
      createdAt: "2026-07-26T12:00:00.000Z",
      updatedAt: "2026-07-26T12:00:00.000Z",
      archived: false,
      checklistChecked: false,
      icon: "",
      color: "",
      cellColors: {},
      values: {
        name: title,
        world_building: [
          "Minecraft",
          "The Sims",
          "Stardew Valley",
          "Paralives",
          "Medieval Dynasty",
        ].includes(title),
      },
    })),
    views: [
      {
        blockId: sourceBlockId,
        title: "Recently Opened",
        view: "table",
        filters: [],
        sorts: [{ propertyId: "__last_opened", direction: "desc" }],
        groupBy: "",
      },
      {
        blockId: worldBlockId,
        title: "Worlds I’m Building",
        view: "table",
        filters: [{ propertyId: "world_building", mode: "equals", value: "true" }],
        sorts: [],
        groupBy: "",
      },
    ],
  };
}

function prepared(operation = createGamesOperation()) {
  return {
    id: "prepared-games",
    proposalId: "games",
    status: "prepared",
    summary: "Create my games database",
    operations: [operation],
  };
}

test("creates one canonical database page, linked views, and 27 hidden row pages", async () => {
  const harness = makeHarness();
  const receipt = await transactions.executePreparedTransaction(prepared(), {
    "database-structure": harness.adapter,
  });
  const state = harness.state();
  const databaseBlocks = state.blocks.gaming.filter((block) => block.type === "calendar");
  const source = databaseBlocks[0];
  const linkedView = databaseBlocks[1];

  assert.equal(receipt.status, "applied");
  assert.equal(databaseBlocks.length, 2);
  assert.equal(source.dbSourceKind, "page");
  assert.equal(source.dbSourcePageId, "page-assistant-database-games");
  assert.equal(source.dbSourceBlockId, "");
  assert.equal(JSON.parse(source.dbRows).length, 0);
  assert.deepEqual(JSON.parse(source.dbSorts), [{
    propertyId: "__last_opened",
    direction: "desc",
  }]);
  assert.equal(linkedView.dbSourceKind, "page");
  assert.equal(linkedView.dbSourcePageId, "page-assistant-database-games");
  assert.equal(linkedView.dbSourceBlockId, "");
  assert.equal(source.y, linkedView.y);
  assert.equal(source.w, 720);
  assert.equal(linkedView.x, source.x + source.w + 24);
  assert.equal(JSON.parse(linkedView.dbRows).length, 0);
  assert.deepEqual(JSON.parse(linkedView.dbFilters), [{
    propertyId: "world_building",
    mode: "equals",
    value: "true",
  }]);

  const rowPages = state.pages.filter((page) => page.containerType === "database-row");
  const databasePage = state.pages.find((page) => page.id === "page-assistant-database-games");
  assert.equal(databasePage.layout, "sheet");
  assert.equal(databasePage.parent, "gaming");
  assert.equal(state.pageDatabases[databasePage.id].rows.length, 27);
  assert.deepEqual(state.pageDatabases[databasePage.id].filters, []);
  assert.equal(rowPages.length, 27);
  assert.equal(rowPages[0].hiddenInSidebar, true);
  assert.equal(rowPages[0].databaseRowRef.sourceKind, "page");
  assert.equal(rowPages[0].databaseRowRef.sourcePageId, databasePage.id);
  assert.equal(rowPages[0].databaseRowRef.sourceBlockId, "");
  assert.equal(rowPages.find((page) => page.title === "Minecraft").parent, databasePage.id);
  assert.equal(state.blocks.gaming.find((block) => block.id === "existing-note").bodyHTML, "Keep me");
});

test("creates linked canonical databases whose relation targets the earlier database page", async () => {
  const harness = makeHarness();
  const tiers = {
    ...createGamesOperation(),
    id: "create-tiers",
    databasePageId: "page-assistant-database-tiers",
    databaseTitle: "Magic Tiers",
    databaseProperties: [
      { id: "name", name: "Tier", type: "title", icon: "", showIcon: true, hidden: false },
    ],
    databaseRows: [{
      id: "row-assistant-tier-1",
      pageId: "page-assistant-row-tier-1",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
      archived: false,
      checklistChecked: false,
      icon: "",
      color: "",
      cellColors: {},
      values: { name: "Enhancement — Tier 1" },
    }],
    views: [{
      blockId: "block-assistant-database-tiers",
      title: "Magic Tiers",
      view: "table",
      filters: [],
      sorts: [],
      groupBy: "",
    }],
  };
  const characters = {
    ...createGamesOperation(),
    id: "create-character-magic",
    databasePageId: "page-assistant-database-character-magic",
    databaseTitle: "Character Magic",
    databaseProperties: [
      { id: "name", name: "Character", type: "title", icon: "", showIcon: true, hidden: false },
      {
        id: "tier",
        name: "Tier",
        type: "relation",
        icon: "",
        showIcon: true,
        hidden: false,
        relationTarget: {
          kind: "page",
          pageId: "page-assistant-database-tiers",
          blockId: "",
        },
      },
    ],
    databaseRows: [{
      id: "row-assistant-character-mara",
      pageId: "page-assistant-row-character-mara",
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
      archived: false,
      checklistChecked: false,
      icon: "",
      color: "",
      cellColors: {},
      values: {
        name: "Mara",
        tier: ["row-assistant-tier-1"],
      },
    }],
    views: [{
      blockId: "block-assistant-database-character-magic",
      title: "Character Magic",
      view: "table",
      filters: [],
      sorts: [],
      groupBy: "",
    }],
  };

  await transactions.executePreparedTransaction({
    id: "prepared-linked-magic",
    proposalId: "linked-magic",
    status: "prepared",
    summary: "Create linked magic databases",
    operations: [tiers, characters],
  }, {
    "database-structure": harness.adapter,
  });

  const state = harness.state();
  const relation = state.pageDatabases["page-assistant-database-character-magic"]
    .properties.find((property) => property.id === "tier");
  assert.equal(relation.type, "relation");
  assert.equal(relation.relationTarget.pageId, "page-assistant-database-tiers");
  assert.deepEqual(
    state.pageDatabases["page-assistant-database-character-magic"].rows[0].values.tier,
    ["row-assistant-tier-1"]
  );
});

test("Undo removes only the generated database/views/pages and restores the board exactly", async () => {
  const harness = makeHarness();
  const before = harness.state();
  const receipt = await transactions.executePreparedTransaction(prepared(), {
    "database-structure": harness.adapter,
  });
  const undone = await transactions.undoTransaction(receipt, {
    "database-structure": harness.adapter,
  });

  assert.equal(undone.status, "undone");
  assert.deepEqual(harness.state(), before);
});

test("Undo refuses to delete a generated database after the user changes it", async () => {
  const harness = makeHarness();
  const operation = createGamesOperation();
  const receipt = await transactions.executePreparedTransaction(prepared(operation), {
    "database-structure": harness.adapter,
  });
  harness.mutateBlock(operation.views[0].blockId, { x: 240 });

  await assert.rejects(
    transactions.undoTransaction(receipt, { "database-structure": harness.adapter }),
    /changed after this transaction/
  );
  assert.equal(harness.state().blocks.gaming.filter((block) => block.type === "calendar").length, 2);
});

test("preflight rejects a structure write to a non-board page", async () => {
  const harness = makeHarness();
  const operation = createGamesOperation();
  operation.pageId = "missing";

  await assert.rejects(
    transactions.executePreparedTransaction(prepared(operation), {
      "database-structure": harness.adapter,
    }),
    /existing board page/
  );
});
