const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { normalizeDashboardTags, toggleDashboardTag, normalizeDashboardWidget, collectMoodImageBodies } = require('../dashboard-widgets');

test('tag chips toggle page tags case-insensitively without changing unrelated tags', () => {
  const original = ['Magic', 'Lore'];
  assert.deepEqual(toggleDashboardTag(original, '#magic'), ['Lore']);
  assert.deepEqual(toggleDashboardTag(original, ' Research '), ['Magic', 'Lore', 'Research']);
  assert.deepEqual(original, ['Magic', 'Lore']);
  assert.deepEqual(normalizeDashboardTags([' Magic ', '#magic', null, '', 'Lore']), ['Magic', 'Lore']);
});

test('mood tray takes only real image blocks, including images inside frames, and bounds work', () => {
  const blocks = [
    { type: 'text', bodyHTML: '<img src="not-an-image-block">' },
    { type: 'image', bodyHTML: '<img src="first">' },
    { type: 'container', containerItems: [{ type: 'image', bodyHTML: '<img src="nested">' }] },
    { type: 'image', bodyHTML: '<img src="third">' }
  ];
  assert.deepEqual(collectMoodImageBodies(blocks, 2), ['<img src="first">', '<img src="nested">']);
  blocks[1].bodyHTML = '<img src="replacement">';
  assert.equal(collectMoodImageBodies(blocks)[0], '<img src="replacement">', 'preview derives from current source, not a copied image list');
  assert.deepEqual(collectMoodImageBodies(null), []);
});

test('widget persistence retains the board identity and normalized tag choices', () => {
  const config = normalizeDashboardWidget({ title: 'Mood', targetPageId: 'board-1', suggestions: ['Magic', 'magic', 'Idea'] });
  assert.deepEqual(normalizeDashboardWidget(JSON.parse(JSON.stringify(config))), { title: 'Mood', targetPageId: 'board-1', suggestions: ['Magic', 'Idea'] });
});

test('relative recency uses calendar days across midnight and daylight saving, with no time-of-day label', () => {
  const source = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');
  const fn = source.match(/^function formatRelativeOpenedDate\([^]*?^\}/m)[0];
  const app = vm.createContext({});
  vm.runInContext(fn, app);
  const now = new Date(2026, 8, 19, 0, 5);
  assert.equal(app.formatRelativeOpenedDate(new Date(2026, 8, 19, 0, 1).getTime(), now), 'Today');
  assert.equal(app.formatRelativeOpenedDate(new Date(2026, 8, 18, 23, 59).getTime(), now), 'Yesterday');
  assert.equal(app.formatRelativeOpenedDate(new Date(2026, 8, 16, 12).getTime(), now), '3d ago');
  assert.equal(app.formatRelativeOpenedDate(new Date(2026, 2, 7, 23, 59).getTime(), new Date(2026, 2, 8, 23)), 'Yesterday');
  assert.equal(app.formatRelativeOpenedDate(0, now), 'Never');
});
