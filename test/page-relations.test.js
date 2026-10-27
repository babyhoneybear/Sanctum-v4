const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const relations = require('../page-relations.js');

function harness() {
  const pages = [
    { id: 'world', title: 'World', parent: 'home', containerType: 'project' },
    { id: 'elias', title: 'Elias', parent: 'world', category: 'character' },
    { id: 'wards', title: 'Wards', parent: 'world', aliases: ['Shielding'] },
    { id: 'other-wards', title: 'Wards', parent: 'other-world' }
  ];
  const data = new Map([['sanctum_page_props_v1', JSON.stringify({ elias: { properties: [
    { id: 'birthplace', type: 'relation', label: 'Birthplace', inverseLabel: 'People born here', linkedPageIds: [] },
    { id: 'magic', type: 'relation', label: 'Magic', inverseLabel: 'Practitioners', linkedPageIds: ['wards'] }
  ] } })]]);
  const context = {
    window: {
      userPages: pages, SanctumPageRelations: relations,
      addEventListener() {},
      getVaultScopeId: id => id === 'other-wards' ? 'other-world' : 'world',
      createPage(title, parent, layout, category, containerType, options) {
        assert.equal(options.skipTemplate, true);
        const page = { id: `new-${pages.length}`, title, parent, layout, category, containerType };
        pages.push(page);
        return page;
      }
    },
    localStorage: { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) },
    document: { getElementById: () => null }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../page-props.js'), 'utf8'), context);
  return { context, pages, data };
}

test('create-and-link puts a blank village in the world, preserves existing fields and derives the inverse', () => {
  const { context: api, pages } = harness();
  const village = api.createLinkedPropertyPage('elias', 'birthplace', ' Greyford ', 'location');
  assert.equal(village.parent, 'world');
  assert.equal(village.title, 'Greyford');
  assert.equal(api.getPageProps(village.id).properties.length, 0);
  assert.deepEqual(Array.from(api.getPageProps('elias').properties[1].linkedPageIds), ['wards']);
  const incoming = relations.collect(pages, api.readAllPageProps()).filter(link => link.to === village.id);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].from, 'elias');
  assert.equal(incoming[0].inverseLabel, 'People born here');
});

test('picker respects worlds, finds aliases, and never silently merges exact matches or variants', () => {
  const { context: api, pages } = harness();
  assert.deepEqual(api.getPropertyCandidates('elias', 'Shielding').map(p => p.id), ['wards']);
  assert.deepEqual(api.getPropertyCandidates('elias', 'Wards').map(p => p.id), ['wards']);
  assert.equal(api.getPropertyCandidates('elias', 'Wards', true).length, 2);
  assert.throws(() => api.createLinkedPropertyPage('elias', 'magic', 'Shielding'), /already exists/);
  assert.throws(() => api.createLinkedPropertyPage('elias', 'magic', 'Elias'), /already exists/);
  pages.push({ id: 'wards-variant', title: 'Wards', parent: 'world', canonicalId: 'wards' });
  assert.equal(api.getPropertyCandidates('elias', 'Wards').length, 2);
  assert.throws(() => api.createLinkedPropertyPage('elias', 'magic', 'Wards'), /already exists/);
  assert.throws(() => api.createLinkedPropertyPage('elias', 'missing', 'New page'), /Choose a name/);
  assert.equal(pages.length, 5);
});

test('details persist with their specific relationship and removing it removes the derived inverse', () => {
  const { context: api, pages, data } = harness();
  api.savePropLinkDetail('elias', 'magic', 'wards', 'Level 2');
  api.addPropLink('elias', 'magic', 'wards');
  let saved = JSON.parse(data.get('sanctum_page_props_v1'));
  assert.equal(saved.elias.properties[1].linkedPageIds.length, 1);
  assert.equal(relations.collect(pages, saved)[0].detail, 'Level 2');
  api.savePropLinkDetail('elias', 'magic', 'not-linked', 'Should not be saved');
  assert.equal(api.getPageProps('elias').properties[1].linkDetails['not-linked'], undefined);
  const withLevel = api.getPageProps('elias');
  withLevel.properties[1].linkLevels = { wards: 'wards-2' };
  api.setPageProps('elias', withLevel);
  api.removePropLink('elias', 'magic', 'wards');
  saved = JSON.parse(data.get('sanctum_page_props_v1'));
  assert.equal(relations.collect(pages, saved).length, 0);
  assert.equal(saved.elias.properties[1].linkDetails.wards, undefined);
  assert.equal(saved.elias.properties[1].linkLevels.wards, undefined);
  assert.ok(pages.some(page => page.id === 'wards'));
});

test('deleted endpoints disappear, restored endpoints reconnect, and renamed titles use the same identity', () => {
  const { context: api, pages } = harness();
  const props = api.readAllPageProps();
  assert.equal(relations.collect(pages.filter(page => page.id !== 'wards'), props).length, 0);
  assert.equal(relations.collect(pages, props).length, 1);
  pages.find(page => page.id === 'wards').title = 'Warding';
  assert.equal(api.getPropertyCandidates('elias', 'Warding')[0].id, 'wards');
  assert.equal(relations.collect(pages, props)[0].to, 'wards');
});

test('reverse connections distinguish multiple relationships to the same page without copying either', () => {
  const { context: api, pages } = harness();
  api.addPropLink('elias', 'birthplace', 'wards');
  const before = JSON.stringify(api.readAllPageProps());
  assert.equal(relations.collect(pages, api.readAllPageProps()).filter(link => link.to === 'wards').length, 2);
  assert.equal(JSON.stringify(api.readAllPageProps()), before);
});
