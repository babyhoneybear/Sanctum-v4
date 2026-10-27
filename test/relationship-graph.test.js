const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness(pages = [], blocks = {}, props = {}) {
  const window = {
    userPages: pages, userDomains: [],
    readAllPageBlocks: () => blocks,
    readStorageJSON: (key, fallback) => key === 'sanctum_page_props_v1' ? props : fallback,
    SanctumPageRelations: require('../page-relations.js'),
    getCurrentPageId: () => 'home'
  };
  const source = fs.readFileSync(path.join(__dirname, '../relationship-graph.js'), 'utf8');
  const context = { window, localStorage: { getItem: () => null }, Map, Set };
  vm.runInNewContext(source.replace('  window.buildRelationshipGraphModel = getGraphModel;', `
    window.testGraph = { bundleGraphEdges, getNodeDegrees, stepGraphPhysics, fitViewportToNodes,
      normalizeEdgeFilters, getGraphSettings, layoutGraph, applyGraphViewport, getPointerGraphPoint };
    window.buildRelationshipGraphModel = getGraphModel;`), context);
  return { ...window.testGraph, model: window.buildRelationshipGraphModel, local: window.buildLocalRelationshipGraph };
}

test('property-strip relations reach the graph and invalidate cached edges when edited', () => {
  const props = { elias: { properties: [{ id: 'magic', type: 'relation', label: 'Magic', linkedPageIds: ['wards'], linkDetails: { wards: 'Level 2' } }] } };
  const api = harness([{ id: 'elias' }, { id: 'wards' }], {}, props);
  let edge = api.model().edges.find(edge => edge.type === 'relation');
  assert.equal(edge.from, 'elias');
  assert.equal(edge.to, 'wards');
  assert.equal(edge.label, 'Magic · Level 2');
  props.elias.properties[0].linkDetails.wards = 'Level 3';
  assert.equal(api.model().edges.find(edge => edge.type === 'relation').label, 'Magic · Level 3');
  props.elias.properties[0].linkedPageIds = [];
  assert.equal(api.model().edges.some(edge => edge.type === 'relation'), false);
});

test('parallel and reciprocal links share one connection without losing direction or types', () => {
  const api = harness();
  const edges = [
    { from: 'a', to: 'b', type: 'contains' },
    { from: 'a', to: 'b', type: 'page-card' },
    { from: 'b', to: 'a', type: 'mention' }
  ];
  const pairs = api.bundleGraphEdges(edges);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].relationships.length, 3);
  assert.equal(api.bundleGraphEdges(pairs)[0].relationships.length, 3);
  assert.equal(api.getNodeDegrees([{ id: 'a' }, { id: 'b' }], edges).get('a'), 1);
});

test('local depth counts real hops and disabled hierarchy stays disabled', () => {
  const api = harness([
    { id: 'project', parent: 'home', containerType: 'project' },
    { id: 'child', parent: 'project' },
    { id: 'grandchild', parent: 'child' }
  ]);
  const settings = api.getGraphSettings();
  assert.deepEqual(new Set(api.local('grandchild', 1, settings).nodes.map(n => n.id)), new Set(['child', 'grandchild']));
  const filters = api.normalizeEdgeFilters({ contains: false });
  assert.equal(filters.contains, false);
  assert.deepEqual(new Set(api.local('grandchild', 2, { ...settings, edgeFilters: filters }).nodes.map(n => n.id)), new Set(['grandchild']));
  assert.equal(api.model().edges.some(e => e.from === 'project' && e.to === 'grandchild' && e.type === 'contains'), false);
});

test('a page card to another branch is a link, not a second parent', () => {
  const api = harness([
    { id: 'a', parent: 'home' }, { id: 'b', parent: 'home' }, { id: 'c', parent: 'b' }
  ], { a: [{ id: 'card', type: 'page', linkedPageId: 'c' }] });
  const model = api.model();
  assert.ok(model.edges.some(e => e.from === 'a' && e.to === 'c' && e.type === 'page-card'));
  assert.equal(model.edges.some(e => e.from === 'a' && e.to === 'c' && e.type === 'contains'), false);
  assert.ok(model.edges.some(e => e.from === 'b' && e.to === 'c' && e.type === 'contains'));
});

test('zero physics values disable forces while collision spacing still works', () => {
  const api = harness();
  const nodes = [{ id: 'a', x: 0, y: 0, vx: 0, vy: 0, radius: 5 }, { id: 'b', x: 100, y: 0, vx: 0, vy: 0, radius: 5 }];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const settings = { centerForce: 0, repelForce: 0, linkForce: 0, linkDistance: 78 };
  api.stepGraphPhysics(nodes, [{ from: 'a', to: 'b' }], byId, 800, 600, settings, 1);
  assert.equal(nodes[0].x, 0);
  assert.equal(nodes[1].x, 100);
  nodes[1].x = 1;
  api.stepGraphPhysics(nodes, [], byId, 800, 600, settings, 1);
  assert.ok(nodes[0].x < 0 && nodes[1].x > 1);
});

test('fit includes a large graph in a narrow viewport without a minimum-zoom crop', () => {
  const api = harness();
  const surface = {
    querySelector: () => null,
    __relationshipGraphViewport: { x: 0, y: 0, scale: 1 }
  };
  const nodes = [{ x: -2000, y: -1500 }, { x: 3000, y: 2500 }];
  api.fitViewportToNodes(surface, nodes, 360, 480);
  const state = surface.__relationshipGraphViewport;
  assert.ok(state.scale < 0.1);
  for (const node of nodes) {
    assert.ok(node.x * state.scale + state.x > 0 && node.x * state.scale + state.x < 360);
    assert.ok(node.y * state.scale + state.y > 0 && node.y * state.scale + state.y < 480);
  }
});

