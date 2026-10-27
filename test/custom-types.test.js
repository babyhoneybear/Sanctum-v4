const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const types = require('../custom-types');
const contextEngine = require('../context-engine');
const backup = require('../backup-data');
const memory = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const recipe = () => ({ name: 'Recipe', layout: 'board-canvas', icon: '🍲', sections: ['Ingredients', 'Method'], fields: [
  { label: 'Servings', type: 'text', defaultValue: '4' }, { label: 'Pairs with', type: 'relation' }
] });

test('type identities survive rename, archive, restore and a new library reader', () => {
  const storage = memory();
  const first = types.save(recipe(), storage);
  const updated = types.save({ ...first, name: 'Family recipe', archived: true }, storage);
  assert.equal(updated.id, first.id);
  assert.equal(updated.fields[0].id, first.fields[0].id);
  assert.equal(updated.version, 2);
  assert.deepEqual(types.list({}, storage), []);
  assert.equal(types.label(first.id, storage), 'Family recipe');
  assert.equal(types.get(first.id, storage).archived, true);
  types.save({ ...updated, archived: false }, storage);
  assert.equal(types.list({}, storage).length, 1);
});

test('invalid or conflicting type definitions leave the stored library unchanged', () => {
  const storage = memory();
  const original = types.save(recipe(), storage);
  const snapshot = storage.getItem(types.STORAGE_KEY);
  for (const input of [
    { ...recipe(), name: ' recipe ' }, { ...recipe(), name: '' }, { ...recipe(), layout: 'unknown' },
    { ...recipe(), fields: [{ label: 'A', type: 'text' }, { label: 'a', type: 'relation' }] },
    { ...recipe(), fields: [{ label: 'A', type: 'number' }] },
    { ...recipe(), fields: [original.fields[0], { ...original.fields[0], label: 'Other' }] }
  ]) assert.throws(() => types.save(input, storage));
  assert.equal(storage.getItem(types.STORAGE_KEY), snapshot);
  storage.setItem(types.STORAGE_KEY, '{invalid');
  assert.throws(() => types.save(recipe(), storage));
  assert.equal(storage.getItem(types.STORAGE_KEY), '{invalid');
});

test('page starters own independent values, links and blocks when their type changes', () => {
  const storage = memory();
  const type = types.save(recipe(), storage);
  const a = types.starter(type, 'soup');
  const b = types.starter(type, 'stew');
  a.props.properties[0].value = '6';
  a.props.properties[1].linkedPageIds.push('bread');
  a.blocks[2].containerBody = 'Tomatoes';
  types.save({ ...type, fields: [], sections: ['New section'] }, storage);
  assert.equal(b.props.properties[0].value, '4');
  assert.deepEqual(b.props.properties[1].linkedPageIds, []);
  assert.equal(a.blocks[2].containerBody, 'Tomatoes');
  assert.equal(a.props.customTypeVersion, 1);
  assert.equal(a.blocks[0].connectionSourcePageId, 'soup');
  assert.equal(b.blocks[0].connectionSourcePageId, 'stew');
  assert.equal(a.blocks[0].connectionPropertyId, a.props.properties[0].id);
  assert.equal(types.starter(types.get(type.id, storage), 'new').props.properties.length, 0);
});

test('document and infinite board starters use native structures and escape field headings', () => {
  const type = types.validate({ ...recipe(), fields: [{ label: '<img src=x onerror=alert(1)>', type: 'text' }] });
  const doc = types.starter(type, 'doc', 'document');
  assert.deepEqual(doc.document.sections.map(section => section.title), ['Ingredients', 'Method']);
  assert.equal(doc.document.sections[0].content, '');
  const board = types.starter(type, 'board', 'infinite-canvas');
  assert.equal(board.blocks[0].x, 1980);
  assert.equal(board.blocks[0].y, 768);
  assert.ok(!board.blocks[0].titleHTML.includes('<img'));
  const escaped = types.starter({ ...type, sections: ['<img src=x onerror=alert(1)>'] }, 'escaped');
  assert.ok(!escaped.blocks[1].containerTitle.includes('<img'));
});

