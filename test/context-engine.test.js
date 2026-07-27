const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../context-engine.js");

function makeSnapshot() {
  return {
    domains: [
      { id: "life", title: "Real Life" },
      { id: "world", title: "Beneath the Veins" }
    ],
    pages: [
      { id: "pantry", title: "Pantry", parent: "life", category: "inventory" },
      { id: "health", title: "Health", parent: "life", category: "health" },
      { id: "people", title: "People", parent: "life", category: "people" },
      { id: "real-mara", title: "Mara", parent: "people", category: "person" },
      { id: "lore", title: "Court Records", parent: "world", category: "worldbuilding" }
    ],
    pageProps: {
      "real-mara": {
        properties: [
          { id: "relationship", label: "Relationship", type: "text", value: "Friend from college" }
        ]
      }
    },
    blocksByPage: {
      people: [{
        id: "people-block",
        type: "text",
        titleHTML: "<strong>Important people</strong>",
        bodyHTML: "Birthday notes and favorite things"
      }]
    },
    documentsByPage: {
      lore: {
        meta: { updatedAt: "2026-07-22T12:00:00.000Z" },
        sections: [{
          id: "mara-profile",
          title: "Mara of the Ash Court",
          content: "<p>Mara commands the northern guard and distrusts the regent.</p>",
          meta: { status: "draft", location: "Ash Court" }
        }]
      }
    },
    notes: [
      {
        id: "ben-food",
        title: "Ben food preferences",
        bodyText: "Ben loves spicy pasta and hates mushrooms.",
        directPageIds: ["people"],
        contextPageId: "people",
        contextBreadcrumbTitles: ["Real Life", "People"],
        visibleTags: ["preferences"],
        createdAt: 1784808000000,
        updatedAt: 1784894400000
      },
      {
        id: "reaver-idea",
        title: "Reaver character idea",
        bodyText: "A scarred fighter with a swimmer's build and a curved knife.",
        directPageIds: ["lore"],
        contextPageId: "lore",
        contextBreadcrumbTitles: ["Beneath the Veins", "Court Records"],
        visibleTags: ["character"],
        createdAt: 1784808000000,
        updatedAt: 1784894400000
      }
    ],
    databases: [
      {
        source: { kind: "page", pageId: "pantry" },
        database: {
          title: "Household Inventory",
          properties: [
            { id: "name", name: "Item", type: "title" },
            { id: "quantity", name: "Quantity", type: "number" },
            { id: "location", name: "Location", type: "select" }
          ],
          rows: [{
            id: "tomato-sauce",
            title: "Tomato sauce",
            values: { name: "Tomato sauce", quantity: "2", location: "Kitchen cabinet" },
            updatedAt: "2026-07-24T18:00:00.000Z"
          }]
        }
      },
      {
        source: { kind: "page", pageId: "health" },
        database: {
          title: "Symptoms",
          properties: [
            { id: "name", name: "Symptom", type: "title" },
            { id: "date", name: "Date", type: "date" },
            { id: "severity", name: "Severity", type: "number" }
          ],
          rows: [{
            id: "migraine-july",
            title: "Migraine",
            values: { name: "Migraine", date: "2026-07-20", severity: "7" }
          }]
        }
      },
      {
        source: { kind: "page", pageId: "lore" },
        database: {
          title: "Characters",
          properties: [
            { id: "name", name: "Name", type: "title" },
            {
              id: "allies",
              name: "Allies",
              type: "relation",
              relationTarget: { kind: "page", pageId: "lore" }
            }
          ],
          rows: [
            { id: "caelan", title: "Caelan", values: { name: "Caelan", allies: "[\"fictional-mara\"]" } },
            { id: "fictional-mara", title: "Mara", values: { name: "Mara", allies: "[]" } }
          ]
        }
      }
    ]
  };
}

test("builds one catalog across notes, documents, canvas content, pages, and database rows", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const kinds = new Set(catalog.records.map((record) => record.kind));

  assert.ok(kinds.has("scope"));
  assert.ok(kinds.has("page"));
  assert.ok(kinds.has("canvas-block"));
  assert.ok(kinds.has("document-section"));
  assert.ok(kinds.has("note"));
  assert.ok(kinds.has("database"));
  assert.ok(kinds.has("database-row"));
  assert.equal(catalog.schemas.length, 3);
});

test("retrieves structured household facts without domain-specific code", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const matches = engine.search(catalog, "tomato sauce kitchen cabinet", { scopeId: "life" });
  const sauce = matches.find((record) => record.id === "tomato-sauce");

  assert.ok(sauce);
  assert.equal(sauce.scopeTitle, "Real Life");
  assert.equal(sauce.properties.find((property) => property.name === "Quantity").displayValue, "2");
  assert.equal(sauce.properties.find((property) => property.name === "Location").displayValue, "Kitchen cabinet");
});

