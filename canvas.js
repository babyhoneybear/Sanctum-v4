

// == Move + Resize blocks (edit mode only) ==
const GRID_SIZE = 24;
const TABLE_COLUMN_DEFAULT_WIDTH = GRID_SIZE * 6;
const TABLE_COLUMN_MIN_WIDTH = 72;
const TABLE_COLUMN_RESIZE_HIT_WIDTH = 10;

let activeBlock = null;
let mode = null; // "move" | "resize"
let offsetX = 0, offsetY = 0;
let startX = 0, startY = 0;
let startW = 0, startH = 0;
let activeFrameDropTarget = null;
let activeFrameDropItem = null;
let activeFrameDropHost = null;
let activeFrameDropPosition = "";
let activeFrameDragItem = null;
let activeFrameDragSourceBlock = null;
let activeFrameDragGhost = null;
let activeFrameDragOffsetX = 0;
let activeFrameDragOffsetY = 0;
let activePageCardImageBlock = null;
let activePageCardImageStartY = 0;
let activePageCardImageStartPos = 50;
let activeTableColumnResize = null;
let activeTableCell = null;
let activeTableSelection = null;
let activeTableRangeDrag = null;
let tableSelectionMode = false;

const TABLE_DOCK_MENU_IDS = {
  structure: "tableStructureMenu",
  borders: "tableBordersMenu",
  math: "tableMathMenu"
};

function snap(n) {
  return Math.round(n / GRID_SIZE) * GRID_SIZE;
}

function readCanvasLayoutMetrics() {
  return typeof window.getCanvasLayoutMetrics === "function"
    ? window.getCanvasLayoutMetrics()
    : null;
}

function getCanvasInteractionScale() {
  const metrics = readCanvasLayoutMetrics();
  if (metrics?.isInfinite) {
    const scale = Number(metrics.scale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }
  return 1;
}

function getGridInteractionRect() {
  const metrics = readCanvasLayoutMetrics();
  if (metrics?.isInfinite && metrics.stageRect) {
    return metrics.stageRect;
  }
  return document.getElementById("grid")?.getBoundingClientRect() || null;
}

function getPointerPositionOnGrid(clientX = 0, clientY = 0) {
  const rect = getGridInteractionRect();
  const scale = getCanvasInteractionScale();
  if (!rect) {
    return { x: 0, y: 0, rect: null, scale };
  }

  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
    rect,
    scale
  };
}

function getGridViewportHeight() {
  const metrics = readCanvasLayoutMetrics();
  if (metrics?.isInfinite) {
    return Math.max(0, Math.floor(metrics.logicalHeight || 0));
  }

  const grid = document.getElementById("grid");
  if (!grid) return 0;
  const rectHeight = Math.floor(grid.getBoundingClientRect().height || 0);
  const minHeight = parseInt(grid.style.minHeight || "0", 10);
  return Math.max(0, rectHeight, Number.isFinite(minHeight) ? minHeight : 0);
}

function getGridViewportWidth() {
  const metrics = readCanvasLayoutMetrics();
  if (metrics?.isInfinite) {
    return Math.max(0, Math.floor(metrics.logicalWidth || 0));
  }

  const grid = document.getElementById("grid");
  if (!grid) return 0;
  const rectWidth = Math.floor(grid.getBoundingClientRect().width || 0);
  const minWidth = parseInt(grid.style.minWidth || "0", 10);
  return Math.max(0, rectWidth, Number.isFinite(minWidth) ? minWidth : 0);
}

function getGridContentBounds(grid) {
  let maxRight = 0;
  let maxBottom = 0;

  grid.querySelectorAll(".block").forEach((block) => {
    if (block.classList.contains("ghost")) return;

    const left = parseInt(block.style.left || "0", 10);
    const top = parseInt(block.style.top || "0", 10);
    const width = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10);
    const height = parseInt(block.style.height || block.getBoundingClientRect().height || "0", 10);

    maxRight = Math.max(maxRight, left + width);
    maxBottom = Math.max(maxBottom, top + height);
  });

  return { maxRight, maxBottom };
}

function clampBlockWithinGrid(block, options = {}) {
  if (!block || !block.classList?.contains("block") || block.classList.contains("ghost")) return;

  const gridWidth = getGridViewportWidth();
  if (!gridWidth) return;

  let width = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10);
  if (!Number.isFinite(width) || width <= 0) return;

  let x = parseInt(block.style.left || "0", 10);
  if (!Number.isFinite(x)) x = 0;

  if (options.clampWidth && width > gridWidth) {
    width = gridWidth;
    block.style.width = `${width}px`;
  }

  const maxX = Math.max(0, gridWidth - width);
  const nextX = Math.max(0, Math.min(x, maxX));
  if (nextX !== x) {
    block.style.left = `${nextX}px`;
  }
}

function clampAllBlocksWithinGrid() {
  document.querySelectorAll("#grid .block").forEach((block) => {
    clampBlockWithinGrid(block, { clampWidth: true });
  });
}

function getCanvasTableTarget(element) {
  return element?.closest?.('.frame-item[data-type="table"], .block[data-type="table"]') || null;
}

function getCanvasTableElement(source) {
  if (!source) return null;
  if (source.matches?.(".block-table")) return source;
  return source.querySelector?.(".block-table") || source.closest?.(".block-table") || null;
}

function getCanvasTableHeaderCells(table) {
  if (!table) return [];
  const headerRow = table.querySelector("thead tr");
  return headerRow ? Array.from(headerRow.querySelectorAll("th.table-cell")) : [];
}

function getCanvasTableColgroup(table) {
  return table?.querySelector("colgroup") || null;
}

function getCanvasTableCols(table) {
  const colgroup = getCanvasTableColgroup(table);
  return colgroup ? Array.from(colgroup.querySelectorAll("col")) : [];
}

function getCanvasTableColumnWidth(col, fallbackCell = null) {
  const explicit = parseFloat(col?.style?.width || "0");
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }

  const measured = fallbackCell?.getBoundingClientRect?.().width || 0;
  return Math.max(TABLE_COLUMN_MIN_WIDTH, Math.round(measured || TABLE_COLUMN_DEFAULT_WIDTH));
}

function syncCanvasTablePixelWidth(table) {
  const cols = getCanvasTableCols(table);
  if (!cols.length) return;

  const total = cols.reduce((sum, col) => sum + getCanvasTableColumnWidth(col), 0);
  table.style.width = `${Math.max(TABLE_COLUMN_MIN_WIDTH, Math.round(total))}px`;
}

function normalizeCanvasTableElement(source) {
  const table = getCanvasTableElement(source);
  if (!table) return null;

  const headers = getCanvasTableHeaderCells(table);
  if (!headers.length) return table;

  let colgroup = getCanvasTableColgroup(table);
  if (!colgroup) {
    colgroup = document.createElement("colgroup");
    table.insertBefore(colgroup, table.firstChild);
  }

  const cols = getCanvasTableCols(table);

  while (cols.length < headers.length) {
    const col = document.createElement("col");
    colgroup.appendChild(col);
    cols.push(col);
  }

  while (cols.length > headers.length) {
    cols.pop()?.remove();
  }

  headers.forEach((header, index) => {
    cols[index].style.width = `${Math.round(getCanvasTableColumnWidth(cols[index], header))}px`;
  });

  syncCanvasTablePixelWidth(table);
  return table;
}

function beginCanvasTableColumnResize(event) {
  const header = event.target.closest?.("th.table-cell");
  if (!header) return false;

  const rect = header.getBoundingClientRect();
  if (!rect.width || event.clientX < rect.right - TABLE_COLUMN_RESIZE_HIT_WIDTH) {
    return false;
  }

  const table = normalizeCanvasTableElement(header.closest(".block-table"));
  const tableTarget = getCanvasTableTarget(header);
  if (!table || !tableTarget) return false;

  const headers = getCanvasTableHeaderCells(table);
  const index = headers.indexOf(header);
  if (index < 0) return false;

  const cols = getCanvasTableCols(table);
  const currentCol = cols[index] || null;
  const nextCol = cols[index + 1] || null;
  if (!currentCol) return false;

  activeTableColumnResize = {
    table,
    tableTarget,
    header,
    currentCol,
    nextCol,
    startX: event.clientX,
    startWidth: getCanvasTableColumnWidth(currentCol, header),
    nextStartWidth: nextCol ? getCanvasTableColumnWidth(nextCol, headers[index + 1]) : 0
  };

  header.classList.add("table-col-resizing");
  document.body.classList.add("table-column-resizing");
  selectBlock(tableTarget);
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

function setActiveTableCell(cell) {
  if (activeTableCell === cell) return;
  activeTableCell?.classList.remove("table-cell-active");
  activeTableCell = cell || null;
  activeTableCell?.classList.add("table-cell-active");
}

function getActiveTableCellForTarget(tableTarget = null) {
  if (activeTableCell && (!tableTarget || tableTarget.contains(activeTableCell))) {
    return activeTableCell;
  }

  const focused = document.activeElement?.closest?.(".table-cell") || null;
  if (focused && (!tableTarget || tableTarget.contains(focused))) {
    return focused;
  }

  return null;
}

function getCanvasTableGridRows(table) {
  if (!table) return [];

  const rows = [];
  const headerRow = table.querySelector("thead tr");
  if (headerRow) {
    rows.push(Array.from(headerRow.children).filter((cell) => cell.classList?.contains("table-cell")));
  }

  table.querySelectorAll("tbody tr").forEach((row) => {
    rows.push(Array.from(row.children).filter((cell) => cell.classList?.contains("table-cell")));
  });

  return rows.filter((row) => row.length);
}

function getTableCellGridPosition(cell, rows = null) {
  const table = cell?.closest?.(".block-table");
  if (!table) return null;

  const gridRows = rows || getCanvasTableGridRows(table);
  for (let rowIndex = 0; rowIndex < gridRows.length; rowIndex += 1) {
    const colIndex = gridRows[rowIndex].indexOf(cell);
    if (colIndex >= 0) {
      return { table, rows: gridRows, rowIndex, colIndex };
    }
  }

  return null;
}

function clearTableRangeSelection(options = {}) {
  if (activeTableSelection?.cells?.length) {
    activeTableSelection.cells.forEach((cell) => {
      cell.classList.remove("table-cell-selected");
    });
  }

  activeTableSelection = null;
  if (!options.silent) {
    refreshCanvasDockToolState();
  }
}

function getActiveTableRangeSelection(tableTarget = null) {
  if (!activeTableSelection) return null;

  if (!activeTableSelection.tableTarget?.isConnected) {
    clearTableRangeSelection();
    return null;
  }

  if (tableTarget && activeTableSelection.tableTarget !== tableTarget) {
    return null;
  }

  return activeTableSelection;
}

function setTableRangeSelection(tableTarget, anchorCell, focusCell = anchorCell) {
  const table = normalizeCanvasTableElement(tableTarget);
  if (!table || !anchorCell || !focusCell) {
    clearTableRangeSelection();
    return null;
  }

  const rows = getCanvasTableGridRows(table);
  const anchor = getTableCellGridPosition(anchorCell, rows);
  const focus = getTableCellGridPosition(focusCell, rows);
  if (!anchor || !focus) {
    clearTableRangeSelection();
    return null;
  }

  const minRow = Math.min(anchor.rowIndex, focus.rowIndex);
  const maxRow = Math.max(anchor.rowIndex, focus.rowIndex);
  const minCol = Math.min(anchor.colIndex, focus.colIndex);
  const maxCol = Math.max(anchor.colIndex, focus.colIndex);
  const cells = [];

  for (let rowIndex = minRow; rowIndex <= maxRow; rowIndex += 1) {
    for (let colIndex = minCol; colIndex <= maxCol; colIndex += 1) {
      const cell = rows[rowIndex]?.[colIndex];
      if (cell) cells.push(cell);
    }
  }

  clearTableRangeSelection({ silent: true });

  cells.forEach((cell) => {
    cell.classList.add("table-cell-selected");
  });

  activeTableSelection = {
    tableTarget,
    table,
    anchorCell,
    focusCell,
    rows,
    minRow,
    maxRow,
    minCol,
    maxCol,
    cells
  };

  refreshCanvasDockToolState();
  return activeTableSelection;
}

function setTableSelectionMode(enabled) {
  tableSelectionMode = !!enabled;
  document.body.classList.toggle("table-selection-mode", tableSelectionMode);

  if (!tableSelectionMode) {
    activeTableRangeDrag = null;
    clearTableRangeSelection({ silent: true });
  } else {
    document.activeElement?.blur?.();
    showAppToast("Select mode on. Drag across cells to highlight multiple boxes.");
  }

  refreshCanvasDockToolState();
}

function getActiveTableActionContext(tableTarget = null) {
  const resolvedTarget = tableTarget || getSelectedTableTarget();
  if (!resolvedTarget) return null;

  if (tableSelectionMode) {
    const selection = getActiveTableRangeSelection(resolvedTarget);
    if (selection?.cells?.length) return selection;
  }

  const cell = getActiveTableCellForTarget(resolvedTarget);
  const position = getTableCellGridPosition(cell);
  if (!position) return null;

  return {
    tableTarget: resolvedTarget,
    table: position.table,
    rows: position.rows,
    minRow: position.rowIndex,
    maxRow: position.rowIndex,
    minCol: position.colIndex,
    maxCol: position.colIndex,
    cells: [cell]
  };
}

function serializeCanvasTableHTML(source) {
  const table = getCanvasTableElement(source);
  if (!table) return "";

  const clone = table.cloneNode(true);
  clone.querySelectorAll(".table-cell").forEach((cell) => {
    cell.classList.remove("table-cell-active", "table-cell-selected", "table-col-resizing");
  });

  clone.querySelectorAll(".table-col-resizing").forEach((cell) => {
    cell.classList.remove("table-col-resizing");
  });

  return clone.outerHTML;
}

function getTableCellDefaultBorderColor(cell) {
  return cell?.tagName === "TH" ? "#353535" : "#303030";
}

function getTableCellSideStyleKey(side) {
  return `border${side}Color`;
}

function getTableCellCoordinates(cell) {
  const row = cell?.parentElement;
  if (!row) return null;

  const cells = Array.from(row.children).filter((entry) => entry.classList?.contains("table-cell"));
  const colIndex = cells.indexOf(cell);
  if (colIndex < 0) return null;

  return { row, cells, colIndex };
}

function getAdjacentTableCell(cell, side) {
  const coords = getTableCellCoordinates(cell);
  if (!coords) return null;

  const { row, cells, colIndex } = coords;
  const table = cell.closest(".block-table");
  if (!table) return null;

  if (side === "Left") return cells[colIndex - 1] || null;
  if (side === "Right") return cells[colIndex + 1] || null;

  if (row.parentElement?.tagName === "THEAD") {
    if (side === "Bottom") {
      return table.querySelectorAll("tbody tr")[0]?.children[colIndex] || null;
    }
    return null;
  }

  const bodyRows = Array.from(row.parentElement.querySelectorAll(":scope > tr"));
  const rowIndex = bodyRows.indexOf(row);

  if (side === "Top") {
    if (rowIndex === 0) {
      return table.querySelector("thead tr")?.children[colIndex] || null;
    }
    return bodyRows[rowIndex - 1]?.children[colIndex] || null;
  }

  if (side === "Bottom") {
    return bodyRows[rowIndex + 1]?.children[colIndex] || null;
  }

  return null;
}

function getOppositeTableSide(side) {
  if (side === "Top") return "Bottom";
  if (side === "Right") return "Left";
  if (side === "Bottom") return "Top";
  return "Right";
}

function isTableBorderSideVisible(cell, side) {
  if (!cell) return false;
  const computed = getComputedStyle(cell)[getTableCellSideStyleKey(side)];
  return computed !== "transparent" && computed !== "rgba(0, 0, 0, 0)";
}

function setTableBorderSideVisible(cell, side, visible) {
  if (!cell) return;
  cell.style[getTableCellSideStyleKey(side)] = visible ? getTableCellDefaultBorderColor(cell) : "transparent";
}

function setTableSelectionBorderSide(cell, side, visible) {
  setTableBorderSideVisible(cell, side, visible);

  const adjacent = getAdjacentTableCell(cell, side);
  if (adjacent) {
    setTableBorderSideVisible(adjacent, getOppositeTableSide(side), visible);
  }
}

function getTableBorderPresetTargets(context, preset) {
  const targets = [];

  for (let rowIndex = context.minRow; rowIndex <= context.maxRow; rowIndex += 1) {
    for (let colIndex = context.minCol; colIndex <= context.maxCol; colIndex += 1) {
      const cell = context.rows[rowIndex]?.[colIndex];
      if (!cell) continue;

      const isTop = rowIndex === context.minRow;
      const isRight = colIndex === context.maxCol;
      const isBottom = rowIndex === context.maxRow;
      const isLeft = colIndex === context.minCol;

      if (preset === "all" || preset === "clear") {
        targets.push({ cell, side: "Top" }, { cell, side: "Right" }, { cell, side: "Bottom" }, { cell, side: "Left" });
        continue;
      }

      if (preset === "outer") {
        if (isTop) targets.push({ cell, side: "Top" });
        if (isRight) targets.push({ cell, side: "Right" });
        if (isBottom) targets.push({ cell, side: "Bottom" });
        if (isLeft) targets.push({ cell, side: "Left" });
        continue;
      }

      if (preset === "inner") {
        if (!isTop) targets.push({ cell, side: "Top" });
        if (!isRight) targets.push({ cell, side: "Right" });
        if (!isBottom) targets.push({ cell, side: "Bottom" });
        if (!isLeft) targets.push({ cell, side: "Left" });
        continue;
      }

      if (preset === "top" && isTop) targets.push({ cell, side: "Top" });
      if (preset === "right" && isRight) targets.push({ cell, side: "Right" });
      if (preset === "bottom" && isBottom) targets.push({ cell, side: "Bottom" });
      if (preset === "left" && isLeft) targets.push({ cell, side: "Left" });
    }
  }

  return targets;
}

function applyTableBorderPreset(preset) {
  const context = getActiveTableActionContext();
  if (!context) {
    showAppToast("Pick a table cell first.");
    return;
  }

  const targets = getTableBorderPresetTargets(context, preset);
  if (!targets.length) return;

  const nextVisible = preset !== "clear";

  targets.forEach(({ cell, side }) => {
    setTableSelectionBorderSide(cell, side, nextVisible);
  });

  syncTableTargetLayout(context.tableTarget);
  saveState();
}

function toggleTableBorderSide(side) {
  const tableTarget = getSelectedTableTarget();
  const cell = getActiveTableCellForTarget(tableTarget);
  if (!tableTarget || !cell) return;

  const nextVisible = !isTableBorderSideVisible(cell, side);
  setTableBorderSideVisible(cell, side, nextVisible);

  const adjacent = getAdjacentTableCell(cell, side);
  if (adjacent) {
    setTableBorderSideVisible(adjacent, getOppositeTableSide(side), nextVisible);
  }

  syncTableTargetLayout(tableTarget);
  saveState();
}

function getTableBodyCellReference(cell) {
  const row = cell?.closest?.("tbody tr");
  if (!row) return "";

  const tbody = row.parentElement;
  const rowIndex = Array.from(tbody.querySelectorAll(":scope > tr")).indexOf(row) + 1;
  const colIndex = Array.from(row.children).indexOf(cell) + 1;
  if (rowIndex <= 0 || colIndex <= 0) return "";

  let letters = "";
  let value = colIndex;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return `${letters}${rowIndex}`;
}

function getTableCellFromReference(table, ref = "") {
  const match = String(ref || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match || !table) return null;

  const letters = match[1];
  const rowIndex = Math.max(0, parseInt(match[2], 10) - 1);
  let colIndex = 0;
  for (const char of letters) {
    colIndex = (colIndex * 26) + (char.charCodeAt(0) - 64);
  }
  colIndex -= 1;

  const row = table.querySelectorAll("tbody tr")[rowIndex];
  return row?.children[colIndex] || null;
}

function formatTableFormulaNumber(value) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return (Math.round(value * 10000) / 10000).toFixed(4).replace(/\.0+$|\.?0+$/g, "");
}

function getNumericValueFromTableCell(cell, table, visited = new Set()) {
  if (!cell) return 0;
  if (visited.has(cell)) return 0;

  const formula = String(cell.dataset.tableFormula || "").trim();
  if (formula) {
    visited.add(cell);
    const evaluated = evaluateTableFormula(formula, table, visited);
    visited.delete(cell);
    return Number.isFinite(evaluated) ? evaluated : 0;
  }

  const numeric = parseFloat(String(cell.textContent || "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? numeric : 0;
}

function resolveTableFormulaToken(token, table, visited = new Set()) {
  if (/^[+-]?\d*\.?\d+$/.test(token)) {
    const numeric = parseFloat(token);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const refCell = getTableCellFromReference(table, token);
  if (!refCell) return 0;
  return getNumericValueFromTableCell(refCell, table, visited);
}

function evaluateTableFormula(formula, table, visited = new Set()) {
  const expression = String(formula || "").trim().replace(/^=/, "").replace(/\s+/g, "");
  if (!expression) return null;

  const tokens = expression.match(/[A-Z]+\d+|[+-]?\d*\.?\d+|[+-]/gi);
  if (!tokens || tokens.join("") !== expression) return null;

  let total = null;
  let operator = "+";

  for (const token of tokens) {
    if (token === "+" || token === "-") {
      operator = token;
      continue;
    }

    const value = resolveTableFormulaToken(token, table, visited);
    if (!Number.isFinite(value)) return null;

    if (total === null) {
      total = operator === "-" ? -value : value;
    } else {
      total = operator === "-" ? total - value : total + value;
    }
  }

  return total;
}

function renderTableFormulaCell(cell) {
  const formula = String(cell?.dataset?.tableFormula || "").trim();
  if (!cell || !formula) return;

  const table = cell.closest(".block-table");
  if (!table) return;

  const result = evaluateTableFormula(formula, table);
  if (!Number.isFinite(result)) {
    cell.textContent = formula;
    cell.classList.add("table-cell-formula-error");
    return;
  }

  cell.textContent = formatTableFormulaNumber(result);
  cell.classList.remove("table-cell-formula-error");
  cell.classList.add("table-cell-formula");
}

function syncTableFormulaCells(tableOrTarget) {
  const table = getCanvasTableElement(tableOrTarget);
  if (!table) return;

  table.querySelectorAll(".table-cell[data-table-formula]").forEach((cell) => {
    if (cell === document.activeElement) return;
    renderTableFormulaCell(cell);
  });
}

function commitTableFormulaCell(cell) {
  if (!cell) return;

  const raw = String(cell.textContent || "").trim();
  if (!raw) {
    delete cell.dataset.tableFormula;
    cell.classList.remove("table-cell-formula", "table-cell-formula-error");
    return;
  }

  if (raw.startsWith("=")) {
    cell.dataset.tableFormula = raw;
    renderTableFormulaCell(cell);
    return;
  }

  delete cell.dataset.tableFormula;
  cell.classList.remove("table-cell-formula", "table-cell-formula-error");
}

function applyTableRowFormula(mode = "sum") {
  const tableTarget = getSelectedTableTarget();
  const cell = getActiveTableCellForTarget(tableTarget);
  const row = cell?.closest?.("tbody tr");
  if (!tableTarget || !cell || !row) return;

  const refs = Array.from(row.children)
    .filter((entry) => entry.classList?.contains("table-cell") && entry !== cell)
    .map((entry) => getTableBodyCellReference(entry))
    .filter(Boolean);

  if (!refs.length) return;

  cell.textContent = mode === "subtract"
    ? `=${refs[0]}${refs.slice(1).map((ref) => `-${ref}`).join("")}`
    : `=${refs.join("+")}`;

  commitTableFormulaCell(cell);
  syncTableFormulaCells(tableTarget);
  syncTableTargetLayout(tableTarget);
  saveState();
}

function applyTableColumnFormula(mode = "sum") {
  const tableTarget = getSelectedTableTarget();
  const cell = getActiveTableCellForTarget(tableTarget);
  const table = getCanvasTableElement(tableTarget);
  const row = cell?.closest?.("tbody tr");
  if (!tableTarget || !table || !cell || !row) return;

  const colIndex = Array.from(row.children).indexOf(cell);
  if (colIndex < 0) return;

  const refs = Array.from(table.querySelectorAll("tbody tr"))
    .map((entry) => entry.children[colIndex] || null)
    .filter((entry) => entry?.classList?.contains("table-cell") && entry !== cell)
    .map((entry) => getTableBodyCellReference(entry))
    .filter(Boolean);

  if (!refs.length) return;

  cell.textContent = mode === "subtract"
    ? `=${refs[0]}${refs.slice(1).map((ref) => `-${ref}`).join("")}`
    : `=${refs.join("+")}`;

  commitTableFormulaCell(cell);
  syncTableFormulaCells(tableTarget);
  syncTableTargetLayout(tableTarget);
  saveState();
}

function clearFrameDropPreview() {
  activeFrameDropTarget?.classList.remove("frame-drop-target");
  activeFrameDropItem?.classList.remove("frame-drop-before", "frame-drop-after", "frame-drop-before-inline", "frame-drop-after-inline", "frame-drop-vertical-preview");
  activeFrameDropHost?.classList.remove("frame-drop-empty");

  activeFrameDropTarget = null;
  activeFrameDropItem = null;
  activeFrameDropHost = null;
  activeFrameDropPosition = "";
}

function setFrameDropPreview(containerBlock, placement = {}) {
  const host = placement.host || null;
  const previewItem = placement.beforeItem || placement.afterItem || null;
  const previewPosition = placement.position || (placement.beforeItem ? "before" : (placement.afterItem ? "after" : ""));
  const isSamePreview = activeFrameDropTarget === containerBlock
    && activeFrameDropItem === previewItem
    && activeFrameDropHost === host
    && activeFrameDropPosition === previewPosition;

  if (isSamePreview) return;

  clearFrameDropPreview();

  activeFrameDropTarget = containerBlock;
  activeFrameDropItem = previewItem;
  activeFrameDropHost = host;
  activeFrameDropPosition = previewPosition;

  activeFrameDropTarget?.classList.add("frame-drop-target");

  if (activeFrameDropItem && activeFrameDropPosition) {
    if (isVerticalDividerType(activeFrameDragItem?.dataset?.frameChildType || activeFrameDragItem?.dataset?.type || activeFrameDragItem?.dataset?.type || "")) {
      activeFrameDropItem.classList.add("frame-drop-vertical-preview");
    }
    activeFrameDropItem.classList.add(`frame-drop-${activeFrameDropPosition}`);
    return;
  }

  activeFrameDropHost?.classList.add("frame-drop-empty");
}

function getFrameDraggableType(node) {
  if (!node) return "";
  if (node.classList?.contains("frame-item")) {
    const type = node.dataset.frameChildType || node.dataset.type || "";
    return ["text", "image", "page", "domain", "divider", "divider-vertical", "divider-updown", "divider-dashed"].includes(type) ? type : "";
  }
  return getFrameDropTypeForBlock(node);
}

function isDividerType(type = "") {
  return ["divider", "divider-vertical", "divider-updown", "divider-dashed"].includes(type);
}

function isVerticalDividerType(type = "") {
  return type === "divider-vertical" || type === "divider-updown";
}

function getFrameDropTargetAtPoint(clientX, clientY, movingNode) {
  if (!getFrameDraggableType(movingNode)) return null;

  const elements = document.elementsFromPoint(clientX, clientY);
  return elements.find((el) => {
    return el?.classList?.contains("block")
      && el.dataset.type === "container"
      && el !== movingNode
      && !movingNode.contains?.(el);
  }) || null;
}

function getFrameDropPlacement(containerBlock, clientY, clientX = 0, ignoreItem = null) {
  const host = getContainerItemsHost(containerBlock);
  if (!host) return { host: null };

  const items = Array.from(host.querySelectorAll(":scope > .frame-item")).filter((item) => item !== ignoreItem);
  if (!items.length) return { host };

  for (const item of items) {
    const rect = item.getBoundingClientRect();
    if (clientY >= rect.top && clientY <= rect.bottom) {
      if (clientX <= rect.left + (rect.width / 2)) {
        return { host, beforeItem: item, position: "before-inline" };
      }

      return { host, afterItem: item, position: "after-inline" };
    }

    if (clientY < rect.top + (rect.height / 2)) {
      return { host, beforeItem: item, position: "before" };
    }
  }

  return {
    host,
    afterItem: items[items.length - 1] || null,
    position: "after"
  };
}

function positionFrameDragGhost(clientX, clientY) {
  if (!activeFrameDragGhost) return;
  activeFrameDragGhost.style.left = `${Math.round(clientX - activeFrameDragOffsetX)}px`;
  activeFrameDragGhost.style.top = `${Math.round(clientY - activeFrameDragOffsetY)}px`;
}

function clearFrameItemDragState() {
  activeFrameDragItem?.classList.remove("frame-item-dragging-source");
  activeFrameDragGhost?.remove();

  activeFrameDragItem = null;
  activeFrameDragSourceBlock = null;
  activeFrameDragGhost = null;
  activeFrameDragOffsetX = 0;
  activeFrameDragOffsetY = 0;
}

// Kill native HTML drag always (prevents 🚫 ghost)
document.addEventListener("dragstart", (e) => {
  if (e.target.closest(".block")) e.preventDefault();
});

document.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;

  if (beginCanvasTableColumnResize(e)) return;

  if (e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest(".page-card-media-action")) return;

  const media = e.target.closest(".page-card-media");
  const mediaBlock = getPageCardHost(media);
  if (media && mediaBlock && getPageCardView(mediaBlock) === "gallery" && resolvePageCardImageSource(mediaBlock)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    activePageCardImageBlock = mediaBlock;
    activePageCardImageStartY = e.clientY;
    activePageCardImageStartPos = getPageCardImagePosition(mediaBlock);
    return;
  }

  if (e.target.closest(".frame-item")) return;

  const handle = e.target.closest(".block-resize-handle");
  const block = e.target.closest(".block");
  if (!block) return;

  if (getCanvasTargetType(block) === "calendar") {
    const inlineShell = e.target.closest(".page-database-block-shell");
    const titleHandle = e.target.closest(".page-database-block-title");
    if (inlineShell && !titleHandle && !handle) {
      return;
    }
  }

  e.preventDefault();
  clearFrameDropPreview();

  activeBlock = block;

  const rect = block.getBoundingClientRect();
  const scale = getCanvasInteractionScale();
  startX = e.clientX;
  startY = e.clientY;

  if (handle) {
    mode = "resize";
    startW = rect.width / scale;
    startH = rect.height / scale;
    return;
  }

  mode = "move";

  // offset inside the block where you grabbed it
  offsetX = (e.clientX - rect.left) / scale;
  offsetY = (e.clientY - rect.top) / scale;

  // make sure left/top are relative to grid
  // (no action needed here—mousemove will set them)
});

document.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;
  if (e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest(".frame-item-delete, .frame-item-image-action, .container-insert-prompt")) return;

  const item = e.target.closest(".frame-item");
  const sourceBlock = item?.closest('.block[data-type="container"]');
  if (!item || !sourceBlock) return;

  if (selectedBlock !== item) {
    e.preventDefault();
    e.stopImmediatePropagation();
    selectBlock(item);
    return;
  }

  e.preventDefault();
  e.stopImmediatePropagation();

  if (typeof placing !== "undefined" && placing) {
    if (typeof stopPlacing === "function") stopPlacing(true);
  }

  clearFrameDropPreview();
  clearFrameItemDragState();

  const rect = item.getBoundingClientRect();
  activeFrameDragItem = item;
  activeFrameDragSourceBlock = sourceBlock;
  activeFrameDragOffsetX = e.clientX - rect.left;
  activeFrameDragOffsetY = e.clientY - rect.top;

  activeFrameDragGhost = item.cloneNode(true);
  activeFrameDragGhost.classList.add("frame-item-drag-ghost");
  activeFrameDragGhost.style.width = `${Math.round(rect.width)}px`;
  activeFrameDragGhost.style.height = `${Math.round(rect.height)}px`;
  document.body.appendChild(activeFrameDragGhost);

  item.classList.add("frame-item-dragging-source");
  positionFrameDragGhost(e.clientX, e.clientY);
  selectBlock(item);
});

