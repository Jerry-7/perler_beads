import { applyPatternSizeOption, PATTERN_SIZE_OPTIONS } from "./patternSizeOptions";

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

test("default preset is 52 by 52", () => {
  const option = PATTERN_SIZE_OPTIONS[0];

  assertEqual(option.label, "52 x 52", "label");
  assertEqual(option.widthCells, 52, "width");
  assertEqual(option.heightCells, 52, "height");
});

test("preset size fills width and height", () => {
  const state = applyPatternSizeOption(1, 52, 52);

  assertEqual(state.widthCells, 78, "width");
  assertEqual(state.heightCells, 78, "height");
  assertEqual(state.isCustomSize, false, "custom flag");
});

test("custom size preserves existing width and height", () => {
  const state = applyPatternSizeOption(3, 64, 80);

  assertEqual(state.widthCells, 64, "width");
  assertEqual(state.heightCells, 80, "height");
  assertEqual(state.isCustomSize, true, "custom flag");
});
