const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../relationship-tree-data.js');
const pages=['ada','ben','cleo','dara','eli','faye'].map(id=>({id,title:id}));
const edge=(a,b,kind='parent')=>M.edge(a,b,{treeKind:kind},{kind:'page',pageId:a,target:b});
test('people picker stays in its source project and permits explicit project and custom type choices',()=>{
  const records=[{id:'a',title:'Ada',category:'character',project:'coast'},
    {id:'b',title:'Ben',category:'character',project:'school'},
    {id:'c',title:'Castle',category:'location',project:'coast'},
    {id:'d',title:'Dara',category:'custom-type-fae',project:'coast'},
    {id:'e',title:'Eli',category:'none',project:'coast'},
    {id:'f',title:'Faye',category:'character',project:''}];
  const options={pages:records,scopeId:'coast',getScopeId:id=>records.find(p=>p.id===id).project,peopleIds:['e'],type:'people'};
  const ids=opts=>M.candidates({...options,...opts}).map(p=>p.id);
  assert.deepEqual(ids({}),['a','e']);
  assert.deepEqual(ids({scopeId:'school'}),['b']);
  assert.deepEqual(ids({scopeId:''}),['f']);
  assert.deepEqual(ids({type:'custom-type-fae'}),['d']);
  assert.deepEqual(ids({allScopes:true,excluded:['a','e']}),['b','f']);
  assert.deepEqual(ids({query:'the healer',names:p=>p.id==='a'?['Ada','The healer']:[p.title]}),['a']);
});
test('character connection presets produce correctly directed shared tree relationships',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require('node:path').join(__dirname,'../page-props.js'),'utf8');
  const presets=vm.runInNewContext(source.slice(source.indexOf('const PAGE_RELATION_PRESETS'),source.indexOf('// Default property schemas'))+'; PAGE_RELATION_PRESETS');
  const props={ada:{properties:[{id:'children',type:'relation',...presets.children,linkedPageIds:['cleo']}]},
    cleo:{properties:[{id:'parents',type:'relation',...presets.parents,linkedPageIds:['ada']}]}};
  const links=M.collect(pages,props);
  assert.equal(links.length,1);assert.equal(links[0].from,'cleo');assert.equal(links[0].to,'ada');
  assert.equal(links[0].generation,true);assert.equal(links[0].refs.length,2);
  props.cleo.properties[0].linkedPageIds=[];
  assert.equal(M.collect(pages,props).length,1);
  props.ada.properties[0].linkedPageIds=[];
  assert.equal(M.collect(pages,props).length,0);
});
test('page and database relationships merge, including inverse labels, without duplicate people or edges',()=>{
  const props={ada:{properties:[{id:'children',type:'relation',label:'Children',linkedPageIds:['cleo']}]},cleo:{properties:[{id:'parents',type:'relation',label:'Parents',linkedPageIds:['ada','ada','gone']}]}};
  const edges=M.collect(pages,props,[edge('cleo','ada')]);
  assert.equal(edges.length,1);assert.equal(edges[0].from,'cleo');assert.equal(edges[0].to,'ada');assert.equal(edges[0].refs.length,3);
  assert.equal(M.collect(pages,{},[edge('ada','ben','partner'),edge('ben','ada','partner')]).length,1);
});
test('family view hides social relationships and custom lines unless explicitly enabled',()=>{
  const family=edge('cleo','ada'),friend=edge('cleo','dara','friend'),custom=M.edge('dara','eli',{label:'Sworn to'},{});
  const defaultView=M.view();assert.equal(M.visibleEdge(family,defaultView),true);assert.equal(M.visibleEdge(friend,defaultView),false);
  assert.equal(M.visibleEdge(custom,M.view({enabled:['custom:sworn to']})),true);
  assert.equal(M.layout(pages,[family,friend],{enabled:[]}).links.length,0);
});
test('adding a parent rejects ancestry cycles but allows multiple partners and nonfamily cycles',()=>{
  const links=[edge('cleo','ada'),edge('dara','cleo')];
  assert.throws(()=>M.validate(links,'ada','dara','adoptive'),/own ancestor/);
  assert.throws(()=>M.validate(links,'ada','ada','partner'),/different/);
  assert.doesNotThrow(()=>M.validate(links,'ada','dara','friend'));
  assert.doesNotThrow(()=>M.validate(links,'dara','ben','parent'));
});
test('generation layout aligns partners, prevents overlapping cards, and keeps manual positions',()=>{
  const links=[edge('ada','ben','partner'),edge('cleo','ada'),edge('cleo','ben'),edge('dara','ada'),edge('eli','cleo')];
  const result=M.layout(pages,links);const get=id=>result.nodes.find(p=>p.id===id);
  assert.equal(get('ada').y,get('ben').y);assert.ok(get('cleo').y>get('ada').y);assert.ok(get('eli').y>get('cleo').y);
  result.nodes.forEach((a,i)=>result.nodes.slice(i+1).forEach(b=>assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y)));
  assert.equal(M.layout(pages,links,{positions:{cleo:{x:-50,y:999}}}).nodes.find(p=>p.id==='cleo').x,-50);
});
test('collapse preserves children belonging to an expanded parent and only changes this view',()=>{
  const links=[edge('cleo','ada'),edge('cleo','ben'),edge('dara','cleo')];
  assert.ok(M.layout(pages,links,{collapsed:['ada']}).nodes.some(n=>n.id==='cleo'));
  const compact=M.layout(pages,links,{collapsed:['ada','ben']});
  assert.equal(compact.nodes.some(n=>['cleo','dara'].includes(n.id)),false);
  assert.equal(M.layout(pages,links).nodes.length,pages.length);
});
test('existing cycles are reported, do not hang, and do not move cards infinitely downward',()=>{
  const result=M.layout(pages,[edge('ada','ben'),edge('ben','ada')]);assert.equal(result.cycle,true);
  assert.ok(result.nodes.every(n=>Number.isFinite(n.x)&&n.y<2000));
});
test('page edits preserve unrelated properties and reuse a matching relation without duplicates',()=>{
  const original={properties:[{id:'note',type:'text',label:'Notes',value:'Keep'},{id:'parents',type:'relation',label:'Parents',linkedPageIds:['ada']}]};
  const changed=M.pagePatch(original,'ada','parent');assert.equal(changed.properties.length,2);assert.equal(changed.properties[1].linkedPageIds.length,1);
  const custom=M.pagePatch(changed,'eli','custom','Sworn to');assert.equal(custom.properties[0].value,'Keep');assert.equal(M.classify(custom.properties[2]).kind,'custom:sworn to');assert.equal(original.properties.length,2);
});