document.addEventListener("mousemove", (e) => {
  if (activeTableColumnResize) {
    const { table, currentCol, nextCol, startX, startWidth, nextStartWidth } = activeTableColumnResize;
    let delta = e.clientX - startX;

    let nextWidth = startWidth + delta;
    if (nextCol) {
      const minDelta = TABLE_COLUMN_MIN_WIDTH - startWidth;
      const maxDelta = nextStartWidth - TABLE_COLUMN_MIN_WIDTH;
      delta = Math.max(minDelta, Math.min(delta, maxDelta));
      nextWidth = startWidth + delta;
      const neighborWidth = nextStartWidth - delta;
      nextCol.style.width = `${Math.round(Math.max(TABLE_COLUMN_MIN_WIDTH, neighborWidth))}px`;
    } else {
      nextWidth = Math.max(TABLE_COLUMN_MIN_WIDTH, nextWidth);
    }

    currentCol.style.width = `${Math.round(Math.max(TABLE_COLUMN_MIN_WIDTH, nextWidth))}px`;
    syncCanvasTablePixelWidth(table);
    return;
  }

  if (activePageCardImageBlock) {
    const media = activePageCardImageBlock.querySelector(".page-card-media");
    const mediaRect = media?.getBoundingClientRect();
    const travel = Math.max((mediaRect?.height || 0) * 0.8, 80);
    const delta = e.clientY - activePageCardImageStartY;
    const nextPos = activePageCardImageStartPos + ((delta / travel) * 100);
    setPageCardImagePosition(activePageCardImageBlock, nextPos, { skipSave: true });
    return;
  }

  if (activeFrameDragItem) {
    positionFrameDragGhost(e.clientX, e.clientY);

    const frameDropTarget = getFrameDropTargetAtPoint(e.clientX, e.clientY, activeFrameDragItem);
    if (!frameDropTarget) {
      clearFrameDropPreview();
    } else {
      setFrameDropPreview(frameDropTarget, getFrameDropPlacement(frameDropTarget, e.clientY, e.clientX, activeFrameDragItem));
    }

    return;
  }

  if (!activeBlock || !mode) return;
  const pointer = getPointerPositionOnGrid(e.clientX, e.clientY);
  if (!pointer.rect) return;
  const gridWidth = getGridViewportWidth();
  const gridHeight = getGridViewportHeight();

  if (mode === "move") {
    let x = pointer.x - offsetX;
    let y = pointer.y - offsetY;

    x = snap(x);
    y = snap(y);

    const blockW = parseInt(activeBlock.style.width || activeBlock.getBoundingClientRect().width, 10);
    const blockH = parseInt(activeBlock.style.height || activeBlock.getBoundingClientRect().height, 10);

    x = Math.max(0, Math.min(x, gridWidth - blockW));
    y = Math.max(0, Math.min(y, gridHeight - blockH));

    activeBlock.style.left = `${x}px`;
    activeBlock.style.top = `${y}px`;

    const frameDropTarget = getFrameDropTargetAtPoint(e.clientX, e.clientY, activeBlock);
    if (!frameDropTarget) {
      clearFrameDropPreview();
    } else {
      setFrameDropPreview(frameDropTarget, getFrameDropPlacement(frameDropTarget, e.clientY, e.clientX));
    }
  }

  if (mode === "resize") {
    clearFrameDropPreview();
    const scale = getCanvasInteractionScale();
    const dx = (e.clientX - startX) / scale;
    const dy = (e.clientY - startY) / scale;
    const blockX = parseInt(activeBlock.style.left || "0", 10) || 0;
    const activeType = activeBlock.dataset.type || "";

    let w = snap(startW + dx);
    let minDims = getMinResizeDimensionsForBlock(activeBlock, w);
    let h = snap(startH + dy);

    if (isVerticalDividerType(activeType)) {
      w = minDims.width;
    } else {
      w = Math.max(minDims.width, w);
      minDims = getMinResizeDimensionsForBlock(activeBlock, w);
      const maxWidth = Math.max(minDims.width, getGridViewportWidth() - blockX);
      w = Math.min(w, maxWidth);
    }

    h = Math.max(minDims.height, h);

    activeBlock.style.width = `${w}px`;
    activeBlock.style.height = `${h}px`;
  }
});

document.addEventListener("mouseup", (e) => {
  if (activeTableColumnResize) {
    const finalTarget = activeTableColumnResize.tableTarget;
    activeTableColumnResize.header?.classList.remove("table-col-resizing");
    activeTableColumnResize = null;
    document.body.classList.remove("table-column-resizing");
    if (typeof saveState === "function") saveState();
    if (finalTarget) selectBlock(finalTarget);
    return;
  }

  if (activePageCardImageBlock) {
    const finalBlock = activePageCardImageBlock;
    activePageCardImageBlock = null;
    activePageCardImageStartY = 0;
    activePageCardImageStartPos = 50;
    saveState();
    selectBlock(finalBlock);
    return;
  }

  if (activeFrameDragItem) {
    const frameDropTarget = getFrameDropTargetAtPoint(e.clientX, e.clientY, activeFrameDragItem);
    if (frameDropTarget) {
      const movedItem = moveFrameItemToContainer(activeFrameDragItem, frameDropTarget, getFrameDropPlacement(frameDropTarget, e.clientY, e.clientX, activeFrameDragItem));
      selectBlock(movedItem || frameDropTarget);
    } else {
      const block = placeFrameItemOnGrid(activeFrameDragItem, e.clientX, e.clientY, activeFrameDragOffsetX, activeFrameDragOffsetY);
      if (block) {
        selectBlock(block);
      }
    }

    clearFrameDropPreview();
    clearFrameItemDragState();
    return;
  }

  if (activeBlock && mode === "move") {
    const frameDropTarget = getFrameDropTargetAtPoint(e.clientX, e.clientY, activeBlock);
    if (frameDropTarget) {
      dropBlockIntoFrame(frameDropTarget, activeBlock, getFrameDropPlacement(frameDropTarget, e.clientY, e.clientX));
      clearFrameDropPreview();
      activeBlock = null;
      mode = null;
      return;
    }
  }

  if (activeBlock && mode === "resize") {
    enforceMinHeight(activeBlock);
  }
  if (activeBlock) expandGrid();
  clearFrameDropPreview();
  activeBlock = null;
  mode = null;
});

// == Place Mode: click +, hover to position, click to drop ==
const addBlockBtn = document.getElementById("addBlockBtn");
const addUndoBtn = document.getElementById("addUndoBtn");
const addRedoBtn = document.getElementById("addRedoBtn");
if (addUndoBtn) addUndoBtn.addEventListener("click", (e) => { e.preventDefault(); undo(); });
if (addRedoBtn) addRedoBtn.addEventListener("click", (e) => { e.preventDefault(); redo(); });

const gridEl = document.getElementById("grid");
const toolText = document.getElementById("toolText");
const toolList = document.getElementById("toolList");
const toolImage = document.getElementById("toolImage");
const toolPage = document.getElementById("toolPage");
const toolDomain = document.getElementById("toolDomain");
const toolDivider = document.getElementById("toolDivider");
const toolDataCallout = document.getElementById("toolDataCallout");
const toolProgress = document.getElementById("toolProgress");
const toolClock = document.getElementById("toolClock");


function startPlacingPreset(preset) {
  if (!document.body.classList.contains("editing")) return;
  placePreset = preset;
  if (placing) stopPlacing(true);
  startPlacing();
}

toolText.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("text"); });
toolList.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("list"); });
toolImage.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("image"); });
toolPage.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("page"); });
toolDomain.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("domain"); });
toolDataCallout?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("data-callout"); });
toolProgress?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("progress"); });
toolClock?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("clock"); });
document.getElementById("toolContainer")?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("container"); });
document.getElementById("toolTable")?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("table"); });
document.getElementById("generateLayoutBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (typeof window.openAssistantWithQuery === "function") {
    const pageTitle = document.getElementById("pageTitle")?.textContent?.trim() || "this page";
    window.openAssistantWithQuery(`Generate a board layout for "${pageTitle}"`);
  }
});

let placing = false;
let ghostBlock = null;
let placePreset= "text"; //"text" | "image" | etc (future use)

function getDefaultBlockDimensions(type = "text") {
  if (type === "list") {
    return { width: snap(GRID_SIZE * 12), height: snap(GRID_SIZE * 4) };
  }

  if (type === "image") {
    return { width: snap(GRID_SIZE * 15), height: snap(GRID_SIZE * 8) };
  }

  if (type === "page" || type === "domain") {
    return { width: snap(GRID_SIZE * 9), height: snap(GRID_SIZE * 1) };
  }

  if (type === "weblink") {
    return { width: snap(GRID_SIZE * 10), height: snap(GRID_SIZE * 2) };
  }

  if (type === "container") {
    return { width: snap(GRID_SIZE * 14), height: snap(GRID_SIZE * 6) };
  }

  if (type === "table") {
    return { width: snap(GRID_SIZE * 18), height: snap(GRID_SIZE * 8) };
  }

  if (type === "calendar") {
    return { width: snap(GRID_SIZE * 18), height: snap(GRID_SIZE * 7) };
  }

  if (type === "data-callout") {
    return { width: snap(GRID_SIZE * 11), height: snap(GRID_SIZE * 3) };
  }

  if (type === "progress") {
    return { width: snap(GRID_SIZE * 12), height: snap(GRID_SIZE * 4) };
  }

  if (type === "clock") {
    return { width: snap(GRID_SIZE * 11), height: snap(GRID_SIZE * 4) };
  }

  if (isVerticalDividerType(type)) {
    return { width: snap(GRID_SIZE * 1), height: snap(GRID_SIZE * 6) };
  }

  if (isDividerType(type)) {
    return { width: snap(GRID_SIZE * 14), height: snap(GRID_SIZE * 1) };
  }

  return { width: snap(GRID_SIZE * 12), height: snap(GRID_SIZE * 1) };
}

function applyDefaultBlockDimensions(block, type, options = {}) {
  if (!block) return;

  const { allowGrow = false, preserveWidth = false, preserveHeight = false } = options;
  const dims = getDefaultBlockDimensions(type);
  const currentWidth = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10);
  const currentHeight = parseInt(block.style.height || block.getBoundingClientRect().height || "0", 10);
  const nextWidth = preserveWidth ? (currentWidth || dims.width) : (allowGrow ? Math.max(currentWidth || 0, dims.width) : dims.width);
  const nextHeight = preserveHeight ? (currentHeight || dims.height) : (allowGrow ? Math.max(currentHeight || 0, dims.height) : dims.height);

  block.style.width = `${nextWidth}px`;
  block.style.height = `${nextHeight}px`;
  clampBlockWithinGrid(block, { clampWidth: true });
}

