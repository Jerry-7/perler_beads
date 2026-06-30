export type SamplingMode = "nearest" | "coverage" | "grid-scan" | "center-shrink" | "line-art" | "cluster-ms" | "cluster-dbscan";

export interface SamplingModeOption {
  label: string;
  value: SamplingMode;
}

export const SAMPLING_MODE_OPTIONS: SamplingModeOption[] = [
  { label: "标准取色", value: "nearest" },
  { label: "精细取色", value: "coverage" },
  { label: "实物扫描", value: "grid-scan" },
  { label: "中心取色", value: "center-shrink" },
  { label: "线稿提取", value: "line-art" },
  { label: "智能并色", value: "cluster-ms" },
  { label: "密度并色", value: "cluster-dbscan" }
];

export const DEFAULT_SAMPLING_MODE_INDEX = 0;
