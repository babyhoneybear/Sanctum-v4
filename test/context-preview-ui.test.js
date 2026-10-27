const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../context-preview');

// A small event/DOM harness executes the production controller with a controlled clock.
function harness() {
  const listeners = new Map(), timers = new Map(), navigation = [];
  let nextTimer = 0, currentRange = null, document;
  class Node {
    constructor(tag = 'div', className = '') {
      this.tag = tag; this.className = className; this.children = []; this.dataset = {};
      this.attrs = {}; this.style = {}; this.events = {}; this.nodeType = 1;
      this.classList = { contains: name => this.className.split(' ').includes(name) };
    }
    get isConnected() { return this === document?.body || !!this.parent?.isConnected; }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        const tag = part.match(/^[\w-]+/)?.[0], cls = part.match(/\.([\w-]+)/)?.[1];
        const attr = part.match(/\[([^\]]+)\]/)?.[1];
        return (!tag || this.tag === tag) && (!cls || this.classList.contains(cls)) && (!attr || this.hasAttribute(attr));
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    contains(node) { return !!node && (node === this || this.children.some(child => child.contains(node))); }
    append(...nodes) { nodes.forEach(node => { node.parent = this; this.children.push(node); }); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
    replaceChildren() { this.children.forEach(node => { node.parent = null; }); this.children = []; }
    setAttribute(key, value) { this.attrs[key] = value; }
    hasAttribute(key) { return key in this.attrs || (key.startsWith('data-') && key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset); }
    removeAttribute(key) { delete this.attrs[key]; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(name, callback) { this.events[name] = callback; }
    getBoundingClientRect() { return { left: 10, top: 40, bottom: 60, width: 360, height: 220 }; }
    focus() { document.activeElement = this; emit('focusin', this); }
    close() { this.removeAttribute('open'); this.remove(); }
  }
  document = {
    body: new Node('body'), activeElement: null,
    addEventListener(name, callback) { listeners.set(name, callback); },
    createElement: tag => new Node(tag), querySelectorAll: selector => document.body.querySelectorAll(selector),
    querySelector: selector => document.body.querySelector(selector)
  };
  document.activeElement = document.body;
  const window = {
    SanctumContextPreview: model, userPages: [{ id: 'person', title: 'Elias', summary: 'A traveller.' }],
    readStorageJSON: (key, fallback) => fallback,
    writeStorageJSON: () => assert.fail('previews must not write'),
    getCurrentPageId: () => 'draft', openPage: id => navigation.push(id),
    innerWidth: 900, innerHeight: 700, addEventListener() {},
    getSelection: () => ({ rangeCount: currentRange ? 1 : 0, getRangeAt: () => currentRange,
      removeAllRanges() { currentRange = null; }, addRange(range) { currentRange = range; } }),
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../context-preview-ui.js'), 'utf8'), {
    window, document, MutationObserver: class { observe() {} }
  });
  function emit(name, target, values = {}) {
    const event = { target, button: 0, relatedTarget: null, preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; }, ...values };
    listeners.get(name)?.(event); return event;
  }
  function flush(delay) {
    for (const [id, timer] of [...timers]) if (timer.delay === delay && timers.delete(id)) timer.callback();
  }
  function link(className = 'inline-link') {
    const node = new Node('span', className); node.dataset.pageId = 'person'; document.body.append(node); return node;
  }
  return { Node, window, document, emit, flush, link, navigation,
    panel: () => document.querySelector('.context-preview'),
    setRange: range => { currentRange = range; }, getRange: () => currentRange };
}

test('hover and focus never open previews for links or connection chips', () => {
  const h = harness();
  for (const className of ['inline-link', 'pps-chip']) {
    const link = h.link(className); link.dataset.linkedPageId = 'person';
    h.emit('pointerover', link); h.flush(350); assert.equal(h.panel(), null);
    link.focus(); assert.equal(h.panel(), null);
    h.emit('pointerout', link); h.flush(220); assert.equal(h.panel(), null);
    h.emit('click', link); assert.ok(h.panel());
    h.emit('keydown', link, { key: 'Escape' }); assert.equal(h.panel(), null);
  }
  assert.deepEqual(h.navigation, []);
});

test('click pins a preview; keyboard Escape restores focus without reopening it', () => {
  const h = harness(), link = h.link();
  link.focus();
  assert.equal(h.panel(), null);
  const click = h.emit('click', link);
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  h.emit('pointerout', link); h.flush(220); assert.ok(h.panel());
  h.emit('keydown', link, { key: 'Enter' });
  assert.equal(h.document.activeElement.tag, 'button');
  h.emit('keydown', h.document.activeElement, { key: 'Escape' });
  assert.equal(h.document.activeElement, link); assert.equal(h.panel(), null);
});

test('mouse lookup preserves editor selection, Escape restores it, and resumed input dismisses stale previews', () => {
  const h = harness(), link = h.link(), editor = new h.Node();
  editor.isContentEditable = true; h.document.body.append(editor); editor.focus();
  const range = { commonAncestorContainer: editor, startContainer: editor, endContainer: editor, cloneRange() { return this; } };
  h.setRange(range);
  assert.equal(h.emit('mousedown', link).prevented, true);
  h.emit('click', link); h.setRange(null);
  h.emit('keydown', editor, { key: 'Escape' });
  assert.equal(h.getRange(), range); assert.equal(h.document.activeElement, editor);
  h.emit('click', link); h.emit('input', editor); assert.equal(h.panel(), null);
});

test('cards keep their click behavior without previews in either canvas mode', () => {
  const h = harness(), card = h.link('block-page-card');
  h.document.body.className = 'editing'; h.emit('pointerover', card); h.flush(350); assert.equal(h.panel(), null);
  h.document.body.className = ''; h.emit('pointerover', card); h.flush(350); assert.equal(h.panel(), null);
  assert.equal(h.emit('click', card).prevented, undefined);
});

test('keyboard activation explicitly opens a preview and moving focus away dismisses it', () => {
  const h = harness(), link = h.link();
  for (const key of ['Enter', ' ']) {
    link.focus(); assert.equal(h.panel(), null);
    h.emit('keydown', link, { key }); assert.ok(h.panel());
    h.document.body.focus(); assert.equal(h.panel(), null);
  }
});

test('explicit Open page closes a parent modal and rechecks deleted references before navigating', () => {
  const h = harness(), modal = new h.Node('dialog'), link = h.link();
  modal.setAttribute('open', ''); h.document.body.append(modal); link.remove(); modal.append(link);
  h.emit('click', link);
  h.panel().querySelectorAll('button').find(button => button.textContent === 'Open page').onclick();
  assert.equal(modal.isConnected, false); assert.deepEqual(h.navigation, ['person']);
  const another = h.link(); h.emit('click', another); h.window.userPages = [];
  h.panel().querySelectorAll('button').find(button => button.textContent === 'Open page').onclick();
  assert.deepEqual(h.navigation, ['person']);
  assert.equal(h.panel().querySelectorAll('button').some(button => button.textContent === 'Open page'), false);
});
