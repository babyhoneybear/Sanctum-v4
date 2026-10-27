const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const catalog=require('../icon-catalog');
const paths=require('../assets/page-symbol-paths');

test('emoji and monochrome symbols remain separate, complete, and deduplicated',()=>{
  const emoji=catalog.search(),symbols=catalog.search({kind:'symbol'});
  assert.ok(emoji.length>=500);assert.ok(symbols.length>=350);
  assert.ok(emoji.every(e=>e.kind==='emoji'&&!e.value.startsWith('symbol:')));
  assert.ok(symbols.every(e=>e.kind==='symbol'&&paths[e.name]));
  assert.equal(new Set(symbols.map(e=>e.value)).size,symbols.length);
  for(const category of catalog.categories) {
    assert.ok(catalog.search({category:category.id}).length>=15,category.label);
    assert.ok(catalog.search({category:category.id,kind:'symbol'}).length>=15,category.label);
  }
});

test('search supports subject aliases, Japanese scripts, and health or historical periods',()=>{
  for(const query of ['coding','japanese','日本語','dragon','period','medieval','food','math','crochet']) {
    assert.ok(catalog.search({query}).length,query);
    assert.ok(catalog.search({kind:'symbol',query}).length,query);
  }
  assert.ok(catalog.search({kind:'symbol',query:'ひらがな'}).some(e=>e.glyph==='あ'));
  assert.ok(catalog.search({kind:'symbol',query:'ｋａｎｊｉ'}).length);
  assert.equal(catalog.search({query:'nonexistent-qxz'}).length,0);
  assert.ok(catalog.search({kind:'symbol',category:'food'}).every(e=>e.category==='food'));
});

test('symbols render from the allowlisted local catalog and inherit the theme color',()=>{
  assert.match(catalog.getSymbolMarkup('symbol:code',paths),/stroke="currentColor"/);
  assert.match(catalog.getSymbolMarkup('symbol:jp-5b66',paths),/>学<\/text>/);
  for(const value of ['symbol:__proto__','symbol:missing','symbol:<script>','https://example.com/icon.svg']) assert.equal(catalog.getSymbolMarkup(value,paths),'');
  for(const body of Object.values(paths)) assert.doesNotMatch(body,/<script|<foreignObject|\bon\w+=|\bhref=/i);
});

test('shared icon rendering handles saved symbols, emoji and images without stale state',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../ui-core.js'),'utf8');
  const context=vm.createContext({window:{SanctumIconCatalog:{getSymbolMarkup:value=>catalog.getSymbolMarkup(value,paths)}}});
  for(const name of ['escapeHTML','isImageIconValue','normalizeIconImageScale','getIconMarkup','setIconElementContent']) vm.runInContext(source.match(new RegExp(`^function ${name}\\([^]*?^\\}`,'m'))[0],context);
  const saved=JSON.parse(JSON.stringify({icon:'symbol:code'}));
  assert.match(context.getIconMarkup(saved.icon,'📄','item-icon'),/data-icon-type="symbol"/);
  assert.match(context.getIconMarkup('🐉'),/🐉/);
  assert.match(context.getIconMarkup('./assets/test.png'),/<img/);
  const props=new Map();
  const element={dataset:{},style:{setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)}};
  context.setIconElementContent(element,'./assets/test.png');
  context.setIconElementContent(element,'symbol:code');
  assert.equal(element.dataset.iconType,'symbol');assert.equal(props.size,0);
  assert.match(element.innerHTML,/<svg/);
  context.setIconElementContent(element,'🍜');
  assert.equal(element.dataset.iconType,'glyph');assert.equal(element.textContent,'🍜');
});
