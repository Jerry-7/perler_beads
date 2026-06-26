import { createAiAccessOrder, getAiAccessPackages, getMyAiAccess, redeemAiAdminCode } from "../../utils/api";
import { ensureWechatSession } from "../../utils/auth";
import type { AiAccessSummary, AiPackageOffer } from "../../utils/types";

type PackageCard = AiPackageOffer & { priceText: string; quotaText: string };

function formatAccessText(summary: AiAccessSummary | null): string {
  if (!summary) {
    return "正在读取权益";
  }
  if (summary.hasFreeAccess) {
    return `管理员免费中，至 ${formatDateTime(summary.freeAccessExpiresAt || "")}`;
  }
  return `剩余 ${summary.remainingQuota} 次`;
}

function formatDateTime(value: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function packageCard(offer: AiPackageOffer): PackageCard {
  return {
    ...offer,
    priceText: `${offer.amountFen / 100} 元`,
    quotaText: `${offer.quotaAmount} 次`
  };
}

Page({
  data: {
    isLoading: false,
    isPaying: false,
    isRedeeming: false,
    accessText: "正在读取权益",
    remainingQuota: 0,
    hasFreeAccess: false,
    freeAccessExpiresAt: "",
    packages: [] as PackageCard[],
    redeemCode: ""
  },

  onLoad() {
    this.refreshAccess();
  },

  onShow() {
    this.refreshAccess();
  },

  async refreshAccess() {
    this.setData({ isLoading: true });
    try {
      await ensureWechatSession();
      const [packages, summary] = await Promise.all([getAiAccessPackages(), getMyAiAccess()]);
      this.setData({
        packages: packages.map(packageCard),
        accessText: formatAccessText(summary),
        remainingQuota: summary.remainingQuota,
        hasFreeAccess: summary.hasFreeAccess,
        freeAccessExpiresAt: summary.freeAccessExpiresAt || ""
      });
    } catch (error) {
      this.setData({ accessText: "权益读取失败，请检查登录或后端配置" });
      wx.showToast({ title: error instanceof Error ? error.message : "权益读取失败", icon: "none" });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onRedeemCodeInput(event: WechatMiniprogram.Input) {
    this.setData({ redeemCode: event.detail.value.trim() });
  },

  async buyPackage(event: WechatMiniprogram.TouchEvent) {
    const packageCode = String(event.currentTarget.dataset.code || "");
    if (!packageCode || this.data.isPaying) {
      return;
    }
    this.setData({ isPaying: true });
    try {
      await ensureWechatSession();
      const order = await createAiAccessOrder(packageCode);
      await new Promise<void>((resolve, reject) => {
        wx.requestPayment({
          timeStamp: order.paymentParams.timeStamp,
          nonceStr: order.paymentParams.nonceStr,
          package: order.paymentParams.package,
          signType: order.paymentParams.signType,
          paySign: order.paymentParams.paySign,
          success: () => resolve(),
          fail: (error) => reject(new Error(error.errMsg || "支付未完成"))
        });
      });
      wx.showToast({ title: "支付成功", icon: "success" });
      await this.refreshAccess();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "支付失败", icon: "none" });
    } finally {
      this.setData({ isPaying: false });
    }
  },

  async redeemCode() {
    const code = this.data.redeemCode.trim();
    if (!code) {
      wx.showToast({ title: "请输入权限码", icon: "none" });
      return;
    }
    this.setData({ isRedeeming: true });
    try {
      await ensureWechatSession();
      await redeemAiAdminCode(code);
      wx.showToast({ title: "兑换成功", icon: "success" });
      this.setData({ redeemCode: "" });
      await this.refreshAccess();
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "兑换失败", icon: "none" });
    } finally {
      this.setData({ isRedeeming: false });
    }
  }
});