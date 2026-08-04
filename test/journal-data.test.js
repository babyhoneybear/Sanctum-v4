const test = require("node:test");
const assert = require("node:assert/strict");
const {
  VERSION,
  DEFAULT_TEXT_SIZE,
  createJournal,
  normalizeElement,
  normalizeJournal,
  addPage,
  duplicatePage,
  deletePage,
  movePage,
  updatePage,
  updateElement
} = require("../journal-data.js");

test("new journal text uses the compact canvas-scale default", () => {
  const text = normalizeElement({ type: "text" });
  assert.equal(text.fontSize, DEFAULT_TEXT_SIZE);
  assert.equal(text.fontSize, 14);
  assert.equal(text.background, "");
  assert.equal(text.borderColor, "");
  assert.equal(text.borderWidth, 0);
});

test("creates a versioned journal with stable, unique page ids", () => {
  const journal = createJournal({ id: "journal-1", title: "Field Notes", pageCount: 4, now: 10 });
  assert.equal(journal.version, VERSION);
  assert.equal(journal.id, "journal-1");
  assert.equal(journal.pages.length, 4);
  assert.equal(new Set(journal.pages.map((page) => page.id)).size, 4);
  assert.equal(journal.cover.id, "journal-1-front-cover");
  assert.equal(journal.backCover.id, "journal-1-back-cover");
  assert.equal(journal.cover.elements[0].text, "Field Notes");
  assert.equal(journal.cover.initialized, true);
});

test("preserves editable cover canvases and does not recreate cleared decorations", () => {
  const journal = normalizeJournal({
    id: "cover-journal",
    title: "Decorated",
    cover: {
      id: "front",
      color: "#654321",
      initialized: true,
      elements: [{ id: "cover-photo", type: "image", src: "data:image/png;base64,abc" }]
    },
    backCover: {
      id: "back",
      color: "#123456",
      initialized: true,
      elements: []
    },
    pages: [{ id: "page-1", elements: [] }]
  });
  assert.equal(journal.cover.id, "front");
  assert.equal(journal.cover.color, "#654321");
  assert.equal(journal.cover.elements[0].id, "cover-photo");
  assert.equal(journal.backCover.id, "back");
  assert.deepEqual(journal.backCover.elements, []);
});

test("normalizes legacy entries without discarding their content", () => {
  const journal = normalizeJournal({
    title: "Legacy",
    entries: [{ id: "old-page", paper: "grid", elements: [{ id: "note", type: "text", text: "Keep me" }] }]
  }, { id: "journal-legacy" });
  assert.equal(journal.id, "journal-legacy");
  assert.equal(journal.pages[0].id, "old-page");
  assert.equal(journal.pages[0].elements[0].text, "Keep me");
});

test("adds, duplicates, deletes, and reorders pages without changing surviving ids", () => {
  let journal = createJournal({ pageCount: 2 });
  const firstId = journal.pages[0].id;
  const secondId = journal.pages[1].id;
  const added = addPage(journal, firstId, { title: "Inserted" });
  journal = added.journal;
  assert.deepEqual(journal.pages.map((page) => page.id), [firstId, added.page.id, secondId]);

  const duplicated = duplicatePage(journal, added.page.id);
  journal = duplicated.journal;
  assert.notEqual(duplicated.page.id, added.page.id);
  assert.equal(journal.pages[2].id, duplicated.page.id);

  journal = movePage(journal, secondId, 0);
  assert.equal(journal.pages[0].id, secondId);

  const deleted = deletePage(journal, added.page.id);
  assert.equal(deleted.removed.id, added.page.id);
  assert.ok(deleted.journal.pages.some((page) => page.id === firstId));
});

test("never deletes the final page", () => {
  const journal = createJournal({ pageCount: 1 });
  const result = deletePage(journal, journal.pages[0].id);
  assert.equal(result.removed, null);
  assert.equal(result.journal.pages.length, 1);
});

test("updates page settings and clamps element geometry on round trip", () => {
  let journal = createJournal({
    pageCount: 1,
    pages: [{
      id: "page-1",
      elements: [{
        id: "text-1",
        type: "text",
        text: "Original",
        x: 100,
        y: 100,
        w: 300,
        h: 120
      }]
    }]
  });
  journal = updatePage(journal, "page-1", { paper: "grid" });
  journal = updateElement(journal, "page-1", "text-1", { text: "Updated", x: 9999 });
  const restored = normalizeJournal(JSON.parse(JSON.stringify(journal)));
  assert.equal(restored.pages[0].paper, "grid");
  assert.equal(restored.pages[0].elements[0].text, "Updated");
  assert.equal(restored.pages[0].elements[0].x, 700);
});

test("normalizes richer scrapbook elements for future tool modes", () => {
  const journal = normalizeJournal({
    pages: [{
      id: "page-1",
      elements: [
        { id: "shape-1", type: "shape", shape: "ellipse", fill: "#abcdef", strokeWidth: 99 },
        { id: "sticker-1", type: "sticker", variant: "star", color: "#ffeeaa" },
        { id: "tape-1", type: "tape", pattern: "grid", opacity: 0.6 }
      ]
    }]
  });
  assert.equal(journal.pages[0].elements[0].shape, "ellipse");
  assert.equal(journal.pages[0].elements[0].strokeWidth, 16);
  assert.equal(journal.pages[0].elements[1].variant, "star");
  assert.equal(journal.pages[0].elements[2].pattern, "grid");
});

test("preserves shared image crop-shape and frame controls", () => {
  const journal = normalizeJournal({
    pages: [{
      id: "page-1",
      elements: [{
        id: "image-1",
        type: "image",
        src: "data:image/png;base64,abc",
        cropShape: "circle",
        frameStyle: "double"
      }]
    }]
  });
  const image = journal.pages[0].elements[0];
  assert.equal(image.cropShape, "circle");
  assert.equal(image.frameStyle, "double");
});
