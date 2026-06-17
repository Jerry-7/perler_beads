export type AiStyle = "faithful" | "iconic" | "crafted" | "dramatic";
export type AiEffect3d = "none" | "subtle" | "balanced" | "strong";
export type AiShading = "flat" | "step" | "dithered";

export interface AiOption<T extends string> {
  label: string;
  value: T;
}

export const AI_STYLE_OPTIONS: AiOption<AiStyle>[] = [
  { label: "原图保真", value: "faithful" },
  { label: "图标化", value: "iconic" },
  { label: "拼豆友好", value: "crafted" },
  { label: "立体表现", value: "dramatic" }
];

export const AI_EFFECT_3D_OPTIONS: AiOption<AiEffect3d>[] = [
  { label: "关闭", value: "none" },
  { label: "轻微", value: "subtle" },
  { label: "均衡", value: "balanced" },
  { label: "强烈", value: "strong" }
];

export const AI_SHADING_OPTIONS: AiOption<AiShading>[] = [
  { label: "平涂", value: "flat" },
  { label: "阶梯阴影", value: "step" },
  { label: "抖动阴影", value: "dithered" }
];

export const DEFAULT_AI_STYLE_INDEX = 0;
export const DEFAULT_AI_EFFECT_3D_INDEX = 2;
export const DEFAULT_AI_SHADING_INDEX = 1;
export const DEFAULT_AI_MAX_COLORS = 16;
export const MIN_AI_MAX_COLORS = 4;
export const MAX_AI_MAX_COLORS = 64;

export function normalizeAiMaxColors(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_AI_MAX_COLORS;
  }
  return Math.min(MAX_AI_MAX_COLORS, Math.max(MIN_AI_MAX_COLORS, Math.round(value)));
}

export function normalizeAiMaxColorsInput(value: string): number | "" {
  if (value.trim() === "") {
    return "";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return Math.min(MAX_AI_MAX_COLORS, Math.max(0, Math.round(parsed)));
}
