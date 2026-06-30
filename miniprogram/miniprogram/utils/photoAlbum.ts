export type SaveImageResult = "saved" | "needs-settings" | "failed";

export interface PhotoAlbumApi {
  getFileInfo?: (options: {
    filePath: string;
    success?: (result: { size?: number; digest?: string }) => void;
    fail?: (error: { errMsg?: string }) => void;
  }) => void;
  saveImageToPhotosAlbum(options: {
    filePath: string;
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

function checkFile(api: PhotoAlbumApi, filePath: string): Promise<boolean> {
  if (!api.getFileInfo) {
    console.warn("[photo-album] getFileInfo unavailable, skip temp file check", { filePath });
    return Promise.resolve(true);
  }
  console.log("[photo-album] getFileInfo start", { filePath });
  return new Promise((resolve) => {
    api.getFileInfo?.({
      filePath,
      success: (result) => {
        console.log("[photo-album] getFileInfo success", { filePath, result });
        resolve(true);
      },
      fail: (error) => {
        console.error("[photo-album] getFileInfo failed", { filePath, error });
        resolve(false);
      }
    });
  });
}
function saveOnce(api: PhotoAlbumApi, filePath: string): Promise<SaveAttemptResult> {
  console.log("[photo-album] saveImageToPhotosAlbum start", { filePath });
  return new Promise((resolve) => {
    api.saveImageToPhotosAlbum({
      filePath,
      success: (result) => {
        console.log("[photo-album] saveImageToPhotosAlbum success", result);
        resolve("saved");
      },
      fail: (error) => {
        const mappedResult = isPermissionError(error) ? "permission-denied" : "failed";
        console.error("[photo-album] saveImageToPhotosAlbum failed", { error, mappedResult });
        resolve(mappedResult);
      }
    });
  });
}
function openAlbumSettings(api: PhotoAlbumApi): Promise<void> {
  console.log("[photo-album] openSetting start");
  return new Promise((resolve) => {
    api.openSetting({
      success: (result) => {
        console.log("[photo-album] openSetting success", result);
        resolve();
      },
      fail: (error) => {
        console.error("[photo-album] openSetting failed", error);
        resolve();
      }
    });
  });
}
/**
 * 保存图片到相册，自动处理权限。
 *
 * 流程：
 * 1. 直接调用 saveImageToPhotosAlbum（首次调用会触发系统授权弹窗）
 * 2. 如果权限被拒绝，打开设置页让用户手动开启
 * 3. 返回 "needs-settings" 表示用户需要从设置页返回后重试
 *
 * 注意：不再使用 wx.authorize，因为 scope.writePhotosAlbum 的
 * authorize 接口在部分微信版本上不可靠（返回成功但权限未生效）。
 */
export async function saveImageWithAlbumPermission(
  api: PhotoAlbumApi,
  filePath: string
): Promise<SaveImageResult> {
  console.log("[photo-album] saveImageWithAlbumPermission start", { filePath });
  const fileExists = await checkFile(api, filePath);
  if (!fileExists) {
    return "failed";
  }
  const firstAttempt = await saveOnce(api, filePath);
  console.log("[photo-album] first save attempt result", { firstAttempt, filePath });
  if (firstAttempt === "saved") {
    return "saved";
  }
  if (firstAttempt === "failed") {
    return "failed";
  }

  // 权限被拒绝：打开设置页，让用户手动开启后重试
  await openAlbumSettings(api);
  console.warn("[photo-album] permission settings required", { filePath });
  return "needs-settings";
}
