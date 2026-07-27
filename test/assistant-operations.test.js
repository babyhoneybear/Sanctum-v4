const test = require("node:test");
const assert = require("node:assert/strict");
const contextEngine = require("../context-engine.js");
const operations = require("../assistant-operations.js");

function makeCatalog() {
  return contextEngine.buildCatalog({
    domains: [
      { id: "life", title: "Real Life" },
      { id: "world", title: "Beneath the Veins" }
    ],
    pages: [
      { id: "meals", title: "Meal History", parent: "life", category: "tracker" },
      { id: "pantry", title: "Pantry", parent: "life", category: "inventory" },
      { id: "recipes", title: "Recipes", parent: "life", category: "recipes" },
      { id: "people", title: "People", parent: "life", category: "people" },
      { id: "events", title: "World Timeline", parent: "world", category: "events" },
      { id: "characters", title: "Characters", parent: "world", category: "characters" }
    ],
    databases: [
      {
        source: { kind: "page", pageId: "meals" },
        database: {
          title: "Meal History",
          properties: [
            { id: "name", name: "Meal", type: "title" },
            { id: "date", name: "Date", type: "date" },
            {
              id: "recipe",
              name: "Recipe",
              type: "relation",
              relationTarget: { kind: "page", pageId: "recipes" }
            },
            {
              id: "people",
              name: "People",
              type: "relation",
              relationTarget: { kind: "page", pageId: "people" }
            }
          ],
          rows: []
        }
      },
      {
        source: { kind: "page", pageId: "pantry" },
        database: {
          title: "Pantry",
          properties: [
            { id: "name", name: "Item", type: "title" },
            { id: "quantity", name: "Quantity", type: "number" },
            { id: "notes", name: "Notes", type: "notes" },
            { id: "remaining", name: "Remaining", type: "formula" }
          ],
          rows: [{
            id: "tomato-sauce",
            title: "Tomato sauce",
            values: { name: "Tomato sauce", quantity: "2", notes: "", remaining: "2" }
          }]
        }
      },
      {
        source: { kind: "page", pageId: "recipes" },
        database: {
          title: "Recipes",
          properties: [{ id: "name", name: "Recipe", type: "title" }],
          rows: [{ id: "spaghetti", title: "Spaghetti", values: { name: "Spaghetti" } }]
        }
      },
      {
        source: { kind: "page", pageId: "people" },
        database: {
          title: "People",
          properties: [{ id: "name", name: "Name", type: "title" }],
          rows: [{ id: "ben", title: "Ben", values: { name: "Ben" } }]
        }
      },
      {
        source: { kind: "page", pageId: "events" },
        database: {
          title: "World Events",
          properties: [
            { id: "name", name: "Event", type: "title" },
            {
              id: "participants",
              name: "Participants",
              type: "relation",
              relationTarget: { kind: "page", pageId: "characters" }
            }
          ],
          rows: []
        }
      },
      {
        source: { kind: "page", pageId: "characters" },
        database: {
          title: "Characters",
          properties: [{ id: "name", name: "Name", type: "title" }],
          rows: [{ id: "caelan", title: "Caelan", values: { name: "Caelan" } }]
        }
      }
    ]
  });
}

function ref(pageId) {
  return contextEngine.databaseRef({ kind: "page", pageId });
}

test("validates a multi-database real-life proposal without making it executable", () => {
  const catalog = makeCatalog();
  const routePlan = {
    selections: [
      { databaseRef: ref("meals") },
      { databaseRef: ref("pantry") }
    ]
  };
  const proposal = operations.normalizeProposal({
    summary: "Record dinner and adjust the pantry",
    operations: [
      {
        id: "meal",
        type: "create-database-row",
        databaseRef: ref("meals"),
        values: {
          name: "Spaghetti dinner",
          date: "2026-07-25",
          recipe: ["spaghetti"],
          people: ["ben"]
        },
        basis: "explicit",
        confidence: 1,
        evidenceRefs: ["note:dinner"]
      },
      {
        id: "sauce",
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "tomato-sauce",
        values: { quantity: 1 },
        basis: "inferred",
        confidence: 0.72,
        assumptions: ["The usual recipe used one can."]
      }
    ]
  }, catalog, routePlan);

  assert.equal(proposal.executable, false);
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.operations.length, 2);
  assert.equal(proposal.rejectedOperations.length, 0);
  assert.equal(proposal.operations[0].values.recipe[0], "spaghetti");
  assert.equal(proposal.operations[1].changes[0].oldValue, "2");
  assert.equal(proposal.operations[1].changes[0].newValue, 1);
});

