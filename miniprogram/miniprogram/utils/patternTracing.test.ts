declare const require: any;

const {
  getCanvasPointFromEvent,
  formatTraceCellStatus,
  getPatternCellFromPoint,
  resolveCanvasLocalPoint,
  toCanvasLocalPoint
} = require("./patternTracing") as typeof import("./patternTracing");

function assertEqual<T>(actual: T, expected: T, message: string): void {
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

test("maps canvas point to zero-based pattern cell", () => {
  const cell = getPatternCellFromPoint({
    x: 75,
    y: 115,
    canvasWidth: 320,
    canvasHeight: 320,
    widthCells: 16,
    heightCells: 16
  });

  assert(cell !== null, "point should be inside pattern");
  assertEqual(cell?.col, 3, "column");
  assertEqual(cell?.row, 5, "row");
  assertEqual(cell?.key, "5-3", "cell key");
});

test("ignores points outside the canvas", () => {
  const cell = getPatternCellFromPoint({
    x: 321,
    y: 12,
    canvasWidth: 320,
    canvasHeight: 320,
    widthCells: 16,
    heightCells: 16
  });

  assertEqual(cell, null, "outside point");
});

test("formats bead trace status with one-based row and column", () => {
  const status = formatTraceCellStatus({
    x: 7,
    y: 11,
    sourceRgb: [0, 0, 0],
    beadCode: "S01",
    beadName: "纯黑",
    beadRgb: [0, 0, 0],
    distance: 0
  });

  assertEqual(status, "当前格子：S01 纯黑 (第 12 行，第 8 列)", "status text");
});

test("reads canvas coordinates from changed touches after pointer release", () => {
  const point = getCanvasPointFromEvent({
    changedTouches: [{ x: 42, y: 84 }]
  });

  assert(point !== null, "changed touch should produce a point");
  assertEqual(point?.x, 42, "x");
  assertEqual(point?.y, 84, "y");
});

test("reads viewport coordinates from page touch fields", () => {
  const point = getCanvasPointFromEvent({
    changedTouches: [{ pageX: 142, pageY: 284 }]
  });

  assert(point !== null, "page touch should produce a point");
  assertEqual(point?.x, 142, "x");
  assertEqual(point?.y, 284, "y");
});

test("prefers page coordinates over touch x y when both are present", () => {
  const point = getCanvasPointFromEvent({
    changedTouches: [{ x: 12, y: 18, pageX: 142, pageY: 284 }]
  });

  assert(point !== null, "mixed touch should produce a point");
  assertEqual(point?.x, 142, "x");
  assertEqual(point?.y, 284, "y");
});

test("converts viewport touch coordinates to canvas local coordinates", () => {
  const point = toCanvasLocalPoint(
    { x: 150, y: 220 },
    { left: 100, top: 200, width: 320, height: 320 }
  );

  assert(point !== null, "point should be inside canvas rect");
  assertEqual(point?.x, 50, "local x");
  assertEqual(point?.y, 20, "local y");
});

test("rejects viewport points outside the canvas rect", () => {
  const point = toCanvasLocalPoint(
    { x: 90, y: 220 },
    { left: 100, top: 200, width: 320, height: 320 }
  );

  assertEqual(point, null, "outside local point");
});

test("uses canvas-local event coordinates when they are already inside the canvas", () => {
  const point = resolveCanvasLocalPoint(
    { x: 50, y: 20, coordinateSpace: "canvas" },
    { left: 100, top: 200, width: 320, height: 320 }
  );

  assert(point !== null, "point should resolve");
  assertEqual(point?.x, 50, "local x");
  assertEqual(point?.y, 20, "local y");
});

test("falls back to viewport coordinates when canvas-labeled event coordinates are outside the canvas", () => {
  const point = resolveCanvasLocalPoint(
    { x: 450, y: 520, coordinateSpace: "canvas" },
    { left: 400, top: 500, width: 320, height: 320 }
  );

  assert(point !== null, "point should resolve through fallback");
  assertEqual(point?.x, 50, "local x");
  assertEqual(point?.y, 20, "local y");
});
