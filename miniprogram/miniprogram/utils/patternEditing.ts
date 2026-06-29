import type { BeadCell, BeadUsage, PaletteColor, PatternCell, PatternResult, Rgb } from "./types";
import { isBeadCell, isEmptyCell } from "./types";

export interface PatternCellPosition {
  row: number;
  col: number;
}

export interface EditPopoverPositionInput {
  cellX: number;
  cellY: number;
  cellSize: number;
  canvasWidth: number;
  canvasHeight: number;
  popoverWidth: number;
  popoverHeight: number;
}

export interface EditPopoverPosition {
  left: number;
  top: number;
}

export interface ViewportPopoverPositionInput {
  cellLeft: number;
  cellTop: number;
  cellSize: number;
  viewportWidth: number;
  viewportHeight: number;
  popoverWidth: number;
  popoverHeight: number;
}

export function replacePatternCellColor(
  result: PatternResult,
  row: number,
  col: number,
  paletteColor: PaletteColor
): PatternResult {
  const target = result.cells[row]?.[col];
  if (!target || isEmptyCell(target)) {
    return result;
  }
  if (isBeadCell(target) && target.beadCode === paletteColor.code) {
    return result;
  }

  const nextCell = replaceBeadLikeCell(target, paletteColor);
  const nextRow = [...result.cells[row]];
  nextRow[col] = nextCell;
  const nextCells = [...result.cells];
  nextCells[row] = nextRow;

  return {
    ...result,
    cells: nextCells,
    usage: updateUsageForReplacement(result.usage, target, nextCell)
  };
}

export function replacePatternCellsColor(
  result: PatternResult,
  positions: PatternCellPosition[],
  paletteColor: PaletteColor
): PatternResult {
  if (!positions.length) {
    return result;
  }
  const targetKeys = new Set(positions.map((position) => `${position.row}-${position.col}`));
  let changed = false;
  const nextCells = result.cells.map((cellRow, rowIndex) =>
    cellRow.map((cell, colIndex) => {
      if (!targetKeys.has(`${rowIndex}-${colIndex}`) || isEmptyCell(cell)) {
        return cell;
      }
      changed = true;
      return replaceBeadLikeCell(cell, paletteColor);
    })
  );

  if (!changed) {
    return result;
  }
  return {
    ...result,
    cells: nextCells,
    usage: recalculateUsage(nextCells)
  };
}
export function recalculateUsage(cells: PatternCell[][]): BeadUsage[] {
  const usageMap: Record<string, BeadUsage> = {};
  for (const row of cells) {
    for (const cell of row) {
      if (!isBeadCell(cell)) {
        continue;
      }
      if (!usageMap[cell.beadCode]) {
        usageMap[cell.beadCode] = {
          beadCode: cell.beadCode,
          beadName: cell.beadName,
          beadRgb: cell.beadRgb,
          count: 0
        };
      }
      usageMap[cell.beadCode].count += 1;
    }
  }

  return Object.values(usageMap).sort((left, right) => left.beadCode.localeCompare(right.beadCode));
}

function updateUsageForReplacement(usage: BeadUsage[], oldCell: PatternCell, nextCell: BeadCell): BeadUsage[] {
  const usageMap: Record<string, BeadUsage> = {};
  for (const item of usage) {
    usageMap[item.beadCode] = { ...item, beadRgb: [...item.beadRgb] as Rgb };
  }

  if (isBeadCell(oldCell) && usageMap[oldCell.beadCode]) {
    usageMap[oldCell.beadCode].count -= 1;
    if (usageMap[oldCell.beadCode].count <= 0) {
      delete usageMap[oldCell.beadCode];
    }
  }

  if (!usageMap[nextCell.beadCode]) {
    usageMap[nextCell.beadCode] = {
      beadCode: nextCell.beadCode,
      beadName: nextCell.beadName,
      beadRgb: nextCell.beadRgb,
      count: 0
    };
  }
  usageMap[nextCell.beadCode].count += 1;

  return Object.values(usageMap).sort((left, right) => left.beadCode.localeCompare(right.beadCode));
}

