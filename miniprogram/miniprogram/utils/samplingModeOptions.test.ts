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
  assertEqual(SAMPLING_MODE_OPTIONS.length, 5, "option count");
  assertEqual(SAMPLING_MODE_OPTIONS[0].label, "原始映射", "raw label");
  assertEqual(SAMPLING_MODE_OPTIONS[0].value, "nearest", "raw value");
  assertEqual(SAMPLING_MODE_OPTIONS[1].label, "中心净化", "center shrink label");
  assertEqual(SAMPLING_MODE_OPTIONS[1].value, "center-shrink", "center shrink value");
  assertEqual(SAMPLING_MODE_OPTIONS[2].label, "清晰保边", "edge label");
  assertEqual(SAMPLING_MODE_OPTIONS[2].value, "dominant", "edge value");
  assertEqual(SAMPLING_MODE_OPTIONS[3].label, "细节优先", "detail label");
  assertEqual(SAMPLING_MODE_OPTIONS[3].value, "detail", "detail value");
  assertEqual(SAMPLING_MODE_OPTIONS[4].label, "平滑简化", "smooth label");
  assertEqual(SAMPLING_MODE_OPTIONS[4].value, "smooth", "smooth value");
});

test("default sampling mode uses raw source color mapping", () => {
  assertEqual(SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value, "nearest", "default sampling mode");
});
