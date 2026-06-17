import { previewPatternImage, type PreviewImageApi } from "./patternPreview";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual: unknown[], expected: unknown[], message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

async function test(name: string, run: () => void): Promise<void> {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

void test("opens generated pattern image with WeChat preview", () => {
  let previewedUrls: string[] = [];
  const wxLike: PreviewImageApi = {
    previewImage(options) {
      previewedUrls = options.urls;
      assertEqual(options.current, "/tmp/pattern.png", "current image");
    }
  };

  const didPreview = previewPatternImage(wxLike, "/tmp/pattern.png");

  assertEqual(didPreview, true, "preview result");
  assertDeepEqual(previewedUrls, ["/tmp/pattern.png"], "preview urls");
});

void test("does not open preview without a generated image path", () => {
  let called = false;
  const wxLike: PreviewImageApi = {
    previewImage() {
      called = true;
    }
  };

  const didPreview = previewPatternImage(wxLike, undefined);

  assertEqual(didPreview, false, "preview result");
  assertEqual(called, false, "preview call");
});
