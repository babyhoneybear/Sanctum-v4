

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
let activeFrameCarryItems = [];
let activeFrameCarryStartX = 0;
let activeFrameCarryStartY = 0;
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
    return ["text", "image", "button", "page", "domain", "divider", "divider-vertical", "divider-updown", "divider-dashed"].includes(type) ? type : "";
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

function getCanvasBlockBox(block) {
  if (!block) return { x: 0, y: 0, w: 0, h: 0 };

  const x = parseInt(block.style.left || "0", 10) || 0;
  const y = parseInt(block.style.top || "0", 10) || 0;
  const w = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10) || 0;
  const h = parseInt(block.style.height || block.getBoundingClientRect().height || "0", 10) || 0;

  return { x, y, w, h };
}

function getCanvasBlockZ(block) {
  const z = parseInt(block?.style?.zIndex || block?.dataset?.z || "0", 10);
  return Number.isFinite(z) ? z : 0;
}

function isBlockCarriedByFrame(block, frameBlock, frameBox, frameZ) {
  if (!block || !frameBlock || block === frameBlock) return false;
  if (block.classList.contains("ghost")) return false;
  if (block.closest(".frame-item")) return false;
  if (block.parentElement?.id !== "grid") return false;
  if (getCanvasBlockZ(block) < frameZ) return false;

  const box = getCanvasBlockBox(block);
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;

  return centerX >= frameBox.x
    && centerX <= frameBox.x + frameBox.w
    && centerY >= frameBox.y
    && centerY <= frameBox.y + frameBox.h;
}

function beginFrameSurfaceCarry(frameBlock) {
  activeFrameCarryItems = [];
  activeFrameCarryStartX = 0;
  activeFrameCarryStartY = 0;

  if (!frameBlock || frameBlock.dataset.type !== "container") return;

  const frameBox = getCanvasBlockBox(frameBlock);
  const frameZ = getCanvasBlockZ(frameBlock);
  activeFrameCarryStartX = frameBox.x;
  activeFrameCarryStartY = frameBox.y;

  activeFrameCarryItems = Array.from(document.querySelectorAll("#grid > .block"))
    .filter((block) => isBlockCarriedByFrame(block, frameBlock, frameBox, frameZ))
    .map((block) => {
      const box = getCanvasBlockBox(block);
      return {
        block,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h
      };
    });
}

function updateFrameSurfaceCarry(deltaX, deltaY) {
  if (!activeFrameCarryItems.length) return;

  const gridWidth = getGridViewportWidth();
  const gridHeight = getGridViewportHeight();

  activeFrameCarryItems.forEach((item) => {
    if (!item.block?.isConnected) return;

    const maxX = Math.max(0, gridWidth - item.w);
    const maxY = Math.max(0, gridHeight - item.h);
    const nextX = Math.max(0, Math.min(item.x + deltaX, maxX));
    const nextY = Math.max(0, Math.min(item.y + deltaY, maxY));

    item.block.style.left = `${nextX}px`;
    item.block.style.top = `${nextY}px`;
  });
}

function clearFrameSurfaceCarry() {
  activeFrameCarryItems = [];
  activeFrameCarryStartX = 0;
  activeFrameCarryStartY = 0;
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
  if (e.target.closest(".page-database-col-head-wrap[data-db-header-prop-id]")) return;
  if (e.target.closest(".block")) e.preventDefault();
});

document.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;
  if (e.button !== 0) return;

  if (beginCanvasTableColumnResize(e)) return;

  if (e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest(".page-database-block-shell input, .page-database-block-shell textarea, .page-database-block-shell button, .page-database-block-shell select, .page-database-block-shell [data-db-action], .page-database-cell, .page-database-row-shell, .page-database-gallery-card, .page-database-board-card, .page-calendar-event, .page-calendar-day, .page-database-table-scroll")) return;
  if (e.target.closest(".typing-drill-shell input, .typing-drill-shell button, .typing-drill-shell select, .typing-drill-shell textarea, .match-pairs-shell button, .match-pairs-shell input, .match-pairs-shell select, .match-pairs-shell textarea")) return;
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
    const dragHandle = e.target.closest(".page-database-block-header, .page-database-block-title");
    if (inlineShell && !dragHandle && !handle) {
      return;
    }
  }

  e.preventDefault();
  clearFrameDropPreview();
  clearFrameSurfaceCarry();

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

  beginFrameSurfaceCarry(block);

  // make sure left/top are relative to grid
  // (no action needed here—mousemove will set them)
});

document.addEventListener("mousedown", (e) => {
  if (!document.body.classList.contains("editing")) return;
  if (e.button !== 0) return;
  if (e.target.closest('[contenteditable="true"]')) return;
  if (e.target.closest(".frame-item-delete, .frame-item-image-action, .container-insert-prompt")) return;

  const item = e.target.closest(".frame-item");
  const sourceBlock = item?.closest('.block[data-type="container"]');
  if (!item || !sourceBlock) return;

  if (selectedBlock !== item) {
    selectBlock(item);
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
    updateFrameSurfaceCarry(x - activeFrameCarryStartX, y - activeFrameCarryStartY);

    const frameDropTarget = null;
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

    if (activeType === "image" && shouldLockImageCropAspect(activeBlock.dataset.imageCropShape)) {
      const maxWidth = Math.max(minDims.width, getGridViewportWidth() - blockX);
      const size = Math.min(maxWidth, Math.max(minDims.width, w, h));
      w = size;
      h = size;
    }

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
    const frameDropTarget = null;
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
  if (activeBlock) {
    expandGrid();
    if (typeof saveState === "function") saveState();
  }
  clearFrameDropPreview();
  clearFrameSurfaceCarry();
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
const toolStudy = document.getElementById("toolStudy");
const toolStudyBack = document.getElementById("toolStudyBack");
const toolFlashcards = document.getElementById("toolFlashcards");
const toolTypingDrill = document.getElementById("toolTypingDrill");
const toolFillBlank = document.getElementById("toolFillBlank");
const toolMatchPairs = document.getElementById("toolMatchPairs");
const toolSessionProgress = document.getElementById("toolSessionProgress");
const toolDailyStreak = document.getElementById("toolDailyStreak");
const toolRecentAnswers = document.getElementById("toolRecentAnswers");


function startPlacingPreset(preset) {
  if (!document.body.classList.contains("editing")) {
    if (!window.isInfiniteCanvasPage?.()) return;
    document.body.classList.add("editing");
  }
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
toolStudy?.addEventListener("click", (e) => {
  e.preventDefault();
  document.body.classList.add("dock-study-open");
});
toolStudyBack?.addEventListener("click", (e) => {
  e.preventDefault();
  document.body.classList.remove("dock-study-open");
});
toolFlashcards?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("flashcards"); });
toolTypingDrill?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("typing-drill"); });
toolFillBlank?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("fill-blank"); });
toolMatchPairs?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("match-pairs"); });
toolSessionProgress?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("session-progress"); });
toolDailyStreak?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("daily-streak"); });
toolRecentAnswers?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("recent-answers"); });
document.getElementById("toolContainer")?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("container"); });
document.getElementById("toolTable")?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("table"); });
document.getElementById("toolButton")?.addEventListener("click", (e) => { e.preventDefault(); startPlacingPreset("button"); });
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

  if (type === "flashcards") {
    return { width: snap(GRID_SIZE * 14), height: snap(GRID_SIZE * 8) };
  }

  if (type === "typing-drill") {
    return { width: snap(GRID_SIZE * 14), height: snap(GRID_SIZE * 8) };
  }

  if (type === "fill-blank") {
    return { width: snap(GRID_SIZE * 14), height: snap(GRID_SIZE * 8) };
  }

  if (type === "match-pairs") {
    return { width: snap(GRID_SIZE * 11), height: snap(GRID_SIZE * 8) };
  }

  if (type === "session-progress") {
    return { width: snap(GRID_SIZE * 11), height: snap(GRID_SIZE * 5) };
  }

  if (type === "daily-streak") {
    return { width: snap(GRID_SIZE * 11), height: snap(GRID_SIZE * 4) };
  }

  if (type === "recent-answers") {
    return { width: snap(GRID_SIZE * 12), height: snap(GRID_SIZE * 7) };
  }

  if (type === "button") {
    return { width: snap(GRID_SIZE * 7), height: snap(GRID_SIZE * 2) };
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

  if (type === "match-pairs") {
    const config = readMatchPairsConfig(block);
    const layout = getActiveMatchPairsLayout(config);
    return {
      width: snap(GRID_SIZE * (layout === "focus" ? 14 : layout === "columns" ? 10 : 9)),
      height: getMinHeightForBlock(block)
    };
  }

  if (["session-progress", "daily-streak", "recent-answers"].includes(type)) {
    return {
      width: snap(GRID_SIZE * (type === "recent-answers" ? 8 : 7)),
      height: getMinHeightForBlock(block)
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

const IMAGE_CROP_OPTIONS = [
  { value: "original", label: "Original", width: 260, height: 180 },
  { value: "rectangle", label: "Rectangle", width: 320, height: 200 },
  { value: "landscape", label: "Landscape", width: 360, height: 216 },
  { value: "portrait", label: "Portrait", width: 216, height: 320 },
  { value: "square", label: "Square", width: 240, height: 240 },
  { value: "circle", label: "Circle", width: 240, height: 240 },
  { value: "arch-tall", label: "Tall arch", width: 220, height: 320 },
  { value: "arch-short", label: "Short arch", width: 300, height: 220 }
];

const IMAGE_FRAME_OPTIONS = [
  { value: "none", label: "No frame" },
  { value: "hairline", label: "Hairline" },
  { value: "dashed", label: "Dashed" },
  { value: "double", label: "Double" },
  { value: "mat", label: "Mat" }
];

function normalizeImageCropShape(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return IMAGE_CROP_OPTIONS.some((option) => option.value === safe) ? safe : "original";
}

function normalizeImageFrameStyle(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return IMAGE_FRAME_OPTIONS.some((option) => option.value === safe) ? safe : "none";
}

function getImageCropOption(shape = "original") {
  const safe = normalizeImageCropShape(shape);
  return IMAGE_CROP_OPTIONS.find((option) => option.value === safe) || IMAGE_CROP_OPTIONS[0];
}

function shouldLockImageCropAspect(shape = "") {
  const safe = normalizeImageCropShape(shape);
  return safe === "circle";
}

function enforceImageCropAspect(target, shape = "") {
  if (!target?.classList?.contains("block") || !shouldLockImageCropAspect(shape)) return;

  const width = parseInt(target.style.width || target.getBoundingClientRect().width, 10) || 0;
  const height = parseInt(target.style.height || target.getBoundingClientRect().height, 10) || 0;
  const size = Math.max(GRID_SIZE * 3, snap(Math.max(width, height) || GRID_SIZE * 10));

  target.style.width = `${size}px`;
  target.style.height = `${size}px`;
}

function applyImageCropShape(target, shape = "original", options = {}) {
  if (!target) return;

  const nextShape = normalizeImageCropShape(shape);
  target.dataset.imageCropShape = nextShape;
  const radiusByShape = {
    circle: "50%",
    "arch-tall": "999px 999px 8px 8px",
    "arch-short": "999px 999px 4px 4px"
  };
  target.style.borderRadius = radiusByShape[nextShape] || "2px";
  target.dataset.radiusState = nextShape === "original" || nextShape === "rectangle" || nextShape === "landscape" || nextShape === "portrait" || nextShape === "square"
    ? "square"
    : "custom";

  const body = target.querySelector(".block-image-body");
  if (body) body.dataset.imageCropShape = nextShape;

  if (options.resize !== false && target.classList?.contains("block")) {
    const dims = getImageCropOption(nextShape);
    target.style.width = `${dims.width}px`;
    target.style.height = `${dims.height}px`;
    clampBlockWithinGrid(target, { clampWidth: true });
    if (typeof expandGrid === "function") expandGrid();
  } else if (options.enforceAspect !== false) {
    enforceImageCropAspect(target, nextShape);
  }

  if (!options.skipSave && typeof saveState === "function") {
    saveState();
  }
}

function applyImageFrameStyle(target, frameStyle = "none", options = {}) {
  if (!target) return;

  const nextFrame = normalizeImageFrameStyle(frameStyle);
  target.dataset.imageFrameStyle = nextFrame;
  target.style.removeProperty("border-width");
  target.style.removeProperty("border-style");
  target.style.removeProperty("border-color");
  target.dataset.borderState = "default";

  target.classList.toggle("has-image-frame", nextFrame !== "none");

  if (!options.skipSave && typeof saveState === "function") {
    saveState();
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
      body.innerHTML = `<img src="${storedSrc}" class="canvas-cropped-image" draggable="false" />`;
      applyImageCropShape(block, block.dataset.imageCropShape || "original", { resize: false, skipSave: true });

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

function ensureFrameTypingLine(containerBlock, options = {}) {
  const host = getContainerItemsHost(containerBlock);
  if (!host) return null;

  const items = Array.from(host.querySelectorAll(":scope > .frame-item"));
  const lastItem = items[items.length - 1] || null;
  const lastEditable = getFrameItemTextContent(lastItem);

  if (lastEditable && isFrameTextItemEmpty(lastItem)) {
    if (options.focus) focusFrameTextItem(lastItem, !!options.placeAtEnd);
    syncContainerInsertPrompt(containerBlock);
    return lastItem;
  }

  const item = buildFrameItemElement({ type: "text" });
  host.appendChild(item);
  syncContainerInsertPrompt(containerBlock);

  if (options.focus) focusFrameTextItem(item, !!options.placeAtEnd);
  return item;
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
    item.dataset.imageCropShape = normalizeImageCropShape(data.imageCropShape);
    item.dataset.imageFrameStyle = normalizeImageFrameStyle(data.imageFrameStyle);
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      <div class="block-body block-image-body">${data.bodyHTML || '<div class="image-placeholder">🖼 Click replace to add image</div>'}</div>
      <button type="button" class="frame-item-image-action">Replace</button>
    `;
    applyStoredFrameItemStyles(item, data);
    applyImageCropShape(item, data.imageCropShape || "original", { resize: false, skipSave: true });
    applyImageFrameStyle(item, data.imageFrameStyle || "none", { skipSave: true });
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

  if (type === "button") {
    item.dataset.type = "button";
    item.dataset.buttonConfig = data.buttonConfig || "{}";
    item.innerHTML = `
      <button type="button" class="frame-item-delete" aria-label="Remove item">×</button>
      <div class="button-block-shell"></div>
    `;
    applyStoredFrameItemStyles(item, data);
    window.mountButtonBlock?.(item);
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
    payload.imageCropShape = normalizeImageCropShape(item.dataset.imageCropShape);
    payload.imageFrameStyle = normalizeImageFrameStyle(item.dataset.imageFrameStyle);
    return payload;
  }

  if (type === "table") {
    payload.tableHTML = serializeCanvasTableHTML(item);
    return payload;
  }

  if (type === "button") {
    payload.buttonConfig = item.dataset.buttonConfig || "{}";
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
    ensureFrameTypingLine(block);
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

  ensureFrameTypingLine(block);
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

  if (type === "button") {
    requestAnimationFrame(() => window.mountButtonBlock?.(item));
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

  ensureFrameTypingLine(containerBlock);

  return item;
}

function removeFrameItem(item) {
  if (!item) return;

  const containerBlock = item.closest('.block[data-type="container"]');
  const wasSelected = selectedBlock === item;
  item.remove();

  if (containerBlock) syncContainerInsertPrompt(containerBlock);
  if (wasSelected) clearSelection();

  if (containerBlock) ensureFrameTypingLine(containerBlock);
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
  ensureFrameTypingLine(containerBlock);
  if (sourceBlock && sourceBlock !== containerBlock) ensureFrameTypingLine(sourceBlock);

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
    buttonConfig: itemData.buttonConfig || "",
    imageCropShape: itemData.imageCropShape || "original",
    imageFrameStyle: itemData.imageFrameStyle || "none",
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

  if (sourceBlock) {
    ensureFrameTypingLine(sourceBlock);
    syncContainerInsertPrompt(sourceBlock);
  }

  if (sourceBlock && typeof autoGrowBlock === "function") autoGrowBlock(sourceBlock);
  if (typeof autoGrowBlock === "function" && block.dataset.type !== "page" && block.dataset.type !== "domain") {
    autoGrowBlock(block);
  }
  if (block.dataset.type === "button") {
    requestAnimationFrame(() => window.mountButtonBlock?.(block));
  }
  if (typeof expandGrid === "function") expandGrid();

  return block;
}

function getFrameDropTypeForBlock(block) {
  const type = block?.dataset?.type || "";

  if (type === "text" || type === "list") return "text";
  if (type === "image" || type === "button" || type === "page" || type === "domain" || isDividerType(type) || type === "table") return type;

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
      bg: "",
      borderColor: "",
      textColor: serialized.textColor || "",
      padding: serialized.padding || "",
      radius: serialized.radius || "",
      imageCropShape: serialized.imageCropShape || "original",
      imageFrameStyle: serialized.imageFrameStyle || "none"
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

  if (nextType === "button") {
    return {
      type: "button",
      buttonConfig: serialized.buttonConfig || "{}",
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

  if (type === "table" || type === "container" || isDividerType(type)) {
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
  delete block.dataset.imageCropShape;
  delete block.dataset.imageFrameStyle;
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
  delete block.dataset.dataCalloutShowIcon;
  delete block.dataset.dataCalloutIcon;
  delete block.dataset.dataCalloutShowProjectImage;
  delete block.dataset.dataCalloutProjectImageLayout;
  delete block.dataset.dataCalloutProjectImageSize;
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
  delete block.dataset.flashcardsConfig;
  delete block.dataset.typingDrillConfig;
  delete block.dataset.fillBlankConfig;
  delete block.dataset.matchPairsConfig;
  delete block.dataset.studyDashboardConfig;
  delete block.dataset.studySessionId;
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
  if (nextType === "container") focusTarget = block.querySelector(".frame-item-text-content");
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

  if (nextType === "flashcards") {
    window.mountFlashcardDeckBlock?.(block, { openPicker: !!options.openFlashcardPicker });
  }

  if (nextType === "typing-drill") {
    window.mountTypingDrillBlock?.(block, { openPicker: !!options.openTypingDrillPicker });
  }

  if (nextType === "fill-blank") {
    window.mountFillBlankBlock?.(block, { openPicker: !!options.openFillBlankPicker });
  }

  if (nextType === "match-pairs") {
    window.mountMatchPairsBlock?.(block, { openPicker: !!options.openMatchPairsPicker });
  }

  if (["session-progress", "daily-streak", "recent-answers"].includes(nextType)) {
    window.mountStudyDashboardBlock?.(block);
  }

  if (nextType === "button") {
    window.mountButtonBlock?.(block, { openPicker: !!options.openButtonPicker });
  }

  if (options.openImagePicker) {
    promptImageUploadForBlock(block);
  }

  return block;
}

window.convertCanvasBlockType = convertCanvasBlockType;
window.promptImageUploadForBlock = promptImageUploadForBlock;

function makeBlockHTML(type = "text") {
  if (type === "button") {
    return `
      <div class="button-block-shell"></div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

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

  if (type === "flashcards") {
    return `
      <div class="flashcard-deck-shell" data-template="basic" data-surface="blank" data-show-back="0">
        <div class="flashcard-deck-head">
          <div class="flashcard-deck-head-copy">
            <span class="flashcard-deck-title">Flashcard Deck</span>
            <span class="flashcard-deck-count">0 cards</span>
          </div>
          <button type="button" class="flashcard-deck-config-btn" data-flashcards-action="configure" title="Configure">⚙</button>
        </div>
        <div class="flashcard-deck-stage" data-flashcards-action="flip">
          <div class="flashcard-card">
            <div class="flashcard-card-inner">
              <div class="flashcard-card-face flashcard-card-front">
                <div class="flashcard-card-media" hidden>
                  <img class="flashcard-card-image" alt="" draggable="false">
                </div>
                <div class="flashcard-card-kicker">Front</div>
                <div class="flashcard-card-title">Untitled</div>
                <div class="flashcard-card-body">Add a card to get started.</div>
              </div>
              <div class="flashcard-card-face flashcard-card-back">
                <div class="flashcard-card-media" hidden>
                  <img class="flashcard-card-image" alt="" draggable="false">
                </div>
                <div class="flashcard-card-kicker">Back</div>
                <div class="flashcard-card-title">Answer</div>
                <div class="flashcard-card-body">Flip to review the other side.</div>
              </div>
            </div>
          </div>
        </div>
        <div class="flashcard-deck-footer">
          <button type="button" class="flashcard-deck-nav-btn" data-flashcards-action="prev">‹</button>
          <span class="flashcard-deck-position">0 / 0</span>
          <button type="button" class="flashcard-deck-nav-btn" data-flashcards-action="next">›</button>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "typing-drill") {
    return `
      <div class="typing-drill-shell">
        <div class="typing-drill-topbar">
          <div class="typing-drill-title-wrap">
            <span class="typing-drill-title">Typing Drill</span>
            <span class="typing-drill-count">0 items</span>
          </div>
          <div class="typing-drill-score" aria-live="polite">0 / 0</div>
          <div class="typing-drill-chips">
            <span class="typing-drill-chip" data-typing-drill-chip="database">No database</span>
            <span class="typing-drill-chip" data-typing-drill-chip="filter">All</span>
          </div>
          <button type="button" class="typing-drill-config-btn" data-typing-drill-action="configure" title="Configure">⚙</button>
        </div>
        <div class="typing-drill-body">
          <div class="typing-drill-prompt-label">Prompt</div>
          <div class="typing-drill-prompt">Choose a database and fields to start.</div>
          <div class="typing-drill-extra" hidden></div>
          <label class="typing-drill-answer-field">
            <span>Type answer</span>
            <input type="text" data-typing-drill-input="answer" autocomplete="off" spellcheck="false" />
          </label>
          <div class="typing-drill-status" hidden></div>
          <div class="typing-drill-hint" hidden></div>
          <div class="typing-drill-actions">
            <button type="button" data-typing-drill-action="back">Back</button>
            <button type="button" data-typing-drill-action="check">Check</button>
            <button type="button" data-typing-drill-action="hint">Hint</button>
            <button type="button" data-typing-drill-action="skip">Skip</button>
            <button type="button" data-typing-drill-action="reset">Reset</button>
          </div>
          <div class="typing-drill-result" hidden>
            <div class="typing-drill-result-label">Correct answer</div>
            <div class="typing-drill-correct-answer"></div>
            <div class="typing-drill-result-note"></div>
          </div>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "fill-blank") {
    return `
      <div class="typing-drill-shell fill-blank-shell">
        <div class="typing-drill-topbar">
          <div class="typing-drill-title-wrap">
            <span class="typing-drill-title">Fill-in-the-Blank</span>
            <span class="typing-drill-count">0 items</span>
          </div>
          <div class="typing-drill-score" aria-live="polite">0 / 0</div>
          <div class="typing-drill-chips">
            <span class="typing-drill-chip" data-fill-blank-chip="database">No database</span>
            <span class="typing-drill-chip" data-fill-blank-chip="filter">All rows</span>
          </div>
          <button type="button" class="typing-drill-config-btn" data-fill-blank-action="configure" title="Configure">⚙</button>
        </div>
        <div class="typing-drill-body">
          <div class="typing-drill-prompt-label">Prompt</div>
          <div class="fill-blank-prompt">Choose a database and fields to start.</div>
          <div class="typing-drill-extra" hidden></div>
          <div class="typing-drill-status" hidden></div>
          <div class="typing-drill-hint" hidden></div>
          <div class="typing-drill-actions">
            <button type="button" data-fill-blank-action="back">Back</button>
            <button type="button" data-fill-blank-action="check">Check</button>
            <button type="button" data-fill-blank-action="hint">Hint</button>
            <button type="button" data-fill-blank-action="skip">Skip</button>
            <button type="button" data-fill-blank-action="reset">Reset</button>
          </div>
          <div class="typing-drill-result" hidden>
            <div class="typing-drill-result-label">Correct answer</div>
            <div class="typing-drill-correct-answer"></div>
            <div class="typing-drill-result-note"></div>
          </div>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "match-pairs") {
    return `
      <div class="match-pairs-shell">
        <div class="match-pairs-topbar">
          <div class="match-pairs-title-wrap">
            <span class="match-pairs-title">Match Pairs</span>
            <span class="match-pairs-count">0 / 0</span>
          </div>
          <span class="match-pairs-progress">0 / 0</span>
          <div class="match-pairs-chips">
            <span class="match-pairs-chip" data-match-pairs-chip="database">No database</span>
            <span class="match-pairs-chip" data-match-pairs-chip="filter">All rows</span>
          </div>
          <button type="button" class="match-pairs-config-btn" data-match-pairs-action="configure" title="Configure">⚙</button>
        </div>
        <div class="match-pairs-mode-switch" hidden></div>
        <div class="match-pairs-instruction">Match each item with its pair.</div>
        <div class="match-pairs-stage"></div>
        <div class="match-pairs-status" hidden></div>
        <div class="match-pairs-actions">
          <button type="button" data-match-pairs-action="reset">Reset</button>
          <button type="button" data-match-pairs-action="hint">Hint</button>
          <button type="button" data-match-pairs-action="skip">Skip</button>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "session-progress") {
    return `
      <div class="study-widget-shell session-progress-widget">
        <div class="study-widget-head">
          <span class="study-widget-title">Session Progress</span>
          <button type="button" class="study-widget-config-btn" data-study-widget-action="configure" title="Configure">⚙</button>
        </div>
        <div class="study-progress-body">
          <div class="study-progress-ring"><span class="study-progress-ring-value">0%</span><span class="study-progress-ring-label">Correct</span></div>
          <div class="study-progress-stats">
            <span><i class="ok"></i><strong data-study-progress="correct">0</strong> Correct</span>
            <span><i class="bad"></i><strong data-study-progress="incorrect">0</strong> Incorrect</span>
            <span><i class="left"></i><strong data-study-progress="remaining">0</strong> Remaining</span>
          </div>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "daily-streak") {
    return `
      <div class="study-widget-shell daily-streak-widget">
        <div class="study-widget-head">
          <span class="study-widget-title">Current Streak</span>
          <button type="button" class="study-widget-config-btn" data-study-widget-action="configure" title="Configure">⚙</button>
        </div>
        <div class="daily-streak-body">
          <div class="daily-streak-count"><span class="daily-streak-number">0</span><span class="daily-streak-days">day streak</span></div>
          <div class="daily-streak-dots"></div>
        </div>
      </div>
      <div class="block-resize-handle" title="Resize"></div>
    `;
  }

  if (type === "recent-answers") {
    return `
      <div class="study-widget-shell recent-answers-widget">
        <div class="study-widget-head">
          <span class="study-widget-title">Recent Answers</span>
          <button type="button" class="study-widget-config-btn" data-study-widget-action="configure" title="Configure">⚙</button>
        </div>
        <div class="recent-answers-list"></div>
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
  return [
    "current-date",
    "current-time",
    "page-activity",
    "domain-last-opened-projects",
    "domain-project-count",
    "domain-note-count",
    "scope-last-opened-items",
    "scope-project-count",
    "scope-note-count",
    "inbox-question-count"
  ].includes(safe) ? safe : "current-date";
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

  if (systemKey === "domain-last-opened-projects" || systemKey === "scope-last-opened-items") {
    return ["1", "2", "3", "4", "5"].includes(safe) ? safe : "3";
  }

  if (systemKey === "domain-project-count" || systemKey === "domain-note-count" || systemKey === "scope-project-count" || systemKey === "scope-note-count" || systemKey === "inbox-question-count") {
    return "count";
  }

  return ["short", "long"].includes(safe) ? safe : "short";
}

function getDefaultDataCalloutLabel(config = {}) {
  const sourceType = normalizeDataCalloutSourceType(config.sourceType || "database");
  const systemKey = normalizeDataCalloutSystemKey(config.systemKey || "current-date");

  if (sourceType !== "system") return "Value";
  if (systemKey === "current-time") return "Current time";
  if (systemKey === "page-activity") return "Time on page";
  if (systemKey === "domain-last-opened-projects") return "Last opened";
  if (systemKey === "domain-project-count") return "Projects";
  if (systemKey === "domain-note-count") return "Notes";
  if (systemKey === "scope-last-opened-items") return "Last opened";
  if (systemKey === "scope-project-count") return "Projects";
  if (systemKey === "scope-note-count") return "Notes";
  if (systemKey === "inbox-question-count") return "Inbox";
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

function getPageActivityLastOpenedTime(pageId = "") {
  const safePageId = String(pageId || "").trim();
  if (!safePageId) return 0;
  const all = readPageActivityData();
  const entry = normalizePageActivityEntry(all[safePageId]);
  const date = new Date(entry.lastOpenedAt || "");
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getDataCalloutAllDomains() {
  return Array.isArray(window.userDomains) ? window.userDomains : [];
}

function getDataCalloutAllPages() {
  return Array.isArray(window.userPages) ? window.userPages : [];
}

function getDataCalloutDomainForTarget(targetPageId = "") {
  const safeTargetId = String(targetPageId || "").trim();
  const domains = getDataCalloutAllDomains();
  const pages = getDataCalloutAllPages();
  const domainIds = new Set(domains.map((domain) => domain?.id).filter(Boolean));

  if (domainIds.has(safeTargetId)) {
    return domains.find((domain) => domain.id === safeTargetId) || null;
  }

  const byId = new Map(pages.map((page) => [page.id, page]));
  let cursor = byId.get(safeTargetId) || null;
  const visited = new Set();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (domainIds.has(cursor.parent)) {
      return domains.find((domain) => domain.id === cursor.parent) || null;
    }
    cursor = byId.get(cursor.parent) || null;
  }

  return null;
}

function getDataCalloutDomainDescendants(domainId = "") {
  const safeDomainId = String(domainId || "").trim();
  if (!safeDomainId) return [];

  const pages = getDataCalloutAllPages().filter((page) => page?.hiddenInSidebar !== true || page?.containerType === "database-row");
  const childrenByParent = new Map();
  pages.forEach((page) => {
    if (!childrenByParent.has(page.parent)) childrenByParent.set(page.parent, []);
    childrenByParent.get(page.parent).push(page);
  });

  const results = [];
  const visited = new Set();
  const walk = (parentId) => {
    (childrenByParent.get(parentId) || []).forEach((page) => {
      if (!page?.id || visited.has(page.id)) return;
      visited.add(page.id);
      results.push(page);
      walk(page.id);
    });
  };

  walk(safeDomainId);
  return results;
}

function getDataCalloutScopeForTarget(targetPageId = "") {
  const safeTargetId = String(targetPageId || "").trim();
  const domains = getDataCalloutAllDomains();
  const pages = getDataCalloutAllPages();
  const domain = domains.find((entry) => entry?.id === safeTargetId) || null;
  if (domain) {
    return {
      page: domain,
      id: domain.id,
      title: domain.title || "Untitled domain",
      kind: "domain",
      descendants: getDataCalloutDomainDescendants(domain.id)
    };
  }

  const page = pages.find((entry) => entry?.id === safeTargetId) || null;
  if (page) {
    return {
      page,
      id: page.id,
      title: page.title || "Untitled page",
      kind: page.containerType || page.category || "page",
      descendants: getDataCalloutDomainDescendants(page.id)
    };
  }

  return null;
}

function getDataCalloutProjectImage(project = {}) {
  if (!project?.id) return "";
  const rowPeekData = typeof window.getDatabaseRowPeekData === "function"
    ? window.getDatabaseRowPeekData(project.id)
    : null;
  if (rowPeekData?.coverSource) return rowPeekData.coverSource;

  if (typeof getLinkedPageCardImageSource === "function" && typeof getPageSettings === "function") {
    const linkedImage = getLinkedPageCardImageSource(project.id);
    if (linkedImage) return linkedImage;
  }

  const allBlocks = typeof window.readAllPageBlocks === "function" ? window.readAllPageBlocks() : {};
  for (const blocks of Object.values(allBlocks || {})) {
    if (!Array.isArray(blocks)) continue;
    const card = blocks.find((block) => (
      (block?.type === "page" || block?.type === "domain")
      && block?.linkedPageId === project.id
      && typeof block?.pageCardImageSrc === "string"
      && block.pageCardImageSrc.trim()
    ));
    if (card) return card.pageCardImageSrc.trim();
  }

  return "";
}

function getDataCalloutItemTitle(item = {}, fallback = "Untitled") {
  if (!item?.id) return String(item?.title || fallback).trim() || fallback;
  const rowPeekData = typeof window.getDatabaseRowPeekData === "function"
    ? window.getDatabaseRowPeekData(item.id)
    : null;
  return String(rowPeekData?.title || item.title || fallback).trim() || fallback;
}

function normalizeDataCalloutImageLayout(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "top" ? "top" : "side";
}

function normalizeDataCalloutImageSize(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["sm", "md", "lg", "xl", "xxl"].includes(safe) ? safe : "md";
}

function renderDataCalloutLastOpenedItems(items = [], config = {}, fallbackTitle = "Untitled") {
  const limit = Math.max(1, Math.min(5, Number(config.systemFormat) || items.length || 1));
  const showImages = !!config.showProjectImage && limit <= 3;
  const imageLayout = normalizeDataCalloutImageLayout(config.projectImageLayout || "side");
  const imageSize = normalizeDataCalloutImageSize(config.projectImageSize || "md");

  if (showImages) {
    const layoutClass = imageLayout === "top" ? " top-image" : "";
    return `
      <span class="data-callout-project-card-list image-size-${escapeDataCalloutHTML(imageSize)}${layoutClass}">
        ${items.map((item) => {
          const title = getDataCalloutItemTitle(item, fallbackTitle);
          const image = getDataCalloutProjectImage(item);
          return `
            <button type="button" class="data-callout-project-single" data-has-image="${image ? "true" : "false"}" data-callout-open-page="${escapeDataCalloutHTML(item.id)}">
              ${image ? `<img src="${escapeDataCalloutHTML(image)}" alt="" />` : ""}
              <span>
                <strong>${escapeDataCalloutHTML(title)}</strong>
                <small>${escapeDataCalloutHTML(getPageActivityLastOpenedLabel(item.id))}</small>
              </span>
            </button>
          `;
        }).join("")}
      </span>
    `;
  }

  return `
    <span class="data-callout-project-list">
      ${items.map((item) => {
        const title = getDataCalloutItemTitle(item, fallbackTitle);
        return `
          <button type="button" class="data-callout-project-row" data-callout-open-page="${escapeDataCalloutHTML(item.id)}">
            <strong>${escapeDataCalloutHTML(title)}</strong>
            <small>${escapeDataCalloutHTML(getPageActivityLastOpenedLabel(item.id))}</small>
          </button>
        `;
      }).join("")}
    </span>
  `;
}

function computeDomainCalloutTarget(config = {}) {
  const targetPageId = resolveDataCalloutTargetPageId(config);
  const domain = getDataCalloutDomainForTarget(targetPageId);
  if (!domain) {
    return {
      domain: null,
      descendants: [],
      configured: false,
      valueText: "—"
    };
  }

  return {
    domain,
    descendants: getDataCalloutDomainDescendants(domain.id),
    configured: true
  };
}

function computeScopeCalloutTarget(config = {}) {
  const targetPageId = resolveDataCalloutTargetPageId(config);
  const scope = getDataCalloutScopeForTarget(targetPageId);
  if (!scope) {
    return {
      scope: null,
      descendants: [],
      configured: false,
      valueText: "\u2014"
    };
  }

  return {
    scope,
    descendants: scope.descendants || [],
    configured: true
  };
}

function computeDomainLastOpenedProjectsCallout(config = {}) {
  const context = computeDomainCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "—",
      subline: "Choose a domain target.",
      configured: false
    };
  }

  const limit = Math.max(1, Math.min(5, Number(config.systemFormat) || 3));
  const projects = context.descendants
    .filter((page) => page?.containerType === "project")
    .map((page) => ({
      ...page,
      lastOpenedAt: getPageActivityLastOpenedTime(page.id)
    }))
    .filter((page) => page.lastOpenedAt > 0)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, limit);

  if (!projects.length) {
    return {
      valueText: "None",
      subline: `No opened projects in ${context.domain.title || "this domain"} yet.`,
      configured: true
    };
  }

  if (limit === 1) {
    const project = projects[0];
    return {
      valueText: getDataCalloutItemTitle(project, "Untitled project"),
      html: renderDataCalloutLastOpenedItems([project], config, "Untitled project"),
      configured: true
    };
  }

  return {
    valueText: `${projects.length}`,
    html: renderDataCalloutLastOpenedItems(projects, config, "Untitled project"),
    configured: true
  };
}

function computeDomainProjectCountCallout(config = {}) {
  const context = computeDomainCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "—",
      subline: "Choose a domain target.",
      configured: false
    };
  }

  return {
    valueText: formatDataCalloutNumber(context.descendants.filter((page) => page?.containerType === "project").length),
    configured: true
  };
}

function computeDomainNoteCountCallout(config = {}) {
  const context = computeDomainCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "—",
      subline: "Choose a domain target.",
      configured: false
    };
  }

  const attachedIds = new Set([context.domain.id, ...context.descendants.map((page) => page.id)]);
  const notes = typeof window.readStorageJSON === "function"
    ? window.readStorageJSON(window.STORAGE_KEYS?.notesVault || "sanctum_notes_vault_v1", [])
    : [];
  const count = Array.isArray(notes)
    ? notes.filter((note) => {
      if (note?.archived) return false;
      const ids = [
        note.contextPageId,
        ...(Array.isArray(note.directPageIds) ? note.directPageIds : []),
        ...(Array.isArray(note.contextBreadcrumbIds) ? note.contextBreadcrumbIds : [])
      ].filter(Boolean);
      return ids.some((id) => attachedIds.has(id));
    }).length
    : 0;

  return {
    valueText: formatDataCalloutNumber(count),
    configured: true
  };
}

