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
import { aiImageProgressText, nextAiImageProgress } from "../../utils/aiImageProgress";
import { getStoredAccessCode } from "../../utils/accessCode";
import { aiImageUrl, createAiImage, getAccessKeySummary, getAiImage, getGeneration, getPalette, recommendPatternSize, uploadGeneration, type ColorComplexity } from "../../utils/api";
import { calculateExportCellSize, calculatePreviewCanvasSize, calculateZoomedCanvasSize, EXPORT_MAX_CANVAS_SIDE_PX } from "../../utils/canvasSizing";
import {
  applyEditorPatch,
  createEditorPatchHistory,
  floodFillPattern,
  getCellFromEditorTouchPoint,
  getEditorTouchDistance,
  pushEditorPatchHistory,
  redoEditorPatchHistory,
  resolveEditorTouchPoint,
  undoEditorPatchHistory,
  type EditorCellPatch,
  type EditorPatch,
  type EditorPatchHistory,
  type EditorPatchType
} from "../../utils/patternCanvasEditor";
import { shouldDrawCellLabel } from "../../utils/patternDrawing";
import { decodeRleRows, filterPaletteColors } from "../../utils/patternEditing";
import { previewPatternImage } from "../../utils/patternPreview";
import { applyPatternSizeOption, PATTERN_SIZE_OPTIONS } from "../../utils/patternSizeOptions";
import { buildPatternSizeWarning } from "../../utils/patternSizeWarning";
import { formatTraceCellStatus, getCanvasPointFromEvent, getPatternCellFromPoint, type CanvasPointEvent } from "../../utils/patternTracing";
import { saveImageWithAlbumPermission } from "../../utils/photoAlbum";
import { AI_ACCESS_ROUTE } from "../../utils/routes";
import { DEFAULT_SAMPLING_MODE_INDEX, SAMPLING_MODE_OPTIONS, type SamplingMode } from "../../utils/samplingModeOptions";
import type { AccessKeySummary, BeadCell, BeadUsage, PaletteColor, PatternCell, PatternResult, PatternSizeRecommendation, RawColorCell, Rgb } from "../../utils/types";
import { isBeadCell, isEmptyCell } from "../../utils/types";

type PatternSource = "original" | "ai";
type ActiveTool = "home" | "ai" | "pattern";
type MarkedCells = Record<string, boolean>;
type EditSelection = { row: number; col: number; key: string } | null;
type EditCandidateColor = PaletteColor & { count?: number; countLabel: string };
type EditorTool = "pan" | "point" | "paint" | "picker" | "fill";
type EditorTouchMode = "idle" | "pan" | "paint" | "pinch";
type EditorTouchPoint = { pageX?: number; pageY?: number; clientX?: number; clientY?: number; x?: number; y?: number };
type EditorTouchSnapshot = { touches: EditorTouchPoint[]; changedTouches: EditorTouchPoint[] };
let editorHistoryCache: EditorPatchHistory | null = null;
let editorStrokeKeysCache: MarkedCells = {};
let editorDrawPending = false;
let editorStrokeDirty = false;
let editorCanvasCache: { canvas: WechatMiniprogram.Canvas; context: CanvasContextLike; width: number; height: number; pixelRatio: number } | null = null;
let editorStrokePatchCache: EditorPatch | null = null;
let editorRulerCache: { translateX: number; translateY: number; scale: number } | null = null;

type CanvasContextLike = {
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  stroke(): void;
  fillText(text: string, x: number, y: number): void;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  lineCap: string;
  lineJoin: string;
};

