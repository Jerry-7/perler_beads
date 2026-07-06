/**
 * Image sampling using WeChat Canvas APIs.
 * Replaces PIL-based resampling from the Python backend.
 *
 * Supports three local sampling modes:
 *  - nearest: Canvas drawImage resize → direct pixel mapping (fastest)
 *  - coverage: Full-resolution region average pooling (most accurate)
 *  - center-shrink: Center 60% of each cell only (reduces edge artifacts)
 */
import type { Rgb } from "./types";

// wx is available globally in the WeChat Mini Program runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const wx: any;

/** Raw image pixel data from Canvas getImageData. */
export interface ImagePixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, row-major, 4 * width * height bytes
}

// ─── Image loading ────────────────────────────────────────────────────

/**
 * Load image pixels from a local file path.
 * Uses wx.createOffscreenCanvas for background processing.
 * Falls back to showing a toast if the base library is too old.
 */
export function loadImagePixels(imagePath: string): Promise<ImagePixelData> {
  if (typeof wx === "undefined" || typeof wx.createOffscreenCanvas !== "function") {
    return Promise.reject(
      new Error("当前微信版本过低，请升级后使用本地生成"),
    );
  }

  return new Promise((resolve, reject) => {
    const canvas = wx.createOffscreenCanvas({ type: "2d", width: 1, height: 1 });
    const ctx = canvas.getContext("2d");
    const img = canvas.createImage();

    img.onload = () => {
      // Limit max source dimension to 2048 to avoid memory issues
      let w = img.width;
      let h = img.height;
      const maxDim = 2048;
      if (Math.max(w, h) > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      resolve({
        width: w,
        height: h,
        data: new Uint8ClampedArray(imageData.data),
      });
    };

    img.onerror = (err: unknown) => {
      const errMsg =
        err && typeof err === "object" && "errMsg" in err
          ? String((err as Record<string, unknown>).errMsg)
          : "未知错误";
      reject(new Error(`图片加载失败: ${errMsg}`));
    };

    img.src = imagePath;
  });
}

// ─── Pixel access helpers ─────────────────────────────────────────────

function getPixel(img: ImagePixelData, x: number, y: number): Rgb {
  const offset = (y * img.width + x) * 4;
  return [img.data[offset]!, img.data[offset + 1]!, img.data[offset + 2]!];
}

// ─── Nearest-neighbor sampling ────────────────────────────────────────

/**
 * Nearest-neighbor: load full image, compute region average for each cell.
 * This gives the same quality as Canvas drawImage resize for most cases.
 */
export function sampleNearest(
  img: ImagePixelData,
  widthCells: number,
  heightCells: number,
): Rgb[][] {
  const result: Rgb[][] = [];

  for (let cy = 0; cy < heightCells; cy++) {
    const row: Rgb[] = [];
    // Map cell center to source pixel
    const srcY = Math.floor(((cy + 0.5) / heightCells) * img.height);

    for (let cx = 0; cx < widthCells; cx++) {
      const srcX = Math.floor(((cx + 0.5) / widthCells) * img.width);
      const clampedX = Math.min(img.width - 1, Math.max(0, srcX));
      const clampedY = Math.min(img.height - 1, Math.max(0, srcY));
      row.push(getPixel(img, clampedX, clampedY));
    }
    result.push(row);
  }

  return result;
}

// ─── Coverage (region average) sampling ───────────────────────────────

/**
 * Coverage sampling: for each target cell, compute the average RGB
 * of all source pixels that fall within the cell's projected region.
 * This is the most accurate sampling mode.
 */
export function sampleCoverage(
  img: ImagePixelData,
  widthCells: number,
  heightCells: number,
): Rgb[][] {
  const result: Rgb[][] = [];

  for (let cy = 0; cy < heightCells; cy++) {
    const row: Rgb[] = [];
    const srcTop = (cy / heightCells) * img.height;
    const srcBottom = ((cy + 1) / heightCells) * img.height;
    const y0 = Math.max(0, Math.floor(srcTop));
    const y1 = Math.min(img.height, Math.ceil(srcBottom));

    for (let cx = 0; cx < widthCells; cx++) {
      const srcLeft = (cx / widthCells) * img.width;
      const srcRight = ((cx + 1) / widthCells) * img.width;
      const x0 = Math.max(0, Math.floor(srcLeft));
      const x1 = Math.min(img.width, Math.ceil(srcRight));

      // Average all pixels in the region
      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const offset = (sy * img.width + sx) * 4;
          r += img.data[offset]!;
          g += img.data[offset + 1]!;
          b += img.data[offset + 2]!;
          count++;
        }
      }

      if (count > 0) {
        row.push([
          Math.round(r / count),
          Math.round(g / count),
          Math.round(b / count),
        ]);
      } else {
        // Degenerate cell — fall back to nearest pixel
        const sx = Math.min(img.width - 1, Math.floor(srcLeft));
        const sy = Math.min(img.height - 1, Math.floor(srcTop));
        row.push(getPixel(img, sx, sy));
      }
    }
    result.push(row);
  }

  return result;
}

