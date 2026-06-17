import { aiImageUrl, createAiImage, type ColorComplexity, getAiImage, getGeneration, recommendPatternSize, uploadGeneration } from "../../utils/api";
import { AI_DETAIL_OPTIONS, DEFAULT_AI_DETAIL_INDEX, type AiDetail } from "../../utils/aiDetailOptions";
import {
  AI_EFFECT_3D_OPTIONS,
  AI_SHADING_OPTIONS,
  AI_STYLE_OPTIONS,
  DEFAULT_AI_EFFECT_3D_INDEX,
  DEFAULT_AI_MAX_COLORS,
  DEFAULT_AI_SHADING_INDEX,
  DEFAULT_AI_STYLE_INDEX,
  normalizeAiMaxColors,
  type AiEffect3d,
  type AiShading,
  type AiStyle
} from "../../utils/aiGenerationOptions";
import { calculatePreviewCanvasSize } from "../../utils/canvasSizing";
import { shouldDrawCellLabel } from "../../utils/patternDrawing";
import { previewPatternImage } from "../../utils/patternPreview";
import { applyPatternSizeOption, PATTERN_SIZE_OPTIONS } from "../../utils/patternSizeOptions";
import { saveImageWithAlbumPermission } from "../../utils/photoAlbum";
import { DEFAULT_SAMPLING_MODE_INDEX, SAMPLING_MODE_OPTIONS, type SamplingMode } from "../../utils/samplingModeOptions";
import type { BeadUsage, PatternResult, PatternSizeRecommendation } from "../../utils/types";
import { isEmptyCell } from "../../utils/types";

