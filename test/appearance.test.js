const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {normalizeAppearance, getSavedBlockAppearance} = require('../appearance');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const fn = (file, name) => read(file).match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'))[0];

test('appearance normalizes malformed data, bounds values, and rejects unsafe overlay sources', () => {
  for (const raw of [null, [], '{broken', 7]) assert.deepEqual(normalizeAppearance(raw), normalizeAppearance());
  const cfg = normalizeAppearance({brightness:900, saturation:-10, titleSize:'42', rowHeight:'bad', gradientColor:'red; background:url(x)', overlaySource:'javascript:alert(1)'});
  assert.equal(cfg.brightness,200); assert.equal(cfg.saturation,0); assert.equal(cfg.titleSize,42);
  assert.equal(cfg.rowHeight,0); assert.equal(cfg.overlaySource,''); assert.equal(cfg.gradientColor,'#080909');
  for (const src of ['//evil.test/image','https://site.test/a\nb','file:///C:/image.jpg']) assert.equal(normalizeAppearance({overlaySource:src}).overlaySource,'');
  for (const src of ['assets/worldbuilding/red-roses.jpg','https://example.com/image.png','data:image/png;base64,YQ==']) assert.equal(normalizeAppearance({overlaySource:src}).overlaySource,src);
});

test('legacy effects migrate once while an explicit reset survives reloading', () => {
  const legacy = getSavedBlockAppearance({dashboardRole:'footer-art'});
  assert.equal(legacy.brightness,65); assert.equal(legacy.overlayWidth,45);
  const custom = {...legacy,brightness:112,overlaySource:''};
  assert.deepEqual(getSavedBlockAppearance({dashboardRole:'footer-art',appearance:JSON.stringify(custom)}),custom);
  assert.deepEqual(getSavedBlockAppearance({dashboardRole:'footer-art',appearance:'{}'}),normalizeAppearance());
  assert.deepEqual(getSavedBlockAppearance({type:'image'}),normalizeAppearance());
});

test('preview does not persist; reset removes active CSS effects', () => {
  const properties = new Map(), attrs = new Set();
  const block = {dataset:{},classList:{add(){}},style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)},toggleAttribute:(k,v)=>v?attrs.add(k):attrs.delete(k)};
  const sandbox = vm.createContext({window:{},document:{getElementById:()=>null}});
  vm.runInContext(read('appearance.js'),sandbox);
  const apply = sandbox.window.applyBlockAppearance;
  apply(block,{brightness:80,titleSize:32,headingRule:true});
  const saved = block.dataset.appearance;
  apply(block,{brightness:150,overlaySource:'assets/rose.jpg'},false);
  assert.equal(block.dataset.appearance,saved);
  assert.equal(properties.get('--appearance-brightness'),'150%');
  apply(block,{});
  assert.equal(properties.get('--appearance-overlay-image'),'none');
  assert.equal(properties.has('--appearance-title-size'),false);
  assert.equal(attrs.has('data-appearance-heading-rule'),false);
});

test('moving blocks into frames and serializing frame items retains editable effects', () => {
  const saved = JSON.stringify(normalizeAppearance({brightness:73,overlaySource:'assets/rose.jpg'}));
  const sandbox = vm.createContext({getFrameDropTypeForBlock:b=>b.type,serializeBlockElement:b=>b,isDividerType:t=>t==='divider',normalizeIconImageScale:()=>1,getPageCardImagePosition:()=>50,getPageCardView:()=> 'default',isPageCardIconHidden:()=>false,createFrameChildId:()=> 'child',getFrameItemTextContent:()=>({innerHTML:'Hello'})});
  vm.runInContext(fn('canvas.js','buildFrameItemDataFromBlock')+'\n'+fn('canvas.js','serializeFrameItemElement'),sandbox);
  for(const type of ['text','image','table','button','divider','page']) {
    assert.equal(sandbox.buildFrameItemDataFromBlock({type,appearance:saved}).appearance,saved);
  }
  const serialized = sandbox.serializeFrameItemElement({dataset:{type:'text',appearance:saved},style:{}});
  assert.deepEqual(getSavedBlockAppearance(JSON.parse(JSON.stringify(serialized))),normalizeAppearance(JSON.parse(saved)));
});

test('page settings preserve appearance through the actual save/read normalization path', () => {
  const store = {};
  const sandbox = vm.createContext({window:{normalizeAppearance},PAGE_SETTINGS_KEY:'settings',normalizeHeaderPos:x=>x||50,normalizePageFontPreset:x=>x||'',normalizePageThemeOverride:x=>x||'',normalizeCanvasZoom:x=>x||1,normalizeCanvasOffset:x=>x||0,readStorageJSON:()=>store,writeStorageJSON:(_key,value)=>{Object.assign(store,JSON.parse(JSON.stringify(value)));return true;}});
  vm.runInContext(fn('ui-core.js','normalizePageSettings')+'\n'+fn('app-core.js','savePageSettings')+'\n'+fn('app-core.js','getPageSettings'),sandbox);
  const config = normalizeAppearance({height:336,brightness:82,titleSize:76});
  assert.equal(sandbox.savePageSettings('page',{bannerAppearance:config}),true);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.getPageSettings('page').bannerAppearance)),config);
  assert.equal(sandbox.savePageSettings('page',{bannerAppearance:{}}),true);
  assert.equal(sandbox.getPageSettings('page').bannerAppearance.height,0);
});
