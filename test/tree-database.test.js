const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../relationship-tree-data.js');
const code=fs.readFileSync(require.resolve('../page-database.js'),'utf8');
const bridge=code.slice(code.indexOf('  function treeRow('),code.indexOf('  function mountTimelineSurface('));
function harness(){
  let fail=false,serial=0;
  const dbs={people:{properties:[{id:'name',type:'title',name:'Name'},{id:'parents',type:'relation',name:'Parents',treeKind:'parent',relationTarget:{kind:'page',pageId:'people'}},{id:'born',name:'Born',type:'text'},{id:'notes',name:'Notes',type:'text'}],rows:[{id:'ada',pageId:'p-ada',values:{name:'Ada',born:'1800',notes:'Keep'}},{id:'ben',pageId:'p-ben',values:{name:'Ben',notes:'Unrelated'}},{id:'cleo',pageId:'p-cleo',values:{name:'Cleo',parents:'["ada"]'}}]}};
  const pages=dbs.people.rows.map(r=>({id:r.pageId,title:r.values.name,databaseRowRef:{sourceKind:'page',sourcePageId:'people',rowId:r.id}}));pages.push({id:'ordinary',title:'Ordinary page'});
  const key=s=>`${s.kind||'page'}:${s.pageId}:${s.blockId||''}`;
  const parse=v=>Array.isArray(v)?v:v?JSON.parse(v):[];
  const ctx={window:{SanctumTreeData:M,userPages:pages},
    getCurrentPageRecord:id=>pages.find(p=>p.id===id),getDatabaseFromSource:s=>s&&dbs[s.pageId]?structuredClone(dbs[s.pageId]):null,
    getRowById:(db,id)=>db.rows.find(r=>r.id===id),getPropertyById:(db,id)=>db.properties.find(p=>p.id===id),
    getButtonDatabaseContext:()=>({context:{kind:'page'}}),syncDatabaseRowPages(){},
    saveDatabaseToSource:(s,db)=>{if(fail)return false;dbs[s.pageId]=structuredClone(db);return true;},
    rerenderDatabaseSourceIfVisible(){},getRowTitle:(db,row)=>row.values.name,getBoardCardPreviewSource:r=>r.icon||'',
    isFolderDatabase:db=>!!db.folderState?.enabled,getDatabaseSourceKey:key,getRelationSource:p=>p.relationTarget,
    parseRelationValues:parse,serializeRelationValue:v=>JSON.stringify([...new Set(parse(v))]),syncRelationBacklinks(){},
    normalizeProperty:p=>({...p}),normalizeCellValue:(p,v)=>v,createId:()=>`field-${++serial}`,
    syncDatabaseRowPageTitleFromRow:(id,row)=>{pages.find(p=>p.id===id).title=row.values.name;}
  };
  vm.runInNewContext(bridge,ctx);return {api:ctx.window.SanctumTreeDatabase,dbs,pages,fail:()=>{fail=true;}};
}
test('tree person edits update the original row and page name without overwriting other data',()=>{
  const h=harness();h.api.savePerson('p-ada',{title:'Ada Vale',image:'/portrait.jpg'});
  assert.equal(h.dbs.people.rows[0].values.name,'Ada Vale');assert.equal(h.pages[0].title,'Ada Vale');
  assert.equal(h.dbs.people.rows[0].values.notes,'Keep');assert.equal(h.dbs.people.rows[0].values.born,'1800');
  assert.equal(h.dbs.people.rows[0].icon,'/portrait.jpg');assert.equal(h.dbs.people.rows[1].values.notes,'Unrelated');
  assert.equal(h.api.savePerson('ordinary',{title:'New'}),false);
});
test('tree connections edit native relation cells once; reading reflects edits made in the table',()=>{
  const h=harness();h.api.connect('p-cleo','p-ben','parent','');h.api.connect('p-cleo','p-ben','parent','');
  assert.deepEqual(JSON.parse(h.dbs.people.rows[2].values.parents),['ada','ben']);
  let links=h.api.edges(h.pages);assert.equal(links.length,2);
  h.dbs.people.rows[2].values.parents='["ben"]';links=h.api.edges(h.pages);assert.equal(links.length,1);assert.equal(links[0].to,'p-ben');
  h.api.unlink(links[0].refs[0]);assert.equal(h.api.edges(h.pages).length,0);assert.equal(h.dbs.people.rows.length,3);
});
test('adding social connections creates a typed relation column without changing parent fields',()=>{
  const h=harness();h.api.connect('p-ada','p-ben','friend','');
  const field=h.dbs.people.properties.find(p=>p.treeKind==='friend');assert.equal(field.relationTarget.pageId,'people');
  assert.deepEqual(JSON.parse(h.dbs.people.rows[0].values[field.id]),['ben']);assert.equal(h.dbs.people.rows[2].values.parents,'["ada"]');
  assert.equal(h.api.connect('ordinary','p-ada','friend',''),false);
});
test('folder and deleted row edits fail instead of creating detached page relationships',()=>{
  const h=harness();h.dbs.people.folderState={enabled:true};
  assert.throws(()=>h.api.savePerson('p-ada',{title:'No'}),/source folder/);assert.throws(()=>h.api.connect('p-ada','p-ben','friend',''),/source folder/);
  h.dbs.people.rows.shift();assert.throws(()=>h.api.savePerson('p-ada',{title:'No'}),/no longer/);assert.throws(()=>h.api.connect('p-ada','ordinary','friend',''),/no longer/);
});
test('failed writes leave source rows and names intact and report the failure',()=>{
  const h=harness();h.fail();assert.throws(()=>h.api.savePerson('p-ada',{title:'Changed'}),/Could not save/);
  assert.equal(h.dbs.people.rows[0].values.name,'Ada');assert.equal(h.pages[0].title,'Ada');
});
test('native backlink path never copies typed or recognized family relations into other columns',()=>{
  const fn=code.slice(code.indexOf('  function syncRelationBacklinks('),code.indexOf('  function syncRowBacklinksOnDelete('));
  const ctx={window:{SanctumTreeData:M},normalizePropertyType:t=>t,getRelationSource(){throw new Error('Should not copy this connection');}};
  vm.runInNewContext(fn,ctx);
  for(const p of [{type:'relation',name:'Parents'},{type:'relation',name:'Friends'},{type:'relation',treeKind:'custom',name:'Sworn to'}])assert.doesNotThrow(()=>ctx.syncRelationBacklinks({}, {}, 'ada',p,'','["ben"]'));
});