test("rejects operations against databases that were not routed", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    operations: [{
      type: "update-database-row",
      databaseRef: ref("pantry"),
      rowId: "tomato-sauce",
      values: { quantity: 0 }
    }],
    questions: [{ question: "Should this be changed?" }]
  }, catalog, {
    selections: [{ databaseRef: ref("meals") }]
  });

  assert.equal(proposal.operations.length, 0);
  assert.equal(proposal.rejectedOperations.length, 1);
  assert.equal(proposal.questions.length, 1);
});

test("rejects unknown rows, properties, and read-only formula fields", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    operations: [
      {
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "missing-row",
        values: { quantity: 1 }
      },
      {
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "tomato-sauce",
        values: { missing: "value" }
      },
      {
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "tomato-sauce",
        values: { remaining: 0 }
      }
    ],
    questions: [{ question: "Review the rejected changes." }]
  }, catalog, {
    selections: [{ databaseRef: ref("pantry") }]
  });

  assert.equal(proposal.operations.length, 0);
  assert.equal(proposal.rejectedOperations.length, 3);
});

test("normalizes one reviewed bulk operation for many row updates", () => {
  const catalog = contextEngine.buildCatalog({
    pages: [{ id: "games", title: "Games", layout: "board-canvas" }],
    databases: [{
      source: { kind: "block", pageId: "games", blockId: "games-source" },
      database: {
        title: "My Games",
        properties: [
          { id: "name", name: "Game", type: "title" },
          { id: "tags", name: "Tags", type: "tag" }
        ],
        rows: [
          { id: "minecraft", values: { name: "Minecraft", tags: "" } },
          { id: "stardew", values: { name: "Stardew Valley", tags: "" } }
        ]
      }
    }]
  });
  const databaseRef = contextEngine.databaseRef({
    kind: "block",
    pageId: "games",
    blockId: "games-source"
  });
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "tag-games",
      type: "update-database-rows",
      databaseRef,
      rowUpdates: [
        { rowId: "minecraft", values: { tags: "Sandbox, World Building" } },
        { rowId: "stardew", values: { tags: "Cozy, World Building" } }
      ],
      basis: "explicit"
    }]
  }, catalog, {
    selections: [{ databaseRef }]
  });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].rowUpdates.length, 2);
  assert.equal(proposal.operations[0].rowUpdates[0].rowTitle, "Minecraft");
  assert.equal(proposal.operations[0].rowUpdates[1].values.tags, "Cozy, World Building");
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations[0].rowUpdates.length, 2);
});

test("normalizes compact column-based bulk row updates", () => {
  const catalog = makeCatalog();
  const pantryRef = ref("pantry");
  const pantryRows = catalog.records.filter((record) => record.kind === "database-row" && record.parentRef === pantryRef);
  const proposal = operations.normalizeProposal({
    id: "compact-pantry-update",
    operations: [{
      id: "update-pantry",
      type: "update-database-rows",
      databaseRef: pantryRef,
      columns: ["quantity"],
      rowUpdates: pantryRows.map((row, index) => [row.id, index + 3]),
      basis: "explicit"
    }]
  }, catalog, {
    selections: [{ databaseRef: pantryRef, rowMode: "all" }]
  });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].rowUpdates.length, 1);
  assert.equal(proposal.operations[0].rowUpdates[0].values.quantity, 3);
});

test("validates relations from a proposed new row to existing rows", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    operations: [
      {
        id: "new-meal",
        type: "create-database-row",
        databaseRef: ref("meals"),
        values: { name: "Spaghetti dinner", date: "2026-07-25" },
        basis: "explicit"
      },
      {
        id: "connect-recipe",
        type: "relate-database-rows",
        databaseRef: ref("meals"),
        rowId: "@new-meal",
        propertyId: "recipe",
        targetDatabaseRef: ref("recipes"),
        targetRowIds: ["spaghetti"],
        basis: "explicit"
      }
    ]
  }, catalog, {
    selections: [{ databaseRef: ref("meals") }]
  });

  assert.equal(proposal.operations.length, 2);
  assert.equal(proposal.operations[1].targetRows[0].title, "Spaghetti");
});

