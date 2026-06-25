import { calculatePreviewCanvasSize, calculateZoomedCanvasSize } from "./canvasSizing";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
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

test("fits the generated preview within the available phone screen width", () => {
  const size = calculatePreviewCanvasSize({ widthCells: 48, heightCells: 48 }, 375);

  assertEqual(size.width, 279, "width");
  assertEqual(size.height, 279, "height");
});

test("preserves the generated pattern aspect ratio", () => {
  const size = calculatePreviewCanvasSize({ widthCells: 80, heightCells: 40 }, 390);

  assertEqual(size.width, 294, "width");
  assertEqual(size.height, 147, "height");
});

test("scales the preview canvas by the selected zoom level", () => {
  const size = calculateZoomedCanvasSize({ width: 279, height: 147 }, 2.5);

  assertEqual(size.width, 698, "width");
  assertEqual(size.height, 368, "height");
});
