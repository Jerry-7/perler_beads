import { MAKER_ROUTE } from "../../utils/routes";

Page({
  startMaking() {
    wx.navigateTo({ url: MAKER_ROUTE });
  }
});
