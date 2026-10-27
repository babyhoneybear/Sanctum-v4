const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const token = 'a'.repeat(48);
const tick = () => new Promise(resolve => setImmediate(resolve));
const reply = (value = {}, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => value });
function timers() {
  let id = 0;
  const timeouts = new Map(), intervals = new Map();
  return { timeouts, intervals,
    setTimeout: (fn, ms) => { timeouts.set(++id, { fn, ms }); return id; }, clearTimeout: id => timeouts.delete(id),
    setInterval: (fn, ms) => { intervals.set(++id, { fn, ms }); return id; }, clearInterval: id => intervals.delete(id),
    async fire(ms) { for (const [id, item] of [...timeouts]) if (item.ms === ms) { timeouts.delete(id); item.fn(); } await tick(); },
    async beat() { for (const item of intervals.values()) await item.fn(); await tick(); },
  };
}
function storage(values = new Map()) {
  return { values, getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function localHarness(options = {}) {
  const clock = timers();
  const calls = [], events = {}, elements = new Map(), saved = options.storage || storage();
  const toolbar = { insertBefore(element) { elements.set(element.id, element); } };
  elements.set('assistantTopBtn', { parentElement: toolbar });
  const helper = { closed: false, opener: {}, close() { this.closed = true; }, location: { replace(url) { calls.push({ route: 'navigate', url }); } } };
  const window = {
    SanctumChatGPTDatabaseNative: {}, SanctumAssistantPageRegistryStore: {}, SanctumAssistantPageBlockStore: {},
    SanctumChatGPTDatabases: { createService: () => options.service || ({}) },
    SanctumChatGPTVisual: { createBrowser: () => ({}) },
    SanctumChatGPTPages: { createService: () => ({}) },
    addEventListener(name, handler) { events[name] = handler; },
    open() { calls.push({ route: 'open' }); return options.blockPopup ? null : helper; },
  };
  const fetch = async (url, init) => {
    const route = url.split('/').pop(); calls.push({ route, init });
    const custom = options.fetch?.(route, init, calls); if (custom !== undefined) return custom;
    if (route === 'poll') return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true }));
    const value = route === 'connect' ? { session: token, lease: 'first' } : route === 'resume' ? { lease: 'resumed' } : route === 'site-info' ? { url: 'https://sanctum.example' } : {};
    return reply(value, route === 'resume' && options.revoked ? 401 : 200);
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../chatgpt-connection'), 'utf8'), {
    window, document: { getElementById: id => elements.get(id), createElement: () => ({ style: {} }) },
    sessionStorage: saved, fetch, AbortController, URL, URLSearchParams, location: { port: '3005' },
    ...clock,
  });
  return { window, calls, events, saved, helper, elements, clock };
}
function siteHarness(options = {}) {
  const clock = timers();
  const calls = [], events = {}, saved = options.storage || storage(), elements = new Map();
  for (const id of ['status', 'detail', 'connect', 'disconnect', 'manual', 'code', 'port']) elements.set(id, { value: id === 'port' ? '3005' : '', disabled: false, hidden: false });
  const source = fs.readFileSync(require.resolve('../chatgpt-plugin/worker/connector.html'), 'utf8').match(/<script nonce="__NONCE__">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(source, {
    document: { getElementById: id => elements.get(id) }, sessionStorage: saved,
    location: { hash: options.hash || '', pathname: '/' }, history: { replaceState() {} }, URLSearchParams, AbortController,
    ...clock, crypto: require('node:crypto').webcrypto,
    window: { addEventListener(name, handler) { events[name] = handler; } },
    fetch: async (url, init) => {
      calls.push({ url, init });
      const custom = options.fetch?.(url, init, calls); if (custom !== undefined) return custom;
      if (url === '/bridge/poll') return new Promise(() => {});
      return reply(url.endsWith('/status') ? { connected: true } : url === '/bridge/connect' ? { bridgeId: JSON.parse(init.body).bridgeId } : {});
    },
  });
  return { calls, saved, elements, events, clock };
}
test('one click opens the helper before networking and supplies the code only in its fragment', async () => {
  const h = localHarness();
  await h.elements.get('chatgptShortcut').onclick();
  assert.deepEqual(h.calls.map(call => call.route), ['open', 'connect', 'poll', 'site-info', 'navigate']);
  const url = new URL(h.calls.at(-1).url);
  assert.equal(url.search, '');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('connection'), token);
  assert.equal(h.helper.opener, null);
  assert.equal(h.window.SanctumChatGPTConnection.connected, true);
  await h.window.SanctumChatGPTConnection.toggle();
});
test('blocked popups never enable vault access', async () => {
  const h = localHarness({ blockPopup: true });
  await h.window.SanctumChatGPTConnection.connect();
  assert.deepEqual(h.calls.map(call => call.route), ['open']);
  assert.equal(h.window.SanctumChatGPTConnection.connected, false);
});
test('a refresh resumes only this tab; disconnect and revoked sessions clear the saved code', async () => {
  const h = localHarness(); await h.window.SanctumChatGPTConnection.toggle();
  h.events.pagehide(); await tick();
  assert.equal(h.saved.values.size, 1);
  assert.equal(h.calls.at(-1).route, 'suspend');
  const reloaded = localHarness({ storage: h.saved }); await tick();
  assert.equal(reloaded.calls[0].route, 'resume');
  assert.equal(reloaded.calls.some(call => call.route === 'open' || call.route === 'connect'), false);
  assert.equal(reloaded.window.SanctumChatGPTConnection.connected, true);
  await reloaded.window.SanctumChatGPTConnection.toggle(); await tick();
  assert.equal(h.saved.values.size, 0);
  const revoked = localHarness({ storage: storage(new Map([['sanctum_chatgpt_tab_session_v1', token]])), revoked: true }); await tick();
  assert.equal(revoked.window.SanctumChatGPTConnection.connected, false);
  assert.equal(revoked.saved.values.size, 0);
});
test('the helper auto-connects only with a valid code and never sends it to the cloud', async () => {
  const plain = siteHarness(); await tick(); assert.equal(plain.calls.length, 0);
  const invalid = siteHarness({ hash: '#connection=invalid&port=3005' }); await tick(); assert.equal(invalid.calls.length, 0);
  const paired = siteHarness({ hash: '#connection=' + token + '&port=3005' }); await tick();
  assert.equal(paired.elements.get('status').textContent, 'Connected to Sanctum');
  assert.equal(paired.calls.filter(call => call.url.startsWith('/bridge/')).every(call => !JSON.stringify(call.init).includes(token)), true);
  paired.events.pagehide();
  const refreshed = siteHarness({ storage: paired.saved }); await tick();
  assert.equal(refreshed.elements.get('status').textContent, 'Connected to Sanctum');
  await refreshed.elements.get('disconnect').onclick();
  assert.equal(refreshed.saved.values.size, 0);
  const count = refreshed.calls.length;
  refreshed.events.pagehide(); refreshed.events.pageshow({ persisted: true }); await tick();
  assert.equal(refreshed.calls.length, count);
});

