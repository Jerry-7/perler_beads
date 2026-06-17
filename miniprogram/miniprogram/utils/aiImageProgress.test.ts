import { nextAiImageProgress } from "./aiImageProgress";

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

test("AI image progress advances while processing", () => {
  assertEqual(nextAiImageProgress(15, "processing"), 23, "first processing step");
  assertEqual(nextAiImageProgress(88, "processing"), 90, "processing cap");
});

test("AI image progress reaches terminal values", () => {
  assertEqual(nextAiImageProgress(60, "completed"), 100, "completed");
  assertEqual(nextAiImageProgress(60, "failed"), 0, "failed");
});