test("scope filtering keeps same-name real and fictional records separate", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const lifeMatches = engine.search(catalog, "Mara", { scopeId: "life", limit: 20 });
  const worldMatches = engine.search(catalog, "Mara", { scopeId: "world", limit: 20 });

  assert.ok(lifeMatches.some((record) => record.ref === "page:real-mara"));
  assert.ok(lifeMatches.every((record) => record.scopeId === "life"));
  assert.ok(worldMatches.some((record) => record.id === "fictional-mara"));
  assert.ok(worldMatches.some((record) => record.ref === "document-section:lore:mara-profile"));
  assert.ok(worldMatches.every((record) => record.scopeId === "world"));
});

test("database relations resolve through generic record references", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const caelanRef = engine.databaseRowRef({ kind: "page", pageId: "lore" }, "caelan");
  const maraRef = engine.databaseRowRef({ kind: "page", pageId: "lore" }, "fictional-mara");
  const related = engine.getRelated(catalog, caelanRef, { includeIncoming: false });

  assert.ok(related.some((record) => record.ref === maraRef && record.relationKind === "Allies"));
});

test("checklist schemas and row completion state reach assistant context", () => {
  const catalog = engine.buildCatalog({
    pages: [{ id: "practice", title: "Practice" }],
    databases: [{
      source: { kind: "page", pageId: "practice" },
      database: {
        title: "Daily Practice",
        view: "checklist",
        properties: [{ id: "name", name: "Task", type: "title" }],
        rows: [
          { id: "hiragana", values: { name: "Hiragana Review" }, checklistChecked: false },
          { id: "duolingo", values: { name: "Duolingo" }, checklistChecked: true }
        ]
      }
    }]
  });
  const schema = catalog.schemas[0];
  const hiragana = catalog.records.find((record) => record.id === "hiragana");
  const duolingo = catalog.records.find((record) => record.id === "duolingo");

  assert.equal(engine.toAssistantSchema(schema).view, "checklist");
  assert.equal(engine.toAssistantRecord(hiragana).checklistState, "unchecked");
  assert.equal(engine.toAssistantRecord(duolingo).checklistState, "checked");
});

test("a database row and its generated row-page resolve as one entity", () => {
  const catalog = engine.buildCatalog({
    domains: [{ id: "workshop", title: "Workshop" }],
    pages: [
      { id: "goals", title: "Goals", parent: "workshop" },
      {
        id: "temporary-task-page",
        title: "Temporary Checklist Adapter Task",
        parent: "goals",
        containerType: "database-row",
        hiddenInSidebar: true
      }
    ],
    databases: [{
      source: { kind: "page", pageId: "goals" },
      database: {
        title: "Goals",
        view: "checklist",
        properties: [{ id: "name", name: "Name", type: "title" }],
        rows: [{
          id: "temporary-task",
          pageId: "temporary-task-page",
          values: { name: "Temporary Checklist Adapter Task" },
          checklistChecked: false
        }]
      }
    }]
  });

  const resolution = engine.resolveEntities(
    catalog,
    "Mark Temporary Checklist Adapter Task complete"
  );

  assert.equal(resolution.status, "resolved");
  assert.ok(resolution.candidates.some((candidate) => candidate.kind === "database-row"));
  assert.ok(resolution.candidates.some((candidate) => candidate.kind === "page"));
});

test("timeline queries use typed date properties in any domain", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const timeline = engine.getTimeline(catalog, {
    scopeId: "life",
    from: "2026-07-19",
    to: "2026-07-21T23:59:59Z"
  });

  assert.ok(timeline.some((entry) => entry.title === "Migraine" && entry.dateLabel === "Date"));
  assert.ok(timeline.every((entry) => entry.scopeId === "life"));
});

test("schema catalog exposes routing metadata without exposing row values", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const pantrySchema = catalog.schemas.find((schema) => schema.title === "Household Inventory");
  const assistantSchema = engine.toAssistantSchema(pantrySchema);

  assert.equal(assistantSchema.pageTitle, "Pantry");
  assert.equal(assistantSchema.pageType, "inventory");
  assert.equal(assistantSchema.scopeTitle, "Real Life");
  assert.equal(assistantSchema.rowCount, 1);
  assert.deepEqual(assistantSchema.properties.map((property) => property.name), ["Item", "Quantity", "Location"]);
  assert.equal(JSON.stringify(assistantSchema).includes("Tomato sauce"), false);
  assert.equal(JSON.stringify(assistantSchema).includes("Kitchen cabinet"), false);
});

test("route plans accept only existing databases and bounded row instructions", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const pantryRef = engine.databaseRef({ kind: "page", pageId: "pantry" });
  const plan = engine.normalizeRoutePlan(catalog, {
    selections: [
      { databaseRef: pantryRef, rowMode: "all", limit: 999 },
      { databaseRef: "database:page:not-real:", rowMode: "all" }
    ],
    include: { notes: false, currentPage: false }
  });

  assert.equal(plan.selections.length, 1);
  assert.equal(plan.selections[0].databaseRef, pantryRef);
  assert.equal(plan.selections[0].rowMode, "all");
  assert.equal(plan.selections[0].limit, 60);
  assert.equal(plan.include.notes, false);
  assert.equal(plan.include.currentPage, false);
});

