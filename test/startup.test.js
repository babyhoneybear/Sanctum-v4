const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const startup = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(version) {
  const preloads = [], scripts = [], events = [], alerts = [];
  let resolveStorage, rejectStorage;
  const context = {
    SANCTUM_ASSET_VERSION: version,
    SanctumStorageReady: new Promise((resolve, reject) => {
      resolveStorage = resolve;
      rejectStorage = reject;
    }),
    document: {
      createElement: tag => ({ tag }),
      head: { appendChild: link => preloads.push(link) },
      body: { appendChild: script => scripts.push(script) }
    },
    dispatchEvent: event => events.push(event.type),
    CustomEvent: class { constructor(type) { this.type = type; } },
    console: { error() {} },
    alert: message => alerts.push(message)
  };
  context.window = context;
  vm.runInNewContext(startup, context);
  return { preloads, scripts, events, alerts, resolveStorage, rejectStorage };
}

test('startup preloads every script while storage opens, then executes in dependency order', async () => {
  const h = harness();
  assert.ok(h.preloads.length > 1);
  assert.ok(h.preloads.every(link => link.rel === 'preload' && link.as === 'script'));
  assert.equal(h.scripts.length, 0, 'no application code runs before storage is ready');
  h.resolveStorage();
  await tick();
  for (let i = 0; i < h.preloads.length; i++) {
    assert.equal(h.scripts.length, i + 1, 'later scripts must wait for their dependencies');
    assert.equal(h.scripts[i].src, h.preloads[i].href, 'execute the same URL that was prefetched');
    assert.deepEqual(h.events, []);
    h.scripts[i].onload();
    await tick();
  }
  assert.deepEqual(h.events, ['sanctum:scripts-ready']);
  assert.deepEqual(h.alerts, []);
});

test('reloads reuse stable asset URLs and explicit versions apply to both fetch and execution', async () => {
  assert.deepEqual(harness().preloads, harness().preloads);
  assert.ok(harness().preloads.every(link => !link.href.includes('?')));
  const h = harness('release 2');
  assert.ok(h.preloads.every(link => link.href.endsWith('?v=release%202')));
  h.resolveStorage();
  await tick();
  assert.equal(h.scripts[0].src, h.preloads[0].href);
});

test('a storage failure never executes prefetched application code', async () => {
  const h = harness();
  h.rejectStorage(Object.assign(new Error('blocked'), { code: 'SANCTUM_STORAGE_BLOCKED' }));
  await tick();
  assert.equal(h.scripts.length, 0);
  assert.deepEqual(h.events, []);
  assert.match(h.alerts[0], /another Sanctum tab/);
});

test('an asset failure stops dependent scripts and reports a load error without blaming the vault', async () => {
  const h = harness();
  h.resolveStorage();
  await tick();
  h.scripts[0].onerror();
  await tick();
  assert.equal(h.scripts.length, 1);
  assert.deepEqual(h.events, []);
  assert.match(h.alerts[0], /could not load an application file/);
});
