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
  { avatar: "森", name: "森屿像素", previewColors: ["#22c55e", "#fde68a", "#111827"] },
  { avatar: "桃", name: "桃桃豆铺", previewColors: ["#fb7185", "#f9a8d4", "#ffffff"] },
  { avatar: "蓝", name: "蓝格工坊", previewColors: ["#38bdf8", "#1d4ed8", "#f8fafc"] }
];

export const COMMUNITY_TABS: CommunityTab[] = [
  { label: "最新" },
  { label: "🔥 热门推荐" },
  { label: "附图纸区" },
  { label: "成品秀展示" }
];

export const WATERFALL_COLUMNS: WaterfallItem[][] = [
  [
    {
      id: "garden-cat",
      title: "花园小猫挂件图纸，适合 52x52 入门尺寸",
      author: "小栗",
      avatar: "栗",
      likes: 128,
      hasPattern: true,
      imageClass: "art-cat",
      imageHeight: 360
    },
    {
      id: "retro-game",
      title: "复古游戏机成品展示",
      author: "阿七",
      avatar: "七",
      likes: 96,
      hasPattern: false,
      imageClass: "art-game",
      imageHeight: 300
    }
  ],
  [
    {
      id: "strawberry-bear",
      title: "草莓熊头像拼豆图纸",
      author: "豆豆",
      avatar: "豆",
      likes: 214,
      hasPattern: true,
      imageClass: "art-bear",
      imageHeight: 320
    },
    {
      id: "blue-dragon",
      title: "蓝色小龙大幅作品记录",
      author: "晴天",
      avatar: "晴",
      likes: 173,
      hasPattern: true,
      imageClass: "art-dragon",
      imageHeight: 390
    }
  ]
];
