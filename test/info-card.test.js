const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');

function harness() {
  const context = {
    PAGE_ACTIVITY_STORAGE_KEY: 'activity',
    userDomains: [],
    userPages: [
      { id: 'story', title: 'Beneath the Veins', parent: 'home' },
      { id: 'characters', title: 'Characters', parent: 'story' },
      { id: 'scenes', title: 'Scenes', parent: 'story' },
      { id: 'outside', title: 'Outside', parent: 'home' }
    ],
    getCurrentPageId: () => 'story',
    readStorageJSON: () => ({
      characters: { lastOpenedAt: '2026-09-19T15:00:00Z' },
      scenes: { lastOpenedAt: '2026-09-18T15:00:00Z' },
      outside: { lastOpenedAt: '2026-09-19T16:00:00Z' }
    })
  };
  context.window = context;
  vm.createContext(context);
  // Load real top-level canvas functions without starting the application's UI.
  for (const match of source.matchAll(/^function \w+\([^]*?^\}/gm)) {
    vm.runInContext(match[0], context);
  }
  return context;
}

function infoCard() {
  const node = () => ({
    textContent: '', innerHTML: '', hidden: false, dataset: {},
    classList: { toggle() {} }, querySelectorAll: () => []
  });
  const refs = {
    '.data-callout-icon': node(),
    '.data-callout-value': node(),
    '.data-callout-label': node(),
    '.data-callout-secondary-value': node()
  };
  refs['.data-callout-content'] = { querySelector: key => refs[key] || null };
  const shell = { ...node(), querySelector: key => refs[key] || null };
  return {
    refs, shell,
    block: { dataset: { type: 'data-callout' }, querySelector: key => key === '.data-callout-shell' ? shell : null }
  };
}

test('saving scope recency config renders the latest child and applies label and icon settings', () => {
  const app = harness();
  const { block, refs, shell } = infoCard();
  app.writeDataCalloutConfig(block, {
    sourceType: 'system', systemKey: 'scope-last-opened-items',
    systemTargetKind: 'current', systemFormat: '1',
    label: 'Last opened', labelPos: 'hidden', showIcon: false, showProjectImage: false
  });
  app.renderDataCalloutBlock(block);
  assert.match(refs['.data-callout-value'].innerHTML, /Characters/);
  assert.doesNotMatch(refs['.data-callout-value'].innerHTML, /Scenes|Outside/);
  assert.equal(refs['.data-callout-label'].textContent, 'Last opened');
  assert.equal(refs['.data-callout-icon'].hidden, true);
  assert.equal(shell.dataset.labelPos, 'hidden');
  assert.equal(block.dataset.dataCalloutSystemKey, 'scope-last-opened-items');
});

test('an unconfigured info card can render without interrupting page hydration', () => {
  const app = harness();
  const { block, refs } = infoCard();
  app.renderDataCalloutBlock(block);
  assert.equal(refs['.data-callout-value'].textContent, '—');
  assert.equal(refs['.data-callout-label'].textContent, 'Value');
});

test('turning item images off survives saving and reloading scope and domain recency cards', () => {
  const app = harness();
  app.getDataCalloutProjectImage = () => './assets/test-cover.png';
  for (const systemKey of ['scope-last-opened-items', 'domain-last-opened-projects']) {
    for (const systemFormat of ['1', '2', '3']) {
      const {block} = infoCard();
      const config = {sourceType:'system',systemKey,systemFormat,showProjectImage:true};
      app.writeDataCalloutConfig(block, config);
      const items = [{id:'characters',title:'Characters'}];
      assert.match(app.renderDataCalloutLastOpenedItems(items, app.readDataCalloutConfig(block)), /<img /);
      app.writeDataCalloutConfig(block, {...config,showProjectImage:false});
      const restored = {dataset:JSON.parse(JSON.stringify(block.dataset))};
      assert.equal(restored.dataset.dataCalloutShowProjectImage, 'false');
      assert.equal(app.readDataCalloutConfig(restored).showProjectImage, false);
      const html = app.renderDataCalloutLastOpenedItems(items, app.readDataCalloutConfig(restored));
      assert.doesNotMatch(html, /<img |data-callout-project-card-list/);
      assert.match(html, /Characters/);
      app.writeDataCalloutConfig(restored, {...app.readDataCalloutConfig(restored),showProjectImage:true});
      assert.match(app.renderDataCalloutLastOpenedItems(items, app.readDataCalloutConfig(restored)), /<img /);
    }
  }
});

test('item image normalization preserves explicit false values and defaults missing values on', () => {
  const app = harness();
  for(const value of [false, 0, 'false', '0', 'off']) assert.equal(app.normalizeDataCalloutShowProjectImage(value),false);
  for(const value of [undefined, null, '', true, 'true', 'on']) assert.equal(app.normalizeDataCalloutShowProjectImage(value),true);
});

test('a new live database card has its own shell and connection controls', () => {
  const html = harness().makeBlockHTML('live-database-card');
  assert.match(html, /class="live-database-card-shell"/);
  assert.match(html, /data-live-db-action="connect"/);
  assert.doesNotMatch(html, /class="block-body"/);
});

test('title-only recency never takes the two-column date layout', () => {
  const app = harness();
  const html = app.renderDataCalloutLastOpenedItems([{ id: 'characters', title: 'Characters' }], { systemFormat: '1', showDateTime: false, dateStyle: 'relative' });
  assert.match(html, /Characters/);
  assert.doesNotMatch(html, /relative-dates|<small>/);
});

test('recency titles and covers request a read-only row summary instead of property editors', () => {
  const app = harness();
  const requests = [];
  app.getDatabaseRowPeekData = (pageId, options) => {
    requests.push({pageId, options});
    return {title:'Current row title',coverSource:'cover.webp'};
  };
  const item = {id:'row-page',title:'Older registry title'};
  assert.equal(app.getDataCalloutItemTitle(item), 'Current row title');
  assert.equal(app.getDataCalloutProjectImage(item), 'cover.webp');
  assert.equal(requests.length, 2);
  for (const request of requests) assert.equal(request.options?.summaryOnly, true);
});

test('restoring padding does not measure or resize a detached saved block', () => {
  const app = harness();
  const block = { style: { width: '408px', height: '144px' } };
  app.applyBlockPaddingTone(block, '0px', { resize: false });
  assert.equal(block.style.width, '408px');
  assert.equal(block.style.height, '144px');
  assert.equal(block.style.padding, '0px');
});
