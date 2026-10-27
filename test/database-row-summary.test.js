const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../page-database.js'), 'utf8');
const start = source.indexOf('  function getDatabaseRowPeekData(');
const implementation = source.slice(start, source.indexOf('\n  function findDatabaseRowForPage', start));

function harness() {
  let editorBuilds = 0, synchronizations = 0;
  const row = {id:'row',pageId:'entry',values:{name:'Latest title'},cover:'cover.webp'};
  const database = {title:'Characters',properties:[{id:'name',type:'title'},{id:'notes',type:'text'}],rows:[row]};
  const app = {
    getCurrentPageRecord:()=>({id:'entry',databaseRowRef:{sourceKind:'page',sourcePageId:'db',rowId:'row'}}),
    isDatabaseRowPageRecord:()=>true,normalizeDatabaseRowPageRef:value=>value,
    getDatabaseFromSource:()=>database,getRowById:(db,id)=>db.rows.find(row=>row.id===id),
    getRowTitle:(db,row)=>row.values.name,getDatabaseRowPageIcon:()=>'icon',getBoardCardPreviewSource:row=>row.cover,
    syncDatabaseRowPageRecordFromSource(){synchronizations++;return {};},
    getPropertyIcon:()=>'text',
    buildDatabaseRowPeekPropertyEditorHTML(){editorBuilds++;return '<input>';},
    buildDatabaseRowPeekPropertyValueHTML:()=>'<span>Notes</span>'
  };
  vm.createContext(app);vm.runInContext(implementation, app);
  return {app,row,editorBuilds:()=>editorBuilds,synchronizations:()=>synchronizations};
}

test('live row summaries read current titles and covers without synchronizing pages or building editors', () => {
  const h = harness();
  const result = h.app.getDatabaseRowPeekData('entry', {summaryOnly:true});
  assert.equal(result.title, 'Latest title');assert.equal(result.coverSource, 'cover.webp');
  assert.equal(result.missing, false);assert.equal(h.editorBuilds(), 0);assert.equal(h.synchronizations(), 0);
  h.row.values.name = 'Edited title';
  assert.equal(h.app.getDatabaseRowPeekData('entry', {summaryOnly:true}).title, 'Edited title');
});

test('opening an actual row peek still synchronizes its page and builds editable properties', () => {
  const h = harness(), result = h.app.getDatabaseRowPeekData('entry');
  assert.equal(result.title, 'Latest title');assert.equal(result.properties[0].editorHTML, '<input>');
  assert.equal(h.editorBuilds(), 1);assert.equal(h.synchronizations(), 1);
});
