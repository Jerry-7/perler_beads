import { GALLERY_ROUTE, MAKER_ROUTE } from "../../utils/routes";
import { COMMUNITY_TABS, HOME_ACTIONS, WATERFALL_COLUMNS, WEEKLY_CREATORS } from "../../utils/homeContent";

Page({
  data: {
    activeTabIndex: 0,
    tabs: COMMUNITY_TABS,
    actions: HOME_ACTIONS,
    weeklyCreators: WEEKLY_CREATORS,
    waterfallColumns: WATERFALL_COLUMNS,
    hasWeeklyCreators: WEEKLY_CREATORS.length > 0,
    hasWaterfallItems: WATERFALL_COLUMNS.some((column) => column.length > 0)
  },

  startMaking() {
    wx.navigateTo({ url: MAKER_ROUTE });
  },

  openGallery() {
    wx.navigateTo({ url: GALLERY_ROUTE });
  },

  switchTab(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index) || 0;
    this.setData({ activeTabIndex: index });
  }
});