function placeCaretInsideEditable(element, placeAtEnd = false) {
  if (!element) return;

  const selection = window.getSelection();
  const range = document.createRange();

  if (placeAtEnd) {
    range.selectNodeContents(element);
    range.collapse(false);
  } else {
    range.setStart(element, 0);
    range.collapse(true);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function restoreInlineLinkEditability(root) {
  root?.querySelectorAll(".inline-link").forEach((link) => {
    link.contentEditable = "false";
  });
}

function getPaddingBoxFromValue(paddingValue = "") {
  const parts = String(paddingValue || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => parseFloat(part) || 0);

  if (!parts.length) {
    return { horizontal: 0, vertical: 0 };
  }

  const top = parts[0] || 0;
  const right = parts[1] ?? top;
  const bottom = parts[2] ?? top;
  const left = parts[3] ?? right;

  return {
    horizontal: left + right,
    vertical: top + bottom
  };
}

function getLinkedPageCardDimensions(titleText = "", blockOrOptions = null) {
  const block = blockOrOptions instanceof HTMLElement ? blockOrOptions : null;
  const type = block?.dataset?.type || blockOrOptions?.type || "page";
  const view = getPageCardView(block || blockOrOptions);
  const hideCardIcon = isPageCardIconHidden(block) || isPageCardIconHidden(blockOrOptions);
  const fallbackTitle = type === "domain" ? "Domain" : "Page";
  const domainWidthBoost = type === "domain" ? 10 : 0;
  const domainHeightBoost = type === "domain" ? 2 : 0;
  const title = typeof titleText === "string" && titleText.trim() ? titleText.trim() : fallbackTitle;

  if (view === "gallery") {
    const currentWidth = parseInt(block?.style?.width || blockOrOptions?.w || blockOrOptions?.width || "0", 10);
    const currentHeight = parseInt(block?.style?.height || blockOrOptions?.h || blockOrOptions?.height || "0", 10);
    const minWidth = Math.max(192, snap(GRID_SIZE * 8));
    const resolvedWidth = Math.max(currentWidth || 0, minWidth);
    const minHeight = block
      ? getGalleryCardMinHeight(block, resolvedWidth)
      : Math.max(168, snap(GRID_SIZE * 7));

    return {
      width: resolvedWidth,
      height: Math.max(currentHeight || 0, minHeight)
    };
  }

  const measureCanvas = getLinkedPageCardDimensions.measureCanvas || (getLinkedPageCardDimensions.measureCanvas = document.createElement("canvas"));
  const context = measureCanvas.getContext("2d");

  if (!context) {
    return { width: 96, height: 24 };
  }

  const titleEl = block?.querySelector(".page-card-title");
  const style = titleEl && titleEl.isConnected ? window.getComputedStyle(titleEl) : null;
  const fontSize = style?.fontSize || "13px";
  const fontWeight = style?.fontWeight || "500";
  const fontFamily = style?.fontFamily || "system-ui, sans-serif";
  const fontStyle = style?.fontStyle || "normal";
  const fontVariant = style?.fontVariant || "normal";
  const fontStretch = style?.fontStretch || "normal";
  const blockStyle = block && block.isConnected ? window.getComputedStyle(block) : null;
  const paddingValue = blockStyle?.padding || blockOrOptions?.padding || "";
  const paddingBox = getPaddingBoxFromValue(paddingValue);

  context.font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontStretch} ${fontSize} ${fontFamily}`;

  const textWidth = Math.ceil(context.measureText(title).width);
  const width = Math.max(68 + domainWidthBoost, Math.min(420, textWidth + (hideCardIcon ? 12 : 34) + paddingBox.horizontal + domainWidthBoost));
  const lineHeight = style ? parseFloat(style.lineHeight) : Number.NaN;
  const fontPx = parseFloat(fontSize);
  const baseHeight = Math.ceil(Number.isFinite(lineHeight) ? lineHeight : ((Number.isFinite(fontPx) ? fontPx : 13) * 1.45));
  const height = Math.max(24 + domainHeightBoost, baseHeight + paddingBox.vertical + domainHeightBoost);

  return { width, height };
}

function getGalleryCardMinHeight(block, widthOverride = 0) {
  if (!block) {
    return Math.max(168, snap(GRID_SIZE * 7));
  }

  const previousWidth = block.style.width || "";
  const nextWidth = Math.max(widthOverride || parseInt(previousWidth || block.getBoundingClientRect().width || "0", 10), 192);

  if (widthOverride) {
    block.style.width = `${nextWidth}px`;
  }

  const media = block.querySelector(".page-card-media");
  const info = block.querySelector(".page-card-info");
  const mediaHeight = media
    ? Math.ceil(media.getBoundingClientRect().height)
    : Math.ceil(nextWidth * (10 / 16));
  let infoHeight = 0;

  if (info) {
    const infoStyle = window.getComputedStyle(info);
    const paddingTop = parseFloat(infoStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(infoStyle.paddingBottom) || 0;
    const rowGap = parseFloat(infoStyle.rowGap || infoStyle.gap) || 0;
    const visibleChildren = Array.from(info.children).filter((child) => {
      const childStyle = window.getComputedStyle(child);
      if (childStyle.display === "none" || childStyle.visibility === "hidden") return false;
      if (!(child.textContent || "").trim()) return false;
      return true;
    });

    const contentHeight = visibleChildren.reduce((total, child) => {
      const rectHeight = Math.ceil(child.getBoundingClientRect().height);
      const scrollHeight = Math.ceil(child.scrollHeight || 0);
      return total + Math.max(rectHeight, scrollHeight);
    }, 0);

    infoHeight = Math.ceil(
      paddingTop
      + paddingBottom
      + contentHeight
      + (visibleChildren.length > 1 ? rowGap * (visibleChildren.length - 1) : 0)
    );
  }

  if (widthOverride) {
    if (previousWidth) block.style.width = previousWidth;
    else block.style.removeProperty("width");
  }

  return Math.max(168, snap(mediaHeight + infoHeight));
}

function getMinResizeDimensionsForBlock(block, widthOverride = 0) {
  if (!block) {
    return { width: 120, height: 24 };
  }

  const type = block.dataset.type || "";
  if (isVerticalDividerType(type)) {
    return {
      width: snap(GRID_SIZE * 1),
      height: snap(GRID_SIZE * 6)
    };
  }

  if (isDividerType(type)) {
    return {
      width: snap(GRID_SIZE * 5),
      height: snap(GRID_SIZE * 1)
    };
  }

  if ((type === "page" || type === "domain") && getPageCardView(block) === "gallery") {
    const minWidth = Math.max(192, snap(GRID_SIZE * 8));
    const resolvedWidth = Math.max(widthOverride || parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10), minWidth);

    return {
      width: minWidth,
      height: getGalleryCardMinHeight(block, resolvedWidth)
    };
  }

  return {
    width: 120,
    height: getMinHeightForBlock(block)
  };
}

function fitLinkedPageBlock(block) {
  if (!block) return;

  const type = block.dataset.type || "";
  if (type !== "page" && type !== "domain") return;

  const title = block.querySelector(".page-card-title")?.textContent || "";
  const { width, height } = getLinkedPageCardDimensions(title, block);
  block.style.width = `${width}px`;
  block.style.height = `${height}px`;
  clampBlockWithinGrid(block, { clampWidth: true });

  const ownerBlock = getPageCardOwnerBlock(block);
  if (ownerBlock && ownerBlock !== block) {
    if (typeof autoGrowBlock === "function") {
      autoGrowBlock(ownerBlock);
    }
    if (typeof expandGrid === "function") {
      expandGrid();
    }
  }
}

function getPageCardView(blockOrData) {
  if (!blockOrData) return "default";

  const raw = blockOrData instanceof HTMLElement
    ? blockOrData.dataset.pageCardView
    : blockOrData.pageCardView;

  return raw === "gallery" ? "gallery" : "default";
}

function upgradeLinkedPageCardBlockIfNeeded(block) {
  if (!block || !block.classList?.contains("block")) return block;

  const type = block.dataset.type || "";
  if (type !== "page" && type !== "domain") return block;

  if (block.querySelector(".page-card-media") && block.querySelector(".page-card-media-action")) {
    return block;
  }

  const serialized = serializeBlockElement(block);
  const upgraded = buildBlockFromData(serialized);
  const wasSelected = selectedBlock === block;

  block.replaceWith(upgraded);

  if (wasSelected) {
    selectBlock(upgraded);
  }

  return upgraded;
}

function getStoredPageCardImageSource(blockOrData) {
  if (!blockOrData) return "";

  return blockOrData instanceof HTMLElement
    ? (blockOrData.dataset.pageCardImageSrc || "")
    : (typeof blockOrData.pageCardImageSrc === "string" ? blockOrData.pageCardImageSrc : "");
}

function getPageCardImagePosition(blockOrData) {
  if (!blockOrData) return 50;

  const raw = blockOrData instanceof HTMLElement
    ? blockOrData.dataset.pageCardImagePos
    : blockOrData.pageCardImagePos;

  return normalizeHeaderPos(raw);
}

function getPageCardImageMode(blockOrData) {
  if (!blockOrData) return "none";

  const raw = blockOrData instanceof HTMLElement
    ? blockOrData.dataset.pageCardImageMode
    : blockOrData.pageCardImageMode;

  if (raw === "custom" || raw === "linked" || raw === "none") {
    return raw;
  }

  const linkedPageId = blockOrData instanceof HTMLElement
    ? (blockOrData.dataset.linkedPageId || "")
    : (blockOrData.linkedPageId || "");

  if (linkedPageId) {
    return (getLinkedPageCardImageSource(linkedPageId) || getStoredPageCardImageSource(blockOrData))
      ? "linked"
      : "none";
  }

  return getStoredPageCardImageSource(blockOrData) ? "custom" : "none";
}

function getLinkedPageCardImageSource(linkedPageId = "") {
  if (!linkedPageId) return "";
  const settings = getPageSettings(linkedPageId);
  return settings.showHeader ? (settings.headerSrc || "") : "";
}

function resolvePageCardImageSource(blockOrData) {
  if (!blockOrData) return "";

  const mode = getPageCardImageMode(blockOrData);
  if (mode === "custom") {
    return getStoredPageCardImageSource(blockOrData);
  }

  if (mode === "linked") {
    const linkedPageId = blockOrData instanceof HTMLElement
      ? (blockOrData.dataset.linkedPageId || "")
      : (blockOrData.linkedPageId || "");
    return getLinkedPageCardImageSource(linkedPageId);
  }

  return "";
}

function setPageCardImageSource(block, src = "", options = {}) {
  if (!block) return;

  const media = block.querySelector(".page-card-media");
  const image = block.querySelector(".page-card-image");
  const mediaAction = block.querySelector(".page-card-media-action");
  const fallbackIcon = block.querySelector(".page-card-media-icon");
  const fallbackGlyph = options.fallbackGlyph || (block.dataset.type === "domain" ? "⌂" : "📄");
  const iconValue = options.iconValue || block.dataset.pageCardIcon || fallbackGlyph;
  const nextSrc = typeof src === "string" ? src.trim() : "";

  if (fallbackIcon) {
    setIconElementContent(fallbackIcon, iconValue, fallbackGlyph);
  }

  if (!media || !image) {
    if (nextSrc) block.dataset.pageCardImageSrc = nextSrc;
    else delete block.dataset.pageCardImageSrc;
    return;
  }

  media.dataset.hasImage = nextSrc ? "true" : "false";
  if (mediaAction) {
    mediaAction.textContent = nextSrc ? "Replace image" : "Add image";
  }

  if (nextSrc) {
    image.src = nextSrc;
    image.style.objectPosition = `center ${getPageCardImagePosition(block)}%`;
    block.dataset.pageCardImageSrc = nextSrc;
    return;
  }

  image.removeAttribute("src");
  delete block.dataset.pageCardImageSrc;
}

function setPageCardImagePosition(block, pos = 50, options = {}) {
  if (!block) return;

  const nextPos = normalizeHeaderPos(pos);
  const image = block.querySelector(".page-card-image");
  const media = block.querySelector(".page-card-media");

  block.dataset.pageCardImagePos = String(Math.round(nextPos));
  if (media) media.style.setProperty("--page-card-image-pos", `${nextPos}%`);
  if (image) image.style.objectPosition = `center ${nextPos}%`;

  if (!options.skipSave) {
    saveState();
  }
}

function applyPageCardImage(block, options = {}) {
  if (!block) return;

  block = upgradeLinkedPageCardBlockIfNeeded(block);

  const fallbackGlyph = options.fallbackGlyph || (block.dataset.type === "domain" ? "⌂" : "📄");
  const iconValue = options.iconValue || block.dataset.pageCardIcon || fallbackGlyph;
  const requestedMode = options.mode;
  const nextMode = requestedMode === "custom" || requestedMode === "linked" || requestedMode === "none"
    ? requestedMode
    : getPageCardImageMode(block);

  block.dataset.pageCardImageMode = nextMode;

  const nextSrc = Object.prototype.hasOwnProperty.call(options, "src")
    ? (typeof options.src === "string" ? options.src.trim() : "")
    : resolvePageCardImageSource(block);

  setPageCardImageSource(block, nextMode === "none" ? "" : nextSrc, {
    iconValue,
    fallbackGlyph
  });

  setPageCardImagePosition(block, Object.prototype.hasOwnProperty.call(options, "pos")
    ? options.pos
    : getPageCardImagePosition(block), { skipSave: true });
}

function promptPageCardImageUpload(block) {
  if (!block || (block.dataset.type !== "page" && block.dataset.type !== "domain")) return;

  block = upgradeLinkedPageCardBlockIfNeeded(block);

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,.gif";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;

    const previousMode = getPageCardImageMode(block);
    const previousSrc = getStoredPageCardImageSource(block);
    const fallbackGlyph = block.dataset.type === "domain" ? "⌂" : "📄";
    const iconValue = block.dataset.pageCardIcon || block.querySelector(".page-card-icon")?.textContent || fallbackGlyph;

    try {
      const storedSrc = await prepareImageFileForStorage(file);
      applyPageCardImage(block, {
        mode: "custom",
        src: storedSrc,
        iconValue,
        fallbackGlyph
      });

      if (getPageCardView(block) !== "gallery") {
        setPageCardView(block, "gallery");
      } else {
        fitLinkedPageBlock(block);
      }

      if (typeof expandGrid === "function") expandGrid();

      const saved = saveState();
      if (!saved) {
        applyPageCardImage(block, {
          mode: previousMode,
          src: previousMode === "custom" ? previousSrc : undefined,
          iconValue,
          fallbackGlyph
        });
      }
    } catch (err) {
      console.warn("Failed to prepare card image for storage.", err);
      showAppToast?.("Could not add that card image right now.", "info");
    }
  };

  input.click();
}

function setPageCardView(block, view = "default", options = {}) {
  if (!block) return;

  block = upgradeLinkedPageCardBlockIfNeeded(block);

  const nextView = view === "gallery" ? "gallery" : "default";
  if (nextView === "gallery") {
    block.dataset.pageCardView = "gallery";
  } else {
    delete block.dataset.pageCardView;
  }

  const preserveManual = Object.prototype.hasOwnProperty.call(options, "preserveManual")
    ? !!options.preserveManual
    : nextView === "gallery";

  fitLinkedPageBlock(block, { preserveManual });
}

window.getLinkedPageCardDimensions = getLinkedPageCardDimensions;
window.fitLinkedPageBlock = fitLinkedPageBlock;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result || "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataURL(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image."));
    img.src = src;
  });
}

async function prepareImageFileForStorage(file) {
  const originalDataURL = await readFileAsDataURL(file);
  const mimeType = String(file?.type || "").toLowerCase();

  if (!mimeType.startsWith("image/") || mimeType === "image/gif" || mimeType === "image/svg+xml") {
    return originalDataURL;
  }

  try {
    const image = await loadImageFromDataURL(originalDataURL);
    const maxDimension = 1800;
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return originalDataURL;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const webpDataURL = canvas.toDataURL("image/webp", 0.86);
    if (typeof webpDataURL === "string" && webpDataURL.startsWith("data:image/webp")) {
      return webpDataURL;
    }

    return canvas.toDataURL("image/jpeg", 0.88);
  } catch (err) {
    console.warn("Falling back to original image data for storage.", err);
    return originalDataURL;
  }
}

function promptImageUploadForBlock(block) {
  if (!block || block.dataset.type !== "image") return;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*, .gif";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const body = block.querySelector(".block-body");
    if (!body) return;

    const previousHTML = body.innerHTML;

    try {
      const storedSrc = await prepareImageFileForStorage(file);
      body.innerHTML = `<img src="${storedSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" />`;

      const ownerBlock = block.classList.contains("block") ? block : block.closest(".block");
      if (ownerBlock && typeof autoGrowBlock === "function") {
        autoGrowBlock(ownerBlock);
      }
      if (typeof expandGrid === "function") {
        expandGrid();
      }

      const saved = saveState();
      if (!saved) {
        body.innerHTML = previousHTML;
      }
    } catch (err) {
      body.innerHTML = previousHTML;
      console.warn("Failed to prepare uploaded image for storage.", err);
      showAppToast?.("Could not load that image right now.", "info");
    }
  };
  input.click();
}

function createFrameChildId() {
  return `frame-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeFrameLinkedCardHTML(type = "page") {
  const isDomain = type === "domain";
  const fallbackIcon = isDomain ? "⌂" : "📄";
  const fallbackTitle = isDomain ? "Domain Name" : "Page Title";

  return `
    <div class="block-page-card">
      <div class="page-card-media" data-has-image="false">
        <img class="page-card-image" alt="" draggable="false">
        <div class="page-card-media-fallback">${getIconMarkup(fallbackIcon, fallbackIcon, "page-card-media-icon")}</div>
        <button type="button" class="page-card-media-action">Add image</button>
      </div>
      ${getIconMarkup(fallbackIcon, fallbackIcon, "page-card-icon")}
      <div class="page-card-info">
        <div class="page-card-title">${fallbackTitle}</div>
        <div class="page-card-type-label"></div>
        <div class="page-card-summary"></div>
      </div>
    </div>
  `;
}

function normalizeExternalUrl(value = "") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/\/+/, "")}`;
}

function getWebLinkDetails(value = "") {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) {
    return {
      normalized: "",
      label: "",
      iconLabel: "↗",
      faviconSrc: "",
      canOpen: false,
    };
  }

  try {
    const parsed = new URL(normalized);
    const hostname = (parsed.hostname || "").replace(/^www\./i, "");
    const label = hostname || normalized;
    const iconLabel = (label.charAt(0) || "↗").toUpperCase();
    const canUseFavicon = parsed.protocol === "http:" || parsed.protocol === "https:";

    return {
      normalized,
      label,
      iconLabel,
      faviconSrc: canUseFavicon ? `${parsed.origin}/favicon.ico` : "",
      canOpen: canUseFavicon || parsed.protocol === "mailto:" || parsed.protocol === "tel:",
    };
  } catch {
    const label = normalized.replace(/^https?:\/\//i, "");
    return {
      normalized,
      label,
      iconLabel: (label.charAt(0) || "↗").toUpperCase(),
      faviconSrc: "",
      canOpen: false,
    };
  }
}

function makeWebLinkCardHTML() {
  return `
    <div class="block-weblink-card">
      <div class="weblink-card-leading" aria-hidden="true">
        <img class="weblink-card-favicon" alt="" draggable="false">
        <div class="weblink-card-fallback">↗</div>
      </div>
      <div class="weblink-card-content">
        <div class="block-title weblink-card-title" contenteditable="true" spellcheck="false" data-placeholder="Link title"></div>
        <div class="weblink-card-url">No URL set</div>
      </div>
      <div class="weblink-card-actions">
        <button type="button" class="weblink-set-url-btn" title="Edit URL">Edit</button>
        <button type="button" class="weblink-open-btn" aria-label="Open link" title="Open link" disabled>↗</button>
      </div>
    </div>
  `;
}

function getWebLinkHost(target) {
  return target?.closest?.('.frame-item[data-frame-child-type="weblink"], .block[data-type="weblink"]') || null;
}

function syncWebLinkCardTarget(target, options = {}) {
  if (!target) return target;

  const incomingUrl = Object.prototype.hasOwnProperty.call(options, "url")
    ? options.url
    : (target.dataset.externalUrl || "");
  const previousDetails = getWebLinkDetails(target.dataset.externalUrl || "");
  const nextDetails = getWebLinkDetails(incomingUrl);

  target.dataset.externalUrl = nextDetails.normalized;

  const urlEl = target.querySelector(".weblink-card-url");
  if (urlEl) {
    urlEl.textContent = nextDetails.label || "No URL set";
  }

  const fallbackEl = target.querySelector(".weblink-card-fallback");
  if (fallbackEl) {
    fallbackEl.textContent = nextDetails.iconLabel;
  }

  const faviconEl = target.querySelector(".weblink-card-favicon");
  if (faviconEl) {
    faviconEl.onload = () => {
      faviconEl.hidden = false;
    };
    faviconEl.onerror = () => {
      faviconEl.onerror = null;
      faviconEl.hidden = true;
      faviconEl.removeAttribute("src");
    };

    if (nextDetails.faviconSrc) {
      faviconEl.src = nextDetails.faviconSrc;
      faviconEl.hidden = false;
    } else {
      faviconEl.removeAttribute("src");
      faviconEl.hidden = true;
    }
  }

  const openBtn = target.querySelector(".weblink-open-btn");
  if (openBtn) {
    openBtn.disabled = !nextDetails.canOpen;
    openBtn.classList.toggle("is-disabled", !nextDetails.canOpen);
  }

  const titleEl = target.querySelector(".weblink-card-title");
  const currentTitle = titleEl?.textContent?.trim() || "";
  const previousLabels = [previousDetails.label, previousDetails.normalized].filter(Boolean);
  const shouldAutofillTitle = !!nextDetails.label
    && (!currentTitle || options.forceTitle === true || previousLabels.includes(currentTitle));

  if (titleEl && shouldAutofillTitle) {
    titleEl.textContent = nextDetails.label;
  }

  return target;
}

function openWebLinkTarget(target) {
  const details = getWebLinkDetails(target?.dataset?.externalUrl || "");
  if (!details.canOpen) {
    showAppToast?.("No valid URL set for this link.", "info");
    return false;
  }

  window.open(details.normalized, "_blank", "noopener,noreferrer");
  return true;
}

function promptForWebLinkUrl(target) {
  if (!target) return null;

  const current = target.dataset.externalUrl || "";
  const nextValue = prompt("Enter URL:", current);
  if (nextValue === null) return null;

  syncWebLinkCardTarget(target, { url: nextValue });
  if (typeof saveState === "function") saveState();
  return target;
}

window.syncWebLinkCardTarget = syncWebLinkCardTarget;

function getContainerItemsHost(containerBlock) {
  return containerBlock?.querySelector(".container-items") || null;
}

function hasFrameItems(containerBlock) {
  const host = getContainerItemsHost(containerBlock);
  return !!host?.querySelector(":scope > .frame-item");
}

function syncContainerInsertPrompt(containerBlock) {
  const prompt = containerBlock?.querySelector(".container-insert-prompt");
  if (!prompt) return;
  prompt.hidden = hasFrameItems(containerBlock);
}

function applyStoredFrameItemStyles(item, data = {}) {
  if (!item) return;

  item.dataset.bgState = data.bg ? "alt" : "default";
  item.dataset.borderState = data.borderColor ? "alt" : "default";
  item.dataset.textState = data.textColor ? "alt" : "default";
  item.dataset.paddingState = data.padding ? "expanded" : "default";
  item.dataset.radiusState = data.radius
    ? (data.radius === "2px" ? "square" : "rounded")
    : "square";

  if (data.bg) applyBlockBackgroundTone(item, data.bg);
  if (data.borderColor) applyBlockBorderTone(item, data.borderColor);
  if (data.textColor) applyBlockTextTone(item, data.textColor);
  if (data.padding) applyBlockPaddingTone(item, data.padding);
  if (data.radius) item.style.borderRadius = data.radius;
}

function getFrameItemTextContent(item) {
  return item?.querySelector(".frame-item-text-content") || null;
}

function isFrameTextItemEmpty(item) {
  const editable = getFrameItemTextContent(item);
  if (!editable) return false;

  const plainText = String(editable.textContent || "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (plainText) return false;

  const html = String(editable.innerHTML || "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/<div>\s*<\/div>/gi, "")
    .trim();

  return !html;
}

function focusFrameTextItem(item, placeAtEnd = false) {
  const editable = getFrameItemTextContent(item);
  if (!editable) return;
  editable.focus();
  placeCaretInsideEditable(editable, placeAtEnd);
}

function getSerializedContainerItems(blockData) {
  return Array.isArray(blockData?.containerItems) ? blockData.containerItems : [];
}

function getLegacyContainerBodyHTMLFromItems(items = []) {
  return items.map((item) => {
    const type = item?.type || "text";

    if (type === "text") {
      return item.bodyHTML || "";
    }

    if (type === "image") {
      return item.bodyHTML || "";
    }

    if (type === "table") {
      return item.tableHTML || "";
    }

    if (type === "page" || type === "domain") {
      const title = escapeHTML(item.pageCardTitle || (type === "domain" ? "Domain" : "Page"));
      return `<div>${title}</div>`;
    }

    if (type === "weblink") {
      const title = String(item.titleHTML || item.externalUrl || "Link")
        .replace(/<[^>]*>/g, " ")
        .trim();
      return `<div>${escapeHTML(title || "Link")}</div>`;
    }

    if (isDividerType(type)) {
      return "<div>---</div>";
    }

    return "";
  }).join("");
}

function getContainerLegacyBodyHTML(containerBlock) {
  return getLegacyContainerBodyHTMLFromItems(serializeContainerItems(containerBlock));
}

function buildFrameItemElement(data = {}) {
  const type = data.type || "text";
  const item = document.createElement("div");

  item.className = `frame-item frame-item-${type}`;
  item.dataset.frameChildId = data.id || createFrameChildId();
  item.dataset.frameChildType = type;

  if (type === "text") {
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      <div class="frame-item-text-content" contenteditable="true" spellcheck="false"></div>
    `;

    const editable = getFrameItemTextContent(item);
    if (editable) {
      editable.innerHTML = data.bodyHTML || "";
      restoreInlineLinkEditability(editable);
    }

    applyStoredFrameItemStyles(item, data);

    return item;
  }

  if (type === "image") {
    item.dataset.type = "image";
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      <div class="block-body block-image-body">${data.bodyHTML || '<div class="image-placeholder">🖼 Click replace to add image</div>'}</div>
      <button type="button" class="frame-item-image-action">Replace</button>
    `;
    applyStoredFrameItemStyles(item, data);
    return item;
  }

  if (type === "table") {
    item.dataset.type = "table";
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      ${makeBlockHTML("table")}
    `;

    const wrap = item.querySelector(".block-table-wrap");
    if (wrap && data.tableHTML) {
      wrap.innerHTML = data.tableHTML;
    }

    item.querySelectorAll(".table-cell").forEach((cell) => {
      cell.contentEditable = "true";
      cell.spellcheck = false;
    });

    normalizeCanvasTableElement(item);
    syncTableFormulaCells(item);

    applyStoredFrameItemStyles(item, data);
    return item;
  }

  if (isDividerType(type)) {
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      <div class="frame-item-divider-line block-divider" aria-hidden="true"></div>
    `;
    applyStoredFrameItemStyles(item, data);
    return item;
  }

  if (type === "page" || type === "domain") {
    item.dataset.type = type;
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      ${makeFrameLinkedCardHTML(type)}
    `;

    if (data.linkedPageId) item.dataset.linkedPageId = data.linkedPageId;
    if (data.cardStyle) item.dataset.cardStyle = data.cardStyle;
    if (data.pageCardIcon) item.dataset.pageCardIcon = data.pageCardIcon;
    if (getPageCardView(data) === "gallery") item.dataset.pageCardView = "gallery";
    item.dataset.pageCardImageMode = getPageCardImageMode(data);
    if (data.pageCardImageSrc) item.dataset.pageCardImageSrc = data.pageCardImageSrc;
    item.dataset.pageCardImagePos = String(getPageCardImagePosition(data));

    const linkedRecord = getLinkedCardSourceRecord(data.linkedPageId);
    const titleEl = item.querySelector(".page-card-title");
    const iconEl = item.querySelector(".page-card-icon");
    const summaryEl = item.querySelector(".page-card-summary");
    const typeLabelEl = item.querySelector(".page-card-type-label");

    if (linkedRecord) {
      syncLinkedPageBlockFromRecord(item, linkedRecord);
    } else {
      if (titleEl) titleEl.textContent = data.pageCardTitle || (type === "domain" ? "Domain" : "Page");
      if (iconEl) setIconElementContent(iconEl, data.pageCardIcon || (type === "domain" ? "⌂" : "📄"), type === "domain" ? "⌂" : "📄");
      if (summaryEl) summaryEl.textContent = data.pageCardSummary || "";
      if (typeLabelEl) typeLabelEl.textContent = data.pageCardTypeLabel || (type === "domain" ? "domain" : "page");
      applyPageCardImage(item, {
        mode: getPageCardImageMode(data),
        src: getStoredPageCardImageSource(data),
        pos: getPageCardImagePosition(data),
        iconValue: data.pageCardIcon || (type === "domain" ? "⌂" : "📄"),
        fallbackGlyph: type === "domain" ? "⌂" : "📄"
      });
    }

    if (isPageCardIconHidden(data)) {
      setPageCardIconHidden(item, true);
    }

    if (getPageCardView(item) === "gallery") {
      setPageCardView(item, "gallery");
    }

    applyStoredFrameItemStyles(item, data);

    return item;
  }

  if (type === "weblink") {
    item.dataset.type = "weblink";
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      ${makeWebLinkCardHTML()}
    `;

    const titleEl = item.querySelector(".weblink-card-title");
    if (titleEl) titleEl.innerHTML = data.titleHTML || data.title || "";
    syncWebLinkCardTarget(item, { url: data.externalUrl || "" });
    applyStoredFrameItemStyles(item, data);
    return item;
  }

  return item;
}

function serializeFrameItemElement(item) {
  if (!item) return null;

  const type = item.dataset.frameChildType || item.dataset.type || "text";
  const payload = {
    id: item.dataset.frameChildId || createFrameChildId(),
    type,
    bg: item.style.backgroundColor || "",
    borderColor: item.style.borderColor || "",
    textColor: item.style.color || "",
    padding: item.style.padding || "",
    radius: item.style.borderRadius || ""
  };

  if (type === "text") {
    payload.bodyHTML = getFrameItemTextContent(item)?.innerHTML || "";
    return payload;
  }

  if (type === "image") {
    payload.bodyHTML = item.querySelector(".block-body")?.innerHTML || "";
    return payload;
  }

  if (type === "table") {
    payload.tableHTML = serializeCanvasTableHTML(item);
    return payload;
  }

  if (isDividerType(type)) {
    return payload;
  }

  if (type === "page" || type === "domain") {
    payload.linkedPageId = item.dataset.linkedPageId || "";
    payload.pageCardTitle = item.querySelector(".page-card-title")?.textContent || "";
    payload.pageCardIcon = item.dataset.pageCardIcon || item.querySelector(".page-card-icon")?.textContent || "";
    payload.pageCardSummary = item.querySelector(".page-card-summary")?.textContent || "";
    payload.pageCardTypeLabel = item.querySelector(".page-card-type-label")?.textContent || "";
    payload.pageCardImageSrc = item.dataset.pageCardImageSrc || "";
    payload.pageCardImageMode = getPageCardImageMode(item);
    payload.pageCardImagePos = getPageCardImagePosition(item);
    payload.pageCardView = getPageCardView(item);
    payload.pageCardHideIcon = isPageCardIconHidden(item) ? 1 : 0;
    payload.cardStyle = item.dataset.cardStyle || "";
    return payload;
  }

  if (type === "weblink") {
    payload.titleHTML = item.querySelector(".weblink-card-title")?.innerHTML || "";
    payload.externalUrl = item.dataset.externalUrl || "";
    return payload;
  }

  return payload;
}

function serializeContainerItems(containerBlock) {
  const host = getContainerItemsHost(containerBlock);
  if (!host) return [];

  return Array.from(host.querySelectorAll(":scope > .frame-item"))
    .map((item) => serializeFrameItemElement(item))
    .filter((item) => {
      if (!item) return false;
      if (item.type !== "text") return true;

      const plainText = String(item.bodyHTML || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();

      return plainText.length > 0;
    });
}

function hydrateContainerBlockFromData(block, data = {}) {
  const host = getContainerItemsHost(block);
  if (!host) return;

  host.innerHTML = "";

  const items = getSerializedContainerItems(data);
  if (items.length) {
    items.forEach((itemData) => {
      host.appendChild(buildFrameItemElement(itemData));
    });
    syncContainerInsertPrompt(block);
    return;
  }

  const legacyBodyHTML = typeof data.containerBody === "string" ? data.containerBody : "";
  if (legacyBodyHTML.trim()) {
    host.appendChild(buildFrameItemElement({
      type: "text",
      bodyHTML: legacyBodyHTML
    }));
  }

  syncContainerInsertPrompt(block);
}

function insertFrameItemIntoContainer(containerBlock, type = "text", options = {}) {
  if (!containerBlock || containerBlock.dataset.type !== "container") return null;

  const host = getContainerItemsHost(containerBlock);
  if (!host) return null;

  const beforeItem = options.beforeItem?.closest?.(".frame-item") || null;
  const anchor = options.afterItem?.closest?.(".frame-item") || null;
  const canUseBefore = beforeItem && beforeItem.parentElement === host;
  const canUseAnchor = anchor && anchor.parentElement === host;
  const shouldReplaceCurrent = !!options.replaceCurrent && canUseAnchor;
  const item = buildFrameItemElement({
    type,
    ...(options.data || {})
  });

  if (shouldReplaceCurrent) {
    anchor.replaceWith(item);
  } else if (canUseBefore) {
    host.insertBefore(item, beforeItem);
  } else if (canUseAnchor) {
    anchor.after(item);
  } else {
    host.appendChild(item);
  }

  syncContainerInsertPrompt(containerBlock);

  if (typeof autoGrowBlock === "function") autoGrowBlock(containerBlock);
  if (typeof expandGrid === "function") expandGrid();
  if (!options.skipSave && typeof saveState === "function") saveState();

  if (type === "text" && options.focus !== false) {
    focusFrameTextItem(item, !!options.placeAtEnd);
  }

  if (type === "image" && options.openImagePicker) {
    setTimeout(() => promptImageUploadForBlock(item), 0);
  }

  if (type === "table" && options.focus !== false) {
    setTimeout(() => {
      const cell = item.querySelector(".table-cell");
      if (!cell) return;
      selectBlock(item);
      cell.focus();
      placeCaretInsideEditable(cell);
    }, 0);
  }

  if ((type === "page" || type === "domain") && options.pageMode) {
    setTimeout(() => {
      if (options.pageMode === "link") {
        openPageLinkModal(item, {
          restoreData: null,
          linkTargetType: options.linkTargetType || (type === "domain" ? "domain" : "page")
        });
        return;
      }

      openPageCreateModal(item, {
        restoreData: null,
        ...(options.createPageOptions || {})
      });
    }, 0);
  }

  return item;
}

function removeFrameItem(item) {
  if (!item) return;

  const containerBlock = item.closest('.block[data-type="container"]');
  const wasSelected = selectedBlock === item;
  item.remove();

  if (containerBlock) syncContainerInsertPrompt(containerBlock);
  if (wasSelected) clearSelection();

  if (containerBlock && typeof autoGrowBlock === "function") autoGrowBlock(containerBlock);
  if (typeof expandGrid === "function") expandGrid();
  if (typeof saveState === "function") saveState();
}

function moveFrameItemToContainer(item, containerBlock, placement = {}) {
  if (!item || !containerBlock) return null;

  const sourceBlock = item.closest('.block[data-type="container"]');
  const host = getContainerItemsHost(containerBlock);
  if (!host) return null;

  const beforeItem = placement.beforeItem?.closest?.('.frame-item') || null;
  const afterItem = placement.afterItem?.closest?.('.frame-item') || null;

  if (beforeItem && beforeItem !== item && beforeItem.parentElement === host) {
    host.insertBefore(item, beforeItem);
  } else if (afterItem && afterItem !== item && afterItem.parentElement === host) {
    host.insertBefore(item, afterItem.nextSibling);
  } else if (item.parentElement !== host || item !== host.lastElementChild) {
    host.appendChild(item);
  }

  syncContainerInsertPrompt(containerBlock);
  if (sourceBlock && sourceBlock !== containerBlock) syncContainerInsertPrompt(sourceBlock);

  [sourceBlock, containerBlock].filter(Boolean).forEach((block, index, list) => {
    if (list.indexOf(block) !== index) return;
    if (typeof autoGrowBlock === "function") autoGrowBlock(block);
  });

  if (typeof expandGrid === "function") expandGrid();
  return item;
}

function buildBlockDataFromFrameItem(item, x = 0, y = 0) {
  const itemData = serializeFrameItemElement(item);
  if (!itemData) return null;

  const blockType = itemData.type === "text" ? "text" : itemData.type;
  let dims = getDefaultBlockDimensions(blockType);

  if (blockType === "page" || blockType === "domain") {
    dims = getLinkedPageCardDimensions(itemData.pageCardTitle || "", {
      type: blockType,
      pageCardHideIcon: itemData.pageCardHideIcon || 0,
      pageCardView: itemData.pageCardView || "default",
      padding: ""
    });
  }

  const blockData = {
    id: `block-${Date.now()}`,
    type: blockType,
    x,
    y,
    w: dims.width,
    h: dims.height,
    z: topZIndex + 1,
    titleHTML: "",
    bodyHTML: itemData.bodyHTML || "",
    containerTitle: "",
    containerBody: "",
    containerItems: [],
    tableHTML: itemData.tableHTML || "",
    bg: itemData.bg || "",
    borderColor: itemData.borderColor || "",
    textColor: itemData.textColor || "",
    padding: itemData.padding || "",
    radius: itemData.radius || "",
    hasNote: 0,
    linkedPageId: itemData.linkedPageId || "",
    pageCardTitle: itemData.pageCardTitle || "",
    pageCardMeta: "",
    pageCardIcon: itemData.pageCardIcon || "",
    pageCardSummary: itemData.pageCardSummary || "",
    pageCardTypeLabel: itemData.pageCardTypeLabel || "",
    pageCardImageSrc: itemData.pageCardImageSrc || "",
    pageCardImageMode: itemData.pageCardImageMode || "none",
    pageCardImagePos: getPageCardImagePosition(itemData),
    pageCardView: itemData.pageCardView || "default",
    pageCardHideIcon: itemData.pageCardHideIcon || 0,
    cardStyle: itemData.cardStyle || ""
  };

  return blockData;
}

function placeFrameItemOnGrid(item, clientX, clientY, offsetX = 0, offsetY = 0) {
  const grid = document.getElementById("grid");
  if (!grid || !item) return null;

  const gridRect = getGridInteractionRect();
  const scale = getCanvasInteractionScale();
  if (!gridRect || clientX < gridRect.left || clientX > gridRect.right || clientY < gridRect.top || clientY > gridRect.bottom) {
    return null;
  }

  const blockData = buildBlockDataFromFrameItem(item);
  if (!blockData) return null;

  let x = snap(((clientX - gridRect.left) / scale) - (offsetX / scale));
  let y = snap(((clientY - gridRect.top) / scale) - (offsetY / scale));

  x = Math.max(0, Math.min(x, Math.max(0, getGridViewportWidth() - blockData.w)));
  y = Math.max(0, Math.min(y, Math.max(0, getGridViewportHeight() - blockData.h)));

  blockData.x = x;
  blockData.y = y;

  const sourceBlock = item.closest('.block[data-type="container"]');
  const block = buildBlockFromData(blockData);
  if (!block) return null;

  grid.appendChild(block);
  item.remove();

  if (sourceBlock) syncContainerInsertPrompt(sourceBlock);

  if (sourceBlock && typeof autoGrowBlock === "function") autoGrowBlock(sourceBlock);
  if (typeof autoGrowBlock === "function" && block.dataset.type !== "page" && block.dataset.type !== "domain") {
    autoGrowBlock(block);
  }
  if (typeof expandGrid === "function") expandGrid();

  return block;
}

function getFrameDropTypeForBlock(block) {
  const type = block?.dataset?.type || "";

  if (type === "text" || type === "list") return "text";
  if (type === "image" || type === "page" || type === "domain" || isDividerType(type) || type === "table") return type;

  return "";
}

function buildFrameItemDataFromBlock(block) {
  const nextType = getFrameDropTypeForBlock(block);
  if (!nextType) return null;

  const serialized = serializeBlockElement(block);

  if (nextType === "text") {
    return {
      type: "text",
      bodyHTML: serialized.bodyHTML || "",
      bg: serialized.bg || "",
      borderColor: serialized.borderColor || "",
      textColor: serialized.textColor || "",
      padding: serialized.padding || "",
      radius: serialized.radius || ""
    };
  }

  if (nextType === "image") {
    return {
      type: "image",
      bodyHTML: serialized.bodyHTML || "",
      bg: serialized.bg || "",
      borderColor: serialized.borderColor || "",
      textColor: serialized.textColor || "",
      padding: serialized.padding || "",
      radius: serialized.radius || ""
    };
  }

  if (nextType === "table") {
    return {
      type: "table",
      tableHTML: serialized.tableHTML || "",
      bg: serialized.bg || "",
      borderColor: serialized.borderColor || "",
      textColor: serialized.textColor || "",
      padding: serialized.padding || "",
      radius: serialized.radius || ""
    };
  }

  if (isDividerType(nextType)) {
    return {
      type: nextType,
      bg: serialized.bg || "",
      borderColor: serialized.borderColor || "",
      textColor: serialized.textColor || "",
      padding: serialized.padding || "",
      radius: serialized.radius || ""
    };
  }

  return {
    type: nextType,
    linkedPageId: serialized.linkedPageId || "",
    pageCardTitle: serialized.pageCardTitle || "",
    pageCardIcon: serialized.pageCardIcon || "",
    pageCardSummary: serialized.pageCardSummary || "",
    pageCardTypeLabel: serialized.pageCardTypeLabel || "",
    pageCardImageSrc: serialized.pageCardImageSrc || "",
    pageCardImageMode: serialized.pageCardImageMode || "none",
    pageCardImagePos: getPageCardImagePosition(serialized),
    pageCardView: serialized.pageCardView || "default",
    pageCardHideIcon: serialized.pageCardHideIcon || 0,
    cardStyle: serialized.cardStyle || "",
    bg: serialized.bg || "",
    borderColor: serialized.borderColor || "",
    textColor: serialized.textColor || "",
    padding: serialized.padding || "",
    radius: serialized.radius || ""
  };
}

function dropBlockIntoFrame(containerBlock, block, placement = {}) {
  if (!containerBlock || !block) return null;

  const itemData = buildFrameItemDataFromBlock(block);
  if (!itemData) return null;

  const inserted = insertFrameItemIntoContainer(containerBlock, itemData.type, {
    data: itemData,
    beforeItem: placement.beforeItem || null,
    afterItem: placement.afterItem || null,
    focus: false,
    skipSave: true
  });
  if (!inserted) return null;

  if (selectedBlock === block) {
    clearSelection();
  }

  block.remove();
  selectBlock(inserted);
  if (typeof expandGrid === "function") expandGrid();
  return inserted;
}

function getSerializedBlockReferenceHTML(blockData) {
  const containerItems = getSerializedContainerItems(blockData);
  let html = (blockData?.bodyHTML || "") + (blockData?.titleHTML || "");

  if (!containerItems.length) {
    html += blockData?.containerBody || "";
  }

  containerItems.forEach((item) => {
    if (item.type === "text" || item.type === "image") {
      html += item.bodyHTML || "";
    }

    if (item.type === "table") {
      html += item.tableHTML || "";
    }

    if (item.linkedPageId) {
      html += ` data-page-id="${item.linkedPageId}" `;
    }
  });

  return html;
}

function getSerializedBlockSearchText(blockData) {
  const containerItems = getSerializedContainerItems(blockData);
  const baseText = [
    blockData?.titleHTML || "",
    blockData?.containerTitle || "",
    blockData?.bodyHTML || "",
    containerItems.length ? "" : (blockData?.containerBody || "")
  ]
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .trim();
  const nestedText = containerItems
    .map((item) => {
      if (item.type === "text" || item.type === "image") {
        return (item.bodyHTML || "").replace(/<[^>]*>/g, " ").trim();
      }

      if (item.type === "table") {
        return (item.tableHTML || "").replace(/<[^>]*>/g, " ").trim();
      }

      if (item.type === "page" || item.type === "domain") {
        return String(item.pageCardTitle || "").trim();
      }

      return "";
    })
    .filter(Boolean)
    .join(" ");

  return [baseText, nestedText].filter(Boolean).join(" ").trim();
}

window.insertFrameItemIntoContainer = insertFrameItemIntoContainer;

function normalizeBlockAppearanceForType(block, type) {
  if (!block) return;

  if (type === "table" || isDividerType(type)) {
    block.style.backgroundColor = "";
    block.style.borderColor = "";
    block.dataset.bgState = "default";
    block.dataset.borderState = "default";
  }

  if (type === "table") {
    block.style.borderRadius = "2px";
    block.dataset.radiusState = "square";
  }

  if (isDividerType(type)) {
    block.style.borderRadius = "";
  }
}

function convertCanvasBlockType(block, nextType, options = {}) {
  if (!block || !nextType) return null;

  const sourceBodyHTML = block.querySelector(".block-body")?.innerHTML || "";
  const sourceContainerBodyHTML = block.dataset.type === "container"
    ? getContainerLegacyBodyHTML(block)
    : (block.querySelector(".container-body")?.innerHTML || "");
  const sourceContainerTitle = block.querySelector(".container-title")?.innerHTML || "";
  const carryBodyHTML = sourceContainerBodyHTML || sourceBodyHTML;

  block.dataset.type = nextType;
  delete block.dataset.linkedPageId;
  delete block.dataset.cardStyle;
  delete block.dataset.pageCardIcon;
  delete block.dataset.externalUrl;
  delete block.dataset.dataCalloutLabel;
  delete block.dataset.dataCalloutSourceKind;
  delete block.dataset.dataCalloutSourcePageId;
  delete block.dataset.dataCalloutSourceBlockId;
  delete block.dataset.dataCalloutPropertyId;
  delete block.dataset.dataCalloutMode;
  delete block.dataset.dataCalloutRowId;
  delete block.dataset.dataCalloutAlign;
  delete block.dataset.dataCalloutSize;
  delete block.dataset.dataCalloutLabelPos;
  delete block.dataset.progressTitle;
  delete block.dataset.progressSourceType;
  delete block.dataset.progressSourceKind;
  delete block.dataset.progressSourcePageId;
  delete block.dataset.progressSourceBlockId;
  delete block.dataset.progressPropertyId;
  delete block.dataset.progressValueMode;
  delete block.dataset.progressScope;
  delete block.dataset.progressCurrentValue;
  delete block.dataset.progressTargetValue;
  delete block.dataset.progressUnitLabel;
  delete block.dataset.progressDeadline;
  delete block.dataset.progressStyle;
  delete block.dataset.progressSize;
  delete block.dataset.progressShowTitle;
  delete block.dataset.progressShowValue;
  delete block.dataset.progressShowPercent;
  delete block.dataset.progressShowDeadline;
  delete block.dataset.progressFillColor;
  delete block.dataset.progressTrackColor;
  delete block.dataset.clockStyle;
  delete block.dataset.clockSize;
  delete block.dataset.clockColor;
  delete block.dataset.clockFormat;
  delete block.dataset.clockShowSeconds;
  delete block.dataset.clockShowDate;
  block.innerHTML = makeBlockHTML(nextType);

  normalizeBlockAppearanceForType(block, nextType);
  applyDefaultBlockDimensions(block, nextType, {
    allowGrow: !isDividerType(nextType) && nextType !== "weblink",
    preserveWidth: isDividerType(nextType)
  });

  if (nextType === "container") {
    const title = block.querySelector(".container-title");
    if (title && sourceContainerTitle) title.innerHTML = sourceContainerTitle;
    hydrateContainerBlockFromData(block, { containerBody: carryBodyHTML });
  }

  if (nextType === "table") {
    normalizeCanvasTableElement(block);
    block.querySelectorAll(".table-cell").forEach((cell) => {
      cell.contentEditable = "true";
      cell.spellcheck = false;
    });
    syncTableFormulaCells(block);
  }

  const shouldSelectBlock = document.body.classList.contains("editing");
  if (shouldSelectBlock) {
    selectBlock(block);
  } else {
    clearSelection();
  }

  let focusTarget = null;
  if (nextType === "container") focusTarget = block.querySelector(".container-body");
  if (nextType === "table") focusTarget = block.querySelector(".table-cell");

  if (focusTarget) {
    focusTarget.focus();
    placeCaretInsideEditable(focusTarget);
  }

  if (typeof autoGrowBlock === "function" && !isDividerType(nextType)) {
    autoGrowBlock(block);
  }
  if (typeof expandGrid === "function") {
    expandGrid();
  }

  if (nextType === "clock") {
    window.mountClockBlock?.(block, { openPicker: !!options.openClockPicker });
  }

  if (nextType === "progress") {
    window.mountProgressBlock?.(block, { openPicker: !!options.openProgressPicker });
  }

  if (options.openImagePicker) {
    promptImageUploadForBlock(block);
  }

  return block;
}

window.convertCanvasBlockType = convertCanvasBlockType;
window.promptImageUploadForBlock = promptImageUploadForBlock;

function makeBlockHTML(type = "text") {
 if (type === "image") {
    return `
      <div class="block-body block-image-body">
        <div class="image-placeholder">🖼 Click replace to add image</div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "page") {
    return `
      <div class="block-page-card">
        <div class="page-card-media" data-has-image="false">
          <img class="page-card-image" alt="" draggable="false">
          <div class="page-card-media-fallback">${getIconMarkup("📄", "📄", "page-card-media-icon")}</div>
          <button type="button" class="page-card-media-action">Add image</button>
        </div>
        ${getIconMarkup("📄", "📄", "page-card-icon")}
        <div class="page-card-info">
          <div class="page-card-title">Page Title</div>
          <div class="page-card-type-label"></div>
          <div class="page-card-summary"></div>
        </div>
        <div class="page-card-menu">⋯</div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }


  if (type === "domain") {
    return `
      <div class="block-page-card">
        <div class="page-card-media" data-has-image="false">
          <img class="page-card-image" alt="" draggable="false">
          <div class="page-card-media-fallback">${getIconMarkup("⌂", "⌂", "page-card-media-icon")}</div>
          <button type="button" class="page-card-media-action">Add image</button>
        </div>
        ${getIconMarkup("⌂", "⌂", "page-card-icon")}
        <div class="page-card-info">
          <div class="page-card-title">Domain Name</div>
          <div class="page-card-type-label"></div>
          <div class="page-card-summary"></div>
        </div>
        <div class="page-card-menu">⋯</div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "weblink") {
    return `
      ${makeWebLinkCardHTML()}
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "clock") {
    return `
      <div class="clock-widget-shell" data-style="digital" data-size="md" data-format="12" data-show-seconds="0" data-show-date="0">
        <div class="clock-widget-main">
          <span class="clock-widget-hours">08</span>
          <span class="clock-widget-separator">:</span>
          <span class="clock-widget-minutes">45</span>
          <span class="clock-widget-seconds">09</span>
          <span class="clock-widget-meridiem">PM</span>
        </div>
        <div class="clock-widget-analog" aria-hidden="true">
          <div class="clock-widget-analog-face">
            <span class="clock-widget-analog-tick" style="--tick-index:0"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:1"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:2"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:3"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:4"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:5"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:6"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:7"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:8"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:9"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:10"></span>
            <span class="clock-widget-analog-tick" style="--tick-index:11"></span>
            <span class="clock-widget-analog-hand clock-widget-analog-hour"></span>
            <span class="clock-widget-analog-hand clock-widget-analog-minute"></span>
            <span class="clock-widget-analog-hand clock-widget-analog-second"></span>
            <span class="clock-widget-analog-center"></span>
          </div>
        </div>
        <div class="clock-widget-date">Fri, May 9</div>
        <button type="button" class="clock-config-btn" data-clock-action="configure" title="Configure clock">⚙</button>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "table") {
    return `
      <div class="table-move-handle" title="Drag table">⋮⋮</div>
      <div class="block-table-wrap">
        <table class="block-table" style="width:${TABLE_COLUMN_DEFAULT_WIDTH * 3}px;">
          <colgroup>
            <col style="width:${TABLE_COLUMN_DEFAULT_WIDTH}px;">
            <col style="width:${TABLE_COLUMN_DEFAULT_WIDTH}px;">
            <col style="width:${TABLE_COLUMN_DEFAULT_WIDTH}px;">
          </colgroup>
          <thead>
            <tr>
              <th class="table-cell" contenteditable="true" spellcheck="false">Column 1</th>
              <th class="table-cell" contenteditable="true" spellcheck="false">Column 2</th>
              <th class="table-cell" contenteditable="true" spellcheck="false">Column 3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
            </tr>
            <tr>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
            </tr>
            <tr>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
              <td class="table-cell" contenteditable="true" spellcheck="false"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "calendar") {
    return `
      <div class="page-database-block-shell">
        <div class="page-database-block-header">
          <div class="page-database-block-header-main">
            <button type="button" class="page-database-block-page-menu is-empty" data-db-action="open-inline-page-menu" aria-label="Database page options">⋮</button>
            <div class="page-database-block-title is-empty">Untitled</div>
            <button type="button" class="page-database-view-pill page-database-block-view-btn" data-db-action="open-inline-view-menu" aria-haspopup="menu">Table</button>
            <button type="button" class="page-database-settings-btn page-database-block-settings-btn" data-db-action="open-database-settings-menu" aria-haspopup="menu" aria-label="Open database settings">
              <span class="page-database-settings-btn-icon" aria-hidden="true">⚙</span>
            </button>
          </div>
          <div class="page-database-toolbar-actions page-database-block-toolbar-actions" hidden>
            <button type="button" class="page-database-toolbar-btn" data-db-action="open-filter-menu">Filter</button>
            <button type="button" class="page-database-toolbar-btn" data-db-action="open-sort-menu">Sort</button>
            <button type="button" class="page-database-toolbar-btn" data-db-action="open-group-menu">Group</button>
            <button type="button" class="page-database-toolbar-btn page-database-folder-btn" data-db-action="connect-folder">Connect Folder</button>
            <button type="button" class="page-database-toolbar-btn" data-db-action="open-database-menu">More</button>
            <button type="button" class="page-database-toolbar-new-btn" data-db-action="add-row">New</button>
          </div>
          <button type="button" class="page-database-block-collapse-btn" data-db-action="toggle-inline-collapse" aria-label="Collapse inline toolbar">&gt;&gt;</button>
        </div>
        <div class="page-database-block-body">
          <div class="page-database-block-scroll">
            <div class="page-database-block-content"></div>
          </div>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "data-callout") {
    return `
      <div class="data-callout-shell">
        <span class="data-callout-value">—</span>
        <span class="data-callout-label">Value</span>
        <button type="button" class="data-callout-config-btn" data-data-callout-action="configure" title="Configure">⚙</button>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "progress") {
    return `
      <div class="progress-block-shell" data-style="bar" data-size="md">
        <div class="progress-block-head">
          <span class="progress-block-title">Goal</span>
          <button type="button" class="progress-block-config-btn" data-progress-action="configure" title="Configure">⚙</button>
        </div>
        <div class="progress-block-visual">
          <div class="progress-block-bar"><span class="progress-block-bar-fill"></span></div>
          <div class="progress-block-pill"><span class="progress-block-pill-fill"></span></div>
          <div class="progress-block-ring"><span class="progress-block-ring-label">0%</span></div>
        </div>
        <div class="progress-block-meta">
          <span class="progress-block-value">0 / 100</span>
          <span class="progress-block-percent">0%</span>
        </div>
        <div class="progress-block-deadline" hidden></div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

if (type === "container") {
    return `
      <div class="container-title" contenteditable="false" spellcheck="false">Frame</div>
      <div class="container-body">
        <div class="container-items"></div>
        <button type="button" class="container-insert-prompt">+ Add inside frame</button>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (isDividerType(type)) {
    return `
      <div class="block-divider" aria-hidden="true"></div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

// default: text
  return `
    <div class="block-body" contenteditable="true" spellcheck="false"></div>
    <div class="block-resize-handle" title="Resize"></div>
  `;
}

function escapeDataCalloutHTML(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PAGE_ACTIVITY_STORAGE_KEY = (window.STORAGE_KEYS && window.STORAGE_KEYS.pageActivity) || "sanctum_page_activity_v1";
const DATA_CALLOUT_LIVE_REFRESH_MS = 1000;
const DATA_CALLOUT_ACTIVITY_FLUSH_MS = 15000;

let trackedPageActivityId = "";
let trackedPageActivityStartedAt = 0;

function normalizeDataCalloutSourceType(value = "") {
  return String(value || "").trim().toLowerCase() === "system" ? "system" : "database";
}

function normalizeDataCalloutSystemKey(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["current-date", "current-time", "page-activity"].includes(safe) ? safe : "current-date";
}

function normalizeDataCalloutSystemTargetKind(value = "") {
  return String(value || "").trim().toLowerCase() === "page" ? "page" : "current";
}

function normalizeDataCalloutSystemFormat(value = "", systemKey = "current-date") {
  const safe = String(value || "").trim().toLowerCase();

  if (systemKey === "current-time") {
    return ["12h", "24h"].includes(safe) ? safe : "12h";
  }

  if (systemKey === "page-activity") {
    return [
      "compact",
      "clock",
      "week-compact",
      "week-clock",
      "last-opened",
      "sessions-today",
      "sessions-total"
    ].includes(safe) ? safe : "compact";
  }

  return ["short", "long"].includes(safe) ? safe : "short";
}

function getDefaultDataCalloutLabel(config = {}) {
  const sourceType = normalizeDataCalloutSourceType(config.sourceType || "database");
  const systemKey = normalizeDataCalloutSystemKey(config.systemKey || "current-date");

  if (sourceType !== "system") return "Value";
  if (systemKey === "current-time") return "Current time";
  if (systemKey === "page-activity") return "Time on page";
  return "Today's date";
}

function readPageActivityData() {
  if (typeof window.readStorageJSON === "function") {
    return window.readStorageJSON(PAGE_ACTIVITY_STORAGE_KEY, {});
  }
  return {};
}

function writePageActivityData(value) {
  if (typeof window.writeStorageJSON === "function") {
    return window.writeStorageJSON(PAGE_ACTIVITY_STORAGE_KEY, value || {});
  }
  return false;
}

function normalizePageActivityEntry(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { days: {}, lastOpenedAt: "", lastSessionStartedAt: "" };
  }

  const sourceDays = raw.days && typeof raw.days === "object" && !Array.isArray(raw.days) ? raw.days : raw;
  const days = {};
  Object.entries(sourceDays).forEach(([dayKey, value]) => {
    const daySource = value && typeof value === "object" && !Array.isArray(value) ? value : { ms: value };
    const ms = Math.max(0, Math.round(Number(daySource.ms) || 0));
    const sessions = Math.max(0, Math.round(Number(daySource.sessions) || 0));
    if (!ms && !sessions) return;
    days[String(dayKey)] = { ms, sessions };
  });

  return {
    days,
    lastOpenedAt: typeof raw.lastOpenedAt === "string" ? raw.lastOpenedAt : "",
    lastSessionStartedAt: typeof raw.lastSessionStartedAt === "string" ? raw.lastSessionStartedAt : ""
  };
}

function getPageActivityDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function writePageActivityDuration(pageId = "", startAt = 0, endAt = Date.now()) {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return false;

  const startTime = Math.max(0, Math.floor(Number(startAt) || 0));
  const endTime = Math.max(0, Math.floor(Number(endAt) || 0));
  if (!startTime || endTime <= startTime) return false;

  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);

  let cursor = startTime;
  while (cursor < endTime) {
    const cursorDate = new Date(cursor);
    const dayKey = getPageActivityDayKey(cursorDate);
    const nextBoundary = new Date(
      cursorDate.getFullYear(),
      cursorDate.getMonth(),
      cursorDate.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    const nextCursor = Math.min(endTime, nextBoundary);
    const dayEntry = entry.days[dayKey] || { ms: 0, sessions: 0 };
    entry.days[dayKey] = {
      ...dayEntry,
      ms: Math.max(0, Math.round(Number(dayEntry.ms) || 0) + (nextCursor - cursor))
    };
    cursor = nextCursor;
  }

  all[safePageId] = entry;
  return writePageActivityData(all);
}

function markPageActivityOpened(pageId = "", openedAt = Date.now()) {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return false;

  const openTime = Math.max(0, Math.floor(Number(openedAt) || Date.now()));
  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);
  const dayKey = getPageActivityDayKey(new Date(openTime));
  const dayEntry = entry.days[dayKey] || { ms: 0, sessions: 0 };
  entry.days[dayKey] = {
    ...dayEntry,
    sessions: Math.max(0, Math.round(Number(dayEntry.sessions) || 0) + 1)
  };
  const isoTime = new Date(openTime).toISOString();
  entry.lastOpenedAt = isoTime;
  entry.lastSessionStartedAt = isoTime;
  all[safePageId] = entry;
  return writePageActivityData(all);
}

