// Local-only transport between the open vault and the stdio MCP process.
// Vault data stays in the browser; this relay keeps no content on disk.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function mount(app, { port, directory = __dirname, timeout = 45000, siteUrl, now = Date.now, staleAfter = 90000 } = {}) {
  const secret = crypto.randomBytes(32).toString('hex');
  const runtimeDir = path.join(directory, '.local-tools', 'chatgpt');
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, `connection-${port}.json`), JSON.stringify({
    url: `http://127.0.0.1:${port}`, secret
  }), { mode: 0o600 });
  let client = null;
  let poll = null;
  const queue = [];
  const pending = new Map();
  const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  let siteOrigin = '';
  if (siteUrl) {
    const parsed = new URL(siteUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/') throw new Error('Invalid ChatGPT connector URL.');
    siteOrigin = parsed.origin;
  }
  function finish(id, result) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    const index = queue.findIndex(item => item.id === id);
    if (index >= 0) queue.splice(index, 1);
    entry.res.json(result);
  }
  function disconnect(reason) {
    if (poll) { poll.json({ disconnected: true }); poll = null; }
    for (const id of pending.keys()) finish(id, { error: reason });
    client = null;
  }
  function suspend(reason) {
    if (poll) { poll.json({ disconnected: true }); poll = null; }
    for (const id of pending.keys()) finish(id, { error: reason });
    if (client) client.suspended = true;
  }
  function deliver() {
    if (!poll || !queue.length) return;
    const res = poll;
    poll = null;
    res.json({ command: queue.shift() });
  }
  app.use('/api/chatgpt', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.headers.host || '';
    if (!loopback.has(req.socket.remoteAddress) || ![
      `127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`
    ].includes(host)) return res.status(403).json({ error: 'Local connection required.' });
    if (req.path.startsWith('/site/')) {
      if (!siteOrigin || req.headers.origin !== siteOrigin) return res.status(403).json({ error: 'Use your private Sanctum connector.' });
      res.set('Access-Control-Allow-Origin', siteOrigin);
      res.set('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, X-Sanctum-ChatGPT, X-Sanctum-Session');
        res.set('Access-Control-Allow-Private-Network', 'true');
        return res.sendStatus(204);
      }
      if (!client || req.headers['x-sanctum-chatgpt'] !== 'browser' || req.headers['x-sanctum-session'] !== client.id) {
        return res.status(401).json({ error: 'Connect Sanctum in Settings → Data and open its ChatGPT connector again.' });
      }
      return next();
    }
    if (req.headers.authorization === `Bearer ${secret}` && !req.headers.origin) return next();
    if (req.headers.origin !== `http://${host}` || req.headers['x-sanctum-chatgpt'] !== 'browser') {
      return res.status(403).json({ error: 'Open this connection from Sanctum.' });
    }
    if (req.path === '/connect') return next();
    if (!client || req.headers['x-sanctum-session'] !== client.id) {
      return res.status(401).json({ error: 'This Sanctum tab is not connected.' });
    }
    next();
  });
  app.post('/api/chatgpt/site/status', (req, res) => {
    res.json({ connected: !!client && !client.suspended && now() - client.seen < staleAfter,
      reconnecting: !!client?.suspended });
  });
  app.post('/api/chatgpt/site/execute', (req, res) => {
    if (!require('./chatgpt-tools').methods.includes(req.body.method)) return res.status(400).json({ error: 'Unknown Sanctum operation.' });
    enqueue(req, res);
  });
  app.post('/api/chatgpt/site-info', (req, res) => res.json({ url: siteOrigin || null }));
  app.post('/api/chatgpt/connect', (req, res) => {
    if (req.headers.origin === undefined) return res.status(403).json({ error: 'Browser connection required.' });
    if (client && now() - client.seen < staleAfter) {
      return res.status(409).json({ error: 'Another Sanctum tab is connected. Disconnect it first.' });
    }
    disconnect('The vault connection was replaced. Inspect history before retrying a write.');
    client = { id: crypto.randomBytes(24).toString('hex'), lease: crypto.randomUUID(), seen: now(), suspended: false };
    res.json({ session: client.id, lease: client.lease });
  });
  app.post('/api/chatgpt/resume', (req, res) => {
    // The tab must already possess the current session. A reload gets a new
    // lease so an old pagehide request cannot suspend the resumed page.
    suspend('The Sanctum tab resumed. Inspect history before retrying writes.');
    client.lease = crypto.randomUUID(); client.suspended = false; client.seen = now();
    res.json({ lease: client.lease });
  });
  app.post('/api/chatgpt/suspend', (req, res) => {
    if (req.body.lease === client.lease) suspend('The Sanctum tab reloaded or closed. Inspect history before retrying writes.');
    res.json({ suspended: !!client.suspended });
  });
  app.post('/api/chatgpt/disconnect', (req, res) => {
    disconnect('Sanctum was disconnected. Inspect history before retrying a write.');
    res.json({ disconnected: true });
  });
  // Only the authorized vault tab can renew liveness, including during a long
  // render/save. The remote helper cannot keep a closed vault marked online.
  app.post('/api/chatgpt/heartbeat', (req, res) => {
    if (client.suspended || req.body.lease !== client.lease) return res.status(409).json({ error: 'This Sanctum tab must resume first.' });
    client.seen = now();
    res.json({ connected: true });
  });
  app.post('/api/chatgpt/poll', (req, res) => {
    if (!client || req.headers['x-sanctum-session'] !== client.id) return res.sendStatus(401);
    if (client.suspended) return res.status(409).json({ error: 'Resume this Sanctum tab first.' });
    client.seen = now();
    if (poll) return res.status(409).json({ error: 'A poll is already active.' });
    poll = res;
    const timer = setTimeout(() => { if (poll === res) { poll = null; res.json({}); } }, 20000);
    res.on('close', () => { clearTimeout(timer); if (poll === res) poll = null; });
    deliver();
  });
  app.post('/api/chatgpt/result', (req, res) => {
    if (!client || req.headers['x-sanctum-session'] !== client.id) return res.sendStatus(401);
    client.seen = now();
    finish(req.body.id, req.body.result);
    res.json({ received: true });
  });
  function enqueue(req, res) {
    if (!client || client.suspended || now() - client.seen >= staleAfter) {
      return res.status(503).json({ error: 'Open Sanctum and enable ChatGPT in Settings → Data.' });
    }
    if (pending.size >= 20) return res.status(429).json({ error: 'Too many outstanding requests.' });
    const id = crypto.randomUUID();
    const timer = setTimeout(() => finish(id, {
      error: 'Sanctum did not reply in time. The outcome may be unknown. Read change history before retrying writes.'
    }), timeout);
    pending.set(id, { res, timer });
    queue.push({ id, method: req.body.method, args: req.body.args || {} });
    deliver();
  }
  app.post('/api/chatgpt/rpc', (req, res) => {
    if (req.headers.authorization !== `Bearer ${secret}` || req.headers.origin) return res.sendStatus(403);
    enqueue(req, res);
  });
  return { close: () => disconnect('Sanctum stopped.') };
}
module.exports = { mount };