test("uses the same proposal language for worldbuilding events", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    summary: "Record Caelan joining the Ash Court",
    operations: [{
      type: "create-database-row",
      databaseRef: ref("events"),
      values: {
        name: "Caelan joined the Ash Court",
        participants: ["caelan"]
      },
      basis: "explicit",
      confidence: 1
    }]
  }, catalog, {
    selections: [{ databaseRef: ref("events") }]
  });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].databaseTitle, "World Events");
  assert.deepEqual(proposal.operations[0].values.participants, ["caelan"]);
});

test("unsupported destructive operations are visibly withheld and never executable", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    operations: [{
      type: "delete-database-row",
      databaseRef: ref("pantry"),
      rowId: "tomato-sauce"
    }]
  }, catalog, {
    selections: [{ databaseRef: ref("pantry") }]
  });

  assert.equal(proposal.operations.length, 0);
  assert.equal(proposal.review.status, "invalid");
  assert.match(proposal.review.errors[0], /withheld/);
  assert.equal(operations.EXECUTION_SUPPORTED, false);
  assert.equal(typeof operations.executeProposal, "undefined");
});

test("review defaults explicit changes on and inferred changes off", () => {
  const catalog = makeCatalog();
  const proposal = operations.normalizeProposal({
    operations: [
      {
        id: "meal",
        type: "create-database-row",
        databaseRef: ref("meals"),
        values: { name: "Spaghetti dinner" },
        basis: "explicit"
      },
      {
        id: "pantry",
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "tomato-sauce",
        values: { quantity: 1 },
        basis: "inferred"
      }
    ]
  }, catalog, {
    selections: [{ databaseRef: ref("meals") }, { databaseRef: ref("pantry") }]
  });

  assert.deepEqual(proposal.review.selectedOperationIds, ["meal"]);
  assert.equal(proposal.preparedTransaction, null);
  assert.equal(proposal.executable, false);
});

test("answers, edits, and selections prepare a validated non-executable transaction", () => {
  const catalog = makeCatalog();
  let proposal = operations.normalizeProposal({
    id: "dinner-proposal",
    summary: "Record dinner and use one can of sauce",
    operations: [
      {
        id: "meal",
        type: "create-database-row",
        databaseRef: ref("meals"),
        values: { name: "Spaghetti dinner" },
        basis: "explicit"
      },
      {
        id: "pantry",
        type: "update-database-row",
        databaseRef: ref("pantry"),
        rowId: "tomato-sauce",
        values: { quantity: 0 },
        basis: "inferred"
      }
    ],
    questions: [{
      id: "confirm-sauce",
      question: "Did you use one can of tomato sauce?",
      operationIds: ["pantry"]
    }]
  }, catalog, {
    selections: [{ databaseRef: ref("meals") }, { databaseRef: ref("pantry") }]
  });

  proposal = operations.setOperationSelected(proposal, "pantry", true);
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "invalid");
  assert.match(proposal.review.errors[0], /Answer before preparing/);

  proposal = operations.setQuestionAnswer(proposal, "confirm-sauce", "Yes, one can.");
  proposal = operations.editOperationValue(proposal, "pantry", "quantity", "1");
  proposal = operations.prepareProposal(proposal, catalog);

  assert.equal(proposal.status, "prepared");
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations.length, 2);
  assert.equal(proposal.preparedTransaction.operations[1].values.quantity, 1);
  assert.equal(proposal.preparedTransaction.answers["confirm-sauce"], "Yes, one can.");
  assert.equal(proposal.preparedTransaction.executable, false);
  assert.equal(proposal.preparedTransaction.applyAvailable, false);
  assert.equal(proposal.executable, false);
});