function getStoredPageActivityMs(pageId = "", dayKey = getPageActivityDayKey()) {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return 0;

  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);
  return Math.max(0, Math.round(Number(entry.days?.[dayKey]?.ms) || 0));
}

function getPageActivityWeekDayKeys(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(referenceDate);
  if (Number.isNaN(date.getTime())) return [];
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return getPageActivityDayKey(day);
  });
}

function getStoredPageActivityWeekMs(pageId = "", referenceDate = new Date()) {
  return getPageActivityWeekDayKeys(referenceDate)
    .reduce((total, dayKey) => total + getStoredPageActivityMs(pageId, dayKey), 0);
}

function getStoredPageActivitySessions(pageId = "", dayKey = "") {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return 0;

  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);
  if (dayKey) return Math.max(0, Math.round(Number(entry.days?.[dayKey]?.sessions) || 0));
  return Object.values(entry.days || {}).reduce((total, dayEntry) => total + Math.max(0, Math.round(Number(dayEntry?.sessions) || 0)), 0);
}

function getPageActivityLastOpenedLabel(pageId = "") {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return "Never";

  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);
  const date = new Date(entry.lastOpenedAt || "");
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function flushTrackedPageActivity(options = {}) {
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  const keepRunning = !!options.keepRunning;
  const minDeltaMs = Math.max(0, Math.floor(Number(options.minDeltaMs) || 0));

  if (!trackedPageActivityId || !trackedPageActivityStartedAt) return false;

  const deltaMs = now - trackedPageActivityStartedAt;
  if (deltaMs < minDeltaMs) return false;

  const saved = writePageActivityDuration(trackedPageActivityId, trackedPageActivityStartedAt, now);
  trackedPageActivityStartedAt = keepRunning && !document.hidden ? now : 0;
  return saved;
}

function setTrackedPageActivityPage(pageId = "") {
  flushTrackedPageActivity({ now: Date.now() });
  trackedPageActivityId = String(pageId || "").trim();
  const now = Date.now();
  trackedPageActivityStartedAt = trackedPageActivityId && !document.hidden ? now : 0;
  if (trackedPageActivityStartedAt) markPageActivityOpened(trackedPageActivityId, now);
}

function resumeTrackedPageActivity() {
  if (!trackedPageActivityId || trackedPageActivityStartedAt || document.hidden) return;
  trackedPageActivityStartedAt = Date.now();
  markPageActivityOpened(trackedPageActivityId, trackedPageActivityStartedAt);
}

function getLivePageActivityMs(pageId = "", dayKey = getPageActivityDayKey()) {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return 0;

  let total = getStoredPageActivityMs(safePageId, dayKey);
  if (safePageId === trackedPageActivityId && trackedPageActivityStartedAt && !document.hidden) {
    total += Math.max(0, Date.now() - trackedPageActivityStartedAt);
  }

  return Math.max(0, total);
}

function getLivePageActivityWeekMs(pageId = "", referenceDate = new Date()) {
  let total = getStoredPageActivityWeekMs(pageId, referenceDate);
  const todayKey = getPageActivityDayKey(referenceDate);
  if (getPageActivityWeekDayKeys(referenceDate).includes(todayKey)) {
    total += Math.max(0, getLivePageActivityMs(pageId, todayKey) - getStoredPageActivityMs(pageId, todayKey));
  }
  return Math.max(0, total);
}

function normalizeDataCalloutMode(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["row", "count", "sum"].includes(safe) ? safe : "row";
}

function normalizeDataCalloutAlign(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(safe) ? safe : "left";
}

function normalizeDataCalloutSize(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["sm", "md", "lg"].includes(safe) ? safe : "md";
}

function normalizeDataCalloutLabelPos(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["above", "below", "hidden"].includes(safe) ? safe : "below";
}

function normalizeProgressBlockSourceType(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["manual", "database", "system"].includes(safe) ? safe : "manual";
}

function normalizeProgressBlockValueMode(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["count", "sum", "activity"].includes(safe) ? safe : "count";
}

function normalizeProgressBlockScope(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["all", "attached"].includes(safe) ? safe : "all";
}

function normalizeProgressBlockStyle(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["bar", "pill", "ring"].includes(safe) ? safe : "bar";
}

function normalizeProgressBlockSize(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["sm", "md", "lg"].includes(safe) ? safe : "md";
}

function normalizeProgressBlockToggle(value = "", fallback = true) {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "0" || safe === "false" || safe === "off") return "0";
  if (safe === "1" || safe === "true" || safe === "on") return "1";
  return fallback ? "1" : "0";
}

function normalizeProgressBlockColor(value = "", fallback = "#9fe870") {
  const safe = String(value || "").trim();
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(safe) ? safe.toLowerCase() : fallback;
}

function normalizeProgressBlockDeadline(value = "") {
  const safe = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(safe) ? safe : "";
}

function normalizeProgressBlockConfig(raw = {}) {
  return {
    title: String(raw?.title || "").trim() || "Goal",
    sourceType: normalizeProgressBlockSourceType(raw?.sourceType || "manual"),
    sourceKind: raw?.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw?.sourcePageId || "").trim(),
    sourceBlockId: String(raw?.sourceBlockId || "").trim(),
    propertyId: String(raw?.propertyId || "").trim(),
    valueMode: normalizeProgressBlockValueMode(raw?.valueMode || "count"),
    scope: normalizeProgressBlockScope(raw?.scope || "all"),
    currentValue: String(raw?.currentValue ?? "0").trim() || "0",
    targetValue: String(raw?.targetValue ?? "100").trim() || "100",
    unitLabel: String(raw?.unitLabel || "").trim(),
    deadline: normalizeProgressBlockDeadline(raw?.deadline || ""),
    style: normalizeProgressBlockStyle(raw?.style || "bar"),
    size: normalizeProgressBlockSize(raw?.size || "md"),
    showTitle: normalizeProgressBlockToggle(raw?.showTitle, true),
    showValue: normalizeProgressBlockToggle(raw?.showValue, true),
    showPercent: normalizeProgressBlockToggle(raw?.showPercent, true),
    showDeadline: normalizeProgressBlockToggle(raw?.showDeadline, true),
    fillColor: normalizeProgressBlockColor(raw?.fillColor || "", "#9fe870"),
    trackColor: normalizeProgressBlockColor(raw?.trackColor || "", "#2a2f24")
  };
}

function readProgressBlockConfig(block) {
  if (!block) return normalizeProgressBlockConfig({});
  return normalizeProgressBlockConfig({
    title: block.dataset.progressTitle || "",
    sourceType: block.dataset.progressSourceType || "manual",
    sourceKind: block.dataset.progressSourceKind || "page",
    sourcePageId: block.dataset.progressSourcePageId || "",
    sourceBlockId: block.dataset.progressSourceBlockId || "",
    propertyId: block.dataset.progressPropertyId || "",
    valueMode: block.dataset.progressValueMode || "count",
    scope: block.dataset.progressScope || "all",
    currentValue: block.dataset.progressCurrentValue || "0",
    targetValue: block.dataset.progressTargetValue || "100",
    unitLabel: block.dataset.progressUnitLabel || "",
    deadline: block.dataset.progressDeadline || "",
    style: block.dataset.progressStyle || "bar",
    size: block.dataset.progressSize || "md",
    showTitle: block.dataset.progressShowTitle || "1",
    showValue: block.dataset.progressShowValue || "1",
    showPercent: block.dataset.progressShowPercent || "1",
    showDeadline: block.dataset.progressShowDeadline || "1",
    fillColor: block.dataset.progressFillColor || "#9fe870",
    trackColor: block.dataset.progressTrackColor || "#2a2f24"
  });
}

function writeProgressBlockConfig(block, config) {
  if (!block) return;
  const normalized = normalizeProgressBlockConfig(config);
  block.dataset.progressTitle = normalized.title;
  block.dataset.progressSourceType = normalized.sourceType;
  block.dataset.progressSourceKind = normalized.sourceKind;
  block.dataset.progressSourcePageId = normalized.sourcePageId;
  block.dataset.progressSourceBlockId = normalized.sourceBlockId;
  block.dataset.progressPropertyId = normalized.propertyId;
  block.dataset.progressValueMode = normalized.valueMode;
  block.dataset.progressScope = normalized.scope;
  block.dataset.progressCurrentValue = normalized.currentValue;
  block.dataset.progressTargetValue = normalized.targetValue;
  block.dataset.progressUnitLabel = normalized.unitLabel;
  block.dataset.progressDeadline = normalized.deadline;
  block.dataset.progressStyle = normalized.style;
  block.dataset.progressSize = normalized.size;
  block.dataset.progressShowTitle = normalized.showTitle;
  block.dataset.progressShowValue = normalized.showValue;
  block.dataset.progressShowPercent = normalized.showPercent;
  block.dataset.progressShowDeadline = normalized.showDeadline;
  block.dataset.progressFillColor = normalized.fillColor;
  block.dataset.progressTrackColor = normalized.trackColor;
}