function computeScopeLastOpenedItemsCallout(config = {}) {
  const context = computeScopeCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "\u2014",
      subline: "Choose a scope target.",
      configured: false
    };
  }

  const limit = Math.max(1, Math.min(5, Number(config.systemFormat) || 3));
  const items = context.descendants
    .filter((page) => page?.id && (page?.hiddenInSidebar !== true || page?.containerType === "database-row"))
    .map((page) => ({
      ...page,
      lastOpenedAt: getPageActivityLastOpenedTime(page.id)
    }))
    .filter((page) => page.lastOpenedAt > 0)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, limit);

  if (!items.length) {
    return {
      valueText: "None",
      subline: `No opened items in ${context.scope.title || "this scope"} yet.`,
      configured: true
    };
  }

  if (limit === 1) {
    const item = items[0];
    return {
      valueText: getDataCalloutItemTitle(item, "Untitled"),
      html: renderDataCalloutLastOpenedItems([item], config, "Untitled"),
      configured: true
    };
  }

  return {
    valueText: `${items.length}`,
    html: renderDataCalloutLastOpenedItems(items, config, "Untitled"),
    configured: true
  };
}

function computeScopeProjectCountCallout(config = {}) {
  const context = computeScopeCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "\u2014",
      subline: "Choose a scope target.",
      configured: false
    };
  }

  return {
    valueText: formatDataCalloutNumber(context.descendants.filter((page) => page?.containerType === "project").length),
    configured: true
  };
}

