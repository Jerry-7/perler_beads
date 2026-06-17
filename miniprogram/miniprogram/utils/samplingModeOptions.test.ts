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
  assertEqual(SAMPLING_MODE_OPTIONS.length, 1, "option count");
  assertEqual(SAMPLING_MODE_OPTIONS[0].label, "干净锐利", "combined label");
  assertEqual(SAMPLING_MODE_OPTIONS[0].value, "smooth", "combined value");
});

test("default sampling mode uses the combined clean sharp mode", () => {
  assertEqual(SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value, "smooth", "default sampling mode");
});
