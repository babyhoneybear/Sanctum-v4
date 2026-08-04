const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const JournalData = require("../journal-data.js");

function createJournalHarness() {
  const listeners = new Map();
  const storage = {};
  const pageContent = {
    className: "",
    dataset: {},
    style: {},
    innerHTML: "",
    querySelector() { return null; }
  };
  const grid = { innerHTML: "", style: {} };
  const bodyClasses = new Set();
  const pageCanvas = {
    classList: {
      add() {},
      remove() {}
    }
  };
  let forwardLeaf = null;
  const document = {
    visibilityState: "visible",
    body: {
      classList: {
        contains: (name) => bodyClasses.has(name),
        add: (...names) => names.forEach((name) => bodyClasses.add(name)),
        remove: (...names) => names.forEach((name) => bodyClasses.delete(name)),
        toggle(name, enabled) {
          const next = enabled === undefined ? !bodyClasses.has(name) : !!enabled;
          if (next) bodyClasses.add(name);
          else bodyClasses.delete(name);
          return next;
        }
      }
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    getElementById(id) {
      return { pageContent, grid, pageCanvas }[id] || null;
    },
    querySelector(selector) {
      if (selector === ".sj-leaf.can-forward") return forwardLeaf;
      return null;
    },
    getSelection() { return null; }
  };
  const context = {
    console,
    document,
    CustomEvent: class CustomEvent {
      constructor(type) { this.type = type; }
    },
    CSS: { escape: (value) => String(value) },
    clearTimeout() {},
    setTimeout(handler) {
      handler();
      return 1;
    }
  };
  context.window = context;
  context.SanctumJournalData = JournalData;
  context.userDomains = [];
  context.userPages = [{ id: "journal-1", title: "Test journal", layout: "journal", parent: "home" }];
  context.STORAGE_KEYS = { journals: "sanctum_journals_v1" };
  context.readStorageJSON = (key, fallback) => storage[key] ?? fallback;
  context.writeStorageJSON = (key, value) => {
    storage[key] = JSON.parse(JSON.stringify(value));
    return true;
  };
  context.matchMedia = () => ({ matches: true });
  context.addEventListener = (type, handler) => {
    if (!listeners.has(`window:${type}`)) listeners.set(`window:${type}`, []);
    listeners.get(`window:${type}`).push(handler);
  };
  context.dispatchEvent = () => true;

  const source = fs.readFileSync(path.join(__dirname, "..", "journal.js"), "utf8");
  vm.runInNewContext(source, context, { filename: "journal.js" });

  return {
    context,
    listeners,
    pageContent,
    storage,
    bodyClasses,
    setForwardLeaf(leaf) { forwardLeaf = leaf; }
  };
}

function actionTarget(action) {
  return {
    dataset: { action },
    closest(selector) {
      if (selector === "[data-action]") return this;
      return null;
    }
  };
}

test("cover editing renders a real editable cover instead of blanking the journal", () => {
  const harness = createJournalHarness();
  harness.context.renderJournalPage("journal-1");
  assert.match(harness.pageContent.innerHTML, /data-book-state="front"/);

  const click = harness.listeners.get("click")[0];
  click({ target: actionTarget("edit-cover") });

  assert.match(harness.pageContent.innerHTML, /data-mode="edit"/);
  assert.match(harness.pageContent.innerHTML, /sj-cover-canvas/);
  assert.match(harness.pageContent.innerHTML, /data-editor-page/);
  assert.doesNotMatch(harness.pageContent.innerHTML, /sj-primary-toolbar/);
  assert.ok(harness.bodyClasses.has("journal-editing"));
});

test("the shared Text tool enters ghost placement before creating journal text", () => {
  const harness = createJournalHarness();
  harness.context.renderJournalPage("journal-1");
  const click = harness.listeners.get("click")[0];
  click({ target: actionTarget("edit-cover") });

  harness.context.SanctumJournalSurface.startPlacement("text");
  assert.match(harness.pageContent.innerHTML, /sj-placement-ghost is-text/);

  const editorPage = {
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 500, height: 700 })
  };
  const target = {
    closest(selector) {
      if (selector === "[data-editor-page]") return editorPage;
      return null;
    }
  };
  click({ target, clientX: 350, clientY: 450 });

  assert.doesNotMatch(harness.pageContent.innerHTML, /sj-placement-ghost/);
  assert.equal(harness.storage.sanctum_journals_v1["journal-1"].cover.elements.length, 3);
  assert.match(harness.pageContent.innerHTML, /sj-object-text[^>]*data-drag-object/);
  assert.doesNotMatch(harness.pageContent.innerHTML, /sj-object-move/);
  assert.match(harness.pageContent.innerHTML, /sj-object-rotate/);
  assert.match(harness.pageContent.innerHTML, /sj-object-resize/);
});

