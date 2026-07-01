import { API_BASE_URL } from "./config";
import type { WechatLoginResponse } from "./types";

const SESSION_TOKEN_KEY = "perlerAiSessionToken";
let pendingLogin: Promise<string> | null = null;

export function getSessionToken(): string {
  return (wx.getStorageSync(SESSION_TOKEN_KEY) as string) || "";
}

export function clearSessionToken(): void {
  wx.removeStorageSync(SESSION_TOKEN_KEY);
}

export function authHeader(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function ensureWechatSession(): Promise<string> {
  const existingToken = getSessionToken();
  if (existingToken) {
    return Promise.resolve(existingToken);
  }
  if (pendingLogin) {
    return pendingLogin;
  }
  pendingLogin = new Promise((resolve, reject) => {
    wx.login({
      success(loginResult) {
        if (!loginResult.code) {
          pendingLogin = null;
          reject(new Error("微信登录失败"));
          return;
        }
        wx.request({
          url: `${API_BASE_URL}/api/auth/wechat/login`,
          method: "POST",
          timeout: 10000,
          header: { "content-type": "application/json" },
          data: { code: loginResult.code },
          success(response) {
            pendingLogin = null;
            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(new Error("登录会话创建失败"));
              return;
            }
            const body = response.data as WechatLoginResponse;
            if (!body.sessionToken) {
              reject(new Error("登录会话无效"));
              return;
            }
            wx.setStorageSync(SESSION_TOKEN_KEY, body.sessionToken);
            resolve(body.sessionToken);
          },
          fail(error) {
            pendingLogin = null;
            reject(new Error(error.errMsg));
          }
        });
      },
      fail(error) {
        pendingLogin = null;
        reject(new Error(error.errMsg));
      }
    });
  });
  return pendingLogin;
}