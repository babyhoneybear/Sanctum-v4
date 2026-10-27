const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createService, sourceKey } = require('../chatgpt-database');
const nativeSource = fs.readFileSync(require.resolve('../page-database'), 'utf8');

function harness() {
  let pages = [
    { id: 'life', title: 'Life', parent: 'home', layout: 'board-canvas' },
    { id: 'story', title: 'Story', parent: 'home', layout: 'board-canvas' },
    { id: 'life-tracker', title: 'Tracker', parent: 'life', layout: 'sheet' },
    { id: 'story-tracker', title: 'Tracker', parent: 'story', layout: 'sheet' }
  ];
  const initial = () => ({ title: 'Tracker', view: 'table', properties: [
    { id: 'name', name: 'Name', type: 'title' }, { id: 'cost', name: 'Cost', type: 'number' }, { id: 'private', name: 'Private', type: 'text' }
  ], rows: [{ id: 'a', pageId: '', values: { name: 'One', cost: '12', private: 'Keep this' } }, { id: 'b', pageId: '', values: { name: 'Two', cost: '3', private: 'Keep too' } }] });
  const dbs = new Map([['page:life-tracker:', initial()], ['page:story-tracker:', initial()]]);
  let blocks = { life: [{ id: 'keep', type: 'text', bodyHTML: 'Do not change' }], story: [] };
  let history = [], saves = 0, fail = false, failRecovery = false, flushes = 0;
  const caps = {
    propertyKeys: ['id','name','type','headerColor','selectOptions','statusGroups','relationTarget','summaryConfig','formulaConfig','numberConfig'],
    propertyTypes: ['title','text','number','date','checkbox','select','status','relation','summary','formula'],
    headerColors: ['blue'], optionColors: ['blue','none'], statusColors: ['blue'], rowColors: ['blue'],
    summaryModes: ['count','sum','latest-date'], formulaTypes: ['sum','subtract'],
    formulaKeys: ['mode','simpleType','leftPropertyId','rightPropertyId','expression'],
    views: ['table','board','calendar','checklist'], filterModes: ['equals','contains','empty']
  };
  const clone = value => structuredClone(value);
  const env = {
    pages: () => clone(pages),
    databases: () => [...dbs.entries()].map(([key,database]) => ({ source: { kind: 'page', pageId: key.split(':')[1], blockId: '' }, database: clone(database) })),
    blocks: () => clone(blocks), writeBlocks: value => { blocks = clone(value); return true; },
    capabilities: () => caps, normalize: value => {
      const db = clone(value);
      for (const row of db.rows) for (const prop of db.properties) {
        if (prop.type === 'relation' && Array.isArray(row.values[prop.id])) row.values[prop.id] = row.values[prop.id].length ? JSON.stringify(row.values[prop.id]) : '';
      }
      return db;
    },
    save(source, value) { saves++; if (fail) { fail = false; return false; } dbs.set(sourceKey(source),clone(value)); return true; },
    createPage(config) { pages.push({ id: config.pageId, title: config.title, parent: config.parentId, layout: 'sheet' }); },
    createRows(source, rows) { pages.push(...rows.map(row => ({ id: row.pageId, title: row.values.name, parent: source.pageId }))); },
    deletePages(ids) { pages = pages.filter(page => !ids.includes(page.id)); for (const id of ids) dbs.delete(`page:${id}:`); return true; },
    makeView(source, database, view) { return { ...(view.before || {}), id: view.blockId, type: 'calendar', dbSourceKind: source.kind, dbSourcePageId: source.pageId, dbSourceBlockId: source.blockId || '', title: view.config.title, calendarView: view.config.view }; },
    pageContent: id => blocks[id] || [],
    readHistory: () => clone(history), writeHistory: value => { if (failRecovery) return false; history = clone(value); return true; },
    flush: async () => { flushes++; return true; }
  };
  const service = createService(env);
  return { service, env, caps, pages: () => pages, blocks: () => blocks, history: () => history, db: id => dbs.get(`page:${id}:`),
    saves: () => saves, fail: () => { fail = true; }, failRecovery: () => { failRecovery = true; }, flushes: () => flushes };
}
function update(h, extra = {}) {
  return { mode: 'update', target: { pageId: 'life-tracker' }, expectedVersion: h.service.inspect({ target: { pageId: 'life-tracker' } }).version, ...extra };
}

