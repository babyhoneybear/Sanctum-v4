const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

async function harness(t, options = {}) {
  const { store } = await import('../chatgpt-plugin/worker/store.js');
  const { gateway } = await import('../chatgpt-plugin/worker/gateway.js');
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.resolve('chatgpt-plugin/drizzle');
  for (const file of fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  t.after(() => sqlite.close());
  const binding = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...params) { return {
        async first() { return statement.get(...params) || null; },
        async run() { return statement.run(...params); },
      }; } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const database = store(binding), handle = gateway(database, { timeout: 1000, sleep: () => new Promise(resolve => setTimeout(resolve, 5)), ...options });
  const send = (route, body, owner = 'owner', extra = {}) => handle(new Request('https://sanctum.example' + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...extra }, body: JSON.stringify(body),
  }));
  const browser = (route, body = {}, owner = 'owner') => send('/bridge/' + route, body, owner, { Origin: 'https://sanctum.example', 'X-Sanctum-Connector': 'browser' });
  const call = (name, args = {}, owner = 'owner') => send('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, owner);
  return { send, browser, call, sqlite, database, async next(bridgeId) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const command = (await (await browser('poll', { bridgeId })).json()).command;
      if (command) return command;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('No command received.');
  } };
}

test('hosted MCP requires a trusted identity and connector mutations require the same browser origin', async t => {
  const h = await harness(t);
  assert.equal((await h.send('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)).status, 401);
  assert.equal((await h.send('/bridge/connect', {})).status, 403);
  const list = await (await h.send('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
  assert.equal(list.result.tools.length, 12);
  assert.equal(list.result.tools.find(tool => tool.name === 'sanctum_apply_database').annotations.readOnlyHint, false);
  const offline = await (await h.call('sanctum_search')).json();
  assert.equal(offline.result.isError, true);
  assert.match(offline.result.content[0].text, /offline/);
});

test('hosted commands remain scoped to their owner and completed vault data is removed', async t => {
  const h = await harness(t);
  const { bridgeId } = await (await h.browser('connect')).json();
  assert.equal((await h.browser('poll', { bridgeId }, 'another-user')).status, 409);
  const work = h.call('sanctum_search', { query: 'Meals' });
  const command = await h.next(bridgeId);
  assert.equal(command.method, 'search');
  assert.equal(command.args.query, 'Meals');
  assert.equal((await h.browser('result', { bridgeId, id: command.id, result: { results: ['Secret meal'] } }, 'another-user')).status, 409);
  await h.browser('result', { bridgeId, id: command.id, result: { results: ['Soup'] } });
  const reply = await (await work).json();
  assert.equal(reply.result.isError, false);
  assert.deepEqual(JSON.parse(reply.result.content[0].text), { results: ['Soup'] });
  assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM commands').get().count, 0);
});

test('disconnect stops pending tools and cannot affect another owner', async t => {
  const h = await harness(t);
  const { bridgeId } = await (await h.browser('connect')).json();
  const work = h.call('sanctum_apply_database', { planId: 'agreed-plan' });
  await h.next(bridgeId);
  assert.equal((await h.browser('disconnect', { bridgeId }, 'another-user')).status, 409);
  await h.browser('disconnect', { bridgeId });
  const reply = await (await work).json();
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /history before retrying/);
});

test('timed out writes never replay and leave no queued payload behind', async t => {
  const h = await harness(t, { timeout: 30 });
  await h.browser('connect');
  const reply = await (await h.call('sanctum_apply_database', { planId: 'agreed-plan' })).json();
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /outcome may be unknown/);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM commands').get().count, 0);
});

test('the official MCP client initializes, discovers tools, and completes a hosted tool call', async t => {
  const h = await harness(t);
  const express = require('express');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const app = express(); app.use(express.json());
  app.all('/mcp', async (req, res) => {
    if (req.method !== 'POST') return res.sendStatus(405);
    const response = await h.send('/mcp', req.body);
    res.status(response.status);
    for (const [key,value] of response.headers) res.set(key,value);
    res.send(await response.text());
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const client = new Client({ name: 'sanctum-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + server.address().port + '/mcp'));
  await client.connect(transport);
  t.after(() => client.close());
  const available=(await client.listTools()).tools;
  assert.equal(available.length, 12);
  assert.equal(available.find(tool=>tool.name==='sanctum_apply_pages').annotations.readOnlyHint,false);
  assert.equal(available.find(tool=>tool.name==='sanctum_read_page').annotations.readOnlyHint,true);
  const { bridgeId } = await (await h.browser('connect')).json();
  const call = client.callTool({ name: 'sanctum_capabilities', arguments: {} });
  const command = await h.next(bridgeId);
  await h.browser('result', { bridgeId, id: command.id, result: { propertyTypes: ['title', 'text'] } });
  assert.deepEqual(JSON.parse((await call).content[0].text).propertyTypes, ['title', 'text']);
  const shot = client.callTool({ name: 'sanctum_page_screenshot', arguments: { target: { pageId: 'kitchen' } } });
  const capture = await h.next(bridgeId);
  assert.equal(capture.method, 'screenshot');
  await h.browser('result', { bridgeId, id: capture.id, result: { pageId: 'kitchen', image: { mimeType: 'image/jpeg', data: '/9j/AA==' } } });
  const screenshot = await shot;
  assert.deepEqual(screenshot.content[1], { type: 'image', mimeType: 'image/jpeg', data: '/9j/AA==' });
  assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM commands').get().count, 0);
  const pagePlan=client.callTool({name:'sanctum_plan_pages',arguments:{request:{pages:[{mode:'create',target:{pageId:'life'},title:'Places'}]}}});
  const pageCommand=await h.next(bridgeId);assert.equal(pageCommand.method,'planPage');
  await h.browser('result',{bridgeId,id:pageCommand.id,result:{planId:'page-plan-test',pages:[{pageId:'places'}]}});
  assert.equal(JSON.parse((await pagePlan).content[0].text).planId,'page-plan-test');
});

test('lost bridge pairing/result acknowledgements do not delete or replay pending writes', async t => {
  const h = await harness(t);
  const bridgeId = crypto.randomUUID();
  await h.browser('connect', { bridgeId });
  const work = h.call('sanctum_apply_database', { planId: 'once' });
  const command = await h.next(bridgeId);
  assert.equal((await h.browser('connect', { bridgeId })).status, 200);
  assert.equal(h.sqlite.prepare('SELECT count(*) AS count FROM commands').get().count, 1);
  assert.equal((await (await h.browser('poll', { bridgeId })).json()).command, null);
  const delivery = { bridgeId, id: command.id, result: { destination: 'Kitchen' } };
  assert.equal((await (await h.browser('result', delivery)).json()).received, true);
  assert.equal((await (await h.browser('result', delivery)).json()).received, true);
  const result = await (await work).json();
  assert.equal(result.result.isError, false);
  assert.deepEqual(JSON.parse(result.result.content[0].text), { destination: 'Kitchen' });
  assert.equal((await (await h.browser('result', delivery)).json()).expired, true);
  assert.equal((await h.browser('heartbeat', { bridgeId })).status, 200);
  assert.equal((await h.browser('heartbeat', { bridgeId }, 'another-user')).status, 409);
});

test('a brief missed cloud heartbeat is tolerated but an abandoned bridge becomes offline', async t => {
  let now = 1000;
  const h = await harness(t, { now: () => now });
  const { bridgeId } = await (await h.browser('connect')).json();
  now += 60000;
  const work = h.call('sanctum_search');
  const command = await h.next(bridgeId);
  await h.browser('result', { bridgeId, id: command.id, result: { results: [] } });
  assert.equal((await (await work).json()).result.isError, false);
  now += 91000;
  const offline = await (await h.call('sanctum_search')).json();
  assert.equal(offline.result.isError, true);
  assert.match(offline.result.content[0].text, /offline/);
});
