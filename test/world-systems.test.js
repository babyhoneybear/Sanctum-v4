const test = require('node:test');
const assert = require('node:assert/strict');
const systems = require('../world-systems.js');
const relations = require('../page-relations.js');
const context = require('../context-engine.js');

function fixture() {
  const pages = [{ id: 'elias', title: 'Elias' }];
  const all = { elias: { properties: [{ id: 'magic', type: 'relation', linkedPageIds: ['wards', 'perception'], linkLevels: { wards: 'wards-2', perception: 'perception-4' } }] } };
  for (const discipline of ['wards', 'perception', 'necromancy']) {
    pages.push({ id: discipline, title: discipline });
    const ids = [1, 2, 3, 4].map(rank => `${discipline}-${rank}`);
    pages.push(...ids.map(id => ({ id, title: id })));
    all[discipline] = { properties: [{ id: 'proficiency-levels', type: 'relation', relationKind: 'proficiency-levels', linkedPageIds: ids, cumulative: true }] };
  }
  const spell = (id, requirements) => {
    pages.push({ id, title: id, category: 'spell' });
    all[id] = { properties: [{ id: 'requirements', type: 'relation', relationKind: 'spell-requirements', linkedPageIds: requirements }] };
  };
  spell('shield', ['wards-2']); spell('barrier', ['wards-3']); spell('sight', ['perception-1']);
  spell('raise-dead', ['necromancy-1']); spell('combined', ['wards-2', 'perception-4']); spell('undefined', []);
  return { pages, all };
}

test('Wards 2 and Perception 4 meet only the matching discipline requirements', () => {
  const { pages, all } = fixture();
  for (const id of ['shield', 'sight', 'combined']) assert.equal(systems.evaluate(pages, all, 'elias', id).status, 'eligible');
  for (const id of ['barrier', 'raise-dead']) assert.equal(systems.evaluate(pages, all, 'elias', id).status, 'unmet');
  assert.equal(systems.evaluate(pages, all, 'elias', 'undefined').status, 'unknown');
  all.combined.properties[0].linkedPageIds.push('necromancy-1');
  assert.equal(systems.evaluate(pages, all, 'elias', 'combined').status, 'unmet');
});

test('proficiency is explicit, notes do not grant it, and assignments cannot cross disciplines', () => {
  const { pages, all } = fixture();
  delete all.elias.properties[0].linkLevels.wards;
  all.elias.properties[0].linkDetails = { wards: 'Level 4' };
  assert.equal(systems.evaluate(pages, all, 'elias', 'shield').status, 'unmet');
  assert.throws(() => systems.assignLevel(pages, all, 'elias', 'magic', 'wards', 'perception-4'), /belonging/);
  assert.throws(() => systems.assignLevel(pages, all, 'elias', 'magic', 'necromancy', 'necromancy-1'), /Connect/);
  const next = systems.assignLevel(pages, all, 'elias', 'magic', 'wards', 'wards-2');
  assert.equal(systems.evaluate(pages, next, 'elias', 'shield').status, 'eligible');
  assert.equal(all.elias.properties[0].linkLevels.wards, undefined);
  assert.equal(next.elias.properties[0].linkDetails.wards, 'Level 4');
  assert.equal(systems.evaluate(pages, systems.assignLevel(pages, next, 'elias', 'magic', 'wards', ''), 'elias', 'shield').status, 'unmet');
});

test('deleted levels reserve rank, missing definitions and conflicting ownership fail closed', () => {
  const { pages, all } = fixture();
  const withoutFirst = pages.filter(page => page.id !== 'wards-1');
  assert.equal(systems.levels(withoutFirst, all, 'wards')[0].rank, 2);
  assert.equal(systems.evaluate(pages.filter(page => page.id !== 'wards-2'), all, 'elias', 'shield').status, 'unmet');
  assert.equal(systems.evaluate(pages.filter(page => page.id !== 'wards'), all, 'elias', 'shield').status, 'unmet');
  assert.equal(systems.evaluate(pages, all, 'elias', 'shield').status, 'eligible');
  all.necromancy.properties[0].linkedPageIds.push('wards-2');
  assert.equal(systems.evaluate(pages, all, 'elias', 'shield').status, 'unmet');
});

test('exact-level systems and conflicting character assignments do not silently choose a higher level', () => {
  const { pages, all } = fixture();
  all.perception.properties[0].cumulative = false;
  assert.equal(systems.evaluate(pages, all, 'elias', 'sight').status, 'unmet');
  all.elias.properties.push({ id: 'other', type: 'relation', relationKind: 'proficiency', linkedPageIds: ['wards'], linkLevels: { wards: 'wards-4' } });
  assert.match(systems.evaluate(pages, all, 'elias', 'shield').reasons[0], /Conflicting/);
});

test('chosen levels are graph links and assistant context follows renamed shared pages', () => {
  const { pages, all } = fixture();
  pages.find(page => page.id === 'wards-2').title = 'Wards — Adept';
  const edges = relations.collect(pages, all).filter(edge => edge.from === 'elias');
  assert.equal(edges.find(edge => edge.to === 'wards').detail, 'Wards — Adept');
  assert.ok(edges.some(edge => edge.to === 'wards-2' && edge.label === 'Proficiency'));
  const catalog = context.buildCatalog({ pages, pageProps: all });
  const character = catalog.records.find(record => record.id === 'elias');
  assert.match(character.properties[0].displayValue, /Wards — Adept/);
  assert.ok(character.relations.some(link => link.targetRef === 'page:wards-2'));
});