function getProgressBlockDeadlineMeta(deadline = "") {
  const safe = normalizeProgressBlockDeadline(deadline);
  if (!safe) return { text: "", overdue: false };

  const date = new Date(`${safe}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { text: "", overdue: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  if (days < 0) {
    return { text: `Overdue ${Math.abs(days)}d • ${formatted}`, overdue: true };
  }
  if (days === 0) {
    return { text: `Due today • ${formatted}`, overdue: false };
  }
  if (days === 1) {
    return { text: `Due tomorrow • ${formatted}`, overdue: false };
  }

  return { text: `Due in ${days}d • ${formatted}`, overdue: false };
}

function getProgressBlockSourcePayload(config) {
  if (config.sourceType !== "database") return null;
  if (!config.sourcePageId) return null;
  return getDataCalloutSourcePayload({
    sourceKind: config.sourceKind,
    sourcePageId: config.sourcePageId,
    sourceBlockId: config.sourceKind === "block" ? config.sourceBlockId : ""
  });
}

function getProgressBlockScopePageIds(rootId = "") {
  const safeRootId = String(rootId || "").trim();
  const ids = new Set();
  if (!safeRootId) return ids;

  ids.add(safeRootId);
  let changed = true;
  const pages = Array.isArray(window.userPages) ? window.userPages : [];

  while (changed) {
    changed = false;
    pages.forEach((page) => {
      const pageId = String(page?.id || "").trim();
      const parentId = String(page?.parent || "").trim();
      if (!pageId || !parentId) return;
      if (!ids.has(parentId) || ids.has(pageId)) return;
      ids.add(pageId);
      changed = true;
    });
  }

  return ids;
}

function isProgressBlockSourceAttachedToCurrentPage(config) {
  const currentPageId = typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "";
  if (!currentPageId || !config.sourcePageId) return false;
  return getProgressBlockScopePageIds(currentPageId).has(config.sourcePageId);
}

function computeProgressBlockState(config) {
  const target = Math.max(0, parseDataCalloutNumericValue(config.targetValue));
  let current = parseDataCalloutNumericValue(config.currentValue);
  let configured = target > 0 || current > 0 || !!String(config.unitLabel || "").trim();

  if (config.sourceType === "database") {
    const payload = getProgressBlockSourcePayload(config);
    const database = payload?.database || null;
    const properties = Array.isArray(database?.properties) ? database.properties : [];
    let rows = Array.isArray(database?.rows) ? database.rows : [];

    configured = !!database;

    if (config.scope === "attached" && !isProgressBlockSourceAttachedToCurrentPage(config)) {
      rows = [];
    }

    if (config.valueMode === "sum") {
      const property = properties.find((entry) => entry.id === config.propertyId) || null;
      configured = !!property;
      current = property
        ? rows.reduce((sum, row) => sum + parseDataCalloutNumericValue(row?.values?.[property.id] || ""), 0)
        : 0;
    } else {
      current = rows.length;
    }
  }

  const rawPercent = target > 0 ? (current / target) * 100 : 0;
  const clampedPercent = Math.max(0, Math.min(rawPercent, 100));
  return {
    current,
    target,
    rawPercent,
    clampedPercent,
    configured
  };
}

function formatProgressBlockValueText(state, config) {
  const currentText = formatDataCalloutNumber(state.current);
  const targetText = state.target > 0 ? formatDataCalloutNumber(state.target) : "—";
  const unit = config.unitLabel ? ` ${config.unitLabel}` : "";
  return state.target > 0 ? `${currentText} / ${targetText}${unit}` : `${currentText}${unit}`;
}

function renderProgressBlock(block) {
  if (!block || block.dataset.type !== "progress") return;

  const shellEl = block.querySelector(".progress-block-shell");
  const titleEl = block.querySelector(".progress-block-title");
  const valueEl = block.querySelector(".progress-block-value");
  const percentEl = block.querySelector(".progress-block-percent");
  const metaEl = block.querySelector(".progress-block-meta");
  const ringLabelEl = block.querySelector(".progress-block-ring-label");
  const deadlineEl = block.querySelector(".progress-block-deadline");
  const barFillEl = block.querySelector(".progress-block-bar-fill");
  const pillFillEl = block.querySelector(".progress-block-pill-fill");
  if (!shellEl || !titleEl || !valueEl || !percentEl || !metaEl || !ringLabelEl || !deadlineEl || !barFillEl || !pillFillEl) return;

  const config = readProgressBlockConfig(block);
  const state = computeProgressBlockState(config);
  const percentText = `${Math.round(state.rawPercent)}%`;
  const deadlineMeta = getProgressBlockDeadlineMeta(config.deadline);

  titleEl.textContent = config.title || "Goal";
  valueEl.textContent = formatProgressBlockValueText(state, config);
  percentEl.textContent = percentText;
  ringLabelEl.textContent = config.showPercent === "1" ? percentText : formatDataCalloutNumber(state.current);
  deadlineEl.textContent = deadlineMeta.text;

  titleEl.hidden = config.showTitle !== "1";
  valueEl.hidden = config.showValue !== "1";
  percentEl.hidden = config.showPercent !== "1";
  metaEl.hidden = config.showValue !== "1" && config.showPercent !== "1";
  ringLabelEl.hidden = config.showValue !== "1" && config.showPercent !== "1";
  deadlineEl.hidden = config.showDeadline !== "1" || !deadlineMeta.text;

  shellEl.dataset.style = config.style;
  shellEl.dataset.size = config.size;
  shellEl.dataset.sourceType = config.sourceType;
  shellEl.classList.toggle("is-configured", !!state.configured);
  shellEl.classList.toggle("is-overdue", !!deadlineMeta.overdue);
  shellEl.style.setProperty("--progress-fill", config.fillColor);
  shellEl.style.setProperty("--progress-track", config.trackColor);
  shellEl.style.setProperty("--progress-ratio", `${state.clampedPercent}%`);

  block.dataset.progressStyle = config.style;
  block.dataset.progressSize = config.size;

  barFillEl.style.width = `${state.clampedPercent}%`;
  pillFillEl.style.width = `${state.clampedPercent}%`;
}

function renderVisibleProgressBlocks() {
  document.querySelectorAll('.block[data-type="progress"]').forEach((block) => {
    renderProgressBlock(block);
  });
}

function closeProgressBlockPicker() {
  const picker = document.querySelector('.topbar-dropdown.progress-block-picker');
  if (picker) picker.remove();
  if (typeof setUIState === "function") {
    setUIState({ openOverlay: null });
  }
}

function openProgressBlockPicker(block, anchorEl = null) {
  if (!block) return;

  closeProgressBlockPicker();

  const config = readProgressBlockConfig(block);
  const sources = typeof window.getDatabaseCalloutSources === "function"
    ? window.getDatabaseCalloutSources()
    : [];
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown progress-block-picker";
  picker.dataset.uiId = "progressBlockPicker";
  picker.innerHTML = `
    <div class="topbar-dropdown-label">Progress bar</div>
    <label class="progress-block-picker-field">
      <span>Goal title</span>
      <input type="text" data-progress-input="title" />
    </label>
    <label class="progress-block-picker-field">
      <span>Current source</span>
      <select data-progress-input="sourceType">
        <option value="manual">Manual value</option>
        <option value="database">Database aggregate</option>
      </select>
    </label>
    <div class="progress-block-picker-stack" data-progress-manual-wrap>
      <label class="progress-block-picker-field">
        <span>Current value</span>
        <input type="text" inputmode="decimal" data-progress-input="currentValue" />
      </label>
    </div>
    <div class="progress-block-picker-stack" data-progress-database-wrap hidden>
      <label class="progress-block-picker-field">
        <span>Database table</span>
        <select data-progress-input="source"></select>
      </label>
      <div class="progress-block-picker-grid">
        <label class="progress-block-picker-field">
          <span>Current mode</span>
          <select data-progress-input="valueMode">
            <option value="count">Count rows</option>
            <option value="sum">Sum field</option>
          </select>
        </label>
        <label class="progress-block-picker-field">
          <span>Scope</span>
          <select data-progress-input="scope">
            <option value="all">All records</option>
            <option value="attached">Current page/domain tree</option>
          </select>
        </label>
      </div>
      <label class="progress-block-picker-field" data-progress-property-wrap hidden>
        <span>Field</span>
        <select data-progress-input="property"></select>
      </label>
    </div>
    <div class="progress-block-picker-grid">
      <label class="progress-block-picker-field">
        <span>Target value</span>
        <input type="text" inputmode="decimal" data-progress-input="targetValue" />
      </label>
      <label class="progress-block-picker-field">
        <span>Unit label</span>
        <input type="text" data-progress-input="unitLabel" placeholder="words, hours, tasks" />
      </label>
    </div>
    <label class="progress-block-picker-field">
      <span>Deadline</span>
      <input type="date" data-progress-input="deadline" />
    </label>
    <div class="progress-block-picker-divider"></div>
    <div class="topbar-dropdown-label">Design</div>
    <div class="progress-block-picker-grid">
      <label class="progress-block-picker-field">
        <span>Style</span>
        <select data-progress-input="style">
          <option value="bar">Bar</option>
          <option value="pill">Pill</option>
          <option value="ring">Ring</option>
        </select>
      </label>
      <label class="progress-block-picker-field">
        <span>Size</span>
        <select data-progress-input="size">
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </label>
    </div>
    <div class="progress-block-picker-color-row">
      <label class="progress-block-picker-field">
        <span>Fill color</span>
        <input type="color" data-progress-input="fillColor" />
      </label>
      <label class="progress-block-picker-field">
        <span>Track color</span>
        <input type="color" data-progress-input="trackColor" />
      </label>
    </div>
    <div class="progress-block-picker-divider"></div>
    <div class="topbar-dropdown-label">Visible info</div>
    <div class="progress-block-picker-toggles">
      <label class="progress-block-picker-toggle"><input type="checkbox" data-progress-input="showTitle" /> Title</label>
      <label class="progress-block-picker-toggle"><input type="checkbox" data-progress-input="showValue" /> Values</label>
      <label class="progress-block-picker-toggle"><input type="checkbox" data-progress-input="showPercent" /> Percent</label>
      <label class="progress-block-picker-toggle"><input type="checkbox" data-progress-input="showDeadline" /> Deadline</label>
    </div>
    <div class="progress-block-picker-actions">
      <button type="button" class="topbar-dropdown-btn" data-progress-action="save">Save</button>
      <button type="button" class="topbar-dropdown-btn" data-progress-action="clear">Clear</button>
    </div>
  `;

  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  document.body.appendChild(picker);

  const anchorTarget = anchorEl || block.querySelector('.progress-block-config-btn') || block;
  const rect = anchorTarget.getBoundingClientRect();
  const width = picker.offsetWidth || 320;
  const height = picker.offsetHeight || 360;
  const viewportPadding = 12;
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - width - viewportPadding;
  }
  if (top + height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - height - 6);
  }

  picker.style.left = `${Math.max(viewportPadding, left)}px`;
  picker.style.top = `${Math.max(viewportPadding, top)}px`;

  if (typeof openOverlay === "function") {
    openOverlay("progressBlockPicker", picker);
  }

  const titleInput = picker.querySelector('[data-progress-input="title"]');
  const sourceTypeSelect = picker.querySelector('[data-progress-input="sourceType"]');
  const manualWrap = picker.querySelector('[data-progress-manual-wrap]');
  const databaseWrap = picker.querySelector('[data-progress-database-wrap]');
  const currentInput = picker.querySelector('[data-progress-input="currentValue"]');
  const sourceSelect = picker.querySelector('[data-progress-input="source"]');
  const valueModeSelect = picker.querySelector('[data-progress-input="valueMode"]');
  const scopeSelect = picker.querySelector('[data-progress-input="scope"]');
  const propertyWrap = picker.querySelector('[data-progress-property-wrap]');
  const propertySelect = picker.querySelector('[data-progress-input="property"]');
  const targetInput = picker.querySelector('[data-progress-input="targetValue"]');
  const unitInput = picker.querySelector('[data-progress-input="unitLabel"]');
  const deadlineInput = picker.querySelector('[data-progress-input="deadline"]');
  const styleSelect = picker.querySelector('[data-progress-input="style"]');
  const sizeSelect = picker.querySelector('[data-progress-input="size"]');
  const fillColorInput = picker.querySelector('[data-progress-input="fillColor"]');
  const trackColorInput = picker.querySelector('[data-progress-input="trackColor"]');
  const showTitleInput = picker.querySelector('[data-progress-input="showTitle"]');
  const showValueInput = picker.querySelector('[data-progress-input="showValue"]');
  const showPercentInput = picker.querySelector('[data-progress-input="showPercent"]');
  const showDeadlineInput = picker.querySelector('[data-progress-input="showDeadline"]');
  const saveBtn = picker.querySelector('[data-progress-action="save"]');
  const clearBtn = picker.querySelector('[data-progress-action="clear"]');

  if (!titleInput || !sourceTypeSelect || !manualWrap || !databaseWrap || !currentInput || !sourceSelect || !valueModeSelect || !scopeSelect || !propertyWrap || !propertySelect || !targetInput || !unitInput || !deadlineInput || !styleSelect || !sizeSelect || !fillColorInput || !trackColorInput || !showTitleInput || !showValueInput || !showPercentInput || !showDeadlineInput || !saveBtn || !clearBtn) {
    closeProgressBlockPicker();
    return;
  }

  sourceTypeSelect.value = normalizeProgressBlockSourceType(config.sourceType || "manual");
  titleInput.value = config.title || "Goal";
  currentInput.value = config.currentValue || "0";
  targetInput.value = config.targetValue || "100";
  unitInput.value = config.unitLabel || "";
  deadlineInput.value = config.deadline || "";
  valueModeSelect.value = normalizeProgressBlockValueMode(config.valueMode || "count");
  scopeSelect.value = normalizeProgressBlockScope(config.scope || "all");
  styleSelect.value = normalizeProgressBlockStyle(config.style || "bar");
  sizeSelect.value = normalizeProgressBlockSize(config.size || "md");
  fillColorInput.value = normalizeProgressBlockColor(config.fillColor || "", "#9fe870");
  trackColorInput.value = normalizeProgressBlockColor(config.trackColor || "", "#2a2f24");
  showTitleInput.checked = config.showTitle === "1";
  showValueInput.checked = config.showValue === "1";
  showPercentInput.checked = config.showPercent === "1";
  showDeadlineInput.checked = config.showDeadline === "1";

  sourceSelect.innerHTML = '<option value="">Choose a table...</option>' + sources.map((source) => {
    const key = source.kind === "block"
      ? `block|${source.pageId}|${source.blockId}`
      : `page|${source.pageId}|`;
    return `<option value="${escapeDataCalloutHTML(key)}">${escapeDataCalloutHTML(source.label || source.title || "Database")}</option>`;
  }).join("");

  const parseSourceValue = (raw) => {
    const [kind = "page", pageId = "", blockId = ""] = String(raw || "").split("|");
    return {
      kind: kind === "block" ? "block" : "page",
      pageId,
      blockId: kind === "block" ? blockId : ""
    };
  };

  const selectedSourceKey = config.sourcePageId
    ? `${config.sourceKind}|${config.sourcePageId}|${config.sourceKind === "block" ? config.sourceBlockId : ""}`
    : "";
  sourceSelect.value = selectedSourceKey;

  const fillPropertyOptions = (database, selectedPropertyId = "") => {
    const properties = Array.isArray(database?.properties) ? database.properties : [];
    propertySelect.innerHTML = '<option value="">Choose a field...</option>' + properties.map((property) => (
      `<option value="${escapeDataCalloutHTML(property.id)}">${escapeDataCalloutHTML(property.name)}</option>`
    )).join("");
    if (selectedPropertyId) propertySelect.value = selectedPropertyId;
  };

  const refreshDatabaseOptions = () => {
    const sourceInfo = parseSourceValue(sourceSelect.value);
    const payload = sourceInfo.pageId ? getProgressBlockSourcePayload({
      sourceType: "database",
      sourceKind: sourceInfo.kind,
      sourcePageId: sourceInfo.pageId,
      sourceBlockId: sourceInfo.blockId
    }) : null;
    fillPropertyOptions(payload?.database || null, propertySelect.value || config.propertyId);

    const mode = normalizeProgressBlockValueMode(valueModeSelect.value || "count");
    propertyWrap.hidden = mode !== "sum";
    propertySelect.disabled = mode !== "sum";
  };

  const syncSourceSections = () => {
    const sourceType = normalizeProgressBlockSourceType(sourceTypeSelect.value || "manual");
    manualWrap.hidden = sourceType !== "manual";
    databaseWrap.hidden = sourceType !== "database";
    if (sourceType === "database") {
      refreshDatabaseOptions();
    }
  };

  sourceTypeSelect.addEventListener("change", syncSourceSections);
  sourceSelect.addEventListener("change", refreshDatabaseOptions);
  valueModeSelect.addEventListener("change", refreshDatabaseOptions);

  refreshDatabaseOptions();
  syncSourceSections();

  saveBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const sourceType = normalizeProgressBlockSourceType(sourceTypeSelect.value || "manual");
    const nextConfig = {
      ...config,
      title: titleInput.value || "Goal",
      currentValue: currentInput.value || "0",
      targetValue: targetInput.value || "100",
      unitLabel: unitInput.value || "",
      deadline: deadlineInput.value || "",
      style: styleSelect.value || "bar",
      size: sizeSelect.value || "md",
      fillColor: fillColorInput.value || "#9fe870",
      trackColor: trackColorInput.value || "#2a2f24",
      showTitle: showTitleInput.checked ? "1" : "0",
      showValue: showValueInput.checked ? "1" : "0",
      showPercent: showPercentInput.checked ? "1" : "0",
      showDeadline: showDeadlineInput.checked ? "1" : "0"
    };

    if (sourceType === "database") {
      const sourceInfo = parseSourceValue(sourceSelect.value);
      const valueMode = normalizeProgressBlockValueMode(valueModeSelect.value || "count");

      if (!sourceInfo.pageId) {
        showAppToast?.("Choose a database table first.", "info");
        return;
      }

      if (valueMode === "sum" && !propertySelect.value) {
        showAppToast?.("Choose a field to sum.", "info");
        return;
      }

      writeProgressBlockConfig(block, {
        ...nextConfig,
        sourceType,
        sourceKind: sourceInfo.kind,
        sourcePageId: sourceInfo.pageId,
        sourceBlockId: sourceInfo.blockId,
        propertyId: propertySelect.value || "",
        valueMode,
        scope: scopeSelect.value || "all"
      });
    } else {
      writeProgressBlockConfig(block, {
        ...nextConfig,
        sourceType: "manual",
        sourceKind: "page",
        sourcePageId: "",
        sourceBlockId: "",
        propertyId: "",
        valueMode: valueModeSelect.value || "count",
        scope: scopeSelect.value || "all"
      });
    }

    renderProgressBlock(block);
    if (typeof saveState === "function") saveState();
    closeProgressBlockPicker();
  });

  clearBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    writeProgressBlockConfig(block, {
      title: "Goal",
      sourceType: "manual",
      sourceKind: "page",
      sourcePageId: "",
      sourceBlockId: "",
      propertyId: "",
      valueMode: "count",
      scope: "all",
      currentValue: "0",
      targetValue: "100",
      unitLabel: "",
      deadline: "",
      style: "bar",
      size: "md",
      showTitle: "1",
      showValue: "1",
      showPercent: "1",
      showDeadline: "1",
      fillColor: "#9fe870",
      trackColor: "#2a2f24"
    });
    renderProgressBlock(block);
    if (typeof saveState === "function") saveState();
    closeProgressBlockPicker();
  });

  requestAnimationFrame(() => {
    titleInput.focus();
    titleInput.select();
  });
}

window.mountProgressBlock = function mountProgressBlock(block, options = {}) {
  if (!block || block.dataset.type !== "progress") return null;
  renderProgressBlock(block);
  if (options.openPicker) {
    const anchor = block.querySelector('.progress-block-config-btn') || block;
    openProgressBlockPicker(block, anchor);
  }
  return block;
};

function normalizeDataCalloutConfig(raw = {}) {
  const sourceType = normalizeDataCalloutSourceType(raw?.sourceType || "database");
  const systemKey = normalizeDataCalloutSystemKey(raw?.systemKey || "current-date");
  return {
    label: String(raw?.label || "").trim() || getDefaultDataCalloutLabel({ sourceType, systemKey }),
    sourceType,
    sourceKind: raw?.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw?.sourcePageId || "").trim(),
    sourceBlockId: String(raw?.sourceBlockId || "").trim(),
    propertyId: String(raw?.propertyId || "").trim(),
    mode: normalizeDataCalloutMode(raw?.mode || "row"),
    rowId: String(raw?.rowId || "").trim(),
    systemKey,
    systemTargetKind: normalizeDataCalloutSystemTargetKind(raw?.systemTargetKind || "current"),
    systemTargetPageId: String(raw?.systemTargetPageId || "").trim(),
    systemFormat: normalizeDataCalloutSystemFormat(raw?.systemFormat || "", systemKey),
    align: normalizeDataCalloutAlign(raw?.align || "left"),
    size: normalizeDataCalloutSize(raw?.size || "md"),
    labelPos: normalizeDataCalloutLabelPos(raw?.labelPos || "below")
  };
}

function readDataCalloutConfig(block) {
  if (!block) return normalizeDataCalloutConfig({});
  return normalizeDataCalloutConfig({
    label: block.dataset.dataCalloutLabel || "",
    sourceType: block.dataset.dataCalloutSourceType || "database",
    sourceKind: block.dataset.dataCalloutSourceKind || "page",
    sourcePageId: block.dataset.dataCalloutSourcePageId || "",
    sourceBlockId: block.dataset.dataCalloutSourceBlockId || "",
    propertyId: block.dataset.dataCalloutPropertyId || "",
    mode: block.dataset.dataCalloutMode || "row",
    rowId: block.dataset.dataCalloutRowId || "",
    systemKey: block.dataset.dataCalloutSystemKey || "current-date",
    systemTargetKind: block.dataset.dataCalloutSystemTargetKind || "current",
    systemTargetPageId: block.dataset.dataCalloutSystemTargetPageId || "",
    systemFormat: block.dataset.dataCalloutSystemFormat || "",
    align: block.dataset.dataCalloutAlign || "left",
    size: block.dataset.dataCalloutSize || "md",
    labelPos: block.dataset.dataCalloutLabelPos || "below"
  });
}

function writeDataCalloutConfig(block, config) {
  if (!block) return;
  const normalized = normalizeDataCalloutConfig(config);
  block.dataset.dataCalloutLabel = normalized.label;
  block.dataset.dataCalloutSourceType = normalized.sourceType;
  block.dataset.dataCalloutSourceKind = normalized.sourceKind;
  block.dataset.dataCalloutSourcePageId = normalized.sourcePageId;
  block.dataset.dataCalloutSourceBlockId = normalized.sourceBlockId;
  block.dataset.dataCalloutPropertyId = normalized.propertyId;
  block.dataset.dataCalloutMode = normalized.mode;
  block.dataset.dataCalloutRowId = normalized.rowId;
  block.dataset.dataCalloutSystemKey = normalized.systemKey;
  block.dataset.dataCalloutSystemTargetKind = normalized.systemTargetKind;
  block.dataset.dataCalloutSystemTargetPageId = normalized.systemTargetPageId;
  block.dataset.dataCalloutSystemFormat = normalized.systemFormat;
  block.dataset.dataCalloutAlign = normalized.align;
  block.dataset.dataCalloutSize = normalized.size;
  block.dataset.dataCalloutLabelPos = normalized.labelPos;
}

function formatDataCalloutNumber(value = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number);
}

function parseDataCalloutNumericValue(value = "") {
  const safe = String(value || "").trim();
  if (!safe) return 0;
  const normalized = safe.replace(/,/g, "").replace(/[^\d.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatDataCalloutFieldValue(property, rawValue = "") {
  const safeType = String(property?.type || "text").trim();
  const safeValue = rawValue == null ? "" : String(rawValue).trim();
  if (!safeValue) return "—";

  if (safeType === "number" || safeType === "formula" || safeType === "summary") {
    return formatDataCalloutNumber(parseDataCalloutNumericValue(safeValue));
  }

  if (safeType === "checkbox") {
    return safeValue === "true" ? "Checked" : "Unchecked";
  }

  if (safeType === "date") {
    const dateMatch = safeValue.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const date = new Date(`${dateMatch[1]}T00:00:00`);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      }
    }
  }

  return safeValue;
}

function getDataCalloutSourcePayload(config) {
  if (typeof window.getDatabaseCalloutSourceData !== "function") return null;
  if (!config.sourcePageId) return null;

  return window.getDatabaseCalloutSourceData({
    kind: config.sourceKind,
    pageId: config.sourcePageId,
    blockId: config.sourceKind === "block" ? config.sourceBlockId : ""
  });
}

function getDataCalloutPageRecord(pageId = "") {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return null;

  if (safePageId === "home") {
    return { id: "home", title: "Home", type: "domain", icon: "⌂" };
  }

  const domain = (Array.isArray(window.userDomains) ? window.userDomains : []).find((entry) => entry?.id === safePageId);
  if (domain) return { ...domain, type: "domain" };

  const page = (Array.isArray(window.userPages) ? window.userPages : []).find((entry) => entry?.id === safePageId);
  if (page) return { ...page, type: entryTypeOrDefault(page, "page") };

  return null;
}

function entryTypeOrDefault(entry, fallback = "page") {
  return String(entry?.type || fallback).trim() || fallback;
}

function getDataCalloutPageTitle(pageId = "", fallback = "Untitled") {
  const record = getDataCalloutPageRecord(pageId);
  if (record?.title) return record.title;

  const currentPageId = typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "";
  if (pageId && pageId === currentPageId) {
    return document.getElementById("pageTitle")?.textContent?.trim() || fallback;
  }

  return fallback;
}

function getDataCalloutCurrentPageLabel() {
  const currentPageId = typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "";
  const title = getDataCalloutPageTitle(currentPageId, "Current page");
  return `Current page (${title})`;
}

function getDataCalloutPageTargetOptions() {
  const options = [];
  const seen = new Set();

  const pushOption = (value, label) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({ value, label });
  };

  pushOption("current|", getDataCalloutCurrentPageLabel());
  pushOption("page|home", "⌂ Home");

  (Array.isArray(window.userDomains) ? window.userDomains : []).forEach((domain) => {
    if (!domain?.id) return;
    pushOption(`page|${domain.id}`, `⌂ ${domain.title || "Untitled"}`);
  });

  (Array.isArray(window.userPages) ? window.userPages : []).forEach((page) => {
    if (!page?.id) return;
    pushOption(`page|${page.id}`, `📄 ${page.title || "Untitled"}`);
  });

  return options;
}

function parseDataCalloutTargetValue(raw = "") {
  const [kind = "current", pageId = ""] = String(raw || "").split("|");
  return {
    targetKind: kind === "page" && pageId ? "page" : "current",
    pageId: kind === "page" ? String(pageId || "").trim() : ""
  };
}

function getDataCalloutSystemFormatOptions(systemKey = "current-date") {
  if (systemKey === "current-time") {
    return [
      { value: "12h", label: "12-hour" },
      { value: "24h", label: "24-hour" }
    ];
  }

  if (systemKey === "page-activity") {
    return [
      { value: "compact", label: "Today compact" },
      { value: "clock", label: "Today clock" },
      { value: "week-compact", label: "This week compact" },
      { value: "week-clock", label: "This week clock" },
      { value: "last-opened", label: "Last opened" },
      { value: "sessions-today", label: "Sessions today" },
      { value: "sessions-total", label: "Sessions total" }
    ];
  }

  return [
    { value: "short", label: "Short date" },
    { value: "long", label: "Long date" }
  ];
}

function resolveDataCalloutTargetPageId(config) {
  if (normalizeDataCalloutSystemTargetKind(config.systemTargetKind) === "page") {
    return String(config.systemTargetPageId || "").trim();
  }
  return typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "";
}

function formatDataCalloutDate(format = "short") {
  const now = new Date();
  const options = format === "long"
    ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return now.toLocaleDateString(undefined, options);
}

function formatDataCalloutTime(format = "12h") {
  const now = new Date();
  const options = format === "24h"
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { hour: "numeric", minute: "2-digit" };
  return now.toLocaleTimeString(undefined, options);
}

function formatDataCalloutDuration(ms = 0, format = "compact") {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (format === "clock") {
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function computeSystemDataCalloutValue(config) {
  if (config.systemKey === "current-time") {
    return {
      valueText: formatDataCalloutTime(config.systemFormat),
      configured: true
    };
  }

  if (config.systemKey === "page-activity") {
    const targetPageId = resolveDataCalloutTargetPageId(config);
    if (!targetPageId) {
      return {
        valueText: "—",
        configured: false
      };
    }

    if (config.systemFormat === "week-compact" || config.systemFormat === "week-clock") {
      return {
        valueText: formatDataCalloutDuration(getLivePageActivityWeekMs(targetPageId), config.systemFormat === "week-clock" ? "clock" : "compact"),
        configured: true
      };
    }

    if (config.systemFormat === "last-opened") {
      return {
        valueText: getPageActivityLastOpenedLabel(targetPageId),
        configured: true
      };
    }

    if (config.systemFormat === "sessions-today") {
      const sessions = getStoredPageActivitySessions(targetPageId, getPageActivityDayKey());
      return {
        valueText: `${sessions}`,
        configured: true
      };
    }

    if (config.systemFormat === "sessions-total") {
      return {
        valueText: `${getStoredPageActivitySessions(targetPageId)}`,
        configured: true
      };
    }

    return {
      valueText: formatDataCalloutDuration(getLivePageActivityMs(targetPageId), config.systemFormat),
      configured: true
    };
  }

  return {
    valueText: formatDataCalloutDate(config.systemFormat),
    configured: true
  };
}

function computeDataCalloutValue(sourcePayload, config) {
  const database = sourcePayload?.database;
  if (!database) {
    return {
      valueText: "—",
      subline: "Pick a database table to start.",
      configured: false
    };
  }

  const properties = Array.isArray(database.properties) ? database.properties : [];
  const rows = Array.isArray(database.rows) ? database.rows : [];
  const property = properties.find((entry) => entry.id === config.propertyId) || null;

  if (!property) {
    return {
      valueText: "—",
      subline: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
      configured: false
    };
  }

  if (config.mode === "count") {
    return {
      valueText: formatDataCalloutNumber(rows.length),
      subline: `Count of rows in ${database.title}`,
      configured: true
    };
  }

  if (config.mode === "sum") {
    const total = rows.reduce((sum, row) => {
      const value = row?.values?.[property.id] || "";
      return sum + parseDataCalloutNumericValue(value);
    }, 0);
    return {
      valueText: formatDataCalloutNumber(total),
      subline: `Sum of ${property.name}`,
      configured: true
    };
  }

  const row = rows.find((entry) => entry.id === config.rowId) || null;
  if (!row) {
    return {
      valueText: "—",
      subline: "Pick a row for this field.",
      configured: false
    };
  }

  return {
    valueText: formatDataCalloutFieldValue(property, row?.values?.[property.id] || ""),
    subline: `${property.name} from ${row.title || "row"}`,
    configured: true
  };
}

function renderDataCalloutBlock(block) {
  if (!block || block.dataset.type !== "data-callout") return;

  const labelEl = block.querySelector(".data-callout-label");
  const valueEl = block.querySelector(".data-callout-value");
  const shellEl = block.querySelector(".data-callout-shell");
  if (!labelEl || !valueEl || !shellEl) return;

  const config = readDataCalloutConfig(block);
  const result = config.sourceType === "system"
    ? computeSystemDataCalloutValue(config)
    : computeDataCalloutValue(getDataCalloutSourcePayload(config), config);

  labelEl.textContent = config.label || getDefaultDataCalloutLabel(config);
  valueEl.textContent = result.configured ? result.valueText : "—";
  shellEl.classList.toggle("is-configured", !!result.configured);
  shellEl.dataset.sourceType = config.sourceType;
  shellEl.dataset.align = config.align;
  shellEl.dataset.size = config.size;
  shellEl.dataset.labelPos = config.labelPos;
}

function renderVisibleDataCalloutBlocks() {
  document.querySelectorAll('.block[data-type="data-callout"]').forEach((block) => {
    renderDataCalloutBlock(block);
  });
}

function closeDataCalloutPicker() {
  const picker = document.querySelector('.topbar-dropdown.data-callout-picker');
  if (picker) picker.remove();
  if (typeof setUIState === "function") {
    setUIState({ openOverlay: null });
  }
}

function openDataCalloutPicker(block, anchorEl = null) {
  if (!block) return;

  closeDataCalloutPicker();

  const config = readDataCalloutConfig(block);
  const sources = typeof window.getDatabaseCalloutSources === "function"
    ? window.getDatabaseCalloutSources()
    : [];

  const picker = document.createElement("div");
  picker.className = "topbar-dropdown data-callout-picker";
  picker.dataset.uiId = "dataCalloutPicker";
  picker.innerHTML = `
    <div class="topbar-dropdown-label">Info card</div>
    <label class="data-callout-picker-field">
      <span>Label</span>
      <input type="text" data-callout-input="label" />
    </label>
    <label class="data-callout-picker-field">
      <span>Source</span>
      <select data-callout-input="sourceType">
        <option value="database">Database field</option>
        <option value="system">System info</option>
      </select>
    </label>
    <div data-callout-database-wrap>
      <label class="data-callout-picker-field">
        <span>Database table</span>
        <select data-callout-input="source"></select>
      </label>
      <label class="data-callout-picker-field">
        <span>Field</span>
        <select data-callout-input="property"></select>
      </label>
      <label class="data-callout-picker-field">
        <span>Value mode</span>
        <select data-callout-input="mode">
          <option value="row">Specific row value</option>
          <option value="count">Count rows</option>
          <option value="sum">Sum field</option>
        </select>
      </label>
      <label class="data-callout-picker-field" data-callout-row-wrap>
        <span>Row</span>
        <select data-callout-input="row"></select>
      </label>
    </div>
    <div data-callout-system-wrap hidden>
      <label class="data-callout-picker-field">
        <span>Info</span>
        <select data-callout-input="systemKey">
          <option value="current-date">Today's date</option>
          <option value="current-time">Current time</option>
          <option value="page-activity">Time spent on page today</option>
        </select>
      </label>
      <label class="data-callout-picker-field" data-callout-system-target-wrap hidden>
        <span>Page target</span>
        <select data-callout-input="systemTarget"></select>
      </label>
      <label class="data-callout-picker-field">
        <span>Format</span>
        <select data-callout-input="systemFormat"></select>
      </label>
    </div>
    <div class="data-callout-picker-divider"></div>
    <div class="topbar-dropdown-label">Layout</div>
    <label class="data-callout-picker-field">
      <span>Alignment</span>
      <select data-callout-input="align">
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
    </label>
    <label class="data-callout-picker-field">
      <span>Value size</span>
      <select data-callout-input="size">
        <option value="sm">Small</option>
        <option value="md">Medium</option>
        <option value="lg">Large</option>
      </select>
    </label>
    <label class="data-callout-picker-field">
      <span>Label position</span>
      <select data-callout-input="labelPos">
        <option value="above">Above value</option>
        <option value="below">Below value</option>
        <option value="hidden">Hidden</option>
      </select>
    </label>
    <div class="data-callout-picker-actions">
      <button type="button" class="topbar-dropdown-btn" data-callout-action="save">Save</button>
      <button type="button" class="topbar-dropdown-btn" data-callout-action="clear">Clear</button>
    </div>
  `;

  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  document.body.appendChild(picker);

  const anchorTarget = anchorEl || block.querySelector('.data-callout-config-btn') || block;
  const rect = anchorTarget.getBoundingClientRect();
  const width = picker.offsetWidth || 280;
  const height = picker.offsetHeight || 320;
  const viewportPadding = 12;
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - width - viewportPadding;
  }
  if (top + height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - height - 6);
  }

  picker.style.left = `${Math.max(viewportPadding, left)}px`;
  picker.style.top = `${Math.max(viewportPadding, top)}px`;

  if (typeof openOverlay === "function") {
    openOverlay("dataCalloutPicker", picker);
  }

  const labelInput = picker.querySelector('[data-callout-input="label"]');
  const sourceTypeSelect = picker.querySelector('[data-callout-input="sourceType"]');
  const databaseWrap = picker.querySelector('[data-callout-database-wrap]');
  const sourceSelect = picker.querySelector('[data-callout-input="source"]');
  const propertySelect = picker.querySelector('[data-callout-input="property"]');
  const modeSelect = picker.querySelector('[data-callout-input="mode"]');
  const rowWrap = picker.querySelector('[data-callout-row-wrap]');
  const rowSelect = picker.querySelector('[data-callout-input="row"]');
  const systemWrap = picker.querySelector('[data-callout-system-wrap]');
  const systemKeySelect = picker.querySelector('[data-callout-input="systemKey"]');
  const systemTargetWrap = picker.querySelector('[data-callout-system-target-wrap]');
  const systemTargetSelect = picker.querySelector('[data-callout-input="systemTarget"]');
  const systemFormatSelect = picker.querySelector('[data-callout-input="systemFormat"]');
  const alignSelect = picker.querySelector('[data-callout-input="align"]');
  const sizeSelect = picker.querySelector('[data-callout-input="size"]');
  const labelPosSelect = picker.querySelector('[data-callout-input="labelPos"]');
  const saveBtn = picker.querySelector('[data-callout-action="save"]');
  const clearBtn = picker.querySelector('[data-callout-action="clear"]');

  if (!labelInput || !sourceTypeSelect || !databaseWrap || !sourceSelect || !propertySelect || !modeSelect || !rowSelect || !rowWrap || !systemWrap || !systemKeySelect || !systemTargetWrap || !systemTargetSelect || !systemFormatSelect || !saveBtn || !clearBtn) {
    closeDataCalloutPicker();
    return;
  }

  labelInput.value = config.label || "";
  sourceTypeSelect.value = normalizeDataCalloutSourceType(config.sourceType || "database");
  modeSelect.value = normalizeDataCalloutMode(config.mode || "row");
  systemKeySelect.value = normalizeDataCalloutSystemKey(config.systemKey || "current-date");
  if (alignSelect) alignSelect.value = normalizeDataCalloutAlign(config.align || "left");
  if (sizeSelect) sizeSelect.value = normalizeDataCalloutSize(config.size || "md");
  if (labelPosSelect) labelPosSelect.value = normalizeDataCalloutLabelPos(config.labelPos || "below");

  sourceSelect.innerHTML = '<option value="">Choose a table...</option>' + sources.map((source) => {
    const key = source.kind === "block"
      ? `block|${source.pageId}|${source.blockId}`
      : `page|${source.pageId}|`;
    return `<option value="${escapeDataCalloutHTML(key)}">${escapeDataCalloutHTML(source.label || source.title || "Database")}</option>`;
  }).join("");

  const selectedSourceKey = config.sourcePageId
    ? `${config.sourceKind}|${config.sourcePageId}|${config.sourceKind === "block" ? config.sourceBlockId : ""}`
    : "";
  sourceSelect.value = selectedSourceKey;

  const parseSourceValue = (raw) => {
    const [kind = "page", pageId = "", blockId = ""] = String(raw || "").split("|");
    return {
      kind: kind === "block" ? "block" : "page",
      pageId,
      blockId: kind === "block" ? blockId : ""
    };
  };

  const fillPropertyOptions = (database, selectedPropertyId = "") => {
    const properties = Array.isArray(database?.properties) ? database.properties : [];
    propertySelect.innerHTML = '<option value="">Choose a field...</option>' + properties.map((property) => (
      `<option value="${escapeDataCalloutHTML(property.id)}">${escapeDataCalloutHTML(property.name)}</option>`
    )).join("");
    if (selectedPropertyId) propertySelect.value = selectedPropertyId;
  };

  const fillRowOptions = (database, selectedRowId = "") => {
    const rows = Array.isArray(database?.rows) ? database.rows : [];
    rowSelect.innerHTML = '<option value="">Choose a row...</option>' + rows.map((row) => (
      `<option value="${escapeDataCalloutHTML(row.id)}">${escapeDataCalloutHTML(row.title || "Untitled")}</option>`
    )).join("");
    if (selectedRowId) rowSelect.value = selectedRowId;
  };

  const fillSystemTargetOptions = (selectedValue = "") => {
    const options = getDataCalloutPageTargetOptions();
    systemTargetSelect.innerHTML = options.map((option) => (
      `<option value="${escapeDataCalloutHTML(option.value)}">${escapeDataCalloutHTML(option.label)}</option>`
    )).join("");

    const nextValue = selectedValue || (config.systemTargetKind === "page" && config.systemTargetPageId
      ? `page|${config.systemTargetPageId}`
      : "current|");

    systemTargetSelect.value = nextValue;
    if (!systemTargetSelect.value && options.length) {
      systemTargetSelect.value = options[0].value;
    }
  };

  const fillSystemFormatOptions = (systemKey, selectedValue = "") => {
    const options = getDataCalloutSystemFormatOptions(systemKey);
    systemFormatSelect.innerHTML = options.map((option) => (
      `<option value="${escapeDataCalloutHTML(option.value)}">${escapeDataCalloutHTML(option.label)}</option>`
    )).join("");

    const normalized = normalizeDataCalloutSystemFormat(selectedValue || config.systemFormat || "", systemKey);
    systemFormatSelect.value = normalized;
    if (!systemFormatSelect.value && options.length) {
      systemFormatSelect.value = options[0].value;
    }
  };

  let autoLabel = getDefaultDataCalloutLabel(config);

  const maybeSyncAutoLabel = () => {
    const currentValue = String(labelInput.value || "").trim();
    const nextDefault = getDefaultDataCalloutLabel({
      sourceType: sourceTypeSelect.value,
      systemKey: systemKeySelect.value
    });

    if (!currentValue || currentValue === autoLabel) {
      labelInput.value = nextDefault;
    }

    autoLabel = nextDefault;
  };

  const refreshDependentOptions = () => {
    const sourceInfo = parseSourceValue(sourceSelect.value);
    const payload = sourceInfo.pageId ? getDataCalloutSourcePayload({
      sourceKind: sourceInfo.kind,
      sourcePageId: sourceInfo.pageId,
      sourceBlockId: sourceInfo.blockId
    }) : null;

    fillPropertyOptions(payload?.database || null, propertySelect.value || config.propertyId);
    fillRowOptions(payload?.database || null, rowSelect.value || config.rowId);

    const mode = normalizeDataCalloutMode(modeSelect.value || "row");
    rowWrap.hidden = mode !== "row";
    propertySelect.disabled = mode === "count";
    rowSelect.disabled = mode !== "row";
  };

  const refreshSystemOptions = () => {
    const systemKey = normalizeDataCalloutSystemKey(systemKeySelect.value || "current-date");
    fillSystemFormatOptions(systemKey, systemFormatSelect.value || config.systemFormat || "");
    const shouldShowTarget = systemKey === "page-activity";
    systemTargetWrap.hidden = !shouldShowTarget;
    systemTargetSelect.disabled = !shouldShowTarget;
    if (shouldShowTarget) {
      fillSystemTargetOptions(systemTargetSelect.value || "");
    }
  };

  const syncPickerSections = () => {
    const sourceType = normalizeDataCalloutSourceType(sourceTypeSelect.value || "database");
    databaseWrap.hidden = sourceType !== "database";
    systemWrap.hidden = sourceType !== "system";

    if (sourceType === "database") {
      refreshDependentOptions();
    } else {
      refreshSystemOptions();
    }
  };

  sourceSelect.addEventListener("change", () => {
    propertySelect.value = "";
    rowSelect.value = "";
    refreshDependentOptions();
  });

  modeSelect.addEventListener("change", refreshDependentOptions);
  sourceTypeSelect.addEventListener("change", () => {
    maybeSyncAutoLabel();
    syncPickerSections();
  });
  systemKeySelect.addEventListener("change", () => {
    maybeSyncAutoLabel();
    refreshSystemOptions();
  });

  refreshDependentOptions();
  fillSystemTargetOptions(config.systemTargetKind === "page" && config.systemTargetPageId
    ? `page|${config.systemTargetPageId}`
    : "current|");
  fillSystemFormatOptions(systemKeySelect.value, config.systemFormat || "");
  syncPickerSections();

  saveBtn.addEventListener("click", (event) => {
    event.stopPropagation();

    const sourceType = normalizeDataCalloutSourceType(sourceTypeSelect.value || "database");

    if (sourceType === "system") {
      const systemKey = normalizeDataCalloutSystemKey(systemKeySelect.value || "current-date");
      const targetInfo = parseDataCalloutTargetValue(systemTargetSelect.value || "current|");

      writeDataCalloutConfig(block, {
        label: labelInput.value || getDefaultDataCalloutLabel({ sourceType, systemKey }),
        sourceType,
        sourceKind: "page",
        sourcePageId: "",
        sourceBlockId: "",
        propertyId: "",
        mode: "row",
        rowId: "",
        systemKey,
        systemTargetKind: systemKey === "page-activity" ? targetInfo.targetKind : "current",
        systemTargetPageId: systemKey === "page-activity" && targetInfo.targetKind === "page" ? targetInfo.pageId : "",
        systemFormat: systemFormatSelect.value || "",
        align: alignSelect?.value || "left",
        size: sizeSelect?.value || "md",
        labelPos: labelPosSelect?.value || "below"
      });

      renderDataCalloutBlock(block);
      if (typeof saveState === "function") saveState();
      closeDataCalloutPicker();
      return;
    }

    const sourceInfo = parseSourceValue(sourceSelect.value);
    const mode = normalizeDataCalloutMode(modeSelect.value || "row");
    if (!sourceInfo.pageId) {
      showAppToast?.("Choose a database table first.", "info");
      return;
    }

    if (mode !== "count" && !propertySelect.value) {
      showAppToast?.("Choose a field to display.", "info");
      return;
    }

    if (mode === "row" && !rowSelect.value) {
      showAppToast?.("Choose a row for this callout.", "info");
      return;
    }

    writeDataCalloutConfig(block, {
      label: labelInput.value || "Value",
      sourceType,
      sourceKind: sourceInfo.kind,
      sourcePageId: sourceInfo.pageId,
      sourceBlockId: sourceInfo.blockId,
      propertyId: propertySelect.value || "",
      mode,
      rowId: rowSelect.value || "",
      systemKey: systemKeySelect.value || "current-date",
      systemTargetKind: "current",
      systemTargetPageId: "",
      systemFormat: systemFormatSelect.value || "",
      align: alignSelect?.value || "left",
      size: sizeSelect?.value || "md",
      labelPos: labelPosSelect?.value || "below"
    });

    renderDataCalloutBlock(block);
    if (typeof saveState === "function") saveState();
    closeDataCalloutPicker();
  });

  clearBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    writeDataCalloutConfig(block, {
      label: "Value",
      sourceType: "database",
      sourceKind: "page",
      sourcePageId: "",
      sourceBlockId: "",
      propertyId: "",
      mode: "row",
      rowId: "",
      systemKey: "current-date",
      systemTargetKind: "current",
      systemTargetPageId: "",
      systemFormat: "short",
      align: alignSelect?.value || "left",
      size: sizeSelect?.value || "md",
      labelPos: labelPosSelect?.value || "below"
    });
    renderDataCalloutBlock(block);
    if (typeof saveState === "function") saveState();
    closeDataCalloutPicker();
  });
}

window.mountDataCalloutBlock = function mountDataCalloutBlock(block, options = {}) {
  if (!block || block.dataset.type !== "data-callout") return null;
  renderDataCalloutBlock(block);
  if (options.openPicker) {
    const anchor = block.querySelector('.data-callout-config-btn') || block;
    openDataCalloutPicker(block, anchor);
  }
  return block;
};

window.addEventListener("sanctum:database-updated", () => {
  window.requestAnimationFrame(() => {
    renderVisibleDataCalloutBlocks();
  });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setTrackedPageActivityPage(typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home");
    renderVisibleDataCalloutBlocks();
  }, { once: true });
} else {
  setTrackedPageActivityPage(typeof window.getCurrentPageId === "function" ? window.getCurrentPageId() : "home");
  renderVisibleDataCalloutBlocks();
}

function renderLiveDataCalloutBlocks() {
  document.querySelectorAll('.block[data-type="data-callout"]').forEach((block) => {
    const config = readDataCalloutConfig(block);
    if (config.sourceType !== "system") return;
    renderDataCalloutBlock(block);
  });
}

const previousDataCalloutPageOpenHook = typeof window.onSanctumPageOpen === "function" ? window.onSanctumPageOpen : null;
window.onSanctumPageOpen = function onDataCalloutPageOpen(pageId) {
  previousDataCalloutPageOpenHook?.(pageId);
  setTrackedPageActivityPage(pageId);
  renderLiveDataCalloutBlocks();
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushTrackedPageActivity({ now: Date.now() });
  } else {
    resumeTrackedPageActivity();
  }
  renderLiveDataCalloutBlocks();
});

window.addEventListener("pagehide", () => {
  flushTrackedPageActivity({ now: Date.now() });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderVisibleProgressBlocks();
  }, { once: true });
} else {
  renderVisibleProgressBlocks();
}

window.addEventListener("beforeunload", () => {
  flushTrackedPageActivity({ now: Date.now() });
});

window.setInterval(() => {
  if (document.hidden) return;
  renderLiveDataCalloutBlocks();
}, DATA_CALLOUT_LIVE_REFRESH_MS);

window.setInterval(() => {
  if (document.hidden) return;
  flushTrackedPageActivity({
    now: Date.now(),
    keepRunning: true,
    minDeltaMs: DATA_CALLOUT_ACTIVITY_FLUSH_MS
  });
}, DATA_CALLOUT_ACTIVITY_FLUSH_MS);

function normalizeClockStyle(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "split" || raw === "capsule" || raw === "analog") return raw;
  return "digital";
}

function normalizeClockSize(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "sm" || raw === "lg") return raw;
  return "md";
}

function normalizeClockFormat(value = "") {
  return String(value || "").trim() === "24" ? "24" : "12";
}

function normalizeClockShowSeconds(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeClockShowDate(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function normalizeClockColor(value = "") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const short = raw.slice(1).toLowerCase();
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`;
  }
  return "#f5f5f5";
}