test("journal dock and handles follow the Canvas interaction layout", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "journal-scrapbook.css"), "utf8");
  assert.match(css, /body\.journal-editing \.edit-dock\s*\{[^}]*width:\s*56px;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.sj-object-rotate\s*\{[^}]*top:\s*-10px;[^}]*left:\s*-10px;/s);
  assert.match(css, /\.sj-object-resize\s*\{[^}]*right:\s*5px;[^}]*bottom:\s*5px;/s);
});

test("shared Canvas color controls update a selected journal text box", () => {
  const harness = createJournalHarness();
  harness.context.renderJournalPage("journal-1");
  const click = harness.listeners.get("click")[0];
  click({ target: actionTarget("edit-cover") });
  harness.context.SanctumJournalSurface.startPlacement("text");

  const editorPage = {
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 500, height: 700 })
  };
  click({
    target: { closest: (selector) => selector === "[data-editor-page]" ? editorPage : null },
    clientX: 350,
    clientY: 450
  });

  harness.context.SanctumJournalSurface.applySelectedColor("bg", "#23201C");
  harness.context.SanctumJournalSurface.applySelectedColor("border", "#BCB9B4");
  const element = harness.storage.sanctum_journals_v1["journal-1"].cover.elements.at(-1);
  assert.equal(element.background, "#23201C");
  assert.equal(element.borderColor, "#BCB9B4");
  assert.equal(element.borderWidth, 1);
});

test("a physical page tap opens that exact page without relying on a later click", () => {
  const harness = createJournalHarness();
  harness.context.renderJournalPage("journal-1");
  const click = harness.listeners.get("click")[0];
  click({ target: actionTarget("open-cover") });

  const journal = harness.storage.sanctum_journals_v1["journal-1"];
  const rightPageId = journal.pages[1].id;
  const classes = new Set(["sj-leaf", "can-forward"]);
  const leaf = {
    dataset: { offset: "0" },
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name)
    },
    style: {
      transform: "",
      setProperty() {},
      removeProperty() {}
    },
    closest() {
      return { getBoundingClientRect: () => ({ width: 800 }) };
    }
  };
  const hitTarget = {
    dataset: { skimSide: "right", pageId: rightPageId },
    setPointerCapture() {},
    closest(selector) {
      if (selector === ".sj-page-hit-target") return this;
      return null;
    }
  };
  harness.setForwardLeaf(leaf);

  const pointerDown = harness.listeners.get("pointerdown")[0];
  const pointerUp = harness.listeners.get("pointerup")[0];
  pointerDown({
    target: hitTarget,
    pointerId: 7,
    button: 0,
    clientX: 600,
    clientY: 300,
    preventDefault() {}
  });
  pointerUp({ pointerId: 7 });

  assert.match(harness.pageContent.innerHTML, /data-mode="edit"/);
  assert.match(harness.pageContent.innerHTML, new RegExp(`data-page-id="${rightPageId}"`));
});

test("an even page count ends on its final real spread instead of an empty spread", () => {
  const harness = createJournalHarness();
  harness.context.renderJournalPage("journal-1");
  const click = harness.listeners.get("click")[0];
  click({ target: actionTarget("open-cover") });
  click({ target: actionTarget("next") });
  click({ target: actionTarget("next") });

  assert.match(harness.pageContent.innerHTML, /5–6 \/ 6/);
  click({ target: actionTarget("next") });
  assert.match(harness.pageContent.innerHTML, /data-book-state="back"/);
});

test("reload restoration waits for the journal renderer readiness signal", () => {
  const sidebar = fs.readFileSync(path.join(__dirname, "..", "sidebar.js"), "utf8");
  const journal = fs.readFileSync(path.join(__dirname, "..", "journal.js"), "utf8");

  assert.match(sidebar, /addEventListener\("sanctum:journal-ready"/);
  assert.match(journal, /dispatchEvent\(new CustomEvent\("sanctum:journal-ready"\)\)/);
  assert.match(journal, /addEventListener\("pagehide"/);
});