test('same-name targets ask for clarification; scope strictly selects one branch', () => {
  const h = harness();
  assert.throws(() => h.service.inspect({ target: { path: 'Tracker' } }), error => error.details.candidates.length === 2);
  assert.equal(h.service.inspect({ target: { path: 'Life → Tracker' } }).source.pageId, 'life-tracker');
  assert.equal(h.service.inspect({ target: { path: 'Tracker' }, scope: { pageId: 'life' } }).source.pageId, 'life-tracker');
  assert.throws(() => h.service.inspect({ target: { pageId: 'story-tracker' }, scope: { pageId: 'life' } }), /not found/);
  assert.equal(h.service.search({ scope: { pageId: 'life' } }).results.some(item => item.pageId === 'story-tracker'), false);
  assert.equal(h.saves(), 0);
});
test('visual tools resolve an exact scoped page and reject blocks outside it', async () => {
  const h = harness(); let captures = 0;
  h.env.layout = async pageId => ({ pageId, measured: true, blocks: [] });
  h.env.screenshot = async (pageId, options) => { captures++; return { pageId, region: options.region, image: { mimeType: 'image/jpeg', data: 'abcd' } }; };
  const api = createService(h.env);
  assert.equal((await api.layout({ target: { path: 'Life' } })).measured, true);
  await assert.rejects(api.screenshot({ target: { path: 'Tracker' } }), /ambiguous/);
  await assert.rejects(api.screenshot({ target: { pageId: 'story' }, scope: { pageId: 'life' } }), /not found/);
  await assert.rejects(api.screenshot({ target: { pageId: 'life', blockId: 'outside' } }), /not found/);
  const result = await api.screenshot({ target: { pageId: 'life', blockId: 'keep' }, region: { x: 0, y: 0, width: 500, height: 300 } });
  assert.equal(result.path, 'Home → Life'); assert.equal(captures, 1); assert.equal(h.saves(), 0);
});
test('failure to render a newly requested view rolls back the database creation', async () => {
  const h = harness();
  h.env.placeViews = async () => { throw new Error('The database still overlaps another block.'); };
  const api = createService(h.env);
  const plan = api.plan({ request: { mode: 'create', target: { pageId: 'life' }, title: 'Visible Meals', views: [{ page: { pageId: 'life' }, title: 'Meals', view: 'table' }] } });
  await assert.rejects(api.apply({ planId: plan.planId }), /overlaps/);
  assert.equal(h.pages().some(page => page.title === 'Visible Meals'), false);
  assert.equal(h.history()[0].status, 'rolled-back');
});
test('creates a populated database and linked view in the chosen location; repeated apply is idempotent and undo restores exactly', async () => {
  const h = harness(), originalBlocks = structuredClone(h.blocks());
  const plan = h.service.plan({ request: { mode: 'create', target: { path: 'Life' }, title: 'Meals',
    properties: [{ id: 'category', name: 'Category', type: 'select', selectOptions: [{ name: 'Lunch', color: 'blue' }] }],
    rows: [{ values: { name: 'Soup', category: 'Lunch' } }], views: [{ page: { pageId: 'life' }, title: 'Meals', view: 'table' }] } });
  assert.equal(h.saves(), 0);
  const receipt = await h.service.apply({ planId: plan.planId });
  assert.equal(receipt.destination, 'Home → Life → Meals');
  assert.equal(h.db(plan.source.pageId).rows[0].values.name, 'Soup');
  assert.equal(h.pages().find(page => page.id === plan.source.pageId).parent, 'life');
  assert.equal(h.history()[0].status, 'applied');
  assert.equal((await h.service.apply({ planId: plan.planId })).alreadyApplied, true);
  assert.equal(h.pages().filter(page => page.title === 'Meals').length, 1);
  await h.service.undo({ changeId: receipt.changeId });
  assert.equal(h.db(plan.source.pageId), undefined);
  assert.deepEqual(h.blocks(), originalBlocks);
  assert.equal(h.pages().some(page => page.title === 'Soup'), false);
});
test('patches preserve hidden rows, unrelated properties and the other same-name database', async () => {
  const h = harness(), beforeOther = structuredClone(h.db('story-tracker'));
  const plan = h.service.plan({ request: update(h, { properties: [{ id: 'cost', name: 'Price' }], rows: [{ id: 'a', values: { cost: '15' } }] }) });
  const receipt = await h.service.apply({ planId: plan.planId });
  assert.equal(h.db('life-tracker').rows[0].values.private, 'Keep this');
  assert.equal(h.db('life-tracker').rows[1].values.cost, '3');
  assert.deepEqual(h.db('story-tracker'), beforeOther);
  await h.service.undo({ changeId: receipt.changeId });
  assert.equal(h.db('life-tracker').rows[0].values.cost, '12');
});
test('a stale database, moved destination, or changed relation target blocks a prepared plan', async () => {
  const h = harness(); const plan = h.service.plan({ request: update(h, { rows: [{ id: 'a', values: { cost: '15' } }] }) });
  h.db('life-tracker').rows[1].values.private = 'Newer work';
  await assert.rejects(h.service.apply({ planId: plan.planId }), /changed/);
  assert.equal(h.saves(), 0);
  const second = h.service.plan({ request: update(h, { rows: [{ id: 'a', values: { cost: '20' } }] }) });
  h.pages().find(page => page.id === 'life-tracker').parent = 'story';
  await assert.rejects(h.service.apply({ planId: second.planId }), /moved/);
});
test('populated property removal asks once; recovery survives a new service instance', async () => {
  const h = harness(); const plan = h.service.plan({ request: update(h, { removePropertyIds: ['private'] }) });
  assert.equal(plan.losses[0].populatedRows, 2);
  await assert.rejects(h.service.apply({ planId: plan.planId }), /authorization/);
  assert.equal(h.saves(), 0);
  const receipt = await h.service.apply({ planId: plan.planId, allowDataLoss: true });
  assert.equal(h.db('life-tracker').rows[0].values.private, undefined);
  const reopened = createService(h.env);
  await reopened.undo({ changeId: receipt.changeId });
  assert.equal(h.db('life-tracker').rows[0].values.private, 'Keep this');
});
test('undo refuses to overwrite later database or newly created page content', async () => {
  const h = harness(); const plan = h.service.plan({ request: update(h, { rows: [{ id: 'a', values: { cost: '15' } }] }) });
  const receipt = await h.service.apply({ planId: plan.planId });
  h.db('life-tracker').rows[1].values.private = 'Later edit';
  await assert.rejects(h.service.undo({ changeId: receipt.changeId }), /newer work/);
  assert.equal(h.db('life-tracker').rows[1].values.private, 'Later edit');
});