test("database-first retrieval reads selected rows and excludes unrelated notes", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const pantryRef = engine.databaseRef({ kind: "page", pageId: "pantry" });
  const result = engine.retrieveByRoutePlan(catalog, {
    selections: [{ databaseRef: pantryRef, rowMode: "all", limit: 10 }],
    include: { notes: false, documents: false, canvas: false, pages: false, currentPage: false }
  }, {
    query: "What food do I have?",
    currentPageId: "people"
  });

  assert.deepEqual(result.schemas.map((schema) => schema.ref), [pantryRef]);
  assert.ok(result.records.some((record) => record.id === "tomato-sauce"));
  assert.equal(result.records.some((record) => record.kind === "note"), false);
  assert.equal(result.records.some((record) => record.id === "migraine-july"), false);
});

test("database-first retrieval follows existing row relations", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const charactersRef = engine.databaseRef({ kind: "page", pageId: "lore" });
  const result = engine.retrieveByRoutePlan(catalog, {
    selections: [{
      databaseRef: charactersRef,
      rowMode: "matching",
      rowQuery: "Caelan",
      limit: 5
    }],
    include: { currentPage: false }
  }, {
    query: "Who is Caelan allied with?"
  });

  assert.ok(result.records.some((record) => record.id === "caelan"));
  assert.ok(result.records.some((record) => record.id === "fictional-mara"));
  assert.equal(result.records.some((record) => record.id === "real-mara"), false);
});

test("strong named sources bypass type flags while unrelated supporting notes remain excluded", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const withoutNotes = engine.retrieveByRoutePlan(catalog, {
    selections: [],
    include: { notes: false, currentPage: false }
  }, { query: "I forgot to add that Reaver is six feet tall", currentPageId: "home" });
  const withNotes = engine.retrieveByRoutePlan(catalog, {
    selections: [],
    include: { notes: true, currentPage: false }
  }, { query: "Ben food preferences" });

  assert.equal(withoutNotes.entityResolution.status, "resolved");
  assert.ok(withoutNotes.records.some((record) => record.id === "reaver-idea"));
  assert.equal(withoutNotes.records.some((record) => record.id === "ben-food"), false);
  assert.ok(withNotes.records.some((record) => record.id === "ben-food"));
});

test("entity resolution finds Reaver from Home without router source flags", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const resolution = engine.resolveEntities(
    catalog,
    "I forgot to add Reaver is 6 feet tall",
    { currentPageId: "home" }
  );

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.candidates[0].ref, "note:reaver-idea");
  assert.ok(resolution.candidates[0].matchedTokens.includes("reaver"));
});

test("same-name entities in different scopes remain ambiguous", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const resolution = engine.resolveEntities(catalog, "Update Mara");

  assert.equal(resolution.status, "ambiguous");
  assert.ok(resolution.groups.some((group) => group.scopeId === "life"));
  assert.ok(resolution.groups.some((group) => group.scopeId === "world"));
  assert.equal(resolution.entityKey, "");
});

test("database alias fields resolve an entity without duplicating its identity", () => {
  const catalog = engine.buildCatalog({
    pages: [{ id: "characters", title: "Characters" }],
    databases: [{
      source: { kind: "page", pageId: "characters" },
      database: {
        title: "Characters",
        properties: [
          { id: "name", name: "Name", type: "title" },
          { id: "alias", name: "Alias", type: "text" }
        ],
        rows: [{
          id: "caelan",
          title: "Caelan",
          values: { name: "Caelan", alias: "CJ" }
        }]
      }
    }]
  });
  const resolution = engine.resolveEntities(catalog, "Update CJ's profile");

  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.candidates[0].kind, "database-row");
  assert.equal(resolution.candidates[0].title, "Caelan");
  assert.ok(resolution.allowedDatabaseRefs.includes(engine.databaseRef({ kind: "page", pageId: "characters" })));
});

test("local fallback routes by schema metadata when AI routing is unavailable", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const plan = engine.routeSchemasDeterministically(catalog, "Show symptom severity", {
    currentPageId: "health",
    preferScopeId: "life"
  });

  assert.equal(plan.selections[0].databaseRef, engine.databaseRef({ kind: "page", pageId: "health" }));
  assert.equal(plan.selections[0].rowMode, "matching");
});

test("local fallback does not send current-page content for unrelated conversation", () => {
  const catalog = engine.buildCatalog(makeSnapshot());
  const plan = engine.routeSchemasDeterministically(catalog, "Hello, how are you?", {
    currentPageId: "people",
    preferScopeId: "life"
  });
  const result = engine.retrieveByRoutePlan(catalog, plan, {
    query: "Hello, how are you?",
    currentPageId: "people"
  });

  assert.equal(plan.selections.length, 0);
  assert.equal(plan.include.currentPage, false);
  assert.equal(result.records.length, 0);
});