test("invalid edits and stale database rows block preparation", () => {
  const catalog = makeCatalog();
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "pantry",
      type: "update-database-row",
      databaseRef: ref("pantry"),
      rowId: "tomato-sauce",
      values: { quantity: 1, notes: "Used for dinner" },
      basis: "explicit"
    }]
  }, catalog, {
    selections: [{ databaseRef: ref("pantry") }]
  });

  proposal = operations.editOperationValue(proposal, "pantry", "quantity", "a lot");
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "invalid");
  assert.ok(proposal.review.errors.some((error) => error.includes("requires a number")));
  assert.equal(proposal.preparedTransaction, null);

  proposal = operations.editOperationValue(proposal, "pantry", "quantity", 1);
  const staleCatalog = {
    ...catalog,
    records: catalog.records.filter((record) => !(
      record.kind === "database-row"
      && record.parentRef === ref("pantry")
      && record.id === "tomato-sauce"
    ))
  };
  proposal = operations.prepareProposal(proposal, staleCatalog);
  assert.equal(proposal.review.status, "invalid");
  assert.ok(proposal.review.errors.some((error) => error.includes("unknown database row")));
});

test("reviewing a prepared proposal invalidates the prepared snapshot", () => {
  const catalog = makeCatalog();
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "meal",
      type: "create-database-row",
      databaseRef: ref("meals"),
      values: { name: "Dinner" },
      basis: "explicit"
    }]
  }, catalog, {
    selections: [{ databaseRef: ref("meals") }]
  });
  proposal = operations.prepareProposal(proposal, catalog);
  assert.ok(proposal.preparedTransaction);

  proposal = operations.editOperationValue(proposal, "meal", "name", "Late dinner");
  assert.equal(proposal.status, "proposed");
  assert.equal(proposal.review.status, "reviewing");
  assert.equal(proposal.preparedTransaction, null);
});

test("visible content proposals target only retrieved notes, document sections, and pages", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "world", title: "Beneath the Veins" }],
    pages: [
      { id: "reaver", title: "Reaver", parent: "world", layout: "profile" },
      { id: "lore", title: "Lore", parent: "world", layout: "document" }
    ],
    notes: [{
      id: "reaver-notes",
      title: "Reaver notes",
      bodyHTML: "<p>Voice reference</p>",
      directPageIds: ["reaver"]
    }],
    documentsByPage: {
      lore: {
        sections: [{ id: "cast", title: "Cast", content: "<p>Characters</p>" }]
      }
    }
  });
  const allowedContentRefs = ["page:reaver", "note:reaver-notes", "document-section:lore:cast"];
  const proposal = operations.normalizeProposal({
    summary: "Record visible character facts",
    operations: [
      {
        id: "height",
        type: "add-page-text-block",
        targetRef: "page:reaver",
        content: "Height: 6′",
        basis: "explicit"
      },
      {
        id: "voice",
        type: "append-note-content",
        targetRef: "note:reaver-notes",
        content: "Voice is low and measured.",
        basis: "explicit"
      },
      {
        id: "cast",
        type: "append-document-section",
        targetRef: "document-section:lore:cast",
        content: "Reaver is 6′ tall.",
        basis: "inferred"
      }
    ]
  }, catalog, { selections: [] }, { allowedContentRefs });

  assert.equal(proposal.operations.length, 3);
  assert.equal(proposal.operations[0].source.pageId, "reaver");
  assert.equal(proposal.operations[1].source.noteId, "reaver-notes");
  assert.equal(proposal.operations[2].source.sectionId, "cast");
  assert.deepEqual(proposal.review.selectedOperationIds, ["height", "voice"]);
});

test("visible content proposals reject non-retrieved and stale targets", () => {
  const catalog = contextEngine.buildCatalog({
    pages: [{ id: "reaver", title: "Reaver" }],
    blocksByPage: { reaver: [] }
  });
  const rejected = operations.normalizeProposal({
    operations: [{
      type: "add-page-text-block",
      targetRef: "page:reaver",
      content: "Height: 6′",
      basis: "explicit"
    }],
    questions: [{ question: "Where should this go?" }]
  }, catalog, {}, { allowedContentRefs: [] });
  assert.equal(rejected.operations.length, 0);
  assert.match(rejected.rejectedOperations[0].reason, /not retrieved/);

  let proposal = operations.normalizeProposal({
    operations: [{
      id: "height",
      type: "add-page-text-block",
      targetRef: "page:reaver",
      content: "Height: 6′",
      basis: "explicit"
    }]
  }, catalog, {}, { allowedContentRefs: ["page:reaver"] });
  const changedCatalog = contextEngine.buildCatalog({
    pages: [{ id: "reaver", title: "Reaver", summary: "Changed after proposal" }]
  });
  proposal = operations.prepareProposal(proposal, changedCatalog);
  assert.equal(proposal.review.status, "invalid");
  assert.ok(proposal.review.errors.some((error) => error.includes("changed after")));
});

