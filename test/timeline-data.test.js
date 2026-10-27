const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../timeline-data');
const backup = require('../backup-data');
const source = {kind:'page',pageId:'history'};
function fixture() {
  return {properties:[{id:'name',name:'Event',type:'title'},{id:'date',name:'Date',type:'date'},{id:'track',name:'Track',type:'text'},{id:'details',name:'Details',type:'text'}],rows:[
    {id:'one',pageId:'event-page',values:{name:'A long journey',date:'{"start":"2026-01-01","end":"2026-03-01"}',track:'Travel',details:'A shared event'}},
    {id:'two',values:{name:'A simultaneous event',date:'2026-02-01',track:'Travel'}},
    {id:'unknown',values:{name:'Date undecided'}}, {id:'deleted',archived:true,values:{name:'Archived',date:'2026-01-03'}}]};
}
test('Gregorian dates handle leap years and historical BCE/CE without introducing year zero', () => {
  const p = M.parseDate;
  assert.equal(p('2000-02-29').valid,true); assert.equal(p('1900-02-29').valid,false);
  assert.equal(p('2026-02-29').valid,false); assert.equal(p('0').valid,false);
  assert.equal(p('0001-01-01').ordinal-p('0001-12-31 BCE').ordinal,1);
  assert.equal(p('-0001-12-31').ordinal,p('0001-12-31 BCE').ordinal);
  assert.equal(p('1840').precision,'year'); assert.equal(p('~1840').approximate,true);
  assert.equal(p('2026-09-22 14:30').valid,true);
  assert.equal(p('2026-13-01').valid,false); assert.equal(p('2026-01-01 25:00').valid,false);
});
test('custom calendars use named months, their day lengths, hours, and era offsets', () => {
  const cal={kind:'custom',months:[{name:'Ember',days:20},{name:'Tide',days:24},{name:'Veil',days:18}],hours:28,eras:[{name:'Dawn',offset:0},{name:'Ash',offset:100}]};
  const p=value=>M.parseDate(value,cal);
  assert.equal(p('1-01-01').ordinal-p('0-01-01').ordinal,62);
  assert.equal(p('2-02-24 27:59 Dawn').valid,true);
  assert.equal(p('2-02-25 Dawn').valid,false);
  assert.equal(p('2-04-01 Dawn').valid,false);
  assert.equal(p('2 Ash').ordinal,p('102').ordinal);
  assert.equal(p('2 Unknown').valid,false);
  assert.equal(M.parseDate('0',{...cal,yearZero:false}).valid,false);
});

test('era setup proposes AF with year zero without changing the active Gregorian calendar', () => {
  const active = M.calendar(), before = JSON.stringify(active);
  const suggested = M.calendarSuggestion(['0 AF', '12 AF'], active);
  assert.equal(suggested.kind, 'fiction');
  assert.equal(suggested.yearZero, true);
  assert.deepEqual(suggested.eras, [{ name: 'AF', offset: 0 }]);
  assert.equal(M.parseDate('0 AF', suggested).valid, true);
  assert.ok(M.parseDate('12 AF', suggested).ordinal > M.parseDate('0 AF', suggested).ordinal);
  assert.equal(M.parseDate('0 AF', active).valid, false);
  assert.equal(JSON.stringify(active), before);
});

test('era setup preserves existing custom calendar rules and offsets', () => {
  const active = M.calendar({kind:'custom', months:[{name:'Ember',days:20}], hours:28,
    yearZero:false, eras:[{name:'Dawn',offset:100}]});
  const suggested = M.calendarSuggestion(['0 AF', '2 Dawn'], active);
  assert.deepEqual(suggested.months, active.months);
  assert.equal(suggested.hours, 28);
  assert.equal(suggested.eras[0].offset, 100);
  assert.equal(suggested.yearZero, true);
  assert.equal(active.yearZero, false);
  assert.equal(M.calendarSuggestion(['3 Dawn'], active), null);
});

test('era setup leaves historical dates and malformed dates to ordinary validation', () => {
  for (const values of [['0'], ['250 BCE'], ['0 CE'], ['not decided'], ['0 AF', '3-99-01 AF'], ['0 AF | 0']]) {
    assert.equal(M.calendarSuggestion(values), null);
  }
  const suggested = M.calendarSuggestion(['0 AF', '2 af']);
  assert.equal(suggested.eras.length, 1);
});

