import { DEFAULT_SAMPLING_MODE_INDEX, SAMPLING_MODE_OPTIONS } from "./samplingModeOptions";

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

test("sampling mode options use user friendly labels", () => {
  assertEqual(SAMPLING_MODE_OPTIONS.length, 3, "option count");
  assertEqual(SAMPLING_MODE_OPTIONS[0].label, "标准取色", "nearest label");
  assertEqual(SAMPLING_MODE_OPTIONS[0].value, "nearest", "nearest value");
  assertEqual(SAMPLING_MODE_OPTIONS[1].label, "精细取色", "coverage label");
  assertEqual(SAMPLING_MODE_OPTIONS[1].value, "coverage", "coverage value");
  assertEqual(SAMPLING_MODE_OPTIONS[2].label, "中心取色", "center shrink label");
  assertEqual(SAMPLING_MODE_OPTIONS[2].value, "center-shrink", "center shrink value");
});

test("default sampling mode uses raw source color mapping", () => {
  assertEqual(SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value, "nearest", "default sampling mode");
});
