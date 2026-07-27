const test = require("node:test");
const assert = require("node:assert/strict");
const transactions = require("../assistant-transactions.js");
const contentAdapters = require("../assistant-content-adapters.js");

function makeEnvironment() {
  let notes = [{
    id: "reaver-note",
    title: "Reaver",
    bodyHTML: "<p>Existing note.</p>",
    bodyText: "Existing note.",
    preview: "Existing note."
  }];
  let documents = {
    lore: {
      meta: {},
      sections: [{ id: "cast", title: "Cast", content: "<p>Existing cast.</p>" }]
    }
  };
  let blocks = { reaver: [{ id: "existing", type: "text", x: 0, y: 0, w: 240, h: 48 }] };
  const environment = {
    readNotes: () => structuredClone(notes),
    writeNotes: (next) => { notes = structuredClone(next); return true; },
    readDocuments: () => structuredClone(documents),
    writeDocuments: (next) => { documents = structuredClone(next); return true; },
    readPageBlocks: () => structuredClone(blocks),
    writePageBlocks: (next) => { blocks = structuredClone(next); return true; },
    hasPage: (pageId) => pageId === "reaver",
    notify: () => {},
    state: () => structuredClone({ notes, documents, blocks })
  };
  return environment;
}

function prepared(operations) {
  return {
    id: "prepared-content",
    proposalId: "proposal-content",
    status: "prepared",
    summary: "Record Reaver facts",
    operations
  };
}

test("applies and undoes visible note, document, and page content atomically", async () => {
  const environment = makeEnvironment();
  const before = environment.state();
  const adapters = contentAdapters.createAdapters(environment);
  const receipt = await transactions.executePreparedTransaction(prepared([
    {
      id: "note",
      type: "append-note-content",
      targetRef: "note:reaver-note",
      targetTitle: "Reaver",
      source: { kind: "note", noteId: "reaver-note" },
      content: "Height: 6′"
    },
    {
      id: "document",
      type: "append-document-section",
      targetRef: "document-section:lore:cast",
      targetTitle: "Cast",
      source: { kind: "document-section", pageId: "lore", sectionId: "cast" },
      content: "Reaver is 6′ tall."
    },
    {
      id: "page",
      type: "add-page-text-block",
      targetRef: "page:reaver",
      targetTitle: "Reaver",
      source: { kind: "page", pageId: "reaver" },
      content: "Height: 6′"
    }
  ]), adapters);

  const applied = environment.state();
  assert.match(applied.notes[0].bodyHTML, /Height: 6′/);
  assert.match(applied.documents.lore.sections[0].content, /Reaver is 6′ tall/);
  assert.equal(applied.blocks.reaver.length, 2);
  assert.equal(receipt.adapters.length, 3);

  const undone = await transactions.undoTransaction(receipt, adapters);
  assert.equal(undone.status, "undone");
  assert.deepEqual(environment.state(), before);
});

test("visible content undo refuses to overwrite a later page edit", async () => {
  const environment = makeEnvironment();
  const adapters = contentAdapters.createAdapters(environment);
  const receipt = await transactions.executePreparedTransaction(prepared([{
    id: "page",
    type: "add-page-text-block",
    targetRef: "page:reaver",
    targetTitle: "Reaver",
    source: { kind: "page", pageId: "reaver" },
    content: "Height: 6′"
  }]), adapters);

  const changed = environment.state();
  changed.blocks.reaver.push({ id: "later-user-edit", type: "text" });
  environment.writePageBlocks(changed.blocks);

  await assert.rejects(
    transactions.undoTransaction(receipt, adapters),
    /changed after this transaction/
  );
  assert.equal(environment.state().blocks.reaver.length, 3);
});

test("targeted replacements preserve surrounding content and undo exactly", async () => {
  const environment = makeEnvironment();
  const starting = environment.state();
  starting.notes[0].bodyHTML = "<p>short buzzed or spikey hair</p>";
  starting.documents.lore.sections[0].content = "<p>Reaver is five feet tall.</p>";
  starting.blocks.reaver[0].bodyHTML = "<div>Uses a curved knfie.</div>";
  environment.writeNotes(starting.notes);
  environment.writeDocuments(starting.documents);
  environment.writePageBlocks(starting.blocks);
  const before = environment.state();
  const adapters = contentAdapters.createAdapters(environment);
  const receipt = await transactions.executePreparedTransaction(prepared([
    {
      id: "note-fix",
      type: "replace-note-text",
      targetRef: "note:reaver-note",
      targetTitle: "Reaver",
      source: { kind: "note", noteId: "reaver-note" },
      matchText: "spikey",
      replacementText: "spiky"
    },
    {
      id: "document-fix",
      type: "replace-document-section-text",
      targetRef: "document-section:lore:cast",
      targetTitle: "Cast",
      source: { kind: "document-section", pageId: "lore", sectionId: "cast" },
      matchText: "five feet",
      replacementText: "six feet"
    },
    {
      id: "canvas-fix",
      type: "replace-canvas-block-text",
      targetRef: "canvas-block:reaver:existing",
      targetTitle: "Reaver detail",
      source: { kind: "canvas-block", pageId: "reaver", blockId: "existing" },
      matchText: "knfie",
      replacementText: "knife"
    }
  ]), adapters);

  const applied = environment.state();
  assert.match(applied.notes[0].bodyHTML, /spiky/);
  assert.match(applied.documents.lore.sections[0].content, /six feet/);
  assert.match(applied.blocks.reaver[0].bodyHTML, /knife/);

  await transactions.undoTransaction(receipt, adapters);
  assert.deepEqual(environment.state(), before);
});

test("note undo ignores unrelated metadata changes and preserves them", async () => {
  const environment = makeEnvironment();
  const adapters = contentAdapters.createAdapters(environment);
  const receipt = await transactions.executePreparedTransaction(prepared([{
    id: "note-fix",
    type: "replace-note-text",
    targetRef: "note:reaver-note",
    targetTitle: "Reaver",
    source: { kind: "note", noteId: "reaver-note" },
    matchText: "Existing note.",
    replacementText: "Corrected note."
  }]), adapters);

  const later = environment.state();
  later.notes[0].title = "Reaver reference";
  later.notes[0].updatedAt = Date.now() + 1000;
  later.notes[0].visibleTags = ["character"];
  environment.writeNotes(later.notes);

  await transactions.undoTransaction(receipt, adapters);
  const restored = environment.state().notes[0];
  assert.equal(restored.bodyText, "Existing note.");
  assert.equal(restored.title, "Reaver reference");
  assert.deepEqual(restored.visibleTags, ["character"]);
});
