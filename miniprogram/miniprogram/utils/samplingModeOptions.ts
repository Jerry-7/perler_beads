export type SamplingMode = "nearest" | "coverage" | "grid-scan" | "center-shrink" | "line-art";

export interface SamplingModeOption {
  label: string;
  value: SamplingMode;
}

export const SAMPLING_MODE_OPTIONS: SamplingModeOption[] = [
  { label: "原始映射", value: "nearest" },
  { label: "比例映射", value: "coverage" },
  { label: "半成品识别", value: "grid-scan" },
  { label: "中心特征提取", value: "center-shrink" },
  { label: "彩色简笔", value: "line-art" }
];

export const DEFAULT_SAMPLING_MODE_INDEX = 0;
