const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../character-sheet-data.js'),tree=require('../relationship-tree-data.js'),systems=require('../world-systems.js');
test('character starter retains existing shared fields and legacy text without duplicate property ids',()=>{
  const original={properties:[{id:'home',label:'Home',type:'text',value:'Old home notes'},
    {id:'old-magic',label:'Magic',type:'relation',relationKind:'proficiency',linkedPageIds:['wards'],linkLevels:{wards:'adept'}},
    {id:'note',label:'Notes',type:'text',value:'Keep me'}]};
  const result=M.ensure(original);assert.deepEqual(M.field(result,'magic'),original.properties[1]);
  assert.equal(M.field(result,'home').type,'relation');assert.equal(result.properties[0].value,'Old home notes');
  assert.equal(new Set(result.properties.map(p=>p.id)).size,result.properties.length);
  assert.deepEqual(M.ensure(result),result);assert.equal(original.properties.length,3);
});
test('character starter connects to the same ancestry and proficiency models',()=>{
  const props={hero:M.ensure(),wards:{properties:[{id:'levels',type:'relation',relationKind:'proficiency-levels',linkedPageIds:['adept']} ]},
    spell:{properties:[{id:'requirements',type:'relation',relationKind:'spell-requirements',linkedPageIds:['adept']}]}};
  M.field(props.hero,'parents').linkedPageIds=['mother'];M.field(props.hero,'magic').linkedPageIds=['wards'];M.field(props.hero,'magic').linkLevels={wards:'adept'};
  const pages=['hero','mother','wards','adept','spell'].map(id=>({id}));
  const link=tree.collect(pages,props).find(e=>e.kind==='parent');assert.equal(link.from,'hero');assert.equal(link.to,'mother');
  assert.equal(systems.evaluate(pages,props,'hero','spell').status,'eligible');
  M.field(props.hero,'magic').linkLevels={};assert.equal(systems.evaluate(pages,props,'hero','spell').status,'unmet');
});
test('starter sections have no overlapping blocks and optional additions bind to the same character',()=>{
  const blocks=M.build('hero');assert.ok(blocks.some(b=>b.characterSection==='magic'));assert.ok(!blocks.some(b=>b.characterSection==='combat'));
  for(const [i,a] of blocks.entries())for(const b of blocks.slice(i+1))assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);
  const bottom=Math.max(...blocks.map(b=>b.y+b.h));const more=M.build('hero',{selected:['combat','health'],startY:bottom+48});assert.ok(more.every(b=>b.y>bottom));
  assert.ok(blocks.filter(b=>b.type==='connections').every(b=>b.connectionSourcePageId==='hero'));
  assert.equal(M.build('hero',{infinite:true})[0].x,M.frame(1280,true).left);
});
test('starter uses balanced margins and upgrades old widths without replacing user content',()=>{
  const legacy=M.build('hero',{width:936}).map(b=>({...b,x:b.x-M.frame().left+48,characterLayout:undefined,bodyHTML:'My saved writing'}));
  const fitted=M.fit(legacy,1920);const frame=M.frame(1920);
  assert.equal(fitted[0].x,frame.left);assert.equal(fitted[0].w,frame.width);
  assert.equal(1920-(fitted[0].x+fitted[0].w),fitted[0].x);
  assert.ok(fitted.every((b,i)=>b.bodyHTML===legacy[i].bodyHTML&&b.y===legacy[i].y&&b.id===legacy[i].id));
  assert.deepEqual(M.fit(fitted,1280),M.fit(legacy,1280));
  const moved=legacy.map(b=>({...b}));moved[2].x+=24;assert.equal(M.fit(moved,1920),moved);
  const mixed=[...legacy,{id:'custom',x:1300,w:200}];assert.equal(M.fit(mixed,1920),mixed);
  const above={id:'old-notes',x:48,y:0,w:936,h:120};
  const appended=[above,...legacy.map(b=>({...b,y:b.y+400}))];
  const adjusted=M.fit(appended,1920);assert.equal(adjusted[0],above);assert.equal(adjusted[1].w,frame.width);
  assert.equal(M.readLayout('invalid'),undefined);
});
