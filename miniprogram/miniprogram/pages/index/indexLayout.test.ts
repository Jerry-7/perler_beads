declare const require: any;

const { readFileSync } = require("fs");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
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

const wxml = readFileSync("miniprogram/pages/index/index.wxml", "utf8");

test("pattern size controls live in the pattern adjustment panel", () => {
  const adjustmentStart = wxml.indexOf("图纸调整");
  const sizeLabel = wxml.indexOf("目标尺寸", adjustmentStart);
  const generatePatternButton = wxml.indexOf("生成拼豆图纸", adjustmentStart);

  assert(adjustmentStart >= 0, "missing pattern adjustment panel");
  assert(sizeLabel > adjustmentStart, "target size should appear after pattern adjustment heading");
  assert(sizeLabel < generatePatternButton, "target size should be part of pattern adjustment controls");
});

test("pattern adjustment lets users choose original upload or AI preview as source", () => {
  const adjustmentStart = wxml.indexOf("图纸调整");
  const sourceLabel = wxml.indexOf("图纸来源", adjustmentStart);
  const originalSource = wxml.indexOf("原上传图", sourceLabel);
  const aiSource = wxml.indexOf("AI 预览图", sourceLabel);

  assert(sourceLabel > adjustmentStart, "missing source selector in pattern adjustment panel");
  assert(originalSource > sourceLabel, "missing original upload source option");
  assert(aiSource > sourceLabel, "missing AI preview source option");
});

test("pattern adjustment exposes staged debug previews", () => {
  const adjustmentStart = wxml.indexOf("图纸调整");
  const debugButton = wxml.indexOf("查看识别过程", adjustmentStart);
  const originalPreview = wxml.indexOf("原始识别图", debugButton);
  const compressedPreview = wxml.indexOf("压缩后图片", debugButton);

  assert(debugButton > adjustmentStart, "missing staged debug button");
  assert(originalPreview > debugButton, "missing original debug preview");
  assert(compressedPreview > debugButton, "missing compressed debug preview");
});

test("max color control is shared and pattern adjustment shows its impact", () => {
  const sharedStart = wxml.indexOf("公共参数");
  const maxColors = wxml.indexOf("最大颜色数（4-64）", sharedStart);
  const aiPanel = wxml.indexOf("AI生成精细度");
  const adjustmentStart = wxml.indexOf("图纸调整");
  const patternHint = wxml.indexOf("图纸最多保留", adjustmentStart);

  assert(sharedStart >= 0, "missing shared parameter panel");
  assert(maxColors > sharedStart, "max color control should live in shared parameters");
  assert(maxColors < aiPanel, "max color control should appear before AI-only controls");
  assert(patternHint > adjustmentStart, "pattern adjustment should show max color impact");
});

test("generated images can be saved to album", () => {
  const aiPreviewStart = wxml.indexOf("AI 预览图");
  const aiSave = wxml.indexOf("保存到相册", aiPreviewStart);
  const resultStart = wxml.indexOf("生成图纸");
  const patternSave = wxml.indexOf("保存到相册", resultStart);

  assert(aiSave > aiPreviewStart, "missing AI preview save button");
  assert(patternSave > resultStart, "missing pattern save button");
});
