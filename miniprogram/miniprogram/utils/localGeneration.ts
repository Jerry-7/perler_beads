/**
 * Local pattern generation orchestrator.
 * Ties together image sampling → color matching → color simplification
 * to produce a PatternResult entirely on the frontend.
 *
 * Usage:
 *   const result = await generatePatternLocally({
 *     imagePath, widthCells, heightCells,
 *     samplingMode, colorComplexity, maxColors,
 *     palette, paletteVersion
 *   });
 */
import type {
  BeadCell,
  BeadUsage,
  PaletteColor,
  PatternCell,
  PatternResult,
  Rgb,
} from "./types";
import {
  findNearestBeadColor,
  PaletteEmptyError,
  precomputePaletteLab,
  type PaletteLabEntry,
} from "./colorMatching";
import {
  limitBeadColors,
  simplifyLowUsageColors,
  type ColorSimplificationProfile,
} from "./colorSimplification";
import {
  isLocalSamplingMode,
  loadImagePixels,
  sampleImage,
  type FrontendSamplingMode,
} from "./imageSampling";
import { recalculateUsage } from "./patternEditing";

// ─── Input type ───────────────────────────────────────────────────────

export interface LocalGenerationInput {
  imagePath: string;
  widthCells: number;
  heightCells: number;
  samplingMode: FrontendSamplingMode;
  colorComplexity: ColorSimplificationProfile;
  maxColors: number;
  palette: PaletteColor[];
  paletteVersion: string;
}

// ─── Main entry point ─────────────────────────────────────────────────

/**
 * Run the full local generation pipeline and return a PatternResult
 * compatible with the existing frontend rendering/editing code.
 */
export async function generatePatternLocally(
  input: LocalGenerationInput,
): Promise<PatternResult> {
  // 1. Validate
  if (!input.palette.length) {
    throw new PaletteEmptyError();
  }
  if (input.widthCells < 1 || input.heightCells < 1) {
    throw new Error("网格尺寸必须大于 0");
  }
  if (!isLocalSamplingMode(input.samplingMode)) {
    throw new Error(`不支持的采样模式: ${input.samplingMode}`);
  }

  // 2. Load image pixels via Canvas
  const image = await loadImagePixels(input.imagePath);

  // 3. Pre-compute palette LAB values (once per generation)
  const paletteLab = precomputePaletteLab(input.palette);

  // 4. Sample image to target grid
  const pixelGrid = sampleImage(
    image,
    input.widthCells,
    input.heightCells,
    input.samplingMode,
  );

  // 5. Color match each cell
  const cells: PatternCell[][] = [];
  for (let y = 0; y < pixelGrid.length; y++) {
    const row: PatternCell[] = [];
    for (let x = 0; x < pixelGrid[y]!.length; x++) {
      const rgb = pixelGrid[y]![x]!;
      const beadCell = matchRgbToBead(rgb, paletteLab, x, y);
      row.push(beadCell);
    }
    cells.push(row);
  }

  // 6. Simplify low-usage similar colors
  let simplified = simplifyLowUsageColors(cells, input.colorComplexity);
  if (!simplified) {
    simplified = cells;
  }

  // 7. Limit to maxColors
  const limited = limitBeadColors(simplified, input.maxColors);

  // 8. Compute usage statistics (reuse existing utility)
  const usage = recalculateUsage(limited);

  // 9. Build result
  return {
    widthCells: input.widthCells,
    heightCells: input.heightCells,
    paletteVersion: input.paletteVersion,
    cells: limited,
    usage,
    generatedAt: new Date().toISOString(),
    rleRows: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function matchRgbToBead(
  rgb: Rgb,
  paletteLab: PaletteLabEntry[],
  x: number,
  y: number,
): BeadCell {
  const { color, distance } = findNearestBeadColor(rgb, paletteLab);
  return {
    x,
    y,
    sourceRgb: rgb,
    beadCode: color.code,
    beadName: color.name,
    beadRgb: color.rgb,
    distance: Math.round(distance * 1000) / 1000,
  };
}
