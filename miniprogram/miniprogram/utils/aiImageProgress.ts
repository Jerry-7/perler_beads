import type { AiImageStatus } from "./types";

export function nextAiImageProgress(current: number, status: AiImageStatus["status"]): number {
  if (status === "completed") {
    return 100;
  }
  if (status === "failed") {
    return 0;
  }
  return Math.min(90, current + 8);
}

export function aiImageProgressText(status: AiImageStatus["status"], progress: number): string {
  if (status === "completed") {
    return "AI 图已生成";
  }
  if (status === "failed") {
    return "AI 生图失败";
  }
  if (progress < 25) {
    return "正在上传图片";
  }
  if (progress < 55) {
    return "AI 已接收任务";
  }
  return "AI 生成中";
}
