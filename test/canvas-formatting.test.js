const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const fn = (text, name) => text.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'))[0];

test('text and list minimum heights use logical content size at any canvas zoom', () => {
  const context = vm.createContext({GRID_SIZE:24,window:{getComputedStyle:()=>({paddingTop:'2px',paddingBottom:'2px'})}});
  vm.runInContext(fn(source('history-state.js'), 'getMinHeightForBlock'), context);
  for (const type of ['text','list']) {
    const body = {scrollHeight:18,offsetHeight:18,getBoundingClientRect(){throw Error('Screen zoom must not affect a logical minimum');}};
    const block = {dataset:{type},querySelector:()=>body};
    assert.equal(context.getMinHeightForBlock(block),24);
    body.scrollHeight = 54;body.offsetHeight = 54;
    assert.equal(context.getMinHeightForBlock(block),60,'wrapped text must retain enough height');
  }
});

test('all page fonts retain their canonical keys through repeated save/load normalization', () => {
  const text = source('ui-core.js');
  const context = vm.createContext({});
  vm.runInContext(text.match(/const PAGE_FONT_PRESETS = \{[^]*?^\};/m)[0] + '\n' + fn(text, 'normalizePageFontPreset') + '\n' + fn(text, 'getPageFontPresetMeta') + '\nthis.presets = PAGE_FONT_PRESETS;', context);
  for (const [key, meta] of Object.entries(context.presets)) {
    let value = key;
    for (let i = 0; i < 3; i++) value = context.normalizePageFontPreset(JSON.parse(JSON.stringify(value)));
    assert.equal(value, key);
    assert.equal(context.normalizePageFontPreset(key.toUpperCase()), key);
    assert.equal(context.getPageFontPresetMeta(value).family, meta.family);
  }
  assert.equal(context.normalizePageFontPreset('unknown font'), '');
});

test('explicit canvas text colors replace nested colors without stripping them during restoration', () => {
  const context = vm.createContext({getCanvasTargetType: () => 'text', isFrameItemTarget: () => false, isDividerType: () => false});
  vm.runInContext(fn(source('canvas.js'), 'applyBlockTextTone'), context);
  const nestedStyle = { color: 'green', backgroundColor: 'yellow', removeProperty(name) { delete this[name]; } };
  const legacyFont = { color: 'green', removeAttribute(name) { delete this[name]; } };
  const block = {
    dataset: {}, style: {setProperty() {}, removeProperty() {}},
    querySelector: () => null,
    querySelectorAll: selector => selector.includes('font[color]') ? [legacyFont] : selector.includes('[style]') ? [{style:nestedStyle}] : []
  };
  context.applyBlockTextTone(block, 'red');
  assert.equal(nestedStyle.color, 'green', 'loading a block preserves deliberate inline formatting');
  context.applyBlockTextTone(block, 'red', {clearInline:true});
  assert.equal(block.style.color, 'red');
  assert.equal(nestedStyle.color, undefined);
  assert.equal(legacyFont.color, undefined);
  assert.equal(nestedStyle.backgroundColor, 'yellow', 'text color must not erase highlights');
});
