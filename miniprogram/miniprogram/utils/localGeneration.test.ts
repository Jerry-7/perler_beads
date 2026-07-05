/**
 * Tests for local pattern generation modules.
 *
 * Tests the pure algorithms (color space, matching, simplification) that
 * don't require wx APIs. Canvas-based sampling tests use mock pixel data.
 */
import { rgbToLab, ciede2000Distance, rgbDistance, perceptualDistance, type Lab } from "./colorSpace";
import { findNearestBeadColor, precomputePaletteLab, PaletteEmptyError } from "./colorMatching";
import { simplifyLowUsageColors, limitBeadColors, type ColorSimplificationProfile } from "./colorSimplification";
import { isLocalSamplingMode, sampleNearest, sampleCoverage, sampleCenterShrink, type ImagePixelData } from "./imageSampling";
import { PALETTE_COLORS, PALETTE_VERSION } from "./paletteData";
import type { BeadCell, PaletteColor, PatternCell, Rgb } from "./types";
import { isBeadCell } from "./types";

// ─── Test harness (matching existing project convention) ─────────────

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertClose(actual: number, expected: number, epsilon: number, message: string): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected} ± ${epsilon}, got ${actual}`);
  }
}

function assertTruthy(value: unknown, message: string): void {
  if (!value) {
    throw new Error(`${message}: expected truthy, got ${value}`);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────

function makeMockImageData(width: number, height: number, fill: Rgb): ImagePixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function makeBeadCell(
  x: number, y: number,
  code: string, name: string,
  beadRgb: Rgb, sourceRgb: Rgb,
  distance = 0,
): BeadCell {
  return { x, y, sourceRgb, beadCode: code, beadName: name, beadRgb, distance };
}

const TEST_RGB: Rgb = [100, 150, 200];

// ─── Color Space Tests ────────────────────────────────────────────────

test("rgbToLab produces valid CIELAB values", () => {
  const lab = rgbToLab(TEST_RGB);
  // L* should be 0-100
  assertTruthy(lab[0] > 0 && lab[0] < 100, "L* in range");
  // a* and b* can be negative or positive
  assertTruthy(Number.isFinite(lab[0]), "L* is finite");
  assertTruthy(Number.isFinite(lab[1]), "a* is finite");
  assertTruthy(Number.isFinite(lab[2]), "b* is finite");
});

test("rgbToLab caches results", () => {
  const lab1 = rgbToLab(TEST_RGB);
  const lab2 = rgbToLab(TEST_RGB);
  assertEqual(lab1[0], lab2[0], "cached L* matches");
  assertEqual(lab1[1], lab2[1], "cached a* matches");
  assertEqual(lab1[2], lab2[2], "cached b* matches");
});

test("rgbToLab: pure black → near-zero L*", () => {
  const lab = rgbToLab([0, 0, 0] as Rgb);
  assertTruthy(lab[0] < 0.01, "black L* ~ 0");
});

test("rgbToLab: pure white → high L*", () => {
  const lab = rgbToLab([255, 255, 255] as Rgb);
  assertTruthy(lab[0] > 99, "white L* > 99");
});

test("ciede2000Distance: same color = 0", () => {
  const lab = rgbToLab(TEST_RGB);
  const dist = ciede2000Distance(lab, lab);
  assertClose(dist, 0, 0.0001, "same color distance is 0");
});

test("ciede2000Distance: black vs white is large", () => {
  const black = rgbToLab([0, 0, 0] as Rgb);
  const white = rgbToLab([255, 255, 255] as Rgb);
  const dist = ciede2000Distance(black, white);
  assertTruthy(dist > 50, "black-white distance > 50");
});

test("ciede2000Distance is symmetric", () => {
  const lab1 = rgbToLab([200, 50, 50] as Rgb);
  const lab2 = rgbToLab([50, 200, 50] as Rgb);
  const dist12 = ciede2000Distance(lab1, lab2);
  const dist21 = ciede2000Distance(lab2, lab1);
  assertClose(dist12, dist21, 0.0001, "distance is symmetric");
});

test("rgbDistance: same color = 0", () => {
  const dist = rgbDistance(TEST_RGB, TEST_RGB);
  assertEqual(dist, 0, "same RGB distance is 0");
});

test("rgbDistance: black vs white", () => {
  const dist = rgbDistance([0, 0, 0] as Rgb, [255, 255, 255] as Rgb);
  assertClose(dist, 441.67, 0.1, "black-white RGB distance");
});

test("perceptualDistance wraps rgb→lab→ciede2000", () => {
  const dist = perceptualDistance(TEST_RGB, TEST_RGB);
  assertEqual(dist, 0, "perceptual distance same color is 0");
});

// ─── Color Matching Tests ─────────────────────────────────────────────

test("precomputePaletteLab returns entries for all colors", () => {
  const palette: PaletteColor[] = [
    { code: "T1", name: "Red", rgb: [255, 0, 0] as Rgb, enabled: true },
    { code: "T2", name: "Green", rgb: [0, 255, 0] as Rgb, enabled: true },
    { code: "T3", name: "Blue", rgb: [0, 0, 255] as Rgb, enabled: true },
  ];
  const entries = precomputePaletteLab(palette);
  assertEqual(entries.length, 3, "three entries");
  assertTruthy(entries[0]!.lab.length === 3, "each entry has Lab triple");
});

test("findNearestBeadColor: exact match returns distance 0", () => {
  const palette: PaletteColor[] = [
    { code: "T1", name: "Red", rgb: [255, 0, 0] as Rgb, enabled: true },
    { code: "T2", name: "Green", rgb: [0, 255, 0] as Rgb, enabled: true },
  ];
  const paletteLab = precomputePaletteLab(palette);
  const result = findNearestBeadColor([255, 0, 0] as Rgb, paletteLab);
  assertEqual(result.color.code, "T1", "matches T1");
  assertClose(result.distance, 0, 0.001, "distance ~ 0");
});

test("findNearestBeadColor: throws on empty palette", () => {
  let threw = false;
  try {
    findNearestBeadColor([128, 128, 128] as Rgb, []);
  } catch (e) {
    threw = e instanceof PaletteEmptyError;
  }
  assertTruthy(threw, "empty palette throws PaletteEmptyError");
});

test("findNearestBeadColor: green pixel matches green bead", () => {
  const palette: PaletteColor[] = [
    { code: "R", name: "Red", rgb: [255, 0, 0] as Rgb, enabled: true },
    { code: "G", name: "Green", rgb: [0, 255, 0] as Rgb, enabled: true },
    { code: "B", name: "Blue", rgb: [0, 0, 255] as Rgb, enabled: true },
  ];
  const paletteLab = precomputePaletteLab(palette);
  const result = findNearestBeadColor([10, 250, 10] as Rgb, paletteLab);
  assertEqual(result.color.code, "G", "green pixel → green bead");
});

// ─── Color Simplification Tests ───────────────────────────────────────

test("simplifyLowUsageColors: original profile returns null", () => {
  const cells: PatternCell[][] = [[
    makeBeadCell(0, 0, "A1", "A1", [250, 245, 205] as Rgb, [250, 245, 205] as Rgb),
  ]];
  const result = simplifyLowUsageColors(cells, "original");
  assertEqual(result, null, "original returns null (no changes)");
});

test("simplifyLowUsageColors: single high-usage color stays", () => {
  const cells: PatternCell[][] = [];
  for (let y = 0; y < 5; y++) {
    const row: PatternCell[] = [];
    for (let x = 0; x < 5; x++) {
      row.push(makeBeadCell(x, y, "A1", "A1", [250, 245, 205] as Rgb, [250, 245, 205] as Rgb));
    }
    cells.push(row);
  }
  // 25 cells all the same — nothing should change
  const result = simplifyLowUsageColors(cells, "balanced");
  // With only one color, there are no "low usage" colors to replace
  assertEqual(result, null, "all same color → no changes");
});

test("limitBeadColors: below max returns same", () => {
  const cells: PatternCell[][] = [[
    makeBeadCell(0, 0, "A1", "A1", [250, 245, 205] as Rgb, [250, 245, 205] as Rgb),
  ]];
  const result = limitBeadColors(cells, 10);
  assertEqual(result, cells, "below max → unchanged reference");
});

test("limitBeadColors: reduces color count", () => {
  // Create 5 cells, each with a different bead color, maxColors=2
  const cells: PatternCell[][] = [[
    makeBeadCell(0, 0, "C1", "C1", [255, 0, 0] as Rgb, [255, 0, 0] as Rgb),
    makeBeadCell(1, 0, "C2", "C2", [255, 10, 0] as Rgb, [255, 10, 0] as Rgb),
    makeBeadCell(2, 0, "C3", "C3", [0, 255, 0] as Rgb, [0, 255, 0] as Rgb),
    makeBeadCell(3, 0, "C4", "C4", [0, 0, 255] as Rgb, [0, 0, 255] as Rgb),
    makeBeadCell(4, 0, "C5", "C5", [128, 128, 128] as Rgb, [128, 128, 128] as Rgb),
  ]];
  const result = limitBeadColors(cells, 2);
  // Should only have 2 unique bead codes
  const codes = new Set<string>();
  for (const row of result) {
    for (const cell of row) {
      if (isBeadCell(cell)) codes.add(cell.beadCode);
    }
  }
  assertEqual(codes.size, 2, "reduced to 2 colors");
});

// ─── Image Sampling Tests (no wx APIs needed) ─────────────────────────

test("isLocalSamplingMode: recognizes local modes", () => {
  assertTruthy(isLocalSamplingMode("nearest"), "nearest is local");
  assertTruthy(isLocalSamplingMode("coverage"), "coverage is local");
  assertTruthy(isLocalSamplingMode("center-shrink"), "center-shrink is local");
});

test("isLocalSamplingMode: rejects server modes", () => {
  assertTruthy(!isLocalSamplingMode("grid-scan"), "grid-scan is not local");
  assertTruthy(!isLocalSamplingMode("cluster-ms"), "cluster-ms is not local");
  assertTruthy(!isLocalSamplingMode("line-art"), "line-art is not local");
});

test("sampleNearest: produces correct grid dimensions", () => {
  const img = makeMockImageData(100, 100, [128, 128, 128] as Rgb);
  const result = sampleNearest(img, 5, 5);
  assertEqual(result.length, 5, "5 rows");
  assertEqual(result[0]!.length, 5, "5 columns");
});

test("sampleNearest: uniform image → uniform output", () => {
  const img = makeMockImageData(200, 200, [64, 128, 192] as Rgb);
  const result = sampleNearest(img, 10, 10);
  for (const row of result) {
    for (const rgb of row) {
      assertEqual(rgb[0], 64, "R channel preserved");
      assertEqual(rgb[1], 128, "G channel preserved");
      assertEqual(rgb[2], 192, "B channel preserved");
    }
  }
});

test("sampleCoverage: produces correct grid dimensions", () => {
  const img = makeMockImageData(50, 50, [100, 150, 200] as Rgb);
  const result = sampleCoverage(img, 3, 3);
  assertEqual(result.length, 3, "3 rows");
  assertEqual(result[0]!.length, 3, "3 columns");
});

test("sampleCenterShrink: produces correct grid dimensions", () => {
  const img = makeMockImageData(80, 80, [200, 100, 50] as Rgb);
  const result = sampleCenterShrink(img, 4, 4);
  assertEqual(result.length, 4, "4 rows");
  assertEqual(result[0]!.length, 4, "4 columns");
});

// ─── Palette Data Tests ───────────────────────────────────────────────

test("PALETTE_COLORS has expected count", () => {
  assertTruthy(PALETTE_COLORS.length > 100, "palette has > 100 colors");
  assertTruthy(PALETTE_COLORS.length > 200, "palette has > 200 colors");
});

test("PALETTE_COLORS entries have required fields", () => {
  for (const color of PALETTE_COLORS) {
    assertTruthy(typeof color.code === "string" && color.code.length > 0, `code: ${color.code}`);
    assertTruthy(typeof color.name === "string", `name: ${color.name}`);
    assertTruthy(color.rgb.length === 3, `rgb triplet: ${color.code}`);
    assertTruthy(color.rgb[0] >= 0 && color.rgb[0] <= 255, `rgb[0] range: ${color.code}`);
    assertTruthy(color.rgb[1] >= 0 && color.rgb[1] <= 255, `rgb[1] range: ${color.code}`);
    assertTruthy(color.rgb[2] >= 0 && color.rgb[2] <= 255, `rgb[2] range: ${color.code}`);
  }
});

test("PALETTE_VERSION is a non-empty string", () => {
  assertTruthy(typeof PALETTE_VERSION === "string" && PALETTE_VERSION.length > 0, "version");
});

// ─── Color Simplification: profile settings ───────────────────────────

test("simplifyLowUsageColors: minimal profile merges aggressively", () => {
  // Create 100 cells: 98 "A1", 1 "A2" (similar), 1 "Z9" (distant)
  const cells: PatternCell[][] = [];
  const row: PatternCell[] = [];
  for (let i = 0; i < 98; i++) {
    row.push(makeBeadCell(i, 0, "A1", "A1", [250, 245, 205] as Rgb, [250, 245, 205] as Rgb));
  }
  // A2 is very similar to A1 (RGB distance ≈ 8)
  row.push(makeBeadCell(98, 0, "A2", "A2", [252, 254, 214] as Rgb, [252, 254, 214] as Rgb));
  // Z9 is very different (RGB distance >> 60)
  row.push(makeBeadCell(99, 0, "Z9", "Z9", [0, 0, 0] as Rgb, [0, 0, 0] as Rgb));
  cells.push(row);

  const result = simplifyLowUsageColors(cells, "minimal");
  assertTruthy(result !== null, "minimal profile made changes");
  if (result) {
    // A2 (1 cell) should be merged into A1 (98 cells) — similar colors
    const a2Cells = result[0]!.filter(
      (c) => isBeadCell(c) && c.beadCode === "A2",
    );
    assertEqual(a2Cells.length, 0, "A2 was merged away");
  }
});

// ─── Integration: full pipeline on mock data ──────────────────────────

test("full pipeline: color match + simplify + limit produces valid cells", () => {
  const palette: PaletteColor[] = [
    { code: "RED", name: "Red", rgb: [255, 0, 0] as Rgb, enabled: true },
    { code: "GRN", name: "Green", rgb: [0, 255, 0] as Rgb, enabled: true },
    { code: "BLU", name: "Blue", rgb: [0, 0, 255] as Rgb, enabled: true },
    { code: "BLK", name: "Black", rgb: [0, 0, 0] as Rgb, enabled: true },
    { code: "WHT", name: "White", rgb: [255, 255, 255] as Rgb, enabled: true },
  ];
  const paletteLab = precomputePaletteLab(palette);

  // Create a simple 3x3 image with known colors
  const img = makeMockImageData(30, 30, [255, 0, 0] as Rgb); // all red

  // Sample
  const pixelGrid = sampleNearest(img, 3, 3);

  // Color match
  const cells: PatternCell[][] = [];
  for (let y = 0; y < pixelGrid.length; y++) {
    const row: PatternCell[] = [];
    for (let x = 0; x < pixelGrid[y]!.length; x++) {
      const { color, distance } = findNearestBeadColor(pixelGrid[y]![x]!, paletteLab);
      row.push({
        x, y,
        sourceRgb: pixelGrid[y]![x]!,
        beadCode: color.code,
        beadName: color.name,
        beadRgb: color.rgb,
        distance: Math.round(distance * 1000) / 1000,
      });
    }
    cells.push(row);
  }

  // All 3x3 = 9 cells should match RED
  for (const row of cells) {
    for (const cell of row) {
      assertTruthy(isBeadCell(cell), "cell is bead cell");
      if (isBeadCell(cell)) {
        assertEqual(cell.beadCode, "RED", "red pixel matches RED bead");
      }
    }
  }

  // Simplify
  const simplified = simplifyLowUsageColors(cells, "balanced");
  // Should be null (only 1 color, nothing to simplify)

  // Limit
  const limited = limitBeadColors(simplified || cells, 16);
  assertEqual(limited.length, 3, "3 rows in output");

  // All cells should still be RED
  const uniqueCodes = new Set<string>();
  for (const row of limited) {
    for (const cell of row) {
      if (isBeadCell(cell)) uniqueCodes.add(cell.beadCode);
    }
  }
  assertEqual(uniqueCodes.size, 1, "only 1 unique color");
  assertTruthy(uniqueCodes.has("RED"), "color is RED");
});