function computeScopeNoteCountCallout(config = {}) {
  const context = computeScopeCalloutTarget(config);
  if (!context.configured) {
    return {
      valueText: "\u2014",
      subline: "Choose a scope target.",
      configured: false
    };
  }

  const attachedIds = new Set([context.scope.id, ...context.descendants.map((page) => page.id)]);
  const notes = typeof window.readStorageJSON === "function"
    ? window.readStorageJSON(window.STORAGE_KEYS?.notesVault || "sanctum_notes_vault_v1", [])
    : [];
  const count = Array.isArray(notes)
    ? notes.filter((note) => {
      if (note?.archived) return false;
      const ids = [
        note.contextPageId,
        ...(Array.isArray(note.directPageIds) ? note.directPageIds : []),
        ...(Array.isArray(note.contextBreadcrumbIds) ? note.contextBreadcrumbIds : [])
      ].filter(Boolean);
      return ids.some((id) => attachedIds.has(id));
    }).length
    : 0;

  return {
    valueText: formatDataCalloutNumber(count),
    configured: true
  };
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

function normalizeDataCalloutShowIcon(value = "") {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeDataCalloutShowProjectImage(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  if (safe === "false" || safe === "0" || safe === "off") return false;
  return true;
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
    labelPos: normalizeDataCalloutLabelPos(raw?.labelPos || "below"),
    showIcon: normalizeDataCalloutShowIcon(raw?.showIcon || ""),
    icon: String(raw?.icon || "").trim(),
    showProjectImage: normalizeDataCalloutShowProjectImage(raw?.showProjectImage ?? "true"),
    projectImageLayout: normalizeDataCalloutImageLayout(raw?.projectImageLayout || "side"),
    projectImageSize: normalizeDataCalloutImageSize(raw?.projectImageSize || "md")
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
    labelPos: block.dataset.dataCalloutLabelPos || "below",
    showIcon: block.dataset.dataCalloutShowIcon || "",
    icon: block.dataset.dataCalloutIcon || "",
    showProjectImage: block.dataset.dataCalloutShowProjectImage || "true",
    projectImageLayout: block.dataset.dataCalloutProjectImageLayout || "side",
    projectImageSize: block.dataset.dataCalloutProjectImageSize || "md"
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
  block.dataset.dataCalloutShowIcon = normalized.showIcon ? "true" : "false";
  block.dataset.dataCalloutIcon = normalized.icon;
  block.dataset.dataCalloutShowProjectImage = normalized.showProjectImage ? "true" : "false";
  block.dataset.dataCalloutProjectImageLayout = normalized.projectImageLayout;
  block.dataset.dataCalloutProjectImageSize = normalized.projectImageSize;
}

function ensureDataCalloutStructure(block) {
  if (!block || block.dataset.type !== "data-callout") return null;
  const shellEl = block.querySelector(".data-callout-shell");
  if (!shellEl) return null;

  let iconEl = shellEl.querySelector(".data-callout-icon");
  if (!iconEl) {
    iconEl = document.createElement("span");
    iconEl.className = "data-callout-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.textContent = "✦";
    shellEl.insertBefore(iconEl, shellEl.firstChild);
  }

  let contentEl = shellEl.querySelector(".data-callout-content");
  if (!contentEl) {
    contentEl = document.createElement("div");
    contentEl.className = "data-callout-content";
    const valueEl = shellEl.querySelector(".data-callout-value");
    const labelEl = shellEl.querySelector(".data-callout-label");
    if (valueEl) contentEl.appendChild(valueEl);
    if (labelEl) contentEl.appendChild(labelEl);
    const configBtn = shellEl.querySelector(".data-callout-config-btn");
    shellEl.insertBefore(contentEl, configBtn || null);
  }

  return {
    shellEl,
    iconEl,
    contentEl,
    valueEl: contentEl.querySelector(".data-callout-value"),
    labelEl: contentEl.querySelector(".data-callout-label")
  };
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

  if (systemKey === "domain-last-opened-projects" || systemKey === "scope-last-opened-items") {
    return [
      { value: "1", label: "Single item" },
      { value: "2", label: "Last 2 items" },
      { value: "3", label: "Last 3 items" },
      { value: "4", label: "Last 4 items" },
      { value: "5", label: "Last 5 items" }
    ];
  }

  if (systemKey === "domain-project-count" || systemKey === "domain-note-count" || systemKey === "scope-project-count" || systemKey === "scope-note-count" || systemKey === "inbox-question-count") {
    return [
      { value: "count", label: "Count" }
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

  if (config.systemKey === "domain-last-opened-projects") {
    return computeDomainLastOpenedProjectsCallout(config);
  }

  if (config.systemKey === "domain-project-count") {
    return computeDomainProjectCountCallout(config);
  }

  if (config.systemKey === "domain-note-count") {
    return computeDomainNoteCountCallout(config);
  }

  if (config.systemKey === "scope-last-opened-items") {
    return computeScopeLastOpenedItemsCallout(config);
  }

  if (config.systemKey === "scope-project-count") {
    return computeScopeProjectCountCallout(config);
  }

  if (config.systemKey === "scope-note-count") {
    return computeScopeNoteCountCallout(config);
  }

  if (config.systemKey === "inbox-question-count") {
    return computeInboxQuestionCountCallout();
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

  const refs = ensureDataCalloutStructure(block);
  if (!refs?.labelEl || !refs?.valueEl || !refs?.shellEl || !refs?.iconEl) return;
  const valueEl = refs.valueEl;

  const config = readDataCalloutConfig(block);
  const result = config.sourceType === "system"
    ? computeSystemDataCalloutValue(config)
    : computeDataCalloutValue(getDataCalloutSourcePayload(config), config);

  refs.labelEl.textContent = config.label || getDefaultDataCalloutLabel(config);
  if (result.configured && result.html) {
    valueEl.innerHTML = result.html;
    valueEl.querySelectorAll("[data-callout-open-page]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pageId = button.dataset.calloutOpenPage || "";
        if (pageId && typeof window.openPage === "function") window.openPage(pageId);
      });
    });
  } else {
    valueEl.textContent = result.configured ? result.valueText : "—";
  }
  refs.iconEl.textContent = config.icon || "✦";
  refs.iconEl.hidden = !config.showIcon;
  refs.shellEl.classList.toggle("is-configured", !!result.configured);
  refs.shellEl.dataset.sourceType = config.sourceType;
  refs.shellEl.dataset.align = config.align;
  refs.shellEl.dataset.size = config.size;
  refs.shellEl.dataset.labelPos = config.labelPos;
  refs.shellEl.dataset.showIcon = config.showIcon ? "true" : "false";
}

function renderVisibleDataCalloutBlocks() {
  document.querySelectorAll('.block[data-type="data-callout"]').forEach((block) => {
    renderDataCalloutBlock(block);
  });
}

window.refreshDataCalloutBlocks = renderVisibleDataCalloutBlocks;

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
          <option value="domain-last-opened-projects">Domain: last opened projects</option>
          <option value="domain-project-count">Domain: project count</option>
          <option value="domain-note-count">Domain: note count</option>
          <option value="scope-last-opened-items">Scope: last opened items</option>
          <option value="scope-project-count">Scope: project count</option>
          <option value="scope-note-count">Scope: note count</option>
          <option value="inbox-question-count">Inbox: pending questions</option>
        </select>
      </label>
      <label class="data-callout-picker-field" data-callout-system-target-wrap hidden>
        <span>Target</span>
        <select data-callout-input="systemTarget"></select>
      </label>
    <label class="data-callout-picker-field">
      <span>Format</span>
      <select data-callout-input="systemFormat"></select>
    </label>
      <label class="data-callout-picker-field" data-callout-project-image-wrap hidden>
        <span>Item image</span>
        <select data-callout-input="showProjectImage">
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </label>
      <label class="data-callout-picker-field" data-callout-project-image-layout-wrap hidden>
        <span>Image placement</span>
        <select data-callout-input="projectImageLayout">
          <option value="side">Left side</option>
          <option value="top">Image on top</option>
        </select>
      </label>
      <label class="data-callout-picker-field" data-callout-project-image-size-wrap hidden>
        <span>Image size</span>
        <select data-callout-input="projectImageSize">
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
          <option value="xl">XL</option>
          <option value="xxl">XXL</option>
        </select>
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
    <label class="data-callout-picker-field">
      <span>Show icon</span>
      <select data-callout-input="showIcon">
        <option value="false">Off</option>
        <option value="true">On</option>
      </select>
    </label>
    <label class="data-callout-picker-field">
      <span>Icon</span>
      <input type="text" data-callout-input="icon" maxlength="8" placeholder="✦" />
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
  const projectImageWrap = picker.querySelector('[data-callout-project-image-wrap]');
  const showProjectImageSelect = picker.querySelector('[data-callout-input="showProjectImage"]');
  const projectImageLayoutWrap = picker.querySelector('[data-callout-project-image-layout-wrap]');
  const projectImageLayoutSelect = picker.querySelector('[data-callout-input="projectImageLayout"]');
  const projectImageSizeWrap = picker.querySelector('[data-callout-project-image-size-wrap]');
  const projectImageSizeSelect = picker.querySelector('[data-callout-input="projectImageSize"]');
  const alignSelect = picker.querySelector('[data-callout-input="align"]');
  const sizeSelect = picker.querySelector('[data-callout-input="size"]');
  const labelPosSelect = picker.querySelector('[data-callout-input="labelPos"]');
  const showIconSelect = picker.querySelector('[data-callout-input="showIcon"]');
  const iconInput = picker.querySelector('[data-callout-input="icon"]');
  const saveBtn = picker.querySelector('[data-callout-action="save"]');
  const clearBtn = picker.querySelector('[data-callout-action="clear"]');

  if (!labelInput || !sourceTypeSelect || !databaseWrap || !sourceSelect || !propertySelect || !modeSelect || !rowSelect || !rowWrap || !systemWrap || !systemKeySelect || !systemTargetWrap || !systemTargetSelect || !systemFormatSelect || !projectImageWrap || !showProjectImageSelect || !projectImageLayoutWrap || !projectImageLayoutSelect || !projectImageSizeWrap || !projectImageSizeSelect || !showIconSelect || !iconInput || !saveBtn || !clearBtn) {
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
  showIconSelect.value = config.showIcon ? "true" : "false";
  showProjectImageSelect.value = config.showProjectImage ? "true" : "false";
  projectImageLayoutSelect.value = normalizeDataCalloutImageLayout(config.projectImageLayout || "side");
  projectImageSizeSelect.value = normalizeDataCalloutImageSize(config.projectImageSize || "md");
  iconInput.value = config.icon || "";

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

  const syncIconInputs = () => {
    const isEnabled = showIconSelect.value === "true";
    iconInput.disabled = !isEnabled;
    if (!isEnabled) {
      iconInput.blur();
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
    const isLastOpened = systemKey === "domain-last-opened-projects" || systemKey === "scope-last-opened-items";
    const imageEligible = isLastOpened && Number(systemFormatSelect.value || 0) <= 3;
    projectImageWrap.hidden = !imageEligible;
    showProjectImageSelect.disabled = !imageEligible;
    const imageControlsEnabled = imageEligible && showProjectImageSelect.value !== "false";
    projectImageLayoutWrap.hidden = !imageControlsEnabled;
    projectImageLayoutSelect.disabled = !imageControlsEnabled;
    projectImageSizeWrap.hidden = !imageControlsEnabled;
    projectImageSizeSelect.disabled = !imageControlsEnabled;
    const shouldShowTarget = systemKey === "page-activity"
      || systemKey === "domain-last-opened-projects"
      || systemKey === "domain-project-count"
      || systemKey === "domain-note-count"
      || systemKey === "scope-last-opened-items"
      || systemKey === "scope-project-count"
      || systemKey === "scope-note-count";
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
  systemFormatSelect.addEventListener("change", refreshSystemOptions);
  showProjectImageSelect.addEventListener("change", refreshSystemOptions);
  showIconSelect.addEventListener("change", syncIconInputs);

  refreshDependentOptions();
  fillSystemTargetOptions(config.systemTargetKind === "page" && config.systemTargetPageId
    ? `page|${config.systemTargetPageId}`
    : "current|");
  fillSystemFormatOptions(systemKeySelect.value, config.systemFormat || "");
  syncPickerSections();
  syncIconInputs();

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
        systemTargetKind: (
          systemKey === "page-activity"
          || systemKey === "domain-last-opened-projects"
          || systemKey === "domain-project-count"
          || systemKey === "domain-note-count"
          || systemKey === "scope-last-opened-items"
          || systemKey === "scope-project-count"
          || systemKey === "scope-note-count"
        ) ? targetInfo.targetKind : "current",
        systemTargetPageId: (
          systemKey === "page-activity"
          || systemKey === "domain-last-opened-projects"
          || systemKey === "domain-project-count"
          || systemKey === "domain-note-count"
          || systemKey === "scope-last-opened-items"
          || systemKey === "scope-project-count"
          || systemKey === "scope-note-count"
        ) && targetInfo.targetKind === "page" ? targetInfo.pageId : "",
        systemFormat: systemFormatSelect.value || "",
        align: alignSelect?.value || "left",
        size: sizeSelect?.value || "md",
        labelPos: labelPosSelect?.value || "below",
        showIcon: showIconSelect.value === "true",
        icon: iconInput.value || "",
        showProjectImage: showProjectImageSelect.value !== "false",
        projectImageLayout: projectImageLayoutSelect.value || "side",
        projectImageSize: projectImageSizeSelect.value || "md"
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
      labelPos: labelPosSelect?.value || "below",
      showIcon: showIconSelect.value === "true",
      icon: iconInput.value || "",
      showProjectImage: showProjectImageSelect.value !== "false",
      projectImageLayout: projectImageLayoutSelect.value || "side",
      projectImageSize: projectImageSizeSelect.value || "md"
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
      labelPos: labelPosSelect?.value || "below",
      showIcon: showIconSelect.value === "true",
      icon: iconInput.value || "",
      showProjectImage: showProjectImageSelect.value !== "false",
      projectImageLayout: projectImageLayoutSelect.value || "side",
      projectImageSize: projectImageSizeSelect.value || "md"
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

function parseFlashcardsJSON(raw, fallback) {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
}

const STUDY_ACTIVITY_STORAGE_KEY = "sanctum.studyActivity.v1";
const STUDY_ACTIVITY_MAX_ITEMS = 2000;

function createStudyActivityId(prefix = "study") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getStudyDayKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function readStudyActivityLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STUDY_ACTIVITY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === "object") : [];
  } catch (_error) {
    return [];
  }
}

function writeStudyActivityLog(items = []) {
  const trimmed = items
    .filter(Boolean)
    .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")))
    .slice(0, STUDY_ACTIVITY_MAX_ITEMS);
  try {
    localStorage.setItem(STUDY_ACTIVITY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (_error) {
    localStorage.setItem(STUDY_ACTIVITY_STORAGE_KEY, JSON.stringify(trimmed.slice(0, 500)));
  }
}

function getBlockStudySessionId(block, reset = false) {
  if (!block) return "";
  if (reset || !block.dataset.studySessionId) {
    block.dataset.studySessionId = createStudyActivityId("session");
  }
  return block.dataset.studySessionId;
}

function createStudyPromptKey(payload = {}) {
  return [
    payload.tool || "",
    payload.rowId || "",
    payload.prompt || "",
    payload.expected || ""
  ].map((part) => String(part || "")).join("|");
}

function markStudyPromptSeen(block, payload = {}) {
  if (!block) return;
  const key = createStudyPromptKey(payload);
  if (!key.trim()) return;
  if (block.dataset.studyPromptKey === key) return;
  block.dataset.studyPromptKey = key;
  block.dataset.studyPromptStartedAt = String(Date.now());
}

function getStudyPromptDuration(block, payload = {}) {
  if (!block) return 0;
  const key = createStudyPromptKey(payload);
  const started = Number(block.dataset.studyPromptStartedAt || 0) || 0;
  if (!started || block.dataset.studyPromptKey !== key) return 0;
  return Math.max(0, Date.now() - started);
}

function getStudyActivitySourceFromConfig(config = {}) {
  return {
    kind: config.sourceKind === "block" ? "block" : "page",
    pageId: String(config.sourcePageId || "").trim(),
    blockId: config.sourceKind === "block" ? String(config.sourceBlockId || "").trim() : ""
  };
}

function getStudyActivitySourceTitle(config = {}) {
  const sourceData = typeof window.getDatabaseCalloutSourceData === "function"
    ? window.getDatabaseCalloutSourceData(getStudyActivitySourceFromConfig(config))
    : null;
  return sourceData?.database?.title || "";
}

function recordStudyActivity(block, config = {}, payload = {}) {
  const now = new Date();
  const entry = {
    id: createStudyActivityId("activity"),
    timestamp: now.toISOString(),
    day: getStudyDayKey(now),
    sessionId: getBlockStudySessionId(block),
    tool: String(payload.tool || block?.dataset?.type || "study"),
    blockId: String(block?.id || ""),
    pageId: typeof window.getCurrentPageId === "function" ? String(window.getCurrentPageId() || "") : "",
    sourceKind: config.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(config.sourcePageId || ""),
    sourceBlockId: config.sourceKind === "block" ? String(config.sourceBlockId || "") : "",
    sourceTitle: String(payload.sourceTitle || getStudyActivitySourceTitle(config) || ""),
    rowId: String(payload.rowId || ""),
    prompt: String(payload.prompt || ""),
    answer: String(payload.answer || ""),
    expected: String(payload.expected || ""),
    result: ["correct", "incorrect", "skipped"].includes(payload.result) ? payload.result : "correct",
    total: Math.max(0, Number(payload.total || 0) || 0),
    durationMs: Math.max(0, Number(payload.durationMs || 0) || 0)
  };
  writeStudyActivityLog([entry, ...readStudyActivityLog()]);
  renderStudyDashboardBlocks();
  window.dispatchEvent(new CustomEvent("sanctum:study-activity", { detail: entry }));
  return entry;
}

function normalizeStudyDashboardConfig(raw = {}, fallbackTitle = "") {
  const scope = ["all", "page", "session"].includes(raw?.scope) ? raw.scope : "all";
  const streakShape = ["pill", "dot", "square"].includes(raw?.streakShape) ? raw.streakShape : "pill";
  const progressStyle = ["ring", "bar"].includes(raw?.progressStyle) ? raw.progressStyle : "ring";
  const recentMarker = ["dot", "bar", "symbol", "none"].includes(raw?.recentMarker) ? raw.recentMarker : "dot";
  return {
    title: String(raw?.title || fallbackTitle || "Study").trim(),
    scope,
    limit: Math.max(3, Math.min(20, Number(raw?.limit || 5) || 5)),
    accentColor: String(raw?.accentColor || "").trim(),
    trackColor: String(raw?.trackColor || "").trim(),
    freezeColor: String(raw?.freezeColor || "").trim(),
    freezesEnabled: raw?.freezesEnabled === true || raw?.freezesEnabled === "true",
    freezeCount: Math.max(0, Math.min(365, Number(raw?.freezeCount || 0) || 0)),
    showHeader: raw?.showHeader !== false,
    streakShape,
    progressStyle,
    recentMarker
  };
}

function readStudyDashboardConfig(block, fallbackTitle = "") {
  return normalizeStudyDashboardConfig(parseFlashcardsJSON(block?.dataset.studyDashboardConfig || "", {}), fallbackTitle);
}

function writeStudyDashboardConfig(block, config, fallbackTitle = "") {
  if (!block) return;
  block.dataset.studyDashboardConfig = JSON.stringify(normalizeStudyDashboardConfig(config, fallbackTitle));
}

function getStudyActivitiesForWidget(block, config = {}) {
  const currentPageId = typeof window.getCurrentPageId === "function" ? String(window.getCurrentPageId() || "") : "";
  const log = readStudyActivityLog();
  if (config.scope === "page") return log.filter((entry) => entry.pageId === currentPageId || entry.sourcePageId === currentPageId);
  if (config.scope === "session") {
    const latest = log[0]?.sessionId || "";
    return latest ? log.filter((entry) => entry.sessionId === latest) : [];
  }
  return log;
}

function computeStudyStreak(entries = []) {
  const days = new Set(entries.map((entry) => entry.day).filter(Boolean));
  let streak = 0;
  const cursor = new Date();
  while (days.has(getStudyDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function addStudyDays(date, offset) {
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return next;
}

function computeStudyStreakState(entries = [], config = {}) {
  const activeDays = new Set(entries.map((entry) => entry.day).filter(Boolean));
  const frozenDays = new Set();
  const today = new Date();
  let cursor = activeDays.has(getStudyDayKey(today)) ? today : addStudyDays(today, -1);
  let freezesLeft = config.freezesEnabled ? Math.max(0, Number(config.freezeCount || 0) || 0) : 0;
  let streak = 0;

  while (true) {
    const key = getStudyDayKey(cursor);
    if (activeDays.has(key)) {
      streak += 1;
    } else if (freezesLeft > 0) {
      freezesLeft -= 1;
      frozenDays.add(key);
    } else {
      break;
    }
    cursor = addStudyDays(cursor, -1);
  }

  return { streak, activeDays, frozenDays };
}

function applyStudyDashboardStyles(block, config = {}) {
  const shell = block?.querySelector(".study-widget-shell");
  if (!shell) return;
  const accent = config.accentColor || "var(--accent)";
  const track = config.trackColor || "color-mix(in srgb, currentColor 16%, transparent)";
  const freeze = config.freezeColor || "color-mix(in srgb, #8dbdff 78%, currentColor)";
  block.style.setProperty("--study-accent", accent);
  block.style.setProperty("--study-track", track);
  block.style.setProperty("--study-freeze", freeze);
  shell.style.setProperty("--study-accent", accent);
  shell.style.setProperty("--study-track", track);
  shell.style.setProperty("--study-freeze", freeze);
  shell.dataset.chrome = config.showHeader ? "shown" : "minimal";
  shell.dataset.streakShape = config.streakShape || "pill";
  shell.dataset.progressStyle = config.progressStyle || "ring";
  shell.dataset.recentMarker = config.recentMarker || "dot";
}

function formatStudyDuration(ms = 0) {
  const value = Math.max(0, Number(ms || 0) || 0);
  if (!value) return "";
  const seconds = Math.max(1, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function renderSessionProgressWidget(block) {
  const config = readStudyDashboardConfig(block, "Session Progress");
  applyStudyDashboardStyles(block, config);
  const entries = getStudyActivitiesForWidget(block, { ...config, scope: config.scope === "all" ? "session" : config.scope });
  const attempted = entries.filter((entry) => entry.result === "correct" || entry.result === "incorrect");
  const correct = attempted.filter((entry) => entry.result === "correct").length;
  const incorrect = attempted.filter((entry) => entry.result === "incorrect").length;
  const skipped = entries.filter((entry) => entry.result === "skipped").length;
  const total = Math.max(...entries.map((entry) => Number(entry.total || 0) || 0), 0);
  const remaining = total ? Math.max(0, total - attempted.length - skipped) : 0;
  const graded = correct + incorrect;
  const percent = graded ? Math.max(0, Math.min(100, Math.round((correct / graded) * 100))) : 0;
  block.querySelector(".study-widget-title").textContent = config.title || "Session Progress";
  block.querySelector(".study-progress-ring")?.style.setProperty("--study-progress", `${percent}%`);
  block.querySelector(".study-progress-ring-value").textContent = `${percent}%`;
  block.querySelector('[data-study-progress="correct"]').textContent = String(correct);
  block.querySelector('[data-study-progress="incorrect"]').textContent = String(incorrect);
  block.querySelector('[data-study-progress="remaining"]').textContent = String(remaining);
}

function renderDailyStreakWidget(block) {
  const config = readStudyDashboardConfig(block, "Current Streak");
  applyStudyDashboardStyles(block, config);
  const entries = getStudyActivitiesForWidget(block, config);
  const { streak, activeDays, frozenDays } = computeStudyStreakState(entries, config);
  block.querySelector(".study-widget-title").textContent = config.title || "Current Streak";
  block.querySelector(".daily-streak-number").textContent = String(streak);
  const dots = block.querySelector(".daily-streak-dots");
  if (dots) {
    const today = new Date();
    dots.innerHTML = Array.from({ length: 7 }, (_item, index) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - index));
      const key = getStudyDayKey(day);
      const active = activeDays.has(key);
      const frozen = frozenDays.has(key);
      return `<span class="${active ? "active" : frozen ? "frozen" : ""}" title="${frozen ? "Freeze used" : active ? "Studied" : "No activity"}"></span>`;
    }).join("");
  }
}

function renderRecentAnswersWidget(block) {
  const config = readStudyDashboardConfig(block, "Recent Answers");
  applyStudyDashboardStyles(block, config);
  const entries = getStudyActivitiesForWidget(block, config).slice(0, config.limit);
  const list = block.querySelector(".recent-answers-list");
  block.querySelector(".study-widget-title").textContent = config.title || "Recent Answers";
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = `<div class="recent-answer-empty">No study answers yet.</div>`;
    return;
  }
  list.innerHTML = entries.map((entry, index) => `
    <div class="recent-answer-row" data-result="${escapeHTML(entry.result)}">
      <span class="recent-answer-index">${index + 1}</span>
      <span class="recent-answer-main"><strong>${escapeHTML(entry.prompt || entry.rowId || "Study item")}</strong><small>${escapeHTML(entry.answer || entry.expected || entry.sourceTitle || entry.tool)}</small></span>
      <span class="recent-answer-mark" title="${escapeHTML(entry.result)}"></span>
      <span class="recent-answer-time">${escapeHTML(formatStudyDuration(entry.durationMs))}</span>
    </div>
  `).join("");
}

function renderStudyDashboardBlock(block) {
  if (!block) return null;
  if (block.dataset.type === "session-progress") renderSessionProgressWidget(block);
  if (block.dataset.type === "daily-streak") renderDailyStreakWidget(block);
  if (block.dataset.type === "recent-answers") renderRecentAnswersWidget(block);
  return block;
}

function renderStudyDashboardBlocks() {
  document.querySelectorAll('.block[data-type="session-progress"], .block[data-type="daily-streak"], .block[data-type="recent-answers"]').forEach((block) => {
    renderStudyDashboardBlock(block);
  });
}

function closeStudyDashboardPicker() {
  document.querySelector(".topbar-dropdown.study-widget-picker")?.remove();
}

function openStudyDashboardPicker(block, anchorEl = null) {
  if (!block || !["session-progress", "daily-streak", "recent-answers"].includes(block.dataset.type)) return;
  closeStudyDashboardPicker();
  const fallback = block.dataset.type === "session-progress" ? "Session Progress" : block.dataset.type === "daily-streak" ? "Current Streak" : "Recent Answers";
  const config = readStudyDashboardConfig(block, fallback);
  const isSession = block.dataset.type === "session-progress";
  const isStreak = block.dataset.type === "daily-streak";
  const isRecent = block.dataset.type === "recent-answers";
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown study-widget-picker";
  picker.dataset.uiId = "studyWidgetPicker";
  picker.innerHTML = `
    <div class="study-widget-picker-head">
      <strong>${escapeHTML(fallback)}</strong>
      <button type="button" data-study-widget-picker="close" aria-label="Close">×</button>
    </div>
    <div class="study-widget-picker-body">
      <label class="study-widget-picker-field"><span>Title</span><input type="text" data-study-widget-input="title" value="${escapeHTML(config.title)}" /></label>
      <label class="study-widget-picker-field"><span>${isRecent ? "History" : "Scope"}</span><select data-study-widget-input="scope">
        <option value="all">All study activity</option>
        <option value="page">This page</option>
        <option value="session">Latest session</option>
      </select></label>
      <details open class="study-widget-picker-section">
        <summary>Style</summary>
        <div class="study-widget-picker-grid${isRecent ? " single" : ""}">
          <label class="study-widget-picker-field"><span>Accent</span><input type="color" data-study-widget-input="accentColor" value="${escapeHTML(config.accentColor || "#9fe870")}" /></label>
          ${isRecent ? "" : `<label class="study-widget-picker-field"><span>Track</span><input type="color" data-study-widget-input="trackColor" value="${escapeHTML(config.trackColor || "#3a3a3a")}" /></label>`}
        </div>
        <button type="button" class="topbar-dropdown-btn" data-study-widget-picker="clear-colors">Use theme colors</button>
      </details>
      ${isSession ? `
        <details open class="study-widget-picker-section">
          <summary>Progress</summary>
          <label class="study-widget-picker-field"><span>Display</span><select data-study-widget-input="progressStyle">
            <option value="ring">Ring</option>
            <option value="bar">Bar</option>
          </select></label>
        </details>
      ` : ""}
      ${isStreak ? `
        <details open class="study-widget-picker-section">
          <summary>Streak</summary>
          <label class="study-widget-picker-field"><span>Shape</span><select data-study-widget-input="streakShape">
            <option value="pill">Pills</option>
            <option value="dot">Dots</option>
            <option value="square">Squares</option>
          </select></label>
          <label class="study-widget-picker-check"><input type="checkbox" data-study-widget-input="freezesEnabled" /> Use freezes</label>
          <div class="study-widget-picker-grid">
            <label class="study-widget-picker-field"><span>Freeze count</span><input type="number" min="0" max="365" step="1" data-study-widget-input="freezeCount" value="${config.freezeCount}" /></label>
            <label class="study-widget-picker-field"><span>Freeze color</span><input type="color" data-study-widget-input="freezeColor" value="${escapeHTML(config.freezeColor || "#8dbdff")}" /></label>
          </div>
        </details>
      ` : ""}
      ${isRecent ? `
        <details open class="study-widget-picker-section">
          <summary>List</summary>
          <label class="study-widget-picker-field"><span>Rows shown</span><input type="number" min="3" max="20" step="1" data-study-widget-input="limit" value="${config.limit}" /></label>
          <label class="study-widget-picker-field"><span>Status marker</span><select data-study-widget-input="recentMarker">
            <option value="dot">Dot</option>
            <option value="symbol">Small check / x</option>
            <option value="bar">Side bar</option>
            <option value="none">None</option>
          </select></label>
        </details>
      ` : ""}
      <details open class="study-widget-picker-section">
        <summary>Chrome</summary>
        <label class="study-widget-picker-check"><input type="checkbox" data-study-widget-input="showHeader" /> Show title/settings row</label>
      </details>
    </div>
    <div class="study-widget-picker-footer">
      <button type="button" class="topbar-dropdown-btn" data-study-widget-picker="save">Save</button>
    </div>
  `;

  document.body.appendChild(picker);
  const setValue = (name, value) => {
    const input = picker.querySelector(`[data-study-widget-input="${name}"]`);
    if (!input) return;
    if (input.type === "checkbox") input.checked = !!value;
    else input.value = value;
  };
  setValue("scope", config.scope);
  setValue("progressStyle", config.progressStyle);
  setValue("streakShape", config.streakShape);
  setValue("recentMarker", config.recentMarker);
  setValue("freezesEnabled", config.freezesEnabled);
  setValue("showHeader", config.showHeader);
  const anchorTarget = anchorEl || block.querySelector(".study-widget-config-btn") || block;
  positionTypingDrillPicker(picker, block, anchorTarget);
  watchStudyToolPickerPosition(picker, block, anchorTarget);
  openOverlay("studyWidgetPicker", picker);

  const readNext = () => {
    const value = (name, fallbackValue = "") => picker.querySelector(`[data-study-widget-input="${name}"]`)?.value ?? fallbackValue;
    const checked = (name) => !!picker.querySelector(`[data-study-widget-input="${name}"]`)?.checked;
    const accentColor = value("accentColor", config.accentColor);
    const trackColor = value("trackColor", config.trackColor);
    const freezeColor = value("freezeColor", config.freezeColor);
    return normalizeStudyDashboardConfig({
      ...config,
      title: value("title", config.title),
      scope: value("scope", config.scope),
      accentColor,
      trackColor,
      freezeColor,
      freezesEnabled: checked("freezesEnabled"),
      freezeCount: value("freezeCount", config.freezeCount),
      showHeader: checked("showHeader"),
      streakShape: value("streakShape", config.streakShape),
      progressStyle: value("progressStyle", config.progressStyle),
      recentMarker: value("recentMarker", config.recentMarker),
      limit: value("limit", config.limit)
    }, fallback);
  };

  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  picker.addEventListener("input", (event) => {
    if (event.target.closest('[data-study-widget-input="accentColor"], [data-study-widget-input="trackColor"]')) {
      delete picker.dataset.clearStudyColors;
    }
  });
  const saveStudyWidgetDraft = () => {
    const next = readNext();
    if (picker.dataset.clearStudyColors === "true") {
      next.accentColor = "";
      next.trackColor = "";
    }
    writeStudyDashboardConfig(block, next, fallback);
    applyStudyDashboardStyles(block, next);
    const titleEl = block.querySelector(".study-widget-title");
    if (titleEl) titleEl.textContent = next.title || fallback;
    const shell = block.querySelector(".study-widget-shell");
    if (shell) {
      shell.dataset.streakShape = next.streakShape || "pill";
      shell.dataset.progressStyle = next.progressStyle || "ring";
      shell.dataset.recentMarker = next.recentMarker || "dot";
      shell.dataset.chrome = next.showHeader ? "shown" : "minimal";
    }
    if (typeof saveState === "function") saveState();
  };
  picker.addEventListener("click", (event) => {
    const action = event.target.closest("[data-study-widget-picker]")?.dataset.studyWidgetPicker;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === "close") {
      renderStudyDashboardBlock(block);
      closeStudyDashboardPicker();
      return;
    }
    if (action === "clear-colors") {
      const accent = picker.querySelector('[data-study-widget-input="accentColor"]');
      const track = picker.querySelector('[data-study-widget-input="trackColor"]');
      if (accent) accent.value = "#9fe870";
      if (track) track.value = "#3a3a3a";
      picker.dataset.clearStudyColors = "true";
      const next = readNext();
      next.accentColor = "";
      next.trackColor = "";
      writeStudyDashboardConfig(block, next, fallback);
      applyStudyDashboardStyles(block, next);
      renderStudyDashboardBlock(block);
      if (typeof saveState === "function") saveState();
      return;
    }
    if (action === "save") {
      const next = readNext();
      if (picker.dataset.clearStudyColors === "true") {
        next.accentColor = "";
        next.trackColor = "";
      }
      writeStudyDashboardConfig(block, next, fallback);
      renderStudyDashboardBlock(block);
      if (typeof saveState === "function") saveState();
      closeStudyDashboardPicker();
    }
  });

  picker.addEventListener("input", (event) => {
    if (!event.target.closest("[data-study-widget-input]")) return;
    saveStudyWidgetDraft();
  });
  picker.addEventListener("change", (event) => {
    if (!event.target.closest("[data-study-widget-input]")) return;
    saveStudyWidgetDraft();
  });
}

window.mountStudyDashboardBlock = function mountStudyDashboardBlock(block) {
  if (!block || !["session-progress", "daily-streak", "recent-answers"].includes(block.dataset.type)) return null;
  const fallback = block.dataset.type === "session-progress" ? "Session Progress" : block.dataset.type === "daily-streak" ? "Current Streak" : "Recent Answers";
  if (!block.dataset.studyDashboardConfig) writeStudyDashboardConfig(block, { title: fallback }, fallback);
  renderStudyDashboardBlock(block);
  return block;
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    renderStudyDashboardBlocks();
  }, { once: true });
} else {
  renderStudyDashboardBlocks();
}

function normalizeFlashcardDeckSourceType(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return safe === "database" ? "database" : "manual";
}

function normalizeStudyScoreWriteback(raw = {}, defaults = {}) {
  const numberOrDefault = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const defaultCorrect = numberOrDefault(defaults.correctChange, 1);
  const defaultIncorrect = numberOrDefault(defaults.incorrectChange, -1);
  return {
    scoreFieldId: String(raw?.scoreFieldId || "").trim(),
    correctChange: numberOrDefault(raw?.correctChange, defaultCorrect),
    incorrectChange: numberOrDefault(raw?.incorrectChange, defaultIncorrect)
  };
}

function applyStudyScoreWriteback(config, rowId, isCorrect) {
  const scoring = normalizeStudyScoreWriteback(config?.scoring || {});
  if (!rowId || !scoring.scoreFieldId || typeof window.updateDatabaseRowScore !== "function") return false;
  return window.updateDatabaseRowScore({
    kind: config.sourceKind === "block" ? "block" : "page",
    pageId: config.sourcePageId,
    blockId: config.sourceKind === "block" ? config.sourceBlockId : ""
  }, rowId, scoring.scoreFieldId, isCorrect ? scoring.correctChange : scoring.incorrectChange);
}

function buildStudyScoreSettingsHTML(prefix = "study-score", fieldClass = "typing-drill-picker-field", gridClass = "typing-drill-picker-grid", options = {}) {
  const includeIncorrect = options.includeIncorrect !== false;
  return `
    <label class="${fieldClass}"><span>Score number field</span><select data-study-score="${prefix}-field"></select></label>
    <div class="${gridClass}">
      <label class="${fieldClass}"><span>Correct change</span><input type="number" step="any" data-study-score="${prefix}-correct" /></label>
      ${includeIncorrect ? `<label class="${fieldClass}"><span>Incorrect change</span><input type="number" step="any" data-study-score="${prefix}-incorrect" /></label>` : ""}
    </div>
    <div class="typing-drill-picker-help">Score never goes below 0. To change a real Status field from this score or a formula, use Status automations in the database settings.</div>`;
}

function readStudyScoreSettings(container, prefix = "study-score", fallback = {}, defaults = {}) {
  const base = normalizeStudyScoreWriteback(fallback, defaults);
  const value = (suffix, defaultValue = "") => {
    const input = container?.querySelector(`[data-study-score="${prefix}-${suffix}"]`);
    if (!input) return defaultValue;
    if (input.dataset.studyScoreReady !== "true") return defaultValue;
    if (input instanceof HTMLSelectElement && !input.options.length) return defaultValue;
    return input.value;
  };
  return normalizeStudyScoreWriteback({
    scoreFieldId: value("field", base.scoreFieldId),
    correctChange: value("correct", base.correctChange),
    incorrectChange: value("incorrect", base.incorrectChange)
  }, defaults);
}

function syncStudyScoreSettings(container, prefix = "study-score", properties = [], config = {}, defaults = {}) {
  const scoring = normalizeStudyScoreWriteback(config, defaults);
  const fill = (suffix, types, selected) => {
    const select = container?.querySelector(`[data-study-score="${prefix}-${suffix}"]`);
    if (!select) return;
    const options = [{ value: "", label: "None" }].concat((properties || [])
      .filter((property) => types.includes(property.type))
      .map((property) => ({ value: property.id, label: property.name || "Property" })));
    select.innerHTML = options.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("");
    select.value = selected || "";
    select.dataset.studyScoreReady = "true";
  };
  fill("field", ["number"], scoring.scoreFieldId);
  ["correct", "incorrect"].forEach((suffix) => {
    const input = container?.querySelector(`[data-study-score="${prefix}-${suffix}"]`);
    if (!input) return;
    const map = {
      correct: scoring.correctChange,
      incorrect: scoring.incorrectChange
    };
    input.value = String(map[suffix] ?? "");
    input.dataset.studyScoreReady = "true";
  });
}

function normalizeFlashcardDeckTemplate(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["basic", "visual", "custom"].includes(safe) ? safe : "basic";
}

function normalizeFlashcardDeckSurface(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["lined", "grid", "blank", "qa"].includes(safe) ? safe : "blank";
}

function normalizeFlashcardDeckAlign(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["left", "center", "right"].includes(safe) ? safe : "left";
}

function normalizeFlashcardDeckVAlign(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["top", "center", "bottom"].includes(safe) ? safe : "top";
}

function normalizeFlashcardDeckTextSize(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["sm", "md", "lg", "xl"].includes(safe) ? safe : "md";
}

function normalizeFlashcardDeckMappings(raw = {}) {
  return {
    frontTitle: String(raw?.frontTitle || "").trim(),
    frontBody: String(raw?.frontBody || "").trim(),
    backTitle: String(raw?.backTitle || "").trim(),
    backBody: String(raw?.backBody || "").trim(),
    image: String(raw?.image || "").trim()
  };
}

function inferFlashcardDeckMappings(properties = [], current = {}) {
  const normalized = normalizeFlashcardDeckMappings(current || {});
  const props = Array.isArray(properties) ? properties : [];
  const isValid = (value) => value === "__title__" || props.some((property) => property?.id === value);
  const currentValue = (key) => {
    const value = normalized[key];
    if (!value) return "";
    return isValid(value) ? value : "";
  };
  const hasUserMapping = Object.values(normalized).some((value) => String(value || "").trim());
  if (hasUserMapping) {
    return normalizeFlashcardDeckMappings({
      frontTitle: currentValue("frontTitle"),
      frontBody: currentValue("frontBody"),
      backTitle: currentValue("backTitle"),
      backBody: currentValue("backBody"),
      image: currentValue("image")
    });
  }
  const findByName = (patterns) => {
    const match = props.find((property) => {
      const name = String(property?.name || "").trim().toLowerCase();
      return patterns.some((pattern) => pattern.test(name));
    });
    return match?.id || "";
  };
  const usableIds = props.map((property) => property?.id).filter(Boolean);
  return normalizeFlashcardDeckMappings({
    frontTitle: currentValue("frontTitle") || findByName([/^(term|word|question|prompt|front|title)$/i]) || "__title__",
    frontBody: currentValue("frontBody") || findByName([/^(hint|context|example|note|notes|front body)$/i]) || "",
    backTitle: currentValue("backTitle") || findByName([/^(answer title|back title)$/i]) || "",
    backBody: currentValue("backBody") || findByName([/^(answer|definition|meaning|back|response|value)$/i]) || usableIds[0] || "",
    image: currentValue("image") || findByName([/^(image|img|picture|photo|visual)$/i]) || ""
  });
}

function normalizeFlashcardDeckCard(raw = {}, fallbackId = "") {
  const card = {
    id: String(raw?.id || fallbackId || `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).trim(),
    frontTitle: String(raw?.frontTitle || "").trim(),
    frontBody: String(raw?.frontBody || "").trim(),
    backTitle: String(raw?.backTitle || "").trim(),
    backBody: String(raw?.backBody || "").trim(),
    image: String(raw?.image || "").trim(),
    template: raw?.template ? normalizeFlashcardDeckTemplate(raw.template) : "",
    surface: raw?.surface ? normalizeFlashcardDeckSurface(raw.surface) : ""
  };
  const isStarterDefault = card.id === "card-1"
    && card.frontTitle === "Front"
    && card.frontBody === "Prompt"
    && card.backTitle === "Back"
    && card.backBody === "Answer";
  if (isStarterDefault) {
    card.frontTitle = "";
    card.frontBody = "";
    card.backTitle = "";
    card.backBody = "";
  }
  return card;
}

function normalizeFlashcardDeckOverrides(raw = {}) {
  const next = {};
  if (!raw || typeof raw !== "object") return next;
  Object.entries(raw).forEach(([key, value]) => {
    if (!key) return;
    next[key] = normalizeFlashcardDeckCard(value, key);
  });
  return next;
}

function normalizeFlashcardDeckFilters(raw = []) {
  const source = Array.isArray(raw) ? raw : [];
  return source.map((filter) => ({
    propertyId: String(filter?.propertyId || "").trim(),
    operator: ["is", "is-not", "contains", "checked", "unchecked"].includes(filter?.operator) ? filter.operator : "is",
    value: String(filter?.value || "").trim()
  })).filter((filter) => filter.propertyId);
}

function normalizeFlashcardDeckConfig(raw = {}) {
  const manualCards = Array.isArray(raw?.manualCards) ? raw.manualCards : [];
  const normalizedCards = manualCards.length
    ? manualCards.map((card, index) => normalizeFlashcardDeckCard(card, `card-${index + 1}`))
    : [
        normalizeFlashcardDeckCard({
          id: "card-1",
          frontTitle: "",
          frontBody: "",
          backTitle: "",
          backBody: ""
        }, "card-1")
      ];
  const currentIndex = Math.max(0, Number(raw?.currentIndex || 0) || 0);
  return {
    title: String(raw?.title || "").trim() || "Flashcard Deck",
    sourceType: normalizeFlashcardDeckSourceType(raw?.sourceType || "manual"),
    sourceKind: raw?.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw?.sourcePageId || "").trim(),
    sourceBlockId: String(raw?.sourceBlockId || "").trim(),
    template: normalizeFlashcardDeckTemplate(raw?.template || "basic"),
    customSurface: normalizeFlashcardDeckSurface(raw?.customSurface || "blank"),
    textAlign: normalizeFlashcardDeckAlign(raw?.textAlign || "left"),
    verticalAlign: normalizeFlashcardDeckVAlign(raw?.verticalAlign || "top"),
    titleSize: normalizeFlashcardDeckTextSize(raw?.titleSize || "md"),
    bodySize: normalizeFlashcardDeckTextSize(raw?.bodySize || "md"),
    backgroundImage: String(raw?.backgroundImage || "").trim(),
    mappings: normalizeFlashcardDeckMappings(raw?.mappings || {}),
    filters: normalizeFlashcardDeckFilters(raw?.filters || []),
    scoring: normalizeStudyScoreWriteback(raw?.scoring || raw?.study?.scoring || {}, { correctChange: 0.5, incorrectChange: 0 }),
    manualCards: normalizedCards,
    cardOverrides: normalizeFlashcardDeckOverrides(raw?.cardOverrides || {}),
    currentIndex,
    showBack: !!raw?.showBack
  };
}

function readFlashcardDeckConfig(block) {
  if (!block) return normalizeFlashcardDeckConfig({});
  return normalizeFlashcardDeckConfig(parseFlashcardsJSON(block.dataset.flashcardsConfig || "", {}));
}

function writeFlashcardDeckConfig(block, config) {
  if (!block) return;
  block.dataset.flashcardsConfig = JSON.stringify(normalizeFlashcardDeckConfig(config));
}

function getFlashcardDeckDatabaseSourceData(config) {
  if (!config || config.sourceType !== "database") return null;
  if (typeof window.getDatabaseCalloutSourceData !== "function") return null;
  if (!config.sourcePageId) return null;
  return window.getDatabaseCalloutSourceData({
    kind: config.sourceKind === "block" ? "block" : "page",
    pageId: config.sourcePageId,
    blockId: config.sourceKind === "block" ? config.sourceBlockId : ""
  });
}

function getFlashcardDeckValueText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((entry) => getFlashcardDeckValueText(entry)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    if (typeof value.name === "string") return value.name;
    if (typeof value.label === "string") return value.label;
    if (typeof value.title === "string") return value.title;
    if (typeof value.value === "string" || typeof value.value === "number") return String(value.value);
  }
  return "";
}

function getFlashcardDeckRowField(row, propertyId = "") {
  if (!row || !propertyId) return "";
  if (propertyId === "__title__") return String(row.title || "").trim();
  return getFlashcardDeckValueText(row.values?.[propertyId]);
}

function getFlashcardDeckProperty(properties = [], propertyId = "") {
  return (properties || []).find((property) => property?.id === propertyId) || null;
}

function getFlashcardDeckPropertyOptions(property) {
  if (!property) return [];
  if (property.type === "status") {
    return (property.statusGroups || []).flatMap((group) => group?.options || []);
  }
  if (property.type === "select") return property.selectOptions || [];
  if (property.type === "tag") return property.tagOptions || [];
  return [];
}

function rowMatchesFlashcardDeckFilter(row, properties, filter) {
  if (!filter?.propertyId) return true;
  const property = getFlashcardDeckProperty(properties, filter.propertyId);
  const rawValue = filter.propertyId === "__title__" ? row?.title : row?.values?.[filter.propertyId];
  if (filter.operator === "checked") return rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1";
  if (filter.operator === "unchecked") return !(rawValue === true || rawValue === "true" || rawValue === 1 || rawValue === "1");
  const rowText = getFlashcardDeckValueText(rawValue).trim().toLowerCase();
  const filterText = String(filter.value || "").trim().toLowerCase();
  if (!filterText && property?.type !== "checkbox") return true;
  if (filter.operator === "is-not") return rowText !== filterText;
  if (filter.operator === "contains") return rowText.includes(filterText);
  return rowText === filterText;
}

function rowMatchesFlashcardDeckFilters(row, properties = [], filters = []) {
  return normalizeFlashcardDeckFilters(filters).every((filter) => rowMatchesFlashcardDeckFilter(row, properties, filter));
}

function getFlashcardDeckCards(config) {
  const normalized = normalizeFlashcardDeckConfig(config || {});
  if (normalized.sourceType !== "database") {
    return normalized.manualCards.map((card) => ({
      ...card,
      sourceRowId: "",
      templateResolved: card.template || normalized.template,
      surfaceResolved: card.surface || normalized.customSurface
    }));
  }

  const sourceData = getFlashcardDeckDatabaseSourceData(normalized);
  if (!sourceData?.database?.rows?.length) return [];
  const properties = sourceData.database.properties || [];
  const rows = sourceData.database.rows.filter((row) => rowMatchesFlashcardDeckFilters(row, properties, normalized.filters));
  return rows.map((row, index) => {
    const baseCard = normalizeFlashcardDeckCard({
      id: row.id || `row-${index + 1}`,
      frontTitle: getFlashcardDeckRowField(row, normalized.mappings.frontTitle),
      frontBody: getFlashcardDeckRowField(row, normalized.mappings.frontBody),
      backTitle: getFlashcardDeckRowField(row, normalized.mappings.backTitle),
      backBody: getFlashcardDeckRowField(row, normalized.mappings.backBody),
      image: getFlashcardDeckRowField(row, normalized.mappings.image)
    }, row.id || `row-${index + 1}`);
    const override = normalized.cardOverrides[baseCard.id] || null;
    const mergedCard = override ? {
      ...baseCard,
      ...override,
      id: baseCard.id
    } : baseCard;
    return {
      ...mergedCard,
      sourceRowId: row.id || "",
      templateResolved: mergedCard.template || normalized.template,
      surfaceResolved: mergedCard.surface || normalized.customSurface
    };
  });
}

function getFlashcardDeckCurrentCard(config) {
  const cards = getFlashcardDeckCards(config);
  if (!cards.length) return { cards, card: null, index: 0 };
  const index = Math.max(0, Math.min(Number(config?.currentIndex || 0) || 0, cards.length - 1));
  return {
    cards,
    card: cards[index] || null,
    index
  };
}

function applyFlashcardScoreAction(block, isCorrect) {
  const config = readFlashcardDeckConfig(block);
  if (config.sourceType !== "database") return false;
  const { card } = getFlashcardDeckCurrentCard(config);
  return applyStudyScoreWriteback(config, card?.sourceRowId || "", isCorrect);
}

function ensureFlashcardDeckStructure(block) {
  const cardEl = block?.querySelector(".flashcard-card");
  if (!cardEl || cardEl.querySelector(".flashcard-card-inner")) return;
  const innerEl = document.createElement("div");
  innerEl.className = "flashcard-card-inner";
  Array.from(cardEl.querySelectorAll(":scope > .flashcard-card-face")).forEach((faceEl) => {
    innerEl.appendChild(faceEl);
  });
  cardEl.appendChild(innerEl);
}

function renderFlashcardFace(faceEl, side, card, showBack) {
  if (!faceEl) return;
  const titleEl = faceEl.querySelector(".flashcard-card-title");
  const bodyEl = faceEl.querySelector(".flashcard-card-body");
  const kickerEl = faceEl.querySelector(".flashcard-card-kicker");
  const mediaEl = faceEl.querySelector(".flashcard-card-media");
  const imgEl = faceEl.querySelector(".flashcard-card-image");
  const isFront = side === "front";
  const titleText = isFront ? (card?.frontTitle || "") : (card?.backTitle || "");
  const bodyText = isFront ? (card?.frontBody || "") : (card?.backBody || "");
  const imageText = card?.image || "";
  const titlePlaceholder = isFront ? "Question" : "Answer";
  const bodyPlaceholder = isFront ? "Add the prompt here." : "Add the answer here.";

  if (kickerEl) kickerEl.textContent = isFront ? "Front" : "Back";
  if (titleEl) {
    titleEl.textContent = titleText || titlePlaceholder;
    titleEl.classList.toggle("is-placeholder", !titleText);
  }
  if (bodyEl) {
    bodyEl.textContent = bodyText || bodyPlaceholder;
    bodyEl.classList.toggle("is-placeholder", !bodyText);
  }

  const showImage = !!imageText;
  if (mediaEl) mediaEl.hidden = !showImage;
  if (imgEl) {
    imgEl.src = showImage ? imageText : "";
    imgEl.alt = titleText || bodyText || "Flashcard image";
  }
}

function renderFlashcardDeckBlock(block) {
  if (!block || block.dataset.type !== "flashcards") return null;
  ensureFlashcardDeckStructure(block);
  const config = readFlashcardDeckConfig(block);
  const shellEl = block.querySelector(".flashcard-deck-shell");
  const titleEl = block.querySelector(".flashcard-deck-title");
  const countEl = block.querySelector(".flashcard-deck-count");
  const positionEl = block.querySelector(".flashcard-deck-position");
  const cardEl = block.querySelector(".flashcard-card");
  const frontEl = block.querySelector(".flashcard-card-front");
  const backEl = block.querySelector(".flashcard-card-back");
  const prevBtn = block.querySelector('[data-flashcards-action="prev"]');
  const nextBtn = block.querySelector('[data-flashcards-action="next"]');
  const { cards, card, index } = getFlashcardDeckCurrentCard(config);
  const total = cards.length;

  if (titleEl) titleEl.textContent = config.title || "Flashcard Deck";
  if (countEl) countEl.textContent = `${total} card${total === 1 ? "" : "s"}`;
  if (positionEl) positionEl.textContent = total ? `${index + 1} / ${total}` : "0 / 0";
  if (shellEl) {
    shellEl.dataset.template = card?.templateResolved || config.template;
    shellEl.dataset.surface = card?.surfaceResolved || config.customSurface;
    shellEl.dataset.showBack = config.showBack ? "1" : "0";
  }
  if (cardEl) {
    cardEl.dataset.template = card?.templateResolved || config.template;
    cardEl.dataset.surface = card?.surfaceResolved || config.customSurface;
    cardEl.dataset.align = config.textAlign;
    cardEl.dataset.valign = config.verticalAlign;
    cardEl.dataset.titleSize = config.titleSize;
    cardEl.dataset.bodySize = config.bodySize;
    cardEl.style.setProperty("--flashcard-bg-image", config.backgroundImage ? `url("${config.backgroundImage.replace(/"/g, "%22")}")` : "none");
    cardEl.classList.toggle("is-flipped", !!config.showBack);
    cardEl.classList.toggle("is-empty", !card);
    cardEl.classList.toggle("has-background-image", !!config.backgroundImage);
  }
  if (prevBtn) prevBtn.disabled = total <= 1;
  if (nextBtn) nextBtn.disabled = total <= 1;
  renderFlashcardFace(frontEl, "front", card, !!config.showBack);
  renderFlashcardFace(backEl, "back", card, !!config.showBack);
  if (card) {
    markStudyPromptSeen(block, {
      tool: "Flashcards",
      rowId: card.sourceRowId || card.id || "",
      prompt: [card.frontTitle, card.frontBody].filter(Boolean).join(" - "),
      expected: [card.backTitle, card.backBody].filter(Boolean).join(" - ")
    });
  }
  return block;
}

function closeFlashcardDeckPicker() {
  document.querySelector(".topbar-dropdown.flashcard-deck-picker")?.remove();
}

function openFlashcardDeckPicker(block, anchorEl = null) {
  if (!block || block.dataset.type !== "flashcards") return;
  closeFlashcardDeckPicker();

  const config = readFlashcardDeckConfig(block);
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown flashcard-deck-picker study-tool-picker";
  picker.dataset.uiId = "topbarDropdown";
  picker.innerHTML = `
    <label class="flashcard-deck-picker-field">
      <span>Deck title</span>
      <input type="text" data-flashcards-input="title" />
    </label>
    <div class="flashcard-deck-picker-grid">
      <label class="flashcard-deck-picker-field">
        <span>Source</span>
        <select data-flashcards-input="sourceType">
          <option value="manual">Manual</option>
          <option value="database">Database</option>
        </select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Template</span>
        <select data-flashcards-input="template">
          <option value="basic">Basic</option>
          <option value="visual">Visual</option>
          <option value="custom">Custom</option>
        </select>
      </label>
    </div>
    <label class="flashcard-deck-picker-field">
      <span>Surface</span>
      <select data-flashcards-input="customSurface">
        <option value="blank">Blank</option>
        <option value="lined">Lined</option>
        <option value="grid">Grid</option>
        <option value="qa">Q / A</option>
      </select>
    </label>
    <div data-flashcards-database-wrap hidden>
      <label class="flashcard-deck-picker-field">
        <span>Database</span>
        <select data-flashcards-input="source"></select>
      </label>
      <div class="flashcard-deck-picker-grid">
        <label class="flashcard-deck-picker-field">
          <span>Front title</span>
          <select data-flashcards-input="frontTitleMap"></select>
        </label>
        <label class="flashcard-deck-picker-field">
          <span>Front body</span>
          <select data-flashcards-input="frontBodyMap"></select>
        </label>
        <label class="flashcard-deck-picker-field">
          <span>Back title</span>
          <select data-flashcards-input="backTitleMap"></select>
        </label>
        <label class="flashcard-deck-picker-field">
          <span>Back body</span>
          <select data-flashcards-input="backBodyMap"></select>
        </label>
      </div>
      <label class="flashcard-deck-picker-field">
        <span>Image</span>
        <select data-flashcards-input="imageMap"></select>
      </label>
    </div>
    <div class="flashcard-deck-picker-divider"></div>
    <div class="flashcard-deck-picker-card-head">
      <span data-flashcards-card-label>Card</span>
      <div class="flashcard-deck-picker-mini-actions">
        <button type="button" class="topbar-dropdown-btn" data-flashcards-action="prev-card">‹</button>
        <button type="button" class="topbar-dropdown-btn" data-flashcards-action="add-card">+</button>
        <button type="button" class="topbar-dropdown-btn" data-flashcards-action="delete-card">−</button>
        <button type="button" class="topbar-dropdown-btn" data-flashcards-action="next-card">›</button>
      </div>
    </div>
    <div class="flashcard-deck-picker-grid">
      <label class="flashcard-deck-picker-field">
        <span>Front title</span>
        <input type="text" data-flashcards-input="frontTitle" />
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Back title</span>
        <input type="text" data-flashcards-input="backTitle" />
      </label>
    </div>
    <label class="flashcard-deck-picker-field">
      <span>Front body</span>
      <textarea data-flashcards-input="frontBody" rows="3"></textarea>
    </label>
    <label class="flashcard-deck-picker-field">
      <span>Back body</span>
      <textarea data-flashcards-input="backBody" rows="3"></textarea>
    </label>
    <label class="flashcard-deck-picker-field">
      <span>Image URL</span>
      <input type="text" data-flashcards-input="image" />
    </label>
    <div class="flashcard-deck-picker-grid">
      <label class="flashcard-deck-picker-field">
        <span>Card template</span>
        <select data-flashcards-input="cardTemplate">
          <option value="">Deck default</option>
          <option value="basic">Basic</option>
          <option value="visual">Visual</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Card surface</span>
        <select data-flashcards-input="cardSurface">
          <option value="">Deck default</option>
          <option value="blank">Blank</option>
          <option value="lined">Lined</option>
          <option value="grid">Grid</option>
          <option value="qa">Q / A</option>
        </select>
      </label>
    </div>
    <div class="flashcard-deck-picker-actions">
      <button type="button" class="topbar-dropdown-btn" data-flashcards-action="save">Save</button>
      <button type="button" class="topbar-dropdown-btn" data-flashcards-action="clear-overrides">Clear overrides</button>
    </div>
  `;

  document.body.appendChild(picker);

  const titleFieldEl = picker.querySelector('[data-flashcards-input="title"]')?.closest(".flashcard-deck-picker-field");
  const sourceGridEl = picker.querySelector('[data-flashcards-input="sourceType"]')?.closest(".flashcard-deck-picker-grid");
  const surfaceFieldEl = picker.querySelector('[data-flashcards-input="customSurface"]')?.closest(".flashcard-deck-picker-field");
  const databaseWrapEl = picker.querySelector("[data-flashcards-database-wrap]");
  const cardHeadEl = picker.querySelector(".flashcard-deck-picker-card-head");
  const actionsEl = picker.querySelector(".flashcard-deck-picker-actions");
  const cardTitleGridForPanel = picker.querySelector('[data-flashcards-input="frontTitle"]')?.closest(".flashcard-deck-picker-grid");
  const frontBodyFieldForPanel = picker.querySelector('[data-flashcards-input="frontBody"]')?.closest(".flashcard-deck-picker-field");
  const backBodyFieldForPanel = picker.querySelector('[data-flashcards-input="backBody"]')?.closest(".flashcard-deck-picker-field");
  const imageFieldForPanel = picker.querySelector('[data-flashcards-input="image"]')?.closest(".flashcard-deck-picker-field");
  const cardStyleGridForPanel = picker.querySelector('[data-flashcards-input="cardTemplate"]')?.closest(".flashcard-deck-picker-grid");
  const dividerEls = Array.from(picker.querySelectorAll(".flashcard-deck-picker-divider"));
  const tabsEl = document.createElement("div");
  tabsEl.className = "flashcard-deck-picker-tabs";
  tabsEl.innerHTML = `
    <button type="button" class="active" data-flashcards-tab="source">Source</button>
    <button type="button" data-flashcards-tab="card">Card</button>
    <button type="button" data-flashcards-tab="study">Study</button>
    <button type="button" data-flashcards-tab="style">Style</button>
  `;
  const sourcePanelEl = document.createElement("div");
  sourcePanelEl.className = "flashcard-deck-picker-panel active";
  sourcePanelEl.dataset.flashcardsPanel = "source";
  const cardPanelEl = document.createElement("div");
  cardPanelEl.className = "flashcard-deck-picker-panel";
  cardPanelEl.dataset.flashcardsPanel = "card";
  const stylePanelEl = document.createElement("div");
  stylePanelEl.className = "flashcard-deck-picker-panel";
  stylePanelEl.dataset.flashcardsPanel = "style";
  const studyPanelEl = document.createElement("div");
  studyPanelEl.className = "flashcard-deck-picker-panel";
  studyPanelEl.dataset.flashcardsPanel = "study";
  const pickerHeadEl = document.createElement("div");
  pickerHeadEl.className = "study-tool-picker-head";
  pickerHeadEl.innerHTML = `<strong>Flashcard Deck</strong><button type="button" data-flashcards-action="close" aria-label="Close">×</button>`;
  picker.prepend(tabsEl);
  picker.prepend(pickerHeadEl);
  [titleFieldEl, sourceGridEl, surfaceFieldEl, databaseWrapEl].forEach((el) => {
    if (el) sourcePanelEl.appendChild(el);
  });
  [cardHeadEl, cardTitleGridForPanel, frontBodyFieldForPanel, backBodyFieldForPanel, imageFieldForPanel].forEach((el) => {
    if (el) cardPanelEl.appendChild(el);
  });
  [cardStyleGridForPanel, actionsEl].forEach((el) => {
    if (el) stylePanelEl.appendChild(el);
  });
  dividerEls.forEach((el) => {
    if (el.parentElement === picker) el.remove();
  });
  picker.appendChild(sourcePanelEl);
  picker.appendChild(cardPanelEl);
  picker.appendChild(studyPanelEl);
  picker.appendChild(stylePanelEl);

  const anchorTarget = anchorEl || block.querySelector(".flashcard-deck-config-btn") || block;
  positionTypingDrillPicker(picker, block, anchorTarget);
  watchStudyToolPickerPosition(picker, block, anchorTarget);

  const titleInput = picker.querySelector('[data-flashcards-input="title"]');
  const sourceTypeSelect = picker.querySelector('[data-flashcards-input="sourceType"]');
  const templateSelect = picker.querySelector('[data-flashcards-input="template"]');
  const surfaceSelect = picker.querySelector('[data-flashcards-input="customSurface"]');
  const databaseWrap = picker.querySelector("[data-flashcards-database-wrap]");
  const sourceSelect = picker.querySelector('[data-flashcards-input="source"]');
  const frontTitleMapSelect = picker.querySelector('[data-flashcards-input="frontTitleMap"]');
  const frontBodyMapSelect = picker.querySelector('[data-flashcards-input="frontBodyMap"]');
  const backTitleMapSelect = picker.querySelector('[data-flashcards-input="backTitleMap"]');
  const backBodyMapSelect = picker.querySelector('[data-flashcards-input="backBodyMap"]');
  const imageMapSelect = picker.querySelector('[data-flashcards-input="imageMap"]');
  const cardLabel = picker.querySelector("[data-flashcards-card-label]");
  const frontTitleInput = picker.querySelector('[data-flashcards-input="frontTitle"]');
  const backTitleInput = picker.querySelector('[data-flashcards-input="backTitle"]');
  const frontBodyInput = picker.querySelector('[data-flashcards-input="frontBody"]');
  const backBodyInput = picker.querySelector('[data-flashcards-input="backBody"]');
  const imageInput = picker.querySelector('[data-flashcards-input="image"]');
  const cardTemplateSelect = picker.querySelector('[data-flashcards-input="cardTemplate"]');
  const cardSurfaceSelect = picker.querySelector('[data-flashcards-input="cardSurface"]');
  const prevCardBtn = picker.querySelector('[data-flashcards-action="prev-card"]');
  const nextCardBtn = picker.querySelector('[data-flashcards-action="next-card"]');
  const addCardBtn = picker.querySelector('[data-flashcards-action="add-card"]');
  const deleteCardBtn = picker.querySelector('[data-flashcards-action="delete-card"]');
  const saveBtn = picker.querySelector('[data-flashcards-action="save"]');
  const clearOverridesBtn = picker.querySelector('[data-flashcards-action="clear-overrides"]');
  picker.querySelector('[data-flashcards-action="close"]')?.addEventListener("click", closeFlashcardDeckPicker);

  const imageLabelEl = imageInput?.closest(".flashcard-deck-picker-field")?.querySelector("span");
  if (imageLabelEl) imageLabelEl.textContent = "Image";
  if (imageInput) imageInput.placeholder = "Upload or paste an image";

  const styleControlsEl = document.createElement("div");
  styleControlsEl.className = "flashcard-deck-style-controls";
  styleControlsEl.innerHTML = `
    <div class="flashcard-deck-picker-grid">
      <label class="flashcard-deck-picker-field">
        <span>Text align</span>
        <select data-flashcards-input="textAlign">
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Position</span>
        <select data-flashcards-input="verticalAlign">
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Title size</span>
        <select data-flashcards-input="titleSize">
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
          <option value="xl">XL</option>
        </select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Body size</span>
        <select data-flashcards-input="bodySize">
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
          <option value="xl">XL</option>
        </select>
      </label>
    </div>
    <div class="flashcard-deck-upload-row">
      <button type="button" class="topbar-dropdown-btn" data-flashcards-action="upload-bg">Upload background</button>
      <button type="button" class="topbar-dropdown-btn" data-flashcards-action="clear-bg">Clear</button>
      <input type="file" data-flashcards-input="backgroundUpload" accept="image/*" hidden />
    </div>
  `;
  if (actionsEl) stylePanelEl.insertBefore(styleControlsEl, actionsEl);

  const imageUploadRow = document.createElement("div");
  imageUploadRow.className = "flashcard-deck-upload-row";
  imageUploadRow.innerHTML = `
    <button type="button" class="topbar-dropdown-btn" data-flashcards-action="upload-card-image">Upload image</button>
    <button type="button" class="topbar-dropdown-btn" data-flashcards-action="clear-card-image">Clear</button>
    <input type="file" data-flashcards-input="cardImageUpload" accept="image/*" hidden />
  `;
  imageInput?.closest(".flashcard-deck-picker-field")?.appendChild(imageUploadRow);

  const textAlignSelect = picker.querySelector('[data-flashcards-input="textAlign"]');
  const verticalAlignSelect = picker.querySelector('[data-flashcards-input="verticalAlign"]');
  const titleSizeSelect = picker.querySelector('[data-flashcards-input="titleSize"]');
  const bodySizeSelect = picker.querySelector('[data-flashcards-input="bodySize"]');
  const backgroundUploadInput = picker.querySelector('[data-flashcards-input="backgroundUpload"]');
  const cardImageUploadInput = picker.querySelector('[data-flashcards-input="cardImageUpload"]');

  const filterControlsEl = document.createElement("details");
  filterControlsEl.className = "flashcard-deck-picker-details";
  filterControlsEl.innerHTML = `
    <summary>Filters</summary>
    <div class="flashcard-deck-picker-grid">
      <label class="flashcard-deck-picker-field">
        <span>Property</span>
        <select data-flashcards-input="filterProperty"></select>
      </label>
      <label class="flashcard-deck-picker-field">
        <span>Match</span>
        <select data-flashcards-input="filterOperator">
          <option value="is">Is</option>
          <option value="contains">Contains</option>
          <option value="is-not">Is not</option>
          <option value="checked">Checked</option>
          <option value="unchecked">Unchecked</option>
        </select>
      </label>
    </div>
    <label class="flashcard-deck-picker-field">
      <span>Value</span>
      <input type="text" data-flashcards-input="filterValue" list="flashcard-filter-values" placeholder="Places, Animals, etc." />
      <datalist id="flashcard-filter-values"></datalist>
    </label>
    <div class="flashcard-deck-upload-row">
      <button type="button" class="topbar-dropdown-btn" data-flashcards-action="clear-filter">Clear filter</button>
    </div>
  `;
  databaseWrapEl?.appendChild(filterControlsEl);

  const scoreControlsEl = document.createElement("details");
  scoreControlsEl.className = "flashcard-deck-picker-details";
  scoreControlsEl.open = true;
  scoreControlsEl.innerHTML = `
    <summary>Score write-back</summary>
    ${buildStudyScoreSettingsHTML("flashcards", "flashcard-deck-picker-field", "flashcard-deck-picker-grid", { includeIncorrect: false })}
  `;
  studyPanelEl.appendChild(scoreControlsEl);

  const filterPropertySelect = picker.querySelector('[data-flashcards-input="filterProperty"]');
  const filterOperatorSelect = picker.querySelector('[data-flashcards-input="filterOperator"]');
  const filterValueInput = picker.querySelector('[data-flashcards-input="filterValue"]');
  const filterValuesList = picker.querySelector("#flashcard-filter-values");

  function setFlashcardPickerTab(tabName = "source") {
    const safeTab = ["source", "card", "study", "style"].includes(tabName) ? tabName : "source";
    picker.querySelectorAll("[data-flashcards-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.flashcardsTab === safeTab);
    });
    picker.querySelectorAll("[data-flashcards-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.flashcardsPanel === safeTab);
    });
    window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
  }

  tabsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-flashcards-tab]");
    if (!button) return;
    event.preventDefault();
    setFlashcardPickerTab(button.dataset.flashcardsTab || "source");
  });

  const mappingGrid = databaseWrap?.querySelector(".flashcard-deck-picker-grid");
  const imageMapField = imageMapSelect?.closest(".flashcard-deck-picker-field");
  if (databaseWrap && mappingGrid && imageMapField) {
    const mappingDetails = document.createElement("details");
    mappingDetails.className = "flashcard-deck-picker-details";
    const mappingSummary = document.createElement("summary");
    mappingSummary.textContent = "Field mapping";
    mappingDetails.appendChild(mappingSummary);
    databaseWrap.insertBefore(mappingDetails, mappingGrid);
    mappingDetails.appendChild(mappingGrid);
    mappingDetails.appendChild(imageMapField);
  }

  const cardTitleGrid = frontTitleInput?.closest(".flashcard-deck-picker-grid");
  const frontBodyField = frontBodyInput?.closest(".flashcard-deck-picker-field");
  const backBodyField = backBodyInput?.closest(".flashcard-deck-picker-field");
  const imageField = imageInput?.closest(".flashcard-deck-picker-field");
  if (cardTitleGrid && frontBodyField && backBodyField && imageField) {
    const cardPreviewWrap = document.createElement("div");
    cardPreviewWrap.className = "flashcard-deck-editor-preview";
    cardTitleGrid.parentNode.insertBefore(cardPreviewWrap, cardTitleGrid);
    cardPreviewWrap.appendChild(cardTitleGrid);
    cardPreviewWrap.appendChild(frontBodyField);
    cardPreviewWrap.appendChild(backBodyField);
    cardPreviewWrap.appendChild(imageField);
  }

  const cardStyleGrid = cardTemplateSelect?.closest(".flashcard-deck-picker-grid");
  if (cardStyleGrid) {
    const styleDetails = document.createElement("details");
    styleDetails.className = "flashcard-deck-picker-details";
    const styleSummary = document.createElement("summary");
    styleSummary.textContent = "Per-card style";
    styleDetails.appendChild(styleSummary);
    cardStyleGrid.parentNode.insertBefore(styleDetails, cardStyleGrid);
    styleDetails.appendChild(cardStyleGrid);
  }

  const sourceOptions = typeof window.getDatabaseCalloutSources === "function"
    ? window.getDatabaseCalloutSources()
    : [];

  function readFlashcardImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  function fillPropertySelect(selectEl, properties, selectedValue) {
    if (!selectEl) return;
    const options = [{ value: "", label: "None" }, { value: "__title__", label: "Row title" }]
      .concat((properties || []).map((property) => ({
        value: property.id,
        label: property.name || "Property"
      })));
    selectEl.innerHTML = options.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("");
    selectEl.value = selectedValue || "";
  }

  function fillDatabasePropertySelect(selectEl, properties, selectedValue, options = {}) {
    if (!selectEl) return;
    const allowedTypes = Array.isArray(options.types) ? options.types : null;
    const includeTitle = !!options.includeTitle;
    const entries = [{ value: "", label: "None" }];
    if (includeTitle) entries.push({ value: "__title__", label: "Row title" });
    (properties || []).forEach((property) => {
      if (!property?.id) return;
      if (allowedTypes && !allowedTypes.includes(property.type)) return;
      if (["formula", "rollup", "relation"].includes(property.type)) return;
      entries.push({ value: property.id, label: property.name || "Property" });
    });
    selectEl.innerHTML = entries.map((entry) => `<option value="${escapeHTML(entry.value)}">${escapeHTML(entry.label)}</option>`).join("");
    selectEl.value = selectedValue || "";
    if (selectEl.value !== (selectedValue || "")) selectEl.value = "";
  }

  function fillFlashcardValueDatalist(listEl, property) {
    if (!listEl) return;
    const options = getFlashcardDeckPropertyOptions(property);
    listEl.innerHTML = options.map((option) => `<option value="${escapeHTML(option.name || "")}"></option>`).join("");
  }

  function getSelectedSourceMeta() {
    const selected = sourceOptions.find((source) => {
      const key = `${source.kind}:${source.pageId}:${source.blockId || ""}`;
      return key === sourceSelect.value;
    });
    return selected || null;
  }

  function populateSourceSelect() {
    if (!sourceSelect) return;
    sourceSelect.innerHTML = sourceOptions.map((source) => {
      const value = `${source.kind}:${source.pageId}:${source.blockId || ""}`;
      return `<option value="${escapeHTML(value)}">${escapeHTML(source.label || source.title || "Database")}</option>`;
    }).join("");
    const currentValue = `${config.sourceKind}:${config.sourcePageId}:${config.sourceBlockId || ""}`;
    if (sourceSelect.querySelector(`option[value="${CSS.escape(currentValue)}"]`)) {
      sourceSelect.value = currentValue;
    } else if (sourceOptions[0]) {
      sourceSelect.value = `${sourceOptions[0].kind}:${sourceOptions[0].pageId}:${sourceOptions[0].blockId || ""}`;
    }
  }

  function getWorkingConfig() {
    const baseConfig = readFlashcardDeckConfig(block);
    const selectedSource = getSelectedSourceMeta();
    const selectValue = (selectEl, fallback = "") => {
      if (!selectEl || !selectEl.options || selectEl.options.length === 0) return fallback;
      return selectEl.value;
    };
    const inputValue = (inputEl, fallback = "") => {
      if (!inputEl || inputEl.dataset.flashcardsReady !== "true") return fallback;
      return inputEl.value;
    };
    const nextConfig = normalizeFlashcardDeckConfig({
      ...baseConfig,
      title: titleInput.value,
      sourceType: sourceTypeSelect.value,
      sourceKind: selectedSource?.kind || baseConfig.sourceKind,
      sourcePageId: selectedSource?.pageId || baseConfig.sourcePageId,
      sourceBlockId: selectedSource?.blockId || baseConfig.sourceBlockId,
      template: templateSelect.value,
      customSurface: surfaceSelect.value,
      textAlign: textAlignSelect?.value || baseConfig.textAlign,
      verticalAlign: verticalAlignSelect?.value || baseConfig.verticalAlign,
      titleSize: titleSizeSelect?.value || baseConfig.titleSize,
      bodySize: bodySizeSelect?.value || baseConfig.bodySize,
      backgroundImage: baseConfig.backgroundImage || "",
      mappings: {
        frontTitle: selectValue(frontTitleMapSelect, baseConfig.mappings.frontTitle),
        frontBody: selectValue(frontBodyMapSelect, baseConfig.mappings.frontBody),
        backTitle: selectValue(backTitleMapSelect, baseConfig.mappings.backTitle),
        backBody: selectValue(backBodyMapSelect, baseConfig.mappings.backBody),
        image: selectValue(imageMapSelect, baseConfig.mappings.image)
      },
      filters: filterPropertySelect?.value ? [{
        propertyId: filterPropertySelect.value,
        operator: filterOperatorSelect?.value || "is",
        value: inputValue(filterValueInput, baseConfig.filters[0]?.value || "")
      }] : [],
      scoring: readStudyScoreSettings(picker, "flashcards", baseConfig.scoring, { correctChange: 0.5, incorrectChange: 0 })
    });
    if (nextConfig.sourceType === "database") {
      const sourceData = getFlashcardDeckDatabaseSourceData(nextConfig);
      nextConfig.mappings = inferFlashcardDeckMappings(sourceData?.database?.properties || [], nextConfig.mappings);
    }
    return normalizeFlashcardDeckConfig(nextConfig);
  }

  function commitDeckSettingsState(options = {}) {
    const nextConfig = getWorkingConfig();
    if (options.clearDatabaseOverrides && nextConfig.sourceType === "database") {
      nextConfig.cardOverrides = {};
    }
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    return nextConfig;
  }

  function syncCardEditor() {
    const workingConfig = getWorkingConfig();
    databaseWrap.hidden = workingConfig.sourceType !== "database";

  if (workingConfig.sourceType === "database") {
      const sourceData = getFlashcardDeckDatabaseSourceData(workingConfig);
      const properties = sourceData?.database?.properties || [];
      const mappings = inferFlashcardDeckMappings(properties, workingConfig.mappings);
      fillPropertySelect(frontTitleMapSelect, properties, mappings.frontTitle);
      fillPropertySelect(frontBodyMapSelect, properties, mappings.frontBody);
      fillPropertySelect(backTitleMapSelect, properties, mappings.backTitle);
      fillPropertySelect(backBodyMapSelect, properties, mappings.backBody);
      fillPropertySelect(imageMapSelect, properties, mappings.image);
      const activeFilter = workingConfig.filters[0] || {};
      fillDatabasePropertySelect(filterPropertySelect, properties, activeFilter.propertyId || "", { includeTitle: true });
      if (filterOperatorSelect) filterOperatorSelect.value = activeFilter.operator || "is";
      const filterProperty = activeFilter.propertyId === "__title__"
        ? { type: "title" }
        : getFlashcardDeckProperty(properties, activeFilter.propertyId || "");
      fillFlashcardValueDatalist(filterValuesList, filterProperty);
      if (filterValueInput) {
        filterValueInput.value = activeFilter.value || "";
        filterValueInput.disabled = ["checked", "unchecked"].includes(filterOperatorSelect?.value || "");
        filterValueInput.dataset.flashcardsReady = "true";
      }
      syncStudyScoreSettings(picker, "flashcards", properties, workingConfig.scoring, { correctChange: 0.5, incorrectChange: 0 });
      workingConfig.mappings = mappings;
    } else {
      fillDatabasePropertySelect(filterPropertySelect, [], "");
      syncStudyScoreSettings(picker, "flashcards", [], workingConfig.scoring, { correctChange: 0.5, incorrectChange: 0 });
    }

    const { cards, card, index } = getFlashcardDeckCurrentCard(workingConfig);
    const isDatabase = workingConfig.sourceType === "database";
    cardLabel.textContent = cards.length ? `Card ${index + 1} of ${cards.length}` : "Card";
    const sourceLabel = workingConfig.sourceType === "database" ? "No database rows found" : "Card";
    frontTitleInput.placeholder = sourceLabel;
    frontBodyInput.placeholder = workingConfig.sourceType === "database" ? "Mapped from database" : "";
    backTitleInput.placeholder = "Back title";
    backBodyInput.placeholder = workingConfig.sourceType === "database" ? "Mapped from database" : "";
    frontTitleInput.value = card?.frontTitle || "";
    backTitleInput.value = card?.backTitle || "";
    frontBodyInput.value = card?.frontBody || "";
    backBodyInput.value = card?.backBody || "";
    imageInput.value = card?.image || "";
    cardTemplateSelect.value = card?.template || "";
    cardSurfaceSelect.value = card?.surface || "";
    deleteCardBtn.disabled = isDatabase || workingConfig.manualCards.length <= 1;
    addCardBtn.disabled = isDatabase;
    prevCardBtn.disabled = cards.length <= 1;
    nextCardBtn.disabled = cards.length <= 1;
  }

  function writeCurrentCardDraft() {
    const nextConfig = getWorkingConfig();
    if (nextConfig.sourceType === "manual") {
      const card = nextConfig.manualCards[nextConfig.currentIndex];
      if (!card) return nextConfig;
      card.frontTitle = frontTitleInput.value.trim();
      card.frontBody = frontBodyInput.value.trim();
      card.backTitle = backTitleInput.value.trim();
      card.backBody = backBodyInput.value.trim();
      card.image = imageInput.value.trim();
      card.template = cardTemplateSelect.value;
      card.surface = cardSurfaceSelect.value;
      return nextConfig;
    }

    const current = getFlashcardDeckCurrentCard(nextConfig);
    if (!current.card) return nextConfig;
    nextConfig.cardOverrides[current.card.id] = normalizeFlashcardDeckCard({
      id: current.card.id,
      frontTitle: frontTitleInput.value.trim(),
      frontBody: frontBodyInput.value.trim(),
      backTitle: backTitleInput.value.trim(),
      backBody: backBodyInput.value.trim(),
      image: imageInput.value.trim(),
      template: cardTemplateSelect.value,
      surface: cardSurfaceSelect.value
    }, current.card.id);
    return nextConfig;
  }

  function commitPickerState() {
    const nextConfig = writeCurrentCardDraft();
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    return nextConfig;
  }

  titleInput.value = config.title || "Flashcard Deck";
  sourceTypeSelect.value = config.sourceType;
  templateSelect.value = config.template;
  surfaceSelect.value = config.customSurface;
  if (textAlignSelect) textAlignSelect.value = config.textAlign;
  if (verticalAlignSelect) verticalAlignSelect.value = config.verticalAlign;
  if (titleSizeSelect) titleSizeSelect.value = config.titleSize;
  if (bodySizeSelect) bodySizeSelect.value = config.bodySize;
  populateSourceSelect();
  syncCardEditor();

  picker.querySelector('[data-flashcards-action="clear-filter"]')?.addEventListener("click", () => {
    if (filterPropertySelect) filterPropertySelect.value = "";
    if (filterOperatorSelect) filterOperatorSelect.value = "is";
    if (filterValueInput) {
      filterValueInput.value = "";
      filterValueInput.dataset.flashcardsReady = "true";
    }
    commitDeckSettingsState();
    syncCardEditor();
  });

  picker.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (target === sourceTypeSelect || target === sourceSelect || target === templateSelect || target === surfaceSelect
      || target === frontTitleMapSelect || target === frontBodyMapSelect || target === backTitleMapSelect || target === backBodyMapSelect || target === imageMapSelect
      || target === textAlignSelect || target === verticalAlignSelect || target === titleSizeSelect || target === bodySizeSelect
      || target === filterPropertySelect || target === filterOperatorSelect
      || target.matches("[data-study-score]")) {
      if (target === sourceTypeSelect && sourceTypeSelect.value === "database" && !sourceSelect.value && sourceOptions[0]) {
        sourceSelect.value = `${sourceOptions[0].kind}:${sourceOptions[0].pageId}:${sourceOptions[0].blockId || ""}`;
      }
      const shouldClearOverrides = target === sourceTypeSelect || target === sourceSelect
        || target === frontTitleMapSelect || target === frontBodyMapSelect || target === backTitleMapSelect || target === backBodyMapSelect || target === imageMapSelect;
      commitDeckSettingsState({ clearDatabaseOverrides: shouldClearOverrides });
      syncCardEditor();
      return;
    }
    commitPickerState();
    syncCardEditor();
  });

  picker.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target === titleInput) {
      commitDeckSettingsState();
      return;
    }
    if (target === filterValueInput || target.matches("[data-study-score]")) {
      commitDeckSettingsState();
      syncCardEditor();
      return;
    }
    commitPickerState();
  });

  picker.querySelector('[data-flashcards-action="upload-bg"]')?.addEventListener("click", () => {
    backgroundUploadInput?.click();
  });

  picker.querySelector('[data-flashcards-action="clear-bg"]')?.addEventListener("click", () => {
    const nextConfig = getWorkingConfig();
    nextConfig.backgroundImage = "";
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
  });

  backgroundUploadInput?.addEventListener("change", async () => {
    const file = backgroundUploadInput.files?.[0] || null;
    if (!file) return;
    const nextConfig = getWorkingConfig();
    nextConfig.backgroundImage = await readFlashcardImageFile(file);
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    backgroundUploadInput.value = "";
  });

  picker.querySelector('[data-flashcards-action="upload-card-image"]')?.addEventListener("click", () => {
    cardImageUploadInput?.click();
  });

  picker.querySelector('[data-flashcards-action="clear-card-image"]')?.addEventListener("click", () => {
    if (imageInput) imageInput.value = "";
    commitPickerState();
  });

  cardImageUploadInput?.addEventListener("change", async () => {
    const file = cardImageUploadInput.files?.[0] || null;
    if (!file) return;
    if (imageInput) imageInput.value = await readFlashcardImageFile(file);
    commitPickerState();
    cardImageUploadInput.value = "";
  });

  prevCardBtn?.addEventListener("click", () => {
    const nextConfig = writeCurrentCardDraft();
    const cards = getFlashcardDeckCards(nextConfig);
    if (!cards.length) return;
    nextConfig.currentIndex = (nextConfig.currentIndex - 1 + cards.length) % cards.length;
    nextConfig.showBack = false;
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    syncCardEditor();
  });

  nextCardBtn?.addEventListener("click", () => {
    const nextConfig = writeCurrentCardDraft();
    const cards = getFlashcardDeckCards(nextConfig);
    if (!cards.length) return;
    nextConfig.currentIndex = (nextConfig.currentIndex + 1) % cards.length;
    nextConfig.showBack = false;
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    syncCardEditor();
  });

  addCardBtn?.addEventListener("click", () => {
    const nextConfig = writeCurrentCardDraft();
    if (nextConfig.sourceType !== "manual") return;
    nextConfig.manualCards.push(normalizeFlashcardDeckCard({
      id: `card-${Date.now()}`,
      frontTitle: "Front",
      frontBody: "",
      backTitle: "Back",
      backBody: ""
    }));
    nextConfig.currentIndex = nextConfig.manualCards.length - 1;
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    syncCardEditor();
  });

  deleteCardBtn?.addEventListener("click", () => {
    const nextConfig = writeCurrentCardDraft();
    if (nextConfig.sourceType !== "manual" || nextConfig.manualCards.length <= 1) return;
    nextConfig.manualCards.splice(nextConfig.currentIndex, 1);
    nextConfig.currentIndex = Math.max(0, Math.min(nextConfig.currentIndex, nextConfig.manualCards.length - 1));
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    syncCardEditor();
  });

  saveBtn?.addEventListener("click", () => {
    commitPickerState();
    syncCardEditor();
  });

  clearOverridesBtn?.addEventListener("click", () => {
    const nextConfig = getWorkingConfig();
    if (nextConfig.sourceType === "database") {
      const current = getFlashcardDeckCurrentCard(nextConfig);
      if (current.card) delete nextConfig.cardOverrides[current.card.id];
    } else {
      const card = nextConfig.manualCards[nextConfig.currentIndex];
      if (card) {
        card.template = "";
        card.surface = "";
      }
    }
    writeFlashcardDeckConfig(block, nextConfig);
    renderFlashcardDeckBlock(block);
    if (typeof saveState === "function") saveState();
    syncCardEditor();
  });
}

