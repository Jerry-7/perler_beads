import { API_BASE_URL } from "./config";
import type { GenerationStatus, PaletteColor, PatternSizeRecommendation } from "./types";

interface PaletteResponse {
  version: string;
  colors: PaletteColor[];
}

export type SourceMode = "auto" | "pixel-art" | "resample";
export type ColorComplexity = "minimal" | "simple" | "balanced" | "detailed" | "original";

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

export function uploadGeneration(
  imagePath: string,
  widthCells: number,
  heightCells: number,
  sourceMode: SourceMode = "resample",
  colorComplexity: ColorComplexity = "balanced"
): Promise<GenerationStatus> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/generations`,
      filePath: imagePath,
      name: "image",
      formData: {
        widthCells: String(widthCells),
        heightCells: String(heightCells),
        sourceMode,
        colorComplexity
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(response.data) as GenerationStatus);
          } catch {
            reject(new Error("生成结果解析失败"));
          }
          return;
        }
        reject(new Error(`上传失败：${response.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
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

export function getGeneration(generationId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>({
    url: `${API_BASE_URL}/api/generations/${generationId}`,
    method: "GET"
  });
}
