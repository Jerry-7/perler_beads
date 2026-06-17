import { GALLERY_ROUTE, MAKER_ROUTE } from "./routes";

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

test("routes point to maker and gallery pages", () => {
  assertEqual(MAKER_ROUTE, "/pages/index/index", "maker route");
  assertEqual(GALLERY_ROUTE, "/pages/gallery/gallery", "gallery route");
});