// ─── Center-shrink sampling ───────────────────────────────────────────

/**
 * Center-shrink: only sample the inner 60% of each cell's region.
 * This reduces edge artifacts from neighboring cells.
 */
export function sampleCenterShrink(
  img: ImagePixelData,
  widthCells: number,
  heightCells: number,
): Rgb[][] {
  const shrinkRatio = 0.3; // shrink 30% from each side → inner 40%

  const result: Rgb[][] = [];

  for (let cy = 0; cy < heightCells; cy++) {
    const row: Rgb[] = [];
    const srcTop = (cy / heightCells) * img.height;
    const srcBottom = ((cy + 1) / heightCells) * img.height;
    const cellHeight = srcBottom - srcTop;
    const shrinkTop = srcTop + cellHeight * shrinkRatio;
    const shrinkBottom = srcBottom - cellHeight * shrinkRatio;
    const y0 = Math.max(0, Math.floor(shrinkTop));
    const y1 = Math.min(img.height, Math.ceil(shrinkBottom));

    for (let cx = 0; cx < widthCells; cx++) {
      const srcLeft = (cx / widthCells) * img.width;
      const srcRight = ((cx + 1) / widthCells) * img.width;
      const cellWidth = srcRight - srcLeft;
      const shrinkLeft = srcLeft + cellWidth * shrinkRatio;
      const shrinkRight = srcRight - cellWidth * shrinkRatio;
      const x0 = Math.max(0, Math.floor(shrinkLeft));
      const x1 = Math.min(img.width, Math.ceil(shrinkRight));

      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const offset = (sy * img.width + sx) * 4;
          r += img.data[offset]!;
          g += img.data[offset + 1]!;
          b += img.data[offset + 2]!;
          count++;
        }
      }

      if (count > 0) {
        row.push([
          Math.round(r / count),
          Math.round(g / count),
          Math.round(b / count),
        ]);
      } else {
        const sx = Math.min(img.width - 1, Math.floor(srcLeft));
        const sy = Math.min(img.height - 1, Math.floor(srcTop));
        row.push(getPixel(img, sx, sy));
      }
    }
    result.push(row);
  }

  return result;
}

// ─── Sampling mode dispatch ───────────────────────────────────────────

// ─── Pre-upload resize (avoids 413 errors) ──────────────────────────

/** Maximum dimension for uploaded images. Larger images are downscaled. */
const MAX_UPLOAD_DIMENSION = 1024;

/**
 * Resize an image to fit within MAX_UPLOAD_DIMENSION on the longest side,
 * then export as a temp file path suitable for wx.uploadFile.
 *
 * Images under the limit are returned unchanged.
 * This prevents 413 "Request Entity Too Large" errors from the server.
 */
export function resizeImageForUpload(imagePath: string): Promise<string> {
  if (typeof wx === "undefined" || typeof wx.createOffscreenCanvas !== "function") {
    // Fallback: return original path if canvas API unavailable
    return Promise.resolve(imagePath);
  }

  return new Promise((resolve, reject) => {
    const canvas = wx.createOffscreenCanvas({ type: "2d", width: 1, height: 1 });
    const ctx = canvas.getContext("2d");
    const img = canvas.createImage();

    img.onload = () => {
      const srcW = img.width;
      const srcH = img.height;

      // If image is already small enough, resolve with original path
      if (Math.max(srcW, srcH) <= MAX_UPLOAD_DIMENSION) {
        resolve(imagePath);
        return;
      }

      // Scale down proportionally
      const scale = MAX_UPLOAD_DIMENSION / Math.max(srcW, srcH);
      const destW = Math.round(srcW * scale);
      const destH = Math.round(srcH * scale);

      canvas.width = destW;
      canvas.height = destH;
      ctx.drawImage(img, 0, 0, destW, destH);

      // Export to temp file
      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: destW,
        height: destH,
        destWidth: destW,
        destHeight: destH,
        success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
        fail: (err: { errMsg?: string }) => {
          console.warn("[imageSampling] resize export failed, using original:", err);
          resolve(imagePath);
        },
      });
    };

    img.onerror = () => resolve(imagePath); // fallback to original
    img.src = imagePath;
  });
}

// ─── Sampling mode dispatch ───────────────────────────────────────────

/** Sampling modes supported by the frontend. */
export type FrontendSamplingMode = "nearest" | "coverage" | "center-shrink";

/** Check if a sampling mode can be handled locally. */
export function isLocalSamplingMode(mode: string): mode is FrontendSamplingMode {
  return mode === "nearest" || mode === "coverage" || mode === "center-shrink";
}

/**
 * Sample image pixels into a widthCells × heightCells grid
 * using the specified sampling strategy.
 */
export function sampleImage(
  img: ImagePixelData,
  widthCells: number,
  heightCells: number,
  mode: FrontendSamplingMode,
): Rgb[][] {
  switch (mode) {
    case "nearest":
      return sampleNearest(img, widthCells, heightCells);
    case "coverage":
      return sampleCoverage(img, widthCells, heightCells);
    case "center-shrink":
      return sampleCenterShrink(img, widthCells, heightCells);
  }
}
