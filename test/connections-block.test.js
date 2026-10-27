const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('native connection block hydration and serialization preserve placement, styling, heading and binding', () => {
  const history = fs.readFileSync(path.join(__dirname, '../history-state.js'), 'utf8');
  const canvas = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');
  const frames = [];
  let mounted;
  const context = {
    document: { createElement() {
      const title = { innerHTML: '' };
      return {
        dataset: {}, style: {}, classList: { add() {}, contains() { return false; } },
        querySelector: selector => selector === '.block-title' ? title : null,
        getBoundingClientRect: () => ({ width: 1, height: 1 })
      };
    } },
    window: { mountConnectionsBlock: block => { mounted = block; } },
    requestAnimationFrame: callback => frames.push(callback),
    makeBlockHTML: () => '', serializeCanvasTableHTML: () => '',
    getPageCardView: () => 'default', getPageCardImageMode: () => 'none', getPageCardImagePosition: () => 50,
    getLinkedCardSourceRecord: () => null, getStoredPageCardImageSource: () => '',
    applyPageCardImage() {}, isPageCardIconHidden: () => false,
    applyBlockBackgroundTone: (block, value) => { block.style.backgroundColor = value; },
    applyBlockBorderTone: (block, value) => { block.style.borderColor = value; },
    applyBlockTextTone: (block, value) => { block.style.color = value; },
    applyBlockTitleTone: (block, value) => { block.dataset.titleColor = value; },
    applyBlockPaddingTone: (block, value) => { block.style.padding = value; }
  };
  vm.createContext(context);
  vm.runInContext(history.slice(history.indexOf('function buildBlockFromData('), history.indexOf('function getMinHeightForBlock(')), context);
  vm.runInContext(canvas.slice(canvas.indexOf('function serializeBlockElement('), canvas.indexOf('window.serializeCanvasBlockForModal')), context);
  const expected = {
    id: 'magic-block', type: 'connections', characterSection:'magic', connectionPropertyId: 'magic', connectionSourcePageId: 'elias',
    x: 384, y: 144, w: 480, h: 216, z: 3, titleHTML: 'My magic',
    bg: '#223344', borderColor: '#778899', textColor: '#eeeeee', titleColor: '#aabbcc', padding: '16px', radius: '8px'
  };
  const block = context.buildBlockFromData(expected);
  frames.forEach(callback => callback());
  assert.equal(mounted, block);
  const saved = context.serializeBlockElement(block);
  for (const [key, value] of Object.entries(expected)) assert.equal(saved[key], value, key);
});
