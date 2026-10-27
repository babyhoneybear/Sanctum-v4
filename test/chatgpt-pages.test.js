const test=require('node:test');
const assert=require('node:assert/strict');
const {createService}=require('../chatgpt-pages');
const database=require('../chatgpt-database');
const clone=value=>structuredClone(value);
function harness() {
  let pages=[{id:'life',title:'Life',parent:'home',layout:'board-canvas'},{id:'story',title:'Story',parent:'home',layout:'board-canvas'},
    {id:'life-notes',title:'Notes',parent:'life',layout:'board-canvas'},{id:'story-notes',title:'Notes',parent:'story',layout:'board-canvas'}];
  let blocks={'life-notes':[{id:'keep',type:'text',bodyHTML:'Original',x:24,y:24,w:480,h:0}]},settings={},history=[],failRender=false,failHistory=false,external=false;
  const env={pages:()=>clone(pages),blocks:()=>clone(blocks),writeBlocks:value=>{blocks=clone(value);return true;},
    getSettings:id=>clone(settings[id]||{showTitle:true}),defaultSettings:()=>({showTitle:true}),fontPresets:()=>['','playfair','times'],
    normalizeAppearance:raw=>({...{fontSize:0,titleSize:0,overlaySource:'',textAlign:''},...(typeof raw==='string'?JSON.parse(raw):raw)}),
    createOrdinaryPage:config=>{const page={id:config.pageId,title:config.title,parent:config.parentId,layout:config.layout};pages.push(page);return page;},
    updatePage:(id,patch)=>{Object.assign(pages.find(page=>page.id===id),clone(patch));return true;},
    saveSettings:(id,value)=>{settings[id]=clone(value);return true;},deletePages:ids=>{pages=pages.filter(page=>!ids.includes(page.id));for(const id of ids){delete blocks[id];delete settings[id];}return true;},
    readHistory:()=>clone(history),writeHistory:value=>{if(failHistory)return false;history=clone(value);return true;},flush:async()=>true,flushLive:async()=>{},
    arrangePage:async()=>{if(failRender)throw new Error('overlaps');return {measured:true};},hasExternalReference:()=>external};
  const access=database.createService(env),service=createService(env,access);
  const update=extra=>({mode:'update',target:{pageId:'life-notes'},expectedVersion:service.readPage({target:{pageId:'life-notes'}}).version,...extra});
  return {service,env,update,pages:()=>pages,blocks:()=>blocks,settings:()=>settings,history:()=>history,failRender:()=>{failRender=true;},failHistory:()=>{failHistory=true;},external:()=>{external=true;}};
}
const create=extra=>({mode:'create',target:{pageId:'life'},title:'Places & Nations',...extra});
test('page reads clarify duplicate destinations, enforce scope and paginate with one stable version',()=>{
  const h=harness();assert.throws(()=>h.service.readPage({target:{path:'Notes'}}),/ambiguous/);
  assert.equal(h.service.readPage({target:{path:'Notes'},scope:{pageId:'life'}}).page.id,'life-notes');
  assert.throws(()=>h.service.readPage({target:{pageId:'story-notes'},scope:{pageId:'life'}}),/not found/);
  const a=h.service.readPage({target:{pageId:'life-notes'},limit:1});
  assert.equal(a.blocks[0].bodyHTML,'Original');assert.equal(a.nextOffset,null);
  assert.equal(a.version,h.service.readPage({target:{pageId:'life-notes'},offset:1}).version);
});
test('plans create native editable parent/child pages and escaped blocks without writes, then Undo removes only those pages',async()=>{
  const h=harness(),initial=clone(h.pages());
  const plan=h.service.planPage({request:{scope:{pageId:'life'},pages:[create({key:'hub',settings:{theme:'dark',headerSrc:'assets/worldbuilding/hero.jpg',showHeader:true},blocks:[
    {kind:'heading',text:'<script>alert(1)</script>',style:{appearance:{titleSize:30}}},
    {kind:'list',items:['One','Two']},{kind:'image',image:'assets/worldbuilding/castle.jpg',alt:'Castle'}]}),
    {mode:'create',parentKey:'hub',key:'nation',title:'Solvenne',blocks:[{kind:'page-link',link:{pageKey:'hub'},cardView:'gallery'}]}]}});
  assert.deepEqual(h.pages(),initial);assert.equal(h.history().length,0);
  const result=await h.service.applyPage({planId:plan.planId});assert.equal(result.pages.length,2);
  assert.equal(h.pages().find(page=>page.id===result.pages[1].pageId).parent,result.pages[0].pageId);
  assert.match(h.blocks()[result.pages[0].pageId][0].bodyHTML,/&lt;script&gt;/);
  assert.equal(h.blocks()[result.pages[1].pageId][0].linkedPageId,result.pages[0].pageId);
  assert.equal((await h.service.applyPage({planId:plan.planId})).alreadyApplied,true);
  await h.service.undoPage({changeId:result.changeId});assert.deepEqual(h.pages(),initial);
});
test('geometry and styling preserve omitted content, blocks and page settings; Undo restores exactly',async()=>{
  const h=harness(),original=clone(h.blocks());
  const plan=h.service.planPage({request:{pages:[h.update({settings:{fontPreset:'playfair'},blocks:[{blockId:'keep',position:{x:600,width:360},style:{background:'#112233',padding:12}}]})]}});
  const result=await h.service.applyPage({planId:plan.planId});const block=h.blocks()['life-notes'][0];
  assert.equal(block.bodyHTML,'Original');assert.equal(block.x,600);assert.equal(block.bg,'#112233');assert.equal(h.settings()['life-notes'].showTitle,true);
  await h.service.undoPage({changeId:result.changeId});assert.deepEqual(h.blocks(),original);
});
test('stale page edits and renamed destinations prevent all writes',async()=>{
  const h=harness(),plan=h.service.planPage({request:{pages:[h.update({blocks:[{kind:'text',text:'New'}]})]}});
  h.blocks()['life-notes'][0].bodyHTML='User edit';
  await assert.rejects(h.service.applyPage({planId:plan.planId}),/changed/);assert.equal(h.history().length,0);
  const other=h.service.planPage({request:{pages:[create()]}});h.pages()[0].title='Renamed';
  await assert.rejects(h.service.applyPage({planId:other.planId}),/renamed/);
});
test('block removal requires the listed data loss authorization and is recoverable',async()=>{
  const h=harness(),plan=h.service.planPage({request:{pages:[h.update({removeBlockIds:['keep']})]}});
  assert.equal(plan.losses.length,1);await assert.rejects(h.service.applyPage({planId:plan.planId}),/Authorize/);
  const result=await h.service.applyPage({planId:plan.planId,allowDataLoss:true});assert.equal(h.blocks()['life-notes'].length,0);
  await h.service.undoPage({changeId:result.changeId});assert.equal(h.blocks()['life-notes'][0].bodyHTML,'Original');
});
test('a rendered overlap rolls back the entire multi-page build',async()=>{
  const h=harness(),initial=clone(h.pages()),original=clone(h.blocks());
  const plan=h.service.planPage({request:{pages:[create(),h.update({blocks:[{blockId:'keep',text:'Changed'}]})]}});
  h.failRender();await assert.rejects(h.service.applyPage({planId:plan.planId}),/overlaps/);
  assert.deepEqual(h.pages(),initial);assert.deepEqual(h.blocks(),original);assert.equal(h.history()[0].status,'rolled-back');
});
test('failed durable recovery stops page creation before any mutation',async()=>{
  const h=harness(),initial=clone(h.pages()),plan=h.service.planPage({request:{pages:[create()]}});
  h.failHistory();await assert.rejects(h.service.applyPage({planId:plan.planId}),/recovery history/);assert.deepEqual(h.pages(),initial);
});
test('Undo refuses later block edits, children or new incoming page links',async()=>{
  const h=harness(),plan=h.service.planPage({request:{pages:[create({blocks:[{kind:'text',text:'Hello'}]})]}}),result=await h.service.applyPage({planId:plan.planId});
  const block=h.blocks()[result.pages[0].pageId][0];block.bodyHTML='Later edit';await assert.rejects(h.service.undoPage({changeId:result.changeId}),/changed afterward/);
  block.bodyHTML='Hello';h.pages().push({id:'new-child',parent:result.pages[0].pageId,title:'Later child'});await assert.rejects(h.service.undoPage({changeId:result.changeId}),/changed afterward/);
  h.pages().pop();h.external();await assert.rejects(h.service.undoPage({changeId:result.changeId}),/linked from elsewhere/);
});
test('unknown fields, executable image sources, cross-scope links and forged block IDs are rejected',()=>{
  const h=harness();
  for(const block of [{kind:'image',image:'javascript:alert(1)'},{kind:'image',image:'assets/../secret.png'},{kind:'text',text:'Hi',html:'<b>Injected</b>'},{kind:'page-link',link:{pageId:'story'}},{blockId:'not-on-page',position:{x:100}}]) {
    assert.throws(()=>h.service.planPage({request:{scope:{pageId:'life'},pages:[h.update({blocks:[block]})]}}));
  }
  assert.equal(h.history().length,0);
});
test('repeated proposed sibling titles and canonical local database removal cannot slip through page plans',()=>{
  const h=harness();assert.throws(()=>h.service.planPage({request:{pages:[create(),create()]}}),/already exists/);
  h.blocks()['life-notes'].push({id:'local-db',type:'calendar',dbSourceKind:'block',dbSourcePageId:'life-notes',dbSourceBlockId:'local-db'});
  assert.throws(()=>h.service.planPage({request:{pages:[h.update({removeBlockIds:['local-db']})]}}),/local database/);
});
test('text updates preserve an existing heading when its formatting is omitted',async()=>{
  const h=harness();h.blocks()['life-notes'][0].bodyHTML='<h2>Original</h2>';
  const plan=h.service.planPage({request:{pages:[h.update({blocks:[{blockId:'keep',text:'Updated heading'}]})]}});
  await h.service.applyPage({planId:plan.planId});assert.equal(h.blocks()['life-notes'][0].bodyHTML,'<h2>Updated heading</h2>');
});
