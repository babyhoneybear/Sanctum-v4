// A read-only view of an Infinite Canvas. Its camera belongs to the host block.
function normalizeCanvasPreview(raw = {}) {
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
  if (!raw || typeof raw !== "object") raw = {};
  const view = raw.view;
  return {
    targetPageId: String(raw.targetPageId || ""),
    view: view && [view.x, view.y, view.zoom].every(Number.isFinite)
      ? { x: view.x, y: view.y, zoom: Math.max(0.02, Math.min(3, view.zoom)) } : null
  };
}

function getCanvasPreviewBounds(blocks = [], lines = []) {
  const points = [];
  for (const b of blocks) {
    const x = Number(b.x) || 0, y = Number(b.y) || 0;
    points.push([x, y], [x + (Number(b.w) || 288), y + (Number(b.h) || 96)]);
  }
  for (const line of resolveCanvasPreviewLines(lines, blocks)) {
    for (const [x, y] of [[line.x1, line.y1], [line.x2, line.y2], [line.cx, line.cy]]) {
      if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
    }
  }
  if (!points.length) return { x: 0, y: 0, width: 640, height: 400 };
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}

function resolveCanvasPreviewLines(lines, blocks) {
  const anchor = (id, side) => {
    const b = blocks.find(b => b.id === id); if (!b) return null;
    const x = Number(b.x) || 0, y = Number(b.y) || 0, w = Number(b.w) || 288, h = Number(b.h) || 96;
    const point = { top:[x+w/2,y],right:[x+w,y+h/2],bottom:[x+w/2,y+h],left:[x,y+h/2] }[side];
    return point?.map(n => Math.round(n / 24) * 24);
  };
  return lines.map(line => {
    const [x1,y1] = anchor(line.startBlockId,line.startSide) || [line.x1,line.y1];
    const [x2,y2] = anchor(line.endBlockId,line.endSide) || [line.x2,line.y2];
    return { ...line,x1,y1,x2,y2 };
  });
}

function fitCanvasPreview(bounds, width, height) {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
    zoom: Math.max(0.02, Math.min(1, (width - 48) / (bounds.width + 32), (height - 48) / (bounds.height + 32))) };
}

function zoomCanvasPreview(view, factor, point, size) {
  const zoom = Math.max(0.02, Math.min(3, view.zoom * factor));
  return { x: view.x + (point.x - size.width / 2) * (1 / view.zoom - 1 / zoom),
    y: view.y + (point.y - size.height / 2) * (1 / view.zoom - 1 / zoom), zoom };
}

