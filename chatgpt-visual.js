(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SanctumChatGPTVisual = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const snap = value => Math.ceil(value / 24) * 24;
  const intersects = (a, b, gap = 0) => a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  function clearPosition(rect, occupied, gap = 48) {
    const result = { ...rect };
    for (let i = 0; i <= occupied.length; i++) {
      const collisions = occupied.filter(other => intersects(result, other, gap));
      if (!collisions.length) return result;
      result.y = snap(Math.max(...collisions.map(other => other.y + other.h)) + gap);
    }
    throw new Error('Could not find a clear position for the database.');
  }
  function createBrowser(env) {
    const doc = root.document;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    function grid() { return doc.getElementById('grid'); }
    function bounds() {
      const host = grid(); if (!host || !host.getClientRects().length) return [];
      const base = host.getBoundingClientRect(), scale = base.width / host.offsetWidth || 1;
      return [...host.children].filter(element => element.classList.contains('block')).map(element => {
        const box = element.getBoundingClientRect(), style = root.getComputedStyle(element);
        return { id: element.id, type: element.dataset.type || '',
          x: (box.left - base.left) / scale, y: (box.top - base.top) / scale,
          w: Math.max(box.width / scale, style.overflowX === 'visible' ? element.scrollWidth : 0),
          h: Math.max(box.height / scale, style.overflowY === 'visible' ? element.scrollHeight : 0) };
      });
    }
    async function settle() {
      if (doc.fonts?.ready) await Promise.race([doc.fonts.ready, wait(800)]);
      const host = grid();
      if (host) await Promise.race([Promise.all([...host.querySelectorAll('img')].filter(img => !img.complete).map(img => img.decode?.().catch(() => {}))), wait(800)]);
      let prior = '';
      for (let i = 0; i < 6; i++) {
        await wait(60);
        const current = JSON.stringify(bounds());
        if (current === prior) return;
        prior = current;
      }
    }
    async function open(pageId) {
      if (env.currentPage() !== pageId) env.activate(pageId);
      await settle();
      if (env.currentPage() !== pageId) throw new Error('The page changed during the layout check. Try again.');
    }
    function describe(pageId) {
      const blocks = bounds(), overlaps = [];
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
        if (intersects(blocks[i], blocks[j]) && overlaps.length < 100) overlaps.push([blocks[i].id, blocks[j].id]);
      }
      return { pageId, measured: true, units: 'canvas CSS pixels', blocks, overlaps,
        note: 'Frames or deliberately layered decorations may overlap. New database views are placed clear of existing blocks.' };
    }
    async function layout(pageId) { await open(pageId); return describe(pageId); }
    async function arrangePage(pageId, changes) {
      await open(pageId);
      const allowed = new Set(changes.filter(change=>change.allowOverlap).map(change=>change.blockId));
      const pending = new Set(changes.filter(change=>change.autoPlace).map(change=>change.blockId));
      const decorative = item => item.type === 'container' || item.type.startsWith('divider');
      for (const change of changes) {
        let measured = bounds().find(item=>item.id===change.blockId);
        if (!measured) throw new Error('A changed page block did not render. The page change will be rolled back.');
        pending.delete(change.blockId);
        const occupied = bounds().filter(item=>item.id!==change.blockId && !pending.has(item.id) && !allowed.has(item.id) && !decorative(item));
        if (change.autoPlace && !change.allowOverlap) {
          const position = clearPosition({...measured,y:snap(Math.max(0,...occupied.map(item=>item.y+item.h))+24)},occupied,24);
          if(position.y!==measured.y) {
            const all=env.blocks(); all[pageId]=(all[pageId]||[]).map(block=>block.id===change.blockId ? {...block,y:block.y+position.y-measured.y}:block);
            if(env.writeBlocks(all)===false)throw new Error('Could not save page layout.');
            await settle(); measured=bounds().find(item=>item.id===change.blockId);
          }
        }
        if(!change.allowOverlap && (!measured || occupied.some(item=>intersects(measured,item))))throw new Error('A page block overlaps other content. Adjust its position or deliberately mark decorative layering with allowOverlap=true. The change will be rolled back.');
      }
      const final=bounds();
      for(const change of changes.filter(item=>!item.allowOverlap)) {
        const rect=final.find(item=>item.id===change.blockId);
        if(!rect || final.some(item=>item.id!==change.blockId && !allowed.has(item.id) && !decorative(item) && intersects(rect,item)))throw new Error('The final page arrangement overlaps. The change will be rolled back.');
      }
      return describe(pageId);
    }
    async function placeViews(source, database, views) {
      const placed = [];
      for (const view of views) {
        await open(view.pageId);
        const all = env.blocks(), items = all[view.pageId] || [], existing = bounds();
        const block = env.makeView(source, database, view, items);
        if (!view.before) block.y = snap(Math.max(0, ...existing.map(item => item.y + item.h)) + 48);
        const index = items.findIndex(item => item.id === block.id);
        if (index < 0) items.push(block); else items[index] = block;
        all[view.pageId] = items;
        if (env.writeBlocks(all) === false) throw new Error('Could not save the database view.');
        await settle();
        let measured = bounds().find(item => item.id === block.id);
        if (!measured) throw new Error('The database view did not render. Nothing will be reported as successfully placed.');
        if (!view.before) {
          const position = clearPosition(measured, bounds().filter(item => item.id !== block.id));
          if (position.y !== measured.y) {
            block.y += position.y - measured.y;
            const current = env.blocks();
            current[view.pageId] = (current[view.pageId] || []).map(item => item.id === block.id ? { ...item, y: block.y } : item);
            if (env.writeBlocks(current) === false) throw new Error('Could not save the clear database position.');
            await settle(); measured = bounds().find(item => item.id === block.id);
          }
          if (!measured || bounds().some(item => item.id !== block.id && intersects(measured, item))) throw new Error('The database still overlaps another block. The change will be rolled back.');
        }
        placed.push({ pageId: view.pageId, blockId: block.id, bounds: measured, clear: !bounds().some(item => item.id !== block.id && intersects(measured, item)) });
      }
      return { measured: true, placements: placed };
    }
    async function screenshot(pageId, options = {}) {
      await open(pageId);
      if (!root.htmlToImage) throw new Error('Refresh Sanctum to load its screenshot support.');
      let node = doc.getElementById('pageContent');
      if(grid()?.getClientRects().length && root.getComputedStyle(grid()).display!=='none')node=grid();
      if (!node || !node.getClientRects().length || root.getComputedStyle(node).display === 'none') node = grid();
      if(options.includeHeader && !options.blockId && node === grid())node=grid().parentElement;
      if (options.blockId) {
        node = [...(grid()?.children || [])].find(item => item.id === options.blockId);
        if (!node) throw new Error('That block is not visible on the requested page.');
      }
      if (!node || !node.getClientRects().length) throw new Error('This page has no supported visible capture surface.');
      const region = { x: 0, y: 0, width: Math.min(1440, node.offsetWidth || 1440), height: 1000, ...options.region };
      if (![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.x < 0 || region.y < 0 || region.x > 1000000 || region.y > 1000000 || region.width < 100 || region.height < 100 || region.width > 1600 || region.height > 1200) throw new Error('Capture regions use x/y from 0–1000000 and a width of 100–1600 and height of 100–1200 CSS pixels.');
      const width = Math.max(node.offsetWidth, node.scrollWidth, region.x + region.width), height = Math.max(node.offsetHeight, node.scrollHeight, region.y + region.height);
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 18000);
      try {
        const svgURL = await root.htmlToImage.toSvg(node, {
          width, height, preferredFontFormat: 'woff2', fetchRequestInit: { signal: abort.signal },
          style: { position: 'relative', inset: '0px auto auto 0px', insetBlock: '0px auto', insetInline: '0px auto', margin: '0', transform: 'none', transformOrigin: 'top left' },
          filter: element => !element.matches?.('input[type="password"], [data-chatgpt-private], script, iframe'),
          imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
        });
        const xml = new DOMParser().parseFromString(decodeURIComponent(svgURL.slice(svgURL.indexOf(',') + 1)), 'image/svg+xml');
        const svg = xml.documentElement, foreign = svg.querySelector('foreignObject');
        foreign.setAttribute('width', String(width)); foreign.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `${region.x} ${region.y} ${region.width} ${region.height}`);
        svg.setAttribute('width', String(region.width)); svg.setAttribute('height', String(region.height));
        const image = new Image();
        await new Promise((resolve, reject) => {
          const expired = () => reject(new Error('Page capture timed out. Try a smaller region or block.'));
          if (abort.signal.aborted) return expired();
          abort.signal.addEventListener('abort', expired, { once: true });
          image.onload = resolve; image.onerror = () => reject(new Error('Could not render this page image.'));
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        });
        const canvas = doc.createElement('canvas'); canvas.width = region.width; canvas.height = region.height;
        const context = canvas.getContext('2d'); context.fillStyle = root.getComputedStyle(doc.body).getPropertyValue('--mainpage-bg').trim() || '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set();
        for (let i = 0; i < pixels.length && colors.size < 5; i += 20) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        let data = canvas.toDataURL('image/jpeg', .85).split(',')[1];
        if (data.length > 800000) data = canvas.toDataURL('image/jpeg', .55).split(',')[1];
        if (data.length > 800000) throw new Error('This image is too detailed. Request a smaller capture region.');
        if (env.currentPage() !== pageId) throw new Error('The page changed during capture. Try again.');
        return { pageId, region, coordinateSurface:options.includeHeader && !options.blockId ? 'page including header' : (options.blockId ? 'block' : 'canvas or database content'), capturedAt: new Date().toISOString(), kind: 'rendered-page', blank: colors.size < 3,
          limitations: ['Captures Sanctum page content only. External media or unsupported CSS may render differently.'],
          image: { mimeType: 'image/jpeg', data } };
      } finally { clearTimeout(timer); }
    }
    return { layout, placeViews, arrangePage, screenshot };
  }
  return { intersects, clearPosition, createBrowser };
});