window.mountFlashcardDeckBlock = function mountFlashcardDeckBlock(block, options = {}) {
  if (!block || block.dataset.type !== "flashcards") return null;
  if (!block.dataset.flashcardsConfig) {
    writeFlashcardDeckConfig(block, normalizeFlashcardDeckConfig({}));
  }
  renderFlashcardDeckBlock(block);
  if (options.openPicker) {
    const anchor = block.querySelector(".flashcard-deck-config-btn") || block;
    openFlashcardDeckPicker(block, anchor);
  }
  return block;
};

function normalizeTypingDrillCheckMode(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["exact", "loose", "accepted", "contains", "manual", "ai"].includes(safe) ? safe : "loose";
}

function normalizeTypingDrillPoolMode(value = "") {
  return "all";
}

function normalizeTypingDrillOrder(value = "") {
  return String(value || "").trim().toLowerCase() === "ordered" ? "ordered" : "random";
}

function normalizeTypingDrillDisplaySize(value = "") {
  const safe = String(value || "").trim().toLowerCase();
  return ["compact", "standard", "wide"].includes(safe) ? safe : "standard";
}

function normalizeTypingDrillConfig(raw = {}) {
  return {
    title: String(raw?.title || "").trim() || "Typing Drill",
    sourceKind: raw?.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw?.sourcePageId || "").trim(),
    sourceBlockId: raw?.sourceKind === "block" ? String(raw?.sourceBlockId || "").trim() : "",
    promptFieldId: String(raw?.promptFieldId || "").trim(),
    answerFieldId: String(raw?.answerFieldId || "").trim(),
    hintFieldId: String(raw?.hintFieldId || "").trim(),
    extraFieldId: String(raw?.extraFieldId || "").trim(),
    acceptedFieldId: String(raw?.acceptedFieldId || "").trim(),
    checkMode: normalizeTypingDrillCheckMode(raw?.checkMode || "loose"),
    ignoreSpaces: raw?.ignoreSpaces !== false,
    ignorePunctuation: raw?.ignorePunctuation !== false,
    caseSensitive: !!raw?.caseSensitive,
    keywordText: String(raw?.keywordText || "").trim(),
    sessionLimit: Math.max(1, Math.min(100, Number(raw?.sessionLimit || 10) || 10)),
    order: normalizeTypingDrillOrder(raw?.order || "random"),
    poolMode: normalizeTypingDrillPoolMode(raw?.poolMode || "all"),
    displaySize: normalizeTypingDrillDisplaySize(raw?.displaySize || "standard"),
    showSourceChips: raw?.showSourceChips !== false,
    currentIndex: Math.max(0, Number(raw?.currentIndex || 0) || 0),
    seenRowIds: Array.isArray(raw?.seenRowIds) ? raw.seenRowIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 500) : [],
    userAnswer: String(raw?.userAnswer || ""),
    showHint: !!raw?.showHint,
    resultState: ["idle", "correct", "wrong"].includes(raw?.resultState) ? raw.resultState : "idle",
    lastCorrect: !!raw?.lastCorrect,
    feedbackState: ["", "correct", "wrong", "skipped", "reset"].includes(raw?.feedbackState) ? raw.feedbackState : "",
    feedbackText: String(raw?.feedbackText || "").trim(),
    scoreCorrect: Math.max(0, Number(raw?.scoreCorrect || 0) || 0),
    scoreTried: Math.max(0, Number(raw?.scoreTried || 0) || 0),
    scoreSkipped: Math.max(0, Number(raw?.scoreSkipped || 0) || 0),
    accentColor: normalizeMatchPairsAccent(raw?.accentColor),
    scoring: normalizeStudyScoreWriteback(raw?.scoring || {}, { correctChange: 2, incorrectChange: -1.5 })
  };
}

function readTypingDrillConfig(block) {
  if (!block) return normalizeTypingDrillConfig({});
  return normalizeTypingDrillConfig(parseFlashcardsJSON(block.dataset.typingDrillConfig || "", {}));
}

function writeTypingDrillConfig(block, config) {
  if (!block) return;
  block.dataset.typingDrillConfig = JSON.stringify(normalizeTypingDrillConfig(config));
}

function applyStudyToolAccent(block, accentColor = "") {
  if (!block) return;
  const normalized = normalizeMatchPairsAccent(accentColor);
  if (normalized) block.style.setProperty("--accent", normalized);
  else block.style.removeProperty("--accent");
}

function applyMatchPairsAccent(block, accentColor = "") {
  if (!block) return;
  const normalized = normalizeMatchPairsAccent(accentColor);
  const shellEl = block.querySelector(".match-pairs-shell");
  if (normalized) {
    block.style.setProperty("--match-accent", normalized);
    shellEl?.style.setProperty("--match-accent", normalized);
  } else {
    block.style.removeProperty("--match-accent");
    shellEl?.style.removeProperty("--match-accent");
  }
}

function getTypingDrillSourceData(config) {
  if (!config?.sourcePageId || typeof window.getDatabaseCalloutSourceData !== "function") return null;
  return window.getDatabaseCalloutSourceData({
    kind: config.sourceKind === "block" ? "block" : "page",
    pageId: config.sourcePageId,
    blockId: config.sourceKind === "block" ? config.sourceBlockId : ""
  });
}

function getFirstDatabaseCalloutSource() {
  const sources = typeof window.getDatabaseCalloutSources === "function" ? window.getDatabaseCalloutSources() : [];
  return Array.isArray(sources) ? sources[0] || null : null;
}

function applyDefaultStudySource(config = {}) {
  if (config?.sourcePageId) return config;
  const source = getFirstDatabaseCalloutSource();
  if (!source?.pageId) return config;
  return {
    ...config,
    sourceKind: source.kind === "block" ? "block" : "page",
    sourcePageId: source.pageId || "",
    sourceBlockId: source.kind === "block" ? source.blockId || "" : ""
  };
}

function getTypingDrillRowValue(row, propertyId = "") {
  if (!row || !propertyId) return "";
  if (propertyId === "__title__") return String(row.title || "").trim();
  return getFlashcardDeckValueText(row.values?.[propertyId]);
}

function inferTypingDrillFields(properties = [], current = {}) {
  const props = Array.isArray(properties) ? properties : [];
  const isValid = (value) => value === "__title__" || props.some((property) => property?.id === value);
  const safe = (value) => isValid(value) ? value : "";
  const hasValidMapping = ["promptFieldId", "answerFieldId", "hintFieldId", "extraFieldId", "acceptedFieldId"].some((key) => safe(current?.[key] || ""));
  if (hasValidMapping) {
    return {
      promptFieldId: safe(current.promptFieldId),
      answerFieldId: safe(current.answerFieldId),
      hintFieldId: safe(current.hintFieldId),
      extraFieldId: safe(current.extraFieldId),
      acceptedFieldId: safe(current.acceptedFieldId)
    };
  }
  const findByName = (patterns) => {
    const match = props.find((property) => patterns.some((pattern) => pattern.test(String(property?.name || "").trim().toLowerCase())));
    return match?.id || "";
  };
  return {
    promptFieldId: findByName([/prompt|question|front|english|term/]) || "__title__",
    answerFieldId: findByName([/answer|back|hiragana|definition|meaning|value/]) || props[0]?.id || "",
    hintFieldId: findByName([/hint|romaji|note/]),
    extraFieldId: findByName([/extra|example|sentence|context/]),
    acceptedFieldId: findByName([/accepted|alternate|alias|also/])
  };
}

function normalizeTypingDrillAnswer(value = "", options = {}) {
  let text = String(value || "");
  text = text.trim();
  if (options.ignorePunctuation) text = text.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~。、，．！？：；「」『』（）［］｛｝]/g, "");
  if (options.ignoreSpaces) text = text.replace(/\s+/g, "");
  else text = text.replace(/\s+/g, " ");
  if (!options.caseSensitive) text = text.toLowerCase();
  return text;
}