function formatAiAccessSummary(summary: AccessKeySummary | null): string {
  if (!summary) {
    return "请先添加 AI 权限码";
  }
  return summary.canGenerateAi ? `权限码剩余 ${summary.remainingUses} 次` : `权限码${summary.status}`;
}
Page({
  data: {
    // 当前激活的工具/视图。可选值："home"(首页), "ai"(AI生图), "pattern"(图纸制作)
    activeTool: "home" as ActiveTool,
    imagePath: "",
    widthCells: 52,
    heightCells: 52,
    patternSizeIndex: 0,
    patternSizeOptions: PATTERN_SIZE_OPTIONS,
    isCustomSize: false,
    isGenerating: false,
    isGeneratingAiImage: false,
    aiImageProgress: 0,
    aiImageProgressText: "",
    aiImageId: "",
    aiImagePath: "",
    aiAccessText: "请先添加 AI 权限码",
    aiRemainingQuota: 0,
    isLoadingAiAccess: false,
    patternSource: "original" as PatternSource,
    isRecommendingSize: false,
    canGenerate: false,
    sizeRecommendationText: "",
    recommendedSizeText: "-",
    recommendedColors: 0,
    recommendedWidthCells: 0,
    recommendedHeightCells: 0,
    patternSizeWarning: "",
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
    colorComplexity: "balanced" as ColorComplexity,
    patternMaxColors: DEFAULT_AI_MAX_COLORS as number,
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
    clusterQuantile: 0.2,
    clusterQuantileSlider: 20,
    clusterEps: 30,
    result: null as PatternResult | null,
    usage: [] as BeadUsage[],
    resultBeadCount: 0,
    paletteColors: [] as PaletteColor[],
    baseCanvasCssWidth: 320,
    baseCanvasCssHeight: 320,
    canvasCssWidth: 320,
    canvasCssHeight: 320,
    patternZoom: 1,
    patternZoomText: "100%",
    patternMinZoom: 1,
    patternMaxZoom: 5,
    pinchStartDistance: 0,
    pinchStartZoom: 1,
    isTracingMode: false,
    isEditingMode: false,
    traceMarkEnabled: false,
    traceStatusText: "未选择格子",
    hoveredTraceCellKey: "",
    editorGuideCellKey: "",
    markedTraceCells: {} as MarkedCells,
    selectedEditCell: null as EditSelection,
    selectedEditCellText: "",
    editPopoverWidth: 280,
    editPopoverHeight: 360,
    editSearchQuery: "",
    editSearchResults: [] as PaletteColor[],
    editPaletteDropdownOpen: false,
    editCandidateColors: [] as EditCandidateColor[],
    isBatchEditingMode: false,
    selectedBatchEditColor: null as PaletteColor | null,
    selectedBatchEditColorText: "未选择颜色",
    // 当前选用的编辑工具。可选："pan"(平移), "point"(单点改色), "paint"(连涂), "picker"(吸管), "fill"(油漆桶填充)
    editorTool: "pan" as EditorTool,
    editorStatusText: "浏览图纸",

    // 当前选定的画笔颜色及其描述
    activeEditColor: null as PaletteColor | null,
    activeEditColorText: "选择颜色",

    highlightedBeadCode: "",
    replaceTargetCode: "",
    candidateScrollInto: "",
    editorCanvasCssWidth: 320,
    editorCanvasCssHeight: 420,
    editorCanvasRectLeft: 0,
    editorCanvasRectTop: 0,
    editorRulerSize: 24,
    editorBaseCellSize: 12,
    editorScale: 1,
    editorScaleText: "100%",
    editorTranslateX: 0,
    editorTranslateY: 0,
    editorTouchMode: "idle" as EditorTouchMode,
    editorTouchStartX: 0,
    editorTouchStartY: 0,
    editorStartTranslateX: 0,
    editorStartTranslateY: 0,
    editorPinchStartDistance: 0,
    editorPinchStartScale: 1,
    editorUndoCount: 0,
    editorRedoCount: 0
  },

  onLoad() {
    this.loadPaletteColors();
  },

  onShow() {
    if (this.data.activeTool === "ai") {
      this.refreshAiAccessSummary(true);
    }
  },

  // 加载调色板颜色
  async loadPaletteColors() {
    try {
      const response = await getPalette();
      this.setData({ paletteColors: response.colors.filter((color) => color.enabled) });
    } catch {
      wx.showToast({ title: "色号加载失败", icon: "none" });
    }
  },

  openAiTool() {
    this.setData({ activeTool: "ai", aiAccessText: "正在读取权益" });
    this.refreshAiAccessSummary(true);
  },

  openAiAccessPage() {
    wx.navigateTo({ url: AI_ACCESS_ROUTE });
  },

  openPatternTool() {
    this.setData({ activeTool: "pattern" });
  },

  backToToolHome() {
    this.setData({ activeTool: "home" });
  },

  chooseImage() {
    const setSelectedImage = (path: string) => {
      this.setData({
        imagePath: path,
        aiImageId: "",
        aiImagePath: "",
        patternSource: "original",
        result: null,
        usage: [],
        resultBeadCount: 0,
        isTracingMode: false,
        isEditingMode: false,
        traceMarkEnabled: false,
        traceStatusText: "未选择格子",
        hoveredTraceCellKey: "",
        editorGuideCellKey: "",
        markedTraceCells: {},
        selectedEditCell: null,
        selectedEditCellText: "",
        editSearchQuery: "",
        editSearchResults: [],
        editPaletteDropdownOpen: false,
        editCandidateColors: [],
        isBatchEditingMode: false,
        selectedBatchEditColor: null,
        selectedBatchEditColorText: "未选择颜色",
        canGenerate: true,
        sizeRecommendationText: "",
        recommendedSizeText: "-",
        recommendedColors: 0,
        recommendedWidthCells: 0,
        recommendedHeightCells: 0,
        patternSizeWarning: ""
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
    this.setData({ widthCells: Number(event.detail.value) || 0 }, () => {
      this.refreshPatternSizeWarning();
    });
  },

  onHeightInput(event: WechatMiniprogram.Input) {
    this.setData({ heightCells: Number(event.detail.value) || 0 }, () => {
      this.refreshPatternSizeWarning();
    });
  },

  onPatternSizeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const nextSize = applyPatternSizeOption(index, this.data.widthCells, this.data.heightCells);
    this.setData({
      patternSizeIndex: index,
      widthCells: nextSize.widthCells,
      heightCells: nextSize.heightCells,
      isCustomSize: nextSize.isCustomSize
    }, () => {
      this.refreshPatternSizeWarning();
    });
  },

  onColorComplexityChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.colorComplexityOptions[index];
    if (option) {
      this.setData({ colorComplexity: option.value as ColorComplexity, colorComplexityIndex: index });
    }
  },

  onSamplingModeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.samplingModeOptions[index];
    if (option) {
      this.setData({ samplingMode: option.value, samplingModeIndex: index });
    }
  },

  onClusterQuantileChange(event: WechatMiniprogram.SliderChange) {
    const sliderValue = event.detail.value;
    this.setData({
      clusterQuantileSlider: sliderValue,
      clusterQuantile: Number((sliderValue / 100).toFixed(2))
    });
  },

  onClusterEpsChange(event: WechatMiniprogram.SliderChange) {
    this.setData({ clusterEps: event.detail.value });
  },

  selectOriginalPatternSource() {
    this.setData({ patternSource: "original" });
  },

  selectAiPatternSource() {
    if (!this.data.aiImageId) {
      wx.showToast({ title: "请先生成 AI 图", icon: "none" });
      return;
    }
    this.setData({ patternSource: "ai" });
  },

  onAiDetailChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiDetailOptions[index];
    if (option) {
      this.setData({ aiDetail: option.value, aiDetailIndex: index });
    }
  },

  onAiStyleChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiStyleOptions[index];
    if (option) {
      this.setData({ aiStyle: option.value, aiStyleIndex: index });
    }
  },

  onAiEffect3dChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiEffect3dOptions[index];
    if (option) {
      this.setData({ aiEffect3d: option.value, aiEffect3dIndex: index });
    }
  },

  onAiShadingChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.detail.value) || 0;
    const option = this.data.aiShadingOptions[index];
    if (option) {
      this.setData({ aiShading: option.value, aiShadingIndex: index });
    }
  },

  onPatternMaxColorsChange(event: WechatMiniprogram.SliderChange) {
    this.setData({ patternMaxColors: event.detail.value });
  },

  async applyRecommendedSize(imagePath: string) {
    this.setData({ isRecommendingSize: true });
    try {
      // 等待后端计算推荐尺寸
      const recommendation = await recommendPatternSize(imagePath);
      if (this.data.imagePath !== imagePath) {
        return;
      }
      const nextData: Record<string, string | number> = {
        sizeRecommendationText: this.formatSizeRecommendation(recommendation),
        recommendedSizeText: `${recommendation.widthCells} x ${recommendation.heightCells}`,
        recommendedColors: recommendation.recommendedColors,
        recommendedWidthCells: recommendation.widthCells,
        recommendedHeightCells: recommendation.heightCells,
        patternMaxColors: recommendation.recommendedColors
      };
      if (this.data.isCustomSize) {
        nextData.widthCells = recommendation.widthCells;
        nextData.heightCells = recommendation.heightCells;
      }
      this.setData(nextData, () => {
        this.refreshPatternSizeWarning();
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "推荐参数失败", icon: "none" });
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
    return `推荐 ${recommendation.widthCells} x ${recommendation.heightCells}，推荐颜色数 ${recommendation.recommendedColors}（源图 ${recommendation.sourceWidth} x ${recommendation.sourceHeight}${blockSize}）`;
  },

  applyRecommendedPatternSize() {
    const { recommendedWidthCells, recommendedHeightCells, recommendedColors } = this.data;
    if (!recommendedWidthCells || !recommendedHeightCells) {
      wx.showToast({ title: "暂无推荐参数", icon: "none" });
      return;
    }
    this.setData(
      {
        widthCells: recommendedWidthCells,
        heightCells: recommendedHeightCells,
        patternMaxColors: recommendedColors || this.data.patternMaxColors,
        isCustomSize: true,
        patternSizeIndex: this.data.patternSizeOptions.length - 1
      },
      () => {
        this.refreshPatternSizeWarning();
      }
    );
  },


  async refreshAiAccessSummary(silent = false): Promise<AccessKeySummary | null> {
    if (!silent) {
      this.setData({ isLoadingAiAccess: true, aiAccessText: "正在校验权限码" });
    }
    try {
      const accessCode = getStoredAccessCode();
      if (!accessCode) {
        this.setData({ aiAccessText: "请先添加 AI 权限码", aiRemainingQuota: 0 });
        return null;
      }
      const summary = await getAccessKeySummary(accessCode);
      this.setData({
        aiAccessText: formatAiAccessSummary(summary),
        aiRemainingQuota: summary.remainingUses
      });
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : "权限码校验失败";
      if (!silent) {
        wx.showToast({ title: message, icon: "none" });
      }
      this.setData({ aiAccessText: "权限码不可用", aiRemainingQuota: 0 });
      return null;
    } finally {
      if (!silent) {
        this.setData({ isLoadingAiAccess: false });
      }
    }
  },

  async ensureAiGenerationAccess(): Promise<boolean> {
    const summary = await this.refreshAiAccessSummary(false);
    if (!summary || !summary.canGenerateAi) {
      wx.navigateTo({ url: AI_ACCESS_ROUTE });
      return false;
    }
    const content = `当前权限码剩余 ${summary.remainingUses} 次，本次成功生成后将扣除 1 次。`;
    return new Promise((resolve) => {
      wx.showModal({
        title: "确认生成 AI 图",
        content,
        confirmText: "继续生成",
        cancelText: "取消",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false)
      });
    });
  },
  refreshPatternSizeWarning() {
    this.setData({
      patternSizeWarning: buildPatternSizeWarning({
        widthCells: this.data.widthCells,
        heightCells: this.data.heightCells,
        recommendedWidthCells: this.data.recommendedWidthCells,
        recommendedHeightCells: this.data.recommendedHeightCells
      })
    });
  },

  async generateAiImage() {
    const { imagePath, widthCells, heightCells, aiDetail, aiStyle, aiEffect3d, aiShading } = this.data;
    if (!imagePath || widthCells < 1 || heightCells < 1) {
      wx.showToast({ title: "请先上传图片", icon: "none" });
      return;
    }

    const canGenerateAi = await this.ensureAiGenerationAccess();
    if (!canGenerateAi) {
      return;
    }

    this.setData({
      isGeneratingAiImage: true,
      aiImageProgress: 12,
      aiImageProgressText: aiImageProgressText("pending", 12)
    });
    try {
      const accessCode = getStoredAccessCode();
      const created = await createAiImage({
        imagePath,
        widthCells,
        heightCells,
        aiDetail,
        aiStyle,
        aiEffect3d,
        aiShading,
        accessCode
      });
      const submittedProgress = nextAiImageProgress(20, created.status);
      this.setData({
        aiImageId: created.aiImageId,
        aiImageProgress: submittedProgress,
        aiImageProgressText: aiImageProgressText(created.status, submittedProgress)
      });
      const completed = await this.waitForAiImage(created.aiImageId);
      if (completed.status !== "completed" || !completed.imageUrl) {
        throw new Error(completed.error || "AI 生图失败");
      }
      this.setData({
        aiImageId: completed.aiImageId,
        aiImagePath: aiImageUrl(completed.aiImageId),
        patternSource: "ai",
        aiImageProgress: 100,
        aiImageProgressText: aiImageProgressText("completed", 100),
        result: null,
        usage: [],
        resultBeadCount: 0,
        isEditingMode: false,
        selectedEditCell: null,
        selectedEditCellText: "",
        editSearchQuery: "",
        editSearchResults: [],
        editPaletteDropdownOpen: false,
        editCandidateColors: [],
        isBatchEditingMode: false,
        selectedBatchEditColor: null,
        selectedBatchEditColorText: "未选择颜色"
      });
      this.refreshAiAccessSummary(true);
    } catch (error) {
      this.setData({
        aiImageProgress: 0,
        aiImageProgressText: aiImageProgressText("failed", 0)
      });
      wx.showToast({ title: error instanceof Error ? error.message : "AI 生图失败", icon: "none" });
    } finally {
      this.setData({ isGeneratingAiImage: false });
    }
  },

  useAiImageForPattern() {
    if (!this.data.aiImageId) {
      wx.showToast({ title: "请先生成 AI 图", icon: "none" });
      return;
    }
    this.setData({
      activeTool: "pattern",
      patternSource: "ai",
      result: null,
      usage: [],
      resultBeadCount: 0,
      isTracingMode: false,
      isEditingMode: false,
      traceMarkEnabled: false,
      traceStatusText: "未选择格子",
      hoveredTraceCellKey: "",
      editorGuideCellKey: "",
      markedTraceCells: {},
      selectedEditCell: null,
      selectedEditCellText: "",
      editSearchQuery: "",
      editSearchResults: [],
      editPaletteDropdownOpen: false,
      editCandidateColors: [],
      isBatchEditingMode: false,
      selectedBatchEditColor: null,
      selectedBatchEditColorText: "未选择颜色"
    });
  },

  async generatePattern() {
    const { imagePath, aiImageId, patternSource, widthCells, heightCells, colorComplexity, samplingMode, patternMaxColors, clusterQuantile, clusterEps } = this.data;
    const normalizedMaxColors = normalizeAiMaxColors(patternMaxColors);
    if (widthCells < 1 || heightCells < 1) {
      wx.showToast({ title: "请输入有效格数", icon: "none" });
      return;
    }
    if (patternSource === "ai" && !aiImageId) {
      wx.showToast({ title: "请先生成 AI 图", icon: "none" });
      return;
    }
    if (patternSource === "original" && !imagePath) {
      wx.showToast({ title: "请先上传图片", icon: "none" });
      return;
    }

    this.setData({ isGenerating: true });
    try {
      const created = await uploadGeneration({
        aiImageId: patternSource === "ai" ? aiImageId : undefined,
        imagePath: patternSource === "original" ? imagePath : undefined,
        widthCells,
        heightCells,
        sourceMode: "resample",
        colorComplexity,
        samplingMode,
        aiMaxColors: normalizedMaxColors,
        clusterQuantile,
        clusterEps,
      });
      const completed = await this.waitForGeneration(created.generationId);
      if (completed.status !== "completed" || !completed.result) {
        throw new Error(completed.error || "图纸生成失败");
      }

      const completedResult = completed.result as PatternResult & { cells?: PatternCell[][] | null };
      if (!completedResult.cells && completedResult.rleRows) {
        const usageMap = new Map(completedResult.usage.map((u) => [u.beadCode, u]));
        completedResult.cells = decodeRleRows(
          completedResult.rleRows,
          completedResult.widthCells,
          completedResult.heightCells,
          usageMap
        );
      }
      if (!completedResult.cells) {
        throw new Error("图纸数据缺少格子信息");
      }
      const result = completedResult as PatternResult;

      const canvasSize = calculatePreviewCanvasSize(result, wx.getSystemInfoSync().windowWidth);
      const resultBeadCount = this.calculateUsageTotal(result.usage);
      this.setData({
        result,
        usage: result.usage,
        resultBeadCount,
        baseCanvasCssWidth: canvasSize.width,
        baseCanvasCssHeight: canvasSize.height,
        canvasCssWidth: canvasSize.width,
        canvasCssHeight: canvasSize.height,
        patternZoom: 1,
        patternZoomText: "100%",
        pinchStartDistance: 0,
        pinchStartZoom: 1,
        isTracingMode: false,
        isEditingMode: false,
        traceMarkEnabled: false,
        traceStatusText: "未选择格子",
        hoveredTraceCellKey: "",
        editorGuideCellKey: "",
        markedTraceCells: {},
        selectedEditCell: null,
        selectedEditCellText: "",
        editSearchQuery: "",
        editSearchResults: [],
        editPaletteDropdownOpen: false,
        editCandidateColors: [],
        isBatchEditingMode: false,
        selectedBatchEditColor: null,
        selectedBatchEditColorText: "未选择颜色"
      });
      wx.nextTick(() => {
        this.drawPattern(false);
      });
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "图纸生成失败", icon: "none" });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  calculateUsageTotal(usage: BeadUsage[]) {
    return usage.reduce((total, item) => total + item.count, 0);
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

  toggleTracingMode() {
    const nextTracingMode = !this.data.isTracingMode;
    this.setData({
      isTracingMode: nextTracingMode,
      isEditingMode: false,
      traceStatusText: nextTracingMode ? "悬停格子查看色号" : "未选择格子",
      hoveredTraceCellKey: nextTracingMode ? this.data.hoveredTraceCellKey : ""
    });
    wx.nextTick(() => {
      this.drawPattern(false);
    });
  },

  toggleTraceMarkEnabled(event?: { detail?: { value?: boolean } }) {
    const nextEnabled = typeof event?.detail?.value === "boolean" ? event.detail.value : !this.data.traceMarkEnabled;
    this.setData({ traceMarkEnabled: nextEnabled });
  },

  toggleEditingMode() {
    const nextEditingMode = !this.data.isEditingMode;
    this.setData({
      isEditingMode: nextEditingMode,
      isTracingMode: false,
      hoveredTraceCellKey: "",
      editorGuideCellKey: "",
      traceStatusText: "未选择格子",
      selectedEditCell: null,
      selectedEditCellText: "",
      editSearchQuery: "",
      editSearchResults: [],
      editPaletteDropdownOpen: false,
      editCandidateColors: [],
      isBatchEditingMode: false,
      selectedBatchEditColor: null,
      selectedBatchEditColorText: "未选择颜色"
    });
    wx.nextTick(() => {
      if (nextEditingMode) {
        this.initializeEditorCanvas();
        wx.nextTick(() => {
          this.refreshEditorCanvasRect(() => this.drawEditorCanvas());
        });
        return;
      }
      this.drawPattern(false);
    });
  },

  zoomPatternIn() {
    this.applyPatternZoom(this.data.patternZoom + 0.5);
  },

  zoomPatternOut() {
    this.applyPatternZoom(this.data.patternZoom - 0.5);
  },

  resetPatternZoom() {
    this.applyPatternZoom(1);
  },

  applyPatternZoom(nextZoom: number) {
    const zoom = this.clampPatternZoom(nextZoom);
    const zoomedSize = calculateZoomedCanvasSize(
      { width: this.data.baseCanvasCssWidth, height: this.data.baseCanvasCssHeight },
      zoom
    );
    this.setData({
      patternZoom: zoom,
      patternZoomText: `${Math.round(zoom * 100)}%`,
      canvasCssWidth: zoomedSize.width,
      canvasCssHeight: zoomedSize.height
    });
    wx.nextTick(() => {
      this.drawPattern(false);
    });
  },

  onPatternTouchStart(event: CanvasPointEvent) {
    console.warn('🖱️ onPatternTouchStart triggered!'); // 用 warn 更容易看到
    console.log('event:', event);
    if (event.touches?.length === 2) {
      const distance = this.getTouchDistance(event.touches as unknown as EditorTouchPoint[]);
      this.setData({
        pinchStartDistance: distance,
        pinchStartZoom: this.data.patternZoom
      });
      return;
    }

    this.updateTraceCellFromEvent(event, false);
  },

  onPatternPointerMove(event: CanvasPointEvent) {
    console.warn('🖱️ onPatternPointerMove triggered!'); // 用 warn 更容易看到
    console.log('event:', event);
    this.updateTraceCellFromEvent(event, false);
  },

  onPatternTap(event: CanvasPointEvent) {
    if (this.data.isEditingMode) {
      return;
    }
    this.updateTraceCellFromEvent(event, true);
  },

  onPatternTouchMove(event: CanvasPointEvent) {
    console.warn('🖱️ onPatternTouchMove triggered!'); // 用 warn 更容易看到
    console.log('event:', event);
    if (event.touches?.length === 2 && this.data.pinchStartDistance > 0) {
      const distance = this.getTouchDistance(event.touches as unknown as EditorTouchPoint[]);
      const ratio = distance / this.data.pinchStartDistance;
      this.applyPatternZoom(this.data.pinchStartZoom * ratio);
      return;
    }
    if (this.data.isEditingMode) {
      return;
    }
    this.updateTraceCellFromEvent(event, true);
  },

  onPatternTouchEnd(event: CanvasPointEvent) {
    console.warn('🖱️ onPatternTouchMove triggered!'); // 用 warn 更容易看到
    console.log('event:', event);
    if (this.data.pinchStartDistance > 0) {
      this.setData({
        pinchStartDistance: 0,
        pinchStartZoom: this.data.patternZoom
      });
      return;
    }
    if (this.data.isEditingMode) {
      return;
    }
  },

  onEditorToolTap(event: WechatMiniprogram.TouchEvent) {
    const tool = event.currentTarget.dataset.tool as EditorTool | undefined;
    if (!tool) {
      return;
    }
    const statusByTool: Record<EditorTool, string> = {
      pan: "移动：单指拖动画布，双指缩放",
      point: "单点：点击一个格子改色",
      paint: "连涂：拖过格子连续改色",
      picker: "吸色：点击格子选取颜色",
      fill: "填充：点击连通区域替换颜色"
    };
    this.setData({ editorTool: tool, editorStatusText: statusByTool[tool] });
  },

  onEditSearchInput(event: WechatMiniprogram.Input) {
    const query = event.detail.value;
    // 空搜索时展示全部颜色，有搜索词时过滤
    const trimmedQuery = query.trim();
    this.setData({
      editSearchQuery: query,
      editSearchResults: filterPaletteColors(this.data.paletteColors, trimmedQuery, trimmedQuery ? 80 : 200)
    });
  },

  toggleEditPaletteDropdown() {
    const nextOpen = !this.data.editPaletteDropdownOpen;
    this.setData({
      editPaletteDropdownOpen: nextOpen,
      editSearchQuery: "",
      editSearchResults: nextOpen ? filterPaletteColors(this.data.paletteColors, "", 200) : []
    });
  },

  buildEditCandidateColors(currentCode?: string, usage?: BeadUsage[]): EditCandidateColor[] {
    const byCode: Record<string, EditCandidateColor> = {};
    const addCandidate = (color: EditCandidateColor) => {
      if (!byCode[color.code]) {
        byCode[color.code] = color;
      }
    };

    const candidateUsage = usage || this.data.usage;
    for (const item of candidateUsage) {
      addCandidate({
        code: item.beadCode,
        name: item.beadName,
        rgb: item.beadRgb,
        enabled: true,
        count: item.count,
        countLabel: String(item.count)
      });
    }

    if (currentCode) {
      const currentPaletteColor =
        this.data.paletteColors.find((color) => color.code === currentCode) ||
        this.data.activeEditColor ||
        this.data.editCandidateColors.find((color) => color.code === currentCode);
      if (currentPaletteColor && !byCode[currentPaletteColor.code]) {
        const currentUsage = candidateUsage.find((item) => item.beadCode === currentPaletteColor.code);
        addCandidate({
          ...currentPaletteColor,
          count: currentUsage?.count,
          countLabel: currentUsage ? String(currentUsage.count) : "新颜色"
        });
      }
    }

    return Object.values(byCode);
  },
  closeEditPopover() {
    this.setData({
      selectedEditCell: null,
      selectedEditCellText: "",
      editSearchQuery: "",
      editSearchResults: [],
      editPaletteDropdownOpen: false,
      highlightedBeadCode: ""
    });
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },

  selectBatchEditColor(event: WechatMiniprogram.TouchEvent) {
    this.selectActiveEditColor(event);
  },

  replaceSelectedCellColor(event: WechatMiniprogram.TouchEvent) {
    const paletteColor = this.resolvePaletteColorFromEvent(event);
    if (!paletteColor) {
      wx.showToast({ title: "未找到色号", icon: "none" });
      return;
    }
    const selection = this.data.selectedEditCell;
    this.setActiveEditColor(paletteColor);
    if (selection && this.data.editorTool === "point") {
      this.applyEditorColor(selection.row, selection.col, paletteColor, "paint");
    }
  },

  selectActiveEditColor(event: WechatMiniprogram.TouchEvent) {
    const paletteColor = this.resolvePaletteColorFromEvent(event);
    if (!paletteColor) {
      wx.showToast({ title: "未找到色号", icon: "none" });
      return;
    }
    this.setActiveEditColor(paletteColor);
  },

  setActiveEditColor(paletteColor: PaletteColor) {
    this.setData({
      activeEditColor: paletteColor,
      activeEditColorText: `${paletteColor.code} ${paletteColor.name}`,
      selectedBatchEditColor: paletteColor,
      selectedBatchEditColorText: `${paletteColor.code} ${paletteColor.name}`,
      editCandidateColors: this.buildEditCandidateColors(paletteColor.code)
    });
    // 换颜色本身不影响 canvas 内容，无需重绘
  },
  highlightUsageColor(event: WechatMiniprogram.TouchEvent) {
    const code = event.currentTarget.dataset.code as string | undefined;
    this.setData({ highlightedBeadCode: this.data.highlightedBeadCode === code ? "" : code || "" });
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },

  /** 开始颜色替换：长按已用色号进入替换模式 */
  startReplaceColor(event: WechatMiniprogram.TouchEvent) {
    const code = event.currentTarget.dataset.code as string | undefined;
    if (!code) return;
    // 打开全色盘供用户选择替换颜色
    this.setData({
      replaceTargetCode: code,
      editPaletteDropdownOpen: true,
      editSearchQuery: "",
      editSearchResults: filterPaletteColors(this.data.paletteColors, "", 200),
      editorStatusText: `选择替换色号（当前 ${code}）`
    });
  },

  /** 确认替换：在全色盘中点击目标颜色，将所有 replaceTargetCode 色号替换为该颜色 */
  confirmReplaceColor(event: WechatMiniprogram.TouchEvent) {
    const newColor = this.resolvePaletteColorFromEvent(event);
    const targetCode = this.data.replaceTargetCode;
    if (!newColor || !targetCode || newColor.code === targetCode) {
      this.cancelReplaceColor();
      return;
    }
    const result = this.data.result;
    if (!result) return;

    // 收集所有需要替换的 cell 位置
    const positions: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < result.cells.length; row += 1) {
      for (let col = 0; col < result.cells[row].length; col += 1) {
        const cell = result.cells[row][col];
        if (isBeadCell(cell) && cell.beadCode === targetCode) {
          positions.push({ row, col });
        }
      }
    }

    if (!positions.length) {
      this.cancelReplaceColor();
      return;
    }

    const patch = this.buildEditorPatch(
      result,
      positions,
      newColor,
      "fill",
      `${targetCode} → ${newColor.code}（${positions.length} 格）`,
      `${positions[0].row}-${positions[0].col}`
    );
    if (!patch.changes.length) {
      this.cancelReplaceColor();
      return;
    }
    const nextResult = applyEditorPatch(result, patch, "redo");
    this.setData({ replaceTargetCode: "" });
    this.commitEditorResult(nextResult, patch, false);
  },

  /** 取消替换模式 */
  cancelReplaceColor() {
    this.setData({
      replaceTargetCode: "",
      editorStatusText: this.data.editorTool === "pan" ? "浏览图纸" : ""
    });
  },

  resolvePaletteColorFromEvent(event: WechatMiniprogram.TouchEvent) {
    const code = event.currentTarget.dataset.code as string | undefined;
    if (!code) {
      return null;
    }
    const usageColor = this.data.usage.find((item) => item.beadCode === code);
    return (
      this.data.paletteColors.find((color) => color.code === code) ||
      (usageColor
        ? {
          code: usageColor.beadCode,
          name: usageColor.beadName,
          rgb: usageColor.beadRgb,
          enabled: true
        }
        : null)
    );
  },

  snapshotEditorTouchEvent(event: WechatMiniprogram.TouchEvent): EditorTouchSnapshot {
    const copyTouch = (touch: EditorTouchPoint): EditorTouchPoint => ({
      pageX: touch.pageX,
      pageY: touch.pageY,
      clientX: touch.clientX,
      clientY: touch.clientY,
      x: touch.x,
      y: touch.y
    });
    return {
      touches: ((event.touches || []) as unknown as EditorTouchPoint[]).map(copyTouch),
      changedTouches: ((event.changedTouches || []) as unknown as EditorTouchPoint[]).map(copyTouch)
    };
  },

  setEditorGuideCell(cell: EditSelection, shouldRedraw = true) {
    const nextKey = cell?.key || "";
    if (this.data.editorGuideCellKey === nextKey) {
      return;
    }
    this.setData({ editorGuideCellKey: nextKey });
    if (shouldRedraw) {
      wx.nextTick(() => {
        this.drawEditorCanvas();
      });
    }
  },

  clearEditorGuideCell() {
    if (!this.data.editorGuideCellKey) {
      return;
    }
    this.setData({ editorGuideCellKey: "" });
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },
  onEditorWheel() {
    return false;
  },

  onEditorCanvasTouchStart(event: WechatMiniprogram.TouchEvent) {
    const snapshot = this.snapshotEditorTouchEvent(event);
    this.handleEditorTouchStart(snapshot);
  },

  handleEditorTouchStart(event: EditorTouchSnapshot) {
    if (event.touches.length === 2) {
      this.clearEditorGuideCell();
      this.setData({
        editorTouchMode: "pinch",
        editorPinchStartDistance: this.getTouchDistance(event.touches),
        editorPinchStartScale: this.data.editorScale,
        editorStartTranslateX: this.data.editorTranslateX,
        editorStartTranslateY: this.data.editorTranslateY,
        editorTouchStartX: this.getTouchCenter(event.touches).x,
        editorTouchStartY: this.getTouchCenter(event.touches).y
      });
      return;
    }

    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) {
      return;
    }
    if (this.data.editorTool === "pan") {
      this.clearEditorGuideCell();
      this.setData({
        editorTouchMode: "pan",
        editorTouchStartX: this.getTouchPagePoint(touch).x,
        editorTouchStartY: this.getTouchPagePoint(touch).y,
        editorStartTranslateX: this.data.editorTranslateX,
        editorStartTranslateY: this.data.editorTranslateY
      });
      return;
    }

    const cell = this.getEditorCellFromTouch(touch);
    if (!cell) {
      this.clearEditorGuideCell();
      this.setData({ editorStatusText: "请点击图纸内的格子" });
      return;
    }
    this.setEditorGuideCell(cell, this.data.editorTool !== "paint");
    if (this.data.editorTool === "paint") {
      editorStrokeKeysCache = {};
      editorStrokePatchCache = null;
      this.setData({ editorTouchMode: "paint" });
      this.paintEditorCell(cell.row, cell.col, "stroke", true);
      return;
    }
    this.handleEditorCellAction(cell.row, cell.col);
  },
  onEditorCanvasTouchMove(event: WechatMiniprogram.TouchEvent) {
    const snapshot = this.snapshotEditorTouchEvent(event);
    if (this.data.editorTouchMode === "pinch" && snapshot.touches.length === 2) {
      const center = this.getTouchCenter(snapshot.touches);
      const distance = this.getTouchDistance(snapshot.touches);
      const ratio = this.data.editorPinchStartDistance > 0 ? distance / this.data.editorPinchStartDistance : 1;
      const editorScale = this.clampEditorScale(this.data.editorPinchStartScale * ratio);
      const editorScaleText = this.formatScaleText(editorScale);
      this.data.editorScale = editorScale;
      this.data.editorScaleText = editorScaleText;
      this.data.editorTranslateX = this.data.editorStartTranslateX + center.x - this.data.editorTouchStartX;
      this.data.editorTranslateY = this.data.editorStartTranslateY + center.y - this.data.editorTouchStartY;
      this.setData({ editorScaleText });
      this.requestEditorCanvasDraw();
      return;
    }

    const touch = snapshot.touches[0];
    if (!touch) {
      return;
    }
    if (this.data.editorTouchMode === "pan") {
      const point = this.getTouchPagePoint(touch);
      this.data.editorTranslateX = this.data.editorStartTranslateX + point.x - this.data.editorTouchStartX;
      this.data.editorTranslateY = this.data.editorStartTranslateY + point.y - this.data.editorTouchStartY;
      this.requestEditorCanvasDraw();
      return;
    }
    if (this.data.editorTouchMode === "paint") {
      const cell = this.getEditorCellFromTouch(touch);
      if (cell) {
        this.setEditorGuideCell(cell, false);
        this.paintEditorCell(cell.row, cell.col, "stroke", true);
      } else {
        this.clearEditorGuideCell();
      }
    }
  },

  onEditorCanvasTouchEnd() {
    const shouldFlushStroke = editorStrokeDirty;
    const strokePatch = editorStrokePatchCache;
    editorStrokeKeysCache = {};
    editorStrokePatchCache = null;
    editorStrokeDirty = false;
    if (strokePatch?.changes.length) {
      this.pushEditorPatch(strokePatch);
    }
    this.setData({
      editorTouchMode: "idle",
      editorPinchStartDistance: 0
    });
    if (shouldFlushStroke && this.data.result) {
      this.flushEditorStrokeState(this.data.result);
    }
    this.clearEditorGuideCell();
  },

  getEditorCellFromTouch(touch: EditorTouchPoint): EditSelection {
    const result = this.data.result;
    if (!result) {
      return null;
    }
    const cell = getCellFromEditorTouchPoint({
      touch,
      viewportLeft: this.data.editorCanvasRectLeft,
      viewportTop: this.data.editorCanvasRectTop,
      rulerSize: this.data.editorRulerSize,
      translateX: this.data.editorTranslateX,
      translateY: this.data.editorTranslateY,
      scale: this.data.editorScale,
      baseCellSize: this.data.editorBaseCellSize,
      widthCells: result.widthCells,
      heightCells: result.heightCells
    });
    return cell;
  },

  handleEditorCellAction(row: number, col: number) {
    const result = this.data.result;
    if (!result) {
      return;
    }
    const cell = result.cells[row]?.[col];
    if (!cell) {
      return;
    }

    // 点击格子时将已用色号列表滚动到对应颜色
    if (isBeadCell(cell)) {
      const scrollTarget = `cand-${cell.beadCode}`;
      if (this.data.candidateScrollInto !== scrollTarget) {
        this.setData({ candidateScrollInto: scrollTarget });
      }
    }

    if (this.data.editorTool === "picker") {
      if (isEmptyCell(cell)) {
        wx.showToast({ title: "空格子无法取色", icon: "none" });
        return;
      }
      if (!isBeadCell(cell)) {
        this.setData({ editorStatusText: "该原色格还没有色号，请选择一个色号进行替换。" });
        return;
      }
      this.setActiveEditColor({ code: cell.beadCode, name: cell.beadName, rgb: cell.beadRgb, enabled: true });
      this.setData({ editorStatusText: `已吸取 ${cell.beadCode} ${cell.beadName}` });
      return;
    }

    if (this.data.editorTool === "fill") {
      const color = this.data.activeEditColor;
      if (!color) {
        wx.showToast({ title: "请先选择颜色", icon: "none" });
        return;
      }
      this.fillEditorArea(row, col, color);
      return;
    }

    this.paintEditorCell(row, col, "paint", false);
  },

  paintEditorCell(row: number, col: number, patchType: EditorPatchType, isStroke: boolean) {
    const color = this.data.activeEditColor;
    if (!color) {
      wx.showToast({ title: "请先选择颜色", icon: "none" });
      return;
    }
    const key = `${row}-${col}`;
    if (isStroke && editorStrokeKeysCache[key]) {
      return;
    }
    this.applyEditorColor(row, col, color, patchType);
    if (isStroke) {
      editorStrokeKeysCache[key] = true;
    }
  },

  fillEditorArea(row: number, col: number, paletteColor: PaletteColor) {
    const result = this.data.result;
    if (!result) {
      return;
    }
    const codeGrid = result.cells.map((line) => line.map((cell) => this.editorFillKeyForCell(cell)));
    const positions = floodFillPattern(codeGrid, row, col);
    if (!positions.length) {
      return;
    }
    const patch = this.buildEditorPatch(result, positions, paletteColor, "fill", `${paletteColor.code} filled ${positions.length} cells`, `${row}-${col}`);
    if (!patch.changes.length) {
      return;
    }
    const nextResult = applyEditorPatch(result, patch, "redo");
    this.commitEditorResult(nextResult, patch, false);
  },


  editorFillKeyForCell(cell: PatternCell): string {
    if (isEmptyCell(cell)) {
      return "empty";
    }
    if (isBeadCell(cell)) {
      return `bead:${cell.beadCode}`;
    }
    return `raw:${cell.sourceRgb.join(",")}`;
  },

  applyEditorColor(row: number, col: number, paletteColor: PaletteColor, patchType: EditorPatchType) {
    const result = this.data.result;
    if (!result) {
      return;
    }
    const patch = this.buildEditorPatch(result, [{ row, col }], paletteColor, patchType, `${paletteColor.code} applied at row ${row + 1}, col ${col + 1}`, `${row}-${col}`);
    if (!patch.changes.length) {
      return;
    }
    const nextResult = applyEditorPatch(result, patch, "redo");
    this.commitEditorResult(nextResult, patch, patchType === "stroke");
  },

  commitEditorResult(nextResult: PatternResult, patch: EditorPatch, deferUi = false) {
    if (!editorHistoryCache) {
      editorHistoryCache = createEditorPatchHistory();
    }
    if (patch.type === "stroke") {
      this.mergeStrokePatch(patch);
    } else {
      this.pushEditorPatch(patch);
    }
    this.data.result = nextResult;
    this.data.usage = nextResult.usage;
    if (deferUi) {
      editorStrokeDirty = true;
      this.data.hoveredTraceCellKey = patch.selectedKey;
      this.requestEditorCanvasDraw();
      return;
    }
    this.setData({
      usage: nextResult.usage,
      resultBeadCount: this.calculateUsageTotal(nextResult.usage),
      editorUndoCount: editorHistoryCache.past.length,
      editorRedoCount: editorHistoryCache.future.length,
      editorStatusText: patch.label,
      hoveredTraceCellKey: patch.selectedKey,
      selectedEditCell: this.selectionFromKey(patch.selectedKey),
      selectedEditCellText: this.formatSelectedEditCellText(nextResult, patch.selectedKey),
      editCandidateColors: this.buildEditCandidateColors(this.data.activeEditColor?.code, nextResult.usage),
      editPaletteDropdownOpen: false
    });
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },

  buildEditorPatch(
    result: PatternResult,
    positions: Array<{ row: number; col: number }>,
    paletteColor: PaletteColor,
    type: EditorPatchType,
    label: string,
    selectedKey: string
  ): EditorPatch {
    const changes: EditorCellPatch[] = [];
    const seen: MarkedCells = {};
    for (const position of positions) {
      const key = `${position.row}-${position.col}`;
      if (seen[key]) {
        continue;
      }
      seen[key] = true;
      const beforeCell = result.cells[position.row]?.[position.col];
      if (!beforeCell) {
        continue;
      }
      if (isBeadCell(beforeCell) && beforeCell.beadCode === paletteColor.code) {
        continue;
      }
      // 直接构造 afterCell，避免 replacePatternCellColor 的数组拷贝开销
      // 空格子也可上色，sourceRgb 使用调色板颜色自身
      const sourceRgb = isEmptyCell(beforeCell)
        ? paletteColor.rgb
        : (beforeCell as BeadCell | RawColorCell).sourceRgb;
      const afterCell: BeadCell = {
        x: beforeCell.x,
        y: beforeCell.y,
        sourceRgb,
        beadCode: paletteColor.code,
        beadName: paletteColor.name,
        beadRgb: paletteColor.rgb,
        distance: 0,
      };
      changes.push({ row: position.row, col: position.col, beforeCell, afterCell });
    }
    return { type, label, selectedKey, changes };
  },

  pushEditorPatch(patch: EditorPatch) {
    if (!patch.changes.length) {
      return;
    }
    if (!editorHistoryCache) {
      editorHistoryCache = createEditorPatchHistory();
    }
    editorHistoryCache = pushEditorPatchHistory(editorHistoryCache, patch);
  },

  mergeStrokePatch(patch: EditorPatch) {
    if (!patch.changes.length) {
      return;
    }
    if (!editorStrokePatchCache) {
      editorStrokePatchCache = { ...patch, changes: [...patch.changes] };
      return;
    }
    const changesByKey: Record<string, EditorCellPatch> = {};
    for (const change of editorStrokePatchCache.changes) {
      changesByKey[`${change.row}-${change.col}`] = change;
    }
    for (const change of patch.changes) {
      const key = `${change.row}-${change.col}`;
      const existing = changesByKey[key];
      changesByKey[key] = existing ? { ...change, beforeCell: existing.beforeCell } : change;
    }
    editorStrokePatchCache = {
      ...editorStrokePatchCache,
      label: patch.label,
      selectedKey: patch.selectedKey,
      changes: Object.values(changesByKey)
    };
  },

  flushEditorStrokeState(result: PatternResult) {
    const selectedKey = this.data.hoveredTraceCellKey;
    this.setData({
      usage: result.usage,
      resultBeadCount: this.calculateUsageTotal(result.usage),
      editorUndoCount: editorHistoryCache?.past.length || 0,
      editorRedoCount: editorHistoryCache?.future.length || 0,
      selectedEditCell: this.selectionFromKey(selectedKey),
      selectedEditCellText: this.formatSelectedEditCellText(result, selectedKey),
      editCandidateColors: this.buildEditCandidateColors(this.data.activeEditColor?.code, result.usage),
      editPaletteDropdownOpen: false
    });
  },

  undoEditorChange() {
    if (!editorHistoryCache) {
      return;
    }
    const { history: nextHistory, patch } = undoEditorPatchHistory(editorHistoryCache);
    if (!patch || !this.data.result) {
      return;
    }
    editorHistoryCache = nextHistory;
    const previous = applyEditorPatch(this.data.result, patch, "undo");
    this.data.result = previous;
    this.data.usage = previous.usage;
    this.setData({
      usage: previous.usage,
      resultBeadCount: this.calculateUsageTotal(previous.usage),
      editorUndoCount: nextHistory.past.length,
      editorRedoCount: nextHistory.future.length,
      editorStatusText: `已撤销 ${patch.label}`,
      hoveredTraceCellKey: patch.selectedKey,
      selectedEditCell: this.selectionFromKey(patch.selectedKey),
      selectedEditCellText: this.formatSelectedEditCellText(previous, patch.selectedKey),
      editCandidateColors: this.buildEditCandidateColors(this.data.activeEditColor?.code, previous.usage)
    });
    wx.nextTick(() => {
      this.drawPattern(false);
      this.drawEditorCanvas();
    });
  },

  redoEditorChange() {
    if (!editorHistoryCache) {
      return;
    }
    const { history: nextHistory, patch } = redoEditorPatchHistory(editorHistoryCache);
    if (!patch || !this.data.result) {
      return;
    }
    editorHistoryCache = nextHistory;
    const next = applyEditorPatch(this.data.result, patch, "redo");
    this.data.result = next;
    this.data.usage = next.usage;
    this.setData({
      usage: next.usage,
      resultBeadCount: this.calculateUsageTotal(next.usage),
      editorUndoCount: nextHistory.past.length,
      editorRedoCount: nextHistory.future.length,
      editorStatusText: `已重做 ${patch.label}`,
      hoveredTraceCellKey: patch.selectedKey,
      selectedEditCell: this.selectionFromKey(patch.selectedKey),
      selectedEditCellText: this.formatSelectedEditCellText(next, patch.selectedKey),
      editCandidateColors: this.buildEditCandidateColors(this.data.activeEditColor?.code, next.usage)
    });
    wx.nextTick(() => {
      this.drawPattern(false);
      this.drawEditorCanvas();
    });
  },

  selectionFromKey(key: string): EditSelection {
    const [rowText, colText] = key.split("-");
    const row = Number(rowText);
    const col = Number(colText);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      return null;
    }
    return { row, col, key };
  },

  formatSelectedEditCellText(result: PatternResult, key: string): string {
    const selection = this.selectionFromKey(key);
    if (!selection) {
      return "";
    }
    const cell = result.cells[selection.row]?.[selection.col];
    if (!cell || !isBeadCell(cell)) {
      return "空格子";
    }
    return `${cell.beadCode} ${cell.beadName} (row ${selection.row + 1}, col ${selection.col + 1})`;
  },

  updateTraceCellFromEvent(event: CanvasPointEvent, shouldMark: boolean) {
    const result = this.data.result;
    if (!this.data.isTracingMode || !result) {
      return;
    }

    const point = getCanvasPointFromEvent(event);
    if (!point) {
      return;
    }

    const traceCell = getPatternCellFromPoint({
      x: point.x,
      y: point.y,
      canvasWidth: this.data.canvasCssWidth,
      canvasHeight: this.data.canvasCssHeight,
      widthCells: result.widthCells,
      heightCells: result.heightCells
    });
    if (!traceCell) {
      this.setData({
        traceStatusText: "未选择格子",
        hoveredTraceCellKey: ""
      });
      wx.nextTick(() => {
        this.drawPattern(false);
      });
      return;
    }

    const cell = result.cells[traceCell.row]?.[traceCell.col];
    if (!cell) {
      return;
    }

    const nextData: Record<string, string | MarkedCells> = {
      traceStatusText: formatTraceCellStatus(cell),
      hoveredTraceCellKey: traceCell.key
    };
    if (shouldMark && this.data.traceMarkEnabled) {
      nextData.markedTraceCells = {
        ...this.data.markedTraceCells,
        [traceCell.key]: true
      };
    }
    this.setData(nextData);
    wx.nextTick(() => {
      this.drawPattern(false);
    });
  },

  clampPatternZoom(zoom: number) {
    const normalizedZoom = Number.isFinite(zoom) ? zoom : 1;
    return Math.min(this.data.patternMaxZoom, Math.max(this.data.patternMinZoom, Math.round(normalizedZoom * 20) / 20));
  },

  getTouchDistance(touches: EditorTouchPoint[]) {
    return getEditorTouchDistance({
      touches,
      viewportLeft: this.data.editorCanvasRectLeft,
      viewportTop: this.data.editorCanvasRectTop
    });
  },
  initializeEditorCanvas(result?: PatternResult | null) {
    const pattern = result ?? this.data.result;
    if (!pattern) {
      return;
    }
    const system = wx.getSystemInfoSync();
    const cssWidth = Math.max(300, system.windowWidth - 36);
    const maxCanvasHeight = Math.max(260, Math.floor(system.windowHeight * 0.46));
    const availableWidth = cssWidth - this.data.editorRulerSize - 24;
    const widthLimitedCell = Math.floor(availableWidth / pattern.widthCells);
    const heightLimitedCell = Math.floor((maxCanvasHeight - this.data.editorRulerSize - 24) / pattern.heightCells);
    const baseCellSize = Math.max(2, Math.min(18, widthLimitedCell, heightLimitedCell));
    const patternWidth = pattern.widthCells * baseCellSize;
    const patternHeight = pattern.heightCells * baseCellSize;
    const cssHeight = Math.max(220, Math.min(maxCanvasHeight, this.data.editorRulerSize + patternHeight + 24));
    const availableHeight = cssHeight - this.data.editorRulerSize - 24;
    const translateX = Math.max(0, Math.floor((availableWidth - patternWidth) / 2));
    const translateY = Math.max(0, Math.floor((availableHeight - patternHeight) / 2));
    const firstUsage = pattern.usage[0];
    const firstColor = firstUsage
      ? ({ code: firstUsage.beadCode, name: firstUsage.beadName, rgb: firstUsage.beadRgb, enabled: true } as PaletteColor)
      : this.data.activeEditColor;

    editorHistoryCache = createEditorPatchHistory();
    editorStrokeKeysCache = {};
    editorStrokeDirty = false;
    editorCanvasCache = null;
    editorStrokePatchCache = null;

    this.setData({
      editorCanvasCssWidth: cssWidth,
      editorCanvasCssHeight: cssHeight,
      editorBaseCellSize: baseCellSize,
      editorScale: 1,
      editorScaleText: "100%",
      editorTranslateX: translateX,
      editorTranslateY: translateY,
      editorTool: "pan",
      editorStatusText: "浏览图纸",
      activeEditColor: firstColor,
      activeEditColorText: firstColor ? `${firstColor.code} ${firstColor.name}` : "选择颜色",
      selectedBatchEditColor: firstColor,
      selectedBatchEditColorText: firstColor ? `${firstColor.code} ${firstColor.name}` : "未选择颜色",
      editCandidateColors: this.buildEditCandidateColors(firstColor?.code),
      editorUndoCount: 0,
      editorRedoCount: 0
    });
  },

  editorZoomIn() {
    this.setEditorScale(this.data.editorScale + 0.25);
  },

  editorZoomOut() {
    this.setEditorScale(this.data.editorScale - 0.25);
  },

  resetEditorView() {
    this.initializeEditorCanvas();
    wx.nextTick(() => {
      this.refreshEditorCanvasRect(() => this.drawEditorCanvas());
    });
  },

  setEditorScale(nextScale: number) {
    const editorScale = this.clampEditorScale(nextScale);
    this.setData({ editorScale, editorScaleText: this.formatScaleText(editorScale) });
    this.requestEditorCanvasDraw();
  },

  requestEditorCanvasDraw() {
    if (editorDrawPending) {
      return;
    }
    editorDrawPending = true;
    setTimeout(() => {
      editorDrawPending = false;
      this.drawEditorCanvas();
    }, 16);
  },

  formatScaleText(scale: number) {
    return `${Math.round(scale * 100)}%`;
  },

  clampEditorScale(scale: number) {
    const normalized = Number.isFinite(scale) ? scale : 1;
    return Math.min(8, Math.max(0.5, Math.round(normalized * 20) / 20));
  },

  refreshEditorCanvasRect(done?: () => void) {
    const query = wx.createSelectorQuery();
    query
      .select("#editorPatternCanvas")
      .fields({ rect: true, size: true })
      .exec((response) => {
        const rect = response[0] as { left?: number; top?: number; width?: number; height?: number } | undefined;
        if (rect) {
          this.setData({
            editorCanvasRectLeft: rect.left || 0,
            editorCanvasRectTop: rect.top || 0,
            editorCanvasCssWidth: rect.width || this.data.editorCanvasCssWidth,
            editorCanvasCssHeight: rect.height || this.data.editorCanvasCssHeight
          });
        }
        done?.();
      });
  },

  getTouchPagePoint(touch: EditorTouchPoint): { x: number; y: number } {
    return resolveEditorTouchPoint({
      touch,
      viewportLeft: this.data.editorCanvasRectLeft,
      viewportTop: this.data.editorCanvasRectTop
    });
  },

  getTouchCenter(touches: EditorTouchPoint[]): { x: number; y: number } {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) {
      const point = first ? this.getTouchPagePoint(first) : { x: 0, y: 0 };
      return point;
    }
    const firstPoint = this.getTouchPagePoint(first);
    const secondPoint = this.getTouchPagePoint(second);
    return { x: (firstPoint.x + secondPoint.x) / 2, y: (firstPoint.y + secondPoint.y) / 2 };
  },

  drawEditorCanvas() {
    const result = this.data.result;
    if (!result || !this.data.isEditingMode) {
      return;
    }

    const currentTranslate = {
      translateX: this.data.editorTranslateX,
      translateY: this.data.editorTranslateY,
      scale: this.data.editorScale,
    };
    const rulerChanged =
      !editorRulerCache ||
      editorRulerCache.translateX !== currentTranslate.translateX ||
      editorRulerCache.translateY !== currentTranslate.translateY ||
      editorRulerCache.scale !== currentTranslate.scale;

    const drawWithCanvas = (canvas: WechatMiniprogram.Canvas, context: CanvasContextLike) => {
      const width = this.data.editorCanvasCssWidth;
      const height = this.data.editorCanvasCssHeight;
      const pixelRatio = wx.getSystemInfoSync().pixelRatio;
      if (!editorCanvasCache || editorCanvasCache.width !== width || editorCanvasCache.height !== height || editorCanvasCache.pixelRatio !== pixelRatio) {
        const destWidth = Math.round(width * pixelRatio);
        const destHeight = Math.round(height * pixelRatio);
        canvas.width = destWidth;
        canvas.height = destHeight;
        editorCanvasCache = { canvas, context, width, height, pixelRatio };
        // Canvas 尺寸变化，标尺必须重绘
        editorRulerCache = null;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#f8fafc";
      context.fillRect(0, 0, width, height);
      if (rulerChanged || !editorRulerCache) {
        this.drawEditorRulers(context, result);
        editorRulerCache = { ...currentTranslate };
      }
      this.drawEditorCells(context, result);
    };

    if (editorCanvasCache) {
      drawWithCanvas(editorCanvasCache.canvas, editorCanvasCache.context);
      return;
    }

    const query = wx.createSelectorQuery();
    query
      .select("#editorPatternCanvas")
      .fields({ node: true, size: true })
      .exec((response) => {
        const canvas = response[0]?.node as WechatMiniprogram.Canvas | undefined;
        if (!canvas) {
          return;
        }
        const context = canvas.getContext("2d") as unknown as CanvasContextLike;
        drawWithCanvas(canvas, context);
      });
  },

  drawEditorRulers(context: CanvasContextLike, result: PatternResult) {
    const ruler = this.data.editorRulerSize;
    const cellSize = this.data.editorBaseCellSize * this.data.editorScale;
    const originX = ruler + this.data.editorTranslateX;
    const originY = ruler + this.data.editorTranslateY;
    const width = this.data.editorCanvasCssWidth;
    const height = this.data.editorCanvasCssHeight;

    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, ruler);
    context.fillRect(0, 0, ruler, height);
    context.strokeStyle = "#333333";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(ruler, 0);
    context.lineTo(ruler, height);
    context.moveTo(0, ruler);
    context.lineTo(width, ruler);
    context.stroke();
    context.fillStyle = "#334155";
    context.font = "10px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const step = result.widthCells > 60 || result.heightCells > 60 ? 10 : 5;
    for (let col = 0; col <= result.widthCells; col += step) {
      const x = originX + col * cellSize;
      if (x >= ruler && x <= width) {
        context.fillText(String(col), x, ruler / 2);
      }
    }
    context.textAlign = "right";
    for (let row = 0; row <= result.heightCells; row += step) {
      const y = originY + row * cellSize;
      if (y >= ruler && y <= height) {
        context.fillText(String(row), ruler - 4, y);
      }
    }
    context.restore();
  },

  drawEditorCells(context: CanvasContextLike, result: PatternResult) {
    const ruler = this.data.editorRulerSize;
    const cellSize = this.data.editorBaseCellSize * this.data.editorScale;
    const originX = ruler + this.data.editorTranslateX;
    const originY = ruler + this.data.editorTranslateY;
    const patternWidth = result.widthCells * cellSize;
    const patternHeight = result.heightCells * cellSize;
    const highlighted = this.data.highlightedBeadCode;
    const drawLabels = cellSize >= 20;

    context.save();
    context.beginPath();
    context.rect(ruler, ruler, this.data.editorCanvasCssWidth - ruler, this.data.editorCanvasCssHeight - ruler);
    context.clip();
    context.fillStyle = "#ffffff";
    context.fillRect(originX, originY, patternWidth, patternHeight);

    const visible = this.visibleEditorCellRange(result, originX, originY, cellSize);

    // 按 (颜色, alpha) 分组批量绘制，减少 fillStyle 切换和独立 API 调用
    const colorGroups = new Map<string, Array<{ x: number; y: number }>>();
    const labelCells: Array<{ x: number; y: number; label: string; rgb: Rgb; beadCode: string }> = [];

    for (let rowIndex = visible.startRow; rowIndex <= visible.endRow; rowIndex += 1) {
      const row = result.cells[rowIndex];
      if (!row) continue;
      for (let colIndex = visible.startCol; colIndex <= visible.endCol; colIndex += 1) {
        const cell = row[colIndex];
        if (!cell) continue;
        const x = originX + cell.x * cellSize;
        const y = originY + cell.y * cellSize;
        const displayRgb = isBeadCell(cell) ? cell.beadRgb : isEmptyCell(cell) ? [248, 250, 252] : cell.sourceRgb;
        const alphaKey = highlighted && isBeadCell(cell) && cell.beadCode !== highlighted ? "dim" : "full";
        const colorKey = `${displayRgb[0]},${displayRgb[1]},${displayRgb[2]}|${alphaKey}`;
        let group = colorGroups.get(colorKey);
        if (!group) {
          group = [];
          colorGroups.set(colorKey, group);
        }
        group.push({ x, y });
        if (drawLabels && isBeadCell(cell)) {
          labelCells.push({ x, y, label: cell.beadCode, rgb: displayRgb as Rgb, beadCode: cell.beadCode });
        }
      }
    }

    // 批量绘制同色 + 同 alpha 的 cells
    for (const [colorKey, cells] of colorGroups) {
      const [rgbStr, alphaKey] = colorKey.split("|");
      context.fillStyle = `rgb(${rgbStr})`;
      context.globalAlpha = alphaKey === "dim" ? 0.28 : 1;
      for (const { x, y } of cells) {
        context.fillRect(x, y, cellSize, cellSize);
      }
    }

    // 批量绘制文字标签
    if (drawLabels && labelCells.length) {
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = `${Math.max(8, Math.floor(cellSize * 0.32))}px sans-serif`;
      const textColorCache = new Map<string, string>();
      for (const { x, y, label, rgb, beadCode } of labelCells) {
        const rgbKey = rgb.join(",");
        let color = textColorCache.get(rgbKey);
        if (!color) {
          color = this.textColorFor(rgb);
          textColorCache.set(rgbKey, color);
        }
        context.fillStyle = color;
        context.globalAlpha = highlighted && beadCode !== highlighted ? 0.35 : 0.95;
        context.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }
    }

    context.globalAlpha = 1;
    this.drawEditorGrid(context, result, originX, originY, cellSize, visible);
    this.drawEditorGuides(context, result, originX, originY, cellSize, patternWidth, patternHeight);
    if (this.data.hoveredTraceCellKey) {
      const selected = this.selectionFromKey(this.data.hoveredTraceCellKey);
      if (selected) {
        context.strokeStyle = "#2f6df6";
        context.lineWidth = Math.max(2, Math.min(5, cellSize * 0.16));
        context.strokeRect(originX + selected.col * cellSize + 1, originY + selected.row * cellSize + 1, cellSize - 2, cellSize - 2);
      }
    }
    context.restore();
  },

  visibleEditorCellRange(result: PatternResult, originX: number, originY: number, cellSize: number) {
    const ruler = this.data.editorRulerSize;
    const viewportWidth = this.data.editorCanvasCssWidth;
    const viewportHeight = this.data.editorCanvasCssHeight;
    const startCol = Math.max(0, Math.floor((ruler - originX) / cellSize) - 1);
    const endCol = Math.min(result.widthCells - 1, Math.ceil((viewportWidth - originX) / cellSize) + 1);
    const startRow = Math.max(0, Math.floor((ruler - originY) / cellSize) - 1);
    const endRow = Math.min(result.heightCells - 1, Math.ceil((viewportHeight - originY) / cellSize) + 1);
    return { startCol, endCol, startRow, endRow };
  },

  drawEditorGuides(
    context: CanvasContextLike,
    result: PatternResult,
    originX: number,
    originY: number,
    cellSize: number,
    patternWidth: number,
    patternHeight: number
  ) {
    const guideCell = this.selectionFromKey(this.data.editorGuideCellKey);
    if (!guideCell) {
      return;
    }
    const x = originX + guideCell.col * cellSize;
    const y = originY + guideCell.row * cellSize;
    context.save();
    context.globalAlpha = 1;
    context.fillStyle = "rgba(14, 165, 233, 0.18)";
    context.fillRect(originX, y, patternWidth, cellSize);
    context.fillRect(x, originY, cellSize, patternHeight);
    context.strokeStyle = "#0369a1";
    context.lineWidth = Math.max(1.5, Math.min(4, cellSize * 0.12));
    context.beginPath();
    context.moveTo(originX, y + cellSize / 2);
    context.lineTo(originX + patternWidth, y + cellSize / 2);
    context.moveTo(x + cellSize / 2, originY);
    context.lineTo(x + cellSize / 2, originY + patternHeight);
    context.stroke();
    context.strokeStyle = "#0f172a";
    context.lineWidth = Math.max(2, Math.min(5, cellSize * 0.18));
    context.strokeRect(x + 1, y + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
    context.restore();
  },
  drawEditorGrid(
    context: CanvasContextLike,
    result: PatternResult,
    originX: number,
    originY: number,
    cellSize: number,
    visible?: { startCol: number; endCol: number; startRow: number; endRow: number }
  ) {
    const width = result.widthCells * cellSize;
    const height = result.heightCells * cellSize;
    const startCol = visible ? Math.max(0, visible.startCol) : 0;
    const endCol = visible ? Math.min(result.widthCells, visible.endCol + 1) : result.widthCells;
    const startRow = visible ? Math.max(0, visible.startRow) : 0;
    const endRow = visible ? Math.min(result.heightCells, visible.endRow + 1) : result.heightCells;
    context.save();

    // 按线型分三组批量 stroke，将 stroke 调用从 O(n+m) 降为固定的 3 次
    const groups: Array<{ style: string; width: number; moves: Array<[number, number, number, number]> }> = [
      { style: "#111827", width: 1.4, moves: [] },
      { style: "#64748b", width: 1, moves: [] },
      { style: "rgba(148, 163, 184, 0.55)", width: 0.5, moves: [] },
    ];

    for (let col = startCol; col <= endCol; col += 1) {
      const x = originX + col * cellSize;
      const idx = col % 10 === 0 ? 0 : col % 5 === 0 ? 1 : 2;
      groups[idx].moves.push([x, originY, x, originY + height]);
    }
    for (let row = startRow; row <= endRow; row += 1) {
      const y = originY + row * cellSize;
      const idx = row % 10 === 0 ? 0 : row % 5 === 0 ? 1 : 2;
      groups[idx].moves.push([originX, y, originX + width, y]);
    }

    for (const group of groups) {
      if (!group.moves.length) continue;
      context.strokeStyle = group.style;
      context.lineWidth = group.width;
      context.beginPath();
      for (const [mx, my, lx, ly] of group.moves) {
        context.moveTo(mx, my);
        context.lineTo(lx, ly);
      }
      context.stroke();
    }
    context.restore();
  },

  drawPattern(forExport: boolean, done?: (tempFilePath?: string) => void) {
    const result = this.data.result;
    if (!result) {
      console.warn("[pattern-export] draw skipped: missing result", { forExport });
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
          console.error("[pattern-export] canvas node not found", { forExport, selectorResult: response[0] });
          done?.();
          return;
        }

        const cssCellSize = this.data.canvasCssWidth / result.widthCells;
        const rulerSize = forExport ? 42 : 0;
        const pixelRatio = forExport ? 2 : wx.getSystemInfoSync().pixelRatio;

        // 先以无 stats 约束计算 cellSize，避免循环估算误差。
        // 原来以 cellSize=36 估算 stats 宽度 → 推算 stats 高度 → 约束 cellSize，
        // 但大图案时 cellSize 被缩小到 12，实际宽度与估算宽度差异巨大，
        // 导致 stats 行数估算偏少 → cellSize 偏大 → 总高可能超限。
        let cellSize = forExport
          ? calculateExportCellSize(result, rulerSize, 0, pixelRatio)
          : cssCellSize;

        let patternWidth = result.widthCells * cellSize;
        const maxSide = EXPORT_MAX_CANVAS_SIDE_PX / Math.max(1, pixelRatio);
        const exportStatsHeight = forExport
          ? this.exportUsageHeight(result.usage, patternWidth + rulerSize)
          : 0;

        // 如果加上 stats 后总高超限，以实际 stats 高度重新约束 cellSize
        if (forExport && result.heightCells * cellSize + rulerSize + exportStatsHeight > maxSide) {
          cellSize = calculateExportCellSize(result, rulerSize, exportStatsHeight, pixelRatio);
          patternWidth = result.widthCells * cellSize;
        }

        const patternHeight = result.heightCells * cellSize;
        const width = patternWidth + rulerSize;
        const height = patternHeight + rulerSize + exportStatsHeight;
        const destWidth = Math.round(width * pixelRatio);
        const destHeight = Math.round(height * pixelRatio);
        console.log("[pattern-export] render metrics", {
          forExport,
          widthCells: result.widthCells,
          heightCells: result.heightCells,
          usageCount: result.usage.length,
          cssCellSize,
          cellSize,
          rulerSize,
          exportStatsHeight,
          pixelRatio,
          canvasWidth: width,
          canvasHeight: height,
          destWidth,
          destHeight
        });
        canvas.width = destWidth;
        canvas.height = destHeight;

        const context = canvas.getContext("2d") as unknown as CanvasContextLike;
        context.scale(pixelRatio, pixelRatio);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        const originX = rulerSize;
        const originY = rulerSize;
        if (forExport) {
          this.drawExportRulers(context, result, originX, originY, cellSize, patternWidth, patternHeight);
        }
        context.textAlign = "center";
        context.textBaseline = "middle";
        const drawLabels = shouldDrawCellLabel(cellSize, forExport);
        if (drawLabels) {
          context.font = `${Math.max(8, Math.floor(cellSize * 0.38))}px sans-serif`;
        }

        for (const row of result.cells) {
          for (const cell of row) {
            const x = originX + cell.x * cellSize;
            const y = originY + cell.y * cellSize;
            if (isEmptyCell(cell)) {
              context.fillStyle = "#f8fafc";
              context.fillRect(x, y, cellSize, cellSize);
            } else {
              const displayRgb = isBeadCell(cell) ? cell.beadRgb : cell.sourceRgb;
              context.fillStyle = `rgb(${displayRgb[0]}, ${displayRgb[1]}, ${displayRgb[2]})`;
              context.fillRect(x, y, cellSize, cellSize);
              if (drawLabels && isBeadCell(cell)) {
                context.fillStyle = this.textColorFor(displayRgb);
                context.fillText(cell.beadCode, x + cellSize / 2, y + cellSize / 2);
              }
            }
            context.strokeStyle = "#cbd5e1";
            context.lineWidth = 0.5;
            context.strokeRect(x, y, cellSize, cellSize);
          }
        }

        if (forExport) {
          this.drawExportGroupGrid(context, result, originX, originY, cellSize, patternWidth, patternHeight);
        }

        if (!forExport && (this.data.isTracingMode || this.data.isEditingMode)) {
          const markedCells = this.data.markedTraceCells;
          if (this.data.isTracingMode) {
            context.save();
            for (const key of Object.keys(markedCells)) {
              if (!markedCells[key]) {
                continue;
              }
              const [rowText, colText] = key.split("-");
              const row = Number(rowText);
              const col = Number(colText);
              if (!Number.isFinite(row) || !Number.isFinite(col)) {
                continue;
              }
              const x = originX + col * cellSize;
              const y = originY + row * cellSize;
              const checkSize = Math.max(10, cellSize * 0.58);
              context.globalAlpha = 0.72;
              context.strokeStyle = "#16a34a";
              context.lineWidth = Math.max(2, cellSize * 0.12);
              context.lineCap = "round";
              context.lineJoin = "round";
              context.beginPath();
              context.moveTo(x + cellSize * 0.24, y + cellSize * 0.52);
              context.lineTo(x + cellSize * 0.43, y + cellSize * 0.7);
              context.lineTo(x + cellSize * 0.76, y + cellSize * 0.3);
              context.stroke();
              context.globalAlpha = 0.14;
              context.fillStyle = "#16a34a";
              context.fillRect(x, y, checkSize, checkSize);
            }
            context.restore();
          }

          if (this.data.hoveredTraceCellKey) {
            const [rowText, colText] = this.data.hoveredTraceCellKey.split("-");
            const row = Number(rowText);
            const col = Number(colText);
            if (Number.isFinite(row) && Number.isFinite(col)) {
              const x = originX + col * cellSize;
              const y = originY + row * cellSize;
              context.save();
              context.fillStyle = "rgba(47, 109, 246, 0.18)";
              context.fillRect(x, y, cellSize, cellSize);
              context.strokeStyle = "#2f6df6";
              context.lineWidth = Math.max(2, cellSize * 0.1);
              context.strokeRect(x + 1, y + 1, Math.max(0, cellSize - 2), Math.max(0, cellSize - 2));
              context.restore();
            }
          }
        }

        if (forExport) {
          this.drawExportUsage(context, result.usage, rulerSize + patternHeight, width);
          wx.canvasToTempFilePath({
            canvas,
            width,
            height,
            destWidth,
            destHeight,
            success: (res) => {
              console.log("[pattern-export] canvasToTempFilePath success", { tempFilePath: res.tempFilePath, width, height, destWidth, destHeight });
              done?.(res.tempFilePath);
            },
            fail: (error) => {
              console.error("[pattern-export] canvasToTempFilePath failed", { error, width, height, destWidth, destHeight });
              done?.();
            }
          });
        } else {
          done?.();
        }
      });
  },

  // 导出色号统计的布局常量
  // 排版：左边距 14 → 色块(20x20) → 间距 8 → 文字 "S01 x 999"
  // 每个 chip 最小宽度 118，行高 34，标题高 54，底部留白 16
  exportUsageHeight(usage: BeadUsage[], width: number) {
    if (!usage.length) {
      return 0;
    }
    const rows = Math.ceil(usage.length / this.exportUsageColumns(width));
    return 54 + rows * 34 + 16;
  },

  exportUsageColumns(width: number) {
    return Math.max(1, Math.floor((width - 28) / 118));
  },

  drawExportRulers(
    context: CanvasContextLike,
    result: PatternResult,
    originX: number,
    originY: number,
    cellSize: number,
    patternWidth: number,
    patternHeight: number
  ) {
    context.save();
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, originX + patternWidth, originY);
    context.fillRect(0, 0, originX, originY + patternHeight);
    context.strokeStyle = "#334155";
    context.lineWidth = 1;
    context.strokeRect(originX, originY, patternWidth, patternHeight);
    context.fillStyle = "#111827";
    context.font = "12px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (let col = 0; col < result.widthCells; col += 1) {
      context.fillText(String(col + 1), originX + col * cellSize + cellSize / 2, originY / 2);
    }
    context.textAlign = "right";
    for (let row = 0; row < result.heightCells; row += 1) {
      context.fillText(String(row + 1), originX - 7, originY + row * cellSize + cellSize / 2);
    }
    context.restore();
  },

  drawExportGroupGrid(
    context: CanvasContextLike,
    result: PatternResult,
    originX: number,
    originY: number,
    cellSize: number,
    patternWidth: number,
    patternHeight: number
  ) {
    context.save();
    context.lineCap = "square";
    for (let col = 5; col < result.widthCells; col += 5) {
      const x = originX + col * cellSize;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(x, originY);
      context.lineTo(x, originY + patternHeight);
      context.stroke();
      context.strokeStyle = "#ff2f92";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, originY);
      context.lineTo(x, originY + patternHeight);
      context.stroke();
    }
    for (let row = 5; row < result.heightCells; row += 5) {
      const y = originY + row * cellSize;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(originX, y);
      context.lineTo(originX + patternWidth, y);
      context.stroke();
      context.strokeStyle = "#ff2f92";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(originX, y);
      context.lineTo(originX + patternWidth, y);
      context.stroke();
    }
    context.restore();
  },
  drawExportUsage(context: CanvasContextLike, usage: BeadUsage[], startY: number, width: number) {
    if (!usage.length) {
      return;
    }
    const columns = this.exportUsageColumns(width);
    const chipWidth = Math.floor((width - 28) / columns);
    context.save();
    context.fillStyle = "#ffffff";
    context.fillRect(0, startY, width, this.exportUsageHeight(usage, width));
    context.fillStyle = "#111827";
    context.font = "18px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("????", 14, startY + 26);
    context.font = "14px sans-serif";
    usage.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const x = 14 + col * chipWidth;
      const y = startY + 54 + row * 34;
      context.fillStyle = `rgb(${item.beadRgb[0]}, ${item.beadRgb[1]}, ${item.beadRgb[2]})`;
      context.fillRect(x, y - 10, 20, 20);
      context.strokeStyle = "#334155";
      context.lineWidth = 1;
      context.strokeRect(x, y - 10, 20, 20);
      context.fillStyle = "#111827";
      context.fillText(`${item.beadCode} x ${item.count}`, x + 28, y);
    });
    context.restore();
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
          const progress = nextAiImageProgress(this.data.aiImageProgress, aiImage.status);
          this.setData({
            aiImageProgress: progress,
            aiImageProgressText: aiImageProgressText(aiImage.status, progress)
          });
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

  saveAiImageToAlbum() {
    const { aiImagePath } = this.data;
    if (!aiImagePath) {
      wx.showToast({ title: "没有 AI 图片", icon: "none" });
      return;
    }

    wx.downloadFile({
      url: aiImagePath,
      success: async (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300 || !response.tempFilePath) {
          wx.showToast({ title: "下载 AI 图片失败", icon: "none" });
          return;
        }
        await this.saveAiTempImageToAlbum(response.tempFilePath, aiImagePath);
      },
      fail: () => {
        wx.showToast({ title: "下载 AI 图片失败", icon: "none" });
      }
    });
  },

  async saveAiTempImageToAlbum(tempFilePath: string, previewUrl: string) {
    if (this.isDevtools()) {
      console.warn("[ai-image-export] devtools temp path cannot be saved to album", { tempFilePath, previewUrl });
      wx.previewImage({ current: previewUrl, urls: [previewUrl] });
      wx.showToast({ title: "PC 调试请在预览中保存，真机可保存到相册", icon: "none" });
      return;
    }

    console.log("[ai-image-export] save temp image to album", { tempFilePath });
    await this.saveTempImageToAlbum(tempFilePath);
  },

  exportPng() {
    this.drawPattern(true, async (tempFilePath) => {
      if (!tempFilePath) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }
      if (this.isDevtools()) {
        console.warn("[pattern-export] devtools temp path uses share image menu", { tempFilePath });
        this.showDevtoolsExportMenu(tempFilePath);
        return;
      }
      await this.saveTempImageToAlbum(tempFilePath);
    });
  },
  isPCEnvironment(): boolean {
    const sys = wx.getSystemInfoSync();
    // devtools 一定是 PC；windows/mac 为 PC 微信
    return sys.platform === 'windows' || sys.platform === 'mac';
  },

  isDevtools(): boolean {
    try {
      const sys = wx.getSystemInfoSync();
      return sys.platform === 'devtools';
    } catch {
      return false;
    }
  },

  async convertHttpTmpToLocal(tempFilePath: string): Promise<string> {
    console.log("convertHttpTmpToLocal - tempFilePath:", tempFilePath)
    // 已是有效本地路径，直接返回
    if (tempFilePath.startsWith('wxfile://') || tempFilePath.startsWith('file://')) {
      return tempFilePath;
    }

    // 如果不是 http://tmp/ 开头，可能已经是其他可读路径，尝试直接返回
    if (!tempFilePath.startsWith('http://tmp/') && !tempFilePath.startsWith('https://tmp/')) {
      return tempFilePath;
    }

    // http://tmp 开头
    // 检查离屏 canvas 支持
    if (typeof wx.createOffscreenCanvas !== 'function') {
      throw new Error('当前基础库不支持离屏 canvas，无法转换路径');
    }

    return new Promise((resolve, reject) => {
      const canvas = wx.createOffscreenCanvas({ type: '2d', width: 300, height: 300 });
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();

      img.onload = () => {
        // 可以按原图比例绘制，避免拉伸
        const ratio = img.width / img.height;
        let drawWidth = 300, drawHeight = 300;
        if (ratio > 1) {
          drawHeight = 300 / ratio;
        } else {
          drawWidth = 300 * ratio;
        }
        // 居中绘制
        ctx.drawImage(img, (300 - drawWidth) / 2, (300 - drawHeight) / 2, drawWidth, drawHeight);

        // 使用全局 API 导出临时文件
        wx.canvasToTempFilePath({
          canvas: canvas,
          success: (res) => resolve(res.tempFilePath), // 得到 wxfile:// 路径
          fail: reject
        });
      };

      img.onerror = reject;
      img.src = tempFilePath;
    });
  },

  async saveImageToDisk(tempFilePath: string): Promise<void> {
    try {
      // 先转换路径（如果是 http://tmp/）
      let localPath = await this.convertHttpTmpToLocal(tempFilePath);
      if (tempFilePath.startsWith('http://tmp/') || tempFilePath.startsWith('https://tmp/')) {
        localPath = await this.convertHttpTmpToLocal(tempFilePath);
      }

      return new Promise((resolve, reject) => {
        if (typeof wx.saveFileToDisk !== 'function') {
          reject(new Error('wx.saveFileToDisk 不可用，请升级基础库'));
          return;
        }
        wx.saveFileToDisk({
          filePath: localPath,
          success: () => {
            wx.showToast({ title: '保存成功', icon: 'success' });
            resolve();
          },
          fail: (err) => {
            console.error('saveFileToDisk 失败', err);
            wx.showToast({ title: '保存失败，请重试', icon: 'none' });
            reject(err);
          }
        });
      });
    } catch (error) {
      // 转换失败时的降级处理
      wx.showToast({ title: '图片处理失败，请使用预览后手动保存', icon: 'none' });
      console.error('转换路径失败', error);
      throw error; // 或根据需要处理
    }
  },


  generateFileName(originalPath: string): string {
    const ext = originalPath.split('.').pop() || 'png';
    return `saved_${Date.now()}.${ext}`;
  },

  async saveImageToUserData(tempFilePath: string): Promise<string> {
    const localPath = await this.convertHttpTmpToLocal(tempFilePath);

    // 2. 读取文件内容
    const fs = wx.getFileSystemManager();
    const data = fs.readFileSync(localPath, 'base64');

    // 3. 生成文件名（保留原扩展名）
    const ext = tempFilePath.split('.').pop() || 'png';
    const fileName = `saved_${Date.now()}.${ext}`;
    const savedPath = `${wx.env.USER_DATA_PATH}/${fileName}`;

    // 4. 写入 USER_DATA_PATH
    fs.writeFileSync(savedPath, data, 'base64');
    return savedPath;
  },

  showSaveSuccess(savedPath: string) {
    const fileName = savedPath.split('/').pop() || 'saved.png';

    // 判断是否在开发者工具中（路径包含 http://usr/）
    const isDevtools = savedPath.startsWith('http://usr/');

    if (isDevtools) {
      // 开发者工具专用提示：引导使用文件管理器
      wx.showModal({
        title: '保存成功',
        content: `图片已保存到开发者工具的用户目录（usr）中。\n\n请按以下步骤找到文件：\n1. 在开发者工具左上角点击「文件管理器」\n2. 选择「用户目录」\n3. 在文件夹中找到文件：${fileName}\n\n（你也可以复制以下虚拟路径到剪贴板，但无法直接在资源管理器打开：\n${savedPath}）`,
        showCancel: false,
        confirmText: '知道了'
      });
      // 顺便把文件名复制到剪贴板，方便用户搜索
      wx.setClipboardData({
        data: fileName,
        success: () => {
          console.log('文件名已复制');
        }
      });
    } else {
      // 真机或PC微信（非devtools）可使用真实路径复制
      wx.setClipboardData({
        data: savedPath,
        success: () => {
          wx.showModal({
            title: '保存成功',
            content: `图片已保存到：\n${savedPath}\n\n路径已复制到剪贴板，请打开「文件资源管理器」，在地址栏粘贴并回车，即可找到文件。`,
            showCancel: false,
            confirmText: '知道了'
          });
        },
        fail: () => {
          wx.showModal({
            title: '保存成功',
            content: `图片已保存到：\n${savedPath}\n请手动复制此路径，到资源管理器地址栏打开。`,
            showCancel: false
          });
        }
      });
    }
  },

  showSaveSuccessWithCopy(savedPath: string) {
    wx.setClipboardData({
      data: savedPath,
      success: () => {
        wx.showModal({
          title: '保存成功',
          content: `图片已保存到开发者工具本地目录：\n${savedPath}\n\n路径已复制到剪贴板，请打开「文件资源管理器」并粘贴到地址栏，即可找到该文件。`,
          confirmText: '预览图片',
          cancelText: '知道了',
          success: (res) => {
            if (res.confirm) {
              // 预览图片
              wx.previewImage({
                urls: [savedPath],
                fail: () => wx.showToast({ title: '预览失败', icon: 'none' })
              });
            }
          }
        });
      },
      fail: () => {
        // 复制失败仍然提示路径
        wx.showModal({
          title: '保存成功',
          content: `图片已保存到：\n${savedPath}\n请手动复制此路径，到资源管理器地址栏打开。`,
          confirmText: '预览',
          cancelText: '确定',
          success: (res) => {
            if (res.confirm) {
              wx.previewImage({ urls: [savedPath] });
            }
          }
        });
      }
    });
  },

  handleDevtoolsExport(tempFilePath: string) {
    wx.showModal({
      title: '开发者工具保存提示',
      content: '当前环境无法直接保存到系统相册。\n可选择「保存到本地目录」将图片存入开发者工具可访问的文件夹，并复制路径供你快速打开。',
      confirmText: '保存到本地',
      cancelText: '仅预览',
      success: async (res) => {
        if (res.confirm) {
          try {
            const savedPath = await this.saveImageToUserData(tempFilePath);
            this.showSaveSuccessWithCopy(savedPath);
          } catch (err) {
            wx.showToast({ title: '保存失败，请尝试预览', icon: 'none' });
            console.error('保存失败', err);
          }
        } else {
          // 仅预览
          wx.previewImage({
            urls: [tempFilePath],
            fail: () => wx.showToast({ title: '预览失败', icon: 'none' })
          });
        }
      },
      fail: () => {
        // 弹窗失败时降级为预览
        wx.previewImage({ urls: [tempFilePath] });
      }
    });
  },

  async exportImage() {
    this.drawPattern(true, async (tempFilePath) => {
      if (!tempFilePath) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }

      // 环境判断
      const isDev = this.isDevtools();
      const isPC = this.isPCEnvironment() || isDev;

      if (isDev) {
        // 开发者工具：保存到 USER_DATA_PATH 并复制路径
        try {
          const savedPath = await this.saveImageToUserData(tempFilePath);
          this.showSaveSuccess(savedPath);
        } catch (e) {
          wx.showToast({ title: "保存失败，请预览后手动保存", icon: "none" });
          console.error("保存失败", e);
          wx.previewImage({ urls: [tempFilePath] });
        }
        return;
      }

      if (isPC) {
        // PC 微信（非开发者工具）：优先尝试 wx.saveFileToDisk
        try {
          const localPath = await this.convertHttpTmpToLocal(tempFilePath);
          await new Promise((resolve, reject) => {
            wx.saveFileToDisk({
              filePath: localPath,
              success: resolve,
              fail: reject
            });
          });
          wx.showToast({ title: "保存成功", icon: "success" });
        } catch (e) {
          // 降级到 USER_DATA_PATH
          console.warn("saveFileToDisk 失败，降级到 USER_DATA_PATH", e);
          try {
            const savedPath = await this.saveImageToUserData(tempFilePath);
            this.showSaveSuccess(savedPath);
          } catch (e2) {
            wx.showToast({ title: "保存失败，请预览后手动保存", icon: "none" });
            wx.previewImage({ urls: [tempFilePath] });
          }
        }
        return;
      }

      // 手机端：保存到相册
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => wx.showToast({ title: "已保存到相册" }),
        fail: (err) => {
          wx.showToast({ title: "保存失败，请检查权限", icon: "none" });
          console.error("相册保存失败", err);
        }
      });
    });
  },



  showDevtoolsExportMenu(tempFilePath: string) {
    // PC 开发者工具：HTTP 临时路径无法直接用系统功能保存。
    // 先下载到本地，再用 saveFile 持久化到用户目录，
    // 最后 previewImage 打开预览（支持长按/右键保存）。
    console.log("[pattern-export] devtools export, downloading", { tempFilePath });
    wx.downloadFile({
      url: tempFilePath,
      success: async (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300 || !res.tempFilePath) {
          console.error("[pattern-export] downloadFile bad status", res.statusCode);
          wx.showToast({ title: "下载失败，请真机测试", icon: "none" });
          return;
        }
        const localPath = res.tempFilePath;
        console.log("[pattern-export] downloaded, saving to persistent storage", { localPath });

        // 将临时文件持久化到用户目录，PC 上可定位到文件
        try {
          const fs = wx.getFileSystemManager();
          const saved = await new Promise<{ savedFilePath: string }>((resolve, reject) => {
            fs.saveFile({
              tempFilePath: localPath,
              success: (res) => resolve(res),
              fail: (err) => reject(err)
            });
          });
          console.log("[pattern-export] saveFile success", { savedFilePath: saved.savedFilePath });
          // 预览图片，PC 上支持 Ctrl+S / 右键保存
          wx.previewImage({ urls: [saved.savedFilePath], current: saved.savedFilePath });
          wx.showToast({ title: "已保存到本地，可在预览中右键另存", icon: "success", duration: 2500 });
        } catch (saveErr) {
          console.warn("[pattern-export] saveFile failed, preview with download path", saveErr);
          wx.previewImage({ urls: [localPath], current: localPath });
          wx.showToast({ title: "请在预览中右键保存图片", icon: "none", duration: 2000 });
        }
      },
      fail: (err) => {
        console.error("[pattern-export] downloadFile failed", err);
        wx.showToast({ title: "下载失败，请真机测试", icon: "none" });
      }
    });
  },

  async saveTempImageToAlbum(tempFilePath: string) {
    if (this.isDevtools()) {
      console.warn("[pattern-export] skip album save for devtools temp path", { tempFilePath });
      this.showDevtoolsExportMenu(tempFilePath);
      return;
    }

    console.log("[pattern-export] save temp image to album", { tempFilePath });
    const result = await saveImageWithAlbumPermission(wx, tempFilePath);
    console.log("[pattern-export] album save result", { result, tempFilePath });
    if (result === "saved") {
      wx.showToast({ title: "已保存", icon: "success" });
      return;
    }
    if (result === "needs-settings") {
      wx.showModal({
        title: "需要相册权限",
        content: "请在设置中开启相册权限后重试",
        confirmText: "重试",
        cancelText: "取消",
        success: (modalResult) => {
          if (modalResult.confirm) {
            this.saveTempImageToAlbum(tempFilePath);
          }
        }
      });
      return;
    }
    wx.showToast({ title: "保存失败，请检查权限", icon: "none" });
  }
});
