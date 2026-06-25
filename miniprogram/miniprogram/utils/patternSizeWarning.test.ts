import { buildPatternSizeWarning } from "./patternSizeWarning";

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

test("pattern size warning appears for small user-selected patterns", () => {
  const warning = buildPatternSizeWarning({
    widthCells: 24,
    heightCells: 24,
    recommendedWidthCells: 52,
    recommendedHeightCells: 52
  });

  assertEqual(
    warning,
    "当前尺寸较小，细节、边界或小图案可能丢失；建议尝试 52 x 52 或更大尺寸。",
    "small size warning"
  );
});

test("pattern size warning appears when selected size is far below recommendation", () => {
  const warning = buildPatternSizeWarning({
    widthCells: 40,
    heightCells: 40,
    recommendedWidthCells: 78,
    recommendedHeightCells: 78
  });

  assertEqual(
    warning,
    "当前尺寸低于推荐尺寸较多，细节、边界或小图案可能丢失；建议尝试 78 x 78。",
    "recommendation warning"
  );
});

test("pattern size warning stays empty for adequate sizes", () => {
  const warning = buildPatternSizeWarning({
    widthCells: 52,
    heightCells: 52,
    recommendedWidthCells: 52,
    recommendedHeightCells: 52
  });

  assertEqual(warning, "", "no warning");
});
