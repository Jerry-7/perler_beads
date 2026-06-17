import { buildAiImageFormData, buildGenerationFormData } from "./generationFormData";

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

test("AI image form data includes AI prompt controls", () => {
  const formData = buildAiImageFormData({
    widthCells: 52,
    heightCells: 78,
    aiDetail: "detailed",
    aiStyle: "crafted",
    aiEffect3d: "strong",
    aiShading: "dithered",
    aiMaxColors: 32
  });

  assertEqual(formData.widthCells, "52", "width");
  assertEqual(formData.heightCells, "78", "height");
  assertEqual(formData.aiDetail, "detailed", "ai detail");
  assertEqual(formData.aiStyle, "crafted", "ai style");
  assertEqual(formData.aiEffect3d, "strong", "ai effect");
  assertEqual(formData.aiShading, "dithered", "ai shading");
  assertEqual(formData.aiMaxColors, "32", "max colors");
});

test("generation form data can use an existing AI image", () => {
  const formData = buildGenerationFormData({
    aiImageId: "ai-1",
    widthCells: 52,
    heightCells: 78,
    sourceMode: "resample",
    colorComplexity: "balanced",
    samplingMode: "smooth",
    aiMaxColors: 32
  });

  assertEqual(formData.aiImageId, "ai-1", "ai image id");
  assertEqual(formData.widthCells, "52", "width");
  assertEqual(formData.heightCells, "78", "height");
  assertEqual(formData.sourceMode, "resample", "source mode");
  assertEqual(formData.colorComplexity, "balanced", "color complexity");
  assertEqual(formData.samplingMode, "smooth", "sampling mode");
  assertEqual(formData.aiMaxColors, "32", "max colors");
});