function splitTypingDrillAnswers(value = "") {
  return String(value || "")
    .split(/\r?\n|[;,|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getTypingDrillAcceptedAnswers(row, config) {
  const answers = [getTypingDrillRowValue(row, config.answerFieldId)];
  if (config.acceptedFieldId) {
    answers.push(...splitTypingDrillAnswers(getTypingDrillRowValue(row, config.acceptedFieldId)));
  }
  return answers.filter(Boolean);
}

function checkTypingDrillAnswer(row, config, userAnswer = "") {
  const answers = getTypingDrillAcceptedAnswers(row, config);
  const primaryAnswer = answers[0] || "";
  if (!row || !primaryAnswer) return { correct: false, primaryAnswer, note: "No answer field is mapped yet." };
  if (config.checkMode === "manual" || config.checkMode === "ai") {
    return { correct: false, primaryAnswer, note: config.checkMode === "ai" ? "AI check can be connected later. Grade this one manually for now." : "Grade this one manually." };
  }
  if (config.checkMode === "contains") {
    const keywords = splitTypingDrillAnswers(config.keywordText || primaryAnswer.replace(/\s+/g, "|"));
    const haystack = normalizeTypingDrillAnswer(userAnswer, {
      ignoreSpaces: false,
      ignorePunctuation: config.ignorePunctuation,
      caseSensitive: config.caseSensitive
    });
    const missing = keywords.filter((keyword) => !haystack.includes(normalizeTypingDrillAnswer(keyword, {
      ignoreSpaces: false,
      ignorePunctuation: config.ignorePunctuation,
      caseSensitive: config.caseSensitive
    })));
    return { correct: missing.length === 0, primaryAnswer, note: missing.length ? `Missing: ${missing.join(", ")}` : "Contains the required parts." };
  }
  const options = config.checkMode === "exact"
    ? { ignoreSpaces: false, ignorePunctuation: false, caseSensitive: true }
    : {
        ignoreSpaces: config.ignoreSpaces,
        ignorePunctuation: config.ignorePunctuation,
        caseSensitive: config.caseSensitive
      };
  const submitted = normalizeTypingDrillAnswer(userAnswer, options);
  const correct = answers.some((answer) => normalizeTypingDrillAnswer(answer, options) === submitted);
  return { correct, primaryAnswer, note: correct ? "Correct." : "Not quite." };
}

function typingDrillUsesManualGrade(config) {
  return config?.checkMode === "manual" || config?.checkMode === "ai";
}

function rowMatchesTypingDrillPool() {
  return true;
}

function getTypingDrillItems(config) {
  const sourceData = getTypingDrillSourceData(config);
  const rows = sourceData?.database?.rows || [];
  const properties = sourceData?.database?.properties || [];
  if (!rows.length) return { sourceData, rows: [], properties };
  const filtered = rows
    .filter((row) => rowMatchesTypingDrillPool(row, properties, config))
    .filter((row) => getTypingDrillRowValue(row, config.promptFieldId) || getTypingDrillRowValue(row, config.answerFieldId));
  const limit = Math.max(1, config.sessionLimit || 10);
  return { sourceData, properties, rows: filtered.slice(0, limit) };
}

function getTypingDrillCurrent(config) {
  const payload = getTypingDrillItems(config);
  if (!payload.rows.length) return { ...payload, row: null, index: 0 };
  const index = Math.max(0, Math.min(config.currentIndex || 0, payload.rows.length - 1));
  return { ...payload, row: payload.rows[index], index };
}

function buildTypingDrillScoreText(config) {
  const tried = Math.max(0, Number(config?.scoreTried || 0) || 0);
  const correct = Math.max(0, Number(config?.scoreCorrect || 0) || 0);
  const skipped = Math.max(0, Number(config?.scoreSkipped || 0) || 0);
  const percent = tried ? Math.round((correct / tried) * 100) : 0;
  return tried ? `${correct}/${tried} · ${percent}%${skipped ? ` · ${skipped} skipped` : ""}` : "0/0";
}

function renderTypingDrillBlock(block) {
  if (!block || block.dataset.type !== "typing-drill") return null;
  let config = readTypingDrillConfig(block);
  if (!config.sourcePageId) {
    config = normalizeTypingDrillConfig(applyDefaultStudySource(config));
    if (config.sourcePageId) writeTypingDrillConfig(block, config);
  }
  const sourceForFields = getTypingDrillSourceData(config);
  if (sourceForFields?.database?.properties?.length && (!config.promptFieldId || !config.answerFieldId)) {
    config = normalizeTypingDrillConfig({ ...config, ...inferTypingDrillFields(sourceForFields.database.properties, config) });
    writeTypingDrillConfig(block, config);
  }
  const { sourceData, rows, row, index } = getTypingDrillCurrent(config);
  const titleEl = block.querySelector(".typing-drill-title");
  const countEl = block.querySelector(".typing-drill-count");
  const scoreEl = block.querySelector(".typing-drill-score");
  const databaseChip = block.querySelector('[data-typing-drill-chip="database"]');
  const filterChip = block.querySelector('[data-typing-drill-chip="filter"]');
  const promptEl = block.querySelector(".typing-drill-prompt");
  const extraEl = block.querySelector(".typing-drill-extra");
  const hintEl = block.querySelector(".typing-drill-hint");
  const inputEl = block.querySelector('[data-typing-drill-input="answer"]');
  const statusEl = block.querySelector(".typing-drill-status");
  const resultEl = block.querySelector(".typing-drill-result");
  const answerEl = block.querySelector(".typing-drill-correct-answer");
  const noteEl = block.querySelector(".typing-drill-result-note");
  const checkBtn = block.querySelector('[data-typing-drill-action="check"]');
  const hintBtn = block.querySelector('[data-typing-drill-action="hint"]');
  const skipBtn = block.querySelector('[data-typing-drill-action="skip"]');
  const backBtn = block.querySelector('[data-typing-drill-action="back"]');
  const resetBtn = block.querySelector('[data-typing-drill-action="reset"]');
  const checked = config.resultState === "correct" || config.resultState === "wrong";
  const check = checked ? checkTypingDrillAnswer(row, config, config.userAnswer) : null;
  const feedbackState = checked ? config.resultState : config.feedbackState;

  if (titleEl) titleEl.textContent = config.title || "Typing Drill";
  applyStudyToolAccent(block, config.accentColor);
  block.dataset.typingDrillFeedback = feedbackState || "";
  block.dataset.typingDrillSize = config.displaySize || "standard";
  block.dataset.studyChrome = config.showSourceChips ? "shown" : "minimal";
  if (countEl) countEl.textContent = rows.length ? `${index + 1} / ${rows.length}` : "0 items";
  if (scoreEl) scoreEl.textContent = buildTypingDrillScoreText(config);
  if (databaseChip) databaseChip.textContent = sourceData?.database?.title || "No database";
  if (filterChip) filterChip.textContent = "All rows";
  if (promptEl) promptEl.textContent = row ? (getTypingDrillRowValue(row, config.promptFieldId) || "No prompt mapped.") : "Choose a database and fields to start.";
  if (extraEl) {
    const extraText = row ? getTypingDrillRowValue(row, config.extraFieldId) : "";
    extraEl.textContent = extraText;
    extraEl.hidden = !extraText;
  }
  if (hintEl) {
    const hintText = row ? getTypingDrillRowValue(row, config.hintFieldId) : "";
    hintEl.textContent = hintText ? `Hint: ${hintText}` : "";
    hintEl.hidden = !config.showHint || !hintText;
  }
  if (inputEl && (document.activeElement !== inputEl || !config.userAnswer)) inputEl.value = config.userAnswer || "";
  if (statusEl) {
    statusEl.textContent = checked
      ? (config.resultState === "correct" ? "Correct. Press Enter or Next." : "Not quite. Correct answer shown below.")
      : (config.feedbackText || "");
    statusEl.hidden = !statusEl.textContent;
    statusEl.dataset.state = feedbackState || "";
  }
  const showCorrectAnswer = config.resultState === "wrong";
  if (resultEl) resultEl.hidden = !showCorrectAnswer;
  if (answerEl) answerEl.textContent = showCorrectAnswer ? (check?.primaryAnswer || "") : "";
  if (noteEl) {
    noteEl.textContent = showCorrectAnswer ? (check?.note || "") : "";
    noteEl.dataset.correct = showCorrectAnswer && check?.correct ? "1" : "0";
  }
  if (checkBtn) {
    checkBtn.disabled = !row || config.resultState === "wrong";
    checkBtn.textContent = config.resultState === "correct" ? "Next" : "Check";
  }
  if (hintBtn) hintBtn.disabled = !row || !config.hintFieldId;
  if (skipBtn) skipBtn.disabled = !row;
  if (backBtn) backBtn.disabled = !rows.length;
  if (resetBtn) resetBtn.disabled = !rows.length && !config.userAnswer && config.resultState === "idle";
  if (row && config.resultState !== "correct" && config.resultState !== "wrong") {
    markStudyPromptSeen(block, {
      tool: "Typing Drill",
      rowId: row.id || "",
      prompt: getTypingDrillRowValue(row, config.promptFieldId),
      expected: getTypingDrillRowValue(row, config.answerFieldId)
    });
  }
  return block;
}

function closeTypingDrillPicker() {
  document.querySelector(".topbar-dropdown.typing-drill-picker")?.remove();
}

function positionTypingDrillPicker(picker, block, anchorEl = null) {
  if (!picker || !block) return;
  const viewportPadding = 12;
  const gap = 12;
  const blockRect = block.getBoundingClientRect();
  const anchorRect = (anchorEl || block).getBoundingClientRect();
  const pickerWidth = picker.offsetWidth || 320;
  const pickerHeight = picker.offsetHeight || 460;
  const spaceRight = window.innerWidth - blockRect.right - viewportPadding;
  const spaceLeft = blockRect.left - viewportPadding;
  let left = blockRect.right + gap;

  if (spaceRight >= pickerWidth + gap) {
    left = blockRect.right + gap;
  } else if (spaceLeft >= pickerWidth + gap) {
    left = blockRect.left - pickerWidth - gap;
  } else {
    const anchorRightAligned = anchorRect.right - pickerWidth;
    left = Math.max(viewportPadding, Math.min(window.innerWidth - pickerWidth - viewportPadding, anchorRightAligned));
  }

  let top = blockRect.top;
  if (top + pickerHeight > window.innerHeight - viewportPadding) {
    top = window.innerHeight - pickerHeight - viewportPadding;
  }
  if (top < viewportPadding) top = viewportPadding;

  picker.style.left = `${Math.round(left)}px`;
  picker.style.top = `${Math.floor(top)}px`;
  const fittedRect = picker.getBoundingClientRect();
  if (fittedRect.bottom > window.innerHeight - viewportPadding) {
    picker.style.top = `${Math.floor(Math.max(viewportPadding, window.innerHeight - viewportPadding - fittedRect.height))}px`;
  }
}

function watchStudyToolPickerPosition(picker, block, anchorEl = null) {
  if (!picker || !block) return;
  picker.querySelectorAll("details").forEach((detailsEl) => {
    detailsEl.addEventListener("toggle", () => {
      window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorEl));
    });
  });
}

function getTypingDrillDisplayDimensions(size = "standard") {
  const safe = normalizeTypingDrillDisplaySize(size);
  const snapValue = typeof snap === "function" ? snap : (value) => value;
  if (safe === "compact") return { width: snapValue(GRID_SIZE * 10), height: snapValue(GRID_SIZE * 5) };
  if (safe === "wide") return { width: snapValue(GRID_SIZE * 20), height: snapValue(GRID_SIZE * 8) };
  return { width: snapValue(GRID_SIZE * 14), height: snapValue(GRID_SIZE * 8) };
}

function applyTypingDrillDisplaySize(block, size = "standard") {
  if (!block) return;
  const dimensions = getTypingDrillDisplayDimensions(size);
  block.style.width = `${dimensions.width}px`;
  block.style.height = `${dimensions.height}px`;
}

function openTypingDrillPicker(block, anchorEl = null) {
  if (!block || block.dataset.type !== "typing-drill") return;
  closeTypingDrillPicker();
  const config = readTypingDrillConfig(block);
  const sources = typeof window.getDatabaseCalloutSources === "function" ? window.getDatabaseCalloutSources() : [];
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown typing-drill-picker study-tool-picker";
  picker.dataset.uiId = "topbarDropdown";
  picker.innerHTML = `
    <div class="study-tool-picker-head"><strong>Typing Drill</strong><button type="button" data-typing-drill-action="close" aria-label="Close">×</button></div>
    <div class="typing-drill-picker-tabs">
      <button type="button" class="active" data-typing-drill-tab="setup">Basic</button>
      <button type="button" data-typing-drill-tab="session">Session</button>
      <button type="button" data-typing-drill-tab="advanced">Advanced</button>
      <button type="button" data-typing-drill-tab="style">Style</button>
    </div>
    <div class="typing-drill-picker-panel active" data-typing-drill-panel="setup">
      <label class="typing-drill-picker-field">
        <span>Title</span>
        <input type="text" data-typing-drill-setting="title" />
      </label>
      <details class="typing-drill-picker-section" open>
        <summary>Source</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Database</span><select data-typing-drill-setting="source"></select></label>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Fields</summary>
        <div class="typing-drill-picker-section-body">
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Prompt</span><select data-typing-drill-setting="prompt"></select></label>
            <label class="typing-drill-picker-field"><span>Answer</span><select data-typing-drill-setting="answer"></select></label>
          </div>
          <label class="typing-drill-picker-field"><span>Hint</span><select data-typing-drill-setting="hint"></select></label>
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-typing-drill-panel="advanced">
      <details class="typing-drill-picker-section">
        <summary>Answer checking</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field">
            <span>Mode</span>
            <select data-typing-drill-setting="mode">
              <option value="exact">Exact</option>
              <option value="loose">Loose</option>
              <option value="accepted">Also Accept</option>
              <option value="contains">Keywords</option>
              <option value="manual">Manual</option>
              <option value="ai">AI</option>
            </select>
          </label>
          <div class="typing-drill-picker-help" data-typing-drill-mode-help></div>
          <label class="typing-drill-picker-field" data-typing-drill-mode-panel="accepted"><span>Also Accept Field</span><select data-typing-drill-setting="accepted"></select></label>
          <label class="typing-drill-picker-field" data-typing-drill-mode-panel="contains"><span>Required keywords</span><input type="text" data-typing-drill-setting="keywords" placeholder="function, return" /></label>
          <div class="typing-drill-picker-toggles" data-typing-drill-mode-panel="loose">
            <label><input type="checkbox" data-typing-drill-setting="ignoreSpaces" /> Ignore spaces</label>
            <label><input type="checkbox" data-typing-drill-setting="ignorePunctuation" /> Ignore punctuation</label>
            <label><input type="checkbox" data-typing-drill-setting="caseSensitive" /> Case sensitive</label>
          </div>
          <div class="typing-drill-picker-toggles" data-typing-drill-mode-panel="manual ai">
            <span>Show correct answer after submit</span>
            <span>Self-grade buttons</span>
          </div>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Extra display</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Extra field</span><select data-typing-drill-setting="extra"></select></label>
        </div>
      </details>
      <details class="typing-drill-picker-section">
        <summary>Score write-back</summary>
        <div class="typing-drill-picker-section-body">
          ${buildStudyScoreSettingsHTML("typing")}
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-typing-drill-panel="session">
      <details class="typing-drill-picker-section" open>
        <summary>Session</summary>
        <div class="typing-drill-picker-section-body">
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Number of items</span><input type="number" min="1" max="100" data-typing-drill-setting="limit" /></label>
            <label class="typing-drill-picker-field"><span>Order</span><select data-typing-drill-setting="order"><option value="random">Random</option><option value="ordered">Ordered</option></select></label>
          </div>
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-typing-drill-panel="style">
      <details class="typing-drill-picker-section" open>
        <summary>Display</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Display size</span><select data-typing-drill-setting="size"><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
          <label class="match-pairs-toggle"><input type="checkbox" data-typing-drill-setting="source-chips" /> Show database/filter chips</label>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Color</summary>
        <div class="typing-drill-picker-section-body">
          <label class="match-pairs-toggle"><input type="checkbox" data-typing-drill-setting="custom-accent" /> Custom accent</label>
          <label class="typing-drill-picker-field"><span>Accent color</span><input type="color" data-typing-drill-setting="accent" /></label>
          <div class="typing-drill-picker-help">Leave custom accent off to follow this page's theme color.</div>
        </div>
      </details>
    </div>
  `;
  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  picker.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(picker);
  picker.querySelector('[data-typing-drill-action="close"]')?.addEventListener("click", closeTypingDrillPicker);

  const anchorTarget = anchorEl || block.querySelector(".typing-drill-config-btn") || block;
  positionTypingDrillPicker(picker, block, anchorTarget);
  watchStudyToolPickerPosition(picker, block, anchorTarget);

  const titleInput = picker.querySelector('[data-typing-drill-setting="title"]');
  const sourceSelect = picker.querySelector('[data-typing-drill-setting="source"]');
  const promptSelect = picker.querySelector('[data-typing-drill-setting="prompt"]');
  const answerSelect = picker.querySelector('[data-typing-drill-setting="answer"]');
  const hintSelect = picker.querySelector('[data-typing-drill-setting="hint"]');
  const extraSelect = picker.querySelector('[data-typing-drill-setting="extra"]');
  const acceptedSelect = picker.querySelector('[data-typing-drill-setting="accepted"]');
  const modeSelect = picker.querySelector('[data-typing-drill-setting="mode"]');
  const keywordInput = picker.querySelector('[data-typing-drill-setting="keywords"]');
  const modeHelp = picker.querySelector("[data-typing-drill-mode-help]");
  const ignoreSpacesInput = picker.querySelector('[data-typing-drill-setting="ignoreSpaces"]');
  const ignorePunctuationInput = picker.querySelector('[data-typing-drill-setting="ignorePunctuation"]');
  const caseSensitiveInput = picker.querySelector('[data-typing-drill-setting="caseSensitive"]');
  const limitInput = picker.querySelector('[data-typing-drill-setting="limit"]');
  const orderSelect = picker.querySelector('[data-typing-drill-setting="order"]');
  const sizeSelect = picker.querySelector('[data-typing-drill-setting="size"]');
  const showSourceChipsInput = picker.querySelector('[data-typing-drill-setting="source-chips"]');
  const customAccentInput = picker.querySelector('[data-typing-drill-setting="custom-accent"]');
  const accentInput = picker.querySelector('[data-typing-drill-setting="accent"]');

  const sourceKey = (source) => `${source.kind}:${source.pageId}:${source.blockId || ""}`;
  const selectedSourceKey = () => sourceSelect?.value || "";
  const selectedSource = () => sources.find((source) => sourceKey(source) === selectedSourceKey()) || null;
  const fillPropertySelect = (selectEl, properties, selectedValue, includeTitle = true) => {
    if (!selectEl) return;
    const options = [{ value: "", label: "None" }];
    if (includeTitle) options.push({ value: "__title__", label: "Row title" });
    (properties || []).forEach((property) => options.push({ value: property.id, label: property.name || "Property" }));
    selectEl.innerHTML = options.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("");
    selectEl.value = selectedValue || "";
    if (selectEl.value !== (selectedValue || "")) selectEl.value = "";
  };

  function setTypingDrillPickerTab(tabName = "setup") {
    const safeTab = ["setup", "advanced", "session", "style"].includes(tabName) ? tabName : "setup";
    picker.querySelectorAll("[data-typing-drill-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.typingDrillTab === safeTab);
    });
    picker.querySelectorAll("[data-typing-drill-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.typingDrillPanel === safeTab);
    });
    window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
  }

  picker.querySelector(".typing-drill-picker-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-typing-drill-tab]");
    if (!button) return;
    event.preventDefault();
    setTypingDrillPickerTab(button.dataset.typingDrillTab || "setup");
  });

  function getWorkingTypingConfig() {
    const base = readTypingDrillConfig(block);
    const src = selectedSource();
    const selectValue = (selectEl, fallback = "") => {
      if (!selectEl || !selectEl.options || selectEl.options.length === 0) return fallback;
      return selectEl.value;
    };
    return normalizeTypingDrillConfig({
      ...base,
      title: titleInput?.value || base.title,
      sourceKind: src?.kind || base.sourceKind,
      sourcePageId: src?.pageId || base.sourcePageId,
      sourceBlockId: src?.blockId || base.sourceBlockId,
      promptFieldId: selectValue(promptSelect, base.promptFieldId),
      answerFieldId: selectValue(answerSelect, base.answerFieldId),
      hintFieldId: selectValue(hintSelect, base.hintFieldId),
      extraFieldId: selectValue(extraSelect, base.extraFieldId),
      acceptedFieldId: selectValue(acceptedSelect, base.acceptedFieldId),
      checkMode: modeSelect?.value || base.checkMode,
      ignoreSpaces: !!ignoreSpacesInput?.checked,
      ignorePunctuation: !!ignorePunctuationInput?.checked,
      caseSensitive: !!caseSensitiveInput?.checked,
      keywordText: keywordInput?.value || "",
      sessionLimit: limitInput?.value || base.sessionLimit,
      order: orderSelect?.value || base.order,
      poolMode: "all",
      displaySize: sizeSelect?.value || base.displaySize,
      showSourceChips: !!showSourceChipsInput?.checked,
      accentColor: customAccentInput?.checked ? accentInput?.value : "",
      scoring: readStudyScoreSettings(picker, "typing", base.scoring, { correctChange: 2, incorrectChange: -1.5 }),
      resultState: "idle",
      userAnswer: "",
      showHint: false,
      seenRowIds: [],
      scoreCorrect: 0,
      scoreTried: 0,
      scoreSkipped: 0,
      feedbackState: "reset",
      feedbackText: "Settings updated. Session reset."
    });
  }

  function saveTypingConfig() {
    const previousConfig = readTypingDrillConfig(block);
    const nextConfig = getWorkingTypingConfig();
    writeTypingDrillConfig(block, nextConfig);
    if (nextConfig.displaySize !== previousConfig.displaySize) {
      applyTypingDrillDisplaySize(block, nextConfig.displaySize);
      window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
    }
    renderTypingDrillBlock(block);
    if (typeof saveState === "function") saveState();
    return nextConfig;
  }

  function syncModePanels() {
    const mode = normalizeTypingDrillCheckMode(modeSelect?.value || "loose");
    const helpText = {
      exact: "Answer must match exactly.",
      loose: "Ignores small formatting differences like spaces and punctuation.",
      accepted: "Checks the answer plus anything in the Also Accept field.",
      contains: "Answer must include the required keywords.",
      manual: "User checks their own answer after seeing the correct one.",
      ai: "Uses AI to judge flexible or open-ended answers."
    };
    if (modeHelp) modeHelp.textContent = helpText[mode] || helpText.loose;
    picker.querySelectorAll("[data-typing-drill-mode-panel]").forEach((panel) => {
      const modes = String(panel.dataset.typingDrillModePanel || "").split(/\s+/).filter(Boolean);
      panel.hidden = !modes.includes(mode);
    });
  }

  function syncPicker() {
    const working = getWorkingTypingConfig();
    const sourceData = getTypingDrillSourceData(working);
    const properties = sourceData?.database?.properties || [];
    const inferred = inferTypingDrillFields(properties, working);
    fillPropertySelect(promptSelect, properties, inferred.promptFieldId);
    fillPropertySelect(answerSelect, properties, inferred.answerFieldId);
    fillPropertySelect(hintSelect, properties, inferred.hintFieldId);
    fillPropertySelect(extraSelect, properties, inferred.extraFieldId);
    fillPropertySelect(acceptedSelect, properties, working.acceptedFieldId);
    syncStudyScoreSettings(picker, "typing", properties, working.scoring, { correctChange: 2, incorrectChange: -1.5 });
    syncModePanels();
  }

  sourceSelect.innerHTML = sources.map((source) => `<option value="${escapeHTML(sourceKey(source))}">${escapeHTML(source.label || source.title || "Database")}</option>`).join("");
  const currentSourceValue = `${config.sourceKind}:${config.sourcePageId}:${config.sourceBlockId || ""}`;
  if (sourceSelect.querySelector(`option[value="${CSS.escape(currentSourceValue)}"]`)) sourceSelect.value = currentSourceValue;
  else if (sources[0]) sourceSelect.value = sourceKey(sources[0]);
  if (titleInput) titleInput.value = config.title;
  if (modeSelect) modeSelect.value = config.checkMode;
  if (keywordInput) keywordInput.value = config.keywordText;
  if (ignoreSpacesInput) ignoreSpacesInput.checked = !!config.ignoreSpaces;
  if (ignorePunctuationInput) ignorePunctuationInput.checked = !!config.ignorePunctuation;
  if (caseSensitiveInput) caseSensitiveInput.checked = !!config.caseSensitive;
  if (limitInput) limitInput.value = String(config.sessionLimit || 10);
  if (orderSelect) orderSelect.value = config.order;
  if (sizeSelect) sizeSelect.value = config.displaySize || "standard";
  if (showSourceChipsInput) showSourceChipsInput.checked = config.showSourceChips !== false;
  if (customAccentInput) customAccentInput.checked = !!config.accentColor;
  if (accentInput) {
    accentInput.value = config.accentColor || "#7b9cff";
    accentInput.disabled = !customAccentInput?.checked;
  }
  syncPicker();
  if ((!config.sourcePageId || !getTypingDrillSourceData(config)) && selectedSource()) {
    const seededConfig = getWorkingTypingConfig();
    writeTypingDrillConfig(block, seededConfig);
    renderTypingDrillBlock(block);
    if (typeof saveState === "function") saveState();
  }

  const syncTypingAccentControls = () => {
    if (accentInput && customAccentInput) accentInput.disabled = !customAccentInput.checked;
    applyStudyToolAccent(block, customAccentInput?.checked ? accentInput?.value : "");
  };

  const saveTypingAccentOnly = () => {
    const next = readTypingDrillConfig(block);
    next.accentColor = customAccentInput?.checked ? (accentInput?.value || "") : "";
    writeTypingDrillConfig(block, next);
    syncTypingAccentControls();
    if (typeof saveState === "function") saveState();
  };

  picker.addEventListener("change", (event) => {
    if (event.target === customAccentInput || event.target === accentInput) {
      saveTypingAccentOnly();
      return;
    }
    saveTypingConfig();
    syncPicker();
  });
  picker.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target === accentInput) {
      saveTypingAccentOnly();
      return;
    }
    saveTypingConfig();
    syncPicker();
  });
}

function resetTypingDrillCardState(config) {
  config.userAnswer = "";
  config.showHint = false;
  config.resultState = "idle";
  config.lastCorrect = false;
  return config;
}

function advanceTypingDrill(block, options = {}) {
  const config = readTypingDrillConfig(block);
  const { rows } = getTypingDrillItems(config);
  if (!rows.length) return config;
  const currentRow = rows[Math.max(0, Math.min(config.currentIndex || 0, rows.length - 1))] || null;
  if (currentRow?.id && !config.seenRowIds.includes(currentRow.id)) config.seenRowIds.push(currentRow.id);
  if (config.order === "random") {
    let candidates = rows
      .map((row, index) => ({ row, index }))
      .filter((entry) => entry.index !== config.currentIndex && !config.seenRowIds.includes(entry.row.id));
    if (!candidates.length) {
      config.seenRowIds = currentRow?.id ? [currentRow.id] : [];
      candidates = rows.map((row, index) => ({ row, index })).filter((entry) => entry.index !== config.currentIndex);
    }
    const fallbackIndex = rows.length > 1 ? (config.currentIndex + 1) % rows.length : 0;
    const picked = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : { index: fallbackIndex };
    config.currentIndex = picked.index;
  } else {
    config.currentIndex = (config.currentIndex + 1) % rows.length;
  }
  resetTypingDrillCardState(config);
  config.feedbackState = "";
  config.feedbackText = "";
  if (options.feedbackState || options.feedbackText) {
    config.feedbackState = options.feedbackState || "";
    config.feedbackText = options.feedbackText || "";
  }
  return config;
}

function moveTypingDrillBack(block) {
  const config = readTypingDrillConfig(block);
  const { rows } = getTypingDrillItems(config);
  if (!rows.length) return config;
  config.currentIndex = (config.currentIndex - 1 + rows.length) % rows.length;
  resetTypingDrillCardState(config);
  config.feedbackState = "";
  config.feedbackText = "";
  return config;
}

function resetTypingDrill(block) {
  const config = readTypingDrillConfig(block);
  getBlockStudySessionId(block, true);
  config.currentIndex = 0;
  config.seenRowIds = [];
  resetTypingDrillCardState(config);
  config.feedbackState = "reset";
  config.feedbackText = "Session reset.";
  config.scoreCorrect = 0;
  config.scoreTried = 0;
  config.scoreSkipped = 0;
  return config;
}

function markTypingDrillCorrectAndAdvance(block) {
  return advanceTypingDrill(block, {
    feedbackState: "",
    feedbackText: ""
  });
}

function submitTypingDrillAnswer(block, userAnswer = "") {
  const config = readTypingDrillConfig(block);
  const answerText = String(userAnswer || "").trim();
  if (config.resultState === "correct") {
    return markTypingDrillCorrectAndAdvance(block);
  }
  if (!answerText || config.resultState === "wrong") return config;

  config.userAnswer = userAnswer || "";
  const current = getTypingDrillCurrent(config);
  const { row } = current;
  const check = checkTypingDrillAnswer(row, config, config.userAnswer);
  config.resultState = check.correct ? "correct" : "wrong";
  config.lastCorrect = check.correct;
  config.feedbackState = check.correct ? "correct" : "wrong";
  config.feedbackText = "";
  config.scoreTried += 1;
  if (check.correct) config.scoreCorrect += 1;
  if (!["manual", "ai"].includes(config.checkMode)) applyStudyScoreWriteback(config, row?.id || "", check.correct);
  recordStudyActivity(block, config, {
    tool: "Typing Drill",
    rowId: row?.id || "",
    prompt: row ? getTypingDrillRowValue(row, config.promptFieldId) : "",
    answer: config.userAnswer,
    expected: check.primaryAnswer || "",
    result: check.correct ? "correct" : "incorrect",
    total: current.rows?.length || 0,
    durationMs: getStudyPromptDuration(block, {
      tool: "Typing Drill",
      rowId: row?.id || "",
      prompt: row ? getTypingDrillRowValue(row, config.promptFieldId) : "",
      expected: row ? getTypingDrillRowValue(row, config.answerFieldId) : ""
    })
  });
  return config;
}

window.mountTypingDrillBlock = function mountTypingDrillBlock(block, options = {}) {
  if (!block || block.dataset.type !== "typing-drill") return null;
  if (!block.dataset.typingDrillConfig) {
    writeTypingDrillConfig(block, normalizeTypingDrillConfig({}));
  }
  renderTypingDrillBlock(block);
  if (options.openPicker) {
    const anchor = block.querySelector(".typing-drill-config-btn") || block;
    openTypingDrillPicker(block, anchor);
  }
  return block;
};

function normalizeFillBlankConfig(raw = {}) {
  return {
    title: String(raw?.title || "").trim() || "Fill-in-the-Blank",
    sourceKind: raw?.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw?.sourcePageId || "").trim(),
    sourceBlockId: raw?.sourceKind === "block" ? String(raw?.sourceBlockId || "").trim() : "",
    promptFieldId: String(raw?.promptFieldId || "").trim(),
    answerFieldId: String(raw?.answerFieldId || "").trim(),
    hintFieldId: String(raw?.hintFieldId || "").trim(),
    extraFieldId: String(raw?.extraFieldId || "").trim(),
    acceptedFieldId: String(raw?.acceptedFieldId || "").trim(),
    checkMode: normalizeTypingDrillCheckMode(raw?.checkMode || "loose"),
    ignoreSpaces: raw?.ignoreSpaces !== false,
    ignorePunctuation: raw?.ignorePunctuation !== false,
    caseSensitive: !!raw?.caseSensitive,
    keywordText: String(raw?.keywordText || "").trim(),
    sessionLimit: Math.max(1, Math.min(100, Number(raw?.sessionLimit || 10) || 10)),
    order: normalizeTypingDrillOrder(raw?.order || "random"),
    displaySize: normalizeTypingDrillDisplaySize(raw?.displaySize || "standard"),
    showSourceChips: raw?.showSourceChips !== false,
    currentIndex: Math.max(0, Number(raw?.currentIndex || 0) || 0),
    seenRowIds: Array.isArray(raw?.seenRowIds) ? raw.seenRowIds.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 500) : [],
    answers: Array.isArray(raw?.answers) ? raw.answers.map((value) => String(value || "")).slice(0, 30) : [],
    showHint: !!raw?.showHint,
    resultState: ["idle", "correct", "wrong"].includes(raw?.resultState) ? raw.resultState : "idle",
    feedbackState: ["", "correct", "wrong", "skipped", "reset"].includes(raw?.feedbackState) ? raw.feedbackState : "",
    feedbackText: String(raw?.feedbackText || "").trim(),
    scoreCorrect: Math.max(0, Number(raw?.scoreCorrect || 0) || 0),
    scoreTried: Math.max(0, Number(raw?.scoreTried || 0) || 0),
    scoreSkipped: Math.max(0, Number(raw?.scoreSkipped || 0) || 0),
    accentColor: normalizeMatchPairsAccent(raw?.accentColor),
    scoring: normalizeStudyScoreWriteback(raw?.scoring || {}, { correctChange: 1.5, incorrectChange: -1 })
  };
}

function readFillBlankConfig(block) {
  if (!block) return normalizeFillBlankConfig({});
  return normalizeFillBlankConfig(parseFlashcardsJSON(block.dataset.fillBlankConfig || "", {}));
}

function writeFillBlankConfig(block, config) {
  if (!block) return;
  block.dataset.fillBlankConfig = JSON.stringify(normalizeFillBlankConfig(config));
}

function getFillBlankSourceData(config) {
  return getTypingDrillSourceData(config);
}

function getFillBlankRowValue(row, propertyId = "") {
  return getTypingDrillRowValue(row, propertyId);
}

function inferFillBlankFields(properties = [], current = {}) {
  const inferred = inferTypingDrillFields(properties, {
    promptFieldId: current.promptFieldId,
    answerFieldId: current.answerFieldId,
    hintFieldId: current.hintFieldId,
    extraFieldId: current.extraFieldId,
    acceptedFieldId: current.acceptedFieldId
  });
  return {
    promptFieldId: inferred.promptFieldId,
    answerFieldId: inferred.answerFieldId,
    hintFieldId: inferred.hintFieldId,
    extraFieldId: inferred.extraFieldId,
    acceptedFieldId: inferred.acceptedFieldId
  };
}

function getFillBlankItems(config) {
  const sourceData = getFillBlankSourceData(config);
  const rows = sourceData?.database?.rows || [];
  const properties = sourceData?.database?.properties || [];
  const filtered = rows.filter((row) => getFillBlankRowValue(row, config.promptFieldId) || getFillBlankRowValue(row, config.answerFieldId));
  const limit = Math.max(1, config.sessionLimit || 10);
  return { sourceData, properties, rows: filtered.slice(0, limit) };
}

function getFillBlankCurrent(config) {
  const payload = getFillBlankItems(config);
  if (!payload.rows.length) return { ...payload, row: null, index: 0 };
  const index = Math.max(0, Math.min(config.currentIndex || 0, payload.rows.length - 1));
  return { ...payload, row: payload.rows[index], index };
}

function splitFillBlankParts(promptText = "") {
  const parts = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(String(promptText || "")))) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: promptText.slice(lastIndex, match.index) });
    }
    parts.push({ type: "blank", name: String(match[1] || "").trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < String(promptText || "").length) {
    parts.push({ type: "text", text: String(promptText || "").slice(lastIndex) });
  }
  return parts;
}

function parseFillBlankNamedValues(value = "") {
  const raw = String(value || "").trim();
  const named = new Map();
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:\n]+?)\s*:\s*(.+?)\s*$/);
    if (!match) return;
    named.set(String(match[1] || "").trim().toLowerCase(), String(match[2] || "").trim());
  });
  return { raw, named };
}

function getFillBlankExpectedAnswers(row, config, parts = []) {
  const answerField = parseFillBlankNamedValues(getFillBlankRowValue(row, config.answerFieldId));
  const blanks = parts.filter((part) => part.type === "blank");
  if (!blanks.length) return answerField.raw ? [answerField.raw] : [];
  if (blanks.length === 1) {
    const name = String(blanks[0].name || "").trim().toLowerCase();
    return [answerField.named.get(name) || answerField.raw];
  }
  return blanks.map((blank) => answerField.named.get(String(blank.name || "").trim().toLowerCase()) || "");
}

function getFillBlankAcceptedAnswers(row, config, parts = [], index = 0) {
  if (config.checkMode !== "accepted" || !config.acceptedFieldId) return [];
  const acceptedField = parseFillBlankNamedValues(getFillBlankRowValue(row, config.acceptedFieldId));
  const blanks = parts.filter((part) => part.type === "blank");
  if (blanks.length <= 1) return splitTypingDrillAnswers(acceptedField.raw);
  const name = String(blanks[index]?.name || "").trim().toLowerCase();
  return splitTypingDrillAnswers(acceptedField.named.get(name) || "");
}

function checkFillBlankSingleAnswer(expected = "", accepted = [], userAnswer = "", config = {}) {
  const answers = [expected, ...accepted].filter(Boolean);
  const primaryAnswer = expected || answers[0] || "";
  if (!primaryAnswer) return { correct: false, primaryAnswer, note: "No answer is available for this blank." };
  if (config.checkMode === "manual" || config.checkMode === "ai") {
    return { correct: false, primaryAnswer, note: config.checkMode === "ai" ? "AI check can be connected later." : "Grade this one manually." };
  }
  if (config.checkMode === "contains") {
    const keywords = splitTypingDrillAnswers(config.keywordText || primaryAnswer.replace(/\s+/g, "|"));
    const haystack = normalizeTypingDrillAnswer(userAnswer, {
      ignoreSpaces: false,
      ignorePunctuation: config.ignorePunctuation,
      caseSensitive: config.caseSensitive
    });
    const missing = keywords.filter((keyword) => !haystack.includes(normalizeTypingDrillAnswer(keyword, {
      ignoreSpaces: false,
      ignorePunctuation: config.ignorePunctuation,
      caseSensitive: config.caseSensitive
    })));
    return { correct: missing.length === 0, primaryAnswer, note: missing.length ? `Missing: ${missing.join(", ")}` : "Contains the required parts." };
  }
  const options = config.checkMode === "exact"
    ? { ignoreSpaces: false, ignorePunctuation: false, caseSensitive: true }
    : {
        ignoreSpaces: config.ignoreSpaces,
        ignorePunctuation: config.ignorePunctuation,
        caseSensitive: config.caseSensitive
      };
  const submitted = normalizeTypingDrillAnswer(userAnswer, options);
  const correct = answers.some((answer) => normalizeTypingDrillAnswer(answer, options) === submitted);
  return { correct, primaryAnswer, note: correct ? "Correct." : "Not quite." };
}

function checkFillBlankAnswers(row, config) {
  const promptText = getFillBlankRowValue(row, config.promptFieldId);
  const parts = splitFillBlankParts(promptText);
  const expected = getFillBlankExpectedAnswers(row, config, parts);
  const checks = expected.map((answer, index) => checkFillBlankSingleAnswer(
    answer,
    getFillBlankAcceptedAnswers(row, config, parts, index),
    config.answers[index] || "",
    config
  ));
  const correct = checks.length > 0 && checks.every((check) => check.correct);
  return { correct, checks, primaryAnswer: expected.filter(Boolean).join(", "), note: correct ? "Correct." : "Not quite." };
}

