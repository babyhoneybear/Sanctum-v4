const test = require('node:test');
const assert = require('node:assert/strict');
const { clearPosition, intersects } = require('../chatgpt-visual');
const { formatResult, tools, annotations } = require('../chatgpt-tools');

test('placement clears tall, stacked and off-grid obstacles with a real gap', () => {
  const occupied = [
    { x: 0, y: 0, w: 1000, h: 1401 },
    { x: 0, y: 1480, w: 1000, h: 800 },
    { x: 2000, y: 0, w: 200, h: 10000 },
  ];
  const result = clearPosition({ x: 48, y: 480, w: 960, h: 900 }, occupied);
  assert.equal(result.y % 24, 0);
  assert.equal(result.y >= 2328, true);
  assert.equal(result.y < 10000, true);
  assert.equal(occupied.some(other => intersects(result, other, 48)), false);
  assert.equal(occupied[0].y, 0);
});
test('an already clear placement stays in place and touching edges are not overlaps', () => {
  assert.equal(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 10, w: 10, h: 10 }), false);
  assert.deepEqual(clearPosition({ x: 0, y: 48, w: 10, h: 10 }, [{ x: 200, y: 0, w: 10, h: 500 }]), { x: 0, y: 48, w: 10, h: 10 });
});
test('screenshots are native MCP image blocks; metadata contains no base64 duplicate', () => {
  const result = { pageId: 'kitchen', image: { mimeType: 'image/jpeg', data: '/9j/AA==' } };
  const content = formatResult(result, 'screenshot');
  assert.deepEqual(content[1], { type: 'image', mimeType: 'image/jpeg', data: '/9j/AA==' });
  assert.deepEqual(JSON.parse(content[0].text), { pageId: 'kitchen' });
  assert.throws(() => formatResult({ image: { mimeType: 'text/html', data: 'abcd' } }, 'screenshot'), /invalid/);
  assert.throws(() => formatResult({ image: { mimeType: 'image/png', data: 'a'.repeat(800001) } }, 'screenshot'), /oversized/);
  for (const name of ['sanctum_page_layout', 'sanctum_page_screenshot']) assert.equal(annotations(tools.findIndex(tool => tool.name === name)).readOnlyHint, true);
});
