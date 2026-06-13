export type SaveImageResult = "saved" | "needs-settings" | "failed";

export interface PhotoAlbumApi {
  saveImageToPhotosAlbum(options: {
    filePath: string;
    success?: (result: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;
  authorize(options: {
    scope: "scope.writePhotosAlbum";
    success?: (result: unknown) => void;
    fail?: (error: { errMsg?: string }) => void;
  }): void;
  openSetting(options: { success?: (result: unknown) => void; fail?: (error: { errMsg?: string }) => void }): void;
}

type SaveAttemptResult = "saved" | "permission-denied" | "failed";

function isPermissionError(error: { errMsg?: string }): boolean {
  const message = (error.errMsg || "").toLowerCase();
  return message.includes("auth") || message.includes("authorize") || message.includes("permission") || message.includes("deny");
}

function saveOnce(api: PhotoAlbumApi, filePath: string): Promise<SaveAttemptResult> {
  return new Promise((resolve) => {
    api.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve("saved"),
      fail: (error) => resolve(isPermissionError(error) ? "permission-denied" : "failed")
    });
  });
}

function authorizeAlbum(api: PhotoAlbumApi): Promise<boolean> {
  return new Promise((resolve) => {
    api.authorize({
      scope: "scope.writePhotosAlbum",
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

function openAlbumSettings(api: PhotoAlbumApi): Promise<void> {
  return new Promise((resolve) => {
    api.openSetting({
      success: () => resolve(),
      fail: () => resolve()
    });
  });
}

export async function saveImageWithAlbumPermission(
  api: PhotoAlbumApi,
  filePath: string
): Promise<SaveImageResult> {
  const firstAttempt = await saveOnce(api, filePath);
  if (firstAttempt === "saved" || firstAttempt === "failed") {
    return firstAttempt;
  }

  const authorized = await authorizeAlbum(api);
  if (!authorized) {
    await openAlbumSettings(api);
    return "needs-settings";
  }

  const retryAttempt = await saveOnce(api, filePath);
  return retryAttempt === "saved" ? "saved" : "failed";
}