test("ambiguous entity resolution blocks every proposed write", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [
      { id: "life", title: "Real Life" },
      { id: "world", title: "Fiction" }
    ],
    pages: [
      { id: "life-mara", title: "Mara", parent: "life" },
      { id: "world-mara", title: "Mara", parent: "world" }
    ]
  });
  const proposal = operations.normalizeProposal({
    operations: [{
      type: "add-page-text-block",
      targetRef: "page:life-mara",
      content: "Height: 6 feet",
      basis: "explicit"
    }]
  }, catalog, {}, {
    allowedContentRefs: ["page:life-mara", "page:world-mara"],
    entityResolutionStatus: "ambiguous"
  });

  assert.equal(proposal.operations.length, 0);
  assert.equal(proposal.review.status, "invalid");
  assert.match(proposal.review.errors[0], /ambiguous/);
});

test("targeted replacements require one exact existing passage and remain editable", () => {
  const catalog = contextEngine.buildCatalog({
    pages: [{ id: "reaver", title: "Reaver" }],
    notes: [{
      id: "reaver-note",
      title: "Reaver character idea",
      bodyText: "Reaver has short buzzed or spikey hair.",
      directPageIds: ["reaver"]
    }]
  });
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "fix-spelling",
      type: "replace-note-text",
      targetRef: "note:reaver-note",
      matchText: "short buzzed or spikey hair",
      replacementText: "short buzzed or spiky hair",
      basis: "explicit"
    }]
  }, catalog, {}, { allowedContentRefs: ["note:reaver-note"] });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].changes[0].oldValue, "short buzzed or spikey hair");
  proposal = operations.editOperationValue(
    proposal,
    "fix-spelling",
    "replacementText",
    "short buzzed or closely cropped hair"
  );
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(
    proposal.preparedTransaction.operations[0].replacementText,
    "short buzzed or closely cropped hair"
  );
});

test("targeted replacements reject missing and repeated passages", () => {
  const catalog = contextEngine.buildCatalog({
    notes: [{
      id: "repeated",
      title: "Repeated facts",
      bodyText: "Same line. Same line."
    }]
  });
  const proposal = operations.normalizeProposal({
    operations: [
      {
        type: "replace-note-text",
        targetRef: "note:repeated",
        matchText: "Missing line",
        replacementText: "New line"
      },
      {
        type: "replace-note-text",
        targetRef: "note:repeated",
        matchText: "Same line",
        replacementText: "Different line"
      }
    ]
  }, catalog, {}, { allowedContentRefs: ["note:repeated"] });

  assert.equal(proposal.operations.length, 0);
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("not found")));
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("more than once")));
});

test("content proposal stale checks ignore unrelated note bookkeeping", () => {
  const initialCatalog = contextEngine.buildCatalog({
    notes: [{
      id: "reaver-note",
      title: "Reaver character idea",
      bodyText: "Reaver has short buzzed or spikey hair.",
      updatedAt: 100
    }]
  });
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "fix-spelling",
      type: "replace-note-text",
      targetRef: "note:reaver-note",
      matchText: "short buzzed or spikey hair",
      replacementText: "short buzzed or spiky hair",
      basis: "explicit"
    }]
  }, initialCatalog, {}, { allowedContentRefs: ["note:reaver-note"] });

  const bookkeepingOnlyCatalog = contextEngine.buildCatalog({
    notes: [{
      id: "reaver-note",
      title: "Reaver character idea renamed",
      bodyText: "Reaver has short buzzed or spikey hair.",
      updatedAt: 200
    }]
  });
  proposal = operations.prepareProposal(proposal, bookkeepingOnlyCatalog);

  assert.equal(proposal.review.status, "prepared");
});

