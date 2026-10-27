const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const JournalData = require("../journal-data.js");

function createJournalHarness({ deferredTimers = false } = {}) {
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
  let backLeaf = null;
  let editorPage = null;
  let mountedBook = null;
  const spreadCounter = { textContent: "1–2 / 6" };
  const timers = new Map();
  let timerId = 0;
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
      if (selector === ".sj-book-physical") return mountedBook;
      if (selector === "[data-spread-counter]") return spreadCounter;
      if (mountedBook && selector === ".sj-leaf.can-forward") return mountedBook.leaves.find(el=>el.classList.contains('can-forward')) || null;
      if (mountedBook && selector === ".sj-leaf.can-back") return mountedBook.leaves.find(el=>el.classList.contains('can-back')) || null;
      if (selector === ".sj-leaf.can-forward") return forwardLeaf;
      if (selector === ".sj-leaf.can-back") return backLeaf;
      if (selector === "[data-editor-page]") return editorPage;
      return null;
    },
    querySelectorAll() { return []; },
    getSelection() { return null; }
  };
  const context = {
    console,
    document,
    CustomEvent: class CustomEvent {
      constructor(type) { this.type = type; }
    },
    CSS: { escape: (value) => String(value) },
    clearTimeout(id) { timers.delete(id); },
    setTimeout(handler) {
      if (deferredTimers) {
        timers.set(++timerId, handler);
        return timerId;
      }
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
    setForwardLeaf(leaf) { forwardLeaf = leaf; },
    setBackLeaf(leaf) { backLeaf = leaf; },
    setEditorPage(page) { editorPage = page; },
    setMountedBook(book) { mountedBook = book; },
    spreadCounter,
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((handler) => handler());
    }
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

test("journal editor exposes writing tools and keeps Canvas-style object handles", () => {
  const h = createJournalHarness();
  h.context.renderJournalPage('journal-1');
  h.listeners.get('click')[0]({target:actionTarget('edit-cover')});
  for (const tool of ['pen','pencil','highlighter','eraser','lasso','text','photo','shape','note','sticker','tape']) {
    assert.ok(h.pageContent.innerHTML.includes(`data-tool="${tool}"`));
  }
  const css = fs.readFileSync(path.join(__dirname, "..", "journal-scrapbook.css"), "utf8");
  assert.match(css, /\.sj-object-rotate\s*\{[^}]*top:\s*-10px;[^}]*left:\s*-10px;/s);
  assert.match(css, /\.sj-object-resize\s*\{[^}]*right:\s*5px;[^}]*bottom:\s*5px;/s);
});

function writingFixture() {
  const h=createJournalHarness();
  openTestBook(h);
  h.listeners.get('click')[0]({target:actionTarget('edit-visible')});
  const page={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1400}),querySelector:()=>null,setPointerCapture(){},releasePointerCapture(){}};
  h.setEditorPage(page);
  const target={closest:selector=>selector==='[data-editor-page]' ? page : null};
  const emit=(type,x,y,customTarget=target)=>h.listeners.get(type)[0]({type,clientX:x,clientY:y,pointerId:71,button:0,pressure:.6,target:customTarget,preventDefault(){},stopPropagation(){}});
  const tool=name=>h.listeners.get('click')[0]({target:{dataset:{tool:name},closest(selector){return selector==='[data-tool]'?this:null;}}});
  const action=(name,data={})=>{const target=actionTarget(name);Object.assign(target.dataset,data);h.listeners.get('click')[0]({target});};
  const change=(name,value,checked)=>h.listeners.get('change')[0]({target:{dataset:{action:name},value,checked}});
  const items=()=>h.storage.sanctum_journals_v1['journal-1'].pages[0].elements;
  const draw=(name,x,y,ex,ey)=>{tool(name);emit('pointerdown',x,y);emit('pointermove',(x+ex)/2,(y+ey)/2);emit('pointerup',ex,ey);};
  return {h,page,target,emit,tool,action,change,items,draw};
}

