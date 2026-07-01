import { getAccessKeySummary } from "../../utils/api";
import { clearAccessCode, getStoredAccessCode, saveAccessCode } from "../../utils/accessCode";
import { AI_ADMIN_ROUTE } from "../../utils/routes";
import type { AccessKeySummary } from "../../utils/types";

function formatAccessText(summary: AccessKeySummary | null): string {
  if (!summary) {
    return "请输入权限码";
  }
  if (!summary.canGenerateAi) {
    return `权限码${summary.status}`;
  }
  return `剩余 ${summary.remainingUses} / ${summary.totalUses} 次`;
}

Page({
  data: {
    isLoading: false,
    accessCode: "",
    accessCodeDraft: "",
    accessText: "请输入权限码",
    remainingUses: 0,
    totalUses: 0,
    status: "",
    hasSavedCode: false
  },

  onLoad() {
    const code = getStoredAccessCode();
    this.setData({ accessCode: code, accessCodeDraft: "", hasSavedCode: Boolean(code) });
    if (code) {
      this.refreshAccess();
    }
  },

  onShow() {
    const code = getStoredAccessCode();
    if (code && code !== this.data.accessCode) {
      this.setData({ accessCode: code, accessCodeDraft: "", hasSavedCode: true });
      this.refreshAccess();
    }
  },

  onAccessCodeInput(event: WechatMiniprogram.Input) {
    this.setData({ accessCodeDraft: event.detail.value });
  },

  pasteAccessCode() {
    wx.getClipboardData({
      success: async (result) => {
        const code = saveAccessCode(result.data || "");
        if (!code) {
          wx.showToast({ title: "剪贴板没有权限码", icon: "none" });
          return;
        }
        this.setData({ accessCode: code, accessCodeDraft: "", hasSavedCode: true });
        await this.refreshAccess();
      },
      fail: () => {
        wx.showToast({ title: "读取剪贴板失败", icon: "none" });
      }
    });
  },

  async saveAndRefresh() {
    const code = saveAccessCode(this.data.accessCodeDraft || this.data.accessCode);
    if (!code) {
      wx.showToast({ title: "请输入权限码", icon: "none" });
      return;
    }
    this.setData({ accessCode: code, accessCodeDraft: "", hasSavedCode: true });
    await this.refreshAccess();
  },

  clearSavedCode() {
    clearAccessCode();
    this.setData({
      accessCode: "",
      accessCodeDraft: "",
      accessText: "请输入权限码",
      remainingUses: 0,
      totalUses: 0,
      status: "",
      hasSavedCode: false
    });
  },

  async refreshAccess() {
    const code = (this.data.accessCodeDraft || this.data.accessCode).trim();
    if (!code) {
      this.setData({ accessText: "请输入权限码" });
      return;
    }
    this.setData({ isLoading: true });
    try {
      const summary = await getAccessKeySummary(code);
      saveAccessCode(summary.code);
      this.setData({
        accessCode: summary.code,
        accessCodeDraft: "",
        accessText: formatAccessText(summary),
        remainingUses: summary.remainingUses,
        totalUses: summary.totalUses,
        status: summary.status,
        hasSavedCode: true
      });
    } catch (error) {
      this.setData({ accessText: "权限码不可用", status: "invalid" });
      wx.showToast({ title: error instanceof Error ? error.message : "权限码校验失败", icon: "none" });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  openAdminPage() {
    wx.navigateTo({ url: AI_ADMIN_ROUTE });
  }
});
