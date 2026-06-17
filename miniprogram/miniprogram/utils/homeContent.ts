export interface HomeAction {
  label: string;
  icon: string;
}

export interface WeeklyCreator {
  avatar: string;
  name: string;
  previewColors: string[];
}

export interface CommunityTab {
  label: string;
}

export interface WaterfallItem {
  id: string;
  title: string;
  author: string;
  avatar: string;
  likes: number;
  hasPattern: boolean;
  imageClass: string;
  imageHeight: number;
}

export const HOME_ACTIONS: HomeAction[] = [
];

export const WEEKLY_CREATORS: WeeklyCreator[] = [
];

export const COMMUNITY_TABS: CommunityTab[] = [
  { label: "最新" },
  { label: "🔥 热门推荐" },
  { label: "附图纸区" },
  { label: "成品秀展示" }
];

export const WATERFALL_COLUMNS: WaterfallItem[][] = [
  [],
  []
];
