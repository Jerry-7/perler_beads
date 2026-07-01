import type { PatternCell, PatternResult } from "./types";
import { applyUsagePatch, recalculateUsage } from "./patternEditing";

export interface EditorPointInput {
  x: number;
  y: number;
  viewportLeft: number;
  viewportTop: number;
  rulerSize: number;
  translateX: number;
  translateY: number;
  scale: number;
  baseCellSize: number;
  widthCells: number;
  heightCells: number;
}

export interface EditorCellPosition {
  row: number;
  col: number;
  key: string;
}

export interface EditorTouchPointInput {
  touch: { pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number };
  viewportLeft: number;
  viewportTop: number;
}

export interface EditorTouchDistanceInput {
  touches: Array<{ pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number }>; 
  viewportLeft: number;
  viewportTop: number;
}

export type EditorPatchType = "paint" | "stroke" | "fill";

export interface EditorCellPatch {
  row: number;
  col: number;
  beforeCell: PatternCell;
  afterCell: PatternCell;
}

export interface EditorPatch {
  type: EditorPatchType;
  label: string;
  selectedKey: string;
  changes: EditorCellPatch[];
}

export interface EditorPatchHistory {
  past: EditorPatch[];
  future: EditorPatch[];
  limit: number;
}

export function getCellFromEditorPoint(input: EditorPointInput): EditorCellPosition | null {
  const scale = input.scale > 0 ? input.scale : 1;
  const localX = input.x - input.viewportLeft - input.rulerSize - input.translateX;
  const localY = input.y - input.viewportTop - input.rulerSize - input.translateY;
  const patternX = localX / scale;
  const patternY = localY / scale;
  const width = input.widthCells * input.baseCellSize;
  const height = input.heightCells * input.baseCellSize;

  if (
    patternX < 0 ||
    patternY < 0 ||
    patternX >= width ||
    patternY >= height ||
    input.baseCellSize <= 0 ||
    input.widthCells <= 0 ||
    input.heightCells <= 0
  ) {
    return null;
  }

  const col = Math.min(input.widthCells - 1, Math.floor(patternX / input.baseCellSize));
  const row = Math.min(input.heightCells - 1, Math.floor(patternY / input.baseCellSize));
  return { row, col, key: `${row}-${col}` };
}

export function getCellFromEditorTouchPoint(
  input: Omit<EditorPointInput, "x" | "y"> & {
    touch: { pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number };
  }
): EditorCellPosition | null {
  // 优先使用 canvas-relative 坐标 (touch.x / touch.y)，因为它们是
  // WeChat Canvas 2D 原生坐标，不依赖 createSelectorQuery 异步获取的
  // editorCanvasRectLeft/Top 的准确性。
  if (typeof input.touch.x === "number" && typeof input.touch.y === "number") {
    const cell = getCellFromEditorPoint({
      ...input,
      x: input.viewportLeft + input.touch.x,
      y: input.viewportTop + input.touch.y
    });
    if (cell) {
      return cell;
    }
  }

  // 回退到 pageX/pageY（页面坐标），依赖 resolveEditorTouchPoint 提取
  const viewportPoint = resolveEditorTouchPoint({
    touch: input.touch,
    viewportLeft: input.viewportLeft,
    viewportTop: input.viewportTop
  });
  const viewportCell = getCellFromEditorPoint({ ...input, x: viewportPoint.x, y: viewportPoint.y });
  if (viewportCell) {
    return viewportCell;
  }

  return null;
}
export function resolveEditorTouchPoint(input: EditorTouchPointInput): { x: number; y: number } {
  const touch = input.touch;
  if (typeof touch.pageX === "number" && typeof touch.pageY === "number") {
    return { x: touch.pageX, y: touch.pageY };
  }
  if (typeof touch.clientX === "number" && typeof touch.clientY === "number") {
    return { x: touch.clientX, y: touch.clientY };
  }
  return {
    x: input.viewportLeft + (touch.x || 0),
    y: input.viewportTop + (touch.y || 0)
  };
}

