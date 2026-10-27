const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { mount } = require('../chatgpt-relay');

async function harness(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sanctum-relay-'));
  const app = express(); app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const relay = mount(app, { port, directory, timeout: 1000, ...options });
  const { secret } = JSON.parse(fs.readFileSync(path.join(directory, `.local-tools/chatgpt/connection-${port}.json`), 'utf8'));
  const url = `http://127.0.0.1:${port}`;
  const browser = { Origin: url, 'X-Sanctum-ChatGPT': 'browser' };
  const mcp = { Authorization: `Bearer ${secret}` };
  const post = (route, body, headers) => fetch(`${url}/api/chatgpt/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  t.after(async () => { relay.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(directory, { recursive: true }); });
  return { post, browser, mcp, url };
}

test('the private hosted connector needs its exact origin and the current local connection code', async t => {
  const site = 'https://sanctum.example';
  const h = await harness(t, { siteUrl: site });
  const { session } = await (await h.post('connect', {}, h.browser)).json();
  const local = { ...h.browser, 'X-Sanctum-Session': session };
  const remote = { Origin: site, 'X-Sanctum-ChatGPT': 'browser', 'X-Sanctum-Session': session };
  assert.equal((await h.post('site-info', {}, local)).status, 200);
  assert.equal((await h.post('site/status', {}, { ...remote, Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await h.post('site/status', {}, { ...remote, 'X-Sanctum-Session': 'wrong' })).status, 401);
  assert.equal((await h.post('site/execute', { method: 'executeCode' }, remote)).status, 400);
  const preflight = await fetch(h.url + '/api/chatgpt/site/execute', { method: 'OPTIONS', headers: { Origin: site, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), site);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');
  const request = h.post('site/execute', { method: 'search', args: { query: 'Meals' } }, remote);
  const { command } = await (await h.post('poll', {}, local)).json();
  await h.post('result', { id: command.id, result: { results: ['Meals'] } }, local);
  assert.deepEqual(await (await request).json(), { results: ['Meals'] });
  await h.post('disconnect', {}, local);
  assert.equal((await h.post('site/status', {}, remote)).status, 401);
});
test('local relay refuses unpaired calls and foreign browser origins', async t => {
  const h = await harness(t);
  assert.equal((await h.post('connect', {}, { ...h.browser, Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await h.post('connect', {}, {})).status, 403);
  assert.equal((await h.post('rpc', {}, h.mcp)).status, 503);
  assert.equal((await h.post('rpc', {}, h.browser)).status, 401);
});

test('refresh suspends vault access; the same tab resumes and stale unloads cannot disconnect it', async t => {
  const h = await harness(t, { siteUrl: 'https://sanctum.example' });
  const { session, lease } = await (await h.post('connect', {}, h.browser)).json();
  const local = { ...h.browser, 'X-Sanctum-Session': session };
  const remote = { ...local, Origin: 'https://sanctum.example' };
  await h.post('suspend', { lease }, local);
  assert.deepEqual(await (await h.post('site/status', {}, remote)).json(), { connected: false, reconnecting: true });
  assert.equal((await h.post('site/execute', { method: 'search' }, remote)).status, 503);
  assert.equal((await h.post('resume', {}, { ...local, 'X-Sanctum-Session': 'other-tab' })).status, 401);
  const resumed = await (await h.post('resume', {}, local)).json();
  assert.notEqual(resumed.lease, lease);
  await h.post('suspend', { lease }, local);
  assert.equal((await (await h.post('site/status', {}, remote)).json()).connected, true);
  await h.post('disconnect', {}, local);
  assert.equal((await h.post('resume', {}, local)).status, 401);
});
test('only the paired tab receives MCP work; disconnect rejects pending work', async t => {
  const h = await harness(t);
  const connection = await (await h.post('connect', {}, h.browser)).json();
  const browser = { ...h.browser, 'X-Sanctum-Session': connection.session };
  assert.equal((await h.post('connect', {}, h.browser)).status, 409);
  const rpc = h.post('rpc', { method: 'search', args: { query: 'Meals' } }, h.mcp);
  const poll = await (await h.post('poll', {}, browser)).json();
  assert.equal(poll.command.method, 'search');
  assert.equal((await h.post('result', { id: poll.command.id, result: { results: ['Meals'] } }, { ...browser, 'X-Sanctum-Session': 'wrong' })).status, 401);
  await h.post('result', { id: poll.command.id, result: { results: ['Meals'] } }, browser);
  assert.deepEqual(await (await rpc).json(), { results: ['Meals'] });
  const pending = h.post('rpc', { method: 'inspect' }, h.mcp);
  await h.post('poll', {}, browser);
  await h.post('disconnect', {}, browser);
  assert.match((await (await pending).json()).error, /disconnected/);
});

test('vault heartbeats keep a long operation online; the helper and stale leases cannot renew access', async t => {
  let now = 1000;
  const h = await harness(t, { now: () => now, siteUrl: 'https://sanctum.example' });
  const { session, lease } = await (await h.post('connect', {}, h.browser)).json();
  const local = { ...h.browser, 'X-Sanctum-Session': session };
  const remote = { ...local, Origin: 'https://sanctum.example' };
  const work = h.post('site/execute', { method: 'apply', args: { planId: 'once' } }, remote);
  const { command } = await (await h.post('poll', {}, local)).json();
  now += 35000;
  assert.equal((await (await h.post('site/status', {}, remote)).json()).connected, true);
  assert.equal((await h.post('heartbeat', { lease: 'stale' }, local)).status, 409);
  assert.equal((await h.post('heartbeat', { lease }, remote)).status, 403);
  assert.equal((await h.post('heartbeat', { lease }, local)).status, 200);
  now += 80000;
  assert.equal((await (await h.post('site/status', {}, remote)).json()).connected, true);
  await h.post('result', { id: command.id, result: { destination: 'Kitchen' } }, local);
  assert.deepEqual(await (await work).json(), { destination: 'Kitchen' });
  // An acknowledgement retry is harmless even after the caller received it.
  assert.equal((await h.post('result', { id: command.id, result: { destination: 'Kitchen' } }, local)).status, 200);
  now += 91000;
  assert.equal((await (await h.post('site/status', {}, remote)).json()).connected, false);
  await h.post('suspend', { lease }, local);
  assert.equal((await h.post('heartbeat', { lease }, local)).status, 409);
});
