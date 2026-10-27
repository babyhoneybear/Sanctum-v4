const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function harness() {
  class Storage {
    constructor() { this.data = new Map(); }
    get length() { return this.data.size; }
    key(i) { return [...this.data.keys()][i] ?? null; }
    getItem(k) { return this.data.get(k) ?? null; }
    setItem(k, v) { this.data.set(k, String(v)); }
    removeItem(k) { this.data.delete(k); }
    clear() { this.data.clear(); }
  }
  const disk = new Map();
  const blobs = new Map();
  const writes = [];
  const timers = new Map();
  let timerId = 0;
  const events = [];
  let failPut = false;
  const db = {
    transaction(_stores, mode) {
      const commands = [];
      let aborted = false;
      const tx = {
        abort() { aborted = true; tx.onabort?.(); },
        objectStore(name) {
          const data = name === 'blobs' ? blobs : disk;
          return {
            getAllKeys: () => ({ result: [...data.keys()] }),
            getAll: () => ({ result: [...data.values()] }),
            clear: () => commands.push(() => data.clear()),
            put: (v, k) => {
              if (failPut) { failPut = false; throw new Error('Could not enqueue write'); }
              commands.push(() => data.set(k, v));
            },
            delete: (k) => commands.push(() => data.delete(k))
          };
        },
        finish(fail = false) {
          if (aborted) return;
          if (fail) {
            tx.error = new Error('Disk unavailable');
            tx.onabort?.();
          } else {
            commands.forEach((run) => run());
            tx.oncomplete?.();
          }
        }
      };
      if (mode === 'readonly') queueMicrotask(() => tx.finish());
      else writes.push(tx);
      return tx;
    }
  };
  const context = {
    Storage, console: { warn() {}, error() {} },
    indexedDB: { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess()); return request; } },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    dispatchEvent(event) { events.push(event); }
  };
  context.localStorage = new Storage();
  context.window = context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../storage.js'), 'utf8'), context);
  await context.SanctumStorageReady;
  return {
    disk, blobs, writes, timers, events, storage: context.localStorage, api: context.SanctumStorage,
    failNextPut() { failPut = true; },
    runTimer() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); }
  };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('a synchronous write error aborts an already queued clear', async () => {
  const h = await harness();
  h.disk.set('sanctum_original', 'keep until the replacement commits');
  h.storage.clear();
  h.storage.setItem('sanctum_replacement', 'new');
  h.failNextPut();
  assert.equal(await h.api.flush(), false);
  h.writes.shift().finish();
  assert.equal(h.disk.has('sanctum_original'), true);
  const retry = h.api.flush();
  h.writes.shift().finish();
  assert.equal(await retry, true);
  assert.deepEqual([...h.disk.entries()], [['sanctum_replacement', 'new']]);
});

test('failed automatic saves retain data, show failure, and retry to durable storage', async () => {
  const h = await harness();
  h.storage.setItem('sanctum_note', 'draft');
  h.runTimer();
  h.writes.shift().finish(true);
  await settle();
  assert.equal(h.disk.has('sanctum_note'), false);
  assert.equal(h.storage.getItem('sanctum_note'), 'draft');
  assert.equal(h.api.saveState, 'error');
  assert.equal(h.api.hasPendingChanges, true);
  assert.equal([...h.timers.values()][0].delay, 1000);
  h.runTimer();
  h.writes.shift().finish();
  await settle();
  assert.equal(h.disk.get('sanctum_note'), 'draft');
  assert.equal(h.api.saveState, 'saved');
  assert.equal(h.api.hasPendingChanges, false);
});

test('failed batches never overwrite newer writes or resurrect newer deletions', async () => {
  const h = await harness();
  h.storage.setItem('sanctum_a', 'old');
  h.storage.setItem('sanctum_b', 'remove me');
  const failed = h.api.flush();
  h.storage.setItem('sanctum_a', 'new');
  h.storage.removeItem('sanctum_b');
  h.writes.shift().finish(true);
  assert.equal(await failed, false);
  const retry = h.api.flush();
  h.writes.shift().finish();
  assert.equal(await retry, true);
  assert.equal(h.disk.get('sanctum_a'), 'new');
  assert.equal(h.disk.has('sanctum_b'), false);
});

test('failed deletes cannot remove a newer value', async () => {
  const h = await harness();
  h.disk.set('sanctum_a', 'original');
  h.storage.removeItem('sanctum_a');
  const failed = h.api.flush();
  h.storage.setItem('sanctum_a', 'replacement');
  h.writes.shift().finish(true);
  await failed;
  const retry = h.api.flush();
  h.writes.shift().finish();
  await retry;
  assert.equal(h.disk.get('sanctum_a'), 'replacement');
});

test('concurrent flush callers wait for edits arriving during the active commit', async () => {
  const h = await harness();
  h.storage.setItem('sanctum_a', 'first');
  const first = h.api.flush();
  h.storage.setItem('sanctum_a', 'second');
  assert.equal(h.api.flush(), first);
  assert.equal(h.writes.length, 1);
  h.writes.shift().finish();
  await settle();
  assert.equal(h.writes.length, 1);
  h.writes.shift().finish();
  assert.equal(await first, true);
  assert.equal(h.disk.get('sanctum_a'), 'second');
});

test('clear and subsequent writes commit together, including after a failed clear', async () => {
  const h = await harness();
  h.disk.set('sanctum_old', 'old');
  h.blobs.set('photo', 'old image');
  h.storage.clear();
  h.storage.setItem('sanctum_new', 'new');
  const failed = h.api.flush();
  h.storage.setItem('sanctum_later', 'later');
  h.writes.shift().finish(true);
  await failed;
  assert.equal(h.disk.get('sanctum_old'), 'old');
  const retry = h.api.flush();
  h.writes.shift().finish();
  await retry;
  assert.deepEqual([...h.disk.entries()].sort(), [['sanctum_later', 'later'], ['sanctum_new', 'new']]);
  assert.equal(h.blobs.size, 0);
});

test('a newer clear supersedes an in-flight failed batch', async () => {
  const h = await harness();
  h.storage.setItem('sanctum_old', 'obsolete');
  const failed = h.api.flush();
  h.storage.clear();
  h.storage.setItem('sanctum_new', 'keep');
  h.writes.shift().finish(true);
  await failed;
  const retry = h.api.flush();
  h.writes.shift().finish();
  await retry;
  assert.deepEqual([...h.disk.entries()], [['sanctum_new', 'keep']]);
});

test('successful clear does not discard edits made while it is committing', async () => {
  const h = await harness();
  h.storage.clear();
  const saving = h.api.flush();
  h.storage.setItem('sanctum_later', 'keep');
  h.writes.shift().finish();
  await settle();
  h.writes.shift().finish();
  await saving;
  assert.equal(h.disk.get('sanctum_later'), 'keep');
});