function renderFillBlankPrompt(promptEl, row, config) {
  if (!promptEl) return;
  promptEl.innerHTML = "";
  const promptText = row ? getFillBlankRowValue(row, config.promptFieldId) : "";
  const parts = splitFillBlankParts(promptText);
  if (!row) {
    promptEl.textContent = "Choose a database and fields to start.";
    return;
  }
  if (!parts.some((part) => part.type === "blank")) {
    promptEl.textContent = promptText || "No prompt mapped.";
    return;
  }
  let blankIndex = 0;
  parts.forEach((part) => {
    if (part.type === "text") {
      promptEl.appendChild(document.createTextNode(part.text));
      return;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fill-blank-input";
    input.dataset.fillBlankIndex = String(blankIndex);
    input.value = config.answers[blankIndex] || "";
    input.placeholder = "blank";
    promptEl.appendChild(input);
    blankIndex += 1;
  });
}

function renderFillBlankBlock(block) {
  if (!block || block.dataset.type !== "fill-blank") return null;
  let config = readFillBlankConfig(block);
  if (!config.sourcePageId) {
    config = normalizeFillBlankConfig(applyDefaultStudySource(config));
    if (config.sourcePageId) writeFillBlankConfig(block, config);
  }
  const sourceForFields = getFillBlankSourceData(config);
  if (sourceForFields?.database?.properties?.length && (!config.promptFieldId || !config.answerFieldId)) {
    config = normalizeFillBlankConfig({ ...config, ...inferFillBlankFields(sourceForFields.database.properties, config) });
    writeFillBlankConfig(block, config);
  }
  const { sourceData, rows, row, index } = getFillBlankCurrent(config);
  const titleEl = block.querySelector(".typing-drill-title");
  const countEl = block.querySelector(".typing-drill-count");
  const scoreEl = block.querySelector(".typing-drill-score");
  const databaseChip = block.querySelector('[data-fill-blank-chip="database"]');
  const filterChip = block.querySelector('[data-fill-blank-chip="filter"]');
  const promptEl = block.querySelector(".fill-blank-prompt");
  const extraEl = block.querySelector(".typing-drill-extra");
  const hintEl = block.querySelector(".typing-drill-hint");
  const statusEl = block.querySelector(".typing-drill-status");
  const resultEl = block.querySelector(".typing-drill-result");
  const answerEl = block.querySelector(".typing-drill-correct-answer");
  const noteEl = block.querySelector(".typing-drill-result-note");
  const checkBtn = block.querySelector('[data-fill-blank-action="check"]');
  const hintBtn = block.querySelector('[data-fill-blank-action="hint"]');
  const skipBtn = block.querySelector('[data-fill-blank-action="skip"]');
  const backBtn = block.querySelector('[data-fill-blank-action="back"]');
  const resetBtn = block.querySelector('[data-fill-blank-action="reset"]');
  const hasPromptBlank = row ? splitFillBlankParts(getFillBlankRowValue(row, config.promptFieldId)).some((part) => part.type === "blank") : false;
  const checked = config.resultState === "correct" || config.resultState === "wrong";
  const check = checked ? checkFillBlankAnswers(row, config) : null;
  const feedbackState = checked ? config.resultState : config.feedbackState;

  if (titleEl) titleEl.textContent = config.title || "Fill-in-the-Blank";
  applyStudyToolAccent(block, config.accentColor);
  block.dataset.typingDrillFeedback = feedbackState || "";
  block.dataset.typingDrillSize = config.displaySize || "standard";
  block.dataset.studyChrome = config.showSourceChips ? "shown" : "minimal";
  if (countEl) countEl.textContent = rows.length ? `${index + 1} / ${rows.length}` : "0 items";
  if (scoreEl) scoreEl.textContent = buildTypingDrillScoreText(config);
  if (databaseChip) databaseChip.textContent = sourceData?.database?.title || "No database";
  if (filterChip) filterChip.textContent = "All rows";
  renderFillBlankPrompt(promptEl, row, config);
  if (checked && promptEl && check?.checks?.length) {
    promptEl.querySelectorAll(".fill-blank-input").forEach((input, blankIndex) => {
      input.dataset.state = check.checks[blankIndex]?.correct ? "correct" : "wrong";
    });
  }
  if (extraEl) {
    const extraText = row ? getFillBlankRowValue(row, config.extraFieldId) : "";
    extraEl.textContent = extraText;
    extraEl.hidden = !extraText;
  }
  if (hintEl) {
    const hintText = row ? getFillBlankRowValue(row, config.hintFieldId) : "";
    hintEl.textContent = hintText ? `Hint: ${hintText}` : "";
    hintEl.hidden = !config.showHint || !hintText;
  }
  if (statusEl) {
    statusEl.textContent = checked
      ? (config.resultState === "correct" ? "Correct. Press Check or Enter for the next prompt." : "Not quite. Correct answer shown below.")
      : (config.feedbackText || "");
    statusEl.hidden = !statusEl.textContent;
    statusEl.dataset.state = feedbackState || "";
  }
  const showCorrectAnswer = config.resultState === "wrong";
  if (resultEl) resultEl.hidden = !showCorrectAnswer;
  if (answerEl) answerEl.textContent = showCorrectAnswer ? (check?.primaryAnswer || "") : "";
  if (noteEl) {
    noteEl.textContent = showCorrectAnswer ? (check?.note || "") : "";
    noteEl.dataset.correct = showCorrectAnswer && check?.correct ? "1" : "0";
  }
  if (checkBtn) {
    checkBtn.disabled = !row || !hasPromptBlank || config.resultState === "wrong";
    checkBtn.textContent = config.resultState === "correct" ? "Next" : "Check";
  }
  if (hintBtn) hintBtn.disabled = !row || !config.hintFieldId;
  if (skipBtn) skipBtn.disabled = !row;
  if (backBtn) backBtn.disabled = !rows.length;
  if (resetBtn) resetBtn.disabled = !rows.length && !config.answers.length && config.resultState === "idle";
  if (row && config.resultState !== "correct" && config.resultState !== "wrong") {
    markStudyPromptSeen(block, {
      tool: "Fill-in-the-Blank",
      rowId: row.id || "",
      prompt: getFillBlankRowValue(row, config.promptFieldId),
      expected: getFillBlankRowValue(row, config.answerFieldId)
    });
  }
  return block;
}

function closeFillBlankPicker() {
  document.querySelector(".topbar-dropdown.fill-blank-picker")?.remove();
}

function applyFillBlankDisplaySize(block, size = "standard") {
  applyTypingDrillDisplaySize(block, size);
}

function openFillBlankPicker(block, anchorEl = null) {
  if (!block || block.dataset.type !== "fill-blank") return;
  closeFillBlankPicker();
  const config = readFillBlankConfig(block);
  const sources = typeof window.getDatabaseCalloutSources === "function" ? window.getDatabaseCalloutSources() : [];
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown typing-drill-picker study-tool-picker fill-blank-picker";
  picker.dataset.uiId = "topbarDropdown";
  picker.innerHTML = `
    <div class="study-tool-picker-head"><strong>Fill-in-the-Blank</strong><button type="button" data-fill-blank-action="close" aria-label="Close">×</button></div>
    <div class="typing-drill-picker-tabs">
      <button type="button" class="active" data-fill-blank-tab="setup">Basic</button>
      <button type="button" data-fill-blank-tab="session">Session</button>
      <button type="button" data-fill-blank-tab="advanced">Advanced</button>
      <button type="button" data-fill-blank-tab="style">Style</button>
    </div>
    <div class="typing-drill-picker-panel active" data-fill-blank-panel="setup">
      <label class="typing-drill-picker-field"><span>Title</span><input type="text" data-fill-blank-setting="title" /></label>
      <details class="typing-drill-picker-section" open>
        <summary>Source</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Database</span><select data-fill-blank-setting="source"></select></label>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Fields</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Prompt Template</span><select data-fill-blank-setting="prompt"></select></label>
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Answer</span><select data-fill-blank-setting="answer"></select></label>
            <label class="typing-drill-picker-field"><span>Hint</span><select data-fill-blank-setting="hint"></select></label>
          </div>
          <div class="typing-drill-picker-help">Place blanks in the prompt with {{blank}} or named blanks like {{term}}.</div>
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-fill-blank-panel="session">
      <details class="typing-drill-picker-section" open>
        <summary>Session</summary>
        <div class="typing-drill-picker-section-body">
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Number of items</span><input type="number" min="1" max="100" data-fill-blank-setting="limit" /></label>
            <label class="typing-drill-picker-field"><span>Order</span><select data-fill-blank-setting="order"><option value="random">Random</option><option value="ordered">Ordered</option></select></label>
          </div>
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-fill-blank-panel="advanced">
      <details class="typing-drill-picker-section" open>
        <summary>Answer checking</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Mode</span><select data-fill-blank-setting="mode"><option value="exact">Exact</option><option value="loose">Loose</option><option value="accepted">Also Accept</option><option value="contains">Keywords</option><option value="manual">Manual</option><option value="ai">AI</option></select></label>
          <div class="typing-drill-picker-help" data-fill-blank-mode-help></div>
          <label class="typing-drill-picker-field" data-fill-blank-mode-panel="accepted"><span>Also Accept Field</span><select data-fill-blank-setting="accepted"></select></label>
          <label class="typing-drill-picker-field" data-fill-blank-mode-panel="contains"><span>Required keywords</span><input type="text" data-fill-blank-setting="keywords" placeholder="function, return" /></label>
          <div class="typing-drill-picker-toggles" data-fill-blank-mode-panel="loose"><label><input type="checkbox" data-fill-blank-setting="ignoreSpaces" /> Ignore spaces</label><label><input type="checkbox" data-fill-blank-setting="ignorePunctuation" /> Ignore punctuation</label><label><input type="checkbox" data-fill-blank-setting="caseSensitive" /> Case sensitive</label></div>
          <div class="typing-drill-picker-toggles" data-fill-blank-mode-panel="manual ai"><span>Show correct answer after submit</span><span>Self-grade buttons</span></div>
        </div>
      </details>
      <details class="typing-drill-picker-section">
        <summary>Notes / Extra</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Notes / Extra Field</span><select data-fill-blank-setting="extra"></select></label>
        </div>
      </details>
      <details class="typing-drill-picker-section">
        <summary>Score write-back</summary>
        <div class="typing-drill-picker-section-body">
          ${buildStudyScoreSettingsHTML("fill")}
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-fill-blank-panel="style">
      <details class="typing-drill-picker-section" open>
        <summary>Display</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Display size</span><select data-fill-blank-setting="size"><option value="compact">Compact</option><option value="standard">Standard</option><option value="wide">Wide</option></select></label>
          <label class="match-pairs-toggle"><input type="checkbox" data-fill-blank-setting="source-chips" /> Show database/filter chips</label>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Color</summary>
        <div class="typing-drill-picker-section-body">
          <label class="match-pairs-toggle"><input type="checkbox" data-fill-blank-setting="custom-accent" /> Custom accent</label>
          <label class="typing-drill-picker-field"><span>Accent color</span><input type="color" data-fill-blank-setting="accent" /></label>
          <div class="typing-drill-picker-help">Leave custom accent off to follow this page's theme color.</div>
        </div>
      </details>
    </div>
  `;
  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  picker.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(picker);
  picker.querySelector('[data-fill-blank-action="close"]')?.addEventListener("click", closeFillBlankPicker);

  const anchorTarget = anchorEl || block.querySelector(".typing-drill-config-btn") || block;
  positionTypingDrillPicker(picker, block, anchorTarget);
  watchStudyToolPickerPosition(picker, block, anchorTarget);

  const titleInput = picker.querySelector('[data-fill-blank-setting="title"]');
  const sourceSelect = picker.querySelector('[data-fill-blank-setting="source"]');
  const promptSelect = picker.querySelector('[data-fill-blank-setting="prompt"]');
  const answerSelect = picker.querySelector('[data-fill-blank-setting="answer"]');
  const hintSelect = picker.querySelector('[data-fill-blank-setting="hint"]');
  const extraSelect = picker.querySelector('[data-fill-blank-setting="extra"]');
  const acceptedSelect = picker.querySelector('[data-fill-blank-setting="accepted"]');
  const modeSelect = picker.querySelector('[data-fill-blank-setting="mode"]');
  const keywordInput = picker.querySelector('[data-fill-blank-setting="keywords"]');
  const modeHelp = picker.querySelector("[data-fill-blank-mode-help]");
  const ignoreSpacesInput = picker.querySelector('[data-fill-blank-setting="ignoreSpaces"]');
  const ignorePunctuationInput = picker.querySelector('[data-fill-blank-setting="ignorePunctuation"]');
  const caseSensitiveInput = picker.querySelector('[data-fill-blank-setting="caseSensitive"]');
  const limitInput = picker.querySelector('[data-fill-blank-setting="limit"]');
  const orderSelect = picker.querySelector('[data-fill-blank-setting="order"]');
  const sizeSelect = picker.querySelector('[data-fill-blank-setting="size"]');
  const showSourceChipsInput = picker.querySelector('[data-fill-blank-setting="source-chips"]');
  const customAccentInput = picker.querySelector('[data-fill-blank-setting="custom-accent"]');
  const accentInput = picker.querySelector('[data-fill-blank-setting="accent"]');
  const sourceKey = (source) => `${source.kind}:${source.pageId}:${source.blockId || ""}`;
  const selectedSource = () => sources.find((source) => sourceKey(source) === (sourceSelect?.value || "")) || null;
  const fillPropertySelect = (selectEl, properties, selectedValue, includeTitle = true) => {
    if (!selectEl) return;
    const options = [{ value: "", label: "None" }];
    if (includeTitle) options.push({ value: "__title__", label: "Row title" });
    (properties || []).forEach((property) => options.push({ value: property.id, label: property.name || "Property" }));
    selectEl.innerHTML = options.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("");
    selectEl.value = selectedValue || "";
    if (selectEl.value !== (selectedValue || "")) selectEl.value = "";
  };

  function setFillBlankPickerTab(tabName = "setup") {
    const safeTab = ["setup", "session", "advanced", "style"].includes(tabName) ? tabName : "setup";
    picker.querySelectorAll("[data-fill-blank-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.fillBlankTab === safeTab);
    });
    picker.querySelectorAll("[data-fill-blank-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.fillBlankPanel === safeTab);
    });
    window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
  }

  picker.querySelector(".typing-drill-picker-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-fill-blank-tab]");
    if (!button) return;
    event.preventDefault();
    setFillBlankPickerTab(button.dataset.fillBlankTab || "setup");
  });

  function getWorkingFillBlankConfig() {
    const base = readFillBlankConfig(block);
    const src = selectedSource();
    const selectValue = (selectEl, fallback = "") => {
      if (!selectEl || !selectEl.options || selectEl.options.length === 0) return fallback;
      return selectEl.value;
    };
    return normalizeFillBlankConfig({
      ...base,
      title: titleInput?.value || base.title,
      sourceKind: src?.kind || base.sourceKind,
      sourcePageId: src?.pageId || base.sourcePageId,
      sourceBlockId: src?.blockId || base.sourceBlockId,
      promptFieldId: selectValue(promptSelect, base.promptFieldId),
      answerFieldId: selectValue(answerSelect, base.answerFieldId),
      hintFieldId: selectValue(hintSelect, base.hintFieldId),
      extraFieldId: selectValue(extraSelect, base.extraFieldId),
      acceptedFieldId: selectValue(acceptedSelect, base.acceptedFieldId),
      checkMode: modeSelect?.value || base.checkMode,
      ignoreSpaces: !!ignoreSpacesInput?.checked,
      ignorePunctuation: !!ignorePunctuationInput?.checked,
      caseSensitive: !!caseSensitiveInput?.checked,
      keywordText: keywordInput?.value || "",
      sessionLimit: limitInput?.value || base.sessionLimit,
      order: orderSelect?.value || base.order,
      displaySize: sizeSelect?.value || base.displaySize,
      showSourceChips: !!showSourceChipsInput?.checked,
      accentColor: customAccentInput?.checked ? accentInput?.value : "",
      scoring: readStudyScoreSettings(picker, "fill", base.scoring, { correctChange: 1.5, incorrectChange: -1 }),
      answers: [],
      resultState: "idle",
      showHint: false,
      seenRowIds: [],
      scoreCorrect: 0,
      scoreTried: 0,
      scoreSkipped: 0,
      feedbackState: "reset",
      feedbackText: "Settings updated. Session reset."
    });
  }

  function saveFillBlankConfig() {
    const previousConfig = readFillBlankConfig(block);
    const nextConfig = getWorkingFillBlankConfig();
    writeFillBlankConfig(block, nextConfig);
    if (nextConfig.displaySize !== previousConfig.displaySize) {
      applyFillBlankDisplaySize(block, nextConfig.displaySize);
      window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
    }
    renderFillBlankBlock(block);
    if (typeof saveState === "function") saveState();
    return nextConfig;
  }

  function syncModePanels() {
    const mode = normalizeTypingDrillCheckMode(modeSelect?.value || "loose");
    const helpText = {
      exact: "Answer must match exactly.",
      loose: "Ignores small formatting differences like spaces and punctuation.",
      accepted: "Checks the answer plus anything in the Also Accept field.",
      contains: "Answer must include the required keywords.",
      manual: "User checks their own answer after seeing the correct one.",
      ai: "Uses AI to judge flexible or open-ended answers."
    };
    if (modeHelp) modeHelp.textContent = helpText[mode] || helpText.loose;
    picker.querySelectorAll("[data-fill-blank-mode-panel]").forEach((panel) => {
      const modes = String(panel.dataset.fillBlankModePanel || "").split(/\s+/).filter(Boolean);
      panel.hidden = !modes.includes(mode);
    });
  }

  function syncPicker() {
    const working = getWorkingFillBlankConfig();
    const sourceData = getFillBlankSourceData(working);
    const properties = sourceData?.database?.properties || [];
    const inferred = inferFillBlankFields(properties, working);
    fillPropertySelect(promptSelect, properties, inferred.promptFieldId);
    fillPropertySelect(answerSelect, properties, inferred.answerFieldId);
    fillPropertySelect(hintSelect, properties, inferred.hintFieldId);
    fillPropertySelect(extraSelect, properties, inferred.extraFieldId);
    fillPropertySelect(acceptedSelect, properties, working.acceptedFieldId);
    syncStudyScoreSettings(picker, "fill", properties, working.scoring, { correctChange: 1.5, incorrectChange: -1 });
    syncModePanels();
  }

  sourceSelect.innerHTML = sources.map((source) => `<option value="${escapeHTML(sourceKey(source))}">${escapeHTML(source.label || source.title || "Database")}</option>`).join("");
  const currentSourceValue = `${config.sourceKind}:${config.sourcePageId}:${config.sourceBlockId || ""}`;
  if (sourceSelect.querySelector(`option[value="${CSS.escape(currentSourceValue)}"]`)) sourceSelect.value = currentSourceValue;
  else if (sources[0]) sourceSelect.value = sourceKey(sources[0]);
  if (titleInput) titleInput.value = config.title;
  if (modeSelect) modeSelect.value = config.checkMode;
  if (keywordInput) keywordInput.value = config.keywordText;
  if (ignoreSpacesInput) ignoreSpacesInput.checked = !!config.ignoreSpaces;
  if (ignorePunctuationInput) ignorePunctuationInput.checked = !!config.ignorePunctuation;
  if (caseSensitiveInput) caseSensitiveInput.checked = !!config.caseSensitive;
  if (limitInput) limitInput.value = String(config.sessionLimit || 10);
  if (orderSelect) orderSelect.value = config.order;
  if (sizeSelect) sizeSelect.value = config.displaySize || "standard";
  if (showSourceChipsInput) showSourceChipsInput.checked = config.showSourceChips !== false;
  if (customAccentInput) customAccentInput.checked = !!config.accentColor;
  if (accentInput) {
    accentInput.value = config.accentColor || "#7b9cff";
    accentInput.disabled = !customAccentInput?.checked;
  }
  syncPicker();
  if ((!config.sourcePageId || !getFillBlankSourceData(config)) && selectedSource()) {
    const seededConfig = getWorkingFillBlankConfig();
    writeFillBlankConfig(block, seededConfig);
    renderFillBlankBlock(block);
    if (typeof saveState === "function") saveState();
  }

  const syncFillBlankAccentControls = () => {
    if (accentInput && customAccentInput) accentInput.disabled = !customAccentInput.checked;
    applyStudyToolAccent(block, customAccentInput?.checked ? accentInput?.value : "");
  };

  const saveFillBlankAccentOnly = () => {
    const next = readFillBlankConfig(block);
    next.accentColor = customAccentInput?.checked ? (accentInput?.value || "") : "";
    writeFillBlankConfig(block, next);
    syncFillBlankAccentControls();
    if (typeof saveState === "function") saveState();
  };

  picker.addEventListener("change", (event) => {
    if (event.target === customAccentInput || event.target === accentInput) {
      saveFillBlankAccentOnly();
      return;
    }
    saveFillBlankConfig();
    syncPicker();
  });
  picker.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target === accentInput) {
      saveFillBlankAccentOnly();
      return;
    }
    saveFillBlankConfig();
    syncPicker();
  });
}

function resetFillBlankCardState(config) {
  config.answers = [];
  config.showHint = false;
  config.resultState = "idle";
  return config;
}

function advanceFillBlank(block, options = {}) {
  const config = readFillBlankConfig(block);
  const { rows } = getFillBlankItems(config);
  if (!rows.length) return config;
  const currentRow = rows[Math.max(0, Math.min(config.currentIndex || 0, rows.length - 1))] || null;
  if (currentRow?.id && !config.seenRowIds.includes(currentRow.id)) config.seenRowIds.push(currentRow.id);
  if (config.order === "random") {
    let candidates = rows.map((row, index) => ({ row, index })).filter((entry) => entry.index !== config.currentIndex && !config.seenRowIds.includes(entry.row.id));
    if (!candidates.length) {
      config.seenRowIds = currentRow?.id ? [currentRow.id] : [];
      candidates = rows.map((row, index) => ({ row, index })).filter((entry) => entry.index !== config.currentIndex);
    }
    const fallbackIndex = rows.length > 1 ? (config.currentIndex + 1) % rows.length : 0;
    const picked = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : { index: fallbackIndex };
    config.currentIndex = picked.index;
  } else {
    config.currentIndex = (config.currentIndex + 1) % rows.length;
  }
  resetFillBlankCardState(config);
  config.feedbackState = options.feedbackState || "";
  config.feedbackText = options.feedbackText || "";
  return config;
}

function moveFillBlankBack(block) {
  const config = readFillBlankConfig(block);
  const { rows } = getFillBlankItems(config);
  if (!rows.length) return config;
  config.currentIndex = (config.currentIndex - 1 + rows.length) % rows.length;
  resetFillBlankCardState(config);
  config.feedbackState = "";
  config.feedbackText = "";
  return config;
}

function resetFillBlank(block) {
  const config = readFillBlankConfig(block);
  getBlockStudySessionId(block, true);
  config.currentIndex = 0;
  config.seenRowIds = [];
  resetFillBlankCardState(config);
  config.feedbackState = "reset";
  config.feedbackText = "Session reset.";
  config.scoreCorrect = 0;
  config.scoreTried = 0;
  config.scoreSkipped = 0;
  return config;
}

function submitFillBlankAnswer(block) {
  const config = readFillBlankConfig(block);
  if (config.resultState === "correct") return advanceFillBlank(block);
  if (config.resultState === "wrong") return config;
  const answers = Array.from(block.querySelectorAll(".fill-blank-input")).map((input) => input.value || "");
  if (!answers.some((answer) => String(answer || "").trim())) return config;
  config.answers = answers;
  const current = getFillBlankCurrent(config);
  const { row } = current;
  const check = checkFillBlankAnswers(row, config);
  config.resultState = check.correct ? "correct" : "wrong";
  config.feedbackState = check.correct ? "correct" : "wrong";
  config.feedbackText = "";
  config.scoreTried += 1;
  if (check.correct) config.scoreCorrect += 1;
  if (!["manual", "ai"].includes(config.checkMode)) applyStudyScoreWriteback(config, row?.id || "", check.correct);
  recordStudyActivity(block, config, {
    tool: "Fill-in-the-Blank",
    rowId: row?.id || "",
    prompt: row ? getFillBlankRowValue(row, config.promptFieldId) : "",
    answer: config.answers.filter(Boolean).join(", "),
    expected: check.primaryAnswer || "",
    result: check.correct ? "correct" : "incorrect",
    total: current.rows?.length || 0,
    durationMs: getStudyPromptDuration(block, {
      tool: "Fill-in-the-Blank",
      rowId: row?.id || "",
      prompt: row ? getFillBlankRowValue(row, config.promptFieldId) : "",
      expected: row ? getFillBlankRowValue(row, config.answerFieldId) : ""
    })
  });
  return config;
}

window.mountFillBlankBlock = function mountFillBlankBlock(block, options = {}) {
  if (!block || block.dataset.type !== "fill-blank") return null;
  if (!block.dataset.fillBlankConfig) {
    writeFillBlankConfig(block, normalizeFillBlankConfig({}));
  }
  renderFillBlankBlock(block);
  if (options.openPicker) {
    const anchor = block.querySelector(".typing-drill-config-btn") || block;
    openFillBlankPicker(block, anchor);
  }
  return block;
};

function normalizeMatchPairsMode(value = "columns") {
  return ["columns", "focus", "chips", "mixed"].includes(value) ? value : "columns";
}

function normalizeMatchPairsLayout(value = "columns") {
  return ["columns", "focus", "chips"].includes(value) ? value : "columns";
}

function chooseMixedMatchPairsLayout(seed = Date.now(), step = 0) {
  const layouts = ["columns", "focus", "chips"];
  return layouts[matchPairsHash(`${seed}:mixed-layout:${step}`) % layouts.length];
}

function getActiveMatchPairsLayout(config) {
  if (config?.layoutMode !== "mixed") return normalizeMatchPairsLayout(config?.layoutMode);
  return normalizeMatchPairsLayout(config.mixedLayout);
}

function advanceMixedMatchPairsLayout(config) {
  if (config?.layoutMode !== "mixed") return;
  config.mixedStep = Math.max(0, Number(config.mixedStep || 0) || 0) + 1;
  config.mixedLayout = chooseMixedMatchPairsLayout(config.sessionSeed, config.mixedStep);
}

function normalizeMatchPairsAccent(value = "") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
}

function normalizeMatchPairsSurface(value = "soft") {
  return ["soft", "tinted", "outline"].includes(value) ? value : "soft";
}

function normalizeMatchPairsPromptSize(value = "lg") {
  return ["sm", "md", "lg", "xl"].includes(value) ? value : "lg";
}

function normalizeMatchPairsAnswerSize(value = "md") {
  return ["sm", "md", "lg"].includes(value) ? value : "md";
}

function normalizeMatchPairsPromptHeight(value = "standard") {
  return ["compact", "standard", "tall"].includes(value) ? value : "standard";
}

function normalizeMatchPairsConfig(raw = {}) {
  const sessionSeed = Math.max(1, Number(raw.sessionSeed || Date.now()) || Date.now());
  const allowedModes = Array.from(new Set((Array.isArray(raw.allowedModes) ? raw.allowedModes : ["columns", "focus", "chips", "mixed"])
    .map(normalizeMatchPairsMode)));
  const modes = allowedModes.length ? allowedModes : ["columns"];
  const defaultMode = modes.includes(raw.defaultMode) ? raw.defaultMode : modes[0];
  const layoutMode = modes.includes(raw.layoutMode) ? raw.layoutMode : defaultMode;
  return {
    title: String(raw.title || "").trim() || "Match Pairs",
    sourceKind: raw.sourceKind === "block" ? "block" : "page",
    sourcePageId: String(raw.sourcePageId || "").trim(),
    sourceBlockId: raw.sourceKind === "block" ? String(raw.sourceBlockId || "").trim() : "",
    leftFieldId: String(raw.leftFieldId || "").trim(),
    rightFieldId: String(raw.rightFieldId || "").trim(),
    hintFieldId: String(raw.hintFieldId || "").trim(),
    filters: normalizeFlashcardDeckFilters(raw.filters || []),
    pairLimit: Math.max(2, Math.min(30, Number(raw.pairLimit || 6) || 6)),
    shuffle: raw.shuffle !== false,
    layoutMode,
    mixedLayout: normalizeMatchPairsLayout(raw.mixedLayout || chooseMixedMatchPairsLayout(sessionSeed, raw.mixedStep)),
    allowedModes: modes,
    defaultMode,
    allowModeSwitch: raw.allowModeSwitch !== false,
    accentColor: normalizeMatchPairsAccent(raw.accentColor),
    surfaceStyle: normalizeMatchPairsSurface(raw.surfaceStyle),
    promptSize: normalizeMatchPairsPromptSize(raw.promptSize),
    answerSize: normalizeMatchPairsAnswerSize(raw.answerSize),
    promptHeight: normalizeMatchPairsPromptHeight(raw.promptHeight),
    showSourceChips: raw.showSourceChips !== false,
    backgroundImage: String(raw.backgroundImage || "").trim(),
    sessionSeed,
    mixedStep: Math.max(0, Number(raw.mixedStep || 0) || 0),
    mixedRoundRowIds: Array.isArray(raw.mixedRoundRowIds) ? raw.mixedRoundRowIds.map((id) => String(id)).filter(Boolean) : [],
    matchedRowIds: Array.isArray(raw.matchedRowIds) ? raw.matchedRowIds.map((id) => String(id)).filter(Boolean) : [],
    selectedLeftId: String(raw.selectedLeftId || ""),
    selectedRightId: String(raw.selectedRightId || ""),
    focusCursor: Math.max(0, Number(raw.focusCursor || 0) || 0),
    focusResultId: String(raw.focusResultId || ""),
    hintRowId: String(raw.hintRowId || ""),
    wrongRowId: String(raw.wrongRowId || ""),
    feedbackState: ["", "correct", "wrong", "reset", "hint"].includes(raw.feedbackState) ? raw.feedbackState : "",
    feedbackText: String(raw.feedbackText || "").trim(),
    scoring: normalizeStudyScoreWriteback(raw?.scoring || {}, { correctChange: 1, incorrectChange: -0.5 })
  };
}

function readMatchPairsConfig(block) {
  return normalizeMatchPairsConfig(parseFlashcardsJSON(block?.dataset.matchPairsConfig || "", {}));
}

function writeMatchPairsConfig(block, config) {
  if (block) block.dataset.matchPairsConfig = JSON.stringify(normalizeMatchPairsConfig(config));
}

function getMatchPairsSourceData(config) {
  return getTypingDrillSourceData(config);
}

function inferMatchPairsFields(properties = [], current = {}) {
  const props = Array.isArray(properties) ? properties : [];
  const valid = (value) => value === "__title__" || props.some((property) => property.id === value);
  if (valid(current.leftFieldId) || valid(current.rightFieldId) || valid(current.hintFieldId)) {
    return {
      leftFieldId: valid(current.leftFieldId) ? current.leftFieldId : "",
      rightFieldId: valid(current.rightFieldId) ? current.rightFieldId : "",
      hintFieldId: valid(current.hintFieldId) ? current.hintFieldId : ""
    };
  }
  const find = (patterns) => props.find((property) => patterns.some((pattern) => pattern.test(String(property.name || "").toLowerCase())))?.id || "";
  return {
    leftFieldId: "__title__",
    rightFieldId: find([/answer|meaning|definition|reading|value|back/]) || props[0]?.id || "",
    hintFieldId: find([/hint|note|romaji|extra/])
  };
}

