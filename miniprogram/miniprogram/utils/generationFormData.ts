import type { AiDetail } from "./aiDetailOptions";
import type { AiEffect3d, AiShading, AiStyle } from "./aiGenerationOptions";
import type { SamplingMode } from "./samplingModeOptions";

export type SourceMode = "auto" | "pixel-art" | "resample";
export type ColorComplexity = "minimal" | "simple" | "balanced" | "detailed" | "original";

export interface GenerationFormDataInput {
  aiImageId?: string;
  widthCells: number;
  heightCells: number;
  sourceMode: SourceMode;
  colorComplexity: ColorComplexity;
  samplingMode: SamplingMode;
  aiMaxColors: number;
}

export interface AiImageFormDataInput {
  widthCells: number;
  heightCells: number;
  aiDetail: AiDetail;
  aiStyle: AiStyle;
  aiEffect3d: AiEffect3d;
  aiShading: AiShading;
}

export function buildGenerationFormData(input: GenerationFormDataInput): Record<string, string> {
  const formData: Record<string, string> = {
    widthCells: String(input.widthCells),
    heightCells: String(input.heightCells),
    sourceMode: input.sourceMode,
    colorComplexity: input.colorComplexity,
    samplingMode: input.samplingMode,
    aiMaxColors: String(input.aiMaxColors)
  };
  if (input.aiImageId) {
    formData.aiImageId = input.aiImageId;
  }
  return formData;
}

export function buildAiImageFormData(input: AiImageFormDataInput): Record<string, string> {
  return {
    widthCells: String(input.widthCells),
    heightCells: String(input.heightCells),
    aiDetail: input.aiDetail,
    aiStyle: input.aiStyle,
    aiEffect3d: input.aiEffect3d,
    aiShading: input.aiShading
  };
}