function readClockConfig(block) {
  if (!block) {
    return {
      style: "digital",
      size: "md",
      color: "#f5f5f5",
      format: "12",
      showSeconds: false,
      showDate: false,
    };
  }

  return {
    style: normalizeClockStyle(block.dataset.clockStyle || "digital"),
    size: normalizeClockSize(block.dataset.clockSize || "md"),
    color: normalizeClockColor(block.dataset.clockColor || "#f5f5f5"),
    format: normalizeClockFormat(block.dataset.clockFormat || "12"),
    showSeconds: normalizeClockShowSeconds(block.dataset.clockShowSeconds || "0"),
    showDate: normalizeClockShowDate(block.dataset.clockShowDate || "0"),
  };
}

function writeClockConfig(block, config = {}) {
  if (!block) return;
  const next = {
    ...readClockConfig(block),
    ...config,
  };

  block.dataset.clockStyle = normalizeClockStyle(next.style);
  block.dataset.clockSize = normalizeClockSize(next.size);
  block.dataset.clockColor = normalizeClockColor(next.color);
  block.dataset.clockFormat = normalizeClockFormat(next.format);
  block.dataset.clockShowSeconds = normalizeClockShowSeconds(next.showSeconds) ? "1" : "0";
  block.dataset.clockShowDate = normalizeClockShowDate(next.showDate) ? "1" : "0";
}

function readClockTimeParts(now, config = {}) {
  const formatter = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: normalizeClockFormat(config.format || "12") === "12",
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";

  return {
    hour: getPart("hour") || "00",
    minute: getPart("minute") || "00",
    second: getPart("second") || "00",
    dayPeriod: getPart("dayPeriod") || "",
  };
}

function renderClockBlock(block, now = new Date()) {
  if (!block || block.dataset.type !== "clock") return;

  const shell = block.querySelector(".clock-widget-shell");
  const hoursEl = block.querySelector(".clock-widget-hours");
  const minutesEl = block.querySelector(".clock-widget-minutes");
  const secondsEl = block.querySelector(".clock-widget-seconds");
  const meridiemEl = block.querySelector(".clock-widget-meridiem");
  const dateEl = block.querySelector(".clock-widget-date");
  const analogHourEl = block.querySelector(".clock-widget-analog-hour");
  const analogMinuteEl = block.querySelector(".clock-widget-analog-minute");
  const analogSecondEl = block.querySelector(".clock-widget-analog-second");
  if (!shell || !hoursEl || !minutesEl || !secondsEl || !meridiemEl || !dateEl) return;

  const config = readClockConfig(block);
  const parts = readClockTimeParts(now, config);

  shell.dataset.style = config.style;
  shell.dataset.size = config.size;
  shell.dataset.format = config.format;
  shell.dataset.showSeconds = config.showSeconds ? "1" : "0";
  shell.dataset.showDate = config.showDate ? "1" : "0";
  shell.style.setProperty("--clock-accent", config.color);

  hoursEl.textContent = parts.hour;
  minutesEl.textContent = parts.minute;
  secondsEl.textContent = parts.second;
  secondsEl.hidden = !config.showSeconds;

  meridiemEl.textContent = parts.dayPeriod || "";
  meridiemEl.hidden = config.format === "24" || !parts.dayPeriod;
  dateEl.textContent = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
  dateEl.hidden = !config.showDate;

  const hourValue = now.getHours();
  const minuteValue = now.getMinutes();
  const secondValue = now.getSeconds();
  const hourRotation = (((hourValue % 12) + (minuteValue / 60) + (secondValue / 3600)) * 30);
  const minuteRotation = ((minuteValue + (secondValue / 60)) * 6);
  const secondRotation = secondValue * 6;

  if (analogHourEl) {
    analogHourEl.style.transform = `translateX(-50%) rotate(${hourRotation}deg)`;
  }
  if (analogMinuteEl) {
    analogMinuteEl.style.transform = `translateX(-50%) rotate(${minuteRotation}deg)`;
  }
  if (analogSecondEl) {
    analogSecondEl.style.transform = `translateX(-50%) rotate(${secondRotation}deg)`;
    analogSecondEl.hidden = !config.showSeconds;
  }
}

function renderVisibleClockBlocks(now = new Date()) {
  document.querySelectorAll('.block[data-type="clock"]').forEach((block) => {
    renderClockBlock(block, now);
  });
}

function closeClockPicker() {
  const picker = document.querySelector('.topbar-dropdown.clock-picker');
  if (picker) picker.remove();
  if (typeof setUIState === "function") {
    setUIState({ openOverlay: null });
  }
}

function openClockPicker(block, anchorEl = null) {
  if (!block) return;

  closeClockPicker();

  const config = readClockConfig(block);
  const presetColors = ["#f5f5f5", "#cfd4da", "#e7d6b5", "#b7d6c4", "#b7cde1", "#dbbcc8"];
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown clock-picker";
  picker.dataset.uiId = "clockPicker";
  picker.innerHTML = `
    <div class="topbar-dropdown-label">Clock</div>
    <label class="clock-picker-field">
      <span>Style</span>
      <select data-clock-input="style">
        <option value="digital">Plain</option>
        <option value="split">Flip</option>
        <option value="analog">Analog</option>
        <option value="capsule">Capsule</option>
      </select>
    </label>
    <label class="clock-picker-field">
      <span>Size</span>
      <select data-clock-input="size">
        <option value="sm">Small</option>
        <option value="md">Medium</option>
        <option value="lg">Large</option>
      </select>
    </label>
    <label class="clock-picker-field">
      <span>Time format</span>
      <select data-clock-input="format">
        <option value="12">12-hour</option>
        <option value="24">24-hour</option>
      </select>
    </label>
    <label class="clock-picker-field">
      <span>Seconds</span>
      <select data-clock-input="seconds">
        <option value="1">Show</option>
        <option value="0">Hide</option>
      </select>
    </label>
    <label class="clock-picker-field">
      <span>Date</span>
      <select data-clock-input="date">
        <option value="0">Hide</option>
        <option value="1">Show</option>
      </select>
    </label>
    <label class="clock-picker-field">
      <span>Time color</span>
      <div class="clock-picker-color-row">
        <button type="button" class="clock-picker-color-trigger" data-clock-action="pick-color">
          <span class="clock-picker-color-chip"></span>
          <span class="clock-picker-color-value">#F5F5F5</span>
        </button>
        <input type="color" class="clock-picker-color-native" data-clock-input="color" value="#f5f5f5" />
      </div>
    </label>
    <div class="clock-picker-swatches">
      ${presetColors.map((color) => (`<button type="button" class="clock-picker-swatch" data-clock-preset="${color}" style="--clock-swatch:${color};"></button>`)).join("")}
    </div>
    <div class="clock-picker-actions">
      <button type="button" class="topbar-dropdown-btn" data-clock-action="save">Save</button>
      <button type="button" class="topbar-dropdown-btn" data-clock-action="reset">Reset</button>
    </div>
  `;

  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  document.body.appendChild(picker);

  const anchorTarget = anchorEl || block.querySelector('.clock-config-btn') || block;
  const rect = anchorTarget.getBoundingClientRect();
  const width = picker.offsetWidth || 280;
  const height = picker.offsetHeight || 260;
  const viewportPadding = 12;
  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + width > window.innerWidth - viewportPadding) {
    left = window.innerWidth - width - viewportPadding;
  }
  if (top + height > window.innerHeight - viewportPadding) {
    top = Math.max(viewportPadding, rect.top - height - 6);
  }

  picker.style.left = `${Math.max(viewportPadding, left)}px`;
  picker.style.top = `${Math.max(viewportPadding, top)}px`;

  if (typeof openOverlay === "function") {
    openOverlay("clockPicker", picker);
  }

  const styleSelect = picker.querySelector('[data-clock-input="style"]');
  const sizeSelect = picker.querySelector('[data-clock-input="size"]');
  const formatSelect = picker.querySelector('[data-clock-input="format"]');
  const secondsSelect = picker.querySelector('[data-clock-input="seconds"]');
  const dateSelect = picker.querySelector('[data-clock-input="date"]');
  const colorInput = picker.querySelector('[data-clock-input="color"]');
  const colorTrigger = picker.querySelector('[data-clock-action="pick-color"]');
  const colorValue = picker.querySelector('.clock-picker-color-value');
  const saveBtn = picker.querySelector('[data-clock-action="save"]');
  const resetBtn = picker.querySelector('[data-clock-action="reset"]');

  if (!styleSelect || !sizeSelect || !formatSelect || !secondsSelect || !dateSelect || !colorInput || !colorTrigger || !colorValue || !saveBtn || !resetBtn) {
    closeClockPicker();
    return;
  }

  const syncPickerColor = (value) => {
    const nextColor = normalizeClockColor(value || config.color);
    colorInput.value = nextColor;
    colorValue.textContent = nextColor.toUpperCase();
    colorTrigger.style.setProperty('--clock-picker-color', nextColor);
    picker.querySelectorAll('[data-clock-preset]').forEach((button) => {
      button.dataset.active = normalizeClockColor(button.dataset.clockPreset || "") === nextColor ? "1" : "0";
    });
  };

  const openColorPicker = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (typeof colorInput.showPicker === "function") {
      colorInput.showPicker();
      return;
    }

    colorInput.click();
  };

  styleSelect.value = config.style;
  sizeSelect.value = config.size;
  formatSelect.value = config.format;
  secondsSelect.value = config.showSeconds ? "1" : "0";
  dateSelect.value = config.showDate ? "1" : "0";
  syncPickerColor(config.color);

  colorTrigger.addEventListener('click', openColorPicker);
  colorInput.addEventListener('click', (event) => event.stopPropagation());
  colorInput.addEventListener('input', (event) => {
    event.stopPropagation();
    syncPickerColor(colorInput.value);
  });
  colorInput.addEventListener('change', (event) => {
    event.stopPropagation();
    syncPickerColor(colorInput.value);
  });

  picker.querySelectorAll('[data-clock-preset]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      syncPickerColor(button.dataset.clockPreset || config.color);
    });
  });

  saveBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    writeClockConfig(block, {
      style: styleSelect.value,
      size: sizeSelect.value,
      format: formatSelect.value,
      showSeconds: secondsSelect.value === "1",
      showDate: dateSelect.value === "1",
      color: colorInput.value,
    });
    renderClockBlock(block);
    if (typeof enforceMinHeight === "function") enforceMinHeight(block);
    if (typeof saveState === "function") saveState();
    closeClockPicker();
  });

  resetBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    writeClockConfig(block, {
      style: "digital",
      size: "md",
      format: "12",
      showSeconds: false,
      showDate: false,
      color: "#f5f5f5",
    });
    renderClockBlock(block);
    if (typeof enforceMinHeight === "function") enforceMinHeight(block);
    if (typeof saveState === "function") saveState();
    closeClockPicker();
  });
}

window.mountClockBlock = function mountClockBlock(block, options = {}) {
  if (!block || block.dataset.type !== "clock") return null;
  renderClockBlock(block);
  if (typeof enforceMinHeight === "function") enforceMinHeight(block);
  if (options.openPicker) {
    const anchor = block.querySelector('.clock-config-btn') || block;
    openClockPicker(block, anchor);
  }
  return block;
};

window.setInterval(() => {
  if (document.visibilityState === "hidden") return;
  renderVisibleClockBlocks();
}, 1000);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderVisibleClockBlocks();
  }, { once: true });
} else {
  renderVisibleClockBlocks();
}

function buildLinkedPageCardPayload(target, options = {}) {
  const isDomain = target?.type === "domain";
  const fallbackImageMode = getLinkedPageCardImageSource(target?.id || "") ? "linked" : "none";
  const requestedImageMode = options.pageCardImageMode === "custom" || options.pageCardImageMode === "linked" || options.pageCardImageMode === "none"
    ? options.pageCardImageMode
    : (typeof options.pageCardImageSrc === "string" && options.pageCardImageSrc.trim() ? "custom" : fallbackImageMode);
  return {
    type: isDomain ? "domain" : "page",
    linkedPageId: target?.id || "",
    pageCardTitle: target?.title || (isDomain ? "Domain" : "Page"),
    pageCardIcon: target?.icon || (isDomain ? "⌂" : "📄"),
    pageCardSummary: target?.summary || "",
    pageCardTypeLabel: isDomain ? "domain" : (target?.type || "page"),
    pageCardImageSrc: requestedImageMode === "custom"
      ? String(options.pageCardImageSrc || "").trim()
      : (requestedImageMode === "linked" ? getLinkedPageCardImageSource(target?.id || "") : ""),
    pageCardImageMode: requestedImageMode,
    pageCardImagePos: getPageCardImagePosition(options),
    cardStyle: isDomain
      ? "hub"
      : getCardStyle(target?.layout || "board-canvas", target?.category || "none", target?.containerType || "page"),
    pageCardHideIcon: options.hideCardIcon ? 1 : 0
  };
}

function getLinkedCardSourceRecord(linkedPageId) {
  if (!linkedPageId) return null;
  return userPages.find((page) => page.id === linkedPageId)
    || userDomains.find((domain) => domain.id === linkedPageId)
    || null;
}

function getPageCardHost(target) {
  return target?.closest?.('.frame-item[data-type="page"], .frame-item[data-type="domain"], .block[data-type="page"], .block[data-type="domain"]') || null;
}

function getPageCardOwnerBlock(cardHost) {
  if (!cardHost) return null;
  return cardHost.classList.contains("block")
    ? cardHost
    : cardHost.closest('.block[data-type="container"]');
}

