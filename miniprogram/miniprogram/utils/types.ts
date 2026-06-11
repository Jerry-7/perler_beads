export type Rgb = [number, number, number];

export interface PaletteColor {
  code: string;
  name: string;
  rgb: Rgb;
  enabled: boolean;
}

export interface EmptyCell {
  x: number;
  y: number;
  empty: true;
}

export interface BeadCell {
  x: number;
  y: number;
  sourceRgb: Rgb;
  beadCode: string;
  beadName: string;
  beadRgb: Rgb;
  distance: number;
}

export type PatternCell = EmptyCell | BeadCell;

export interface BeadUsage {
  beadCode: string;
  beadName: string;
  beadRgb: Rgb;
  count: number;
}

export interface PatternResult {
  widthCells: number;
  heightCells: number;
  paletteVersion: string;
  cells: PatternCell[][];
  usage: BeadUsage[];
  generatedAt: string;
}

export interface GenerationStatus {
  generationId: string;
  status: "pending" | "processing" | "completed" | "failed";
  error?: string;
  result?: PatternResult;
}

export function isEmptyCell(cell: PatternCell): cell is EmptyCell {
  return "empty" in cell && cell.empty === true;
}
