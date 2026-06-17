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