function renderLinkedPageCardTargetShell(target, type = "page") {
  if (!target) return;

  if (target.classList?.contains("frame-item")) {
    const wasSelected = target.classList.contains("selected");
    target.classList.remove("frame-item-page", "frame-item-domain");
    target.classList.add(`frame-item-${type}`);
    if (wasSelected) target.classList.add("selected");
    target.dataset.type = type;
    target.dataset.frameChildType = type;
    target.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      ${makeFrameLinkedCardHTML(type)}
    `;
    return;
  }

  target.dataset.type = type;
  target.innerHTML = makeBlockHTML(type);
}

function isGenericLinkedCardTitle(title, type = "page") {
  const normalized = String(title || "").trim().toLowerCase();
  if (!normalized) return true;
  if (type === "domain") {
    return normalized === "domain" || normalized === "domain name";
  }
  return normalized === "page" || normalized === "page title";
}

function applyLinkedPageTargetToBlock(block, target, options = {}) {
  if (!block || !target?.id) return false;

  const payload = buildLinkedPageCardPayload(target, options);
  const nextType = payload.type;

  if (block.dataset.type !== nextType || !block.querySelector(".block-page-card")) {
    renderLinkedPageCardTargetShell(block, nextType);
  }

  block.dataset.linkedPageId = payload.linkedPageId;
  block.dataset.cardStyle = payload.cardStyle;
  block.dataset.pageCardIcon = payload.pageCardIcon;
  block.dataset.pageCardImageMode = payload.pageCardImageMode;
  block.dataset.pageCardImagePos = String(payload.pageCardImagePos);

  const cardTitle = block.querySelector(".page-card-title");
  const cardIcon = block.querySelector(".page-card-icon");
  const cardSummary = block.querySelector(".page-card-summary");
  const cardTypeLabel = block.querySelector(".page-card-type-label");

  if (cardTitle) cardTitle.textContent = payload.pageCardTitle;
  if (cardIcon) setIconElementContent(cardIcon, payload.pageCardIcon, nextType === "domain" ? "⌂" : "📄");
  if (cardSummary) cardSummary.textContent = payload.pageCardSummary;
  if (cardTypeLabel) cardTypeLabel.textContent = payload.pageCardTypeLabel;
  applyPageCardImage(block, {
    mode: payload.pageCardImageMode,
    src: payload.pageCardImageSrc,
    pos: payload.pageCardImagePos,
    iconValue: payload.pageCardIcon,
    fallbackGlyph: nextType === "domain" ? "⌂" : "📄"
  });

  setPageCardIconHidden(block, !!payload.pageCardHideIcon);
  fitLinkedPageBlock(block);
  return true;
}

function syncLinkedPageBlockFromRecord(block, linkedRecord = null) {
  if (!block) return false;

  const sourceRecord = linkedRecord || getLinkedCardSourceRecord(block.dataset.linkedPageId);
  if (!sourceRecord?.id) return false;

  const payload = buildLinkedPageCardPayload(sourceRecord, {
    hideCardIcon: isPageCardIconHidden(block),
    pageCardImageMode: getPageCardImageMode(block),
    pageCardImageSrc: getStoredPageCardImageSource(block),
    pageCardImagePos: getPageCardImagePosition(block)
  });
  const nextType = payload.type;

  if (block.dataset.type !== nextType || !block.querySelector(".block-page-card")) {
    renderLinkedPageCardTargetShell(block, nextType);
  }

  block.dataset.linkedPageId = payload.linkedPageId;
  block.dataset.cardStyle = payload.cardStyle;
  block.dataset.pageCardIcon = payload.pageCardIcon;
  block.dataset.pageCardImageMode = payload.pageCardImageMode;
  block.dataset.pageCardImagePos = String(payload.pageCardImagePos);

  const cardTitle = block.querySelector(".page-card-title");
  const cardIcon = block.querySelector(".page-card-icon");
  const cardSummary = block.querySelector(".page-card-summary");
  const cardTypeLabel = block.querySelector(".page-card-type-label");

  if (cardTitle) cardTitle.textContent = payload.pageCardTitle;
  if (cardIcon) setIconElementContent(cardIcon, payload.pageCardIcon, nextType === "domain" ? "⌂" : "📄");
  if (cardSummary) cardSummary.textContent = payload.pageCardSummary;
  if (cardTypeLabel) cardTypeLabel.textContent = payload.pageCardTypeLabel;
  applyPageCardImage(block, {
    mode: payload.pageCardImageMode,
    src: payload.pageCardImageSrc,
    pos: payload.pageCardImagePos,
    iconValue: payload.pageCardIcon,
    fallbackGlyph: nextType === "domain" ? "⌂" : "📄"
  });

  setPageCardIconHidden(block, !!payload.pageCardHideIcon);
  fitLinkedPageBlock(block);
  return true;
}

function serializeBlockElement(b) {
  const titleEl = b.querySelector(".block-title");
  const bodyEl = b.querySelector(".block-body");
  const blockType = b.dataset.type || "text";
  const containerItems = blockType === "container" ? serializeContainerItems(b) : [];
  const isLinkedCardBlock = blockType === "page" || blockType === "domain";

  return {
    id: b.id || `block-${Date.now()}`,
    type: blockType,
    x: parseInt(b.style.left || "0", 10),
    y: parseInt(b.style.top || "0", 10),
    w: parseInt(b.style.width || b.getBoundingClientRect().width, 10),
    h: parseInt(b.style.height || b.getBoundingClientRect().height, 10),
    z: parseInt(b.style.zIndex || "0", 10),
    titleHTML: titleEl ? titleEl.innerHTML : "",
    bodyHTML: bodyEl ? bodyEl.innerHTML : "",
    containerTitle: b.querySelector(".container-title")?.innerHTML || "",
    containerBody: blockType === "container"
      ? getLegacyContainerBodyHTMLFromItems(containerItems)
      : (b.querySelector(".container-body")?.innerHTML || ""),
    containerItems,
    tableHTML: serializeCanvasTableHTML(b),
    bg: b.style.backgroundColor || "",
    borderColor: b.style.borderColor || "",
    textColor: b.style.color || "",
    padding: b.style.padding || "",
    radius: b.style.borderRadius || "",
    hasNote: b.classList.contains("has-note") ? 1 : 0,
    linkedPageId: isLinkedCardBlock ? (b.dataset.linkedPageId || "") : "",
    pageCardTitle: isLinkedCardBlock ? (b.querySelector(".page-card-title")?.textContent || "") : "",
    pageCardMeta: isLinkedCardBlock ? (b.querySelector(".page-card-meta")?.textContent || "") : "",
    pageCardIcon: isLinkedCardBlock ? (b.dataset.pageCardIcon || b.querySelector(".page-card-icon")?.textContent || "") : "",
    pageCardSummary: isLinkedCardBlock ? (b.querySelector(".page-card-summary")?.textContent || "") : "",
    pageCardTypeLabel: isLinkedCardBlock ? (b.querySelector(".page-card-type-label")?.textContent || "") : "",
    pageCardImageSrc: isLinkedCardBlock ? (b.dataset.pageCardImageSrc || "") : "",
    pageCardImageMode: isLinkedCardBlock ? getPageCardImageMode(b) : "none",
    pageCardImagePos: isLinkedCardBlock ? getPageCardImagePosition(b) : 50,
    pageCardView: isLinkedCardBlock ? getPageCardView(b) : "default",
    pageCardHideIcon: isLinkedCardBlock && isPageCardIconHidden(b) ? 1 : 0,
    cardStyle: isLinkedCardBlock ? (b.dataset.cardStyle || "") : "",
    calendarTitle: blockType === "calendar" ? (b.dataset.calendarTitle || "") : "",
    calendarView: blockType === "calendar" ? (b.dataset.calendarView || "table") : "",
    calendarMonth: blockType === "calendar" ? (b.dataset.calendarMonth || "") : "",
    calendarItems: blockType === "calendar" ? (b.dataset.calendarItems || "[]") : "[]",
    dbProperties: blockType === "calendar" ? (b.dataset.dbProperties || "[]") : "[]",
    dbRows: blockType === "calendar" ? (b.dataset.dbRows || "[]") : "[]",
    dbColumnWidths: blockType === "calendar" ? (b.dataset.dbColumnWidths || "{}") : "{}",
    dbFolderState: blockType === "calendar" ? (b.dataset.dbFolderState || "{}") : "{}",
    dbResetConfig: blockType === "calendar" ? (b.dataset.dbResetConfig || "{}") : "{}",
    dbSourceKind: blockType === "calendar" ? (b.dataset.dbSourceKind || "") : "",
    dbSourcePageId: blockType === "calendar" ? (b.dataset.dbSourcePageId || "") : "",
    dbSourceBlockId: blockType === "calendar" ? (b.dataset.dbSourceBlockId || "") : "",
    calendarCollapsed: blockType === "calendar" ? (b.dataset.calendarCollapsed || "") : "",
    calendarExpandedWidth: blockType === "calendar" ? (b.dataset.calendarExpandedWidth || "") : "",
    dataCalloutLabel: blockType === "data-callout" ? (b.dataset.dataCalloutLabel || "") : "",
    dataCalloutSourceType: blockType === "data-callout" ? (b.dataset.dataCalloutSourceType || "") : "",
    dataCalloutSourceKind: blockType === "data-callout" ? (b.dataset.dataCalloutSourceKind || "") : "",
    dataCalloutSourcePageId: blockType === "data-callout" ? (b.dataset.dataCalloutSourcePageId || "") : "",
    dataCalloutSourceBlockId: blockType === "data-callout" ? (b.dataset.dataCalloutSourceBlockId || "") : "",
    dataCalloutPropertyId: blockType === "data-callout" ? (b.dataset.dataCalloutPropertyId || "") : "",
    dataCalloutMode: blockType === "data-callout" ? (b.dataset.dataCalloutMode || "") : "",
    dataCalloutRowId: blockType === "data-callout" ? (b.dataset.dataCalloutRowId || "") : "",
    dataCalloutSystemKey: blockType === "data-callout" ? (b.dataset.dataCalloutSystemKey || "") : "",
    dataCalloutSystemTargetKind: blockType === "data-callout" ? (b.dataset.dataCalloutSystemTargetKind || "") : "",
    dataCalloutSystemTargetPageId: blockType === "data-callout" ? (b.dataset.dataCalloutSystemTargetPageId || "") : "",
    dataCalloutSystemFormat: blockType === "data-callout" ? (b.dataset.dataCalloutSystemFormat || "") : "",
    dataCalloutAlign: blockType === "data-callout" ? (b.dataset.dataCalloutAlign || "") : "",
    dataCalloutSize: blockType === "data-callout" ? (b.dataset.dataCalloutSize || "") : "",
    dataCalloutLabelPos: blockType === "data-callout" ? (b.dataset.dataCalloutLabelPos || "") : "",
    progressTitle: blockType === "progress" ? (b.dataset.progressTitle || "") : "",
    progressSourceType: blockType === "progress" ? (b.dataset.progressSourceType || "") : "",
    progressSourceKind: blockType === "progress" ? (b.dataset.progressSourceKind || "") : "",
    progressSourcePageId: blockType === "progress" ? (b.dataset.progressSourcePageId || "") : "",
    progressSourceBlockId: blockType === "progress" ? (b.dataset.progressSourceBlockId || "") : "",
    progressPropertyId: blockType === "progress" ? (b.dataset.progressPropertyId || "") : "",
    progressValueMode: blockType === "progress" ? (b.dataset.progressValueMode || "") : "",
    progressScope: blockType === "progress" ? (b.dataset.progressScope || "") : "",
    progressCurrentValue: blockType === "progress" ? (b.dataset.progressCurrentValue || "") : "",
    progressTargetValue: blockType === "progress" ? (b.dataset.progressTargetValue || "") : "",
    progressUnitLabel: blockType === "progress" ? (b.dataset.progressUnitLabel || "") : "",
    progressDeadline: blockType === "progress" ? (b.dataset.progressDeadline || "") : "",
    progressStyle: blockType === "progress" ? (b.dataset.progressStyle || "") : "",
    progressSize: blockType === "progress" ? (b.dataset.progressSize || "") : "",
    progressShowTitle: blockType === "progress" ? (b.dataset.progressShowTitle || "") : "",
    progressShowValue: blockType === "progress" ? (b.dataset.progressShowValue || "") : "",
    progressShowPercent: blockType === "progress" ? (b.dataset.progressShowPercent || "") : "",
    progressShowDeadline: blockType === "progress" ? (b.dataset.progressShowDeadline || "") : "",
    progressFillColor: blockType === "progress" ? (b.dataset.progressFillColor || "") : "",
    progressTrackColor: blockType === "progress" ? (b.dataset.progressTrackColor || "") : "",
    clockStyle: blockType === "clock" ? (b.dataset.clockStyle || "digital") : "digital",
    clockSize: blockType === "clock" ? (b.dataset.clockSize || "md") : "md",
    clockColor: blockType === "clock" ? (b.dataset.clockColor || "#f5f5f5") : "#f5f5f5",
    clockFormat: blockType === "clock" ? (b.dataset.clockFormat || "12") : "12",
    clockShowSeconds: blockType === "clock" ? (b.dataset.clockShowSeconds || "0") : "0",
    clockShowDate: blockType === "clock" ? (b.dataset.clockShowDate || "0") : "0",
    externalUrl: blockType === "weblink" ? (b.dataset.externalUrl || "") : "",
  };
}

window.serializeCanvasBlockForModal = serializeBlockElement;



gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;
  const configButton = e.target.closest('[data-data-callout-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="data-callout"]');
  if (!block) return;
  openDataCalloutPicker(block, configButton);
});

gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;
  const configButton = e.target.closest('[data-progress-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="progress"]');
  if (!block) return;
  openProgressBlockPicker(block, configButton);
});

gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;
  const configButton = e.target.closest('[data-clock-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="clock"]');
  if (!block) return;
  openClockPicker(block, configButton);
});

// inline link click → peek
gridEl.addEventListener("click", (e) => {
  if (document.body.classList.contains("editing")) return;
  const link = e.target.closest(".inline-link");
  if (!link) return;
  const pageId = link.dataset.pageId;
  if (pageId) openPeek(pageId);
});

// inline link click in doc editor → peek
document.getElementById("docContent")?.addEventListener("click", (e) => {
  const link = e.target.closest(".inline-link");
  if (!link) return;
  const pageId = link.dataset.pageId;
  if (pageId) openPeek(pageId);
});


// == Page card / Domain card click (outside edit mode) ==
gridEl.addEventListener("click", (e) => {
  if (document.body.classList.contains("editing")) return;

  const card = e.target.closest(".block-page-card");
  if (!card) return;

  const block = getPageCardHost(card);
  if (!block) return;

  // weblink blocks have their own handler
  if (block.dataset.type === "weblink") return;

  const linkedPageId = block.dataset.linkedPageId;
  if (!linkedPageId) {
    showAppToast?.("This card is not linked yet.", "info");
    return;
  }

  const linkedRecord = getLinkedCardSourceRecord(linkedPageId);
  if (!linkedRecord) {
    showAppToast?.("That linked page no longer exists.", "info");
    return;
  }

  syncLinkedPageBlockFromRecord(block, linkedRecord);
  if (!block.classList.contains("block")) {
    const ownerBlock = block.closest(".block");
    if (ownerBlock && typeof autoGrowBlock === "function") {
      autoGrowBlock(ownerBlock);
    }
  }
  saveCurrentPageBlocks();
  saveState();

  // domains open directly
  if (block.dataset.type === "domain") {
    openPage(linkedRecord.id);
    return;
  }

  // pages: check openBehavior
  const behavior = linkedRecord.openBehavior || "open";

  if (behavior === "peek") {
    openPeek(linkedRecord.id);
  } else {
    openPage(linkedRecord.id);
  }
});


gridEl.addEventListener("click", (e) => {
  const openBtn = e.target.closest(".weblink-open-btn");
  if (!openBtn) return;

  e.preventDefault();
  e.stopPropagation();

  const target = getWebLinkHost(openBtn);
  if (!target) return;
  openWebLinkTarget(target);
});


// == Web link card click (outside edit mode) → open URL in new tab ==
gridEl.addEventListener("click", (e) => {
  if (document.body.classList.contains("editing")) return;

  const card = e.target.closest(".block-weblink-card");
  if (!card) return;

  const target = getWebLinkHost(card);
  if (!target) return;
  openWebLinkTarget(target);
});


// == Web link: set URL button (edit mode) ==
gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;

  const btn = e.target.closest(".weblink-set-url-btn");
  if (!btn) return;

  const target = getWebLinkHost(btn);
  if (!target) return;

  selectBlock(target);
  promptForWebLinkUrl(target);
});


// == Quick Write: double-click empty grid (OUT of edit mode) ==
gridEl.addEventListener("dblclick", (e) => {
  if (document.body.classList.contains("editing")) return;
  if (e.target !== gridEl) return;

  const rect = gridEl.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const rowY = snap(Math.max(0, clickY));
  const GAP = GRID_SIZE; // 1 grid cell padding

  // grid inner usable bounds (1 cell padding each side)
  const minX = GAP;
  const maxX = rect.width - GAP;

  // find blocks that overlap this row
  const blocks = Array.from(gridEl.querySelectorAll(".block"))
    .filter(b => !b.classList.contains("ghost"));

  const occupied = [];

  for (const b of blocks) {
    const x = parseInt(b.style.left || "0", 10);
    const y = parseInt(b.style.top || "0", 10);
    const w = parseInt(b.style.width || b.getBoundingClientRect().width, 10);
    const h = parseInt(b.style.height || b.getBoundingClientRect().height, 10);

    const top = y;
    const bottom = y + h;

    // does this block intersect the row band?
    if (rowY >= top && rowY < bottom) {
      // expand occupied range by 1-cell gap on both sides
      occupied.push([x - GAP, x + w + GAP]);
    }
  }

  // clamp + sort + merge occupied ranges
  const sortedOccupied = occupied
    .map(r => [Math.max(minX, r[0]), Math.min(maxX, r[1])])
    .sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const r of sortedOccupied) {
    if (!merged.length || r[0] > merged[merged.length - 1][1]) merged.push(r);
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
  }

  // build free ranges
  const free = [];
  let cursor = minX;

  for (const r of merged) {
    if (cursor < r[0]) free.push([cursor, r[0]]);
    cursor = Math.max(cursor, r[1]);
  }
  if (cursor < maxX) free.push([cursor, maxX]);

  if (!free.length) return; // no room on that row

  // pick the free segment containing clickX if possible, else pick widest
  let chosen = free.find(([a, b]) => clickX >= a && clickX <= b);
  if (!chosen) {
    chosen = free.reduce((best, seg) => (seg[1] - seg[0] > best[1] - best[0] ? seg : best), free[0]);
  }

  // final spawn bounds: leave 1 cell gap inside the chosen free segment
  let x = snap(chosen[0]);
  let w = snap(chosen[1] - chosen[0]);

  // safety minimum (5 cells wide)
  const MIN_W = GRID_SIZE * 5;
  if (w < MIN_W) return;

  const b = document.createElement("div");
  b.className = "block";
  b.dataset.type = "text";
  b.id = `block-${Date.now()}`;
  b.style.left = `${x}px`;
  b.style.top = `${rowY}px`;
  b.style.width = `${w}px`;
  b.style.height = `${snap(GRID_SIZE * 2)}px`;

  b.innerHTML = `
    <div class="block-body" contenteditable="true" spellcheck="false"></div>
    <div class="block-resize-handle" title="Resize"></div>
  `;

  gridEl.appendChild(b);

  const body = b.querySelector(".block-body");
  if (body) body.focus();

  if (typeof autoGrowBlock === "function") autoGrowBlock(b);
  if (typeof saveState === "function") saveState();
});

function makeGhostBlock(preset) {
  const b = document.createElement("div");
  b.className = "block ghost";
  b.id = `ghost-${Date.now()}`;
  b.dataset.type = preset;
  b.innerHTML = makeBlockHTML(preset);
  b.style.left = "0px";
  b.style.top = "0px";
  applyDefaultBlockDimensions(b, preset);
  return b;
}

function makeRealBlockFromGhost(ghost, preset) {
  const b = document.createElement("div");
  b.className = "block";
  b.dataset.type = preset;
  b.id = `block-${Date.now()}`;
  b.innerHTML = makeBlockHTML(preset);

  b.style.left = ghost.style.left;
  b.style.top = ghost.style.top;

  applyDefaultBlockDimensions(b, preset);
  if (preset === "table") {
    b.style.borderRadius = "2px";
    b.dataset.radiusState = "square";
  }

  return b;
}
 
function startPlacing() {
  if (!document.body.classList.contains("editing")) return;

  placing = true;

  if (!ghostBlock) {
    ghostBlock = makeGhostBlock(placePreset);
    gridEl.appendChild(ghostBlock);
  }
}

function stopPlacing(cancel = false) {
  placing = false;

  if (ghostBlock) {
    ghostBlock.remove();
    ghostBlock = null;
  }
}

// Click + to enter place mode (toggle)
addBlockBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!document.body.classList.contains("editing")) return;

  if (placing) stopPlacing(true);
  else startPlacing();
});

// Move ghost with mouse (only when placing)
gridEl.addEventListener("mousemove", (e) => {
  if (!placing || !ghostBlock) return;

  const pointer = getPointerPositionOnGrid(e.clientX, e.clientY);
  if (!pointer.rect) return;
  const defaultDims = getDefaultBlockDimensions(placePreset);
  const ghostW = parseInt(ghostBlock.style.width || `${defaultDims.width}`, 10) || defaultDims.width;
  const ghostH = parseInt(ghostBlock.style.height || `${defaultDims.height}`, 10) || defaultDims.height;

  let x = pointer.x;
  let y = pointer.y;

  x = snap(Math.max(0, Math.min(x, getGridViewportWidth() - ghostW)));
  y = snap(Math.max(0, Math.min(y, getGridViewportHeight() - ghostH)));

  ghostBlock.style.left = `${x}px`;
  ghostBlock.style.top = `${y}px`;
});

// Click grid to place block
gridEl.addEventListener("mousedown", (e) => {
  if (!placing || !ghostBlock) return;
  if (!document.body.classList.contains("editing")) return;

  // While placing, the ghost position is the source of truth.
  // Allow dropping over existing blocks so larger presets still place reliably.
  e.stopPropagation();

  const real = makeRealBlockFromGhost(ghostBlock, placePreset);
  gridEl.appendChild(real);
  selectBlock(real);

  e.preventDefault();

  const body = real.querySelector(".block-body");
  if (body) body.focus();

 // open modal for page and domain cards AFTER this mousedown finishes
  if (placePreset === "page" || placePreset === "domain") {
    stopPlacing(false);

    setTimeout(() => {
      openPageCreateModal(real);
      if (typeof expandGrid === "function") expandGrid();
    }, 0);

    return;
  }

  if (placePreset === "list") {
    body.textContent = "• ";
    const r = document.createRange();
    const sel = window.getSelection();
    r.setStart(body.firstChild, 2);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  if (placePreset === "data-callout") {
    window.mountDataCalloutBlock?.(real, { openPicker: true });
  }

  if (placePreset === "progress") {
    window.mountProgressBlock?.(real, { openPicker: true });
  }

  const shouldOpenClockPicker = placePreset === "clock";

  if (typeof autoGrowBlock === "function") autoGrowBlock(real);
  if (typeof expandGrid === "function") expandGrid();
  if (typeof saveState === "function") saveState();

  stopPlacing(false);

  if (shouldOpenClockPicker) {
    setTimeout(() => {
      window.mountClockBlock?.(real, { openPicker: true });
    }, 80);
  }
});

// Escape cancels place mode
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && placing) {
    stopPlacing(true);
  }
});

// == Selection (edit mode) ==
let selectedBlock = null;
let topZIndex = 10;
const editorDock = document.getElementById("editorDock");

function isFrameItemTarget(target) {
  return !!target?.classList?.contains("frame-item");
}

function getCanvasTargetType(target) {
  return target?.dataset?.frameChildType || target?.dataset?.type || "text";
}

function getCanvasOwnerBlock(target) {
  return isFrameItemTarget(target)
    ? target.closest('.block[data-type="container"]')
    : target;
}

function compactZIndices() {
  const blocks = [...document.querySelectorAll("#grid .block")];
  blocks.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
  blocks.forEach((b, i) => { b.style.zIndex = String(i + 1); });
  topZIndex = blocks.length + 1;
}

function bringBlockToFront(block) {
  topZIndex += 1;
  if (topZIndex > 10000) compactZIndices();
  block.style.zIndex = String(topZIndex);
}

function clearDockTypeClasses() {
  document.body.classList.remove("block-type-text", "block-type-list", "block-type-image", "block-type-container", "block-type-table");
}

function selectBlock(block) {
  closeCanvasColorPopover();
  window.closeCanvasSlashMenu?.();
  if (selectedBlock) selectedBlock.classList.remove("selected");
  selectedBlock = block || null;
  document.body.classList.remove("block-selected");
  clearDockTypeClasses();

  if (selectedBlock) {
    selectedBlock.classList.add("selected");
    const ownerBlock = getCanvasOwnerBlock(selectedBlock);
    if (ownerBlock?.classList?.contains("block")) {
      bringBlockToFront(ownerBlock);
    }
    document.body.classList.add("block-selected");

    const type = getCanvasTargetType(selectedBlock);
    if (type !== "table" || selectedBlock !== activeTableSelection?.tableTarget) {
      clearTableRangeSelection();
    }
    if (type !== "table" && tableSelectionMode) {
      setTableSelectionMode(false);
    }
    if (type === "text" || type === "data-callout" || type === "progress" || type === "clock" || isDividerType(type)) document.body.classList.add("block-type-text");
    if (type === "list") document.body.classList.add("block-type-list");
    if (type === "image") document.body.classList.add("block-type-image");
    if (type === "container") document.body.classList.add("block-type-container");
    if (type === "table") document.body.classList.add("block-type-table");

    if (type !== "table" || (activeTableCell && !selectedBlock.contains(activeTableCell))) {
      setActiveTableCell(type === "table" ? getActiveTableCellForTarget(selectedBlock) : null);
    }
  } else {
    setActiveTableCell(null);
  }

  refreshCanvasDockToolState();
}

function clearSelection() {
  closeCanvasColorPopover();
  window.closeCanvasSlashMenu?.();
  if (selectedBlock) selectedBlock.classList.remove("selected");
  selectedBlock = null;
  setTableSelectionMode(false);
  setActiveTableCell(null);
  document.body.classList.remove("block-selected");
  clearDockTypeClasses();
  refreshCanvasDockToolState();
}

window.selectCanvasBlock = selectBlock;
window.clearCanvasSelection = clearSelection;

function deleteSelectedBlock() {
  if (!document.body.classList.contains("editing")) return;
  if (!selectedBlock) return;

  if (isFrameItemTarget(selectedBlock)) {
    removeFrameItem(selectedBlock);
    clearSelection();
    return;
  }

  const blockToDelete = selectedBlock;
  const linkedId = blockToDelete.dataset.linkedPageId;
  const blockType = blockToDelete.dataset.type;

  if (blockType === "domain" && linkedId) {
    moveDomainToTrash(linkedId);
  }

  if (blockType === "page" && linkedId) {
    movePageToTrash(linkedId);
  }

  clearSelection();
  blockToDelete.remove();
  expandGrid();

  setTimeout(() => {
    if (typeof saveState === "function") saveState();
  }, 0);
}




// == Block tools in dock (edit mode, when a block is selected) ==
const blockBgBtn        = document.getElementById("blockBgBtn");
const blockBorderBtn    = document.getElementById("blockBorderBtn");
const blockTextColorBtn = document.getElementById("blockTextColorBtn");
const blockPaddingBtn   = document.getElementById("blockPaddingBtn");
const blockRadiusBtn    = document.getElementById("blockRadiusBtn");
const blockNoteBtn      = document.getElementById("blockNoteBtn");
const blockDeleteBtn    = document.getElementById("blockDeleteBtn");
const canvasColorPopover = document.getElementById("canvasColorPopover");

const CANVAS_BG_DEFAULT_COLORS = [
  "#23201C",
  "#2E241F",
  "#243028",
  "#202A33",
  "#30242E",
  "#3A2B1F",
  "#1F262B",
  "#2C2C2C"
];

const CANVAS_TEXT_DEFAULT_COLORS = [
  "#F3E6D4",
  "#E7C38E",
  "#BFD7A8",
  "#9FCAF0",
  "#F0B7AE",
  "#D5C1F3",
  "#FFFFFF",
  "#B8B8B8"
];

const CANVAS_BORDER_DEFAULT_COLORS = Array.from(new Set([
  "#BCB9B4",
  ...CANVAS_TEXT_DEFAULT_COLORS,
  ...CANVAS_BG_DEFAULT_COLORS
]));

const CANVAS_COLOR_TRIGGER_SELECTOR = [
  "#blockBgBtn",
  "#blockTextColorBtn",
  "#blockBorderBtn",
  "#listBorderBtn",
  "#imageBorderBtn",
  "#containerBorderBtn"
].join(", ");

let activeCanvasColorMode = "";
let activeCanvasColorTrigger = null;

function normalizeHexColor(value) {
  const raw = String(value || "").trim();

  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
    return raw.toUpperCase();
  }

  return "";
}

function colorStringToHex(value) {
  if (!value) return "";
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "";

  return `#${[match[1], match[2], match[3]]
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function getCanvasStoredColorList(key) {
  const values = readStorageJSON(key, []);
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeHexColor)
    .filter(Boolean);
}

function getCanvasRecentColors() {
  return getCanvasStoredColorList(STORAGE_KEYS.recentColors);
}

function getCanvasPaletteColors() {
  return getCanvasStoredColorList(STORAGE_KEYS.colorPalette);
}

function saveCanvasRecentColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;

  const next = [normalized, ...getCanvasRecentColors().filter((entry) => entry !== normalized)].slice(0, 8);
  writeStorageJSON(STORAGE_KEYS.recentColors, next);
}

function saveCanvasPaletteColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return;

  const current = getCanvasPaletteColors();
  if (current.includes(normalized)) return;

  writeStorageJSON(STORAGE_KEYS.colorPalette, [normalized, ...current].slice(0, 16));
}

function setDockToolTint(button, color = "") {
  if (!button) return;

  if (color) {
    button.classList.add("has-tool-color");
    button.style.setProperty("--tool-color", color);
    return;
  }

  button.classList.remove("has-tool-color");
  button.style.removeProperty("--tool-color");
}

function getCanvasColorTriggerButtons(mode = "") {
  const idsByMode = {
    bg: ["blockBgBtn"],
    text: ["blockTextColorBtn"],
    border: ["blockBorderBtn", "listBorderBtn", "imageBorderBtn", "containerBorderBtn"]
  };

  return (idsByMode[mode] || [])
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function getSelectedCanvasColorValue(mode = "") {
  if (!selectedBlock) return "";

  if (mode === "bg") {
    return getCanvasTargetType(selectedBlock) === "calendar"
      ? (window.getSelectedInlineDatabaseRowColor?.(selectedBlock) || selectedBlock.style.backgroundColor || "")
      : (selectedBlock.style.backgroundColor || "");
  }

  if (mode === "border") {
    return selectedBlock.style.borderColor || "";
  }

  return selectedBlock.style.color || "";
}

function refreshCanvasDockToolState() {
  const bgColor = getSelectedCanvasColorValue("bg");
  const textColor = getSelectedCanvasColorValue("text");
  const borderColor = getSelectedCanvasColorValue("border");
  const ui = typeof getUIState === "function" ? getUIState() : { openOverlay: null };

  setDockToolTint(blockBgBtn, bgColor);
  setDockToolTint(blockTextColorBtn, textColor);
  getCanvasColorTriggerButtons("border").forEach((button) => setDockToolTint(button, borderColor));
  toolDivider?.classList.toggle("active", ui.openOverlay === "dividerDockMenu");
  refreshTableDockToolState();
}

window.refreshCanvasDockToolState = refreshCanvasDockToolState;

function makeCanvasColorSection(label) {
  const section = document.createElement("div");
  section.className = "canvas-color-section";

  const heading = document.createElement("div");
  heading.className = "canvas-color-label";
  heading.textContent = label;

  const row = document.createElement("div");
  row.className = "canvas-color-row";

  section.appendChild(heading);
  section.appendChild(row);
  return { section, row };
}

function makeCanvasColorSwatch({ color = "", title = "", className = "", onPick }) {
  const swatch = document.createElement("button");
  swatch.type = "button";
  swatch.className = `canvas-color-swatch${className ? ` ${className}` : ""}`;
  swatch.title = title || color || "Reset";

  if (color) {
    swatch.style.background = color;
  }

  swatch.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onPick(color);
  });

  return swatch;
}

function applyCanvasSelectedColor(mode, color, options = {}) {
  const nextColor = color ? (normalizeHexColor(color) || color) : "";

  if (nextColor) {
    saveCanvasRecentColor(nextColor);
    if (options.savePalette) saveCanvasPaletteColor(nextColor);
  }

  withSelectedBlock((block) => {
    if (mode === "bg") {
      applyBlockBackgroundTone(block, nextColor);
      block.dataset.bgState = nextColor ? "custom" : "default";
    } else if (mode === "border") {
      applyBlockBorderTone(block, nextColor);
      block.dataset.borderState = nextColor ? "custom" : "default";
    } else {
      applyBlockTextTone(block, nextColor);
      block.dataset.textState = nextColor ? "custom" : "default";
    }

    refreshCanvasDockToolState();
  });

  closeCanvasColorPopover();
}

function buildCanvasColorPopover(mode) {
  if (!canvasColorPopover) return;

  canvasColorPopover.innerHTML = "";

  const defaultColors = mode === "bg"
    ? CANVAS_BG_DEFAULT_COLORS
    : mode === "border"
      ? CANVAS_BORDER_DEFAULT_COLORS
      : CANVAS_TEXT_DEFAULT_COLORS;
  const recentColors = getCanvasRecentColors().slice(0, 6);
  const customColors = getCanvasPaletteColors()
    .filter((color) => !defaultColors.includes(color))
    .slice(0, 6);

  const recentSection = makeCanvasColorSection("Recent");
  recentSection.row.appendChild(makeCanvasColorSwatch({
    className: "canvas-color-swatch-clear",
    title: mode === "bg" ? "Clear fill" : mode === "border" ? "Clear border color" : "Reset text color",
    onPick: () => applyCanvasSelectedColor(mode, "")
  }));

  if (recentColors.length) {
    recentColors.forEach((color) => {
      recentSection.row.appendChild(makeCanvasColorSwatch({
        color,
        onPick: () => applyCanvasSelectedColor(mode, color)
      }));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "canvas-color-empty";
    empty.textContent = "No recent";
    recentSection.row.appendChild(empty);
  }

  const defaultSection = makeCanvasColorSection("Default");
  defaultColors.forEach((color) => {
    defaultSection.row.appendChild(makeCanvasColorSwatch({
      color,
      onPick: () => applyCanvasSelectedColor(mode, color)
    }));
  });

  const customSection = makeCanvasColorSection("Custom");
  if (customColors.length) {
    customColors.forEach((color) => {
      customSection.row.appendChild(makeCanvasColorSwatch({
        color,
        onPick: () => applyCanvasSelectedColor(mode, color)
      }));
    });
  }

  const addCustomBtn = document.createElement("button");
  addCustomBtn.type = "button";
  addCustomBtn.className = "canvas-color-add";
  addCustomBtn.title = "Pick custom color";
  addCustomBtn.textContent = "+";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "canvas-color-picker-input";
  colorInput.value = colorStringToHex(getSelectedCanvasColorValue(mode)) || defaultColors[0];

  addCustomBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    colorInput.click();
  });

  colorInput.addEventListener("change", () => {
    applyCanvasSelectedColor(mode, colorInput.value, { savePalette: true });
  });

  customSection.row.appendChild(addCustomBtn);
  customSection.row.appendChild(colorInput);

  canvasColorPopover.appendChild(recentSection.section);
  canvasColorPopover.appendChild(defaultSection.section);
  canvasColorPopover.appendChild(customSection.section);
}

function positionCanvasColorPopover(trigger) {
  if (!canvasColorPopover || !trigger) return;

  const rect = trigger.getBoundingClientRect();
  const popoverWidth = canvasColorPopover.offsetWidth || 164;
  const popoverHeight = canvasColorPopover.offsetHeight || 168;

  let left = rect.left - popoverWidth - 8;
  if (left < 12) {
    left = Math.min(window.innerWidth - popoverWidth - 12, rect.right + 8);
  }

  let top = rect.top + (rect.height / 2) - (popoverHeight / 2);
  top = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, top));

  canvasColorPopover.style.left = `${Math.round(left)}px`;
  canvasColorPopover.style.top = `${Math.round(top)}px`;
}

function closeCanvasColorPopover() {
  if (!canvasColorPopover) return;

  activeCanvasColorTrigger?.classList.remove("active");
  canvasColorPopover.hidden = true;
  canvasColorPopover.innerHTML = "";
  activeCanvasColorMode = "";
  activeCanvasColorTrigger = null;
}

function toggleCanvasColorPopover(mode, trigger) {
  if (!canvasColorPopover || !selectedBlock || !trigger) return;

  if (!canvasColorPopover.hidden && activeCanvasColorMode === mode && activeCanvasColorTrigger === trigger) {
    closeCanvasColorPopover();
    return;
  }

  activeCanvasColorTrigger?.classList.remove("active");
  buildCanvasColorPopover(mode);
  canvasColorPopover.hidden = false;
  activeCanvasColorMode = mode;
  activeCanvasColorTrigger = trigger;
  trigger.classList.add("active");

  positionCanvasColorPopover(trigger);
}

window.closeCanvasColorPopover = closeCanvasColorPopover;

canvasColorPopover?.addEventListener("mousedown", (event) => {
  event.stopPropagation();
});

document.addEventListener("mousedown", (event) => {
  if (event.target.closest(`#canvasColorPopover, ${CANVAS_COLOR_TRIGGER_SELECTOR}`)) return;
  closeCanvasColorPopover();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCanvasColorPopover();
  }
});

window.addEventListener("resize", () => {
  if (!canvasColorPopover || canvasColorPopover.hidden) return;
  if (!activeCanvasColorTrigger) {
    closeCanvasColorPopover();
    return;
  }
  positionCanvasColorPopover(activeCanvasColorTrigger);
});

function withSelectedBlock(fn) {
  if (!document.body.classList.contains("editing")) return;
  if (!selectedBlock) return;
  fn(selectedBlock);
  if (typeof saveState === "function") saveState();
}

function applyBlockBackgroundTone(block, value = "") {
  if (!block) return;

  if (getCanvasTargetType(block) === "calendar") {
    if (window.applySelectedInlineDatabaseRowColor?.(block, value)) {
      window.syncInlineDatabaseBlockTone?.(block);
      return;
    }
    block.style.backgroundColor = value;
    window.syncInlineDatabaseBlockTone?.(block);
    return;
  }

  block.style.backgroundColor = value;

  if (getCanvasTargetType(block) === "table") {
    const wrap = block.querySelector(".block-table-wrap");
    if (wrap) wrap.style.backgroundColor = value || "";

    block.querySelectorAll("th.table-cell").forEach((cell) => {
      cell.style.backgroundColor = value ? "rgba(255,255,255,0.05)" : "";
    });

    block.querySelectorAll("td.table-cell").forEach((cell) => {
      cell.style.backgroundColor = value ? "rgba(255,255,255,0.02)" : "";
    });
  }
}

function applyBlockBorderTone(block, value = "") {
  if (!block) return;

  if (value) {
    block.style.borderWidth = "1px";
    block.style.borderStyle = "solid";
    block.style.borderColor = value;
  } else {
    block.style.removeProperty("border-width");
    block.style.removeProperty("border-style");
    block.style.removeProperty("border-color");
  }

  if (getCanvasTargetType(block) === "calendar") {
    const shell = block.querySelector(".page-database-block-shell");
    if (shell) {
      if (value) {
        shell.style.borderWidth = "1px";
        shell.style.borderStyle = "solid";
        shell.style.borderColor = value;
        shell.style.borderRadius = "inherit";
        shell.style.overflow = "hidden";
      } else {
        shell.style.removeProperty("border-width");
        shell.style.removeProperty("border-style");
        shell.style.removeProperty("border-color");
        shell.style.removeProperty("border-radius");
        shell.style.removeProperty("overflow");
      }
    }
  }

  if (getCanvasTargetType(block) === "table") {
    block.querySelectorAll(".table-cell").forEach((cell) => {
      cell.style.borderColor = value || "";
    });
  }
}

function applyBlockTextTone(block, value = "") {
  if (!block) return;

  block.style.color = value;

  const type = getCanvasTargetType(block);

  if (type === "container") {
    const title = block.querySelector(".container-title");
    const body = block.querySelector(".container-body");
    if (title) title.style.color = value || "";
    if (body) body.style.color = value || "";
    return;
  }

  if (type === "table") {
    block.querySelectorAll(".table-cell").forEach((cell) => {
      cell.style.color = value || "";
    });
    return;
  }

  if (type === "page" || type === "domain") {
    const title = block.querySelector(".page-card-title");
    const icon = block.querySelector(".page-card-icon");
    const summary = block.querySelector(".page-card-summary");
    const typeLabel = block.querySelector(".page-card-type-label");
    if (title) {
      title.style.color = value || "";
      title.style.textDecorationColor = value || "";
    }
    if (icon) icon.style.color = value || "";
    if (summary) summary.style.color = value || "";
    if (typeLabel) typeLabel.style.color = value || "";
    return;
  }

  if (isDividerType(type)) {
    const divider = block.querySelector(".block-divider");
    if (divider) {
      divider.style.backgroundColor = value || "";
      divider.style.borderColor = value || "";
    }
    return;
  }

  if (isFrameItemTarget(block)) {
    const body = block.querySelector(".block-body");
    const text = block.querySelector(".frame-item-text-content");
    if (body) body.style.color = value || "";
    if (text) text.style.color = value || "";
    return;
  }

  const title = block.querySelector(".block-title");
  const body = block.querySelector(".block-body");
  if (title) title.style.color = value || "";
  if (body) body.style.color = value || "";
}

function getExpandedPaddingValue(block) {
  const type = getCanvasTargetType(block);

  if (type === "image") return "8px";
  if (type === "table") return "8px";
  if (type === "container") return "20px";
  if (type === "page" || type === "domain") return "4px 8px";
  if (isDividerType(type)) return "11px 8px";

  return "18px";
}

function applyBlockPaddingTone(block, value = "") {
  if (!block) return;

  block.style.padding = value;

  const type = getCanvasTargetType(block);

  if ((type === "page" || type === "domain") && !isFrameItemTarget(block)) {
    fitLinkedPageBlock(block);
    return;
  }

  const sizeTarget = isFrameItemTarget(block)
    ? block.closest('.block[data-type="container"]')
    : block;

  if (typeof autoGrowBlock === "function" && sizeTarget) {
    autoGrowBlock(sizeTarget);
  }

  if (typeof expandGrid === "function") {
    expandGrid();
  }
}