test('vault transport glitches preserve authorization and retry result delivery without repeating a write', async () => {
  let polls = 0, deliveries = 0, writes = 0, finish;
  const h = localHarness({
    service: { apply: () => { writes++; return new Promise(resolve => { finish = resolve; }); } },
    fetch(route) {
      if (route === 'poll' && ++polls === 1) return Promise.reject(new TypeError('Temporary network error'));
      if (route === 'poll' && polls === 2) return reply({ command: { id: 'write-once', method: 'apply', args: {} } });
      if (route === 'result' && ++deliveries === 1) return Promise.reject(new TypeError('Lost acknowledgement'));
    },
  });
  await h.window.SanctumChatGPTConnection.toggle(); await tick();
  assert.equal(h.saved.values.size, 1);
  assert.equal(h.window.SanctumChatGPTConnection.connected, true);
  await h.clock.fire(500);
  assert.equal(writes, 1);
  await h.clock.beat();
  assert.equal(h.calls.some(call => call.route === 'heartbeat' && JSON.parse(call.init.body).lease === 'first'), true);
  finish({ destination: 'Kitchen' }); await tick();
  assert.equal(deliveries, 1);
  await h.clock.fire(500);
  assert.equal(deliveries, 2);
  assert.equal(writes, 1);
  assert.equal(h.calls.filter(call => call.route === 'connect').length, 1);
  await h.window.SanctumChatGPTConnection.toggle();
  const count = h.calls.length; await h.clock.fire(500); await h.clock.beat();
  assert.equal(h.calls.length, count);
  assert.equal(h.saved.values.size, 0);
});