export function getEditorTouchDistance(input: EditorTouchDistanceInput): number {
  const first = input.touches[0];
  const second = input.touches[1];
  if (!first || !second) {
    return 0;
  }
  const firstPoint = resolveEditorTouchPoint({
    touch: first,
    viewportLeft: input.viewportLeft,
    viewportTop: input.viewportTop
  });
  const secondPoint = resolveEditorTouchPoint({
    touch: second,
    viewportLeft: input.viewportLeft,
    viewportTop: input.viewportTop
  });
  const deltaX = secondPoint.x - firstPoint.x;
  const deltaY = secondPoint.y - firstPoint.y;
  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}
export function createEditorPatchHistory(limit = 10): EditorPatchHistory {
  return {
    past: [],
    future: [],
    limit
  };
}

export function pushEditorPatchHistory(history: EditorPatchHistory, patch: EditorPatch): EditorPatchHistory {
  if (!patch.changes.length) {
    return history;
  }
  return {
    ...history,
    past: [...history.past, patch].slice(-history.limit),
    future: []
  };
}

export function undoEditorPatchHistory(history: EditorPatchHistory): { history: EditorPatchHistory; patch: EditorPatch | null } {
  if (!history.past.length) {
    return { history, patch: null };
  }
  const patch = history.past[history.past.length - 1];
  return {
    patch,
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [patch, ...history.future]
    }
  };
}

export function redoEditorPatchHistory(history: EditorPatchHistory): { history: EditorPatchHistory; patch: EditorPatch | null } {
  if (!history.future.length) {
    return { history, patch: null };
  }
  const patch = history.future[0];
  return {
    patch,
    history: {
      ...history,
      past: [...history.past, patch].slice(-history.limit),
      future: history.future.slice(1)
    }
  };
}

export function applyEditorPatch(result: PatternResult, patch: EditorPatch, direction: "undo" | "redo"): PatternResult {
  if (!patch.changes.length) {
    return result;
  }
  const rowMap = new Map<number, PatternCell[]>();
  const nextCells = [...result.cells];
  const appliedChanges: Array<{ beforeCell: PatternCell; afterCell: PatternCell }> = [];
  for (const change of patch.changes) {
    const sourceRow = result.cells[change.row];
    if (!sourceRow || !sourceRow[change.col]) {
      continue;
    }
    let nextRow = rowMap.get(change.row);
    if (!nextRow) {
      nextRow = [...sourceRow];
      rowMap.set(change.row, nextRow);
      nextCells[change.row] = nextRow;
    }
    const targetCell = direction === "undo" ? change.beforeCell : change.afterCell;
    nextRow[change.col] = targetCell;
    appliedChanges.push({ beforeCell: sourceRow[change.col], afterCell: targetCell });
  }

  // 增量更新：当变更量小于总 cell 数一半时使用增量方式，避免全量遍历
  const totalCells = result.cells.length * (result.cells[0]?.length ?? 0);
  const usage = appliedChanges.length <= totalCells / 2
    ? applyUsagePatch(result.usage, appliedChanges)
    : recalculateUsage(nextCells);

  return {
    ...result,
    cells: nextCells,
    usage,
  };
}

export function floodFillPattern<T>(cells: T[][], startRow: number, startCol: number): EditorCellPosition[] {
  const target = cells[startRow]?.[startCol];
  if (target === undefined) {
    return [];
  }

  const height = cells.length;
  const width = cells[0]?.length ?? 0;
  const queue: EditorCellPosition[] = [{ row: startRow, col: startCol, key: `${startRow}-${startCol}` }];
  const visited = new Set<string>([`${startRow}-${startCol}`]);
  const filled: EditorCellPosition[] = [];
  let cursor = 0;

  while (cursor < queue.length) {
    const cell = queue[cursor];
    cursor += 1;
    if (cells[cell.row]?.[cell.col] !== target) {
      continue;
    }
    filled.push(cell);

    const nextCells = [
      [cell.row - 1, cell.col],
      [cell.row + 1, cell.col],
      [cell.row, cell.col - 1],
      [cell.row, cell.col + 1]
    ];
    for (const [row, col] of nextCells) {
      const key = `${row}-${col}`;
      if (row >= 0 && col >= 0 && row < height && col < width && !visited.has(key)) {
        visited.add(key);
        queue.push({ row, col, key });
      }
    }
  }

  return filled;
}
