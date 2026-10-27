const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../page-database.js'),'utf8');
const bridge=source.slice(source.indexOf('  window.SanctumTimelineDatabase = {'),source.indexOf('\n  window.renderPageCalendarDatabase ='));
function harness() {
  let db={view:'table',filters:[{propertyId:'track',value:'School'}],properties:[{id:'name',type:'title'},{id:'date',type:'text'},{id:'private',type:'text'},{id:'calc',type:'formula'}],rows:[
    {id:'a',values:{name:'Exam',date:'2026-10-12',private:'Keep me',calc:'12'}},
    {id:'b',values:{name:'A hidden row',private:'Untouched'}}]};
  let saved=0, fail=false, exists=true, live=false, refreshes=0;
  const context={window:{},getCurrentPageRecord:()=>exists?{id:'db'}:null,
    getDatabaseFromSource:()=>structuredClone(db), getVisibleRows:db=>db.rows.slice(0,1),getDatabaseCalloutSources:()=>[],
    normalizeDatabase:value=>value, normalizeProperty:value=>value, isFolderDatabase:db=>db.folderState?.enabled,
    savePageDatabase:(id,value)=>{db=structuredClone(value);},
    saveDatabaseToSource:(source,value)=>{if(fail)return false;db=structuredClone(value);saved++;return true;},
    getRowById:(db,id)=>db.rows.find(row=>row.id===id),getPropertyById:(db,id)=>db.properties.find(p=>p.id===id),
    normalizeCellValue:(property,value)=>String(value), isTimestampProperty:()=>false, normalizeRowColor:value=>value,
    addRowToDatabase(db){const row={id:'new',values:{}};db.rows.push(row);return row;},
    applyStatusAutomation(){},getButtonDatabaseContext:()=>({context:{kind:live?'block':'page',blockEl:live?{}:null}}),
    syncDatabaseRowPageForRow(context,db,id){db.rows.find(r=>r.id===id).pageId='page-'+id;},
    rerenderDatabaseSourceIfVisible(){refreshes++;},rerenderCalendarContext(){refreshes++;},
    saveDatabaseForContext(context,value){db=structuredClone(value);saved++;}
  };
  vm.runInNewContext(bridge,context);
  return {api:context.window.SanctumTimelineDatabase,db:()=>db,saved:()=>saved,fail:()=>{fail=true;},remove:()=>{exists=false;},live:()=>{live=true;},refreshes:()=>refreshes};
}
test('timeline edits write to the latest original row and preserve filtered-out rows and unrelated fields',()=>{
  const h=harness(), source={kind:'page',pageId:'db'};
  const preview=h.api.get(source); preview.rows=[];
  h.db().rows[0].values.private='Changed elsewhere after opening';
  const row=h.api.saveEvent(source,'a',{date:'2026-10-15',name:'Updated exam',calc:'999'});
  assert.equal(h.db().rows.length,2);assert.equal(h.db().rows[1].values.private,'Untouched');
  assert.equal(h.db().rows[0].values.private,'Changed elsewhere after opening');
  assert.equal(h.db().rows[0].values.calc,'12');assert.equal(h.db().view,'table');
  assert.equal(h.db().filters[0].value,'School');assert.equal(row.pageId,'page-a');assert.equal(h.saved(),1);
});
test('timeline edits reject deleted sources, deleted rows and folder-owned records',()=>{
  const source={kind:'page',pageId:'db'};
  const h=harness(); assert.throws(()=>h.api.saveEvent(source,'gone',{}),/no longer/);
  h.db().folderState={enabled:true};assert.throws(()=>h.api.saveEvent(source,'a',{}),/cannot/);
  h.remove();assert.throws(()=>h.api.saveEvent(source,'a',{}),/cannot/);assert.equal(h.saved(),0);
});
test('failed timeline writes report failure rather than reporting a saved event',()=>{
  const h=harness();h.fail();assert.throws(()=>h.api.saveEvent({kind:'page',pageId:'db'},'a',{date:'2026-10-20'}),/Could not save/);
  assert.equal(h.db().rows[0].values.date,'2026-10-12');
});
test('a live inline source uses its native save path and new events join the same database',()=>{
  const h=harness();h.live();const source={kind:'block',pageId:'db',blockId:'inline'};
  h.api.addFields(source,[{id:'extra',name:'Extra',type:'text'}]);
  const row=h.api.saveEvent(source,'',{name:'New event',extra:'Linked'});
  assert.equal(h.db().rows.length,3);assert.equal(row.id,'new');assert.equal(h.db().rows[2].values.extra,'Linked');
  assert.equal(h.saved(),2);assert.ok(h.refreshes()>0);
});
test('archive keeps a recoverable event in its original source',()=>{
  const h=harness();h.api.saveEvent({kind:'page',pageId:'db'},'a',{}, {archived:true});
  assert.equal(h.db().rows.length,2);assert.equal(h.db().rows[0].archived,true);
  assert.ok(h.db().rows[0].archivedAt);
});