test('zoom updates SVG coordinates and keeps pointer picking aligned at 300%', () => {
  const api = harness();
  const attributes = {}, gridAttributes = {};
  const svg = {
    setAttribute: (key, value) => { attributes[key] = value; },
    querySelector: () => ({ setAttribute: (key, value) => { gridAttributes[key] = value; } })
  };
  const surface = {
    querySelector: (selector) => selector === '.relationship-graph-svg' ? svg : null,
    closest: () => null,
    style: { setProperty() {} },
    getBoundingClientRect: () => ({ left: 20, top: 50, width: 900, height: 600 }),
    __relationshipGraphViewport: { x: -300, y: -150, scale: 3 }
  };
  api.applyGraphViewport(surface);
  assert.equal(attributes.viewBox, '100 50 300 200');
  assert.equal(gridAttributes.width, '300');
  const point = api.getPointerGraphPoint(surface, { clientX: 470, clientY: 350 });
  assert.equal(point.x, 250);
  assert.equal(point.y, 150);
  surface.__relationshipGraphViewport.scale = 0.5;
  api.applyGraphViewport(surface);
  assert.equal(attributes.viewBox, '600 300 1800 1200');
});

test('layout is finite and deterministic for disconnected and cyclic graphs', () => {
  const api = harness();
  const nodes = [{ id: 'a', title: 'A', parent: 'b' }, { id: 'b', title: 'B', parent: 'a' }, { id: 'c', title: 'C' }];
  const edges = [{ from: 'a', to: 'b', type: 'mention' }];
  const first = api.layoutGraph(nodes, edges, 'a', 900, 600, 'global', api.getGraphSettings());
  const second = api.layoutGraph(nodes, edges, 'a', 900, 600, 'global', api.getGraphSettings());
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  first.forEach(n => assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('global layout separates 213 pages into non-overlapping database branches, even with compact physics settings', () => {
  const api = harness();
  const nodes = [{ id: 'home', type: 'home' }, { id: 'domain', type: 'domain', parent: 'home' }, { id: 'orphan', title: 'Unconnected' }];
  const edges = [{ from: 'home', to: 'domain', type: 'contains' }];
  const branches = [];
  for (let group = 0; group < 7; group += 1) {
    const id = `database-${group}`;
    branches.push(id);
    nodes.push({ id, parent: 'domain', layout: 'database' });
    edges.push({ from: 'domain', to: id, type: 'contains' });
    for (let row = 0; row < 29; row += 1) {
      nodes.push({ id: `${id}-row-${row}`, parent: id, type: 'database-row' });
      edges.push({ from: id, to: `${id}-row-${row}`, type: 'database-row' });
    }
  }
  // An actual cross-link is retained without collapsing the two database groups.
  edges.push({ from: 'database-0-row-0', to: 'database-5-row-0', type: 'relation' });
  const settings = { ...api.getGraphSettings(), centerForce: 100, repelForce: 0, linkForce: 100, linkDistance: 20 };
  const layout = api.layoutGraph(nodes, edges, 'home', 1600, 1000, 'global', settings);
  assert.equal(layout.length, 213);
  const byId = new Map(layout.map(n => [n.id, n]));
  const checkSpacing = () => {
    const circles = branches.map(id => {
      const hub = byId.get(id);
      return { ...hub, extent: Math.max(...layout.filter(n => n.id === id || n.parent === id).map(n => Math.hypot(n.x - hub.x, n.y - hub.y) + n.radius)) };
    });
    circles.forEach((a, index) => circles.slice(index + 1).forEach(b => {
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > a.extent + b.extent + 20, `${a.id} overlaps ${b.id}`);
    }));
  };
  checkSpacing();
  for (let i = 0; i < 100; i += 1) api.stepGraphPhysics(layout, edges, byId, 1600, 1000, settings, 1);
  checkSpacing();
  const wider = api.layoutGraph(nodes, edges, 'home', 1600, 1000, 'global', { ...settings, linkDistance: 180 });
  const span = items => Math.max(...items.map(n => n.x)) - Math.min(...items.map(n => n.x));
  assert.ok(span(wider) > span(layout));
});

test('deeply nested global branches stay compact instead of inflating ancestor footprints', () => {
  const api = harness();
  const nodes = [{ id: 'home', type: 'home' }], edges = [];
  for (let level = 0; level < 15; level += 1) {
    const id = `hub-${level}`, parent = level ? `hub-${level - 1}` : 'home';
    nodes.push({ id, parent });
    edges.push({ from: parent, to: id, type: 'contains' });
    for (let leaf = 0; leaf < 8; leaf += 1) {
      nodes.push({ id: `${id}-leaf-${leaf}`, parent: id });
      edges.push({ from: id, to: `${id}-leaf-${leaf}`, type: 'contains' });
    }
  }
  const layout = api.layoutGraph(nodes, edges, 'home', 1600, 1000, 'global', api.getGraphSettings());
  const span = key => Math.max(...layout.map(n => n[key])) - Math.min(...layout.map(n => n[key]));
  assert.ok(span('x') < 6000 && span('y') < 6000);
  assert.equal(layout.length, nodes.length);
});
