export type SamplingMode = "nearest" | "center-shrink" | "dominant" | "detail" | "smooth";

export interface SamplingModeOption {
  label: string;
  value: SamplingMode;
}

export const SAMPLING_MODE_OPTIONS: SamplingModeOption[] = [
  { label: "原始映射", value: "nearest" },
  { label: "中心净化", value: "center-shrink" },
  { label: "清晰保边", value: "dominant" },
  { label: "细节优先", value: "detail" },
  { label: "平滑简化", value: "smooth" }
];

export const DEFAULT_SAMPLING_MODE_INDEX = 0;