test("page creation targets one retrieved parent and remains editable before Apply", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [{ id: "archive", title: "The Archive", parent: "workshop", containerType: "hub" }]
  });
  let proposal = operations.normalizeProposal({
    id: "proposal-page",
    summary: "Create a recipe page",
    operations: [{
      id: "create-recipe",
      type: "create-page",
      targetRef: "page:archive",
      pageTitle: "Recipe Index",
      layout: "board-canvas",
      category: "none",
      containerType: "page",
      basis: "explicit"
    }]
  }, catalog, {}, { allowedContentRefs: ["page:archive"] });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].parentId, "archive");
  assert.match(proposal.operations[0].pageId, /^page-assistant-/);
  proposal = operations.editOperationValue(proposal, "create-recipe", "pageTitle", "Dinner Recipes");
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations[0].pageTitle, "Dinner Recipes");
});

test("page creation supports document and journal layouts with reviewed page types", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [{ id: "archive", title: "The Archive", parent: "workshop", containerType: "hub" }]
  });
  let proposal = operations.normalizeProposal({
    operations: [
      {
        id: "document",
        type: "create-page",
        targetRef: "page:archive",
        pageTitle: "House Manual",
        layout: "document",
        basis: "explicit"
      },
      {
        id: "journal",
        type: "create-page",
        targetRef: "page:archive",
        pageTitle: "Private Journal",
        layout: "journal",
        category: "note",
        containerType: "hub",
        basis: "explicit"
      }
    ]
  }, catalog, {}, { allowedContentRefs: ["page:archive"] });

  assert.equal(proposal.operations.length, 2);
  assert.equal(proposal.operations[0].layout, "document");
  assert.equal(proposal.operations[1].layout, "journal");
  assert.equal(proposal.operations[1].category, "none");
  assert.equal(proposal.operations[1].containerType, "page");
  proposal = operations.editOperationValue(proposal, "document", "layout", "journal");
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations[0].layout, "journal");
});

test("normalizes a new inline games database with linked recency and world-building views", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [{
      id: "gaming",
      title: "Gaming",
      parent: "workshop",
      layout: "board-canvas",
      containerType: "page"
    }]
  });
  let proposal = operations.normalizeProposal({
    id: "gaming-database",
    summary: "Create the games database and its views",
    operations: [{
      id: "create-games",
      type: "create-inline-database",
      targetRef: "page:gaming",
      databaseTitle: "My Games",
      properties: [
        { id: "title", name: "Game", type: "title" },
        { id: "world_building", name: "World Building", type: "checkbox" }
      ],
      rows: [
        { title: "Minecraft", world_building: true },
        { title: "Apex Legends", world_building: false },
        { title: "Stardew Valley", world_building: true }
      ],
      views: [
        {
          title: "Recently Opened",
          view: "table",
          sorts: [{ propertyId: "__last_opened", direction: "desc" }]
        },
        {
          title: "Worlds I’m Building",
          view: "table",
          filters: [{ propertyName: "World Building", mode: "equals", value: true }]
        }
      ],
      basis: "explicit"
    }]
  }, catalog, {}, { allowedContentRefs: ["page:gaming"] });

  assert.equal(proposal.operations.length, 1);
  const operation = proposal.operations[0];
  assert.equal(operation.pageId, "gaming");
  assert.match(operation.databasePageId, /^page-assistant-database-/);
  assert.equal(operation.databaseProperties[0].id, "name");
  assert.equal(operation.databaseProperties[1].id, "world_building");
  assert.equal(operation.databaseRows.length, 3);
  assert.equal(operation.databaseRows[0].values.name, "Minecraft");
  assert.equal(operation.databaseRows[0].values.world_building, true);
  assert.match(operation.databaseRows[0].pageId, /^page-assistant-row-/);
  assert.deepEqual(operation.views[0].sorts, [{
    propertyId: "__last_opened",
    direction: "desc"
  }]);
  assert.deepEqual(operation.views[1].filters, [{
    propertyId: "world_building",
    mode: "equals",
    value: "true"
  }]);
  assert.equal(operation.views[0].x, null);
  assert.equal(operation.views[0].y, null);
  assert.equal(operation.views[1].x, null);
  assert.equal(operation.views[1].y, null);

  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations[0].views.length, 2);
  assert.equal(
    proposal.preparedTransaction.operations[0].databasePageId,
    operation.databasePageId
  );
  assert.equal(proposal.preparedTransaction.operations[0].views[0].x, null);
  assert.equal(proposal.preparedTransaction.operations[0].views[0].y, null);
  assert.equal(proposal.preparedTransaction.operations[0].views[1].x, null);
  assert.equal(proposal.preparedTransaction.operations[0].views[1].y, null);
});