test('custom type names, field values and page links reach assistant context', () => {
  const type = types.validate(recipe());
  const props = types.starter(type, 'soup').props;
  props.properties[1].linkedPageIds = ['bread'];
  const catalog = contextEngine.buildCatalog({
    customTypes: [type], pages: [{ id: 'soup', title: 'Tomato soup', category: type.id }, { id: 'bread', title: 'Bread', category: type.id }],
    pageProps: { soup: props }
  });
  const record = contextEngine.getRecord(catalog, contextEngine.pageRef('soup'));
  assert.equal(record.type, 'Recipe');
  assert.ok(record.properties.some(field => field.name === 'Servings' && field.value === '4'));
  assert.ok(record.relations.some(relation => relation.targetRef === contextEngine.pageRef('bread')));
});

test('backup round trip keeps type IDs, archived definitions and page field values', () => {
  const type = types.validate({ ...recipe(), archived: true });
  const props = types.starter(type, 'soup').props;
  props.properties[0].value = '8';
  const keys = Object.fromEntries(backup.STORAGE_FIELDS.map(([, key]) => [key, key]));
  const source = { customTypes: [type], pageProps: { soup: props } };
  const data = backup.buildBackupData({ keys, pages: [{ id: 'soup', category: type.id }], readJSON: (key, fallback) => source[key] ?? fallback });
  const target = {};
  backup.importBackupData(data, { keys, readJSON: (key, fallback) => target[key] ?? fallback, writeJSON: (key, value) => { target[key] = value; } });
  assert.deepEqual(target.customTypes, [type]);
  assert.equal(target.pageProps.soup.properties[0].value, '8');
  assert.equal(backup.hasBackupContent({ customTypes: [type] }), true);
});

test('invalid imported type definitions are rejected before any vault writes', () => {
  const type = types.validate(recipe());
  const adapter = { keys: {}, readJSON() {}, writeJSON() { assert.fail('must not write'); }, writeSettings() { assert.fail('must not write settings'); } };
  for (const customTypes of [{}, [null], [type, type], [{ ...type, fields: [{ type: 'unknown' }] }]]) {
    assert.throws(() => backup.importBackupData({ settings: {}, pages: [], customTypes }, adapter), /invalid custom type/);
  }
});

test('applying a custom type to an existing page keeps content and existing field values', () => {
  const storage = memory();
  const type = types.save(recipe(), storage);
  const data = { props: { existing: { properties: [{ ...types.properties(type)[0], value: '9' }, { id: 'manual', label: 'My note', type: 'text', value: 'Keep me' }] } } };
  const api = { ...types, get: id => types.get(id, storage) };
  const context = { window: {
    SanctumCustomTypes: api, STORAGE_KEYS: { pageProps: 'props' },
    readStorageJSON: key => structuredClone(data[key]), writeStorageJSON: (key, value) => { data[key] = value; return true; },
    readAllPageBlocks: () => ({ existing: [{ id: 'my-block', bodyHTML: 'My writing' }] }),
    writeAllPageBlocks: () => assert.fail('must not overwrite existing blocks')
  }, document: { getElementById: () => null } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../custom-types-ui.js'), 'utf8'), context);
  context.window.SanctumCustomTypesUI.applyProperties('existing', type.id, true);
  assert.equal(data.props.existing.properties[0].value, '9');
  assert.equal(data.props.existing.properties[1].value, 'Keep me');
  assert.equal(data.props.existing.properties[2].label, 'Pairs with');
  context.window.SanctumCustomTypesUI.applyStarter('existing', type.id, 'board-canvas');
  assert.equal(data.props.existing.properties.length, 3);
});

test('text properties save on focusout once even after their view is rebound', () => {
  const listeners = new Map(), saves = [];
  const strip = {
    addEventListener: (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    removeEventListener: (event, listener) => listeners.get(event)?.delete(listener)
  };
  const source = fs.readFileSync(path.join(__dirname, '../page-props.js'), 'utf8');
  const context = { savePropText: (...args) => saves.push(args) };
  vm.runInNewContext(source.slice(source.indexOf('function bindPropsStripEvents('), source.indexOf('// ── Mutations')), context);
  context.bindPropsStripEvents(strip, 'soup');
  context.bindPropsStripEvents(strip, 'soup');
  const field = { dataset: { propId: 'servings' }, textContent: ' 6 ' };
  for (const listener of listeners.get('focusout')) listener({ target: { closest: () => field } });
  assert.deepEqual(saves, [['soup', 'servings', '6']]);
});