// Fill color menu
if (blockBgBtn) {
  blockBgBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("bg", blockBgBtn);
  });
}

// Border color toggle
if (blockBorderBtn) {
  blockBorderBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("border", blockBorderBtn);
  });
}

// Text color menu
if (blockTextColorBtn) {
  blockTextColorBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("text", blockTextColorBtn);
  });
}

if (blockPaddingBtn) {
  blockPaddingBtn.addEventListener("click", () => {
    withSelectedBlock((b) => {
      const state = b.dataset.paddingState || "default";
      if (state === "default") {
        applyBlockPaddingTone(b, getExpandedPaddingValue(b));
        b.dataset.paddingState = "expanded";
      } else {
        applyBlockPaddingTone(b, "");
        b.dataset.paddingState = "default";
      }
    });
  });
}

// Corners: rounded vs straight
if (blockRadiusBtn) {
  blockRadiusBtn.addEventListener("click", () => {
    withSelectedBlock((b) => {
      const state = b.dataset.radiusState || "rounded";
      if (state === "rounded") {
        b.style.borderRadius = "2px";
        b.dataset.radiusState = "square";
      } else {
        b.style.borderRadius = "12px";
        b.dataset.radiusState = "rounded";
      }
    });
  });
}

// Add note: toggle a tiny dot marker
if (blockNoteBtn) {
  blockNoteBtn.addEventListener("click", () => {
    withSelectedBlock((b) => {
      if (b.classList.contains("has-note")) {
        b.classList.remove("has-note");
      } else {
        b.classList.add("has-note");
      }
    });
  });
}

// Delete block
if (blockDeleteBtn) {
  blockDeleteBtn.addEventListener("click", () => {
    deleteSelectedBlock();
  });
}


// == List block dock buttons ==
const listDeleteBtn  = document.getElementById("listDeleteBtn");
const listBgBtn      = document.getElementById("listBgBtn");
const listBorderBtn  = document.getElementById("listBorderBtn");
const listRadiusBtn  = document.getElementById("listRadiusBtn");
const listNoteBtn    = document.getElementById("listNoteBtn");

if (listDeleteBtn)  listDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (listBgBtn)      listBgBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.bgState || "default";
  if (state === "default") { b.style.backgroundColor = "#23201c"; b.dataset.bgState = "alt"; }
  else { b.style.backgroundColor = ""; b.dataset.bgState = "default"; }
}));
if (listBorderBtn)  listBorderBtn.addEventListener("click", (event) => {
  event.preventDefault();
  toggleCanvasColorPopover("border", listBorderBtn);
});
if (listRadiusBtn)  listRadiusBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.radiusState || "rounded";
  if (state === "rounded") { b.style.borderRadius = "2px"; b.dataset.radiusState = "square"; }
  else { b.style.borderRadius = "12px"; b.dataset.radiusState = "rounded"; }
}));
if (listNoteBtn)    listNoteBtn.addEventListener("click", () => withSelectedBlock((b) => {
  b.classList.toggle("has-note");
}));

// == Image block dock buttons ==
const imageDeleteBtn  = document.getElementById("imageDeleteBtn");
const imageBgBtn      = document.getElementById("imageBgBtn");
const imageBorderBtn  = document.getElementById("imageBorderBtn");
const imageRadiusBtn  = document.getElementById("imageRadiusBtn");
const imageReplaceBtn = document.getElementById("imageReplaceBtn");

if (imageDeleteBtn)  imageDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (imageBgBtn)      imageBgBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.bgState || "default";
  if (state === "default") { b.style.backgroundColor = "#23201c"; b.dataset.bgState = "alt"; }
  else { b.style.backgroundColor = ""; b.dataset.bgState = "default"; }
}));
if (imageBorderBtn)  imageBorderBtn.addEventListener("click", (event) => {
  event.preventDefault();
  toggleCanvasColorPopover("border", imageBorderBtn);
});
if (imageRadiusBtn)  imageRadiusBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.radiusState || "rounded";
  if (state === "rounded") { b.style.borderRadius = "2px"; b.dataset.radiusState = "square"; }
  else { b.style.borderRadius = "12px"; b.dataset.radiusState = "rounded"; }
}));
if (imageReplaceBtn) imageReplaceBtn.addEventListener("click", () => withSelectedBlock((b) => {
  promptImageUploadForBlock(b);
}));

// == Container block dock buttons ==
const containerBgBtn     = document.getElementById("containerBgBtn");
const containerBorderBtn = document.getElementById("containerBorderBtn");
const containerRadiusBtn = document.getElementById("containerRadiusBtn");
const containerDeleteBtn = document.getElementById("containerDeleteBtn");

if (containerDeleteBtn) containerDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (containerBgBtn) containerBgBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.bgState || "default";
  if (state === "default") { b.style.backgroundColor = "#23201c"; b.dataset.bgState = "alt"; }
  else { b.style.backgroundColor = ""; b.dataset.bgState = "default"; }
}));
if (containerBorderBtn) containerBorderBtn.addEventListener("click", (event) => {
  event.preventDefault();
  toggleCanvasColorPopover("border", containerBorderBtn);
});
if (containerRadiusBtn) containerRadiusBtn.addEventListener("click", () => withSelectedBlock((b) => {
  const state = b.dataset.radiusState || "rounded";
  if (state === "rounded") { b.style.borderRadius = "2px"; b.dataset.radiusState = "square"; }
  else { b.style.borderRadius = "12px"; b.dataset.radiusState = "rounded"; }
}));

// == Table block dock buttons ==
function getSelectedTableTarget() {
  if (!selectedBlock) return null;
  return getCanvasTargetType(selectedBlock) === "table" ? selectedBlock : null;
}

function syncTableTargetLayout(tableTarget) {
  if (!tableTarget) return;

  normalizeCanvasTableElement(tableTarget);

  if (typeof autoGrowBlock === "function") {
    autoGrowBlock(tableTarget);
  }

  const ownerBlock = isFrameItemTarget(tableTarget)
    ? tableTarget.closest('.block[data-type="container"]')
    : tableTarget;

  if (ownerBlock && ownerBlock !== tableTarget && typeof autoGrowBlock === "function") {
    autoGrowBlock(ownerBlock);
  }

  if (typeof expandGrid === "function") {
    expandGrid();
  }
}

document.getElementById("tableDeleteBtn")?.addEventListener("click", () => deleteSelectedBlock());
const tableStructureBtn = document.getElementById("tableStructureBtn");
const tableBordersBtn = document.getElementById("tableBordersBtn");
const tableMathBtn = document.getElementById("tableMathBtn");
const tableSelectBtn = document.getElementById("tableSelectBtn");

function positionTableDockMenu(menu, trigger) {
  if (!menu || !trigger) return;

  const rect = trigger.getBoundingClientRect();
  const menuWidth = menu.offsetWidth || 188;
  const menuHeight = menu.offsetHeight || 220;

  let left = rect.left - menuWidth - 8;
  if (left < 12) {
    left = Math.min(window.innerWidth - menuWidth - 12, rect.right + 8);
  }

  let top = rect.top + (rect.height / 2) - (menuHeight / 2);
  top = Math.max(12, Math.min(window.innerHeight - menuHeight - 12, top));

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function refreshTableDockToolState() {
  const ui = typeof getUIState === "function" ? getUIState() : { openOverlay: null };
  tableStructureBtn?.classList.toggle("active", ui.openOverlay === TABLE_DOCK_MENU_IDS.structure);
  tableBordersBtn?.classList.toggle("active", ui.openOverlay === TABLE_DOCK_MENU_IDS.borders);
  tableMathBtn?.classList.toggle("active", ui.openOverlay === TABLE_DOCK_MENU_IDS.math);
  tableSelectBtn?.classList.toggle("active", tableSelectionMode);
}

function buildTableDockMenu(kind) {
  const dropdown = document.createElement("div");
  dropdown.className = "topbar-dropdown table-dock-menu";
  dropdown.dataset.uiId = TABLE_DOCK_MENU_IDS[kind];

  const appendLabel = (label) => {
    const el = document.createElement("div");
    el.className = "topbar-dropdown-label";
    el.textContent = label;
    dropdown.appendChild(el);
  };

  const appendAction = (label, action) => {
    const el = document.createElement("div");
    el.className = "topbar-dropdown-btn";
    el.dataset.action = action;
    el.textContent = label;
    dropdown.appendChild(el);
  };

  const appendDivider = () => {
    const el = document.createElement("div");
    el.className = "topbar-dropdown-divider";
    dropdown.appendChild(el);
  };

  if (kind === "structure") {
    appendLabel("Rows");
    appendAction("Add Row", "add-row");
    appendAction("Remove Row", "remove-row");
    appendDivider();
    appendLabel("Columns");
    appendAction("Add Column", "add-column");
    appendAction("Remove Column", "remove-column");
  }

  if (kind === "borders") {
    appendLabel("Preset");
    appendAction("All Borders", "border-all");
    appendAction("Outer Borders", "border-outer");
    appendAction("Inner Borders", "border-inner");
    appendDivider();
    appendLabel("Edges");
    appendAction("Top Edge", "border-top");
    appendAction("Right Edge", "border-right");
    appendAction("Bottom Edge", "border-bottom");
    appendAction("Left Edge", "border-left");
    appendDivider();
    appendAction("Clear Borders", "border-clear");
  }

  if (kind === "math") {
    appendLabel("Rows");
    appendAction("Sum Row Into Cell", "math-sum");
    appendAction("Subtract Row Into Cell", "math-subtract");
    appendDivider();
    appendLabel("Columns");
    appendAction("Sum Column Into Cell", "math-sum-column");
  }

  dropdown.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  dropdown.addEventListener("click", (event) => {
    const action = event.target.closest(".topbar-dropdown-btn")?.dataset.action;
    if (!action) return;

    if (action === "add-row") addTableRow();
    if (action === "remove-row") removeTableRow();
    if (action === "add-column") addTableColumn();
    if (action === "remove-column") removeTableColumn();
    if (action === "border-all") applyTableBorderPreset("all");
    if (action === "border-outer") applyTableBorderPreset("outer");
    if (action === "border-inner") applyTableBorderPreset("inner");
    if (action === "border-top") applyTableBorderPreset("top");
    if (action === "border-right") applyTableBorderPreset("right");
    if (action === "border-bottom") applyTableBorderPreset("bottom");
    if (action === "border-left") applyTableBorderPreset("left");
    if (action === "border-clear") applyTableBorderPreset("clear");
    if (action === "math-sum") applyTableRowFormula("sum");
    if (action === "math-subtract") applyTableRowFormula("subtract");
    if (action === "math-sum-column") applyTableColumnFormula("sum");

    closeAllOverlays();
  });

  return dropdown;
}

function toggleTableDockMenu(kind, trigger) {
  const menuId = TABLE_DOCK_MENU_IDS[kind];
  if (!trigger || !menuId) return;

  if (getUIState().openOverlay === menuId) {
    closeAllOverlays();
    refreshCanvasDockToolState();
    return;
  }

  const menu = buildTableDockMenu(kind);
  document.body.appendChild(menu);
  positionTableDockMenu(menu, trigger);
  openOverlay(menuId, menu);
  refreshCanvasDockToolState();
}

function buildDividerDockMenu() {
  const dropdown = document.createElement("div");
  dropdown.className = "topbar-dropdown table-dock-menu divider-dock-menu";
  dropdown.dataset.uiId = "dividerDockMenu";

  const title = document.createElement("div");
  title.className = "topbar-dropdown-label";
  title.textContent = "Dividers";
  dropdown.appendChild(title);

  [
    { action: "divider", icon: "─", label: "Horizontal Divider" },
    { action: "divider-vertical", icon: "│", label: "Vertical Divider" },
    { action: "divider-updown", icon: "╎", label: "Up-Down Divider" },
    { action: "divider-dashed", icon: "╌", label: "Dashed Divider" }
  ].forEach((entry) => {
    const item = document.createElement("div");
    item.className = "topbar-dropdown-btn";
    item.dataset.action = entry.action;
    item.innerHTML = `<span class="divider-dock-menu-icon">${entry.icon}</span><span>${entry.label}</span>`;
    dropdown.appendChild(item);
  });

  dropdown.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });

  dropdown.addEventListener("click", (event) => {
    const action = event.target.closest(".topbar-dropdown-btn")?.dataset.action;
    if (!action) return;

    startPlacingPreset(action);
    closeAllOverlays();
    refreshCanvasDockToolState();
  });

  return dropdown;
}

function toggleDividerDockMenu(trigger) {
  if (!trigger) return;

  if (getUIState().openOverlay === "dividerDockMenu") {
    closeAllOverlays();
    refreshCanvasDockToolState();
    return;
  }

  const menu = buildDividerDockMenu();
  document.body.appendChild(menu);
  positionTableDockMenu(menu, trigger);
  openOverlay("dividerDockMenu", menu);
  refreshCanvasDockToolState();
}

function finalizeTableStructureChange(tableTarget) {
  if (!tableTarget) return;
  clearTableRangeSelection();
  syncTableTargetLayout(tableTarget);
  syncTableFormulaCells(tableTarget);
  refreshCanvasDockToolState();
  saveState();
}

function addTableRow() {
  const tableTarget = getSelectedTableTarget();
  if (!tableTarget) return;
  const tbody = tableTarget.querySelector("tbody");
  if (!tbody) return;
  const colCount = tableTarget.querySelectorAll("thead tr th").length;
  const tr = document.createElement("tr");
  for (let i = 0; i < colCount; i++) {
    const td = document.createElement("td");
    td.className = "table-cell";
    td.contentEditable = "true";
    td.spellcheck = false;
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
  finalizeTableStructureChange(tableTarget);
}

function removeTableRow() {
  const tableTarget = getSelectedTableTarget();
  if (!tableTarget) return;
  const tbody = tableTarget.querySelector("tbody");
  if (!tbody) return;
  const rows = tbody.querySelectorAll("tr");
  if (rows.length <= 1) return;
  rows[rows.length - 1].remove();
  finalizeTableStructureChange(tableTarget);
}

function addTableColumn() {
  const tableTarget = getSelectedTableTarget();
  if (!tableTarget) return;
  const table = normalizeCanvasTableElement(tableTarget);
  const thead = tableTarget.querySelector("thead tr");
  const tbody = tableTarget.querySelector("tbody");
  if (!thead || !tbody) return;

  const th = document.createElement("th");
  th.className = "table-cell";
  th.contentEditable = "true";
  th.spellcheck = false;
  th.textContent = `Column ${thead.children.length + 1}`;
  thead.appendChild(th);

  tbody.querySelectorAll("tr").forEach(row => {
    const td = document.createElement("td");
    td.className = "table-cell";
    td.contentEditable = "true";
    td.spellcheck = false;
    row.appendChild(td);
  });

  const colgroup = table ? (getCanvasTableColgroup(table) || normalizeCanvasTableElement(table)?.querySelector("colgroup")) : null;
  if (colgroup) {
    const col = document.createElement("col");
    col.style.width = `${TABLE_COLUMN_DEFAULT_WIDTH}px`;
    colgroup.appendChild(col);
  }

  finalizeTableStructureChange(tableTarget);
}

function removeTableColumn() {
  const tableTarget = getSelectedTableTarget();
  if (!tableTarget) return;
  const table = normalizeCanvasTableElement(tableTarget);
  const thead = tableTarget.querySelector("thead tr");
  const tbody = tableTarget.querySelector("tbody");
  if (!thead || !tbody) return;
  if (thead.children.length <= 1) return;

  thead.removeChild(thead.lastElementChild);
  tbody.querySelectorAll("tr").forEach(row => {
    if (row.lastElementChild) row.removeChild(row.lastElementChild);
  });

  const cols = getCanvasTableCols(table);
  cols[cols.length - 1]?.remove();

  finalizeTableStructureChange(tableTarget);
}

tableStructureBtn?.addEventListener("click", () => toggleTableDockMenu("structure", tableStructureBtn));
tableBordersBtn?.addEventListener("click", () => toggleTableDockMenu("borders", tableBordersBtn));
tableMathBtn?.addEventListener("click", () => toggleTableDockMenu("math", tableMathBtn));
tableSelectBtn?.addEventListener("click", () => {
  if (!getSelectedTableTarget()) return;
  setTableSelectionMode(!tableSelectionMode);
});
toolDivider?.addEventListener("click", (e) => {
  e.preventDefault();
  toggleDividerDockMenu(toolDivider);
});


// == Page card ⋯ in edit mode ==
gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;

  const btn = e.target.closest(".page-card-menu");
  if (!btn) return;

  e.stopPropagation();

  const block = getPageCardHost(btn);
  if (!block) return;

  const pageId = block.dataset.linkedPageId;
  if (!pageId) return;

  closeAllOverlays();

  const dropdown = document.createElement("div");
  dropdown.className = "topbar-dropdown";
  dropdown.dataset.uiId = "pageCardDropdown";
  const relinkActionLabel = block.dataset.type === "domain"
    ? "Link Different Domain"
    : "Link Different Page or Domain";
  const viewActionLabel = getPageCardView(block) === "gallery"
    ? "Switch to Compact View"
    : "Switch to Gallery View";
  const resolvedImageSrc = resolvePageCardImageSource(block);
  const currentImageMode = getPageCardImageMode(block);
  const hasLinkedHeaderImage = !!getLinkedPageCardImageSource(pageId);
  const imageActionLabel = resolvedImageSrc ? "Replace Card Image" : "Add Card Image";
  dropdown.innerHTML = `
    <div class="topbar-dropdown-btn" data-action="relink">${relinkActionLabel}</div>
    <div class="topbar-dropdown-btn" data-action="toggle-card-view">${viewActionLabel}</div>
    <div class="topbar-dropdown-btn" data-action="set-card-image">${imageActionLabel}</div>
    ${hasLinkedHeaderImage && currentImageMode !== "linked" ? '<div class="topbar-dropdown-btn" data-action="use-linked-card-image">Use Page Header Image</div>' : ''}
    ${resolvedImageSrc ? '<div class="topbar-dropdown-btn" data-action="reset-card-image-position">Center Card Image</div>' : ''}
    ${currentImageMode !== "none" ? '<div class="topbar-dropdown-btn" data-action="remove-card-image">Remove Card Image</div>' : ''}
    <div class="topbar-dropdown-btn" data-action="toggle-card-icon">${isPageCardIconHidden(block) ? "Show Card Icon" : "Remove Card Icon"}</div>
    <div class="topbar-dropdown-btn" data-action="details">Edit Details</div>
    <div class="topbar-dropdown-btn danger" data-action="delete">Delete</div>
  `;

  document.body.appendChild(dropdown);
  const rect = btn.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + 6}px`;
  dropdown.style.left = `${rect.left}px`;

  if (typeof openOverlay === "function") {
    openOverlay("pageCardDropdown", dropdown);
  }

  dropdown.addEventListener("click", (ev) => {
    const action = ev.target.dataset.action;

    dropdown.remove();
    if (typeof setUIState === "function") {
      setUIState({ openOverlay: null });
    }

    if (action === "relink") {
      openPageLinkModal(block, {
        restoreData: serializePageCardTargetForModal(block),
        initialLinkedPageId: pageId,
        initialQuery: block.querySelector(".page-card-title")?.textContent || "",
        hideCardIcon: isPageCardIconHidden(block)
      });
    }
    if (action === "set-card-image") {
      promptPageCardImageUpload(block);
    }
    if (action === "use-linked-card-image") {
      applyPageCardImage(block, {
        mode: "linked",
        iconValue: block.dataset.pageCardIcon || block.querySelector(".page-card-icon")?.textContent || (block.dataset.type === "domain" ? "⌂" : "📄"),
        fallbackGlyph: block.dataset.type === "domain" ? "⌂" : "📄"
      });
      if (getPageCardView(block) !== "gallery") {
        setPageCardView(block, "gallery");
      }
      expandGrid();
      saveState();
    }
    if (action === "reset-card-image-position") {
      setPageCardImagePosition(block, 50);
    }
    if (action === "remove-card-image") {
      applyPageCardImage(block, {
        mode: "none",
        iconValue: block.dataset.pageCardIcon || block.querySelector(".page-card-icon")?.textContent || (block.dataset.type === "domain" ? "⌂" : "📄"),
        fallbackGlyph: block.dataset.type === "domain" ? "⌂" : "📄"
      });
      expandGrid();
      saveState();
    }
    if (action === "toggle-card-icon") {
      setPageCardIconHidden(block, !isPageCardIconHidden(block));
      expandGrid();
      saveState();
    }
    if (action === "toggle-card-view") {
      setPageCardView(block, getPageCardView(block) === "gallery" ? "default" : "gallery");
      expandGrid();
      saveState();
    }
    if (action === "details") openPageDetails(pageId);
    if (action === "delete") deleteSelectedBlock();
  });
});


// click on a block selects it (edit mode only)
document.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;

  const frameItem = e.target.closest(".frame-item");
  if (frameItem && !e.target.closest(".frame-item-delete, .frame-item-image-action, .weblink-set-url-btn, .weblink-open-btn, .container-insert-prompt")) {
    selectBlock(frameItem);
    return;
  }

  const block = e.target.closest(".block");
  if (!block) return;

  // if you clicked the ghost block, ignore
  if (block.classList.contains("ghost")) return;

  // If we are in place mode and you click a real block: cancel place mode (your choice A)
  if (typeof placing !== "undefined" && placing) {
    if (typeof stopPlacing === "function") stopPlacing(true);
  }

  selectBlock(block);
});

// clicking empty grid clears selection (edit mode only)
gridEl.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;

  // only clear when you click the empty grid background
  if (e.target === gridEl) {
    clearSelection();
  }
});

// == Delete selected block (edit mode only) ==
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("editing")) return;
  if (!selectedBlock) return;

  const typingInEditable = document.activeElement?.closest?.('[contenteditable="true"]');
  const typingInInput = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
  if (typingInEditable || typingInInput) return;

  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    deleteSelectedBlock();
  }
});

function expandGrid(options = {}) {
  const grid = document.getElementById("grid");
  if (!grid) return;

  const metrics = readCanvasLayoutMetrics();
  if (metrics?.isInfinite) {
    grid.style.removeProperty("minWidth");
    grid.style.removeProperty("minHeight");
    window.syncInfiniteCanvasGridBounds?.();
    return;
  }

  grid.style.removeProperty("minWidth");
  clampAllBlocksWithinGrid();

  const { maxBottom } = getGridContentBounds(grid);

  const minHeight = window.innerHeight - 70;
  grid.style.minHeight = `${Math.max(minHeight, maxBottom + 200)}px`;
}

window.addEventListener("resize", () => {
  expandGrid();
});

// == Auto-grow block height while typing ==
function autoGrowBlock(block, options = {}) {
  const allowShrink = !!options.allowShrink;
  const minH = block?.dataset?.type === "text" ? GRID_SIZE : 48;
  const currentH = parseInt(block.style.height || "0", 10);

  if (isDividerType(block.dataset.type)) {
    const dividerHeight = getDefaultBlockDimensions(block.dataset.type || "divider").height;
    block.style.height = `${Math.max(currentH || dividerHeight, dividerHeight)}px`;
    return;
  }

  // for container blocks, measure title + body combined
  if (block.dataset.type === "container") {
    const title = block.querySelector(".container-title");
    const body = block.querySelector(".container-body");
    const titleH = title ? title.scrollHeight : 0;
    const bodyH = body ? body.scrollHeight : 0;
    const needed = titleH + bodyH + 24; // 24px padding buffer
    const snapped = Math.max(minH, snap(needed));
    const finalH = allowShrink ? snapped : Math.max(currentH || minH, snapped);
    block.style.height = `${finalH}px`;
    return;
  }

  block.style.height = "auto";
  const needed = block.scrollHeight;
  const snapped = Math.max(minH, snap(needed));
  const finalH = allowShrink ? snapped : Math.max(currentH || minH, snapped);
  block.style.height = `${finalH}px`;
  enforceMinHeight(block);
}

// == List block keyboard behavior ==
document.addEventListener("keydown", (e) => {
  const editable = document.activeElement?.closest('[contenteditable="true"]');
  if (!editable) return;

  const block = editable.closest(".block");
  if (!block || block.dataset.type !== "list") return;

  // Enter = new bullet
  if (e.key === "Enter") {
    e.preventDefault();

    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    range.deleteContents();

    const newLine = document.createTextNode("\n• ");
    range.insertNode(newLine);

    // move cursor to end of the new bullet text
    const newRange = document.createRange();
    newRange.setStart(newLine, newLine.length);
    newRange.setEnd(newLine, newLine.length);
    sel.removeAllRanges();
    sel.addRange(newRange);

    autoGrowBlock(block);
    saveState();
  }

  // Backspace on an empty bullet line = delete that line
  if (e.key === "Backspace") {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!range.collapsed) return; // only if no text selected

    // get text before cursor
    const preRange = document.createRange();
    preRange.selectNodeContents(editable);
    preRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = preRange.toString();

    // if the line we're on is just "• " then delete the whole line
    const lines = textBefore.split("\n");
    const currentLine = lines[lines.length - 1];

    if (currentLine === "• ") {
      e.preventDefault();

      // delete back to the \n before this bullet
      const charsToDelete = currentLine.length + 1; // +1 for the \n
      for (let i = 0; i < charsToDelete; i++) {
        document.execCommand("delete", false, null);
      }

      autoGrowBlock(block);
      saveState();
    }
  }
});

document.addEventListener("input", (e) => {
  const editable = e.target.closest('[contenteditable="true"]');
  if (!editable) return;

  const block = editable.closest(".block");
  const tableTarget = editable.classList?.contains("table-cell") ? getCanvasTableTarget(editable) : null;

  if (block) {
    autoGrowBlock(block);
    if (typeof saveState === "function") saveState();
  }

  if (tableTarget) {
    setActiveTableCell(editable);
    syncTableTargetLayout(tableTarget);
    syncTableFormulaCells(tableTarget);
  }

  // inline link trigger — works in blocks AND doc content
  checkInlineLinkTrigger(editable);
  window.checkCanvasSlashCommand?.(editable);
});

document.addEventListener("selectstart", (event) => {
  if (!tableSelectionMode) return;
  if (!event.target.closest?.(".table-cell")) return;
  event.preventDefault();
});

document.addEventListener("mousedown", (event) => {
  if (!document.body.classList.contains("editing")) return;
  if (!tableSelectionMode || event.button !== 0) return;

  const cell = event.target.closest?.(".table-cell");
  if (!cell) return;

  const header = cell.matches?.("th.table-cell") ? cell : null;
  const rect = header?.getBoundingClientRect?.();
  if (rect?.width && event.clientX >= rect.right - TABLE_COLUMN_RESIZE_HIT_WIDTH) {
    return;
  }

  const tableTarget = getCanvasTableTarget(cell);
  if (!tableTarget) return;

  event.preventDefault();
  event.stopPropagation();

  if (selectedBlock !== tableTarget) {
    selectBlock(tableTarget);
  }

  setActiveTableCell(cell);
  setTableRangeSelection(tableTarget, cell, cell);
  activeTableRangeDrag = {
    tableTarget,
    anchorCell: cell
  };
}, true);

document.addEventListener("mousemove", (event) => {
  if (!activeTableRangeDrag) return;

  const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".table-cell");
  if (!hovered) return;

  const tableTarget = getCanvasTableTarget(hovered);
  if (tableTarget !== activeTableRangeDrag.tableTarget) return;

  setTableRangeSelection(tableTarget, activeTableRangeDrag.anchorCell, hovered);
});

document.addEventListener("mouseup", () => {
  activeTableRangeDrag = null;
});

document.addEventListener("focusin", (e) => {
  const cell = e.target.closest?.(".table-cell");
  if (!cell) return;

  if (!tableSelectionMode) {
    clearTableRangeSelection();
  }

  setActiveTableCell(cell);

  const tableTarget = getCanvasTableTarget(cell);
  if (document.body.classList.contains("editing") && tableTarget && selectedBlock !== tableTarget) {
    selectBlock(tableTarget);
  }

  if (cell.dataset.tableFormula) {
    cell.textContent = cell.dataset.tableFormula;
    cell.classList.remove("table-cell-formula", "table-cell-formula-error");
  }
});

document.addEventListener("blur", (e) => {
  const cell = e.target.closest?.(".table-cell");
  if (!cell) return;

  commitTableFormulaCell(cell);
  const tableTarget = getCanvasTableTarget(cell);
  if (tableTarget) {
    syncTableFormulaCells(tableTarget);
    syncTableTargetLayout(tableTarget);
  }
  if (typeof saveState === "function") saveState();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!tableSelectionMode) return;
  setTableSelectionMode(false);
});


// Make container titles editable only in edit mode
document.addEventListener("dblclick", (e) => {
  if (!document.body.classList.contains("editing")) return;
  const title = e.target.closest(".container-title");
  if (!title) return;
  title.contentEditable = "true";
  title.focus();
});

document.addEventListener("blur", (e) => {
  const title = e.target.closest(".container-title");
  if (!title) return;
  title.contentEditable = "false";
  if (typeof saveState === "function") saveState();
}, true);

document.addEventListener("mousedown", (e) => {
  if (!e.target.closest(".container-insert-prompt, .frame-item-delete, .frame-item-image-action, .weblink-set-url-btn, .weblink-open-btn")) return;
  e.preventDefault();
  e.stopPropagation();
}, true);

document.addEventListener("click", (e) => {
  const prompt = e.target.closest(".container-insert-prompt");
  if (prompt) {
    if (!document.body.classList.contains("editing")) return;
    const block = prompt.closest('.block[data-type="container"]');
    if (!block) return;
    selectBlock(block);
    insertFrameItemIntoContainer(block, "text", { focus: true });
    return;
  }

  const deleteBtn = e.target.closest(".frame-item-delete");
  if (deleteBtn) {
    if (!document.body.classList.contains("editing")) return;
    const item = deleteBtn.closest(".frame-item");
    const block = item?.closest('.block[data-type="container"]');
    if (block) selectBlock(block);
    removeFrameItem(item);
    return;
  }

  const replaceBtn = e.target.closest(".frame-item-image-action");
  if (replaceBtn) {
    if (!document.body.classList.contains("editing")) return;
    const item = replaceBtn.closest('.frame-item[data-type="image"]');
    const block = item?.closest('.block[data-type="container"]');
    if (block) selectBlock(block);
    promptImageUploadForBlock(item);
  }
});

document.addEventListener("keydown", (e) => {
  const editable = e.target.closest?.(".frame-item-text-content");
  if (!editable || e.key !== "Backspace") return;

  const item = editable.closest(".frame-item");
  if (!item || !isFrameTextItemEmpty(item)) return;

  e.preventDefault();

  const previousEditable = item.previousElementSibling?.querySelector?.(".frame-item-text-content");
  const nextEditable = item.nextElementSibling?.querySelector?.(".frame-item-text-content");
  const prompt = item.closest('.container-body')?.querySelector('.container-insert-prompt');

  removeFrameItem(item);

  if (previousEditable) {
    previousEditable.focus();
    placeCaretInsideEditable(previousEditable, true);
    return;
  }

  if (nextEditable) {
    nextEditable.focus();
    placeCaretInsideEditable(nextEditable, false);
    return;
  }

  prompt?.focus();
});















