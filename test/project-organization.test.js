const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../project-data.js');
const music = require('../soundbar-data.js');
const dbProject = () => ({id:'novel',title:'Novel',parent:'writing',containerType:'database-row',layout:'board-canvas',
  isScopeBoundary:true,databaseRowRef:{sourcePageId:'writing',sourceKind:'page',rowId:'row1'},category:'database-row',hiddenInSidebar:true,
  knowledgeProperties:[{id:'genre',value:'Fantasy'}],canonicalId:'original',extra:{keep:true}});
const records = () => [{id:'world',title:'World',type:'domain'}, {id:'writing',title:'Writing',parent:'world'},dbProject(),
  {id:'chapter',title:'Chapter 2',parent:'novel'}, {id:'scenes',title:'Scenes',parent:'chapter'},
  {id:'other',title:'Other project',parent:'writing',containerType:'project'},{id:'outside',title:'Unrelated scene',parent:'other'}];

test('legacy projects inside databases share the same project label and scope across readers', () => {
  const project=dbProject();
  assert.equal(M.role(project),'project'); assert.equal(M.label(project),'Project');
  assert.equal(M.isBoundary(project),true); assert.equal(music.scopeKind(project),'Project');
  assert.equal(M.project(records(),'scenes').id,'novel');
  assert.equal(M.project(records(),'outside').id,'other');
});

test('changing a database page role preserves its identity, content references and database membership', () => {
  const original=dbProject(), before=JSON.stringify(original);
  const page=M.withRole(original,'page');
  assert.equal(M.role(page),'page'); assert.equal(M.isBoundary(page),false);
  assert.equal(page.containerType,'database-row'); assert.equal(page.layout,original.layout);
  assert.deepEqual(page.databaseRowRef,original.databaseRowRef);
  assert.deepEqual(page.knowledgeProperties,original.knowledgeProperties);
  assert.deepEqual(page.extra,original.extra); assert.equal(page.canonicalId,'original');
  assert.equal(JSON.stringify(original),before);
  // Database row sync can update its storage kind without undoing the chosen role.
  page.containerType='project'; assert.equal(M.role(page),'page'); assert.equal(music.scopeKind(page),'Page');
  const restored=M.withRole(page,'project');
  assert.equal(M.role(restored),'project'); assert.equal(M.isBoundary(restored),true);
  assert.equal(music.scopeKind(restored),'Project');
  assert.equal(M.role(JSON.parse(JSON.stringify(restored))),'project');
});

test('ordinary pages change role without changing layout, parent or custom category', () => {
  const original={id:'a',containerType:'page',category:'character',layout:'document',parent:'novel',isScopeBoundary:false,definesScope:false};
  const project=M.withRole(original,'project');
  assert.equal(project.containerType,'project'); assert.equal(project.recordKind,'space'); assert.equal(M.isBoundary(project),true);
  assert.equal(project.category,'character'); assert.equal(project.layout,'document'); assert.equal(project.parent,'novel');
  assert.equal('definesScope' in project,false);
  const page=M.withRole(project,'page'); assert.equal(page.recordKind,'record'); assert.equal(M.isBoundary(page),false);
  assert.throws(()=>M.withRole(project,'invalid'));
  assert.throws(()=>M.withRole({type:'domain'},'page'));
});

test('contents come from the parent hierarchy and include database pages without following unrelated links', () => {
  const all=records();
  all.push({id:'nested',title:'Nested project',parent:'novel',containerType:'project'}, {id:'nested-note',title:'Note',parent:'nested'},
    {id:'duplicate',title:'Copy',parent:'other',canonicalId:'chapter'});
  assert.deepEqual(M.contents(all,'novel').map(entry=>entry.record.id).sort(),['chapter','nested','nested-note','scenes']);
  assert.equal(M.contents(all,'novel','chapter')[1].parents,'Chapter 2');
  assert.equal(M.project(all,'nested-note').id,'nested');
  assert.deepEqual(M.contents(all,'novel','unrelated'),[]);
  assert.equal(M.contents(all,'writing').some(entry=>entry.record.id==='novel'),true);
});

test('missing parents and cycles cannot hang project lookup or duplicate project contents', () => {
  const all=[{id:'a',parent:'b',organizationRole:'project'},{id:'b',parent:'a'}, {id:'missing',parent:'gone'}];
  assert.deepEqual(M.path(all,'b').map(record=>record.id),['b','a']);
  assert.deepEqual(M.contents(all,'a').map(entry=>entry.record.id),['b']);
  assert.equal(M.project(all,'missing'),null);
});

test('vault connection scopes and candidate labels use the shared organization role', () => {
  const source=fs.readFileSync(require.resolve('../ui-core.js'),'utf8');
  const fn=name=>source.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))[0];
  const context={window:{SanctumProjects:M},getVaultRecords:()=>records(),SYSTEM_PAGES:{}};
  vm.createContext(context);
  for (const name of ['isVaultScopeBoundary','getVaultScopeId']) vm.runInContext(fn(name),context);
  assert.equal(context.getVaultScopeId('scenes'),'novel');
  const page=M.withRole(dbProject(),'page');
  assert.equal(context.isVaultScopeBoundary(page),false);
});
