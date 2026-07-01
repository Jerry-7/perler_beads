const ADMIN_TOKEN_KEY = "aiAdminToken";
const ADMIN_TOKEN_EXPIRES_AT_KEY = "aiAdminTokenExpiresAt";

export interface StoredAdminAuth {
  token: string;
  expiresAt: string;
}

function isFutureIsoTime(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

export function getStoredAdminAuth(): StoredAdminAuth | null {
  const token = String(wx.getStorageSync(ADMIN_TOKEN_KEY) || "");
  const expiresAt = String(wx.getStorageSync(ADMIN_TOKEN_EXPIRES_AT_KEY) || "");
  if (!token || !expiresAt || !isFutureIsoTime(expiresAt)) {
    clearAdminToken();
    return null;
  }
  return { token, expiresAt };
}

export function getStoredAdminToken(): string {
  return getStoredAdminAuth()?.token || "";
}

export function saveAdminToken(token: string, expiresAt: string) {
  wx.setStorageSync(ADMIN_TOKEN_KEY, token);
  wx.setStorageSync(ADMIN_TOKEN_EXPIRES_AT_KEY, expiresAt);
}

export function clearAdminToken() {
  wx.removeStorageSync(ADMIN_TOKEN_KEY);
  wx.removeStorageSync(ADMIN_TOKEN_EXPIRES_AT_KEY);
}

export function adminAuthHeader(): WechatMiniprogram.IAnyObject {
  const token = getStoredAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
