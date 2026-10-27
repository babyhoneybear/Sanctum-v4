export function store(db) {
  const prepare = (sql, ...params) => db.prepare(sql).bind(...params);
  return {
    async cleanup(now) { await prepare('DELETE FROM commands WHERE expires < ?', now).run(); },
    bridge: owner => prepare('SELECT * FROM bridges WHERE owner = ?', owner).first(),
    async connect(owner, id, now) {
      await db.batch([
        prepare('DELETE FROM commands WHERE owner = ?', owner),
        prepare('INSERT INTO bridges(owner,id,seen) VALUES(?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id, seen=excluded.seen', owner,id,now),
      ]);
    },
    async touch(owner, id, now) { return !!(await prepare('UPDATE bridges SET seen = ? WHERE owner = ? AND id = ? RETURNING id', now,owner,id).first()); },
    async disconnect(owner, id) {
      await db.batch([
        prepare('DELETE FROM commands WHERE owner = ? AND bridge = ?', owner,id),
        prepare('DELETE FROM bridges WHERE owner = ? AND id = ?', owner,id),
      ]);
    },
    count: (owner, bridge, now) => prepare('SELECT count(*) AS count FROM commands WHERE owner = ? AND bridge = ? AND expires > ?', owner,bridge,now).first(),
    async enqueue(command) {
      await prepare('INSERT INTO commands(id,owner,bridge,method,args,state,created,expires) VALUES(?,?,?,?,?,?,?,?)', command.id,command.owner,command.bridge,command.method,JSON.stringify(command.args),'queued',command.created,command.expires).run();
    },
    next: (owner, bridge, now) => prepare("UPDATE commands SET state = 'running' WHERE id = (SELECT id FROM commands WHERE owner = ? AND bridge = ? AND state = 'queued' AND expires > ? ORDER BY created, id LIMIT 1) AND state = 'queued' RETURNING id, method, args", owner,bridge,now).first(),
    async finish(owner, bridge, id, result, now) {
      return !!(await prepare("UPDATE commands SET state = 'done', result = ?, args = '{}' WHERE owner = ? AND bridge = ? AND id = ? AND state IN ('running', 'done') AND expires > ? AND (state = 'running' OR result = ?) RETURNING id", JSON.stringify(result),owner,bridge,id,now,JSON.stringify(result)).first());
    },
    result: (owner, id) => prepare('SELECT state, result FROM commands WHERE owner = ? AND id = ?', owner,id).first(),
    async remove(owner, id) { await prepare('DELETE FROM commands WHERE owner = ? AND id = ?', owner,id).run(); },
  };
}
