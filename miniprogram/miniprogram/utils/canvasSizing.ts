import type { PatternResult } from "./types";

export const PREVIEW_CANVAS_MARGIN_PX = 40;

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
