export type SamplingMode = "smooth";

export interface SamplingModeOption {
  label: string;
  value: SamplingMode;
}

export const SAMPLING_MODE_OPTIONS: SamplingModeOption[] = [
  { label: "干净锐利", value: "smooth" }
];

export const DEFAULT_SAMPLING_MODE_INDEX = 0;
