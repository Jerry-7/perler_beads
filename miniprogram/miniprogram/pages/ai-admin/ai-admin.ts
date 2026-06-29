import { adminLogin, createAccessKeys } from "../../utils/api";
import { clearAdminToken, getStoredAdminAuth, saveAdminToken } from "../../utils/adminAuth";
import type { AccessKeyItem } from "../../utils/types";

const ONE_YEAR_LATER = new Date();
ONE_YEAR_LATER.setFullYear(ONE_YEAR_LATER.getFullYear() + 1);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTimeInput(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function buildLocalIso(dateValue: string, timeValue: string): string {
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return date.toISOString();
}

function formatDateTimeLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function isAdminTokenExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /admin token expired|invalid admin token|missing admin token|401/i.test(error.message);
}

Page({
  data: {
    username: "",
    password: "",
    isLoggedIn: false,
    adminTokenExpiresAt: "",
    isLoggingIn: false,
    isCreating: false,
    count: 1,
    usesPerCode: 5,
    expiresMode: "never" as "never" | "limited",
    expiresDate: formatDateInput(ONE_YEAR_LATER),
    expiresTime: formatTimeInput(ONE_YEAR_LATER),
    createdKeys: [] as AccessKeyItem[]
  },

  onLoad() {
    const auth = getStoredAdminAuth();
    this.setData({
      isLoggedIn: Boolean(auth),
      adminTokenExpiresAt: auth ? formatDateTimeLabel(auth.expiresAt) : ""
    });
  },

  onUsernameInput(event: WechatMiniprogram.Input) {
    this.setData({ username: event.detail.value.trim() });
  },

  onPasswordInput(event: WechatMiniprogram.Input) {
    this.setData({ password: event.detail.value });
  },

  onCountInput(event: WechatMiniprogram.Input) {
    this.setData({ count: Math.max(1, Number(event.detail.value) || 1) });
  },

  onUsesInput(event: WechatMiniprogram.Input) {
    this.setData({ usesPerCode: Math.max(1, Number(event.detail.value) || 1) });
  },

  selectNeverExpires() {
    this.setData({ expiresMode: "never" });
  },

  selectLimitedExpires() {
    this.setData({ expiresMode: "limited" });
  },

  onExpiresDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ expiresDate: String(event.detail.value) });
  },

  onExpiresTimeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ expiresTime: String(event.detail.value) });
  },

  async login() {
    const { username, password } = this.data;
    if (!username || !password) {
      wx.showToast({ title: "请输入管理员账号和密码", icon: "none" });
      return;
    }
    this.setData({ isLoggingIn: true });
    try {
      const response = await adminLogin(username, password);
      saveAdminToken(response.adminToken, response.expiresAt);
      this.setData({
        isLoggedIn: true,
        password: "",
        adminTokenExpiresAt: formatDateTimeLabel(response.expiresAt)
      });
      wx.showToast({ title: "登录成功", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "登录失败", icon: "none" });
    } finally {
      this.setData({ isLoggingIn: false });
    }
  },

  logout() {
    clearAdminToken();
    this.setData({
      isLoggedIn: false,
      password: "",
      adminTokenExpiresAt: "",
      createdKeys: []
    });
    wx.showToast({ title: "请重新登录", icon: "none" });
  },

  async createKeys() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    this.setData({ isCreating: true });
    try {
      const expiresAt = this.data.expiresMode === "limited" ? buildLocalIso(this.data.expiresDate, this.data.expiresTime) : undefined;
      const response = await createAccessKeys(this.data.count, this.data.usesPerCode, expiresAt);
      this.setData({ createdKeys: response.keys });
      wx.showToast({ title: "创建成功", icon: "success" });
    } catch (error) {
      if (isAdminTokenExpiredError(error)) {
        clearAdminToken();
        this.setData({ isLoggedIn: false, adminTokenExpiresAt: "", createdKeys: [] });
        wx.showToast({ title: "登录已过期，请重新登录", icon: "none" });
        return;
      }
      wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" });
    } finally {
      this.setData({ isCreating: false });
    }
  },

  copyKey(event: WechatMiniprogram.TouchEvent) {
    const code = String(event.currentTarget.dataset.code || "");
    if (!code) {
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: "已复制", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "复制失败", icon: "none" });
      }
    });
  }
});