function matchPairsHash(value = "") {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function shuffleMatchPairsItems(items = [], seed = 1, salt = "") {
  const shuffled = items.slice();
  let state = (matchPairsHash(`${seed}:${salt}`) || 1) >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getMatchPairsDisplayOrder(items = [], config, salt = "") {
  if (!config.shuffle) return items.slice();
  return shuffleMatchPairsItems(items, config.sessionSeed, salt);
}

function avoidIdenticalMatchPairsColumns(leftItems = [], rightItems = []) {
  if (rightItems.length < 2) return rightItems;
  const sameOrder = leftItems.every((item, index) => item.id === rightItems[index]?.id);
  return sameOrder ? [...rightItems.slice(1), rightItems[0]] : rightItems;
}

function getMatchPairsItems(config) {
  const sourceData = getMatchPairsSourceData(config);
  const properties = sourceData?.database?.properties || [];
  const sourceRows = sourceData?.database?.rows || [];
  const items = sourceRows
    .filter((row) => rowMatchesFlashcardDeckFilters(row, properties, config.filters))
    .map((row, index) => ({
      id: String(row.id || `row-${index}`),
      left: getTypingDrillRowValue(row, config.leftFieldId),
      right: getTypingDrillRowValue(row, config.rightFieldId),
      hint: getTypingDrillRowValue(row, config.hintFieldId)
    }))
    .filter((item) => item.left && item.right);
  const ordered = getMatchPairsDisplayOrder(items, config, "session");
  return {
    sourceData,
    properties,
    items: config.layoutMode === "mixed" ? ordered : ordered.slice(0, config.pairLimit)
  };
}

function getMatchPairsFilterLabel(config, properties = []) {
  const filter = config.filters[0];
  if (!filter) return "All rows";
  const name = filter.propertyId === "__title__" ? "Title" : (properties.find((property) => property.id === filter.propertyId)?.name || "Filter");
  const operatorLabel = { is: "is", "is-not": "is not", contains: "contains", checked: "checked", unchecked: "unchecked" }[filter.operator] || "is";
  return `${name} ${operatorLabel}${["checked", "unchecked"].includes(filter.operator) ? "" : ` ${filter.value}`}`;
}

function buildMatchPairsChoice(item, side, config, options = {}) {
  const selected = side === "left" ? config.selectedLeftId === item.id : config.selectedRightId === item.id;
  const matched = config.matchedRowIds.includes(item.id);
  const wrong = config.wrongRowId === item.id;
  const hinted = config.hintRowId === item.id;
  const value = side === "left" ? item.left : item.right;
  const classes = ["match-pairs-card"];
  if (selected) classes.push("selected");
  if (matched) classes.push("matched");
  if (wrong) classes.push("wrong");
  if (hinted) classes.push("hinted");
  if (options.chip) classes.push("chip");
  return `<button type="button" class="${classes.join(" ")}" data-match-pairs-choice="${side}" data-row-id="${escapeHTML(item.id)}" ${matched ? "disabled" : ""}>${escapeHTML(value)}${matched ? '<span class="match-pairs-check">✓</span>' : ""}</button>`;
}

function renderMatchPairsBoardProgress(config, items) {
  const completed = items.filter((item) => config.matchedRowIds.includes(item.id)).length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  return `
    <div class="match-pairs-board-progress">
      <span>${completed} / ${items.length}</span>
      <span class="match-pairs-focus-track"><span style="width:${percent}%"></span></span>
      <span>${percent}%</span>
    </div>`;
}

function syncMixedMatchPairsRound(config, items) {
  if (config.layoutMode !== "mixed") return;
  const layout = getActiveMatchPairsLayout(config);
  if (layout === "focus") {
    config.mixedRoundRowIds = [];
    return;
  }
  const availableIds = new Set(items.map((item) => item.id));
  config.mixedRoundRowIds = config.mixedRoundRowIds.filter((id) => availableIds.has(id));
  if (config.mixedRoundRowIds.length) return;
  config.mixedRoundRowIds = items
    .filter((item) => !config.matchedRowIds.includes(item.id))
    .slice(0, config.pairLimit)
    .map((item) => item.id);
}

function getVisibleMatchPairsItems(config, items) {
  if (config.layoutMode !== "mixed" || getActiveMatchPairsLayout(config) === "focus") return items;
  const roundIds = new Set(config.mixedRoundRowIds);
  return items.filter((item) => roundIds.has(item.id));
}

function renderMatchPairsStage(config, items) {
  const unmatched = items.filter((item) => !config.matchedRowIds.includes(item.id));
  const layout = getActiveMatchPairsLayout(config);
  if (!items.length) return '<div class="match-pairs-empty">Choose a database and two fields to begin.</div>';
  if (config.layoutMode === "mixed" && !unmatched.length && !config.focusResultId) {
    return '<div class="match-pairs-complete"><span>Complete.</span><button type="button" data-match-pairs-action="reset">Reset to play again</button></div>';
  }
  if (layout === "focus") {
    const answered = items.find((item) => item.id === config.focusResultId) || null;
    if (!unmatched.length && !answered) return '<div class="match-pairs-complete"><span>Complete.</span><button type="button" data-match-pairs-action="reset">Reset to play again</button></div>';
    const focus = answered || unmatched[config.focusCursor % unmatched.length];
    const distractors = getMatchPairsDisplayOrder(
      items.filter((item) => item.id !== focus.id),
      config,
      `focus-distractors-${focus.id}`
    ).slice(0, 3);
    const choices = getMatchPairsDisplayOrder(
      [focus, ...distractors],
      config,
      `focus-answers-${focus.id}`
    );
    const focusChoiceConfig = {
      ...config,
      matchedRowIds: answered ? [answered.id] : [],
      selectedRightId: "",
      wrongRowId: answered ? "" : config.wrongRowId
    };
    const progressIndex = Math.min(items.length, config.matchedRowIds.length + (answered ? 0 : 1));
    const percent = items.length ? Math.round((config.matchedRowIds.length / items.length) * 100) : 0;
    return `
      <div class="match-pairs-focus">
        <div class="match-pairs-focus-head">
          <span class="match-pairs-focus-question">Question ${progressIndex}</span>
          <span class="match-pairs-focus-track"><span style="width:${percent}%"></span></span>
          <span class="match-pairs-focus-percent">${percent}%</span>
        </div>
        <div class="match-pairs-focus-card" data-prompt-size="${escapeHTML(config.promptSize)}">
          <div class="match-pairs-focus-prompt">${escapeHTML(focus.left)}</div>
        </div>
        <div class="match-pairs-focus-question-copy">Choose the match.</div>
        <div class="match-pairs-focus-choices">${choices.map((item) => buildMatchPairsChoice(item, "right", focusChoiceConfig, {})).join("")}</div>
        <div class="match-pairs-focus-feedback" data-state="${escapeHTML(config.feedbackState)}">${escapeHTML(config.feedbackText || "")}</div>
        <div class="match-pairs-focus-footer">
          <button type="button" data-match-pairs-action="reset">Reset</button>
          <button type="button" data-match-pairs-action="hint">Hint</button>
          <button type="button" data-match-pairs-action="skip">Skip</button>
          <button type="button" class="match-pairs-focus-next" data-match-pairs-action="next" ${answered ? "" : "disabled"}>Next <span aria-hidden="true">→</span></button>
        </div>
      </div>`;
  }
  const progress = renderMatchPairsBoardProgress(config, items);
  if (layout === "chips") {
    const completed = items.filter((item) => config.matchedRowIds.includes(item.id));
    const leftItems = getMatchPairsDisplayOrder(unmatched, config, "chips-left");
    const rightOrder = getMatchPairsDisplayOrder(unmatched, config, "chips-right");
    const rightItems = config.shuffle ? avoidIdenticalMatchPairsColumns(leftItems, rightOrder) : rightOrder;
    return `
      ${progress}
      <div class="match-pairs-chip-group"><div class="match-pairs-label">Left</div><div class="match-pairs-chip-grid">${leftItems.map((item) => buildMatchPairsChoice(item, "left", config, { chip: true })).join("")}</div></div>
      <div class="match-pairs-chip-group"><div class="match-pairs-label">Right</div><div class="match-pairs-chip-grid">${rightItems.map((item) => buildMatchPairsChoice(item, "right", config, { chip: true })).join("")}</div></div>
      ${completed.length ? `<div class="match-pairs-matched"><div class="match-pairs-label">Matched (${completed.length})</div>${completed.map((item) => `<div class="match-pairs-match"><span>${escapeHTML(item.left)}</span><span>${escapeHTML(item.right)}</span><span>✓</span></div>`).join("")}</div>` : ""}`;
  }
  const leftItems = getMatchPairsDisplayOrder(items, config, "columns-left");
  const rightOrder = getMatchPairsDisplayOrder(items, config, "columns-right");
  const rightItems = config.shuffle ? avoidIdenticalMatchPairsColumns(leftItems, rightOrder) : rightOrder;
  return `
    ${progress}
    <div class="match-pairs-columns">
      <div class="match-pairs-column"><div class="match-pairs-label">Left</div>${leftItems.map((item) => buildMatchPairsChoice(item, "left", config)).join("")}</div>
      <div class="match-pairs-column"><div class="match-pairs-label">Right</div>${rightItems.map((item) => buildMatchPairsChoice(item, "right", config)).join("")}</div>
    </div>`;
}

function renderMatchPairsBlock(block) {
  if (!block || block.dataset.type !== "match-pairs") return null;
  let config = readMatchPairsConfig(block);
  if (!config.sourcePageId) {
    config = normalizeMatchPairsConfig(applyDefaultStudySource(config));
    if (config.sourcePageId) writeMatchPairsConfig(block, config);
  }
  const sourceForFields = getMatchPairsSourceData(config);
  if (sourceForFields?.database?.properties?.length && (!config.leftFieldId || !config.rightFieldId)) {
    config = normalizeMatchPairsConfig({ ...config, ...inferMatchPairsFields(sourceForFields.database.properties, config) });
    writeMatchPairsConfig(block, config);
  }
  const { sourceData, properties, items } = getMatchPairsItems(config);
  const matched = config.matchedRowIds.filter((id) => items.some((item) => item.id === id));
  if (matched.length !== config.matchedRowIds.length) {
    config.matchedRowIds = matched;
    writeMatchPairsConfig(block, config);
  }
  if (config.focusResultId && !items.some((item) => item.id === config.focusResultId)) {
    config.focusResultId = "";
    writeMatchPairsConfig(block, config);
  }
  syncMixedMatchPairsRound(config, items);
  const visibleItems = getVisibleMatchPairsItems(config, items);
  const stageItems = config.layoutMode === "mixed" && items.length && matched.length === items.length ? items : visibleItems;
  writeMatchPairsConfig(block, config);
  const completed = matched.length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const titleEl = block.querySelector(".match-pairs-title");
  const countEl = block.querySelector(".match-pairs-count");
  const progressEl = block.querySelector(".match-pairs-progress");
  const databaseChip = block.querySelector('[data-match-pairs-chip="database"]');
  const filterChip = block.querySelector('[data-match-pairs-chip="filter"]');
  const stageEl = block.querySelector(".match-pairs-stage");
  const switchEl = block.querySelector(".match-pairs-mode-switch");
  const statusEl = block.querySelector(".match-pairs-status");
  const instructionEl = block.querySelector(".match-pairs-instruction");
  const shellEl = block.querySelector(".match-pairs-shell");
  const layout = getActiveMatchPairsLayout(config);
  applyMatchPairsAccent(block, config.accentColor);
  if (shellEl) {
    shellEl.dataset.surface = config.surfaceStyle;
    shellEl.dataset.layout = layout;
    shellEl.dataset.mode = config.layoutMode;
    shellEl.dataset.answerSize = config.answerSize;
    shellEl.dataset.promptHeight = config.promptHeight;
    shellEl.dataset.chrome = config.showSourceChips ? "shown" : "minimal";
    shellEl.style.setProperty("--match-bg-image", config.backgroundImage ? `url("${config.backgroundImage.replace(/"/g, "%22")}")` : "none");
    shellEl.classList.toggle("has-background-image", !!config.backgroundImage);
  }
  if (titleEl) titleEl.textContent = config.title;
  if (countEl) countEl.textContent = items.length ? `${completed} / ${items.length} matched` : "0 pairs";
  if (progressEl) progressEl.textContent = items.length ? `${completed} / ${items.length} · ${percent}%` : "0 / 0";
  if (databaseChip) databaseChip.textContent = sourceData?.database?.title || "No database";
  if (filterChip) filterChip.textContent = getMatchPairsFilterLabel(config, properties);
  if (instructionEl) instructionEl.textContent = layout === "focus" ? "Choose the matching answer." : "Tap one item from each side to make a match.";
  if (switchEl) {
    const showModes = config.allowModeSwitch && config.allowedModes.length > 1;
    switchEl.hidden = !showModes;
    switchEl.innerHTML = showModes ? config.allowedModes.map((mode) => `<button type="button" data-match-pairs-action="mode" data-mode="${mode}" class="${mode === config.layoutMode ? "active" : ""}">${{ columns: "Two Column", focus: "Focus One", chips: "Chip Board", mixed: "Practice Mix" }[mode]}</button>`).join("") : "";
  }
  if (stageEl) stageEl.innerHTML = renderMatchPairsStage(config, stageItems);
  if (statusEl) {
    const hintedItem = items.find((item) => item.id === config.hintRowId);
    const hintText = config.feedbackState === "hint" && hintedItem?.hint ? `Hint: ${hintedItem.hint}` : "";
    const statusText = hintText || config.feedbackText || "";
    statusEl.textContent = statusText || "\u00a0";
    statusEl.dataset.state = config.feedbackState || "";
    statusEl.classList.toggle("is-empty", !statusText);
    statusEl.hidden = layout === "focus";
  }
  block.classList.toggle("match-pairs-focus-mode", layout === "focus");
  if (layout === "focus") {
    const unmatched = items.filter((item) => !config.matchedRowIds.includes(item.id));
    const focus = unmatched[config.focusCursor % Math.max(unmatched.length, 1)];
    if (focus && !config.focusResultId) {
      markStudyPromptSeen(block, {
        tool: "Match Pairs",
        rowId: focus.id,
        prompt: focus.left,
        expected: focus.right
      });
    }
  } else if (config.selectedLeftId) {
    const selected = items.find((item) => item.id === config.selectedLeftId);
    if (selected) {
      markStudyPromptSeen(block, {
        tool: "Match Pairs",
        rowId: selected.id,
        prompt: selected.left,
        expected: selected.right
      });
    }
  }
  const minDims = getMinResizeDimensionsForBlock(block);
  const currentWidth = parseInt(block.style.width || block.getBoundingClientRect().width || "0", 10);
  if (currentWidth < minDims.width) block.style.width = `${minDims.width}px`;
  if (typeof enforceMinHeight === "function") enforceMinHeight(block);
  return block;
}

function resetMatchPairsSession(block) {
  const config = readMatchPairsConfig(block);
  getBlockStudySessionId(block, true);
  config.matchedRowIds = [];
  config.selectedLeftId = "";
  config.selectedRightId = "";
  config.focusCursor = 0;
  config.focusResultId = "";
  config.hintRowId = "";
  config.wrongRowId = "";
  config.layoutMode = config.defaultMode;
  config.sessionSeed = Date.now();
  config.mixedStep = 0;
  config.mixedLayout = chooseMixedMatchPairsLayout(config.sessionSeed, config.mixedStep);
  config.mixedRoundRowIds = [];
  config.feedbackState = "reset";
  config.feedbackText = "Session reset.";
  return config;
}

function chooseMatchPairsItem(block, side, rowId) {
  const config = readMatchPairsConfig(block);
  if (config.matchedRowIds.includes(rowId)) return config;
  if (getActiveMatchPairsLayout(config) === "focus") {
    const { items } = getMatchPairsItems(config);
    const unmatched = items.filter((item) => !config.matchedRowIds.includes(item.id));
    const focus = unmatched[config.focusCursor % Math.max(unmatched.length, 1)];
    if (!focus || side !== "right" || config.focusResultId) return config;
    if (rowId === focus.id) {
      config.matchedRowIds.push(rowId);
      config.focusResultId = rowId;
      config.selectedRightId = "";
      config.wrongRowId = "";
      config.feedbackState = "correct";
      config.feedbackText = "Correct.";
      applyStudyScoreWriteback(config, focus.id, true);
      recordStudyActivity(block, config, {
        tool: "Match Pairs",
        rowId: focus.id,
        prompt: focus.left,
        answer: focus.right,
        expected: focus.right,
        result: "correct",
        total: items.length,
        durationMs: getStudyPromptDuration(block, {
          tool: "Match Pairs",
          rowId: focus.id,
          prompt: focus.left,
          expected: focus.right
        })
      });
    } else {
      config.wrongRowId = rowId;
      config.feedbackState = "wrong";
      config.feedbackText = "Not a match. Try again.";
      applyStudyScoreWriteback(config, focus.id, false);
      const picked = items.find((item) => item.id === rowId);
      recordStudyActivity(block, config, {
        tool: "Match Pairs",
        rowId: focus.id,
        prompt: focus.left,
        answer: picked?.right || "",
        expected: focus.right,
        result: "incorrect",
        total: items.length,
        durationMs: getStudyPromptDuration(block, {
          tool: "Match Pairs",
          rowId: focus.id,
          prompt: focus.left,
          expected: focus.right
        })
      });
    }
    return config;
  }
  const { items } = getMatchPairsItems(config);
  if (side === "left") config.selectedLeftId = config.selectedLeftId === rowId ? "" : rowId;
  if (side === "right") config.selectedRightId = config.selectedRightId === rowId ? "" : rowId;
  config.wrongRowId = "";
  config.feedbackState = "";
  config.feedbackText = "";
  if (!config.selectedLeftId || !config.selectedRightId) return config;
  const gradedRowId = config.selectedLeftId;
  if (config.selectedLeftId === config.selectedRightId) {
    config.matchedRowIds.push(config.selectedLeftId);
    config.feedbackState = "correct";
    config.feedbackText = "Correct match.";
    applyStudyScoreWriteback(config, gradedRowId, true);
    const matchedItem = items.find((item) => item.id === gradedRowId);
    recordStudyActivity(block, config, {
      tool: "Match Pairs",
      rowId: gradedRowId,
      prompt: matchedItem?.left || "",
      answer: matchedItem?.right || "",
      expected: matchedItem?.right || "",
      result: "correct",
      total: items.length,
      durationMs: getStudyPromptDuration(block, {
        tool: "Match Pairs",
        rowId: gradedRowId,
        prompt: matchedItem?.left || "",
        expected: matchedItem?.right || ""
      })
    });
    if (config.layoutMode === "mixed") {
      const { items } = getMatchPairsItems(config);
      const roundItems = getVisibleMatchPairsItems(config, items);
      const roundComplete = roundItems.length > 0
        && roundItems.every((item) => config.matchedRowIds.includes(item.id));
      if (roundComplete) {
        config.mixedRoundRowIds = [];
        advanceMixedMatchPairsLayout(config);
      }
    }
  } else {
    config.wrongRowId = config.selectedRightId;
    config.feedbackState = "wrong";
    config.feedbackText = "Not a match. Try again.";
    applyStudyScoreWriteback(config, gradedRowId, false);
    const leftItem = items.find((item) => item.id === gradedRowId);
    const rightItem = items.find((item) => item.id === config.selectedRightId);
    recordStudyActivity(block, config, {
      tool: "Match Pairs",
      rowId: gradedRowId,
      prompt: leftItem?.left || "",
      answer: rightItem?.right || "",
      expected: leftItem?.right || "",
      result: "incorrect",
      total: items.length,
      durationMs: getStudyPromptDuration(block, {
        tool: "Match Pairs",
        rowId: gradedRowId,
        prompt: leftItem?.left || "",
        expected: leftItem?.right || ""
      })
    });
  }
  config.selectedLeftId = "";
  config.selectedRightId = "";
  return config;
}

function closeMatchPairsPicker() {
  document.querySelector(".topbar-dropdown.match-pairs-picker")?.remove();
}

function openMatchPairsPicker(block, anchorEl = null) {
  if (!block || block.dataset.type !== "match-pairs") return;
  closeMatchPairsPicker();
  const config = readMatchPairsConfig(block);
  const sources = typeof window.getDatabaseCalloutSources === "function" ? window.getDatabaseCalloutSources() : [];
  const picker = document.createElement("div");
  picker.className = "topbar-dropdown typing-drill-picker study-tool-picker match-pairs-picker";
  picker.dataset.uiId = "topbarDropdown";
  picker.innerHTML = `
    <div class="match-pairs-picker-head"><strong>Match Pairs</strong><button type="button" data-match-pairs-close aria-label="Close">×</button></div>
    <div class="typing-drill-picker-tabs">
      <button type="button" class="active" data-match-pairs-tab="basic">Basic</button>
      <button type="button" data-match-pairs-tab="session">Session</button>
      <button type="button" data-match-pairs-tab="advanced">Advanced</button>
      <button type="button" data-match-pairs-tab="style">Style</button>
    </div>
    <div class="typing-drill-picker-panel active" data-match-pairs-panel="basic">
      <label class="typing-drill-picker-field"><span>Title</span><input type="text" data-match-pairs-setting="title" /></label>
      <label class="typing-drill-picker-field"><span>Database</span><select data-match-pairs-setting="source"></select></label>
      <label class="typing-drill-picker-field"><span>Left Field</span><select data-match-pairs-setting="left"></select></label>
      <label class="typing-drill-picker-field"><span>Right Field</span><select data-match-pairs-setting="right"></select></label>
      <label class="typing-drill-picker-field"><span>Hint Field (optional)</span><select data-match-pairs-setting="hint"></select></label>
      <div class="match-pairs-picker-note">A match is correct when both items come from the same database row.</div>
    </div>
    <div class="typing-drill-picker-panel" data-match-pairs-panel="session">
      <div class="typing-drill-picker-grid">
        <label class="typing-drill-picker-field"><span>Pairs loaded at once</span><input type="number" min="2" max="30" data-match-pairs-setting="limit" /></label>
        <label class="match-pairs-toggle"><input type="checkbox" data-match-pairs-setting="shuffle" /> Shuffle</label>
      </div>
      <details class="typing-drill-picker-section" open>
        <summary>Filter</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Property</span><select data-match-pairs-setting="filter-property"></select></label>
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Match</span><select data-match-pairs-setting="filter-operator"><option value="is">Is</option><option value="is-not">Is not</option><option value="contains">Contains</option><option value="checked">Checked</option><option value="unchecked">Unchecked</option></select></label>
            <label class="typing-drill-picker-field"><span>Value</span><input type="text" data-match-pairs-setting="filter-value" /></label>
          </div>
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-match-pairs-panel="advanced">
      <details class="typing-drill-picker-section" open>
        <summary>Layout options</summary>
        <div class="typing-drill-picker-section-body">
          <div class="match-pairs-picker-subtitle">Allowed modes</div>
          <div class="match-pairs-mode-options">
            <label><input type="checkbox" value="columns" data-match-pairs-allowed /> Two Column</label>
            <label><input type="checkbox" value="focus" data-match-pairs-allowed /> Focus One</label>
            <label><input type="checkbox" value="chips" data-match-pairs-allowed /> Chip Board</label>
            <label><input type="checkbox" value="mixed" data-match-pairs-allowed /> Practice Mix</label>
          </div>
          <label class="typing-drill-picker-field"><span>Default Mode</span><select data-match-pairs-setting="default-mode"><option value="columns">Two Column</option><option value="focus">Focus One</option><option value="chips">Chip Board</option><option value="mixed">Practice Mix</option></select></label>
          <label class="match-pairs-toggle"><input type="checkbox" data-match-pairs-setting="switch" /> Allow switching while studying</label>
          <div class="match-pairs-picker-note">Practice Mix switches after each Focus question, or after completing the full Two Column / Chip Board batch.</div>
        </div>
      </details>
      <details class="typing-drill-picker-section">
        <summary>Score write-back</summary>
        <div class="typing-drill-picker-section-body">
          ${buildStudyScoreSettingsHTML("matching")}
        </div>
      </details>
    </div>
    <div class="typing-drill-picker-panel" data-match-pairs-panel="style">
      <details class="typing-drill-picker-section" open>
        <summary>Display</summary>
        <div class="typing-drill-picker-section-body">
          <label class="typing-drill-picker-field"><span>Current Layout</span><select data-match-pairs-setting="layout"><option value="columns">Two Column</option><option value="focus">Focus One</option><option value="chips">Chip Board</option><option value="mixed">Practice Mix</option></select></label>
          <label class="typing-drill-picker-field"><span>Card Treatment</span><select data-match-pairs-setting="surface"><option value="soft">Soft</option><option value="tinted">Tinted</option><option value="outline">Outline</option></select></label>
          <div class="typing-drill-picker-grid">
            <label class="typing-drill-picker-field"><span>Prompt size</span><select data-match-pairs-setting="prompt-size"><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option><option value="xl">XL</option></select></label>
            <label class="typing-drill-picker-field"><span>Answer size</span><select data-match-pairs-setting="answer-size"><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Large</option></select></label>
          </div>
          <label class="typing-drill-picker-field"><span>Focus card height</span><select data-match-pairs-setting="prompt-height"><option value="compact">Compact</option><option value="standard">Standard</option><option value="tall">Tall</option></select></label>
          <label class="match-pairs-toggle"><input type="checkbox" data-match-pairs-setting="source-chips" /> Show database/filter chips</label>
        </div>
      </details>
      <details class="typing-drill-picker-section" open>
        <summary>Color</summary>
        <div class="typing-drill-picker-section-body">
          <label class="match-pairs-toggle"><input type="checkbox" data-match-pairs-setting="custom-accent" /> Custom accent</label>
          <label class="typing-drill-picker-field"><span>Accent color</span><input type="color" data-match-pairs-setting="accent" /></label>
          <div class="match-pairs-picker-note">Leave custom accent off to follow this page's theme color.</div>
        </div>
      </details>
      <details class="typing-drill-picker-section">
        <summary>Background theme</summary>
        <div class="typing-drill-picker-section-body">
          <div class="match-pairs-upload-row">
            <button type="button" class="topbar-dropdown-btn" data-match-pairs-action="upload-bg">Upload image</button>
            <button type="button" class="topbar-dropdown-btn" data-match-pairs-action="clear-bg">Clear</button>
            <input type="file" data-match-pairs-setting="background-upload" accept="image/*" hidden />
          </div>
          <div class="match-pairs-picker-note">Used behind the focus card, or behind the matching board in other layouts.</div>
        </div>
      </details>
      <div class="match-pairs-picker-note">These settings only change how this block looks. Your pairs and database mapping stay the same.</div>
    </div>`;
  picker.addEventListener("mousedown", (event) => event.stopPropagation());
  picker.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(picker);
  if (config.accentColor) picker.style.setProperty("--accent", config.accentColor);
  const anchorTarget = anchorEl || block.querySelector(".match-pairs-config-btn") || block;
  positionTypingDrillPicker(picker, block, anchorTarget);
  watchStudyToolPickerPosition(picker, block, anchorTarget);

  const get = (key) => picker.querySelector(`[data-match-pairs-setting="${key}"]`);
  const titleInput = get("title");
  const sourceSelect = get("source");
  const leftSelect = get("left");
  const rightSelect = get("right");
  const hintSelect = get("hint");
  const limitInput = get("limit");
  const shuffleInput = get("shuffle");
  const filterPropertySelect = get("filter-property");
  const filterOperatorSelect = get("filter-operator");
  const filterValueInput = get("filter-value");
  const defaultSelect = get("default-mode");
  const switchInput = get("switch");
  const layoutSelect = get("layout");
  const surfaceSelect = get("surface");
  const promptSizeSelect = get("prompt-size");
  const answerSizeSelect = get("answer-size");
  const promptHeightSelect = get("prompt-height");
  const showSourceChipsInput = get("source-chips");
  const customAccentInput = get("custom-accent");
  const accentInput = get("accent");
  const backgroundUploadInput = get("background-upload");
  const sourceKey = (source) => `${source.kind}:${source.pageId}:${source.blockId || ""}`;
  const selectedSource = () => sources.find((source) => sourceKey(source) === sourceSelect.value) || null;
  const fillFieldSelect = (select, properties, value, includeNone = true) => {
    const choices = includeNone ? [{ value: "", label: "None" }] : [];
    choices.push({ value: "__title__", label: "Row title" });
    properties.forEach((property) => choices.push({ value: property.id, label: property.name || "Property" }));
    select.innerHTML = choices.map((choice) => `<option value="${escapeHTML(choice.value)}">${escapeHTML(choice.label)}</option>`).join("");
    select.value = value || "";
  };

  function setTab(name) {
    picker.querySelectorAll("[data-match-pairs-tab]").forEach((button) => button.classList.toggle("active", button.dataset.matchPairsTab === name));
    picker.querySelectorAll("[data-match-pairs-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.matchPairsPanel === name));
    window.requestAnimationFrame(() => positionTypingDrillPicker(picker, block, anchorTarget));
  }

  function workingConfig(resetSession = false) {
    const base = readMatchPairsConfig(block);
    const source = selectedSource();
    const modes = Array.from(picker.querySelectorAll("[data-match-pairs-allowed]:checked")).map((input) => input.value);
    const filters = filterPropertySelect.value ? [{ propertyId: filterPropertySelect.value, operator: filterOperatorSelect.value, value: filterValueInput.value }] : [];
    const next = normalizeMatchPairsConfig({
      ...base,
      title: titleInput.value,
      sourceKind: source?.kind || base.sourceKind,
      sourcePageId: source?.pageId || base.sourcePageId,
      sourceBlockId: source?.blockId || base.sourceBlockId,
      leftFieldId: leftSelect.value,
      rightFieldId: rightSelect.value,
      hintFieldId: hintSelect.value,
      filters,
      pairLimit: limitInput.value,
      shuffle: shuffleInput.checked,
      allowedModes: modes.length ? modes : [base.defaultMode],
      defaultMode: defaultSelect.value,
      layoutMode: layoutSelect.value,
      allowModeSwitch: switchInput.checked,
      surfaceStyle: surfaceSelect.value,
      promptSize: promptSizeSelect.value,
      answerSize: answerSizeSelect.value,
      promptHeight: promptHeightSelect.value,
      showSourceChips: showSourceChipsInput.checked,
      accentColor: customAccentInput.checked ? accentInput.value : "",
      backgroundImage: base.backgroundImage,
      scoring: readStudyScoreSettings(picker, "matching", base.scoring, { correctChange: 1, incorrectChange: -0.5 })
    });
    if (!resetSession) return next;
    const sessionSeed = Date.now();
    return normalizeMatchPairsConfig({
      ...next,
      matchedRowIds: [],
      selectedLeftId: "",
      selectedRightId: "",
      focusCursor: 0,
      focusResultId: "",
      hintRowId: "",
      wrongRowId: "",
      sessionSeed,
      mixedStep: 0,
      mixedLayout: chooseMixedMatchPairsLayout(sessionSeed, 0),
      mixedRoundRowIds: [],
      feedbackState: "reset",
      feedbackText: "New matching set ready."
    });
  }

  function syncFields(nextConfig = readMatchPairsConfig(block)) {
    const data = getMatchPairsSourceData(nextConfig);
    const properties = data?.database?.properties || [];
    const mapped = inferMatchPairsFields(properties, nextConfig);
    fillFieldSelect(leftSelect, properties, mapped.leftFieldId, false);
    fillFieldSelect(rightSelect, properties, mapped.rightFieldId, false);
    fillFieldSelect(hintSelect, properties, mapped.hintFieldId, true);
    fillFieldSelect(filterPropertySelect, properties, nextConfig.filters[0]?.propertyId || "", true);
    syncStudyScoreSettings(picker, "matching", properties, nextConfig.scoring, { correctChange: 1, incorrectChange: -0.5 });
  }

  function saveSettings(event) {
    const previous = readMatchPairsConfig(block);
    const sourceChanged = event?.target === sourceSelect;
    if (sourceChanged) {
      const source = selectedSource();
      const temporary = normalizeMatchPairsConfig({ ...readMatchPairsConfig(block), sourceKind: source?.kind, sourcePageId: source?.pageId, sourceBlockId: source?.blockId, leftFieldId: "", rightFieldId: "", hintFieldId: "" });
      syncFields(temporary);
    }
    const candidate = workingConfig();
    const sessionChanged = candidate.sourceKind !== previous.sourceKind
      || candidate.sourcePageId !== previous.sourcePageId
      || candidate.sourceBlockId !== previous.sourceBlockId
      || candidate.leftFieldId !== previous.leftFieldId
      || candidate.rightFieldId !== previous.rightFieldId
      || JSON.stringify(candidate.filters) !== JSON.stringify(previous.filters)
      || candidate.pairLimit !== previous.pairLimit
      || candidate.shuffle !== previous.shuffle;
    const next = sessionChanged ? workingConfig(true) : candidate;
    writeMatchPairsConfig(block, next);
    defaultSelect.value = next.defaultMode;
    layoutSelect.value = next.layoutMode;
    surfaceSelect.value = next.surfaceStyle;
    promptSizeSelect.value = next.promptSize;
    answerSizeSelect.value = next.answerSize;
    promptHeightSelect.value = next.promptHeight;
    customAccentInput.checked = !!next.accentColor;
    accentInput.disabled = !customAccentInput.checked;
    if (next.accentColor) picker.style.setProperty("--accent", next.accentColor);
    else picker.style.removeProperty("--accent");
    applyMatchPairsAccent(block, next.accentColor);
    picker.querySelectorAll("[data-match-pairs-allowed]").forEach((input) => { input.checked = next.allowedModes.includes(input.value); });
    renderMatchPairsBlock(block);
    if (typeof saveState === "function") saveState();
  }

  function syncMatchPairsAccentControls() {
    if (accentInput && customAccentInput) accentInput.disabled = !customAccentInput.checked;
    const accent = customAccentInput?.checked ? (accentInput?.value || "") : "";
    if (accent) picker.style.setProperty("--accent", accent);
    else picker.style.removeProperty("--accent");
    applyMatchPairsAccent(block, accent);
  }

  function saveMatchPairsAccentOnly() {
    const next = readMatchPairsConfig(block);
    next.accentColor = customAccentInput?.checked ? (accentInput?.value || "") : "";
    writeMatchPairsConfig(block, next);
    syncMatchPairsAccentControls();
    if (typeof saveState === "function") saveState();
  }

  sourceSelect.innerHTML = sources.map((source) => `<option value="${escapeHTML(sourceKey(source))}">${escapeHTML(source.label || source.title || "Database")}</option>`).join("");
  const currentSource = `${config.sourceKind}:${config.sourcePageId}:${config.sourceBlockId || ""}`;
  sourceSelect.value = sources.some((source) => sourceKey(source) === currentSource) ? currentSource : (sources[0] ? sourceKey(sources[0]) : "");
  titleInput.value = config.title;
  limitInput.value = String(config.pairLimit);
  shuffleInput.checked = config.shuffle;
  filterOperatorSelect.value = config.filters[0]?.operator || "is";
  filterValueInput.value = config.filters[0]?.value || "";
  defaultSelect.value = config.defaultMode;
  switchInput.checked = config.allowModeSwitch;
  layoutSelect.value = config.layoutMode;
  surfaceSelect.value = config.surfaceStyle;
  promptSizeSelect.value = config.promptSize;
  answerSizeSelect.value = config.answerSize;
  promptHeightSelect.value = config.promptHeight;
  showSourceChipsInput.checked = config.showSourceChips !== false;
  customAccentInput.checked = !!config.accentColor;
  accentInput.value = config.accentColor || "#7b9cff";
  accentInput.disabled = !customAccentInput.checked;
  syncMatchPairsAccentControls();
  picker.querySelectorAll("[data-match-pairs-allowed]").forEach((input) => { input.checked = config.allowedModes.includes(input.value); });
  const initialSource = selectedSource();
  const initialFieldConfig = config.sourcePageId ? config : normalizeMatchPairsConfig({
    ...config,
    sourceKind: initialSource?.kind,
    sourcePageId: initialSource?.pageId,
    sourceBlockId: initialSource?.blockId
  });
  syncFields(initialFieldConfig);
  if ((!config.sourcePageId || !getMatchPairsSourceData(config)) && initialSource) {
    const seededConfig = workingConfig(true);
    writeMatchPairsConfig(block, seededConfig);
    renderMatchPairsBlock(block);
    if (typeof saveState === "function") saveState();
  }
  picker.querySelector("[data-match-pairs-close]")?.addEventListener("click", closeMatchPairsPicker);
  picker.querySelector(".typing-drill-picker-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-match-pairs-tab]");
    if (button) setTab(button.dataset.matchPairsTab);
  });
  picker.addEventListener("change", (event) => {
    if (event.target === customAccentInput || event.target === accentInput) {
      saveMatchPairsAccentOnly();
      return;
    }
    saveSettings(event);
  });
  picker.addEventListener("input", (event) => {
    if (event.target === accentInput) {
      saveMatchPairsAccentOnly();
      return;
    }
    if (event.target.matches('input[type="text"], input[type="number"]')) saveSettings(event);
  });

  function readMatchPairsImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  picker.querySelector('[data-match-pairs-action="upload-bg"]')?.addEventListener("click", () => {
    backgroundUploadInput?.click();
  });

  picker.querySelector('[data-match-pairs-action="clear-bg"]')?.addEventListener("click", () => {
    const next = readMatchPairsConfig(block);
    next.backgroundImage = "";
    writeMatchPairsConfig(block, next);
    renderMatchPairsBlock(block);
    if (typeof saveState === "function") saveState();
  });

  backgroundUploadInput?.addEventListener("change", async () => {
    const file = backgroundUploadInput.files?.[0] || null;
    if (!file) return;
    const next = readMatchPairsConfig(block);
    next.backgroundImage = await readMatchPairsImageFile(file);
    writeMatchPairsConfig(block, next);
    renderMatchPairsBlock(block);
    if (typeof saveState === "function") saveState();
    backgroundUploadInput.value = "";
  });
}

window.mountMatchPairsBlock = function mountMatchPairsBlock(block, options = {}) {
  if (!block || block.dataset.type !== "match-pairs") return null;
  if (!block.dataset.matchPairsConfig) writeMatchPairsConfig(block, normalizeMatchPairsConfig({}));
  renderMatchPairsBlock(block);
  if (options.openPicker) openMatchPairsPicker(block, block.querySelector(".match-pairs-config-btn") || block);
  return block;
};

window.addEventListener("sanctum:database-updated", () => {
  window.requestAnimationFrame(() => {
    renderStudySourceBlocks();
    renderStudyDashboardBlocks();
  });
});

function renderStudySourceBlocks() {
  document.querySelectorAll('.block[data-type="flashcards"]').forEach((block) => {
    renderFlashcardDeckBlock(block);
  });
  document.querySelectorAll('.block[data-type="typing-drill"]').forEach((block) => {
    renderTypingDrillBlock(block);
  });
  document.querySelectorAll('.block[data-type="fill-blank"]').forEach((block) => {
    renderFillBlankBlock(block);
  });
  document.querySelectorAll('.block[data-type="match-pairs"]').forEach((block) => {
    renderMatchPairsBlock(block);
  });
}

window.renderStudySourceBlocks = renderStudySourceBlocks;

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
  renderStudyDashboardBlocks();
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

function getLinkedPageCardVisibleTypeLabel(host, label = "") {
  const normalized = String(label || "").trim().toLowerCase();
  const isFrameLinkedCard = host?.classList?.contains("frame-item")
    && (host.dataset?.frameChildType === "page" || host.dataset?.frameChildType === "domain");
  if (isFrameLinkedCard && (normalized === "page" || normalized === "domain")) return "";
  return label || "";
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
  if (cardTypeLabel) cardTypeLabel.textContent = getLinkedPageCardVisibleTypeLabel(block, payload.pageCardTypeLabel);
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
  if (cardTypeLabel) cardTypeLabel.textContent = getLinkedPageCardVisibleTypeLabel(block, payload.pageCardTypeLabel);
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
    imageCropShape: blockType === "image" ? normalizeImageCropShape(b.dataset.imageCropShape) : "original",
    imageFrameStyle: blockType === "image" ? normalizeImageFrameStyle(b.dataset.imageFrameStyle) : "none",
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
    dbFilters: blockType === "calendar" ? (b.dataset.dbFilters || "[]") : "[]",
    dbSorts: blockType === "calendar" ? (b.dataset.dbSorts || "[]") : "[]",
    dbGroupBy: blockType === "calendar" ? (b.dataset.dbGroupBy || "") : "",
    dbFolderState: blockType === "calendar" ? (b.dataset.dbFolderState || "{}") : "{}",
    dbResetConfig: blockType === "calendar" ? (b.dataset.dbResetConfig || "{}") : "{}",
    dbChecklistAutomation: blockType === "calendar" ? (b.dataset.dbChecklistAutomation || "{}") : "{}",
    dbStatusAutomation: blockType === "calendar" ? (b.dataset.dbStatusAutomation || "{}") : "{}",
    dbGalleryCardSize: blockType === "calendar" ? (b.dataset.dbGalleryCardSize || "") : "",
    dbGalleryCardFields: blockType === "calendar" ? (b.dataset.dbGalleryCardFields || "") : "",
    dbGalleryCardPropertyIds: blockType === "calendar" ? (b.dataset.dbGalleryCardPropertyIds || "[]") : "[]",
    dbGalleryOpenMode: blockType === "calendar" ? (b.dataset.dbGalleryOpenMode || "") : "",
    dbRowPageLayout: blockType === "calendar" ? (b.dataset.dbRowPageLayout || "") : "",
    dbRowPageKind: blockType === "calendar" ? (b.dataset.dbRowPageKind || "") : "",
    dbSourceKind: blockType === "calendar" ? (b.dataset.dbSourceKind || "") : "",
    dbSourcePageId: blockType === "calendar" ? (b.dataset.dbSourcePageId || "") : "",
    dbSourceBlockId: blockType === "calendar" ? (b.dataset.dbSourceBlockId || "") : "",
    dbViewTitle: blockType === "calendar" ? (b.dataset.dbViewTitle || "") : "",
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
    dataCalloutShowIcon: blockType === "data-callout" ? (b.dataset.dataCalloutShowIcon || "") : "",
    dataCalloutIcon: blockType === "data-callout" ? (b.dataset.dataCalloutIcon || "") : "",
    dataCalloutShowProjectImage: blockType === "data-callout" ? (b.dataset.dataCalloutShowProjectImage || "") : "",
    dataCalloutProjectImageLayout: blockType === "data-callout" ? (b.dataset.dataCalloutProjectImageLayout || "") : "",
    dataCalloutProjectImageSize: blockType === "data-callout" ? (b.dataset.dataCalloutProjectImageSize || "") : "",
    flashcardsConfig: blockType === "flashcards" ? (b.dataset.flashcardsConfig || "") : "",
    typingDrillConfig: blockType === "typing-drill" ? (b.dataset.typingDrillConfig || "") : "",
    fillBlankConfig: blockType === "fill-blank" ? (b.dataset.fillBlankConfig || "") : "",
    matchPairsConfig: blockType === "match-pairs" ? (b.dataset.matchPairsConfig || "") : "",
    studyDashboardConfig: ["session-progress", "daily-streak", "recent-answers"].includes(blockType) ? (b.dataset.studyDashboardConfig || "") : "",
    studySessionId: ["session-progress", "daily-streak", "recent-answers"].includes(blockType) ? (b.dataset.studySessionId || "") : "",
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
    buttonConfig: blockType === "button" ? (b.dataset.buttonConfig || "{}") : "",
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

gridEl.addEventListener("click", (e) => {
  if (!document.body.classList.contains("editing")) return;
  const configButton = e.target.closest('[data-study-widget-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="session-progress"], .block[data-type="daily-streak"], .block[data-type="recent-answers"]');
  if (!block) return;
  openStudyDashboardPicker(block, configButton);
});

gridEl.addEventListener("click", (e) => {
  const configButton = e.target.closest('[data-flashcards-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="flashcards"]');
  if (!block) return;
  if (!document.body.classList.contains("editing")) return;
  openFlashcardDeckPicker(block, configButton);
});

gridEl.addEventListener("click", (e) => {
  const configButton = e.target.closest('[data-typing-drill-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="typing-drill"]');
  if (!block) return;
  if (!document.body.classList.contains("editing")) return;
  openTypingDrillPicker(block, configButton);
});

gridEl.addEventListener("input", (e) => {
  const input = e.target.closest?.('[data-typing-drill-input="answer"]');
  if (!input) return;
  const block = input.closest('.block[data-type="typing-drill"]');
  if (!block) return;
  const config = readTypingDrillConfig(block);
  config.userAnswer = input.value || "";
  config.resultState = "idle";
  config.lastCorrect = false;
  config.feedbackState = "";
  config.feedbackText = "";
  writeTypingDrillConfig(block, config);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("keydown", (e) => {
  const input = e.target.closest?.('[data-typing-drill-input="answer"]');
  if (!input || e.key !== "Enter") return;
  const block = input.closest('.block[data-type="typing-drill"]');
  if (!block) return;
  e.preventDefault();
  const config = submitTypingDrillAnswer(block, input.value || "");
  writeTypingDrillConfig(block, config);
  renderTypingDrillBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const actionEl = e.target.closest('[data-typing-drill-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.typingDrillAction || "";
  if (!["check", "hint", "skip", "back", "reset"].includes(action)) return;
  const block = actionEl.closest('.block[data-type="typing-drill"]');
  if (!block) return;

  e.preventDefault();
  e.stopPropagation();

  let config = readTypingDrillConfig(block);
  const answerInput = block.querySelector('[data-typing-drill-input="answer"]');
  if (answerInput) config.userAnswer = answerInput.value || "";

  if (action === "check") {
    config = submitTypingDrillAnswer(block, config.userAnswer);
  } else if (action === "hint") {
    config.showHint = !config.showHint;
  } else if (action === "back") {
    config = moveTypingDrillBack(block);
  } else if (action === "reset") {
    config = resetTypingDrill(block);
  } else {
    const current = getTypingDrillCurrent(config);
    const { row } = current;
    config.scoreSkipped += 1;
    recordStudyActivity(block, config, {
      tool: "Typing Drill",
      rowId: row?.id || "",
      prompt: row ? getTypingDrillRowValue(row, config.promptFieldId) : "",
      result: "skipped",
      total: current.rows?.length || 0,
      durationMs: getStudyPromptDuration(block, {
        tool: "Typing Drill",
        rowId: row?.id || "",
        prompt: row ? getTypingDrillRowValue(row, config.promptFieldId) : "",
        expected: row ? getTypingDrillRowValue(row, config.answerFieldId) : ""
      })
    });
    writeTypingDrillConfig(block, config);
    config = advanceTypingDrill(block, {
      feedbackState: "skipped",
      feedbackText: "Skipped. Next prompt."
    });
  }

  writeTypingDrillConfig(block, config);
  renderTypingDrillBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const configButton = e.target.closest('[data-fill-blank-action="configure"]');
  if (!configButton) return;

  e.preventDefault();
  e.stopPropagation();

  const block = configButton.closest('.block[data-type="fill-blank"]');
  if (!block) return;
  if (!document.body.classList.contains("editing")) return;
  openFillBlankPicker(block, configButton);
});

gridEl.addEventListener("input", (e) => {
  const input = e.target.closest?.(".fill-blank-input");
  if (!input) return;
  const block = input.closest('.block[data-type="fill-blank"]');
  if (!block) return;
  const config = readFillBlankConfig(block);
  const inputs = Array.from(block.querySelectorAll(".fill-blank-input"));
  config.answers = inputs.map((inputEl) => inputEl.value || "");
  config.resultState = "idle";
  config.feedbackState = "";
  config.feedbackText = "";
  writeFillBlankConfig(block, config);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("keydown", (e) => {
  const input = e.target.closest?.(".fill-blank-input");
  if (!input || e.key !== "Enter") return;
  const block = input.closest('.block[data-type="fill-blank"]');
  if (!block) return;
  e.preventDefault();
  const config = submitFillBlankAnswer(block);
  writeFillBlankConfig(block, config);
  renderFillBlankBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const actionEl = e.target.closest('[data-fill-blank-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.fillBlankAction || "";
  if (!["check", "hint", "skip", "back", "reset"].includes(action)) return;
  const block = actionEl.closest('.block[data-type="fill-blank"]');
  if (!block) return;

  e.preventDefault();
  e.stopPropagation();

  let config = readFillBlankConfig(block);
  config.answers = Array.from(block.querySelectorAll(".fill-blank-input")).map((input) => input.value || "");

  if (action === "check") {
    config = submitFillBlankAnswer(block);
  } else if (action === "hint") {
    config.showHint = !config.showHint;
  } else if (action === "back") {
    config = moveFillBlankBack(block);
  } else if (action === "reset") {
    config = resetFillBlank(block);
  } else {
    const current = getFillBlankCurrent(config);
    const { row } = current;
    config.scoreSkipped += 1;
    recordStudyActivity(block, config, {
      tool: "Fill-in-the-Blank",
      rowId: row?.id || "",
      prompt: row ? getFillBlankRowValue(row, config.promptFieldId) : "",
      result: "skipped",
      total: current.rows?.length || 0,
      durationMs: getStudyPromptDuration(block, {
        tool: "Fill-in-the-Blank",
        rowId: row?.id || "",
        prompt: row ? getFillBlankRowValue(row, config.promptFieldId) : "",
        expected: row ? getFillBlankRowValue(row, config.answerFieldId) : ""
      })
    });
    writeFillBlankConfig(block, config);
    config = advanceFillBlank(block, {
      feedbackState: "skipped",
      feedbackText: "Skipped. Next prompt."
    });
  }

  writeFillBlankConfig(block, config);
  renderFillBlankBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const configButton = e.target.closest('[data-match-pairs-action="configure"]');
  if (!configButton) return;
  e.preventDefault();
  e.stopPropagation();
  const block = configButton.closest('.block[data-type="match-pairs"]');
  if (!block || !document.body.classList.contains("editing")) return;
  openMatchPairsPicker(block, configButton);
});

gridEl.addEventListener("click", (e) => {
  const choice = e.target.closest("[data-match-pairs-choice]");
  if (!choice) return;
  const block = choice.closest('.block[data-type="match-pairs"]');
  if (!block) return;
  e.preventDefault();
  e.stopPropagation();
  let config = chooseMatchPairsItem(block, choice.dataset.matchPairsChoice, choice.dataset.rowId || "");
  writeMatchPairsConfig(block, config);
  renderMatchPairsBlock(block);
  if (config.feedbackState === "wrong") {
    const wrongRowId = config.wrongRowId;
    window.setTimeout(() => {
      const current = readMatchPairsConfig(block);
      if (current.feedbackState !== "wrong" || current.wrongRowId !== wrongRowId) return;
      current.wrongRowId = "";
      current.feedbackState = "";
      current.feedbackText = "";
      writeMatchPairsConfig(block, current);
      renderMatchPairsBlock(block);
      if (typeof saveState === "function") saveState();
    }, 650);
  }
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const actionEl = e.target.closest("[data-match-pairs-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.matchPairsAction || "";
  if (!["mode", "reset", "hint", "skip", "next"].includes(action)) return;
  const block = actionEl.closest('.block[data-type="match-pairs"]');
  if (!block) return;
  e.preventDefault();
  e.stopPropagation();
  let config = readMatchPairsConfig(block);
  const { items } = getMatchPairsItems(config);
  const unmatched = items.filter((item) => !config.matchedRowIds.includes(item.id));
  if (action === "mode") {
    const mode = normalizeMatchPairsMode(actionEl.dataset.mode || "");
    if (config.allowedModes.includes(mode)) {
      config.layoutMode = mode;
      if (mode === "mixed") {
        config.sessionSeed = Date.now();
        config.mixedStep = 0;
        config.mixedLayout = chooseMixedMatchPairsLayout(config.sessionSeed, config.mixedStep);
        config.mixedRoundRowIds = [];
      }
    }
    config.selectedLeftId = "";
    config.selectedRightId = "";
    config.wrongRowId = "";
    config.focusResultId = "";
  } else if (action === "reset") {
    config = resetMatchPairsSession(block);
  } else if (action === "hint") {
    const target = getActiveMatchPairsLayout(config) === "focus"
      ? unmatched[config.focusCursor % Math.max(unmatched.length, 1)]
      : unmatched.find((item) => item.id === config.selectedLeftId) || unmatched[0];
    config.hintRowId = target?.id || "";
    config.feedbackState = target?.hint ? "hint" : "";
    config.feedbackText = target && !target.hint ? "No hint is mapped for this pair." : "";
  } else if (action === "next" && getActiveMatchPairsLayout(config) === "focus" && config.focusResultId) {
    config.focusResultId = "";
    config.hintRowId = "";
    config.wrongRowId = "";
    config.feedbackState = "";
    config.feedbackText = "";
    config.mixedRoundRowIds = [];
    advanceMixedMatchPairsLayout(config);
  } else if (action === "skip" && unmatched.length) {
    const target = getActiveMatchPairsLayout(config) === "focus"
      ? unmatched[config.focusCursor % Math.max(unmatched.length, 1)]
      : unmatched.find((item) => item.id === config.selectedLeftId) || unmatched[0];
    recordStudyActivity(block, config, {
      tool: "Match Pairs",
      rowId: target?.id || "",
      prompt: target?.left || "",
      expected: target?.right || "",
      result: "skipped",
      total: items.length,
      durationMs: getStudyPromptDuration(block, {
        tool: "Match Pairs",
        rowId: target?.id || "",
        prompt: target?.left || "",
        expected: target?.right || ""
      })
    });
    config.selectedLeftId = "";
    config.selectedRightId = "";
    config.focusResultId = "";
    config.hintRowId = "";
    config.wrongRowId = "";
    config.focusCursor = (config.focusCursor + 1) % unmatched.length;
    config.feedbackState = "";
    config.feedbackText = getActiveMatchPairsLayout(config) === "focus" ? "Skipped to another pair." : "Select another pair to continue.";
  }
  writeMatchPairsConfig(block, config);
  renderMatchPairsBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

gridEl.addEventListener("click", (e) => {
  const actionEl = e.target.closest('[data-flashcards-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.flashcardsAction || "";
  if (!["flip", "prev", "next"].includes(action)) return;

  const block = actionEl.closest('.block[data-type="flashcards"]');
  if (!block) return;

  e.preventDefault();
  e.stopPropagation();

  const config = readFlashcardDeckConfig(block);
  const cards = getFlashcardDeckCards(config);
  if (!cards.length) return;

  if (action === "flip") {
    if (!config.showBack) {
      applyFlashcardScoreAction(block, true);
      const { card } = getFlashcardDeckCurrent(config);
      recordStudyActivity(block, config, {
        tool: "Flashcards",
        rowId: card?.sourceRowId || card?.id || "",
        prompt: [card?.frontTitle, card?.frontBody].filter(Boolean).join(" - "),
        answer: [card?.backTitle, card?.backBody].filter(Boolean).join(" - "),
        expected: [card?.backTitle, card?.backBody].filter(Boolean).join(" - "),
        result: "correct",
        total: cards.length,
        durationMs: getStudyPromptDuration(block, {
          tool: "Flashcards",
          rowId: card?.sourceRowId || card?.id || "",
          prompt: [card?.frontTitle, card?.frontBody].filter(Boolean).join(" - "),
          expected: [card?.backTitle, card?.backBody].filter(Boolean).join(" - ")
        })
      });
    }
    config.showBack = !config.showBack;
  } else if (action === "prev") {
    config.currentIndex = (config.currentIndex - 1 + cards.length) % cards.length;
    config.showBack = false;
  } else if (action === "next") {
    config.currentIndex = (config.currentIndex + 1) % cards.length;
    config.showBack = false;
  }

  writeFlashcardDeckConfig(block, config);
  renderFlashcardDeckBlock(block);
  if (typeof saveState === "function") saveState();
}, true);

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

  if (preset === "container") {
    ensureFrameTypingLine(b);
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

function computeInboxQuestionCountCallout() {
  const inboxKey = window.STORAGE_KEYS?.helperInbox || "sanctum_helper_inbox_v1";
  const inbox = typeof window.readStorageJSON === "function"
    ? window.readStorageJSON(inboxKey, [])
    : [];
  const count = Array.isArray(inbox)
    ? inbox.filter((item) => (item?.status || "open") === "open").length
    : 0;

  return {
    valueText: formatDataCalloutNumber(count),
    subline: count ? `${count} pending question${count === 1 ? "" : "s"}` : "Inbox clear",
    configured: true
  };
}

function placePresetAtPointer(preset, clientX, clientY) {
  if (!document.body.classList.contains("editing")) return null;
  const pointer = getPointerPositionOnGrid(clientX, clientY);
  if (!pointer.rect) return null;

  const ghost = makeGhostBlock(preset);
  const defaultDims = getDefaultBlockDimensions(preset);
  const ghostW = parseInt(ghost.style.width || `${defaultDims.width}`, 10) || defaultDims.width;
  const ghostH = parseInt(ghost.style.height || `${defaultDims.height}`, 10) || defaultDims.height;

  const x = snap(Math.max(0, Math.min(pointer.x - (ghostW / 2), getGridViewportWidth() - ghostW)));
  const y = snap(Math.max(0, Math.min(pointer.y - 18, getGridViewportHeight() - ghostH)));

  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;

  const real = makeRealBlockFromGhost(ghost, preset);
  gridEl.appendChild(real);
  selectBlock(real);

  const body = real.querySelector(".block-body");
  const frameTypingLine = real.dataset.type === "container" ? real.querySelector(".frame-item-text-content") : null;
  if (frameTypingLine) {
    frameTypingLine.focus();
    placeCaretInsideEditable(frameTypingLine);
  } else if (body) {
    body.focus();
  }

  if (typeof autoGrowBlock === "function") autoGrowBlock(real);
  if (typeof expandGrid === "function") expandGrid();
  if (typeof saveState === "function") saveState();

  return real;
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

gridEl.addEventListener("dblclick", (e) => {
  if (!window.isInfiniteCanvasPage?.()) return;
  if (placing || !document.body.classList.contains("editing")) return;
  if (e.target.closest(".block")) return;

  e.preventDefault();
  e.stopPropagation();
  placePresetAtPointer("text", e.clientX, e.clientY);
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
  const frameTypingLine = real.dataset.type === "container" ? real.querySelector(".frame-item-text-content") : null;
  if (frameTypingLine) {
    frameTypingLine.focus();
    placeCaretInsideEditable(frameTypingLine);
  } else if (body) {
    body.focus();
  }

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

  if (placePreset === "button") {
    window.mountButtonBlock?.(real, { openPicker: true });
  }

  if (placePreset === "data-callout") {
    window.mountDataCalloutBlock?.(real, { openPicker: true });
  }

  if (placePreset === "progress") {
    window.mountProgressBlock?.(real, { openPicker: true });
  }

  if (placePreset === "flashcards") {
    window.mountFlashcardDeckBlock?.(real, { openPicker: true });
  }

  if (placePreset === "typing-drill") {
    window.mountTypingDrillBlock?.(real, { openPicker: true });
  }

  if (placePreset === "fill-blank") {
    window.mountFillBlankBlock?.(real, { openPicker: true });
  }

  if (placePreset === "match-pairs") {
    window.mountMatchPairsBlock?.(real, { openPicker: true });
  }

  if (["session-progress", "daily-streak", "recent-answers"].includes(placePreset)) {
    window.mountStudyDashboardBlock?.(real);
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

function getSelectedLayerTarget() {
  if (!selectedBlock) return null;
  return isFrameItemTarget(selectedBlock)
    ? selectedBlock.closest('.block[data-type="container"]')
    : selectedBlock;
}

function getTopLevelLayerBlocks() {
  return Array.from(document.querySelectorAll("#grid > .block"))
    .filter((block) => !block.classList.contains("ghost"));
}

function getSortedLayerBlocks() {
  return getTopLevelLayerBlocks().sort((a, b) => {
    const zDiff = (parseInt(a.style.zIndex || "0", 10) || 0) - (parseInt(b.style.zIndex || "0", 10) || 0);
    if (zDiff) return zDiff;
    return Array.prototype.indexOf.call(a.parentElement?.children || [], a)
      - Array.prototype.indexOf.call(b.parentElement?.children || [], b);
  });
}

function applyLayerOrder(blocks) {
  blocks.forEach((block, index) => {
    block.style.zIndex = String(index + 1);
  });
  topZIndex = blocks.length + 1;
}

function moveSelectedLayer(action) {
  if (!document.body.classList.contains("editing")) return;
  const target = getSelectedLayerTarget();
  if (!target) return;

  const blocks = getSortedLayerBlocks();
  const currentIndex = blocks.indexOf(target);
  if (currentIndex < 0) return;

  blocks.splice(currentIndex, 1);

  let nextIndex = currentIndex;
  if (action === "front") nextIndex = blocks.length;
  else if (action === "back") nextIndex = 0;
  else if (action === "forward") nextIndex = Math.min(blocks.length, currentIndex + 1);
  else if (action === "backward") nextIndex = Math.max(0, currentIndex - 1);

  blocks.splice(nextIndex, 0, target);
  applyLayerOrder(blocks);
  selectBlock(selectedBlock);
  if (typeof saveState === "function") saveState();
}

function getExplicitFrameTargetForBlock(block) {
  if (!block || isFrameItemTarget(block) || block.dataset.type === "container") return null;
  if (!getFrameDropTypeForBlock(block)) return null;

  const blockRect = block.getBoundingClientRect();
  const centerX = blockRect.left + (blockRect.width / 2);
  const centerY = blockRect.top + (blockRect.height / 2);

  return Array.from(document.querySelectorAll('#grid > .block[data-type="container"]'))
    .filter((container) => {
      if (container === block || block.contains(container)) return false;
      const rect = container.getBoundingClientRect();
      return centerX >= rect.left && centerX <= rect.right && centerY >= rect.top && centerY <= rect.bottom;
    })
    .sort((a, b) => (parseInt(b.style.zIndex || "0", 10) || 0) - (parseInt(a.style.zIndex || "0", 10) || 0))[0] || null;
}

function moveSelectedBlockIntoFrame() {
  if (!document.body.classList.contains("editing")) return;
  if (!selectedBlock || isFrameItemTarget(selectedBlock)) return;

  const targetFrame = getExplicitFrameTargetForBlock(selectedBlock);
  if (!targetFrame) {
    window.showAppToast?.("Place the block over a frame first.", "info");
    return;
  }

  const inserted = dropBlockIntoFrame(targetFrame, selectedBlock, {});
  if (inserted && typeof saveState === "function") saveState();
}

function clearDockTypeClasses() {
  document.body.classList.remove("block-type-text", "block-type-list", "block-type-image", "block-type-container", "block-type-table", "block-type-button");
}

function selectBlock(block) {
  closeCanvasColorPopover();
  closeImageCropPopover();
  closeImageFramePopover();
  window.closeCanvasSlashMenu?.();
  if (selectedBlock) selectedBlock.classList.remove("selected");
  selectedBlock = block || null;
  document.body.classList.remove("block-selected");
  clearDockTypeClasses();

  if (selectedBlock) {
    selectedBlock.classList.add("selected");
    document.body.classList.add("block-selected");

    const type = getCanvasTargetType(selectedBlock);
    if (type !== "table" || selectedBlock !== activeTableSelection?.tableTarget) {
      clearTableRangeSelection();
    }
    if (type !== "table" && tableSelectionMode) {
      setTableSelectionMode(false);
    }
    if (type === "button") document.body.classList.add("block-type-button");
    if (type === "text" || type === "data-callout" || type === "progress" || type === "clock" || type === "flashcards" || type === "typing-drill" || type === "fill-blank" || type === "match-pairs" || type === "session-progress" || type === "daily-streak" || type === "recent-answers" || isDividerType(type)) document.body.classList.add("block-type-text");
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
  closeImageCropPopover();
  closeImageFramePopover();
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
const layerSendBackBtn  = document.getElementById("layerSendBackBtn");
const layerBackwardBtn  = document.getElementById("layerBackwardBtn");
const layerForwardBtn   = document.getElementById("layerForwardBtn");
const layerBringFrontBtn = document.getElementById("layerBringFrontBtn");
const layerIntoFrameBtn = document.getElementById("layerIntoFrameBtn");
const buttonBgBtn       = document.getElementById("buttonBgBtn");
const buttonTextColorBtn = document.getElementById("buttonTextColorBtn");
const buttonBorderBtn   = document.getElementById("buttonBorderBtn");
const buttonRadiusBtn   = document.getElementById("buttonRadiusBtn");
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
  "#imageCropBtn",
  "#imageFrameBtn",
  "#containerBorderBtn",
  "#buttonBgBtn",
  "#buttonTextColorBtn",
  "#buttonBorderBtn"
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
    bg: ["blockBgBtn", "buttonBgBtn"],
    text: ["blockTextColorBtn", "buttonTextColorBtn"],
    border: ["blockBorderBtn", "listBorderBtn", "containerBorderBtn", "buttonBorderBtn"]
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
  const cropButton = document.getElementById("imageCropBtn");
  const frameButton = document.getElementById("imageFrameBtn");
  const imageShape = selectedBlock && getCanvasTargetType(selectedBlock) === "image"
    ? normalizeImageCropShape(selectedBlock.dataset.imageCropShape)
    : "original";
  const imageFrame = selectedBlock && getCanvasTargetType(selectedBlock) === "image"
    ? normalizeImageFrameStyle(selectedBlock.dataset.imageFrameStyle)
    : "none";

  setDockToolTint(blockBgBtn, bgColor);
  setDockToolTint(blockTextColorBtn, textColor);
  getCanvasColorTriggerButtons("border").forEach((button) => setDockToolTint(button, borderColor));
  setDockToolTint(buttonBgBtn, bgColor);
  setDockToolTint(buttonTextColorBtn, textColor);

  const layerTarget = getSelectedLayerTarget();
  const layerBlocks = getSortedLayerBlocks();
  const layerIndex = layerTarget ? layerBlocks.indexOf(layerTarget) : -1;
  const canLayer = layerIndex >= 0;
  if (layerSendBackBtn) layerSendBackBtn.disabled = !canLayer || layerIndex === 0;
  if (layerBackwardBtn) layerBackwardBtn.disabled = !canLayer || layerIndex === 0;
  if (layerForwardBtn) layerForwardBtn.disabled = !canLayer || layerIndex === layerBlocks.length - 1;
  if (layerBringFrontBtn) layerBringFrontBtn.disabled = !canLayer || layerIndex === layerBlocks.length - 1;
  if (layerIntoFrameBtn) layerIntoFrameBtn.disabled = !selectedBlock || isFrameItemTarget(selectedBlock) || !getExplicitFrameTargetForBlock(selectedBlock);

  cropButton?.classList.toggle("active", imageShape !== "original");
  frameButton?.classList.toggle("active", imageFrame !== "none");
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

let imageCropPopover = null;
let activeImageCropTrigger = null;
let imageFramePopover = null;
let activeImageFrameTrigger = null;

function getImageCropPopover() {
  if (imageCropPopover) return imageCropPopover;
  imageCropPopover = document.createElement("div");
  imageCropPopover.id = "imageCropPopover";
  imageCropPopover.className = "image-crop-popover";
  imageCropPopover.hidden = true;
  document.body.appendChild(imageCropPopover);
  imageCropPopover.addEventListener("mousedown", (event) => event.stopPropagation());
  return imageCropPopover;
}

function positionImageCropPopover(trigger) {
  const popover = getImageCropPopover();
  if (!trigger || !popover) return;

  const rect = trigger.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth || 190;
  const popoverHeight = popover.offsetHeight || 260;

  let left = rect.left - popoverWidth - 8;
  if (left < 12) {
    left = Math.min(window.innerWidth - popoverWidth - 12, rect.right + 8);
  }

  let top = rect.top + (rect.height / 2) - (popoverHeight / 2);
  top = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, top));

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function closeImageCropPopover() {
  if (!imageCropPopover) return;
  activeImageCropTrigger?.classList.remove("active");
  imageCropPopover.hidden = true;
  imageCropPopover.innerHTML = "";
  activeImageCropTrigger = null;
}

function getImageFramePopover() {
  if (imageFramePopover) return imageFramePopover;
  imageFramePopover = document.createElement("div");
  imageFramePopover.id = "imageFramePopover";
  imageFramePopover.className = "image-frame-popover";
  imageFramePopover.hidden = true;
  document.body.appendChild(imageFramePopover);
  imageFramePopover.addEventListener("mousedown", (event) => event.stopPropagation());
  return imageFramePopover;
}

function positionImageFramePopover(trigger) {
  const popover = getImageFramePopover();
  if (!trigger || !popover) return;

  const rect = trigger.getBoundingClientRect();
  const popoverWidth = popover.offsetWidth || 190;
  const popoverHeight = popover.offsetHeight || 196;

  let left = rect.left - popoverWidth - 8;
  if (left < 12) {
    left = Math.min(window.innerWidth - popoverWidth - 12, rect.right + 8);
  }

  let top = rect.top + (rect.height / 2) - (popoverHeight / 2);
  top = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, top));

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function closeImageFramePopover() {
  if (!imageFramePopover) return;
  activeImageFrameTrigger?.classList.remove("active");
  imageFramePopover.hidden = true;
  imageFramePopover.innerHTML = "";
  activeImageFrameTrigger = null;
}

function buildImageFramePopover() {
  const popover = getImageFramePopover();
  popover.innerHTML = "";

  const currentFrame = normalizeImageFrameStyle(selectedBlock?.dataset?.imageFrameStyle);
  IMAGE_FRAME_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-frame-option${option.value === currentFrame ? " active" : ""}`;
    button.dataset.imageFrameStyle = option.value;
    button.innerHTML = `
      <span class="image-frame-option-icon" data-frame="${option.value}"></span>
      <span class="image-frame-option-label">${option.label}</span>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      withSelectedBlock((block) => {
        if (getCanvasTargetType(block) !== "image") return;
        applyImageFrameStyle(block, option.value, { skipSave: true });
      });
      closeImageFramePopover();
    });
    popover.appendChild(button);
  });
}

function toggleImageFramePopover(trigger) {
  if (!selectedBlock || getCanvasTargetType(selectedBlock) !== "image" || !trigger) return;

  const popover = getImageFramePopover();
  if (!popover.hidden && activeImageFrameTrigger === trigger) {
    closeImageFramePopover();
    return;
  }

  closeCanvasColorPopover();
  closeImageCropPopover();
  activeImageFrameTrigger?.classList.remove("active");
  buildImageFramePopover();
  activeImageFrameTrigger = trigger;
  trigger.classList.add("active");
  popover.hidden = false;
  positionImageFramePopover(trigger);
}

function buildImageCropPopover() {
  const popover = getImageCropPopover();
  popover.innerHTML = "";

  const currentShape = normalizeImageCropShape(selectedBlock?.dataset?.imageCropShape);
  IMAGE_CROP_OPTIONS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `image-crop-option${option.value === currentShape ? " active" : ""}`;
    button.dataset.imageCropShape = option.value;
    button.innerHTML = `
      <span class="image-crop-option-icon" data-shape="${option.value}"></span>
      <span class="image-crop-option-label">${option.label}</span>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      withSelectedBlock((block) => {
        if (getCanvasTargetType(block) !== "image") return;
        applyImageCropShape(block, option.value, { resize: true, skipSave: true });
        if (isFrameItemTarget(block)) {
          const ownerBlock = getCanvasOwnerBlock(block);
          if (ownerBlock && typeof autoGrowBlock === "function") autoGrowBlock(ownerBlock);
        }
      });
      closeImageCropPopover();
    });
    popover.appendChild(button);
  });
}

function toggleImageCropPopover(trigger) {
  if (!selectedBlock || getCanvasTargetType(selectedBlock) !== "image" || !trigger) return;

  const popover = getImageCropPopover();
  if (!popover.hidden && activeImageCropTrigger === trigger) {
    closeImageCropPopover();
    return;
  }

  closeCanvasColorPopover();
  closeImageFramePopover();
  activeImageCropTrigger?.classList.remove("active");
  buildImageCropPopover();
  activeImageCropTrigger = trigger;
  trigger.classList.add("active");
  popover.hidden = false;
  positionImageCropPopover(trigger);
}

document.addEventListener("mousedown", (event) => {
  if (event.target.closest("#imageCropPopover, #imageCropBtn")) return;
  closeImageCropPopover();
});

document.addEventListener("mousedown", (event) => {
  if (event.target.closest("#imageFramePopover, #imageFrameBtn")) return;
  closeImageFramePopover();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeImageCropPopover();
    closeImageFramePopover();
  }
});

window.addEventListener("resize", () => {
  if (!imageCropPopover || imageCropPopover.hidden) return;
  if (!activeImageCropTrigger) {
    closeImageCropPopover();
    return;
  }
  positionImageCropPopover(activeImageCropTrigger);
});

window.addEventListener("resize", () => {
  if (!imageFramePopover || imageFramePopover.hidden) return;
  if (!activeImageFrameTrigger) {
    closeImageFramePopover();
    return;
  }
  positionImageFramePopover(activeImageFrameTrigger);
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

  const type = getCanvasTargetType(block);
  if (type === "button") {
    window.mountButtonBlock?.(block);
    return;
  }

  if (type === "table") {
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

  if (getCanvasTargetType(block) === "button") {
    window.mountButtonBlock?.(block);
    return;
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
  if (value) block.style.setProperty("--page-db-checklist-text", value);
  else block.style.removeProperty("--page-db-checklist-text");

  const type = getCanvasTargetType(block);
  if (type === "button") {
    window.mountButtonBlock?.(block);
    return;
  }
  const textParts = block.querySelectorAll([
    ".canvas-rich-heading",
    ".block-body h1",
    ".block-body h2",
    ".block-body h3",
    ".data-callout-value",
    ".data-callout-label",
    ".data-callout-icon",
    ".data-callout-project-single strong",
    ".data-callout-project-single small",
    ".data-callout-project-row strong",
    ".data-callout-project-row small",
    ".button-block-shell",
    ".button-block-btn",
    ".button-block-label",
    ".button-block-icon",
    ".page-database-block-shell",
    ".page-database-gallery-card",
    ".page-database-gallery-card-title",
    ".page-database-gallery-card-field-label",
    ".page-database-gallery-card-field-value",
    ".page-database-gallery-add-card",
    ".page-database-checklist",
    ".page-database-checklist-title",
    ".page-database-checklist-title-input",
    ".page-database-checklist-side-value",
    ".page-database-checklist-add-row",
    ".progress-block-title",
    ".progress-block-value",
    ".study-widget-title"
  ].join(", "));
  textParts.forEach((part) => {
    part.style.color = value || "";
  });

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
    block.querySelectorAll("th.table-cell").forEach((cell) => {
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

layerSendBackBtn?.addEventListener("click", () => moveSelectedLayer("back"));
layerBackwardBtn?.addEventListener("click", () => moveSelectedLayer("backward"));
layerForwardBtn?.addEventListener("click", () => moveSelectedLayer("forward"));
layerBringFrontBtn?.addEventListener("click", () => moveSelectedLayer("front"));
layerIntoFrameBtn?.addEventListener("click", () => moveSelectedBlockIntoFrame());


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
const imageReplaceBtn = document.getElementById("imageReplaceBtn");
const imageCropBtn    = document.getElementById("imageCropBtn");
const imageFrameBtn   = document.getElementById("imageFrameBtn");

if (imageDeleteBtn)  imageDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (imageReplaceBtn) imageReplaceBtn.addEventListener("click", () => withSelectedBlock((b) => {
  promptImageUploadForBlock(b);
}));
if (imageCropBtn) imageCropBtn.addEventListener("click", (event) => {
  event.preventDefault();
  toggleImageCropPopover(imageCropBtn);
});
if (imageFrameBtn) imageFrameBtn.addEventListener("click", (event) => {
  event.preventDefault();
  toggleImageFramePopover(imageFrameBtn);
});

// == Container block dock buttons ==
const containerBgBtn     = document.getElementById("containerBgBtn");
const containerBorderBtn = document.getElementById("containerBorderBtn");
const containerRadiusBtn = document.getElementById("containerRadiusBtn");
const containerDeleteBtn = document.getElementById("containerDeleteBtn");
const buttonConfigBtn    = document.getElementById("buttonConfigBtn");
const buttonDeleteBtn    = document.getElementById("buttonDeleteBtn");

if (containerDeleteBtn) containerDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (buttonDeleteBtn)    buttonDeleteBtn.addEventListener("click", () => deleteSelectedBlock());
if (buttonBgBtn) {
  buttonBgBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("bg", buttonBgBtn);
  });
}
if (buttonTextColorBtn) {
  buttonTextColorBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("text", buttonTextColorBtn);
  });
}
if (buttonBorderBtn) {
  buttonBorderBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleCanvasColorPopover("border", buttonBorderBtn);
  });
}
if (buttonRadiusBtn) {
  buttonRadiusBtn.addEventListener("click", () => withSelectedBlock((b) => {
    const state = b.dataset.radiusState || "rounded";
    if (state === "rounded") { b.style.borderRadius = "2px"; b.dataset.radiusState = "square"; }
    else { b.style.borderRadius = "12px"; b.dataset.radiusState = "rounded"; }
    window.mountButtonBlock?.(b);
  }));
}
if (buttonConfigBtn) {
  buttonConfigBtn.addEventListener("click", () => {
    if (selectedBlock && selectedBlock.dataset.type === "button") {
      window.openButtonBlockConfig?.(selectedBlock);
    }
  });
}
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
  if (document.body.classList.contains("infinite-canvas-page")) return;
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

  const { maxRight, maxBottom } = getGridContentBounds(grid);
  const canvas = document.querySelector(".page-canvas");
  const viewportWidth = Math.max(0, Math.floor(canvas?.clientWidth || window.innerWidth || 0));
  const stableWidth = Math.max(viewportWidth, maxRight + 200, GRID_SIZE * 50);

  const minHeight = window.innerHeight - 70;
  grid.style.minWidth = `${stableWidth}px`;
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

  if (block?.dataset?.type === "match-pairs") {
    enforceMinHeight(block);
    return;
  }

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

  const containerBlock = item.closest('.block[data-type="container"]');
  const siblingItems = Array.from(item.parentElement?.querySelectorAll(":scope > .frame-item") || []);
  if (siblingItems.length <= 1) {
    e.preventDefault();
    focusFrameTextItem(item);
    return;
  }

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

  const typingLine = containerBlock ? ensureFrameTypingLine(containerBlock, { focus: true }) : null;
  if (!typingLine) prompt?.focus();
});

document.addEventListener("input", (e) => {
  const editable = e.target.closest?.(".frame-item-text-content");
  if (!editable) return;

  const containerBlock = editable.closest('.block[data-type="container"]');
  if (!containerBlock) return;

  ensureFrameTypingLine(containerBlock);
  if (typeof autoGrowBlock === "function") autoGrowBlock(containerBlock);
});