export interface UsageChange {
  beforeCell: PatternCell;
  afterCell: PatternCell;
}

/**
 * 增量更新 usage —— 基于 patch changes 中的 beforeCell/afterCell，
 * 避免 recalculateUsage 的全量 O(n×m) 遍历。
 * 适用于批量编辑操作（单点、连涂、填充、撤销、重做）。
 */
export function applyUsagePatch(usage: BeadUsage[], changes: UsageChange[]): BeadUsage[] {
  const usageMap: Record<string, BeadUsage> = {};
  for (const item of usage) {
    usageMap[item.beadCode] = { ...item, beadRgb: [...item.beadRgb] as Rgb };
  }

  for (const { beforeCell, afterCell } of changes) {
    // 扣除旧颜色
    if (isBeadCell(beforeCell) && usageMap[beforeCell.beadCode]) {
      usageMap[beforeCell.beadCode].count -= 1;
      if (usageMap[beforeCell.beadCode].count <= 0) {
        delete usageMap[beforeCell.beadCode];
      }
    }
    // 增加新颜色
    if (isBeadCell(afterCell)) {
      if (!usageMap[afterCell.beadCode]) {
        usageMap[afterCell.beadCode] = {
          beadCode: afterCell.beadCode,
          beadName: afterCell.beadName,
          beadRgb: afterCell.beadRgb,
          count: 0,
        };
      }
      usageMap[afterCell.beadCode].count += 1;
    }
  }

  return Object.values(usageMap).sort((left, right) => left.beadCode.localeCompare(right.beadCode));
}

export function filterPaletteColors(colors: PaletteColor[], query: string, limit = 12): PaletteColor[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  return colors
    .filter((color) => color.enabled)
    .filter((color) => color.code.toLowerCase().includes(normalizedQuery) || color.name.toLowerCase().includes(normalizedQuery))
    .slice(0, limit);
}

export function getEditPopoverPosition(input: EditPopoverPositionInput): EditPopoverPosition {
  const gap = 8;
  const preferredLeft = input.cellX + input.cellSize + gap;
  const preferredTop = input.cellY + input.cellSize + gap;
  const fallbackLeft = input.cellX - input.popoverWidth - gap;
  const fallbackTop = input.cellY - input.popoverHeight - gap;
  const left = preferredLeft + input.popoverWidth <= input.canvasWidth ? preferredLeft : fallbackLeft;
  const top = preferredTop + input.popoverHeight <= input.canvasHeight ? preferredTop : fallbackTop;

  return {
    left: clamp(left, 0, Math.max(0, input.canvasWidth - input.popoverWidth)),
    top: clamp(top, 0, Math.max(0, input.canvasHeight - input.popoverHeight))
  };
}

export function getViewportPopoverPosition(input: ViewportPopoverPositionInput): EditPopoverPosition {
  const gap = 8;
  const preferredLeft = input.cellLeft + input.cellSize + gap;
  const preferredTop = input.cellTop + input.cellSize + gap;
  const fallbackLeft = input.cellLeft - input.popoverWidth - gap;
  const fallbackTop = input.cellTop - input.popoverHeight - gap;
  const left = preferredLeft + input.popoverWidth <= input.viewportWidth ? preferredLeft : fallbackLeft;
  const top = preferredTop + input.popoverHeight <= input.viewportHeight ? preferredTop : fallbackTop;

  return {
    left: clamp(left, gap, Math.max(gap, input.viewportWidth - input.popoverWidth - gap)),
    top: clamp(top, gap, Math.max(gap, input.viewportHeight - input.popoverHeight - gap))
  };
}

function replaceBeadLikeCell(cell: Exclude<PatternCell, { empty: true }>, paletteColor: PaletteColor): BeadCell {
  return {
    ...cell,
    sourceRgb: cell.sourceRgb as Rgb,
    beadCode: paletteColor.code,
    beadName: paletteColor.name,
    beadRgb: paletteColor.rgb,
    distance: 0
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
