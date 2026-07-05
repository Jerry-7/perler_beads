/**
 * Color simplification — merge low-usage colors and limit total color count.
 * Ported from server/app/services/color_simplification.py and server/app/services/generation.py.
 */
import type { BeadCell, PatternCell } from "./types";
import { isBeadCell } from "./types";
import { rgbDistance } from "./colorSpace";

// ─── Types ────────────────────────────────────────────────────────────

export type ColorSimplificationProfile =
  | "minimal"
  | "simple"
  | "balanced"
  | "detailed"
  | "original";

interface SimplificationSettings {
  minLowUsageCells: number;
  lowUsageRatio: number;
  similarColorDistance: number;
}

// ─── Profile settings (matches Python PROFILE_SETTINGS) ──────────────

const PROFILE_SETTINGS: Record<string, SimplificationSettings> = {
  minimal: {
    minLowUsageCells: 10,
    lowUsageRatio: 0.035,
    similarColorDistance: 60,
  },
  simple: {
    minLowUsageCells: 6,
    lowUsageRatio: 0.02,
    similarColorDistance: 45,
  },
  balanced: {
    minLowUsageCells: 3,
    lowUsageRatio: 0.01,
    similarColorDistance: 35,
  },
  detailed: {
    minLowUsageCells: 2,
    lowUsageRatio: 0.005,
    similarColorDistance: 25,
  },
};

// ─── Color simplification ─────────────────────────────────────────────

/**
 * Merge low-usage bead colors that are visually similar to more common ones.
 * Returns a new cells array (does not mutate input).
 * Returns null if no changes were made (profile === "original" or no replacements).
 */
export function simplifyLowUsageColors(
  cells: PatternCell[][],
  profile: ColorSimplificationProfile,
): PatternCell[][] | null {
  if (profile === "original") return null;

  const settings = PROFILE_SETTINGS[profile];
  if (!settings) return null;

  // Count bead frequencies
  const beadCounts = new Map<string, number>();
  const beadCells = new Map<string, BeadCell>();

  for (const row of cells) {
    for (const cell of row) {
      if (isBeadCell(cell)) {
        beadCounts.set(cell.beadCode, (beadCounts.get(cell.beadCode) || 0) + 1);
        if (!beadCells.has(cell.beadCode)) {
          beadCells.set(cell.beadCode, cell);
        }
      }
    }
  }

  const totalBeadCells = [...beadCounts.values()].reduce((a, b) => a + b, 0);
  if (totalBeadCells === 0) return null;

  // Compute low-usage threshold
  const lowUsageLimit = Math.max(
    settings.minLowUsageCells,
    Math.ceil(totalBeadCells * settings.lowUsageRatio),
  );

  // Build replacement map: low-usage code → higher-usage similar color
  const replacements = buildReplacements(
    beadCounts,
    beadCells,
    lowUsageLimit,
    settings.similarColorDistance,
  );

  if (!replacements.size) return null;

  // Apply replacements
  return cells.map((row) =>
    row.map((cell) => {
      if (!isBeadCell(cell)) return cell;
      const replacement = replacements.get(cell.beadCode);
      if (!replacement) return cell;
      return replaceCellColor(cell, replacement);
    }),
  );
}

function buildReplacements(
  beadCounts: Map<string, number>,
  beadCells: Map<string, BeadCell>,
  lowUsageLimit: number,
  similarColorDistance: number,
): Map<string, BeadCell> {
  const replacements = new Map<string, BeadCell>();

  for (const [code, count] of beadCounts) {
    if (count >= lowUsageLimit) continue;

    const source = beadCells.get(code)!;

    // Find candidate colors: higher count + similar RGB
    let bestCandidate: BeadCell | null = null;
    let bestCount = 0;

    for (const [targetCode, targetCount] of beadCounts) {
      if (targetCount <= count) continue;
      const target = beadCells.get(targetCode)!;
      if (rgbDistance(source.beadRgb, target.beadRgb) <= similarColorDistance) {
        if (targetCount > bestCount) {
          bestCount = targetCount;
          bestCandidate = target;
        }
      }
    }

    if (bestCandidate) {
      replacements.set(code, bestCandidate);
    }
  }

  return replacements;
}

function replaceCellColor(cell: BeadCell, target: BeadCell): BeadCell {
  return {
    x: cell.x,
    y: cell.y,
    sourceRgb: cell.sourceRgb,
    beadCode: target.beadCode,
    beadName: target.beadName,
    beadRgb: target.beadRgb,
    distance: Math.round(rgbDistance(cell.sourceRgb, target.beadRgb) * 1000) / 1000,
  };
}

// ─── Color limiting ───────────────────────────────────────────────────

/**
 * Limit the number of distinct bead colors to maxColors.
 * Keeps the most frequent; remaps excluded colors to the nearest kept color
 * using simple RGB distance (matching Python implementation).
 */
export function limitBeadColors(
  cells: PatternCell[][],
  maxColors: number,
): PatternCell[][] {
  // Count frequencies
  const beadCounts = new Map<string, number>();
  const beadCells = new Map<string, BeadCell>();

  for (const row of cells) {
    for (const cell of row) {
      if (isBeadCell(cell)) {
        beadCounts.set(cell.beadCode, (beadCounts.get(cell.beadCode) || 0) + 1);
        if (!beadCells.has(cell.beadCode)) {
          beadCells.set(cell.beadCode, cell);
        }
      }
    }
  }

  if (beadCounts.size <= maxColors) return cells;

  // Keep top maxColors by frequency
  const sorted = [...beadCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const keptCodes = new Set(sorted.slice(0, maxColors).map((e) => e[0]));
  const keptCells = [...keptCodes].map((code) => beadCells.get(code)!);

  // Remap excluded cells
  return cells.map((row) =>
    row.map((cell) => {
      if (!isBeadCell(cell) || keptCodes.has(cell.beadCode)) return cell;
      return replaceWithNearestKeptColor(cell, keptCells);
    }),
  );
}

function replaceWithNearestKeptColor(
  cell: BeadCell,
  keptCells: BeadCell[],
): BeadCell {
  let best = keptCells[0]!;
  let bestDist = rgbDistance(cell.beadRgb, best.beadRgb);
  for (let i = 1; i < keptCells.length; i++) {
    const dist = rgbDistance(cell.beadRgb, keptCells[i]!.beadRgb);
    if (dist < bestDist) {
      bestDist = dist;
      best = keptCells[i]!;
    }
  }
  return {
    x: cell.x,
    y: cell.y,
    sourceRgb: cell.sourceRgb,
    beadCode: best.beadCode,
    beadName: best.beadName,
    beadRgb: best.beadRgb,
    distance: Math.round(rgbDistance(cell.sourceRgb, best.beadRgb) * 1000) / 1000,
  };
}
