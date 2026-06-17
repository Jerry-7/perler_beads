import { AI_DETAIL_OPTIONS, DEFAULT_AI_DETAIL_INDEX } from "./aiDetailOptions";

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

test("default AI detail is balanced", () => {
  assertEqual(AI_DETAIL_OPTIONS[DEFAULT_AI_DETAIL_INDEX].value, "balanced", "default detail");
});

test("AI detail options expose simple balanced and detailed", () => {
  assertEqual(AI_DETAIL_OPTIONS.length, 3, "option count");
  assertEqual(AI_DETAIL_OPTIONS[0].value, "simple", "first option");
  assertEqual(AI_DETAIL_OPTIONS[2].value, "detailed", "last option");
});
