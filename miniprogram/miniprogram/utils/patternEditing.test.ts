import {
  filterPaletteColors,
  getEditPopoverPosition,
  getViewportPopoverPosition,
  recalculateUsage,
  replacePatternCellColor,
  replacePatternCellsColor
} from "./patternEditing";
import type { BeadUsage, PaletteColor, PatternResult } from "./types";
import { isBeadCell, isEmptyCell } from "./types";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
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

const black: PaletteColor = { code: "S01", name: "Black", rgb: [0, 0, 0], enabled: true };
const white: PaletteColor = { code: "S02", name: "White", rgb: [255, 255, 255], enabled: true };
const red: PaletteColor = { code: "S03", name: "Red", rgb: [255, 0, 0], enabled: true };

function makePattern(): PatternResult {
  return {
    widthCells: 2,
    heightCells: 2,
    paletteVersion: "test",
    generatedAt: "2026-01-01T00:00:00Z",
    usage: [
      { beadCode: "S01", beadName: "Black", beadRgb: [0, 0, 0], count: 2 },
      { beadCode: "S02", beadName: "White", beadRgb: [255, 255, 255], count: 1 }
    ],
    cells: [
      [
        {
          x: 0,
          y: 0,
          sourceRgb: [5, 5, 5],
          beadCode: "S01",
          beadName: "Black",
          beadRgb: [0, 0, 0],
          distance: 1.2
        },
        {
          x: 1,
          y: 0,
          sourceRgb: [250, 250, 250],
          beadCode: "S02",
          beadName: "White",
          beadRgb: [255, 255, 255],
          distance: 0.8
        }
      ],
      [
        {
          x: 0,
          y: 1,
          sourceRgb: [10, 10, 10],
          beadCode: "S01",
          beadName: "Black",
          beadRgb: [0, 0, 0],
          distance: 0.4
        },
        { x: 1, y: 1, empty: true }
      ]
    ]
  };
}

test("replacePatternCellColor updates a single bead cell and recalculates usage", () => {
  const result = replacePatternCellColor(makePattern(), 0, 0, red);
  const cell = result.cells[0][0];

  if (!isBeadCell(cell)) {
    throw new Error("replaced cell should remain a bead cell");
  }
  assertEqual(cell.beadCode, "S03", "bead code");
  assertEqual(cell.beadName, "Red", "bead name");
  assertEqual(cell.beadRgb[0], 255, "red channel");
  assertEqual(cell.distance, 0, "manual replacement distance");
  assertEqual(result.usage.length, 3, "usage count");
  assertEqual(result.usage.find((item: BeadUsage) => item.beadCode === "S01")?.count, 1, "black count");
  assertEqual(result.usage.find((item: BeadUsage) => item.beadCode === "S03")?.count, 1, "red count");
});



test("replacePatternCellColor converts a raw color cell into a bead cell", () => {
  const original = makePattern();
  original.cells[1][1] = { x: 1, y: 1, sourceRgb: [120, 80, 40] };

  const result = replacePatternCellColor(original, 1, 1, red);
  const cell = result.cells[1][1];

  if (!isBeadCell(cell)) {
    throw new Error("raw color cell should become an editable bead cell");
  }
  assertEqual(cell.beadCode, "S03", "bead code");
  assertEqual(cell.beadName, "Red", "bead name");
  assertEqual(cell.sourceRgb[0], 120, "source color should be preserved");
  assertEqual(result.usage.find((item: BeadUsage) => item.beadCode === "S03")?.count, 1, "red count");
});

test("replacePatternCellsColor updates multiple cells and recalculates usage once", () => {
  const result = replacePatternCellsColor(makePattern(), [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
    { row: 1, col: 1 }
  ], red);

  assertEqual(result.usage.find((item: BeadUsage) => item.beadCode === "S03")?.count, 2, "red count");
  assertEqual(result.usage.find((item: BeadUsage) => item.beadCode === "S01")?.count, 1, "black count");
  assert(isEmptyCell(result.cells[1][1]), "empty cells should stay empty");
});
test("replacePatternCellColor ignores empty cells", () => {
  const original = makePattern();
  const result = replacePatternCellColor(original, 1, 1, red);

  assertEqual(result, original, "empty cell should not be replaced");
});

test("recalculateUsage removes colors with zero cells", () => {
  const result = replacePatternCellColor(makePattern(), 0, 1, black);
  const usage = recalculateUsage(result.cells);

  assertEqual(usage.length, 1, "only black should remain");
  assertEqual(usage[0].beadCode, "S01", "remaining code");
  assertEqual(usage[0].count, 3, "remaining count");
});

test("filterPaletteColors matches bead code and bead name", () => {
  const colors = [black, white, red];

  assertEqual(filterPaletteColors(colors, "s02")[0].code, "S02", "code search");
  assertEqual(filterPaletteColors(colors, "red")[0].code, "S03", "name search");
  assertEqual(filterPaletteColors(colors, "").length, 0, "empty query");
});

test("getEditPopoverPosition keeps popover inside canvas bounds", () => {
  const position = getEditPopoverPosition({
    cellX: 300,
    cellY: 300,
    cellSize: 20,
    canvasWidth: 320,
    canvasHeight: 320,
    popoverWidth: 180,
    popoverHeight: 160
  });

  assert(position.left <= 140, "left should fit within canvas");
  assert(position.top <= 160, "top should fit within canvas");
  assert(position.left >= 0, "left should not be negative");
  assert(position.top >= 0, "top should not be negative");
});

test("getViewportPopoverPosition places the popover beside the selected cell", () => {
  const position = getViewportPopoverPosition({
    cellLeft: 120,
    cellTop: 160,
    cellSize: 20,
    viewportWidth: 420,
    viewportHeight: 640,
    popoverWidth: 220,
    popoverHeight: 260
  });

  assertEqual(position.left, 148, "left");
  assertEqual(position.top, 188, "top");
});

test("getViewportPopoverPosition keeps the popover visible near screen edges", () => {
  const position = getViewportPopoverPosition({
    cellLeft: 320,
    cellTop: 560,
    cellSize: 20,
    viewportWidth: 360,
    viewportHeight: 640,
    popoverWidth: 220,
    popoverHeight: 260
  });

  assertEqual(position.left, 92, "left");
  assertEqual(position.top, 292, "top");
});

test("replacePatternCellColor only copies the changed row", () => {
  const original = makePattern();
  const result = replacePatternCellColor(original, 0, 0, red);

  assert(result.cells !== original.cells, "outer cells array should be copied");
  assert(result.cells[0] !== original.cells[0], "changed row should be copied");
  assert(result.cells[1] === original.cells[1], "unchanged row should keep its reference");
});
