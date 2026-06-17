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

export interface RawColorCell {
  x: number;
  y: number;
  sourceRgb: Rgb;
}

export type PatternCell = EmptyCell | BeadCell | RawColorCell;

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

export interface AiImageStatus {
  aiImageId: string;
  status: "pending" | "processing" | "completed" | "failed";
  imageUrl?: string | null;
  error?: string | null;
}

export interface PatternSizeRecommendation {
  widthCells: number;
  heightCells: number;
  sourceWidth: number;
  sourceHeight: number;
  detectedBlockWidth?: number | null;
  detectedBlockHeight?: number | null;
  confidence: number;
  reason: string;
}

export interface PatternDebugAnalysis {
  sourceWidth: number;
  sourceHeight: number;
  detectedBlockWidth?: number | null;
  detectedBlockHeight?: number | null;
  detectedGridWidth: number;
  detectedGridHeight: number;
  detectedPixelCount: number;
  compressedGridWidth: number;
  compressedGridHeight: number;
  compressedPixelCount: number;
  originalPreviewDataUrl: string;
  compressedPreviewDataUrl: string;
}

export function isEmptyCell(cell: PatternCell): cell is EmptyCell {
  return "empty" in cell && cell.empty === true;
}

export function isBeadCell(cell: PatternCell): cell is BeadCell {
  return "beadRgb" in cell;
}