test('era abbreviations retain their meaning and accept the full name in dates', () => {
  const cal = M.calendar({kind:'fiction', eras:[{name:'AF', offset:0, fullName:'After the Fall'}]});
  assert.equal(cal.eras[0].fullName, 'After the Fall');
  assert.equal(M.parseDate('0 AF',cal).ordinal, M.parseDate('0 After the Fall',cal).ordinal);
  assert.equal(M.parseDate('12 after the fall',cal).valid, true);
  assert.equal(M.calendarSuggestion(['0 After the Fall'],cal), null);
  const restored = M.pasteSettings({}, M.captureSettings({sources:{'page:history':{calendar:cal}}},'history'),'history','copy');
  assert.equal(restored.sources['page:copy'].calendar.eras[0].fullName, 'After the Fall');
});

test('changing database dates preserves repeat and display metadata', () => {
  const original=JSON.stringify({start:'2026-10-01',end:'2026-10-02',repeat:'yearly',dateFormat:'long',timeFormat:'12h'});
  const patched=M.dateValuePatch(original,'2026-10-03 14:30','2026-10-04 16:00');
  assert.equal(patched.repeat,'yearly');assert.equal(patched.dateFormat,'long');assert.equal(patched.timeFormat,'12h');
  assert.equal(patched.start,'2026-10-03');assert.equal(patched.startTime,'14:30');assert.equal(patched.includeTime,true);
});
test('projections retain stable database identities, honor supplied filters, and never mutate records', () => {
  const db=fixture(), original=JSON.stringify(db);
  const events=M.events(db,source);
  assert.equal(events.length,3); assert.equal(events[0].id,'page:history:one');
  assert.equal(events[0].endText,'2026-03-01'); assert.equal(events[0].pageId,'event-page');
  assert.equal(events[2].dated,false);
  assert.equal(M.events(db,source,{},[db.rows[1]])[0].rowId,'two');
  assert.equal(JSON.stringify(db),original);
  db.rows[0].values.name='Corrected title';
  assert.equal(M.events(db,source)[0].title,'Corrected title');
});
test('invalid and reversed dates stay visible in the unplaced collection', () => {
  const db=fixture(); db.rows[0].values.date='{"start":"2026-05-01","end":"2026-03-01"}';
  db.rows[1].values.date='not decided';
  const view=M.layout(M.events(db,source));
  assert.equal(view.events.length,0); assert.equal(view.undated.length,3);
  assert.match(view.undated[0].error,/before/);
});
test('text date fields support historical years, durations and custom mappings', () => {
  const db={properties:[{id:'name',type:'title'},{id:'when',name:'When',type:'text'},{id:'until',name:'Until',type:'text'},{id:'photo',name:'Image',type:'text'}], rows:[{id:'war',values:{name:'Conflict',when:'100 BCE',until:'80 BCE',photo:'javascript:alert(1)'}}]};
  const e=M.events(db,source)[0]; assert.equal(e.dated,true); assert.ok(e.end.ordinal>e.start.ordinal);
  assert.equal(e.image,''); assert.equal(M.safeImage('/assets/worldbuilding/castle.jpg'),'/assets/worldbuilding/castle.jpg');
  assert.equal(M.safeImage('data:text/html,hello'),'');
});
test('overlapping durations and nearby labels occupy separate rows on proportional views', () => {
  const box=M.layout(M.events(fixture(),source),{style:'spans'},900);
  assert.notEqual(box.events[0].row,box.events[1].row);
  assert.ok(box.events[0].endX>box.events[1].x);
  assert.equal(box.scaled,true);
  for(const event of box.events) assert.ok(Number.isFinite(event.x)&&Number.isFinite(event.endX));
});
test('readable spacing does not collapse labels at minimum zoom or change dates', () => {
  const items=M.events(fixture(),source), original=JSON.stringify(items);
  const box=M.layout(items,{zoom:.5},500);
  assert.ok(box.events[1].x-box.events[0].x>=210);
  assert.equal(JSON.stringify(items),original);
});
test('backup round trips source calendar definitions and independent view preferences', () => {
  const timelines={sources:{'page:history':{calendar:M.calendar({kind:'fiction'})}},views:{'block:home:timeline':{style:'spans',theme:'paper'}}};
  const keys=Object.fromEntries(backup.STORAGE_FIELDS.map(([,key])=>[key,key]));
  const data=backup.buildBackupData({keys,readJSON:(key,fallback)=>key==='timelines'?timelines:fallback});
  const target={}; backup.importBackupData(data,{keys,readJSON:(key,fallback)=>target[key]??fallback,writeJSON:(key,value)=>{target[key]=value;}});
  assert.deepEqual(target.timelines,timelines);
});

