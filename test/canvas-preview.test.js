const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCanvasPreview, getCanvasPreviewBounds, fitCanvasPreview, zoomCanvasPreview } = require('../canvas-preview');

test('a preview retains its source and independent camera through saving, rejecting invalid cameras', () => {
  const config = { targetPageId:'magic', view:{ x:-700,y:900,zoom:0.6 } };
  assert.deepEqual(normalizeCanvasPreview(JSON.stringify(config)),config);
  assert.equal(normalizeCanvasPreview({targetPageId:'magic',view:{x:Infinity,y:0,zoom:1}}).view,null);
  assert.equal(normalizeCanvasPreview('{bad').targetPageId,'');
  assert.equal(normalizeCanvasPreview({view:{x:0,y:0,zoom:99}}).view.zoom,3);
});

test('fit frames distant content and curves instead of the empty infinite canvas origin', () => {
  const blocks=[{x:4800,y:3200,w:400,h:200},{x:6000,y:3500,w:300,h:150}];
  const bounds=getCanvasPreviewBounds(blocks,[{x1:5200,y1:3300,x2:6000,y2:3500,cx:5500,cy:2900}]);
  assert.deepEqual(bounds,{x:4800,y:2900,width:1500,height:750});
  const camera=fitCanvasPreview(bounds,640,400);
  assert.equal(camera.x,5550);assert.equal(camera.y,3275);
  assert.ok(bounds.width*camera.zoom<640&&bounds.height*camera.zoom<400);
  assert.deepEqual(blocks[0],{x:4800,y:3200,w:400,h:200},'fitting never changes source positions');
});

test('zoom keeps the world point under the pointer stationary, including at zoom limits', () => {
  const view={x:1200,y:900,zoom:0.5},point={x:510,y:90},size={width:640,height:400};
  for(const factor of [1.2,0.1,200]) {
    const next=zoomCanvasPreview(view,factor,point,size);
    for(const [axis,dimension] of [['x','width'],['y','height']]) {
      const before=view[axis]+(point[axis]-size[dimension]/2)/view.zoom;
      const after=next[axis]+(point[axis]-size[dimension]/2)/next.zoom;
      assert.ok(Math.abs(before-after)<1e-8);
    }
    assert.ok(next.zoom>=0.02&&next.zoom<=3);
  }
});