test('undo preserves a newly added incoming connection to a generated database', async () => {
  const h = harness();
  const plan = h.service.plan({ request: { mode: 'create', target: { pageId: 'life' }, title: 'Meals', rows: [{ values: { name: 'Soup' } }] } });
  const receipt = await h.service.apply({ planId: plan.planId });
  h.db('life-tracker').properties.push({ id: 'meal', name: 'Meal', type: 'relation', relationTarget: plan.source });
  h.db('life-tracker').rows[0].values.meal = JSON.stringify([h.db(plan.source.pageId).rows[0].id]);
  await assert.rejects(h.service.undo({ changeId: receipt.changeId }), /newer work/);
  assert.ok(h.db(plan.source.pageId));
  assert.ok(h.db('life-tracker').rows[0].values.meal);
});
test('failed write rolls back; failure to persist a recovery copy prevents all writes', async () => {
  const h = harness(); const before = structuredClone(h.db('life-tracker'));
  const plan = h.service.plan({ request: update(h, { rows: [{ id: 'a', values: { cost: '15' } }] }) });
  h.fail(); await assert.rejects(h.service.apply({ planId: plan.planId }), /save/);
  assert.deepEqual(h.db('life-tracker'), before);
  assert.equal(h.history()[0].status, 'rolled-back');
  const second = h.service.plan({ request: update(h, { rows: [{ id: 'a', values: { cost: '20' } }] }) });
  const saves = h.saves(); h.failRecovery();
  await assert.rejects(h.service.apply({ planId: second.planId }), /recovery/);
  assert.equal(h.saves(), saves);
});
test('unsupported features, property types, colors, formulas and rollups fail before writes', () => {
  const h = harness();
  assert.throws(() => h.service.plan({ request: update(h, { templates: [] }) }), /templates/);
  assert.throws(() => h.service.plan({ request: update(h, { properties: [{ id: 'x', name: 'X', type: 'magic' }] }) }), /Unsupported property/);
  assert.throws(() => h.service.plan({ request: update(h, { properties: [{ id: 'cost', headerColor: 'made-up' }] }) }), /color/);
  assert.throws(() => h.service.plan({ request: update(h, { properties: [{ id: 'x', name: 'X', type: 'rollup', summaryConfig: { mode: 'median', relationPropertyId: 'x' } }] }) }), /rollup mode/);
  assert.throws(() => h.service.plan({ request: update(h, { properties: [{ id: 'x', name: 'X', type: 'formula', formulaConfig: { mode: 'simple', simpleType: 'subtract', leftPropertyId: 'missing' } }] }) }), /missing property|needs rightPropertyId/);
  assert.equal(h.saves(), 0);
});
test('native schema access exposes current colors, real rollup modes and formula examples', () => {
  const nativeBlock = nativeSource.slice(nativeSource.indexOf('  window.SanctumChatGPTDatabaseNative = {'), nativeSource.indexOf('  window.syncInlineDatabaseBlockTone ='));
  const context = { window: {}, PROPERTY_TYPES: [{ value: 'text' }], TAG_COLOR_OPTIONS: [{ value: 'sage-green' }],
    STATUS_COLOR_OPTIONS: [{ value: 'blue' }], ROW_COLOR_VALUES: { blue: '1 2 3' }, SUMMARY_TYPE_OPTIONS: [{ value: 'sum' }],
    FORMULA_SIMPLE_OPTIONS: [{ value: 'subtract' }], FORMULA_ADVANCED_FUNCTIONS: [{ token: 'if(true, 1, 0)' }],
    normalizeFormulaConfig: () => ({ mode: 'simple' }), normalizeDatabase: value => value, getManualPropertyMinWidth: () => 100 };
  vm.runInNewContext(nativeBlock, context);
  const caps = context.window.SanctumChatGPTDatabaseNative.capabilities();
  assert.equal(caps.optionColors[0], 'sage-green');
  assert.equal(caps.summaryModes[0], 'sum');
  assert.equal(caps.examples.rollup.summaryConfig.mode, 'sum');
});

