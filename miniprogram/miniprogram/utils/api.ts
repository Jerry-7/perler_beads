import { API_BASE_URL } from "./config";
import type { GenerationStatus, PaletteColor } from "./types";

interface PaletteResponse {
  version: string;
  colors: PaletteColor[];
}

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

export function uploadGeneration(imagePath: string, widthCells: number, heightCells: number): Promise<GenerationStatus> {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${API_BASE_URL}/api/generations`,
      filePath: imagePath,
      name: "image",
      formData: {
        widthCells: String(widthCells),
        heightCells: String(heightCells)
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

export function getGeneration(generationId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>({
    url: `${API_BASE_URL}/api/generations/${generationId}`,
    method: "GET"
  });
}