test('vault refresh retries a temporary failure but does not grant a new session', async () => {
  let attempts = 0;
  const h = localHarness({ storage: storage(new Map([['sanctum_chatgpt_tab_session_v1', token]])),
    fetch(route) { if (route === 'resume' && ++attempts === 1) return reply({}, 503); },
  });
  await tick(); assert.equal(h.saved.values.size, 1);
  await h.clock.fire(500);
  assert.equal(attempts, 2);
  assert.equal(h.window.SanctumChatGPTConnection.connected, true);
  assert.equal(h.calls.some(call => call.route === 'connect'), false);
  await h.window.SanctumChatGPTConnection.toggle();
});

test('helper retries lost pairing and result replies with the same IDs, never the local write', async () => {
  let pairs = 0, polls = 0, writes = 0, deliveries = 0;
  const h = siteHarness({ hash: '#connection=' + token, fetch(url) {
    if (url === '/bridge/connect' && ++pairs === 1) return Promise.reject(new TypeError('Lost pairing reply'));
    if (url === '/bridge/poll' && ++polls === 1) return reply({ command: { id: 'cloud-once', method: 'apply', args: {} } });
    if (url.endsWith('/execute')) { writes++; return reply({ destination: 'Kitchen' }); }
    if (url === '/bridge/result' && ++deliveries === 1) return Promise.reject(new TypeError('Lost result acknowledgement'));
  } });
  await tick(); assert.equal(h.saved.values.size, 1);
  await h.clock.fire(500);
  assert.equal(writes, 1); assert.equal(deliveries, 1);
  const ids = h.calls.filter(call => call.url === '/bridge/connect').map(call => JSON.parse(call.init.body).bridgeId);
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  await h.clock.fire(500);
  assert.equal(deliveries, 2); assert.equal(writes, 1);
  assert.equal(h.calls.some(call => call.url === '/bridge/disconnect'), false);
  await h.elements.get('disconnect').onclick();
  const count = h.calls.length; await h.clock.fire(500); await h.clock.beat();
  assert.equal(h.calls.length, count);
});

test('helper survives a heartbeat failure and slow vault refresh, but clears revoked access', async () => {
  let mode = 'online';
  const h = siteHarness({ hash: '#connection=' + token, fetch(url) {
    if (url.endsWith('/status') && mode === 'network') return Promise.reject(new TypeError('Connection reset'));
    if (url.endsWith('/status') && mode === 'refresh') return reply({ connected: false, reconnecting: true });
    if (url.endsWith('/status') && mode === 'revoked') return reply({ error: 'Session revoked.' }, 401);
  } });
  await tick(); mode = 'network'; await h.clock.beat();
  assert.equal(h.saved.values.size, 1);
  assert.equal(h.calls.some(call => call.url === '/bridge/disconnect'), false);
  mode = 'refresh'; await h.clock.beat();
  assert.match(h.elements.get('status').textContent, /Waiting/);
  mode = 'online'; await h.clock.beat();
  assert.equal(h.elements.get('status').textContent, 'Connected to Sanctum');
  mode = 'revoked'; await h.clock.beat();
  assert.equal(h.saved.values.size, 0);
  assert.equal(h.elements.get('status').textContent, 'Disconnected');
});

test('a lost local write reply reports an unknown outcome without replaying or dropping the helper', async () => {
  let writes = 0, polls = 0;
  const h = siteHarness({ hash: '#connection=' + token, fetch(url) {
    if (url === '/bridge/poll' && ++polls === 1) return reply({ command: { id: 'uncertain-write', method: 'apply', args: {} } });
    if (url.endsWith('/execute')) { writes++; return Promise.reject(new TypeError('Lost write reply')); }
  } });
  await tick();
  const result = h.calls.find(call => call.url === '/bridge/result');
  assert.match(JSON.parse(result.init.body).result.error, /outcome may be unknown.*history before retrying/);
  assert.equal(writes, 1);
  assert.equal(h.saved.values.size, 1);
  assert.equal(h.calls.some(call => call.url === '/bridge/disconnect'), false);
  await h.elements.get('disconnect').onclick();
});
