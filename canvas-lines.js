// Infinite canvas connector lines.
(() => {
  const STORAGE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.canvasLines) || "sanctum_canvas_lines";
  const HANDLE_RADIUS = 6;
  const HIT_WIDTH = 18;
  const MIN_LINE_LENGTH = 12;
  const SNAP_DISTANCE = 34;
  const GRID_SIZE = 24;

  let lineToolActive = false;
  let selectedLineId = null;
  let drawState = null;
  let dragState = null;
  let toolbarEl = null;
  let lineRenderFrame = 0;

  function getLines(pageId) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Array.isArray(all[pageId]) ? all[pageId] : [];
    } catch {
      return [];
    }
  }

  function saveLines(pageId, lines) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      all[pageId] = lines;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {}
  }

  function pushLine(pageId, line) {
    const lines = getLines(pageId);
    lines.push(line);
    saveLines(pageId, lines);
  }

  function patchLine(pageId, id, patch) {
    saveLines(pageId, getLines(pageId).map(line => line.id === id ? { ...line, ...patch } : line));
  }

  function removeLine(pageId, id) {
    saveLines(pageId, getLines(pageId).filter(line => line.id !== id));
  }

  function isInfiniteCanvasActive() {
    return document.body.classList.contains("infinite-canvas-page");
  }

  function getScale() {
    const metrics = window.getCanvasLayoutMetrics?.();
    const scale = Number(metrics?.scale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function clientToCanvas(clientX, clientY) {
    const metrics = window.getCanvasLayoutMetrics?.();
    if (!metrics?.stageRect) return null;
    const scale = getScale();
    return {
      x: (clientX - metrics.stageRect.left) / scale,
      y: (clientY - metrics.stageRect.top) / scale
    };
  }

  function canvasToClient(x, y) {
    const metrics = window.getCanvasLayoutMetrics?.();
    if (!metrics?.stageRect) return null;
    const scale = getScale();
    return {
      x: metrics.stageRect.left + x * scale,
      y: metrics.stageRect.top + y * scale
    };
  }

  function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function readNumber(value, fallback = 0) {
    const parsed = parseInt(value || "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function getBlockBounds(block) {
    const scale = getScale();
    const rect = block.getBoundingClientRect();
    const width = readNumber(block.style.width, rect.width / scale);
    const height = readNumber(block.style.height, rect.height / scale);
    return {
      left: readNumber(block.style.left, 0),
      top: readNumber(block.style.top, 0),
      width,
      height
    };
  }

  function getBlockAnchors() {
    const grid = document.getElementById("grid");
    if (!grid) return [];

    const anchors = [];
    grid.querySelectorAll(".block").forEach(block => {
      if (block.classList.contains("ghost")) return;
      const { left, top, width, height } = getBlockBounds(block);
      if (!width || !height) return;
      anchors.push(
        { x: snapToGrid(left + width / 2), y: snapToGrid(top), blockId: block.id, side: "top" },
        { x: snapToGrid(left + width), y: snapToGrid(top + height / 2), blockId: block.id, side: "right" },
        { x: snapToGrid(left + width / 2), y: snapToGrid(top + height), blockId: block.id, side: "bottom" },
        { x: snapToGrid(left), y: snapToGrid(top + height / 2), blockId: block.id, side: "left" }
      );
    });
    return anchors;
  }

  function getNearestAnchorForBlockPoint(block, point) {
    if (!block?.id || !point) return null;
    const { left, top, width, height } = getBlockBounds(block);
    if (!width || !height) return null;

    const right = left + width;
    const bottom = top + height;
    const candidates = [
      { side: "top", distance: Math.abs(point.y - top), x: snapToGrid(left + width / 2), y: snapToGrid(top) },
      { side: "right", distance: Math.abs(right - point.x), x: snapToGrid(right), y: snapToGrid(top + height / 2) },
      { side: "bottom", distance: Math.abs(bottom - point.y), x: snapToGrid(left + width / 2), y: snapToGrid(bottom) },
      { side: "left", distance: Math.abs(point.x - left), x: snapToGrid(left), y: snapToGrid(top + height / 2) }
    ];

    candidates.sort((a, b) => a.distance - b.distance);
    const anchor = candidates[0];
    return {
      x: anchor.x,
      y: anchor.y,
      blockId: block.id,
      side: anchor.side
    };
  }

  function getContainingBlockAnchor(point) {
    const grid = document.getElementById("grid");
    if (!grid || !point) return null;

    for (const block of grid.querySelectorAll(".block")) {
      if (block.classList.contains("ghost")) continue;
      const { left, top, width, height } = getBlockBounds(block);
      if (
        point.x >= left
        && point.x <= left + width
        && point.y >= top
        && point.y <= top + height
      ) {
        return getNearestAnchorForBlockPoint(block, point);
      }
    }

    return null;
  }

  function snapPoint(point) {
    if (!point) return null;

    const containingAnchor = getContainingBlockAnchor(point);
    if (containingAnchor) return containingAnchor;

    let best = null;
    getBlockAnchors().forEach(anchor => {
      const dx = anchor.x - point.x;
      const dy = anchor.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
        best = { ...anchor, distance };
      }
    });

    return best || {
      x: snapToGrid(point.x),
      y: snapToGrid(point.y),
      blockId: null,
      side: null
    };
  }

  function getBlockAnchor(blockId, side) {
    if (!blockId || !side) return null;
    const block = document.getElementById(blockId);
    if (!block?.classList?.contains("block")) return null;

    const { left, top, width, height } = getBlockBounds(block);
    const anchors = {
      top: { x: snapToGrid(left + width / 2), y: snapToGrid(top) },
      right: { x: snapToGrid(left + width), y: snapToGrid(top + height / 2) },
      bottom: { x: snapToGrid(left + width / 2), y: snapToGrid(top + height) },
      left: { x: snapToGrid(left), y: snapToGrid(top + height / 2) }
    };

    return anchors[side] || null;
  }

  function resolveLine(line) {
    const start = getBlockAnchor(line.startBlockId, line.startSide);
    const end = getBlockAnchor(line.endBlockId, line.endSide);
    return {
      ...line,
      x1: start?.x ?? line.x1,
      y1: start?.y ?? line.y1,
      x2: end?.x ?? line.x2,
      y2: end?.y ?? line.y2
    };
  }

  function svgEl(tag) {
    return document.createElementNS("http://www.w3.org/2000/svg", tag);
  }

  function ensureSvgLayer(grid) {
    let svg = grid.querySelector(".canvas-lines-layer");
    if (!svg) {
      svg = svgEl("svg");
      svg.id = "canvasLinesLayer";
      svg.classList.add("canvas-lines-layer");
      grid.appendChild(svg);
    }
    return svg;
  }

  function syncSvgSize(svg, grid) {
    const width = readNumber(grid.dataset.canvasWidth, 4800);
    const height = readNumber(grid.dataset.canvasHeight, 3200);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  function ensureArrowDefs(svg) {
    let defs = svg.querySelector("defs[data-canvas-lines-defs]");
    if (!defs) {
      defs = svgEl("defs");
      defs.dataset.canvasLinesDefs = "true";
      svg.prepend(defs);
    }

    if (defs.querySelector("#canvas-line-arrow")) return;

    const marker = svgEl("marker");
    marker.id = "canvas-line-arrow";
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "7");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("orient", "auto-start-reverse");

    const arrow = svgEl("path");
    arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    marker.appendChild(arrow);
    defs.appendChild(marker);
  }

  function linePath(line) {
    if (line.curved && line.cx != null && line.cy != null) {
      return `M ${line.x1} ${line.y1} Q ${line.cx} ${line.cy} ${line.x2} ${line.y2}`;
    }
    return `M ${line.x1} ${line.y1} L ${line.x2} ${line.y2}`;
  }

  function addHandle(group, x, y, type, isCurve = false) {
    const handle = svgEl("circle");
    handle.setAttribute("cx", String(x));
    handle.setAttribute("cy", String(y));
    handle.setAttribute("r", String(HANDLE_RADIUS));
    handle.classList.add("canvas-line-handle");
    if (isCurve) handle.classList.add("canvas-line-handle-curve");
    handle.dataset.handleType = type;
    group.appendChild(handle);
  }

  function makeLineGroup(sourceLine) {
    const line = resolveLine(sourceLine);
    const selected = line.id === selectedLineId;
    const group = svgEl("g");
    group.classList.add("canvas-line");
    if (selected) group.classList.add("selected");
    group.dataset.lineId = line.id;

    const d = linePath(line);
    const width = line.width || 2;

    if (selected) {
      const glow = svgEl("path");
      glow.setAttribute("d", d);
      glow.setAttribute("stroke", "color-mix(in srgb, var(--text-main) 22%, transparent)");
      glow.setAttribute("stroke-width", String(width + 6));
      glow.setAttribute("fill", "none");
      glow.setAttribute("stroke-linecap", "round");
      glow.classList.add("canvas-line-glow");
      group.appendChild(glow);
    }

    const hit = svgEl("path");
    hit.setAttribute("d", d);
    hit.setAttribute("stroke", "transparent");
    hit.setAttribute("stroke-width", String(HIT_WIDTH));
    hit.setAttribute("fill", "none");
    hit.classList.add("canvas-line-hit");
    group.appendChild(hit);

    const path = svgEl("path");
    path.setAttribute("d", d);
    path.setAttribute("stroke", line.color || "var(--text-main)");
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-opacity", selected ? "1" : "0.78");
    if (line.dash) path.setAttribute("stroke-dasharray", line.dash);
    if (line.arrowStart) path.setAttribute("marker-start", "url(#canvas-line-arrow)");
    if (line.arrowEnd) path.setAttribute("marker-end", "url(#canvas-line-arrow)");
    path.classList.add("canvas-line-path");
    group.appendChild(path);

    if (selected) {
      addHandle(group, line.x1, line.y1, "p1");
      addHandle(group, line.x2, line.y2, "p2");
      addHandle(
        group,
        line.cx ?? ((line.x1 + line.x2) / 2),
        line.cy ?? ((line.y1 + line.y2) / 2),
        "curve",
        true
      );
    }

    return group;
  }

  function getSelectedLine(pageId) {
    if (!selectedLineId) return null;
    const line = getLines(pageId).find(item => item.id === selectedLineId) || null;
    return line ? resolveLine(line) : null;
  }

  function ensureLineToolbar() {
    if (toolbarEl) return toolbarEl;

    toolbarEl = document.createElement("div");
    toolbarEl.className = "canvas-line-toolbar";
    toolbarEl.hidden = true;
    toolbarEl.innerHTML = `
      <button type="button" data-line-action="arrow-start" aria-label="Toggle start arrow">&lt;</button>
      <button type="button" data-line-action="arrow-end" aria-label="Toggle end arrow">&gt;</button>
      <button type="button" data-line-action="curve" aria-label="Toggle curve">~</button>
      <button type="button" data-line-action="delete" aria-label="Delete line">x</button>
    `;

    toolbarEl.addEventListener("mousedown", event => {
      event.preventDefault();
      event.stopPropagation();
    });

    toolbarEl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const action = event.target.closest("button")?.dataset.lineAction;
      const pageId = window.getCurrentPageId?.();
      if (!action || !pageId || !selectedLineId) return;

      const line = getSelectedLine(pageId);
      if (!line) return;

      if (action === "delete") {
        removeLine(pageId, selectedLineId);
        selectedLineId = null;
      } else if (action === "arrow-start") {
        patchLine(pageId, selectedLineId, { arrowStart: !line.arrowStart });
      } else if (action === "arrow-end") {
        patchLine(pageId, selectedLineId, { arrowEnd: !line.arrowEnd });
      } else if (action === "curve") {
        patchLine(pageId, selectedLineId, {
          curved: !line.curved,
          cx: line.cx ?? ((line.x1 + line.x2) / 2),
          cy: line.cy ?? ((line.y1 + line.y2) / 2)
        });
      }

      renderLines(pageId);
    });

    document.body.appendChild(toolbarEl);
    return toolbarEl;
  }

  function updateLineToolbar(pageId) {
    const toolbar = ensureLineToolbar();
    const line = getSelectedLine(pageId);

    if (!line || !isInfiniteCanvasActive()) {
      toolbar.hidden = true;
      return;
    }

    const centerX = line.curved && line.cx != null ? (line.x1 + line.x2 + line.cx) / 3 : (line.x1 + line.x2) / 2;
    const centerY = line.curved && line.cy != null ? (line.y1 + line.y2 + line.cy) / 3 : (line.y1 + line.y2) / 2;
    const pos = canvasToClient(centerX, centerY);
    if (!pos) {
      toolbar.hidden = true;
      return;
    }

    toolbar.hidden = false;
    toolbar.querySelector('[data-line-action="arrow-start"]')?.classList.toggle("active", !!line.arrowStart);
    toolbar.querySelector('[data-line-action="arrow-end"]')?.classList.toggle("active", !!line.arrowEnd);
    toolbar.querySelector('[data-line-action="curve"]')?.classList.toggle("active", !!line.curved);

    const left = Math.max(8, Math.min(window.innerWidth - 172, pos.x + 10));
    const top = Math.max(54, Math.min(window.innerHeight - 54, pos.y - 42));
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
  }

  function renderLines(pageId) {
    const grid = document.getElementById("grid");
    if (!grid) return;

    const svg = ensureSvgLayer(grid);
    syncSvgSize(svg, grid);
    ensureArrowDefs(svg);

    svg.querySelectorAll(".canvas-line").forEach(element => element.remove());
    getLines(pageId).forEach(line => svg.appendChild(makeLineGroup(line)));
    updateLineToolbar(pageId);
  }

  window.renderCanvasLines = renderLines;

  function scheduleRenderLines() {
    if (lineRenderFrame) return;
    lineRenderFrame = requestAnimationFrame(() => {
      lineRenderFrame = 0;
      if (!isInfiniteCanvasActive()) return;
      const pageId = window.getCurrentPageId?.();
      if (pageId) renderLines(pageId);
    });
  }

  function cancelDraw() {
    drawState?.previewEl?.remove();
    drawState = null;
  }

  function activateLineTool() {
    if (!isInfiniteCanvasActive()) return;
    lineToolActive = true;
    selectedLineId = null;
    document.body.classList.add("canvas-line-mode");
    document.getElementById("toolLine")?.classList.add("active");
    const pageId = window.getCurrentPageId?.();
    if (pageId) renderLines(pageId);
  }

  function deactivateLineTool() {
    lineToolActive = false;
    document.body.classList.remove("canvas-line-mode");
    document.getElementById("toolLine")?.classList.remove("active");
    cancelDraw();
  }

  function onViewportMouseDown(event) {
    if (!lineToolActive || event.button !== 0) return;
    if (event.target.closest(".canvas-line, .canvas-line-toolbar")) return;

    event.preventDefault();
    event.stopPropagation();

    const point = snapPoint(clientToCanvas(event.clientX, event.clientY));
    const grid = document.getElementById("grid");
    if (!point || !grid) return;

    const svg = ensureSvgLayer(grid);
    const preview = svgEl("path");
    preview.classList.add("canvas-line-preview");
    preview.setAttribute("d", `M ${point.x} ${point.y} L ${point.x} ${point.y}`);
    preview.setAttribute("stroke", "var(--text-main)");
    preview.setAttribute("stroke-width", "2");
    preview.setAttribute("stroke-opacity", "0.55");
    preview.setAttribute("fill", "none");
    preview.setAttribute("stroke-linecap", "round");
    preview.setAttribute("stroke-dasharray", "6 4");
    svg.appendChild(preview);

    drawState = {
      x1: point.x,
      y1: point.y,
      startBlockId: point.blockId || null,
      startSide: point.side || null,
      previewEl: preview
    };
  }

  function onDocumentMouseMove(event) {
    if (drawState?.previewEl) {
      const point = snapPoint(clientToCanvas(event.clientX, event.clientY));
      if (!point) return;
      drawState.previewEl.setAttribute("d", `M ${drawState.x1} ${drawState.y1} L ${point.x} ${point.y}`);
    }

    if (dragState) {
      const pageId = window.getCurrentPageId?.();
      const rawPoint = clientToCanvas(event.clientX, event.clientY);
      const point = dragState.handle === "curve" ? rawPoint : snapPoint(rawPoint);
      if (!pageId || !point) return;

      if (dragState.handle === "p1") {
        patchLine(pageId, dragState.lineId, {
          x1: point.x,
          y1: point.y,
          startBlockId: point.blockId || null,
          startSide: point.side || null
        });
      } else if (dragState.handle === "p2") {
        patchLine(pageId, dragState.lineId, {
          x2: point.x,
          y2: point.y,
          endBlockId: point.blockId || null,
          endSide: point.side || null
        });
      } else if (dragState.handle === "curve") {
        patchLine(pageId, dragState.lineId, { cx: point.x, cy: point.y, curved: true });
      }

      renderLines(pageId);
    }
  }

  function onDocumentMouseUp(event) {
    if (drawState) {
      const point = snapPoint(clientToCanvas(event.clientX, event.clientY));
      if (point) {
        const dx = point.x - drawState.x1;
        const dy = point.y - drawState.y1;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= MIN_LINE_LENGTH) {
          const pageId = window.getCurrentPageId?.();
          if (pageId) {
            const line = {
              id: `line-${Date.now()}`,
              x1: drawState.x1,
              y1: drawState.y1,
              x2: point.x,
              y2: point.y,
              startBlockId: drawState.startBlockId,
              startSide: drawState.startSide,
              endBlockId: point.blockId || null,
              endSide: point.side || null,
              cx: null,
              cy: null,
              curved: false,
              color: null,
              width: 2,
              dash: null,
              arrowStart: false,
              arrowEnd: true
            };
            pushLine(pageId, line);
            selectedLineId = line.id;
            renderLines(pageId);
          }
        }
      }
      cancelDraw();
    }

    if (dragState) {
      dragState = null;
    }
  }

  function onSvgMouseDown(event) {
    const handle = event.target.closest(".canvas-line-handle");
    if (!handle) return;

    event.preventDefault();
    event.stopPropagation();

    const group = handle.closest(".canvas-line");
    if (!group) return;

    dragState = {
      lineId: group.dataset.lineId,
      handle: handle.dataset.handleType
    };
  }

  function onSvgClick(event) {
    const hit = event.target.closest(".canvas-line-hit");
    if (!hit) return;

    event.preventDefault();
    event.stopPropagation();

    const group = hit.closest(".canvas-line");
    if (!group) return;

    selectedLineId = group.dataset.lineId || null;
    const pageId = window.getCurrentPageId?.();
    if (pageId) renderLines(pageId);
  }

  function deleteSelectedLine() {
    if (!selectedLineId || !isInfiniteCanvasActive()) return false;

    const pageId = window.getCurrentPageId?.();
    if (!pageId) return false;

    removeLine(pageId, selectedLineId);
    selectedLineId = null;
    renderLines(pageId);
    return true;
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && lineToolActive) {
      deactivateLineTool();
      return;
    }

    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const activeEl = document.activeElement;
    const tagName = String(activeEl?.tagName || "").toUpperCase();
    if (activeEl?.closest?.('[contenteditable="true"]') || ["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;

    if (deleteSelectedLine()) event.preventDefault();
  });

  document.addEventListener("click", event => {
    if (lineToolActive || !isInfiniteCanvasActive()) return;
    if (event.target.closest(".canvas-lines-layer, .canvas-line-toolbar, .edit-dock")) return;

    if (selectedLineId) {
      selectedLineId = null;
      const pageId = window.getCurrentPageId?.();
      if (pageId) renderLines(pageId);
    }
  }, true);

  function init() {
    const viewport = document.getElementById("infiniteCanvasViewport");
    if (viewport) {
      viewport.addEventListener("mousedown", onViewportMouseDown);
      viewport.addEventListener("mousedown", onSvgMouseDown);
      viewport.addEventListener("click", onSvgClick);
      viewport.addEventListener("scroll", () => {
        const pageId = window.getCurrentPageId?.();
        if (pageId) updateLineToolbar(pageId);
      });
    }

    document.addEventListener("mousemove", onDocumentMouseMove);
    document.addEventListener("mouseup", onDocumentMouseUp);

    document.getElementById("toolLine")?.addEventListener("click", () => {
      lineToolActive ? deactivateLineTool() : activateLineTool();
    });

    document.getElementById("editorDock")?.addEventListener("click", event => {
      const button = event.target.closest(".dock-btn");
      if (button && button.id !== "toolLine" && lineToolActive) deactivateLineTool();
    });

    const boardSurface = document.getElementById("pageBoardSurface");
    if (boardSurface) {
      const observer = new MutationObserver(() => {
        if (boardSurface.classList.contains("is-infinite-canvas")) {
          requestAnimationFrame(() => {
            const pageId = window.getCurrentPageId?.();
            if (pageId) renderLines(pageId);
          });
        } else {
          deactivateLineTool();
          ensureLineToolbar().hidden = true;
        }
      });
      observer.observe(boardSurface, { attributes: true, attributeFilter: ["class"] });
    }

    const grid = document.getElementById("grid");
    if (grid) {
      const observer = new MutationObserver((records) => {
        if (!isInfiniteCanvasActive()) return;
        const hasCanvasBlockChange = records.some(record => {
          const target = record.target;
          if (target?.closest?.(".canvas-lines-layer")) return false;
          if (target?.classList?.contains("canvas-lines-layer")) return false;
          return record.type === "attributes" || record.type === "childList";
        });
        if (hasCanvasBlockChange) {
          scheduleRenderLines();
        }
      });
      observer.observe(grid, {
        attributes: true,
        attributeFilter: ["style", "class"],
        childList: true,
        subtree: true
      });
    }

    window.addEventListener("resize", () => {
      const pageId = window.getCurrentPageId?.();
      if (pageId) updateLineToolbar(pageId);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
