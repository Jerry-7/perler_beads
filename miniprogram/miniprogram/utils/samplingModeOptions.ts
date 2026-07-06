export type SamplingMode = "nearest" | "coverage" | "grid-scan" | "center-shrink" | "line-art" | "cluster-ms" | "cluster-dbscan";

export interface SamplingModeOption {
  label: string;
  value: SamplingMode;
  /** Whether this mode runs locally on the frontend (no server upload needed). */
  local?: boolean;
}

export const SAMPLING_MODE_OPTIONS: SamplingModeOption[] = [
  { label: "标准取色", value: "nearest", local: true },
  { label: "精细取色", value: "coverage", local: true },
  { label: "中心取色", value: "center-shrink", local: true },
];

export const DEFAULT_SAMPLING_MODE_INDEX = 0;
