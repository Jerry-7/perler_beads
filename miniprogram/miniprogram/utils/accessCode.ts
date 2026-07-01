const ACCESS_CODE_KEY = "aiAccessCode";

export function normalizeAccessCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getStoredAccessCode(): string {
  return normalizeAccessCode(String(wx.getStorageSync(ACCESS_CODE_KEY) || ""));
}

export function saveAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  wx.setStorageSync(ACCESS_CODE_KEY, normalized);
  return normalized;
}

export function clearAccessCode() {
  wx.removeStorageSync(ACCESS_CODE_KEY);
}