test("a new database can link to rows in an earlier canonical database operation", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "lore", title: "Lore" }],
    pages: [{
      id: "magic",
      title: "Magic",
      parent: "lore",
      layout: "board-canvas",
      containerType: "page"
    }]
  });
  const proposal = operations.normalizeProposal({
    id: "linked-magic-databases",
    operations: [
      {
        id: "create-tiers",
        type: "create-inline-database",
        targetRef: "page:magic",
        databaseTitle: "Magic Tiers",
        properties: [
          { id: "name", name: "Tier", type: "title" }
        ],
        rows: [
          {
            id: "row-assistant-enhancement-tier-1",
            values: { name: "Enhancement — Tier 1" }
          }
        ],
        views: [{ title: "Magic Tiers", view: "table" }],
        basis: "explicit"
      },
      {
        id: "create-character-magic",
        type: "create-inline-database",
        targetRef: "page:magic",
        databaseTitle: "Character Magic",
        properties: [
          { id: "name", name: "Character", type: "title" },
          {
            id: "tier",
            name: "Tier",
            type: "relation",
            relationTargetRef: "@create-tiers"
          }
        ],
        rows: [
          {
            values: {
              name: "Mara",
              tier: ["row-assistant-enhancement-tier-1"]
            }
          }
        ],
        views: [{ title: "Character Magic", view: "table" }],
        basis: "explicit"
      }
    ]
  }, catalog, {}, { allowedContentRefs: ["page:magic"] });

  assert.equal(proposal.operations.length, 2);
  assert.equal(proposal.rejectedOperations.length, 0);
  const tiers = proposal.operations[0];
  const characterMagic = proposal.operations[1];
  const tierProperty = characterMagic.databaseProperties.find((property) => property.id === "tier");
  assert.deepEqual(tierProperty.relationTarget, {
    kind: "page",
    pageId: tiers.databasePageId,
    blockId: ""
  });
  assert.deepEqual(
    characterMagic.databaseRows[0].values.tier,
    ["row-assistant-enhancement-tier-1"]
  );
});

test("one proposal can compose a new page tree with board and document starter content", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [{ id: "archive", title: "The Archive", parent: "workshop", containerType: "hub" }]
  });
  let proposal = operations.normalizeProposal({
    id: "composed-build",
    operations: [
      {
        id: "create-hub",
        type: "create-page",
        targetRef: "page:archive",
        pageTitle: "Meal Planning",
        layout: "board-canvas",
        containerType: "hub",
        basis: "explicit"
      },
      {
        id: "create-guide",
        type: "create-page",
        parentRef: "@create-hub",
        pageTitle: "Meal Planning Guide",
        layout: "document",
        basis: "explicit"
      },
      {
        id: "seed-hub",
        type: "add-page-text-block",
        targetRef: "@create-hub",
        content: "Plan this week's meals here.",
        basis: "explicit"
      },
      {
        id: "seed-guide",
        type: "append-document-section",
        targetRef: "@create-guide",
        content: "Start with the meals you already enjoy.",
        basis: "explicit"
      }
    ]
  }, catalog, {}, { allowedContentRefs: ["page:archive"] });

  assert.equal(proposal.operations.length, 4);
  const hub = proposal.operations.find((operation) => operation.id === "create-hub");
  const guide = proposal.operations.find((operation) => operation.id === "create-guide");
  const hubContent = proposal.operations.find((operation) => operation.id === "seed-hub");
  const guideContent = proposal.operations.find((operation) => operation.id === "seed-guide");
  assert.equal(guide.parentOperationId, "create-hub");
  assert.equal(guide.parentId, hub.pageId);
  assert.equal(hubContent.createdPageOperationId, "create-hub");
  assert.equal(hubContent.source.pageId, hub.pageId);
  assert.equal(guideContent.createdPageOperationId, "create-guide");
  assert.equal(guideContent.source.pageId, guide.pageId);
  assert.match(guideContent.source.sectionId, /^assistant-section-/);

  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "prepared");
  assert.equal(proposal.preparedTransaction.operations.length, 4);
});

