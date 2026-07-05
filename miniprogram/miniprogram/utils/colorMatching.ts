/**
 * Color matching utilities — find the nearest bead palette color for a given RGB.
 * Ported from server/app/color_matching.py.
 */
import type { PaletteColor, Rgb } from "./types";
import { ciede2000Distance, rgbToLab, type Lab } from "./colorSpace";

/** Pre-computed palette entry with cached LAB value. */
export interface PaletteLabEntry {
  color: PaletteColor;
  lab: Lab;
}

/** Error thrown when palette is empty. */
export class PaletteEmptyError extends Error {
  constructor() {
    super("At least one enabled palette color is required");
    this.name = "PaletteEmptyError";
  }
}

/**
 * Pre-compute CIELAB values for all palette colors.
 * Call once per palette; reuse across all pixel matches.
 */
export function precomputePaletteLab(
  palette: PaletteColor[],
): PaletteLabEntry[] {
  return palette.map((color) => ({
    color,
    lab: rgbToLab(color.rgb),
  }));
}

/**
 * Find the closest palette color using a two-pass strategy:
 * 1. Fast squared RGB distance to find top-N candidates (default 8)
 * 2. Full CIEDE2000 only on those candidates
 *
 * This gives ~25x speedup vs. CIEDE2000 on all 200 palette colors.
 */
export function findNearestBeadColor(
  rgb: Rgb,
  paletteLab: PaletteLabEntry[],
  rgbFilterSize = 8,
): { color: PaletteColor; distance: number } {
  if (!paletteLab.length) {
    throw new PaletteEmptyError();
  }

  const sourceLab = rgbToLab(rgb);

  // If palette is small enough, skip pre-filter
  if (paletteLab.length <= rgbFilterSize) {
    let best = paletteLab[0]!;
    let bestDist = ciede2000Distance(sourceLab, best.lab);
    for (let i = 1; i < paletteLab.length; i++) {
      const dist = ciede2000Distance(sourceLab, paletteLab[i]!.lab);
      if (dist < bestDist) {
        bestDist = dist;
        best = paletteLab[i]!;
      }
    }
    return { color: best.color, distance: bestDist };
  }

  // Pass 1: Fast squared RGB distance to find candidates
  const withRgbDist = paletteLab.map((entry) => ({
    entry,
    rgbDistSq:
      (rgb[0] - entry.color.rgb[0]) ** 2 +
      (rgb[1] - entry.color.rgb[1]) ** 2 +
      (rgb[2] - entry.color.rgb[2]) ** 2,
  }));
  withRgbDist.sort((a, b) => a.rgbDistSq - b.rgbDistSq);
  const candidates = withRgbDist.slice(0, rgbFilterSize);

  // Pass 2: Full CIEDE2000 on top candidates
  let best = candidates[0]!;
  let bestDist = ciede2000Distance(sourceLab, best.entry.lab);
  for (let i = 1; i < candidates.length; i++) {
    const dist = ciede2000Distance(sourceLab, candidates[i]!.entry.lab);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidates[i]!;
    }
  }

  return {
    color: best.entry.color,
    distance: bestDist,
  };
}
