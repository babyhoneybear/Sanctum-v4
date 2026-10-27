const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
  const nodes = {
    pageIconInput: { value: '', dataset: {} },
    pageIconScale: { value: '100' },
    pageIconOverlay: {
      open: false, dataset: {}, classList: { add() {}, remove() {} },
      querySelector() { return {}; }, setAttribute() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    }
  };
  const owner = { isConnected: true, focus() {} };
  const calls = [];
  const context = vm.createContext({
    window: {}, document: { activeElement: owner, getElementById: id => nodes[id] },
    normalizeIconImageScale: value => value || 1,
    refreshPageIconPickerPreview() {}, requestAnimationFrame() {},
    getPageIconPickerScale: () => Number(nodes.pageIconScale.value) / 100,
    getUIState: () => ({ openOverlay: 'owner-form' }),
    setUIState: value => calls.push(['state', value]),
    alert: message => calls.push(['alert', message]),
    Event: class { constructor(type) { this.type = type; } },
    userDomains: [], userPages: [{ id: 'page', icon: '🐉', iconScale: 1.5 }],
    applyPageIconEverywhere: (...args) => { calls.push(['page', ...args]); return true; },
    saveCurrentPageBlocks: () => calls.push(['save'])
  });
  const source = fs.readFileSync(path.join(__dirname, '../app-core.js'), 'utf8');
  vm.runInContext('let iconPickerPageId=null, iconPickerSaveHandler=null, iconPickerOpener=null;', context);
  for (const name of ['openIconPicker', 'openIconPickerForInput', 'openPageIconPicker', 'closePageIconPicker', 'savePageIconPickerSelection']) {
    vm.runInContext(source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'))[0], context);
  }
  return { context, nodes, calls };
}

test('shared picker applies a complete symbol to the owning draft only on Save', () => {
  const { context, nodes, calls } = harness();
  const events = [];
  const input = { id: 'bbIcon', value: '✎', dataset: {}, isConnected: true,
    removeAttribute() {}, dispatchEvent: event => events.push(event.type) };
  context.openIconPickerForInput(input);
  nodes.pageIconInput.value = 'symbol:book-open-check';
  context.closePageIconPicker();
  assert.equal(input.value, '✎');
  assert.deepEqual(events, []);
  context.openIconPickerForInput(input);
  nodes.pageIconInput.value = 'symbol:book-open-check';
  context.savePageIconPickerSelection();
  assert.equal(input.value, 'symbol:book-open-check');
  assert.deepEqual(events, ['input', 'change']);
  assert.equal(nodes.pageIconOverlay.open, false);
  assert.deepEqual(calls, [], 'owner form is neither saved nor closed');
});

test('removing an icon clears both current value and image fallback in page details', () => {
  const { context, nodes } = harness();
  const input = { id: 'pageDetailsIcon', value: '', dataset: { currentIcon: 'data:image/png;base64,abc' },
    isConnected: true, removeAttribute() {}, dispatchEvent() {} };
  context.openIconPickerForInput(input);
  nodes.pageIconInput.dataset.clear = 'true';
  context.savePageIconPickerSelection();
  assert.equal(input.value, '/remove');
  assert.equal(input.dataset.currentIcon, '');
  context.openIconPickerForInput(input);
  assert.equal(nodes.pageIconInput.dataset.currentIcon, '');
});

test('page icon wrapper still persists the selected icon and image scale', () => {
  const { context, nodes, calls } = harness();
  context.openPageIconPicker('page');
  assert.equal(nodes.pageIconOverlay.dataset.allowImageScale, 'true');
  nodes.pageIconInput.value = 'symbol:code';
  context.savePageIconPickerSelection();
  assert.deepEqual(calls, [['page', 'page', 'symbol:code', 1.5], ['save']]);
});

test('a failed icon save keeps the picker open for correction', () => {
  const { context, nodes, calls } = harness();
  context.openIconPicker({ value: '🐉', onSave: () => false });
  context.savePageIconPickerSelection();
  assert.equal(nodes.pageIconOverlay.open, true);
  assert.equal(calls[0][0], 'alert');
});