test("page creation rejects unscoped parents, duplicate siblings, and unsupported layouts", () => {
  const catalog = contextEngine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [
      { id: "archive", title: "The Archive", parent: "workshop", containerType: "hub" },
      { id: "recipes", title: "Recipe Index", parent: "archive" }
    ]
  });
  const proposal = operations.normalizeProposal({
    operations: [
      {
        type: "create-page",
        targetRef: "page:archive",
        pageTitle: "Recipe Index",
        layout: "board-canvas"
      },
      {
        type: "create-page",
        targetRef: "page:archive",
        pageTitle: "Private Journal",
        layout: "sheet"
      },
      {
        type: "create-page",
        targetRef: "page:workshop",
        pageTitle: "Unrouted"
      }
    ]
  }, catalog, {}, { allowedContentRefs: ["page:archive"] });

  assert.equal(proposal.operations.length, 0);
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("already exists")));
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("board, infinite-board, document, or journal")));
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("not retrieved")));
});

test("checklist completion is a reviewed database operation and remains editable", () => {
  const catalog = contextEngine.buildCatalog({
    pages: [{ id: "practice", title: "Practice" }],
    databases: [{
      source: { kind: "page", pageId: "practice" },
      database: {
        title: "Daily Practice",
        view: "checklist",
        properties: [{ id: "name", name: "Task", type: "title" }],
        rows: [{ id: "hiragana", values: { name: "Hiragana Review" }, checklistChecked: false }]
      }
    }]
  });
  const databaseRef = ref("practice");
  let proposal = operations.normalizeProposal({
    operations: [{
      id: "finish-hiragana",
      type: "set-database-checklist-state",
      databaseRef,
      rowId: "hiragana",
      checked: true,
      basis: "explicit"
    }]
  }, catalog, { selections: [{ databaseRef }] });

  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].changes[0].oldValue, false);
  assert.equal(proposal.operations[0].changes[0].newValue, true);
  assert.match(operations.describeOperation(proposal.operations[0]), /Complete Hiragana Review/);

  proposal = operations.editOperationValue(
    proposal,
    "finish-hiragana",
    "__checklist_checked",
    "false"
  );
  proposal = operations.prepareProposal(proposal, catalog);
  assert.equal(proposal.review.status, "invalid");
  assert.ok(proposal.review.errors.some((error) => error.includes("already incomplete")));
});

test("checklist completion rejects non-checklist databases and unchanged states", () => {
  const catalog = contextEngine.buildCatalog({
    pages: [
      { id: "practice", title: "Practice" },
      { id: "projects", title: "Projects" }
    ],
    databases: [
      {
        source: { kind: "page", pageId: "practice" },
        database: {
          title: "Daily Practice",
          view: "checklist",
          properties: [{ id: "name", name: "Task", type: "title" }],
          rows: [{ id: "done", values: { name: "Already Done" }, checklistChecked: true }]
        }
      },
      {
        source: { kind: "page", pageId: "projects" },
        database: {
          title: "Projects",
          view: "table",
          properties: [{ id: "name", name: "Project", type: "title" }],
          rows: [{ id: "site", values: { name: "Website" } }]
        }
      }
    ]
  });
  const checklistRef = ref("practice");
  const tableRef = ref("projects");
  const proposal = operations.normalizeProposal({
    operations: [
      {
        type: "set-database-checklist-state",
        databaseRef: checklistRef,
        rowId: "done",
        checked: true
      },
      {
        type: "set-database-checklist-state",
        databaseRef: tableRef,
        rowId: "site",
        checked: true
      }
    ]
  }, catalog, {
    selections: [{ databaseRef: checklistRef }, { databaseRef: tableRef }]
  });

  assert.equal(proposal.operations.length, 0);
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("already complete")));
  assert.ok(proposal.rejectedOperations.some((entry) => entry.reason.includes("checklist database")));
});
