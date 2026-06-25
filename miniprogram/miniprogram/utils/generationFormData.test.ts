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
    aiShading: "dithered"
  });

  assertEqual(formData.widthCells, "52", "width");
  assertEqual(formData.heightCells, "78", "height");
  assertEqual(formData.aiDetail, "detailed", "ai detail");
  assertEqual(formData.aiStyle, "crafted", "ai style");
  assertEqual(formData.aiEffect3d, "strong", "ai effect");
  assertEqual(formData.aiShading, "dithered", "ai shading");
  assertEqual("aiMaxColors" in formData, false, "AI image should not send color count");
});

test("generation form data can use an existing AI image", () => {
  const formData = buildGenerationFormData({
    aiImageId: "ai-1",
    widthCells: 52,
    heightCells: 78,
    sourceMode: "resample",
    colorComplexity: "balanced",
    samplingMode: "center-shrink",
    aiMaxColors: 32
  });

  assertEqual(formData.aiImageId, "ai-1", "ai image id");
  assertEqual(formData.widthCells, "52", "width");
  assertEqual(formData.heightCells, "78", "height");
  assertEqual(formData.sourceMode, "resample", "source mode");
  assertEqual(formData.colorComplexity, "balanced", "color complexity");
  assertEqual(formData.samplingMode, "center-shrink", "sampling mode");
  assertEqual(formData.aiMaxColors, "32", "max colors");
});

test("generation form data can send coverage sampling mode", () => {
  const formData = buildGenerationFormData({
    widthCells: 16,
    heightCells: 16,
    sourceMode: "resample",
    colorComplexity: "original",
    samplingMode: "coverage",
    aiMaxColors: 16
  });

  assertEqual(formData.samplingMode, "coverage", "coverage sampling mode");
});

test("generation form data can send grid scan sampling mode", () => {
  const formData = buildGenerationFormData({
    widthCells: 1,
    heightCells: 1,
    sourceMode: "resample",
    colorComplexity: "original",
    samplingMode: "grid-scan",
    aiMaxColors: 16
  });

  assertEqual(formData.samplingMode, "grid-scan", "grid scan sampling mode");
});
