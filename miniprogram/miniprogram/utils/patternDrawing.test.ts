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

import { shouldDrawCellLabel } from "./patternDrawing";

test("hides labels in cramped on-screen preview cells", () => {
  assertEqual(shouldDrawCellLabel(4, false), false, "preview labels");
});

test("keeps labels for exported pattern images", () => {
  assertEqual(shouldDrawCellLabel(4, true), true, "export labels");
});