test('pen and highlighter strokes persist across normalization, navigation and undo/redo',()=>{
  const f=writingFixture();
  f.draw('pen',100,100,300,250);
  f.draw('highlighter',110,400,310,400);
  assert.deepEqual(f.items().map(e=>e.brush),['pen','highlighter']);
  assert.ok(f.items()[0].points.length>=3);
  f.action('undo');assert.equal(f.items().length,1);
  f.action('redo');assert.equal(f.items().length,2);
  f.action('skim');assert.match(f.h.pageContent.innerHTML,/sj-object-ink/);
  f.action('edit-visible');assert.match(f.h.pageContent.innerHTML,/sj-object-ink/);
  f.h.context.renderJournalPage('journal-1');f.action('open-cover');f.action('edit-visible');
  assert.match(f.h.pageContent.innerHTML,/sj-object-ink/);
});

test('cancelling ink adds no stroke and preserves the redo history',()=>{
  const f=writingFixture();f.draw('pencil',100,100,300,200);f.action('undo');
  f.tool('pen');f.emit('pointerdown',200,200);f.emit('pointermove',400,400);f.emit('pointercancel',400,400);
  assert.equal(f.items().length,0);f.action('redo');assert.equal(f.items().length,1);
});

test('stroke eraser honors highlights-only, fast sweeps, cancellation and undo',()=>{
  const f=writingFixture();f.draw('pen',100,200,300,200);f.draw('highlighter',100,300,300,300);
  f.tool('eraser');f.change('erase-highlights','',true);
  f.emit('pointerdown',200,100);f.emit('pointerup',200,400);
  assert.deepEqual(f.items().map(e=>e.brush),['pen']);
  f.action('undo');assert.equal(f.items().length,2);
  f.change('erase-highlights','',false);
  f.emit('pointerdown',200,100);f.emit('pointermove',200,400);f.emit('pointercancel',200,400);
  assert.equal(f.items().length,2);
  f.emit('pointerdown',200,100);f.emit('pointerup',200,400);assert.equal(f.items().length,0);
  f.action('undo');assert.equal(f.items().length,2);
});

test('lasso moves, resizes, duplicates, recolors and deletes complete selections with undo',()=>{
  const f=writingFixture();f.draw('pen',100,200,300,200);f.draw('pen',100,300,300,300);
  f.tool('lasso');f.action('lasso-rectangle');f.emit('pointerdown',50,150);f.emit('pointerup',350,400);
  assert.match(f.h.pageContent.innerHTML,/2 selected/);
  const original=f.items().map(e=>({...e}));
  const group={setPointerCapture(){},releasePointerCapture(){}};
  const target={closest:selector=>selector==='[data-group-move]'?group:null};
  f.emit('pointerdown',200,250,target);f.emit('pointermove',250,300,target);f.emit('pointerup',250,300,target);
  assert.equal(f.items()[0].x,original[0].x+50);assert.equal(f.items()[1].y,original[1].y+50);
  f.action('undo');assert.deepEqual(f.items(),original);
  const resizeTarget={closest:selector=>selector==='[data-group-move]'?group:selector==='[data-group-resize]'?{}:null};
  f.emit('pointerdown',304,336,resizeTarget);f.emit('pointermove',350,366,resizeTarget);f.emit('pointerup',350,366,resizeTarget);
  assert.ok(f.items()[0].w>original[0].w);f.action('undo');assert.deepEqual(f.items(),original);
  f.emit('pointerdown',200,250,target);f.emit('pointermove',250,300,target);f.emit('pointercancel',250,300,target);
  f.action('duplicate-element');assert.equal(f.items().length,4);
  f.change('selection-color','#77846b');assert.ok(f.items().slice(2).every(e=>e.color==='#77846b'));
  f.action('delete-element');assert.equal(f.items().length,2);f.action('undo');assert.equal(f.items().length,4);
});

test('study tape and text notes remain editable and save reveal state',()=>{
  const f=writingFixture();f.action('tape-study');f.action('add-tape',{color:'#d6b887'});
  const tape=f.items()[0];assert.equal(tape.study,true);assert.equal(tape.revealed,false);
  f.action('reveal-tape',{id:tape.id});assert.equal(f.items()[0].revealed,true);
  f.action('undo');assert.equal(f.items()[0].revealed,false);
  f.tool('note');assert.equal(f.items()[1].type,'text');assert.equal(f.items()[1].background,'#e8d9ad');
  assert.match(f.h.pageContent.innerHTML,/contenteditable="true"/);
});

