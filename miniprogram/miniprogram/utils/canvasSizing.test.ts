import { calculatePreviewCanvasSize } from "./canvasSizing";

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

  assertEqual(size.width, 335, "width");
  assertEqual(size.height, 335, "height");
});

test("preserves the generated pattern aspect ratio", () => {
  const size = calculatePreviewCanvasSize({ widthCells: 80, heightCells: 40 }, 390);

  assertEqual(size.width, 350, "width");
  assertEqual(size.height, 175, "height");
});