test('page duplication preserves calendars, remaps local views, and retains external source links', () => {
  const store={sources:{'page:original':{calendar:{kind:'custom',months:[{name:'Dawn',days:20}]}},'page:unrelated':{calendar:{kind:'earth'}}},views:{'block:original:old-block':{style:'spans',sources:[{kind:'page',pageId:'original'},{kind:'page',pageId:'external'}]},'page:copy':{theme:'old'}}};
  const before=JSON.stringify(store), snapshot=M.captureSettings(store,'original');
  const copied=M.pasteSettings(store,snapshot,'original','copy',{'old-block':'new-block'});
  assert.equal(copied.sources['page:copy'].calendar.months[0].days,20);
  assert.equal(copied.views['block:copy:new-block'].sources[0].pageId,'copy');
  assert.equal(copied.views['block:copy:new-block'].sources[1].pageId,'external');
  assert.equal(copied.views['page:copy'],undefined);
  assert.ok(copied.sources['page:unrelated']);assert.equal(JSON.stringify(store),before);
});

test('description sizes survive normalization and page copies while external event sizes remain linked', () => {
  const sizes={'page:original:fall':420,'block:original:old-block:row':180,'page:external:other':72};
  const store={views:{'page:original':{descriptionHeights:sizes}}};
  const copy=M.pasteSettings(store,M.captureSettings(store,'original'),'original','copy',{'old-block':'new-block'});
  assert.deepEqual(M.view(copy.views['page:copy']).descriptionHeights,{'page:copy:fall':420,'block:copy:new-block:row':180,'page:external:other':72});
  assert.deepEqual(M.view({descriptionHeights:{negative:-1,invalid:'large',infinite:Infinity,valid:72.4,huge:20000}}).descriptionHeights,{valid:72,huge:10000});
  assert.deepEqual(M.view().descriptionHeights,{});
  assert.deepEqual(store.views['page:original'].descriptionHeights,sizes);
});

function clusteredEvents() {
  return M.events({ properties: [{id:'name',type:'title'},{id:'when',name:'When',type:'text'},{id:'track',name:'Track',type:'text'}],
    rows: ['2100','2150','2152','2152','2158'].map((when,i) => ({id:String(i),values:{name:'Moment '+i,when,track:'Person '+i}})) }, source);
}
test('illustrated time gaps keep mixed tracks and simultaneous events on one readable baseline', () => {
  for (const zoom of [.5,1,4]) {
    const box=M.layout(clusteredEvents(),{style:'illustrated',spacing:'time',zoom},1700);
    assert.equal(box.rows,1);
    assert.equal(box.scaled,false);
    box.events.forEach((event,i) => {
      assert.equal(event.row,0);
      if(i) assert.ok(event.x-box.events[i-1].x>=210);
      assert.ok(event.x+190<=box.width);
    });
  }
});
test('spans reuse free rows across tracks while separating collisions', () => {
  const box=M.layout(clusteredEvents(),{style:'spans'},1700);
  assert.equal(box.events[0].row,box.events[1].row);
  assert.notEqual(box.events[2].row,box.events[3].row);
  assert.ok(box.rows<box.events.length);
  for (let i=0;i<box.events.length;i++) for(let j=i+1;j<box.events.length;j++) {
    const a=box.events[i],b=box.events[j];
    if(a.row===b.row) assert.ok(Math.max(a.endX,a.x+185)+24<b.x);
  }
});

test('inline density fits narrower views without changing dates or allowing label collisions', () => {
  const items=clusteredEvents(), before=JSON.stringify(items);
  const full=M.layout(items,{spacing:'readable'},350);
  const inline=M.layout(items,{spacing:'readable'},350,{compact:true});
  assert.ok(inline.width<full.width);
  inline.events.forEach((event,i)=>{
    assert.ok(event.x>=22 && event.x+152<=inline.width);
    if(i) assert.ok(event.x-inline.events[i-1].x>=168);
  });
  const spans=M.layout(items,{style:'spans'},350,{compact:true});
  for(let i=0;i<spans.events.length;i++) for(let j=i+1;j<spans.events.length;j++) {
    const a=spans.events[i],b=spans.events[j];
    if(a.row===b.row) assert.ok(Math.max(a.endX,a.x+148)+16<b.x);
  }
  assert.deepEqual(inline.events.map(e=>e.start.ordinal),full.events.map(e=>e.start.ordinal));
  assert.equal(JSON.stringify(items),before);
});
