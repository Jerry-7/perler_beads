import type { PatternResult } from "./types";

export const PREVIEW_CANVAS_MARGIN_PX = 96;
export const EXPORT_MAX_CANVAS_SIDE_PX = 3000;
export const EXPORT_DEFAULT_CELL_SIZE_PX = 36;
export const EXPORT_MIN_CELL_SIZE_PX = 12;

export interface CanvasSize {
  width: number;
  height: number;
}

export function calculatePreviewCanvasSize(
  result: Pick<PatternResult, "widthCells" | "heightCells">,
  windowWidth: number
): CanvasSize {
  const availableWidth = Math.max(1, windowWidth - PREVIEW_CANVAS_MARGIN_PX);
  const cellSize = availableWidth / result.widthCells;

  return {
    width: Math.max(1, Math.floor(result.widthCells * cellSize)),
    height: Math.max(1, Math.floor(result.heightCells * cellSize))
  };
}

export function calculateZoomedCanvasSize(baseSize: CanvasSize, zoom: number): CanvasSize {
  const normalizedZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    width: Math.max(1, Math.round(baseSize.width * normalizedZoom)),
    height: Math.max(1, Math.round(baseSize.height * normalizedZoom))
  };
}

export function calculateExportCellSize(
  result: Pick<PatternResult, "widthCells" | "heightCells">,
  rulerSize: number,
  statsHeight: number,
  pixelRatio: number
): number {
  const normalizedRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  const availableWidth = EXPORT_MAX_CANVAS_SIDE_PX / normalizedRatio - rulerSize; 
  const availableHeight = EXPORT_MAX_CANVAS_SIDE_PX / normalizedRatio - rulerSize - statsHeight;
  // 分别计算一个格子的宽、高最大值
  const widthLimitedCell = Math.floor(availableWidth / Math.max(1, result.widthCells));
  const heightLimitedCell = Math.floor(availableHeight / Math.max(1, result.heightCells));
  const limitedCellSize = Math.min(EXPORT_DEFAULT_CELL_SIZE_PX, widthLimitedCell, heightLimitedCell);

  return Math.max(EXPORT_MIN_CELL_SIZE_PX, limitedCellSize);
}


