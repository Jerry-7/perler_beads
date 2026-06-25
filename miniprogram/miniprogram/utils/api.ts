import { API_BASE_URL } from "./config";
import type { AiImageStatus, GenerationStatus, PaletteColor, PatternDebugAnalysis, PatternSizeRecommendation } from "./types";
import type { AiDetail } from "./aiDetailOptions";
import type { AiEffect3d, AiShading, AiStyle } from "./aiGenerationOptions";
import { buildAiImageFormData, buildGenerationFormData, type ColorComplexity, type SourceMode } from "./generationFormData";
import type { SamplingMode } from "./samplingModeOptions";

interface PaletteResponse {
  version: string;
  colors: PaletteColor[];
}

export type { ColorComplexity, SourceMode } from "./generationFormData";

function request<T>(options: WechatMiniprogram.RequestOption): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }
        reject(new Error(`请求失败：${response.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

export function getPalette(): Promise<PaletteResponse> {
  return request<PaletteResponse>({
    url: `${API_BASE_URL}/api/palette`,
    method: "GET"
  });
}

export interface UploadGenerationInput {
  imagePath?: string;
  aiImageId?: string;
  widthCells: number;
  heightCells: number;
  sourceMode?: SourceMode;
  colorComplexity?: ColorComplexity;
  samplingMode?: SamplingMode;
  aiMaxColors?: number;
}

export interface CreateAiImageInput {
  imagePath: string;
  widthCells: number;
  heightCells: number;
  aiDetail: AiDetail;
  aiStyle: AiStyle;
  aiEffect3d: AiEffect3d;
  aiShading: AiShading;
}

export interface AnalyzePatternDebugInput {
  imagePath: string;
  widthCells: number;
  heightCells: number;
}

export function uploadGeneration(input: UploadGenerationInput): Promise<GenerationStatus> {
  const formData = buildGenerationFormData({
    aiImageId: input.aiImageId,
    widthCells: input.widthCells,
    heightCells: input.heightCells,
    sourceMode: input.sourceMode || "resample",
    colorComplexity: input.colorComplexity || "balanced",
    samplingMode: input.samplingMode || "nearest",
    aiMaxColors: input.aiMaxColors || 16
  });
  if (input.aiImageId) {
    return request<GenerationStatus>({
      url: `${API_BASE_URL}/api/generations`,
      method: "POST",
      header: {
        "content-type": "application/x-www-form-urlencoded"
      },
      data: formData
    });
  }
  if (!input.imagePath) {
    return Promise.reject(new Error("缺少图片"));
  }
  const imagePath = input.imagePath;
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/generations`,
      filePath: imagePath,
      name: "image",
      formData,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(response.data) as GenerationStatus);
          } catch {
            reject(new Error("生成结果解析失败"));
          }
          return;
        }
        reject(new Error(errorMessageFromUploadResponse(response, "上传失败")));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

function errorMessageFromUploadResponse(response: WechatMiniprogram.UploadFileSuccessCallbackResult, fallback: string): string {
  try {
    const parsed = JSON.parse(response.data) as { detail?: string };
    if (parsed.detail) {
      return parsed.detail;
    }
  } catch {
    // Keep the status-code fallback when the backend response is not JSON.
  }
  return `${fallback}：${response.statusCode}`;
}

export function recommendPatternSize(imagePath: string): Promise<PatternSizeRecommendation> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/pattern-size/recommendation`,
      filePath: imagePath,
      name: "image",
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(response.data) as PatternSizeRecommendation);
          } catch {
            reject(new Error("推荐尺寸解析失败"));
          }
          return;
        }
        reject(new Error(`推荐尺寸失败：${response.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

export function analyzePatternDebug(input: AnalyzePatternDebugInput): Promise<PatternDebugAnalysis> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/pattern-debug/analyze`,
      filePath: input.imagePath,
      name: "image",
      formData: {
        widthCells: String(input.widthCells),
        heightCells: String(input.heightCells)
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(response.data) as PatternDebugAnalysis);
          } catch {
            reject(new Error("识别过程解析失败"));
          }
          return;
        }
        reject(new Error(errorMessageFromUploadResponse(response, "识别过程失败")));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

export function createAiImage(input: CreateAiImageInput): Promise<AiImageStatus> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/ai-images`,
      filePath: input.imagePath,
      name: "image",
      formData: buildAiImageFormData(input),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(response.data) as AiImageStatus);
          } catch {
            reject(new Error("AI 图片结果解析失败"));
          }
          return;
        }
        reject(new Error(`AI 生图失败：${response.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

export function getGeneration(generationId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>({
    url: `${API_BASE_URL}/api/generations/${generationId}`,
    method: "GET"
  });
}

export function getAiImage(aiImageId: string): Promise<AiImageStatus> {
  return request<AiImageStatus>({
    url: `${API_BASE_URL}/api/ai-images/${aiImageId}`,
    method: "GET"
  });
}

export function aiImageUrl(aiImageId: string): string {
  return `${API_BASE_URL}/api/ai-images/${aiImageId}/image`;
}
