const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const app = express();
app.use(express.static(root, { dotfiles: 'ignore' }));
const server = app.listen(0, '127.0.0.1');
const atlas = {
  version: 1, rootId: 'world', activeMapId: 'city',
  maps: {
    world: { name: 'Original world', terrain: [0, 1, 2], features: [{ childMapId: 'city', pageId: 'lore' }] },
    city: { name: 'Emberfall', parentId: 'world', features: [{ name: 'The Watcher', art: ['data:image/png;base64,aGVsbG8='] }] }
  }
};
const document = '1.153.1|Nólara\r\n{"name":"Nólara 🗺"}\r\n<svg><text>North & South</text></svg>\r\n';
const records = {
  'saved-world': { version: 2, engine: 'azgaar', document, engineVersion: '1.153.1', updatedAt: 123, previousAtlas: atlas, extraMetadata: { retained: true } },
  'old-world': atlas,
  'unknown-world': { version: 99, unknown: '<script>throw Error("must not execute")</script>', nested: [1, null, { untouched: true }] },
  'broken-world': { version: 2, engine: 'azgaar', document: 'not a valid native map' },
  'null-world': null
};

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(() => addEventListener('sanctum:scripts-ready', () => { window.recoveryCheckReady = true; }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    await page.waitForFunction(() => window.recoveryCheckReady && window.SanctumStorage?.ready);
    await page.evaluate(async records => {
      for (const id of [...Object.keys(records), 'empty-world']) {
        createPage(id, 'home', 'map', 'none', 'page', { pageId: id });
      }
      writeStorageJSON('sanctum_maps_v1', records);
      await SanctumStorage.flush();
      openPage('saved-world');
    }, records);
    await page.getByRole('heading', { name: 'Map maker removed' }).waitFor();

    const download = async name => {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name, exact: true }).click();
      const item = await pending;
      const stream = await item.createReadStream();
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return { name: item.suggestedFilename(), bytes: Buffer.concat(chunks) };
    };
    const native = await download('Download map (.map)');
    assert.equal(native.name, 'saved-world.map');
    assert.deepEqual(native.bytes, Buffer.from(document), 'native document must be byte-for-byte intact');
    assert.deepEqual(JSON.parse((await download('Download saved data')).bytes), records['saved-world']);
    assert.deepEqual(JSON.parse((await download('Download earlier atlas')).bytes), atlas);
    assert.equal(await page.locator('#editToggle').isVisible(), false);
    assert.equal(await page.locator('#pageCreateLayouts [data-layout="map"]').count(), 0);
    assert.equal(await page.locator('#pageDetailsLayout option[value="map"]').isDisabled(), true);
    const capture = path.join(root, 'artifacts/maps/map-recovery.png');
    fs.mkdirSync(path.dirname(capture), { recursive: true });
    await page.screenshot({ path: capture });

    for (const id of ['old-world', 'unknown-world', 'broken-world', 'null-world']) {
      await page.evaluate(id => openPage(id), id);
      assert.deepEqual(JSON.parse((await download('Download saved data')).bytes), records[id]);
      assert.equal(await page.getByRole('button', { name: 'Download earlier atlas', exact: true }).count(), 0);
    }
    await page.evaluate(() => openPage('empty-world'));
    assert.match(await page.locator('.map-recovery').textContent(), /no saved map data/);
    assert.equal(await page.locator('.map-recovery button').count(), 0);
    await page.evaluate(() => openPage('home'));
    assert.equal(await page.locator('.map-recovery').count(), 0);
    assert.equal(await page.locator('#editToggle').isVisible(), true);
    await page.evaluate(() => openPage('saved-world'));
    await page.evaluate(() => SanctumStorage.flush());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.recoveryCheckReady && window.SanctumStorage?.ready);
    await page.evaluate(() => openPage('saved-world'));
    assert.deepEqual(await page.evaluate(() => readStorageJSON('sanctum_maps_v1', {})), records);
    await page.setViewportSize({ width: 390, height: 780 });
    assert.ok(await page.locator('.map-recovery-panel').evaluate(node => node.scrollWidth <= node.clientWidth + 1));
    assert.deepEqual(errors, []);
    assert.ok(!requests.some(url => /\/map-engine\/|\/map-(azgaar|ui|renderer|generator|data)\.js/.test(url)), 'retired engines must never be requested');
    for (const url of ['/map-engine/index.html', '/map-azgaar.js', '/map-ui.js', '/.retired-map-maker-2026-10-02/map-engine/index.html']) {
      assert.equal((await page.request.get(origin + url)).status(), 404, url);
    }
    console.log('Map retirement passed: exact downloads, all saved formats, unchanged storage/reload, empty pages, navigation, narrow layout, no editor requests or exposed archive.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})();