(function () {
  if (typeof window === "undefined") return;
  const mounted = new Set();
  const states = new WeakMap();
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const records = () => (window.userPages || []).filter(p => p.layout === "infinite-canvas");
  const svg = tag => document.createElementNS("http://www.w3.org/2000/svg", tag);
  function readLines(pageId) {
    const key = window.STORAGE_KEYS?.canvasLines || "sanctum_canvas_lines";
    try { return JSON.parse(localStorage.getItem(key) || "{}")[pageId] || []; } catch { return []; }
  }
  function safeHTML(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    template.content.querySelectorAll("script,iframe,object,embed,form,meta,link,style").forEach(el => el.remove());
    template.content.querySelectorAll("*").forEach(el => {
      for (const attr of [...el.attributes]) {
        if (/^on/i.test(attr.name) || attr.name === "id" || attr.name === "contenteditable" || attr.name === "srcdoc"
          || (/^(href|src|xlink:href)$/i.test(attr.name) && /^\s*(javascript|vbscript|data:text\/html):/i.test(attr.value))) el.removeAttribute(attr.name);
      }
    });
    return template.innerHTML;
  }
  function paintBlock(data, nested = false) {
    const type = data.type || "text", el = document.createElement("div");
    el.className = nested ? `frame-item frame-item-${type}` : "block";
    el.dataset.type = type;
    if (nested) el.dataset.frameChildType = type;
    else Object.assign(el.style, { left: `${Number(data.x) || 0}px`, top: `${Number(data.y) || 0}px`,
      width: `${Number(data.w) || 288}px`, height: data.h > 0 ? `${data.h}px` : "auto", zIndex: String(Number(data.z) || 1) });
    if (["text", "list"].includes(type)) {
      el.innerHTML = nested ? `<div class="frame-item-text-content">${safeHTML(data.bodyHTML)}</div>`
        : `${data.titleHTML ? `<div class="block-title">${safeHTML(data.titleHTML)}</div>` : ""}<div class="block-body">${safeHTML(data.bodyHTML)}</div>`;
    } else if (type === "image") {
      el.innerHTML = `<div class="block-body block-image-body">${safeHTML(data.bodyHTML)}</div>`;
      window.applyImageCropShape?.(el, data.imageCropShape || "original", { resize: false, skipSave: true });
      window.applyImageFrameStyle?.(el, data.imageFrameStyle || "none", { skipSave: true });
    } else if (type === "container") {
      el.innerHTML = `<div class="container-title">${safeHTML(data.containerTitle)}</div><div class="container-body"><div class="container-items"></div></div>`;
      const host = el.querySelector(".container-items");
      if (Array.isArray(data.containerItems) && data.containerItems.length) data.containerItems.forEach(item => host.appendChild(paintBlock(item, true)));
      else host.innerHTML = safeHTML(data.containerBody);
    } else if (["page", "domain"].includes(type)) {
      const record = [...(window.userPages || []), ...(window.userDomains || [])].find(p => p.id === data.linkedPageId);
      el.innerHTML = typeof makeFrameLinkedCardHTML === "function" ? makeFrameLinkedCardHTML(type) : '<div class="page-card-title"></div>';
      const title = el.querySelector(".page-card-title"), summary = el.querySelector(".page-card-summary"), icon = el.querySelector(".page-card-icon");
      if (title) title.textContent = record?.title || data.pageCardTitle || "Page";
      if (summary) summary.textContent = record?.summary || data.pageCardSummary || "";
      if (icon) window.setIconElementContent?.(icon, record?.icon || data.pageCardIcon || "📄", "📄");
      el.dataset.pageCardView = data.pageCardView || "default";
      el.dataset.pageCardGalleryStyle = data.pageCardGalleryStyle || "standard";
      if (data.pageCardHideIcon && icon) icon.hidden = true;
      const image = data.pageCardImageMode === "linked" ? window.getLinkedPageCardImageSource?.(data.linkedPageId) : data.pageCardImageSrc;
      window.applyPageCardImage?.(el, { mode: data.pageCardImageMode || "none", src: image || "", pos: data.pageCardImagePos ?? 50 });
    } else if (type.startsWith("divider")) {
      el.innerHTML = '<div class="frame-item-divider-line block-divider"></div>';
    } else if (type === "table") {
      el.innerHTML = `<div class="block-table-wrap">${safeHTML(data.tableHTML)}</div>`;
    } else if (type === "button") {
      let cfg = {}; try { cfg = JSON.parse(data.buttonConfig || "{}"); } catch {}
      el.innerHTML = `<span class="canvas-preview-button">${esc(cfg.label || cfg.text || "Button")}</span>`;
    } else {
      el.innerHTML = `<div class="block-title">${safeHTML(data.titleHTML) || esc(data.calendarTitle || data.dbViewTitle || type.replaceAll("-", " "))}</div><div class="block-body">${safeHTML(data.bodyHTML)}</div>`;
    }
    window.applyBlockAppearance?.(el, window.getSavedBlockAppearance?.(data) || {}, false);
    for (const [key, value] of Object.entries({ backgroundColor: data.bg, borderColor: data.borderColor, color: data.textColor, padding: data.padding, borderRadius: data.radius })) if (value) el.style[key] = value;
    if (data.textColor) el.querySelectorAll(".block-body,.frame-item-text-content,.page-card-title,.page-card-summary,.container-title").forEach(part => { part.style.color = data.textColor; });
    return el;
  }
  function paintLines(lines, blocks, scene, markerId) {
    const layer = svg("svg"); layer.classList.add("canvas-preview-lines");
    const defs = svg("defs"), marker = svg("marker"), arrow = svg("path");
    Object.entries({ id: markerId, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }).forEach(([k,v]) => marker.setAttribute(k,v));
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z"); arrow.setAttribute("fill", "context-stroke"); marker.appendChild(arrow); defs.appendChild(marker); layer.appendChild(defs);
    for (const line of resolveCanvasPreviewLines(lines,blocks)) {
      const {x1,y1,x2,y2} = line;
      if (![x1,y1,x2,y2].every(Number.isFinite)) continue;
      const path = svg("path");
      path.setAttribute("d", line.curved && Number.isFinite(line.cx) && Number.isFinite(line.cy) ? `M ${x1} ${y1} Q ${line.cx} ${line.cy} ${x2} ${y2}` : `M ${x1} ${y1} L ${x2} ${y2}`);
      path.setAttribute("stroke", line.color || "#b9aa91"); path.setAttribute("stroke-width", String(line.width || 2)); path.setAttribute("fill", "none");
      if (line.dash || line.dashed) path.setAttribute("stroke-dasharray", line.dash || "8 6");
      if (line.arrowStart) path.setAttribute("marker-start", `url(#${markerId})`);
      if (line.arrowEnd) path.setAttribute("marker-end", `url(#${markerId})`);
      layer.appendChild(path);
    }
    scene.appendChild(layer);
  }
  function mountCanvasPreview(block) {
    if (!block || block.classList.contains("ghost")) return;
    const shell = block.querySelector(".canvas-preview-shell"); if (!shell) return;
    const previous = states.get(block); previous?.dispose();
    const controller = new AbortController(), signal = controller.signal;
    let config = normalizeCanvasPreview(block.dataset.canvasPreview), camera = config.view, bounds, timer, fingerprint;
    let pan = null; const pointers = new Map();
    const board = () => records().find(p => p.id === config.targetPageId);
    shell.innerHTML = `<header class="canvas-preview-header"><strong>${esc(board()?.title || "Canvas preview")}</strong><div><button type="button" data-action="choose" aria-label="Choose infinite canvas">${window.getUIIcon?.("settings-2") || "Choose"}</button><button type="button" data-action="open">Open canvas ↗</button></div></header>
      <div class="canvas-preview-picker"${board() ? " hidden" : ""}><label>Infinite canvas<select aria-label="Infinite canvas"><option value="">Choose a canvas…</option>${records().map(p => `<option value="${esc(p.id)}"${p.id === config.targetPageId ? " selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label></div>
      <div class="canvas-preview-surface" tabindex="0" role="region" aria-label="Canvas preview. Drag to pan, scroll to zoom. Arrow keys pan; plus and minus zoom."></div>
      <footer><span>Drag to pan · Scroll to zoom</span><div><button type="button" data-action="out" aria-label="Zoom out">−</button><output>100%</output><button type="button" data-action="in" aria-label="Zoom in">+</button><button type="button" data-action="fit">Fit canvas</button></div></footer>`;
    const surface = shell.querySelector(".canvas-preview-surface"), picker = shell.querySelector(".canvas-preview-picker");
    const root = surface.attachShadow({ mode: "open" });
    // Keep preview blocks out of the host editor's selectors, saving, and input handlers.
    for (const href of ["style.css", "infinite-canvas.css", "appearance.css", "ui-icons.css"]) {
      const link = document.createElement("link"); link.rel = "stylesheet"; link.href = href; root.appendChild(link);
      link.addEventListener("load", () => updateCamera(), { signal });
    }
    const style = document.createElement("style"); style.textContent = ':host{display:block;overflow:hidden;position:relative;background:var(--mainpage-bg,#191919);touch-action:none}.page-canvas.is-infinite-canvas{position:absolute!important;inset:0!important;min-height:0!important;overflow:visible!important;padding:0!important;pointer-events:none}.preview-scene{position:absolute;inset:0;transform-origin:0 0}.block{position:absolute!important;box-sizing:border-box;cursor:default!important}.canvas-preview-lines{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:0}.block-resize-handle,.frame-item-delete,.frame-item-drag-handle,.page-card-menu,.page-card-media-action{display:none!important}.preview-empty{padding:28px;color:var(--muted2,#aaa);font:14px system-ui}.canvas-preview-button{display:inline-block;padding:10px 18px;border:1px solid #666;border-radius:4px}'; root.appendChild(style);
    const wrapper = document.createElement("div"); wrapper.className = "page-canvas is-infinite-canvas";
    const scene = document.createElement("div"); scene.className = "preview-scene"; scene.inert = true; wrapper.appendChild(scene); root.appendChild(wrapper);
    const size = () => ({ width: surface.clientWidth, height: surface.clientHeight });
    function updateCamera() {
      const { width, height } = size(); if (!bounds || width < 1 || height < 1) return;
      if (!camera) camera = fitCanvasPreview(bounds,width,height);
      scene.style.transform = `translate(${width / 2 - camera.x * camera.zoom}px,${height / 2 - camera.y * camera.zoom}px) scale(${camera.zoom})`;
      shell.querySelector("output").textContent = `${Math.round(camera.zoom * 100)}%`;
    }
    function persist() {
      clearTimeout(timer); const old = block.dataset.canvasPreview;
      config = { ...config, view: camera }; block.dataset.canvasPreview = JSON.stringify(config);
      if (typeof saveState === "function" && saveState() === false) { block.dataset.canvasPreview = old || "{}"; config = normalizeCanvasPreview(old); }
    }
    function refresh() {
      if (!block.isConnected) return;
      const target = board(), blocks = target ? getPageBlocks(target.id) : [], lines = target ? readLines(target.id) : [];
      const next = JSON.stringify([target?.title,blocks,lines]); if (next === fingerprint) return; fingerprint = next;
      shell.querySelector("strong").textContent = target?.title || "Canvas preview";
      shell.querySelector('[data-action="open"]').disabled = !target;
      scene.replaceChildren(); root.querySelector(".preview-empty")?.remove();
      bounds = getCanvasPreviewBounds(blocks,lines);
      if (!config.view) camera = null;
      if (!target || (!blocks.length && !lines.length)) {
        const empty = document.createElement("div"); empty.className = "preview-empty"; empty.textContent = target ? "This canvas is empty. Open it to add your ideas." : "Choose an Infinite Canvas to preview here."; root.appendChild(empty);
      }
      blocks.forEach(data => scene.appendChild(paintBlock(data)));
      paintLines(lines,blocks,scene,`preview-arrow-${block.id}`);
      updateCamera();
    }
    function zoom(factor, point = { x: size().width / 2, y: size().height / 2 }) {
      if (!camera) return; camera = zoomCanvasPreview(camera,factor,point,size()); updateCamera();
      block.dataset.canvasPreview = JSON.stringify({ ...config, view: camera });
      clearTimeout(timer); timer = setTimeout(persist,180);
    }
    shell.addEventListener("mousedown", e => { if (e.target.closest("button,select,.canvas-preview-surface")) e.stopPropagation(); }, { signal });
    shell.addEventListener("click", e => {
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action) return; e.stopPropagation();
      if (action === "choose") picker.hidden = !picker.hidden;
      if (action === "open" && board() && saveState() !== false) window.openPage(board().id);
      if (action === "in") zoom(1.2); if (action === "out") zoom(1 / 1.2);
      if (action === "fit") { camera = null; updateCamera(); persist(); }
    }, { signal });
    shell.querySelector("select").addEventListener("change", e => {
      config = { targetPageId: e.target.value, view: null }; camera = null; persist(); mountCanvasPreview(block);
    }, { signal });
    surface.addEventListener("wheel", e => {
      e.preventDefault(); e.stopPropagation(); const r = surface.getBoundingClientRect();
      zoom(Math.exp(-Math.max(-200,Math.min(200,e.deltaY)) * 0.003), { x: (e.clientX-r.left) * surface.clientWidth/r.width, y: (e.clientY-r.top) * surface.clientHeight/r.height });
    }, { passive: false, signal });
    function resetPan() {
      const list = [...pointers.values()];
      pan = list.length ? { camera: { ...camera }, points: list.map(p => ({ ...p })) } : null;
    }
    surface.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !camera) return; e.preventDefault(); e.stopPropagation();
      surface.focus({ preventScroll: true }); surface.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{ x:e.clientX,y:e.clientY }); resetPan(); surface.classList.add("is-panning");
    }, { signal });
    surface.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId) || !pan) return; e.stopPropagation(); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const list = [...pointers.values()], mid = ps => ({ x:ps.reduce((n,p)=>n+p.x,0)/ps.length,y:ps.reduce((n,p)=>n+p.y,0)/ps.length });
      const before=mid(pan.points),after=mid(list),r=surface.getBoundingClientRect(),ratio=surface.clientWidth/r.width;
      camera = { ...pan.camera };
      if (list.length >= 2 && pan.points.length >= 2) {
        const distance=ps=>Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);
        camera=zoomCanvasPreview(camera,distance(list)/Math.max(1,distance(pan.points)),{x:(before.x-r.left)*ratio,y:(before.y-r.top)*ratio},size());
      }
      camera.x -= (after.x-before.x)*ratio/camera.zoom; camera.y -= (after.y-before.y)*ratio/camera.zoom; updateCamera();
    }, { signal });
    const endPan = e => { if (!pointers.delete(e.pointerId)) return; resetPan(); if (!pointers.size) { surface.classList.remove("is-panning"); persist(); } };
    for (const event of ["pointerup","pointercancel","lostpointercapture"]) surface.addEventListener(event,endPan,{ signal });
    surface.addEventListener("keydown", e => {
      if (!camera || !["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","0"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (["+","="].includes(e.key)) zoom(1.2); else if (e.key === "-") zoom(1/1.2);
      else if (e.key === "0") { camera=null;updateCamera();persist(); }
      else { camera.x += ({ArrowLeft:-60,ArrowRight:60}[e.key]||0)/camera.zoom;camera.y += ({ArrowUp:-60,ArrowDown:60}[e.key]||0)/camera.zoom;updateCamera();persist(); }
    }, { signal });
    const observer = new ResizeObserver(() => { if (!config.view) camera=null;updateCamera(); }); observer.observe(surface);
    const state = { refresh, dispose() { clearTimeout(timer);observer.disconnect();controller.abort();mounted.delete(block); } };
    states.set(block,state);mounted.add(block);refresh();
  }
  const refreshAll = () => { for (const block of mounted) { if (block.isConnected) states.get(block)?.refresh(); else states.get(block)?.dispose(); } };
  window.mountCanvasPreview = mountCanvasPreview;
  document.querySelectorAll('.block[data-type="canvas-preview"]').forEach(mountCanvasPreview);
  window.addEventListener("sanctum:canvas-content-updated",refreshAll);
  window.addEventListener("storage",refreshAll);window.addEventListener("focus",refreshAll);
  document.addEventListener("visibilitychange",()=>{ if (!document.hidden) refreshAll(); });
  const grid = document.getElementById("grid");
  if (grid) new MutationObserver(() => { for (const block of mounted) if (!block.isConnected) states.get(block)?.dispose(); }).observe(grid,{childList:true});
})();

if (typeof module !== "undefined" && module.exports) module.exports = { normalizeCanvasPreview, getCanvasPreviewBounds, fitCanvasPreview, zoomCanvasPreview };