test('relations and native rollups use exact sources, synchronize reverse links, and undo both databases', async () => {
  const h = harness();
  h.db('life-tracker').properties.push({ id: 'link', name: 'Link', type: 'relation', relationTarget: { kind: 'page', pageId: 'story-tracker', blockId: '' } });
  h.db('story-tracker').properties.push({ id: 'back', name: 'Back', type: 'relation', relationTarget: { kind: 'page', pageId: 'life-tracker', blockId: '' } });
  const plan = h.service.plan({ request: update(h, {
    properties: [{ id: 'total', name: 'Total', type: 'rollup', summaryConfig: { relationPropertyId: 'link', mode: 'sum', targetPropertyId: 'cost' } }],
    rows: [{ id: 'a', values: { link: ['b'] } }]
  }) });
  assert.equal(plan.properties.find(prop => prop.id === 'total').type, 'summary');
  const receipt = await h.service.apply({ planId: plan.planId });
  assert.equal(h.db('life-tracker').rows[0].values.link, '["b"]');
  assert.equal(h.db('story-tracker').rows[1].values.back, '["a"]');
  await h.service.undo({ changeId: receipt.changeId });
  assert.equal(h.db('life-tracker').rows[0].values.link, undefined);
  assert.equal(h.db('story-tracker').rows[1].values.back, undefined);
});

test('removing a populated Link clears reverse connections and preserves them in recovery', async () => {
  const h = harness();
  h.db('life-tracker').properties.push({ id: 'link', name: 'Link', type: 'relation', relationTarget: { kind: 'page', pageId: 'story-tracker', blockId: '' } });
  h.db('story-tracker').properties.push({ id: 'back', name: 'Back', type: 'relation', relationTarget: { kind: 'page', pageId: 'life-tracker', blockId: '' } });
  h.db('life-tracker').rows[0].values.link = '["b"]';
  h.db('story-tracker').rows[1].values.back = '["a"]';
  const plan = h.service.plan({ request: update(h, { removePropertyIds: ['link'] }) });
  const receipt = await h.service.apply({ planId: plan.planId, allowDataLoss: true });
  assert.equal(h.db('story-tracker').rows[1].values.back, '');
  await h.service.undo({ changeId: receipt.changeId });
  assert.equal(h.db('story-tracker').rows[1].values.back, '["a"]');
});

test('a changed linked database blocks new relations even when it has no reverse Link', async () => {
  const h = harness();
  const plan = h.service.plan({ request: update(h, {
    properties: [{ id: 'link', name: 'Link', type: 'relation', relationTarget: { kind: 'page', pageId: 'story-tracker', blockId: '' } }],
    rows: [{ id: 'a', values: { link: ['b'] } }]
  }) });
  h.db('story-tracker').rows.pop();
  await assert.rejects(h.service.apply({ planId: plan.planId }), /changed/);
  assert.equal(h.saves(), 0);
});
