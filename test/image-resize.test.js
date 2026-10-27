const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const canvas = fs.readFileSync(path.join(__dirname, '../canvas.js'), 'utf8');
const history = fs.readFileSync(path.join(__dirname, '../history-state.js'), 'utf8');
const fn = (source, name) => source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, 'm'))[0];

function harness(scale = 1, crop = 'original') {
  const block = {
    dataset: {type:'image',imageCropShape:crop},
    style: {width:'984px',height:'1758px',left:'96px'},
    get offsetHeight() { return parseFloat(this.style.height); },
    getBoundingClientRect() { return {height:this.offsetHeight*scale,width:parseFloat(this.style.width)*scale}; },
    querySelector(selector) { return selector==='.block-body' ? {offsetTop:0,scrollHeight:this.offsetHeight} : null; },
    get scrollHeight() { throw Error('An image must not be measured at its natural height'); }
  };
  let move;
  const context = vm.createContext({GRID_SIZE:24,activeBlock:block,activeBlockDidDrag:false,mode:'resize',activeTableColumnResize:null,activePageCardImageBlock:null,activeFrameDragItem:null,startX:0,startY:0,startW:984,startH:1758,getCanvasInteractionScale:()=>scale,getPointerPositionOnGrid:()=>({rect:{}}),getGridViewportWidth:()=>1900,getGridViewportHeight:()=>4000,clearFrameDropPreview(){},isVerticalDividerType:()=>false,isDividerType:()=>false,shouldLockImageCropAspect:()=>crop==='circle',document:{addEventListener:(_event,callback)=>{move=callback;}}});
  for(const name of ['snap','getMinResizeDimensionsForBlock','autoGrowBlock']) vm.runInContext(fn(canvas,name),context);
  for(const name of ['getMinHeightForBlock','enforceMinHeight']) vm.runInContext(fn(history,name),context);
  const start=canvas.indexOf('document.addEventListener("mousemove", (e) => {');
  const end=canvas.indexOf('document.addEventListener("mouseup", (e) => {',start);
  vm.runInContext(canvas.slice(start,end),context);
  return {block,context,move};
}

test('repeated inward resize events shrink an image instead of raising its minimum', () => {
  const {block,context,move} = harness();
  for(let dy=-24;dy>=-1614;dy-=24) {
    const before=block.offsetHeight;
    move({clientX:0,clientY:dy});
    assert.ok(block.offsetHeight<=before, 'an inward drag must never enlarge the image');
  }
  assert.equal(block.style.height,'144px');
  for(let i=0;i<20;i++) context.enforceMinHeight(block);
  assert.equal(block.style.height,'144px');
});

test('replacing images preserves the chosen size and still enforces a small fixed minimum', () => {
  const {block,context} = harness();
  block.style.height='144px';
  for(let i=0;i<5;i++) context.autoGrowBlock(block,{allowShrink:true});
  assert.equal(block.style.height,'144px');
  block.style.height='24px';
  context.autoGrowBlock(block);
  assert.equal(block.style.height,'96px');
});

test('image resizing uses canvas pixels at different zoom levels and retains circular crops', () => {
  for(const scale of [.5,1,2]) {
    const {block,context,move}=harness(scale,'circle');
    context.startW=240;context.startH=240;
    block.style.width='240px';block.style.height='240px';
    move({clientX:-96*scale,clientY:-96*scale});
    context.enforceMinHeight(block);
    assert.equal(block.style.width,'144px');
    assert.equal(block.style.height,'144px');
  }
});
