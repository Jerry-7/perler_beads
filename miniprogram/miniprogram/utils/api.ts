import { API_BASE_URL } from "./config";
import { authHeader } from "./auth";
import { adminAuthHeader } from "./adminAuth";
import type {
  AccessKeySummary,
  AdminLoginResponse,
  AiAccessSummary,
  AiImageStatus,
  AiPackageOffer,
  CreateAccessKeysResponse,
  CreateAiOrderResponse,
  GenerationStatus,
  PaletteColor,
  PatternDebugAnalysis,
  PatternSizeRecommendation,
  RedeemAdminCodeResponse
} from "./types";
import type { AiDetail } from "./aiDetailOptions";
import type { AiEffect3d, AiShading, AiStyle } from "./aiGenerationOptions";
import { buildAiImageFormData, buildGenerationFormData, type ColorComplexity, type SourceMode } from "./generationFormData";
import type { SamplingMode } from "./samplingModeOptions";
import { resizeImageForUpload } from "./imageSampling";

interface PaletteResponse {
  version: string;
  colors: PaletteColor[];
}

export type { ColorComplexity, SourceMode } from "./generationFormData";

function mergeHeaders(base?: WechatMiniprogram.IAnyObject, withAuth = false): WechatMiniprogram.IAnyObject {
  return {
    ...(base || {}),
    ...(withAuth ? authHeader() : {})
  };
}

function request<T>(options: WechatMiniprogram.RequestOption, withAuth = false): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      header: mergeHeaders(options.header as WechatMiniprogram.IAnyObject | undefined, withAuth),
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }
        reject(new Error(errorMessageFromRequestResponse(response, "请求失败")));
      },
      fail(error) {
        reject(new Error(error.errMsg));
      }
    });
  });
}

function errorMessageFromRequestResponse(response: WechatMiniprogram.RequestSuccessCallbackResult, fallback: string): string {
  const data = response.data as { detail?: string } | string | undefined;
  if (typeof data === "object" && data && typeof data.detail === "string") {
    return data.detail;
  }
  return `${fallback}，状态码 ${response.statusCode}`;
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
  return `${fallback}，状态码 ${response.statusCode}`;
}

export function getPalette(): Promise<PaletteResponse> {
  return request<PaletteResponse>({ url: `${API_BASE_URL}/api/palette`, method: "GET" });
}

export function getAiAccessPackages(): Promise<AiPackageOffer[]> {
  return request<AiPackageOffer[]>({ url: `${API_BASE_URL}/api/ai-access/packages`, method: "GET" }, true);
}

export function getMyAiAccess(): Promise<AiAccessSummary> {
  return request<AiAccessSummary>({ url: `${API_BASE_URL}/api/ai-access/me`, method: "GET" }, true);
}

export function createAiAccessOrder(packageCode: string): Promise<CreateAiOrderResponse> {
  return request<CreateAiOrderResponse>({
    url: `${API_BASE_URL}/api/ai-access/orders`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { packageCode }
  }, true);
}

export function redeemAiAdminCode(code: string): Promise<RedeemAdminCodeResponse> {
  return request<RedeemAdminCodeResponse>({
    url: `${API_BASE_URL}/api/ai-access/admin-codes/redeem`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code }
  }, true);
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
  clusterQuantile?: number;
  clusterEps?: number;
}

export interface CreateAiImageInput {
  imagePath: string;
  widthCells: number;
  heightCells: number;
  aiDetail: AiDetail;
  aiStyle: AiStyle;
  aiEffect3d: AiEffect3d;
  aiShading: AiShading;
  accessCode: string;
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
    aiMaxColors: input.aiMaxColors || 16,
    clusterQuantile: input.clusterQuantile,
    clusterEps: input.clusterEps,
  });
  if (input.aiImageId) {
    return request<GenerationStatus>({
      url: `${API_BASE_URL}/api/generations`,
      method: "POST",
      header: { "content-type": "application/x-www-form-urlencoded" },
      data: formData
    });
  }
  if (!input.imagePath) {
    return Promise.reject(new Error("缺少图片"));
  }
  return resizeImageForUpload(input.imagePath).then((resizedPath) => {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/generations`,
        filePath: resizedPath,
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
  });
}

export function recommendPatternSize(imagePath: string): Promise<PatternSizeRecommendation> {
  return resizeImageForUpload(imagePath).then((resizedPath) => {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/pattern-size/recommendation`,
        filePath: resizedPath,
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
          reject(new Error(errorMessageFromUploadResponse(response, "推荐尺寸失败")));
        },
        fail(error) {
          reject(new Error(error.errMsg));
        }
      });
    });
  });
}

export function analyzePatternDebug(input: AnalyzePatternDebugInput): Promise<PatternDebugAnalysis> {
  return resizeImageForUpload(input.imagePath).then((resizedPath) => {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/pattern-debug/analyze`,
        filePath: resizedPath,
        name: "image",
        formData: { widthCells: String(input.widthCells), heightCells: String(input.heightCells) },
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
  });
}

export function createAiImage(input: CreateAiImageInput): Promise<AiImageStatus> {
  return resizeImageForUpload(input.imagePath).then((resizedPath) => {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}/api/ai-images`,
        filePath: resizedPath,
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
          reject(new Error(errorMessageFromUploadResponse(response, "AI 生图失败")));
        },
        fail(error) {
          reject(new Error(error.errMsg));
        }
      });
    });
  });
}

export function getAccessKeySummary(code: string): Promise<AccessKeySummary> {
  return request<AccessKeySummary>({
    url: `${API_BASE_URL}/api/ai-access/keys/summary`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { code }
  });
}

export function adminLogin(username: string, password: string): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>({
    url: `${API_BASE_URL}/api/admin/login`,
    method: "POST",
    header: { "content-type": "application/json" },
    data: { username, password }
  });
}

export function createAccessKeys(count: number, usesPerCode: number, expiresAt?: string): Promise<CreateAccessKeysResponse> {
  return request<CreateAccessKeysResponse>({
    url: `${API_BASE_URL}/api/admin/ai-access/keys`,
    method: "POST",
    header: {
      "content-type": "application/json",
      ...adminAuthHeader()
    },
    data: {
      count,
      usesPerCode,
      expiresAt: expiresAt || undefined
    }
  });
}

export function getGeneration(generationId: string): Promise<GenerationStatus> {
  return request<GenerationStatus>({ url: `${API_BASE_URL}/api/generations/${generationId}`, method: "GET" });
}

export function getAiImage(aiImageId: string): Promise<AiImageStatus> {
  return request<AiImageStatus>({ url: `${API_BASE_URL}/api/ai-images/${aiImageId}`, method: "GET" });
}

export function aiImageUrl(aiImageId: string): string {
  return `${API_BASE_URL}/api/ai-images/${aiImageId}/image`;
}

