const test = require('node:test');
const assert = require('node:assert/strict');
const { build, plain, placement } = require('../context-preview');

function fixture() {
  return {
    pages: [
      { id: 'world-a', title: 'Story A', parent: 'home', containerType: 'project' },
      { id: 'world-b', title: 'Story B', parent: 'home', containerType: 'project' },
      { id: 'elias-a', title: 'Elias', category: 'character', parent: 'world-a', summary: 'A cautious traveller.' },
      { id: 'elias-b', title: 'Elias', category: 'character', parent: 'world-b', summary: 'A different person.' },
      { id: 'wards', title: 'Wards', parent: 'world-a' }, { id: 'level2', title: 'Adept', parent: 'wards' }
    ],
    pageProps: { 'elias-a': { properties: [
      { label: 'Age', type: 'text', value: '24' },
      { label: 'Empty', type: 'text', value: '' },
      { label: 'Magic', type: 'relation', linkedPageIds: ['wards', 'deleted'], linkLevels: { wards: 'level2' }, linkDetails: { wards: 'Protective circles' } }
    ] } },
    documents: { 'elias-a': { sections: [{ title: 'Blank', content: '' }, { title: 'Background', content: '<p>Born near the northern coast.</p><p>Keeps a journal.</p>' }] } }
  };
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value); Object.values(value).forEach(freeze); return value;
}
test('previews resolve exact linked identities across scopes and never modify their source', () => {
  const snapshot = freeze(fixture());
  const result = build(snapshot, 'elias-a');
  assert.equal(result.path, 'Story A');
  assert.equal(result.summary, 'A cautious traveller.');
  assert.deepEqual(result.fields, [{ label: 'Age', value: '24' }, { label: 'Magic', value: 'Wards · Adept · Protective circles' }]);
  assert.equal(result.excerptLabel, 'Background');
  assert.equal(result.excerpt, 'Born near the northern coast. Keeps a journal.');
  assert.equal(build(snapshot, 'elias-b').summary, 'A different person.');
  assert.equal(build(snapshot, 'Elias').missing, true, 'never guess a missing ID by title');
});
test('custom types, nested boards, profile fields and scrapbook text have readable previews', () => {
  const snapshot = {
    pages: [{ id: 'recipe', title: 'Soup', category: 'custom-type-recipe' }, { id: 'profile', title: 'Person' }, { id: 'journal', title: 'Trip' }],
    customTypes: [{ id: 'custom-type-recipe', name: 'Recipe', archived: true }],
    blocks: { recipe: [{ containerTitle: 'Empty heading' }, { containerItems: [{ containerTitle: 'Method', containerBody: '<p>Simmer for 20 minutes.</p>' }] }] },
    documents: { profile: { profileFields: { role: 'Archivist', custom: 'Coffee' }, profileCustomFields: [{ key: 'custom', label: 'Favourite drink' }], profileNotes: '<p>Lives by the sea.</p>' } },
    profileSchema: [{ key: 'role', label: 'Role' }],
    journals: { journal: { pages: [{ title: 'Monday', elements: [{ type: 'image', src: 'private-photo' }, { type: 'text', text: 'Walked along the river.' }] }] } }
  };
  assert.equal(build(snapshot, 'recipe').type, 'Recipe');
  assert.equal(build(snapshot, 'recipe').excerpt, 'Simmer for 20 minutes.');
  assert.deepEqual(build(snapshot, 'profile').fields, [{ label: 'Role', value: 'Archivist' }, { label: 'Favourite drink', value: 'Coffee' }]);
  assert.equal(build(snapshot, 'profile').excerpt, 'Lives by the sea.');
  assert.equal(build(snapshot, 'journal').excerpt, 'Walked along the river.');
});
test('database row previews read stored values without calling the mutating peek adapter', () => {
  const snapshot = freeze({
    pages: [{ id: 'row-page', title: 'Old title', databaseRowRef: { sourceKind: 'page', sourcePageId: 'db', rowId: 'r1' } }],
    databases: { db: { title: 'Reading list', properties: [{ id: 'name', type: 'title' }, { id: 'done', name: 'Finished', type: 'checkbox' }, { id: 'count', name: 'Count', type: 'number' }], rows: [{ id: 'r1', values: { name: 'New title', done: false, count: 0 } }] } }
  });
  const result = build(snapshot, 'row-page');
  assert.equal(result.title, 'New title');
  assert.equal(result.type, 'Reading list row');
  assert.deepEqual(result.fields, [{ label: 'Finished', value: 'No' }, { label: 'Count', value: '0' }]);
});
test('inline databases are found in nested frames and truncated previews disclose additional fields', () => {
  const properties = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Field ${i}`, type: 'text' }));
  const snapshot = {
    pages: [{ id: 'row', databaseRowRef: { sourceKind: 'block', sourcePageId: 'host', sourceBlockId: 'db', rowId: 'r1' } }],
    blocks: { host: [{ containerItems: [{ id: 'db', calendarTitle: 'Collection', dbProperties: JSON.stringify(properties), dbRows: JSON.stringify([{ id: 'r1', values: Object.fromEntries(properties.map(prop => [prop.id, 'value'])) }]) }] }] }
  };
  const result = build(snapshot, 'row');
  assert.equal(result.fields.length, 6); assert.equal(result.moreFields, 3);
});

test('database dates and relations are readable, while deleted rows never fall back to stale page details', () => {
  const snapshot = {
    pages: [{ id: 'row', summary: 'Stale summary', databaseRowRef: { sourceKind: 'page', sourcePageId: 'db', rowId: 'r1' } }],
    databases: {
      db: { properties: [
        { id: 'date', name: 'When', type: 'date' },
        { id: 'related', name: 'Related', type: 'relation', relationTarget: { kind: 'page', pageId: 'other' } }
      ], rows: [{ id: 'r1', values: { date: '{"start":"2026-09-21","end":"2026-09-22"}', related: '["r2","gone"]' } }] },
      other: { properties: [{ id: 'name', type: 'title' }], rows: [{ id: 'r2', values: { name: 'Related entry' } }] }
    }
  };
  assert.deepEqual(build(snapshot, 'row').fields, [
    { label: 'When', value: '2026-09-21 – 2026-09-22' }, { label: 'Related', value: 'Related entry' }
  ]);
  snapshot.databases.db.rows[0].archived = true;
  assert.equal(build(snapshot, 'row').missing, true);
  assert.equal(build(snapshot, 'row').summary, undefined);
  delete snapshot.pages[0].databaseRowRef.rowId;
  snapshot.databases.db.rows = [{}];
  assert.equal(build(snapshot, 'row').missing, true);
});
test('empty/deleted pages and circular ancestry do not leak unrelated content or loop', () => {
  const snapshot = { pages: [{ id: 'a', title: 'A', parent: 'b' }, { id: 'b', title: 'B', parent: 'a' }] };
  assert.equal(build(snapshot, 'a').path, 'B');
  assert.equal(build(snapshot, 'a').excerpt, '');
  assert.equal(build(snapshot, 'deleted').missing, true);
});
test('content is plain text, bounded, and refreshed from the latest snapshot', () => {
  assert.equal(plain('<script>alert(1)</script><p>A &amp; B&nbsp;&#x1F34E;</p><img src=x onerror=alert(1)>'), 'A & B 🍎');
  assert.equal(plain('&lt;img src=x&gt;'), '<img src=x>');
  const snapshot = fixture();
  snapshot.documents['elias-a'].sections[1].content = 'x'.repeat(900);
  assert.equal(build(snapshot, 'elias-a').excerpt.length, 420);
  snapshot.pageProps['elias-a'].properties[0].value = '25';
  assert.equal(build(snapshot, 'elias-a').fields[0].value, '25');
});
test('preview placement stays inside small viewports and flips above links near the bottom', () => {
  assert.deepEqual(placement({ left: 20, top: 50, bottom: 70 }, { width: 360, height: 300 }, { width: 900, height: 700 }), { left: 20, top: 80 });
  assert.deepEqual(placement({ left: 870, top: 650, bottom: 670 }, { width: 360, height: 300 }, { width: 900, height: 700 }), { left: 528, top: 340 });
  assert.deepEqual(placement({ left: -10, top: 0, bottom: 20 }, { width: 360, height: 520 }, { width: 320, height: 400 }), { left: 12, top: 12 });
});
