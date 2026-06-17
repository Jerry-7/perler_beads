export type AiDetail = "simple" | "balanced" | "detailed";

export interface AiDetailOption {
  label: string;
  value: AiDetail;
}

export const AI_DETAIL_OPTIONS: AiDetailOption[] = [
  { label: "简洁", value: "simple" },
  { label: "均衡", value: "balanced" },
  { label: "精细", value: "detailed" }
];

export const DEFAULT_AI_DETAIL_INDEX = 1;