Page({
  data: {
    imagePath: "",
    widthCells: 52,
    heightCells: 52,
    patternSizeIndex: 0,
    patternSizeOptions: PATTERN_SIZE_OPTIONS,
    isCustomSize: false,
    isGenerating: false,
    isGeneratingAiImage: false,
    aiImageId: "",
    aiImagePath: "",
    isRecommendingSize: false,
    canGenerate: false,
    sizeRecommendationText: "",
    aiDetail: AI_DETAIL_OPTIONS[DEFAULT_AI_DETAIL_INDEX].value as AiDetail,
    aiDetailIndex: DEFAULT_AI_DETAIL_INDEX,
    aiDetailOptions: AI_DETAIL_OPTIONS,
    aiStyle: AI_STYLE_OPTIONS[DEFAULT_AI_STYLE_INDEX].value as AiStyle,
    aiStyleIndex: DEFAULT_AI_STYLE_INDEX,
    aiStyleOptions: AI_STYLE_OPTIONS,
    aiEffect3d: AI_EFFECT_3D_OPTIONS[DEFAULT_AI_EFFECT_3D_INDEX].value as AiEffect3d,
    aiEffect3dIndex: DEFAULT_AI_EFFECT_3D_INDEX,
    aiEffect3dOptions: AI_EFFECT_3D_OPTIONS,
    aiShading: AI_SHADING_OPTIONS[DEFAULT_AI_SHADING_INDEX].value as AiShading,
    aiShadingIndex: DEFAULT_AI_SHADING_INDEX,
    aiShadingOptions: AI_SHADING_OPTIONS,
    aiMaxColors: DEFAULT_AI_MAX_COLORS,
    colorComplexity: "balanced" as ColorComplexity,
    colorComplexityIndex: 2,
    colorComplexityOptions: [
      { label: "极简", value: "minimal" },
      { label: "少色", value: "simple" },
      { label: "均衡", value: "balanced" },
      { label: "细节", value: "detailed" },
      { label: "原色", value: "original" }
    ],
    samplingMode: SAMPLING_MODE_OPTIONS[DEFAULT_SAMPLING_MODE_INDEX].value as SamplingMode,
    samplingModeIndex: DEFAULT_SAMPLING_MODE_INDEX,
    samplingModeOptions: SAMPLING_MODE_OPTIONS,
    result: null as PatternResult | null,
    usage: [] as BeadUsage[],
    canvasCssWidth: 320,
    canvasCssHeight: 320
  },

  chooseImage() {
    const setSelectedImage = (path: string) => {
      this.setData({
        imagePath: path,
        aiImageId: "",
        aiImagePath: "",
        result: null,
        usage: [],
        canGenerate: true,
        sizeRecommendationText: ""
      });
      this.applyRecommendedSize(path);
    };

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (response) => {
          const file = response.tempFiles[0];
          if (file?.tempFilePath) {
            setSelectedImage(file.tempFilePath);
          }
        },
        fail: (error) => {
          wx.showToast({ title: error.errMsg || "选择图片失败", icon: "none" });
        }
      });
      return;
    }

    wx.chooseImage({
      count: 1,
      sourceType: ["album", "camera"],
      success: (response) => {
        const path = response.tempFilePaths[0];
        if (path) {
          setSelectedImage(path);
        }
      },
      fail: (error) => {
        wx.showToast({ title: error.errMsg || "选择图片失败", icon: "none" });
      }
    });
  },

  onWidthInput(event: WechatMiniprogram.Input) {
    this.setData({ widthCells: Number(event.detail.value) || 0 });
  },

  onHeightInput(event: WechatMiniprogram.Input) {
    this.setData({ heightCells: Number(event.detail.value) || 0 });
  },

  onPatternSizeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const nextSize = applyPatternSizeOption(index, this.data.widthCells, this.data.heightCells);
    this.setData({
      patternSizeIndex: index,
      widthCells: nextSize.widthCells,
      heightCells: nextSize.heightCells,
      isCustomSize: nextSize.isCustomSize
    });
  },

  onColorComplexityChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.colorComplexityOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      colorComplexity: option.value as ColorComplexity,
      colorComplexityIndex: index
    });
  },

  onSamplingModeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.samplingModeOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      samplingMode: option.value,
      samplingModeIndex: index
    });
  },

  onAiDetailChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiDetailOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      aiDetail: option.value,
      aiDetailIndex: index
    });
  },

  onAiStyleChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiStyleOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      aiStyle: option.value,
      aiStyleIndex: index
    });
  },

  onAiEffect3dChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiEffect3dOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      aiEffect3d: option.value,
      aiEffect3dIndex: index
    });
  },

  onAiShadingChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiShadingOptions[index];
    if (!option) {
      return;
    }
    this.setData({
      aiShading: option.value,
      aiShadingIndex: index
    });
  },

  onAiMaxColorsInput(event: WechatMiniprogram.Input) {
    this.setData({ aiMaxColors: normalizeAiMaxColors(Number(event.detail.value)) });
  },

  async applyRecommendedSize(imagePath: string) {
    this.setData({ isRecommendingSize: true });
    try {
      const recommendation = await recommendPatternSize(imagePath);
      if (this.data.imagePath !== imagePath) {
        return;
      }
      const nextData: Record<string, string | number> = {
        sizeRecommendationText: this.formatSizeRecommendation(recommendation)
      };
      if (this.data.isCustomSize) {
        nextData.widthCells = recommendation.widthCells;
        nextData.heightCells = recommendation.heightCells;
      }
      this.setData(nextData);
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "推荐尺寸失败", icon: "none" });
    } finally {
      if (this.data.imagePath === imagePath) {
        this.setData({ isRecommendingSize: false });
      }
    }
  },

  formatSizeRecommendation(recommendation: PatternSizeRecommendation) {
    const blockSize =
      recommendation.detectedBlockWidth && recommendation.detectedBlockHeight
        ? `，识别到 ${recommendation.detectedBlockWidth} x ${recommendation.detectedBlockHeight} 像素块`
        : "";
    return `推荐 ${recommendation.widthCells} x ${recommendation.heightCells}（原图 ${recommendation.sourceWidth} x ${recommendation.sourceHeight}${blockSize}）`;
  },

  async generateAiImage() {
    const {
      imagePath,
      widthCells,
      heightCells,
      aiDetail,
      aiStyle,
      aiEffect3d,
      aiShading,
      aiMaxColors
    } = this.data;
    if (!imagePath || widthCells < 1 || heightCells < 1) {
      wx.showToast({ title: "请先选择图片和格数", icon: "none" });
      return;
    }

    this.setData({ isGeneratingAiImage: true });
    try {
      const created = await createAiImage({
        imagePath,
        widthCells,
        heightCells,
        aiDetail,
        aiStyle,
        aiEffect3d,
        aiShading,
        aiMaxColors
      });
      const completed = await this.waitForAiImage(created.aiImageId);
      if (completed.status !== "completed" || !completed.imageUrl) {
        throw new Error(completed.error || "AI 生图失败");
      }
      this.setData({
        aiImageId: completed.aiImageId,
        aiImagePath: aiImageUrl(completed.aiImageId),
        result: null,
        usage: []
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "AI 生图失败", icon: "none" });
    } finally {
      this.setData({ isGeneratingAiImage: false });
    }
  },

  async generatePattern() {
    const { aiImageId, widthCells, heightCells, colorComplexity, samplingMode, aiMaxColors } = this.data;
    if (!aiImageId || widthCells < 1 || heightCells < 1) {
      wx.showToast({ title: "请先生成满意的 AI 图片", icon: "none" });
      return;
    }

    this.setData({ isGenerating: true });
    try {
      const created = await uploadGeneration({
        aiImageId,
        widthCells,
        heightCells,
        sourceMode: "resample",
        colorComplexity,
        samplingMode,
        aiMaxColors
      });
      const completed = await this.waitForGeneration(created.generationId);
      if (completed.status !== "completed" || !completed.result) {
        throw new Error(completed.error || "生成失败");
      }

      const canvasSize = calculatePreviewCanvasSize(completed.result, wx.getSystemInfoSync().windowWidth);
      this.setData({
        result: completed.result,
        usage: completed.result.usage,
        canvasCssWidth: canvasSize.width,
        canvasCssHeight: canvasSize.height
      });

      wx.nextTick(() => {
        this.drawPattern(false);
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "生成失败", icon: "none" });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  waitForGeneration(generationId: string) {
    return new Promise<Awaited<ReturnType<typeof getGeneration>>>((resolve, reject) => {
      const poll = async () => {
        try {
          const generation = await getGeneration(generationId);
          if (generation.status === "completed" || generation.status === "failed") {
            resolve(generation);
            return;
          }
          setTimeout(poll, 700);
        } catch (error) {
          reject(error);
        }
      };
      poll();
    });
  },

  drawPattern(forExport: boolean, done?: (tempFilePath?: string) => void) {
    const result = this.data.result;
    if (!result) {
      done?.();
      return;
    }

    const query = wx.createSelectorQuery();
    query
      .select("#patternCanvas")
      .fields({ node: true, size: true })
      .exec((response) => {
        const canvas = response[0]?.node as WechatMiniprogram.Canvas | undefined;
        if (!canvas) {
          done?.();
          return;
        }

        const exportCellSize = 36;
        const cssCellSize = this.data.canvasCssWidth / result.widthCells;
        const cellSize = forExport ? exportCellSize : cssCellSize;
        const width = result.widthCells * cellSize;
        const height = result.heightCells * cellSize;
        const pixelRatio = forExport ? 2 : wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;

        const context = canvas.getContext("2d");
        context.scale(pixelRatio, pixelRatio);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.textAlign = "center";
        context.textBaseline = "middle";
        const drawLabels = shouldDrawCellLabel(cellSize, forExport);
        if (drawLabels) {
          context.font = `${Math.max(8, Math.floor(cellSize * 0.38))}px sans-serif`;
        }

        for (const row of result.cells) {
          for (const cell of row) {
            const x = cell.x * cellSize;
            const y = cell.y * cellSize;
            if (isEmptyCell(cell)) {
              context.fillStyle = "#f8fafc";
              context.fillRect(x, y, cellSize, cellSize);
            } else {
              context.fillStyle = `rgb(${cell.beadRgb[0]}, ${cell.beadRgb[1]}, ${cell.beadRgb[2]})`;
              context.fillRect(x, y, cellSize, cellSize);
              if (drawLabels) {
                context.fillStyle = this.textColorFor(cell.beadRgb);
                context.fillText(cell.beadCode, x + cellSize / 2, y + cellSize / 2);
              }
            }
            context.strokeStyle = "#cbd5e1";
            context.lineWidth = 0.5;
            context.strokeRect(x, y, cellSize, cellSize);
          }
        }

        if (forExport) {
          wx.canvasToTempFilePath({
            canvas,
            width,
            height,
            destWidth: width * pixelRatio,
            destHeight: height * pixelRatio,
            success: (res) => done?.(res.tempFilePath),
            fail: () => done?.()
          });
        } else {
          done?.();
        }
      });
  },

  textColorFor(rgb: [number, number, number]) {
    const luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return luminance > 150 ? "#111827" : "#ffffff";
  },

  waitForAiImage(aiImageId: string) {
    return new Promise<Awaited<ReturnType<typeof getAiImage>>>((resolve, reject) => {
      const poll = async () => {
        try {
          const aiImage = await getAiImage(aiImageId);
          if (aiImage.status === "completed" || aiImage.status === "failed") {
            resolve(aiImage);
            return;
          }
          setTimeout(poll, 700);
        } catch (error) {
          reject(error);
        }
      };
      poll();
    });
  },

  previewPattern() {
    this.drawPattern(true, (tempFilePath) => {
      if (!previewPatternImage(wx, tempFilePath)) {
        wx.showToast({ title: "预览失败", icon: "none" });
      }
    });
  },

  exportPng() {
    this.drawPattern(true, async (tempFilePath) => {
      if (!tempFilePath) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }
      const result = await saveImageWithAlbumPermission(wx, tempFilePath);
      if (result === "saved") {
        wx.showToast({ title: "已保存图片", icon: "success" });
        return;
      }
      if (result === "needs-settings") {
        wx.showToast({ title: "请在设置中允许保存相册", icon: "none" });
        return;
      }
      wx.showToast({ title: "保存失败，请检查权限", icon: "none" });
    });
  }
});
