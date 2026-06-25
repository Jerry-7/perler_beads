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
  assertEqual(SAMPLING_MODE_OPTIONS[1].label, "比例映射", "coverage label");
  assertEqual(SAMPLING_MODE_OPTIONS[1].value, "coverage", "coverage value");
  assertEqual(SAMPLING_MODE_OPTIONS[2].label, "半成品识别", "grid scan label");
  assertEqual(SAMPLING_MODE_OPTIONS[2].value, "grid-scan", "grid scan value");
  assertEqual(SAMPLING_MODE_OPTIONS[3].label, "中心特征提取", "center shrink label");
  assertEqual(SAMPLING_MODE_OPTIONS[3].value, "center-shrink", "center shrink value");
  assertEqual(SAMPLING_MODE_OPTIONS[4].label, "彩色简笔", "colored sketch label");
  assertEqual(SAMPLING_MODE_OPTIONS[4].value, "line-art", "colored sketch value");
});

test("default sampling mode uses raw source color mapping", () => {
  assertEqual(SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value, "nearest", "default sampling mode");
});
