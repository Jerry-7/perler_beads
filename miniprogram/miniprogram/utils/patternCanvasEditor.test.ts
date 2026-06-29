import {
  applyEditorPatch,
  createEditorPatchHistory,
  floodFillPattern,
  getEditorTouchDistance,
  getCellFromEditorTouchPoint,
  getCellFromEditorPoint,
  pushEditorPatchHistory,
  resolveEditorTouchPoint,
  redoEditorPatchHistory,
  undoEditorPatchHistory
} from "./patternCanvasEditor";
import type { PatternResult } from "./types";

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



test("converts canvas-local touch coordinates into viewport coordinates", () => {
  const point = resolveEditorTouchPoint({
    touch: { x: 104, y: 82 },
    viewportLeft: 10,
    viewportTop: 20
  });

  assertEqual(point.x, 114, "viewport x");
  assertEqual(point.y, 102, "viewport y");
});



test("keeps client touch coordinates unchanged as viewport coordinates", () => {
  const point = resolveEditorTouchPoint({
    touch: { clientX: 114, clientY: 102 },
    viewportLeft: 10,
    viewportTop: 20
  });

  assertEqual(point.x, 114, "viewport x");
  assertEqual(point.y, 102, "viewport y");
});

test("keeps viewport touch coordinates unchanged", () => {
  const point = resolveEditorTouchPoint({
    touch: { pageX: 114, pageY: 102, x: 104, y: 82 },
    viewportLeft: 10,
    viewportTop: 20
  });

  assertEqual(point.x, 114, "viewport x");
  assertEqual(point.y, 102, "viewport y");
});

test("calculates editor touch distance from viewport touch coordinates", () => {
  const distance = getEditorTouchDistance({
    touches: [
      { pageX: 100, pageY: 120 },
      { pageX: 130, pageY: 160 }
    ],
    viewportLeft: 10,
    viewportTop: 20
  });

  assertEqual(distance, 50, "page coordinate distance");
});
test("maps viewport point through editor pan and zoom to a pattern cell", () => {
  const cell = getCellFromEditorPoint({
    x: 190,
    y: 112,
    viewportLeft: 10,
    viewportTop: 20,
    rulerSize: 24,
    translateX: 30,
    translateY: 10,
    scale: 2,
    baseCellSize: 12,
    widthCells: 10,
    heightCells: 8
  });

  assert(cell !== null, "cell should be inside pattern");
  assertEqual(cell?.row, 2, "row");
  assertEqual(cell?.col, 5, "col");
});

test("rejects points outside the zoomed pattern area", () => {
  const cell = getCellFromEditorPoint({
    x: 12,
    y: 24,
    viewportLeft: 10,
    viewportTop: 20,
    rulerSize: 24,
    translateX: 0,
    translateY: 0,
    scale: 1,
    baseCellSize: 12,
    widthCells: 10,
    heightCells: 8
  });

  assertEqual(cell, null, "outside ruler area should not map to a cell");
});

test("flood fill returns every connected same-color cell", () => {
  const cells = [
    ["A", "A", "B"],
    ["A", "B", "B"],
    ["C", "B", "A"]
  ];
  const filled = floodFillPattern(cells, 0, 0);

  assertEqual(filled.length, 3, "connected A area");
  assert(filled.some((cell) => cell.row === 1 && cell.col === 0), "includes lower connected cell");
  assert(!filled.some((cell) => cell.row === 2 && cell.col === 2), "excludes diagonal disconnected cell");
});

test("maps editor touch using target-local coordinates when viewport coordinates miss", () => {
  const cell = getCellFromEditorTouchPoint({
    touch: { pageX: 900, pageY: 900, x: 84, y: 72 },
    viewportLeft: 40,
    viewportTop: 300,
    rulerSize: 24,
    translateX: 0,
    translateY: 0,
    scale: 1,
    baseCellSize: 12,
    widthCells: 10,
    heightCells: 10
  });

  assert(cell !== null, "local touch coordinates should still hit the pattern");
  assertEqual(cell?.row, 4, "row from local y");
  assertEqual(cell?.col, 5, "col from local x");
});

function makePatchPattern(): PatternResult {
  return {
    widthCells: 2,
    heightCells: 1,
    paletteVersion: "test",
    generatedAt: "2026-01-01T00:00:00Z",
    usage: [{ beadCode: "S01", beadName: "Black", beadRgb: [0, 0, 0], count: 2 }],
    cells: [
      [
        { x: 0, y: 0, sourceRgb: [5, 5, 5], beadCode: "S01", beadName: "Black", beadRgb: [0, 0, 0], distance: 1 },
        { x: 1, y: 0, sourceRgb: [10, 10, 10], beadCode: "S01", beadName: "Black", beadRgb: [0, 0, 0], distance: 1 }
      ]
    ]
  };
}

test("editor patch history keeps a 10 operation limit and clears redo on new patch", () => {
  let history = createEditorPatchHistory();
  const pattern = makePatchPattern();
  for (let index = 0; index < 12; index += 1) {
    history = pushEditorPatchHistory(history, {
      type: "paint",
      label: `paint ${index}`,
      selectedKey: "0-0",
      changes: [{ row: 0, col: 0, beforeCell: pattern.cells[0][0], afterCell: pattern.cells[0][1] }]
    });
  }

  assertEqual(history.past.length, 10, "patch history limit");
  const undone = undoEditorPatchHistory(history);
  assert(undone.patch !== null, "undo should return a patch");
  assertEqual(undone.history.future.length, 1, "redo stack after undo");
  const next = pushEditorPatchHistory(undone.history, {
    type: "paint",
    label: "new paint",
    selectedKey: "0-1",
    changes: [{ row: 0, col: 1, beforeCell: pattern.cells[0][1], afterCell: pattern.cells[0][0] }]
  });
  assertEqual(next.future.length, 0, "new patch clears redo");
});

test("editor patch undo and redo restore only changed cells", () => {
  const pattern = makePatchPattern();
  const patch = {
    type: "stroke" as const,
    label: "stroke",
    selectedKey: "0-1",
    changes: [
      {
        row: 0,
        col: 1,
        beforeCell: pattern.cells[0][1],
        afterCell: { ...pattern.cells[0][1], beadCode: "S02", beadName: "White", beadRgb: [255, 255, 255] as [number, number, number], distance: 0 }
      }
    ]
  };

  const redone = applyEditorPatch(pattern, patch, "redo");
  assertEqual(redone.cells[0][0], pattern.cells[0][0], "unchanged cell reference");
  assertEqual("beadCode" in redone.cells[0][1] ? redone.cells[0][1].beadCode : "", "S02", "redo bead");

  const undone = applyEditorPatch(redone, patch, "undo");
  assertEqual("beadCode" in undone.cells[0][1] ? undone.cells[0][1].beadCode : "", "S01", "undo bead");
});
