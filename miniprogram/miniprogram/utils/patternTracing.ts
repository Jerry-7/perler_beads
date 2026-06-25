import type { PatternCell } from "./types";
import { isBeadCell, isEmptyCell } from "./types";

// 封装“从画布坐标到格子索引”所需的全部上下文（画布尺寸、格子数）
export interface PatternPointInput {
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
  widthCells: number;
  heightCells: number;
}

// 表示格子位置（行、列）及唯一键
export interface TraceCellPosition {
  row: number;
  col: number;
  key: string;
}

// 统一鼠标/触摸事件的字段，兼容 detail（自定义事件）和 touches/changedTouches
export interface CanvasPointEvent {
  detail?: {
    x?: number;
    y?: number;
  };
  touches?: Array<{
    // 距离页面可显示区域（屏幕除去导航条）左上角距离，横向为X轴，纵向为Y轴
    x?: number;
    y?: number;
    // 距离文档左上角的距离，文档的左上角为原点 ，横向为X轴，纵向为Y轴
  
    pageX?: number;
    pageY?: number;
    // 相对于浏览器/小程序可视窗口的坐标
    clientX?: number;
    clientY?: number;
  }>;
  changedTouches?: Array<{
    x?: number;
    y?: number;
    pageX?: number;
    pageY?: number;
    clientX?: number;
    clientY?: number;
  }>;
}

export interface CanvasEventPoint {
  x: number;
  y: number;
  coordinateSpace: "canvas" | "viewport";
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getCanvasPointFromEvent(event: CanvasPointEvent): { x: number; y: number } | null {
  return getCanvasEventPoint(event);
}

export function getCanvasEventPoint(event: CanvasPointEvent): CanvasEventPoint | null {
  if (typeof event.detail?.x === "number" && typeof event.detail.y === "number") {
    return {
      x: event.detail.x,
      y: event.detail.y,
      coordinateSpace: "canvas"
    };
  }

  const touch = event.touches?.[0] ?? event.changedTouches?.[0];
  const x = firstNumber(touch?.pageX, touch?.clientX, touch?.x);
  const y = firstNumber(touch?.pageY, touch?.clientY, touch?.y);
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  return {
    x,
    y,
    coordinateSpace: "viewport"
  };
}

function firstNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === "number");
}

export function toCanvasLocalPoint(point: { x: number; y: number }, rect: CanvasRect): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = point.x - rect.left;
  const y = point.y - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) {
    return null;
  }
  return { x, y };
}

export function resolveCanvasLocalPoint(point: CanvasEventPoint, rect: CanvasRect): { x: number; y: number } | null {
  if (point.coordinateSpace === "canvas") {
    const localPoint = point.x >= 0 && point.y >= 0 && point.x < rect.width && point.y < rect.height
      ? { x: point.x, y: point.y }
      : null;
    return localPoint ?? toCanvasLocalPoint(point, rect);
  }

  return toCanvasLocalPoint(point, rect) ?? (
    point.x >= 0 && point.y >= 0 && point.x < rect.width && point.y < rect.height
      ? { x: point.x, y: point.y }
      : null
  );
}

export function getPatternCellFromPoint(input: PatternPointInput): TraceCellPosition | null {
  if (
    input.x < 0 ||
    input.y < 0 ||
    input.x >= input.canvasWidth ||
    input.y >= input.canvasHeight ||
    input.canvasWidth <= 0 ||
    input.canvasHeight <= 0 ||
    input.widthCells <= 0 ||
    input.heightCells <= 0
  ) {
    return null;
  }

  const col = Math.min(input.widthCells - 1, Math.floor((input.x / input.canvasWidth) * input.widthCells));
  const row = Math.min(input.heightCells - 1, Math.floor((input.y / input.canvasHeight) * input.heightCells));
  return { row, col, key: `${row}-${col}` };
}

export function formatTraceCellStatus(cell: PatternCell): string {
  const row = cell.y + 1;
  const col = cell.x + 1;
  if (isEmptyCell(cell)) {
    return `当前格子：空白 (第 ${row} 行，第 ${col} 列)`;
  }
  if (isBeadCell(cell)) {
    return `当前格子：${cell.beadCode} ${cell.beadName} (第 ${row} 行，第 ${col} 列)`;
  }
  const [r, g, b] = cell.sourceRgb;
  return `当前格子：原色 rgb(${r}, ${g}, ${b}) (第 ${row} 行，第 ${col} 列)`;
}
