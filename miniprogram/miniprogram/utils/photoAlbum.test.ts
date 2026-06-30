import { saveImageWithAlbumPermission, type PhotoAlbumApi, type SaveImageResult } from "./photoAlbum";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function test(name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function createApi(overrides: Partial<PhotoAlbumApi>): PhotoAlbumApi {
  return {
    saveImageToPhotosAlbum: () => undefined,
    openSetting: () => undefined,
    ...overrides
  };
}

async function main(): Promise<void> {
  await test("returns saved when saving succeeds immediately", async () => {
    let saves = 0;
    const result = await saveImageWithAlbumPermission(
      createApi({
        saveImageToPhotosAlbum(options) {
          saves += 1;
          options.success?.({});
        }
      }),
      "/tmp/pattern.png"
    );

    assertEqual(result, "saved", "result");
    assertEqual(saves, 1, "save attempts");
  });

  await test("opens settings on permission denial", async () => {
    let saves = 0;
    let openedSettings = 0;
    const result = await saveImageWithAlbumPermission(
      createApi({
        saveImageToPhotosAlbum(options) {
          saves += 1;
          options.fail?.({ errMsg: "saveImageToPhotosAlbum:fail auth deny" });
        },
        openSetting(options) {
          openedSettings += 1;
          options.success?.({});
        }
      }),
      "/tmp/pattern.png"
    );

    assertEqual(result, "needs-settings", "result");
    assertEqual(saves, 1, "save attempts");
    assertEqual(openedSettings, 1, "settings opens on permission denial");
  });

  await test("returns failed for non-permission save errors", async () => {
    const result: SaveImageResult = await saveImageWithAlbumPermission(
      createApi({
        saveImageToPhotosAlbum(options) {
          options.fail?.({ errMsg: "saveImageToPhotosAlbum:fail invalid file" });
        }
      }),
      "/tmp/pattern.png"
    );

    assertEqual(result, "failed", "result");
  });
}

void main();
