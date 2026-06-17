export interface PreviewImageApi {
  previewImage(options: { urls: string[]; current: string }): void;
}

export function previewPatternImage(wxApi: PreviewImageApi, tempFilePath?: string): boolean {
  if (!tempFilePath) {
    return false;
  }

  wxApi.previewImage({
    urls: [tempFilePath],
    current: tempFilePath
  });
  return true;
}