test('copy and paste preserve complete lasso groups without double-handling Canvas shortcuts',()=>{
  const f=writingFixture();f.draw('pen',100,200,300,200);f.draw('highlighter',100,300,300,300);
  f.tool('lasso');f.action('lasso-rectangle');f.emit('pointerdown',50,150);f.emit('pointerup',350,400);
  f.action('copy-elements');f.action('clear-selection');f.action('paste-elements');
  assert.equal(f.items().length,4);assert.match(f.h.pageContent.innerHTML,/2 selected/);
  assert.equal(f.items()[2].x-f.items()[0].x,f.items()[3].x-f.items()[1].x);
  f.h.listeners.get('keydown')[0]({defaultPrevented:true,ctrlKey:true,key:'v'});
  assert.equal(f.items().length,4);
});

test('writing tools stay active on the next page and interrupted group movement rolls back',()=>{
  const f=writingFixture();f.tool('pencil');f.action('edit-next');
  assert.match(f.h.pageContent.innerHTML,/data-edit-tool="pencil"/);f.action('edit-previous');
  f.draw('pen',100,200,300,200);f.draw('pen',100,300,300,300);
  const original=f.items().map(e=>({...e}));
  f.tool('lasso');f.action('lasso-rectangle');f.emit('pointerdown',50,150);f.emit('pointerup',350,400);
  const group={setPointerCapture(){}};
  const target={closest:selector=>selector==='[data-group-move]'?group:null};
  f.emit('pointerdown',200,250,target);f.emit('pointermove',300,350,target);f.action('skim');
  assert.deepEqual(f.items(),original);
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

function openTestBook(harness) {
  harness.context.renderJournalPage('journal-1');
  harness.listeners.get('click')[0]({ target: actionTarget('open-cover') });
}

function pointerFixture(harness, { side = 'right', index = 1, direction = 1 } = {}) {
  const classes = new Set(['sj-leaf', direction > 0 ? 'can-forward' : 'can-back']);
  const book = { getBoundingClientRect: () => ({ width: 800 }) };
  const leaf = {
    dataset: { leafIndex: String(index) },
    classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
    style: { transform: '', setProperty() {}, removeProperty() {} },
    closest: () => book
  };
  const pages = harness.storage.sanctum_journals_v1['journal-1'].pages;
  const hit = {
    dataset: { skimSide: side, pageId: pages[side === 'left' ? 0 : 1].id },
    setPointerCapture() {},
    closest(selector) { return selector === '.sj-page-hit-target' ? this : selector === '.sj-book' ? book : null; }
  };
  if (direction > 0) harness.setForwardLeaf(leaf);
  else harness.setBackLeaf(leaf);
  const emit = (type, x, y = 250, timeStamp = 0) => harness.listeners.get(type)[0]({
    type, target: hit, pointerId: 42, button: 0, clientX: x, clientY: y, timeStamp, preventDefault() {}
  });
  return { leaf, hit, emit };
}

test('dragging from either half turns in the swipe direction', () => {
  for (const side of ['left', 'right']) {
    const h = createJournalHarness();
    openTestBook(h);
    const pointer = pointerFixture(h, { side });
    pointer.emit('pointerdown', 650);
    pointer.emit('pointermove', 400, 250, 600);
    assert.match(pointer.leaf.style.transform, /rotateY\(-108\.5deg\)/);
    pointer.emit('pointerup', 400, 250, 1000);
    assert.match(h.pageContent.innerHTML, /3–4 \/ 6/);
    assert.match(h.pageContent.innerHTML, /data-mode="skim"/);
  }
});

test('backward dragging returns to the preceding spread', () => {
  const h = createJournalHarness();
  openTestBook(h);
  h.listeners.get('click')[0]({ target: actionTarget('next') });
  const pointer = pointerFixture(h, { side: 'left', index: 1, direction: -1 });
  pointer.emit('pointerdown', 250);
  pointer.emit('pointermove', 550, 250, 600);
  pointer.emit('pointerup', 550, 250, 1000);
  assert.match(h.pageContent.innerHTML, /1–2 \/ 6/);
});

test('short slow drags and vertical gestures stay on the current spread', () => {
  for (const [x,y] of [[620,250],[650,400]]) {
    const h = createJournalHarness();
    openTestBook(h);
    const pointer = pointerFixture(h);
    pointer.emit('pointerdown',650);
    pointer.emit('pointermove',x,y,600);
    pointer.emit('pointerup',x,y,1000);
    assert.match(h.pageContent.innerHTML,/1–2 \/ 6/);
    assert.match(h.pageContent.innerHTML,/data-mode="skim"/);
  }
});

test('a short flick commits, but a paused short drag does not', () => {
  for (const [releaseTime, expected] of [[65, '3–4'],[300, '1–2']]) {
    const h = createJournalHarness();
    openTestBook(h);
    const pointer = pointerFixture(h);
    pointer.emit('pointerdown',650,250,0);
    pointer.emit('pointermove',600,250,50);
    pointer.emit('pointerup',600,250,releaseTime);
    assert.ok(h.pageContent.innerHTML.includes(`${expected} / 6`));
  }
});

test('pointer cancellation never turns a page or opens the editor', () => {
  for (const moved of [false,true]) {
    const h = createJournalHarness();
    openTestBook(h);
    const pointer = pointerFixture(h);
    pointer.emit('pointerdown',650);
    if (moved) pointer.emit('pointermove',300,250,600);
    pointer.emit('pointercancel',300,250,650);
    assert.match(h.pageContent.innerHTML,/1–2 \/ 6/);
    assert.match(h.pageContent.innerHTML,/data-mode="skim"/);
  }
});

test('swiping outward from the first and last spreads reaches the covers', () => {
  const h = createJournalHarness();
  openTestBook(h);
  let pointer = pointerFixture(h, { side:'left' });
  pointer.emit('pointerdown',250);
  pointer.emit('pointermove',550,250,600);
  pointer.emit('pointerup',550,250,1000);
  assert.match(h.pageContent.innerHTML,/data-book-state="front"/);
  openTestBook(h);
  h.setForwardLeaf(null);
  h.listeners.get('click')[0]({ target:actionTarget('next') });
  h.listeners.get('click')[0]({ target:actionTarget('next') });
  pointer = pointerFixture(h);
  h.setForwardLeaf(null);
  pointer.emit('pointerdown',650);
  pointer.emit('pointermove',300,250,600);
  pointer.emit('pointerup',300,250,1000);
  assert.match(h.pageContent.innerHTML,/data-book-state="back"/);
});

test('closing the journal during a turn cannot resurrect it', () => {
  const h = createJournalHarness({ deferredTimers:true });
  openTestBook(h);
  pointerFixture(h);
  h.listeners.get('click')[0]({ target:actionTarget('next') });
  h.context.closeJournalPage();
  h.flushTimers();
  assert.equal(h.pageContent.innerHTML,'');
});

test('entering the editor cancels an in-flight turn', () => {
  const h = createJournalHarness({ deferredTimers:true });
  openTestBook(h);
  pointerFixture(h);
  h.listeners.get('click')[0]({ target:actionTarget('next') });
  h.context.toggleJournalEditorMode();
  h.flushTimers();
  assert.match(h.pageContent.innerHTML,/data-mode="edit"/);
});

test('spread editing, single-page focus, and browsing retain the exact page', () => {
  const h = createJournalHarness();
  openTestBook(h);
  const click = h.listeners.get('click')[0];
  click({ target:actionTarget('next') });
  click({ target:actionTarget('edit-visible') });
  assert.match(h.pageContent.innerHTML,/Editing page 3 \/ 6/);
  assert.match(h.pageContent.innerHTML,/sj-editor-neighbor/);
  click({ target:actionTarget('edit-next') });
  assert.match(h.pageContent.innerHTML,/Editing page 4 \/ 6/);
  click({ target:actionTarget('focus-page') });
  assert.doesNotMatch(h.pageContent.innerHTML,/sj-editor-neighbor/);
  click({ target:actionTarget('skim') });
  assert.match(h.pageContent.innerHTML,/3–4 \/ 6/);
});

test('adding a page while browsing inserts after the current spread and shows it', () => {
  const h = createJournalHarness();
  openTestBook(h);
  const original = h.storage.sanctum_journals_v1['journal-1'].pages.map(p=>p.id);
  h.listeners.get('click')[0]({ target:actionTarget('add-page') });
  const pages = h.storage.sanctum_journals_v1['journal-1'].pages;
  assert.equal(pages.length,7);
  assert.equal(pages[1].id,original[1]);
  assert.equal(pages[3].id,original[2]);
  assert.match(h.pageContent.innerHTML,/3–4 \/ 7/);
});

test('clicking editable text keeps the mounted editor and caret intact', () => {
  const h = createJournalHarness();
  h.context.renderJournalPage('journal-1');
  h.listeners.get('click')[0]({ target:actionTarget('edit-cover') });
  const element = h.storage.sanctum_journals_v1['journal-1'].cover.elements[0];
  const rect = { left:0,top:0,width:500,height:700 };
  h.setEditorPage({ getBoundingClientRect:()=>rect });
  const object = { dataset:{elementId:element.id},classList:{add(){}},getBoundingClientRect:()=>rect };
  const target = { closest(selector) {
    if (selector === '[data-element-id]' || selector === '[data-drag-object]') return object;
    if (selector === '[contenteditable="true"]') return this;
    return null;
  } };
  const markup = h.pageContent.innerHTML;
  h.listeners.get('pointerdown')[0]({target,button:0,pointerId:8,clientX:100,clientY:100,preventDefault(){assert.fail('native text input must stay enabled');},stopPropagation(){}});
  h.listeners.get('pointerup')[0]({pointerId:8});
  assert.equal(h.pageContent.innerHTML,markup);
});

test('a notes refresh does not clear a mounted or loading journal', () => {
  const source = fs.readFileSync(path.join(__dirname,'..','smart-notes.js'),'utf8');
  const start = source.indexOf('  function clearSystemSurfaceIfNeeded() {');
  const end = source.indexOf('  function openNoteInNotes(',start);
  for (const surfaceType of ['journal','']) {
    const root = { innerHTML:'journal content',dataset:{surfaceType},style:{},classList:{remove(){}} };
    const context = {
      document: { body:{classList:{remove(){}}},getElementById:id=>id==='pageContent'?root:id==='grid'?{}:null },
      getAssistantCurrentPageId:()=> 'journal-1',
      getPagesMap:()=> ({'journal-1':{layout:'journal'}}),
      syncNotesTopbarSearch(){},closeNotesFilterMenu(){},
      renderPageRelatedNotes(){ root.innerHTML=''; }
    };
    vm.runInNewContext(source.slice(start,end)+'\nclearSystemSurfaceIfNeeded();',context);
    assert.equal(root.innerHTML,'journal content');
  }
});

function mountedBookFixture(harness, count = 4) {
  function classList(initial = []) {
    const names = new Set(initial);
    return {
      contains:name=>names.has(name), add:(...next)=>next.forEach(name=>names.add(name)),
      remove:(...next)=>next.forEach(name=>names.delete(name)),
      toggle(name,on) { if(on) names.add(name); else names.delete(name); }
    };
  }
  const targets = Object.fromEntries(['left','right'].map(side=>[side, {
    dataset:{},hidden:false,attributes:{},setAttribute(name,value){this.attributes[name]=value;}
  }]));
  const book = {
    leaves: [], classList:classList(),
    querySelectorAll:()=>book.leaves,
    querySelector(selector) {
      if (selector.includes('data-leaf-index')) return book.leaves.find(el=>el.dataset.leafIndex===selector.match(/"(\d+)"/)[1]) || null;
      return targets[selector.includes('"left"')?'left':'right'];
    },
    insertAdjacentHTML(position,markup) {
      const index = Number(markup.match(/data-leaf-index="(\d+)"/)[1]);
      book.leaves.push(makeLeaf(index));
    }
  };
  function makeLeaf(index) {
    return {
      dataset:{leafIndex:String(index)},classList:classList(index===1?['can-forward']:[]),
      style:{transform:'',setProperty(){},removeProperty(){}},
      querySelector(){return null;},
      remove(){book.leaves=book.leaves.filter(el=>el!==this);}
    };
  }
  book.leaves=Array.from({length:count},(_,index)=>makeLeaf(index));
  harness.setMountedBook(book);
  return {book,targets};
}

test('a flip moves both stacks before completion and never remounts the visible book', () => {
  const h=createJournalHarness({deferredTimers:true});
  openTestBook(h);
  const {book,targets}=mountedBookFixture(h);
  const nodes=[...book.leaves];
  const markup=h.pageContent.innerHTML;
  h.listeners.get('click')[0]({target:actionTarget('next')});
  // The stack fans at the outside edge; its binding must not slide sideways.
  assertBoundLeaves(nodes);
  assert.match(nodes[0].style.transform,/rotateY\(-167deg\)/);
  assert.match(nodes[1].style.transform,/rotateY\(-164deg\)/);
  assert.match(nodes[2].style.transform,/translateZ\(0px\) rotateY\(-16deg\) scaleX\(1\)/);
  const landing=nodes.map(el=>el.style.transform);
  h.flushTimers();
  assert.equal(h.pageContent.innerHTML,markup,'finishing must not replace the shell');
  assert.deepEqual(book.leaves,nodes,'the same physical sheets must survive the turn');
  assert.deepEqual(nodes.map(el=>el.style.transform),landing,'no geometry change at commit');
  assert.equal(h.spreadCounter.textContent,'3–4 / 6');
  assert.equal(targets.left.dataset.pageId,h.storage.sanctum_journals_v1['journal-1'].pages[2].id);
  assert.equal(nodes[1].classList.contains('can-back'),true);
  assert.equal(nodes[2].classList.contains('can-forward'),true);
  assert.equal(book.classList.contains('is-turning'),false);
  h.listeners.get('click')[0]({target:actionTarget('previous')});
  h.flushTimers();
  assert.equal(h.spreadCounter.textContent,'1–2 / 6');
  assert.deepEqual(book.leaves,nodes);
});

function assertBoundLeaves(leaves) {
  for (const leaf of leaves) {
    // Only thickness may offset the hinge. An X translation would detach it
    // halfway through a turn, exposing a stripe of the inside cover.
    const pose = leaf.style.transform.match(/^translateZ\(([-\d.]+)px\) rotateY\(([-\d.]+)deg\) scaleX\(([-\d.]+)\)$/);
    assert.ok(pose, 'leaves fan without lateral hinge displacement');
    assert.ok(Math.abs(Number(pose[1])) <= 6, 'binding stays within the paper stack thickness');
    assert.ok(Number(pose[3]) >= 1 && Number(pose[3]) < 1.2, 'outer fan remains bounded');
  }
}

test('dragging and cancelling moves and restores the complete stack together', () => {
  const h=createJournalHarness({deferredTimers:true});
  openTestBook(h);
  const pointer=pointerFixture(h);
  const {book}=mountedBookFixture(h);
  const markup=h.pageContent.innerHTML;
  pointer.emit('pointerdown',650);
  pointer.emit('pointermove',450,250,600);
  assertBoundLeaves(book.leaves);
  assert.match(book.leaves[0].style.transform,/rotateY\(-165\.5deg\)/);
  assert.match(book.leaves[1].style.transform,/rotateY\(-90deg\)/);
  assert.match(book.leaves[2].style.transform,/rotateY\(-14\.5deg\)/);
  pointer.emit('pointercancel',450,250,650);
  h.flushTimers();
  assertBoundLeaves(book.leaves);
  assert.match(book.leaves[0].style.transform,/translateZ\(0px\) rotateY\(-164deg\) scaleX\(1\)/);
  assert.match(book.leaves[1].style.transform,/rotateY\(-16deg\)/);
  assert.equal(h.spreadCounter.textContent,'1–2 / 6');
  assert.equal(h.pageContent.innerHTML,markup);
});

test('long notebooks extend and retire only the far stack edges during repeated turns', () => {
  const h=createJournalHarness({deferredTimers:true});
  h.storage.sanctum_journals_v1={'journal-1':JournalData.createJournal({id:'journal-1',pageCount:40})};
  openTestBook(h);
  const {book}=mountedBookFixture(h,7);
  const markup=h.pageContent.innerHTML;
  for(let spread=2;spread<=11;spread++) {
    const nextVisible=book.leaves.find(el=>Number(el.dataset.leafIndex)===spread-1);
    h.listeners.get('click')[0]({target:actionTarget('next')});
    h.flushTimers();
    assert.ok(book.leaves.includes(nextVisible),'the turning sheet must remain mounted');
    assert.ok(book.leaves.length<=12,'only the nearby fan should be mounted');
    assert.ok(book.leaves.every(el=>Number(el.dataset.leafIndex)>=spread-6 && Number(el.dataset.leafIndex)<=spread+5));
  }
  assert.equal(h.spreadCounter.textContent,'21–22 / 40');
  assert.equal(h.pageContent.innerHTML,markup);
  for(let spread=10;spread>=1;spread--) {
    h.listeners.get('click')[0]({target:actionTarget('previous')});
    h.flushTimers();
    assert.ok(book.leaves.some(el=>Number(el.dataset.leafIndex)===spread-1));
  }
  assert.equal(h.spreadCounter.textContent,'1–2 / 40');
  assert.equal(h.pageContent.innerHTML,markup);
});
