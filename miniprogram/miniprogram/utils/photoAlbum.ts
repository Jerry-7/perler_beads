export type SaveImageResult = "saved" | "needs-settings" | "failed";

export interface PhotoAlbumApi {
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

function saveOnce(api: PhotoAlbumApi, filePath: string): Promise<SaveAttemptResult> {
  return new Promise((resolve) => {
    api.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve("saved"),
      fail: (error) => resolve(isPermissionError(error) ? "permission-denied" : "failed")
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
  const firstAttempt = await saveOnce(api, filePath);
  if (firstAttempt === "saved") {
    return "saved";
  }
  if (firstAttempt === "failed") {
    return "failed";
  }

  // 权限被拒绝：打开设置页，让用户手动开启后重试
  await openAlbumSettings(api);
  return "needs-settings";
}
