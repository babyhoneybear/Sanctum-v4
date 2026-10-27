const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../page-database.js'), 'utf8');
const fn = name => source.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'))[0];

function harness(kind = 'page', renderedWidths = [220, 108, 108]) {
  const properties = [{id:'name', type:'title'}, {id:'when', type:'text'}, {id:'details', type:'text'}];
  const database = {properties, columnWidths:{}};
  const surfaceEl = {querySelectorAll: () => properties.map((property, index) => ({
    dataset: {dbHeaderPropId:property.id},
    getBoundingClientRect: () => ({width:renderedWidths[index]})
  }))};
  let saved;
  const listeners = {};
  const context = vm.createContext({
    getVisibleTableProperties: db => db.properties,
    getPropertyById: (db, id) => db.properties.find(property => property.id === id),
    getCalendarContext: () => ({kind, surfaceEl}), getDatabaseForContext: () => database,
    document: {body:{classList:{add(){}, remove(){}}}, addEventListener:(type, cb) => {listeners[type] = cb;}},
    renderDatabaseSurface(){}, rerenderCalendarContext(){},
    saveDatabaseForContext: (_context, db) => {saved = JSON.parse(JSON.stringify(db));}
  });
  vm.runInContext('let activeColumnResize = null;', context);
  for (const name of ['getDefaultPropertyWidth', 'getResponsivePropertyMinWidth', 'getManualPropertyMinWidth',
    'getPageEditorColumnWidths', 'fitPageEditorColumnWidths', 'normalizeColumnWidths', 'setPropertyWidth', 'startColumnResize']) {
    vm.runInContext(fn(name), context);
  }
  context.safeParseObject = value => value;
  const start = source.indexOf('  document.addEventListener("mousemove", (event) => {\n    if (!activeColumnResize)');
  const end = source.indexOf('  document.addEventListener("click", (event) => {', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end), context);
  return {
    database,
    widths: (fitWidth = true, availableWidth = 436) => Array.from(context.getPageEditorColumnWidths(database, {fitWidth, availableWidth})),
    start: () => context.startColumnResize({dataset:{propId:'name'}}, {clientX:220}),
    move: delta => listeners.mousemove({clientX:220 + delta}),
    finish: () => {listeners.mouseup(); database.columnWidths = context.normalizeColumnWidths(saved.columnWidths, properties);}
  };
}

test('automatic full-page columns still fit the available space before resizing', () => {
  const h = harness();
  const fitted = h.widths();
  assert.ok(fitted.reduce((sum, width) => sum + width, 0) <= 436);
  assert.ok(fitted[0] >= 190 && fitted[0] < 340);
  assert.ok(fitted.slice(1).every(width => width >= 108 && width < 180));
  assert.deepEqual(h.widths(false), [340, 180, 180]);
});

test('full-page dragging starts at the displayed width and keeps neighboring columns steady', () => {
  const h = harness();
  h.start();
  h.move(120);
  assert.deepEqual(h.widths(), [340, 108, 108]);
  h.move(-20);
  assert.deepEqual(h.widths(), [200, 108, 108]);
  h.finish();
  assert.deepEqual(h.widths(), [200, 108, 108]);
  assert.deepEqual(h.widths(false), [200, 108, 108]);
});

test('manual widths survive narrower screens and honor minimum and maximum sizes', () => {
  const h = harness();
  h.start();
  h.move(1000);
  h.finish();
  assert.deepEqual(h.widths(true, 300), [640, 108, 108]);
  h.start();
  h.move(-1000);
  assert.deepEqual(h.widths(), [190, 108, 108]);
});

test('inline dragging continues to use stored canvas widths, independent of scaled screen geometry', () => {
  const h = harness('block', [170, 90, 90]);
  h.start();
  h.move(80);
  h.finish();
  assert.deepEqual(h.widths(false), [420, 180, 180]);
});

test('fitting may shrink automatic columns but never a manually sized property', () => {
  const h = harness();
  h.database.columnWidths.name = 400;
  assert.deepEqual(h.widths(true, 640), [400, 120, 120]);
  assert.deepEqual(h.widths(true, 400), [400, 108, 108]);
});
