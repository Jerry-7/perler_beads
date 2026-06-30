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
  assertEqual(SAMPLING_MODE_OPTIONS.length, 7, "option count");
  assertEqual(SAMPLING_MODE_OPTIONS[0].label, "标准取色", "nearest label");
  assertEqual(SAMPLING_MODE_OPTIONS[0].value, "nearest", "nearest value");
  assertEqual(SAMPLING_MODE_OPTIONS[1].label, "精细取色", "coverage label");
  assertEqual(SAMPLING_MODE_OPTIONS[1].value, "coverage", "coverage value");
  assertEqual(SAMPLING_MODE_OPTIONS[2].label, "实物扫描", "grid scan label");
  assertEqual(SAMPLING_MODE_OPTIONS[2].value, "grid-scan", "grid scan value");
  assertEqual(SAMPLING_MODE_OPTIONS[3].label, "中心取色", "center shrink label");
  assertEqual(SAMPLING_MODE_OPTIONS[3].value, "center-shrink", "center shrink value");
  assertEqual(SAMPLING_MODE_OPTIONS[4].label, "线稿提取", "line art label");
  assertEqual(SAMPLING_MODE_OPTIONS[4].value, "line-art", "line art value");
  assertEqual(SAMPLING_MODE_OPTIONS[5].label, "智能并色", "cluster ms label");
  assertEqual(SAMPLING_MODE_OPTIONS[5].value, "cluster-ms", "cluster ms value");
  assertEqual(SAMPLING_MODE_OPTIONS[6].label, "密度并色", "cluster dbscan label");
  assertEqual(SAMPLING_MODE_OPTIONS[6].value, "cluster-dbscan", "cluster dbscan value");
});

test("default sampling mode uses raw source color mapping", () => {
  assertEqual(SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value, "nearest", "default sampling mode");
});
