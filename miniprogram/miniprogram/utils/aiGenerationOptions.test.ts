import {
  AI_EFFECT_3D_OPTIONS,
  AI_SHADING_OPTIONS,
  AI_STYLE_OPTIONS,
  DEFAULT_AI_EFFECT_3D_INDEX,
  DEFAULT_AI_MAX_COLORS,
  DEFAULT_AI_SHADING_INDEX,
  DEFAULT_AI_STYLE_INDEX,
  normalizeAiMaxColors
} from "./aiGenerationOptions";

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

test("default AI generation controls are general purpose", () => {
  assertEqual(AI_STYLE_OPTIONS[DEFAULT_AI_STYLE_INDEX].value, "faithful", "default style");
  assertEqual(AI_EFFECT_3D_OPTIONS[DEFAULT_AI_EFFECT_3D_INDEX].value, "balanced", "default 3d");
  assertEqual(AI_SHADING_OPTIONS[DEFAULT_AI_SHADING_INDEX].value, "step", "default shading");
  assertEqual(DEFAULT_AI_MAX_COLORS, 16, "default max colors");
});

test("AI generation controls expose generic style choices", () => {
  assertEqual(AI_STYLE_OPTIONS.length, 4, "style count");
  assertEqual(AI_STYLE_OPTIONS[0].value, "faithful", "first style");
  assertEqual(AI_STYLE_OPTIONS[1].value, "iconic", "second style");
  assertEqual(AI_STYLE_OPTIONS[2].value, "crafted", "third style");
  assertEqual(AI_STYLE_OPTIONS[3].value, "dramatic", "fourth style");
});

test("max colors are clamped to the backend range", () => {
  assertEqual(normalizeAiMaxColors(3), 4, "min clamp");
  assertEqual(normalizeAiMaxColors(65), 64, "max clamp");
  assertEqual(normalizeAiMaxColors(24), 24, "valid value");
  assertEqual(normalizeAiMaxColors(Number.NaN), DEFAULT_AI_MAX_COLORS, "invalid value");
});
