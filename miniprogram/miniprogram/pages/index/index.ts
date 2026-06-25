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
  normalizeAiMaxColorsInput,
  type AiEffect3d,
  type AiShading,
  type AiStyle
} from "../../utils/aiGenerationOptions";
import { aiImageProgressText, nextAiImageProgress } from "../../utils/aiImageProgress";
import { aiImageUrl, createAiImage, getAiImage, getGeneration, getPalette, recommendPatternSize, uploadGeneration, type ColorComplexity } from "../../utils/api";
import { calculatePreviewCanvasSize, calculateZoomedCanvasSize } from "../../utils/canvasSizing";
import {
  createEditorHistory,
  floodFillPattern,
  getCellFromEditorTouchPoint,
  getEditorTouchDistance,
  pushEditorHistory,
  redoEditorHistory,
  resolveEditorTouchPoint,
  undoEditorHistory,
  type EditorHistory
} from "../../utils/patternCanvasEditor";
import { shouldDrawCellLabel } from "../../utils/patternDrawing";
import { filterPaletteColors, replacePatternCellColor, replacePatternCellsColor } from "../../utils/patternEditing";
import { previewPatternImage } from "../../utils/patternPreview";
import { applyPatternSizeOption, PATTERN_SIZE_OPTIONS } from "../../utils/patternSizeOptions";
import { buildPatternSizeWarning } from "../../utils/patternSizeWarning";
import { formatTraceCellStatus, getCanvasPointFromEvent, getPatternCellFromPoint, type CanvasPointEvent } from "../../utils/patternTracing";
import { saveImageWithAlbumPermission } from "../../utils/photoAlbum";
import { DEFAULT_SAMPLING_MODE_INDEX, SAMPLING_MODE_OPTIONS, type SamplingMode } from "../../utils/samplingModeOptions";
import type { BeadUsage, PaletteColor, PatternCell, PatternResult, PatternSizeRecommendation, Rgb } from "../../utils/types";
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
let editorHistoryCache: EditorHistory<PatternResult> | null = null;
let editorStrokeKeysCache: MarkedCells = {};
let editorDrawPending = false;

type CanvasContextLike = {
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
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
    patternMaxColors: DEFAULT_AI_MAX_COLORS as number | "",
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
    this.setData({ activeTool: "ai" });
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

  onPatternMaxColorsInput(event: WechatMiniprogram.Input) {
    this.setData({ patternMaxColors: normalizeAiMaxColorsInput(event.detail.value) });
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

    this.setData({
      isGeneratingAiImage: true,
      aiImageProgress: 12,
      aiImageProgressText: aiImageProgressText("pending", 12)
    });
    try {
      const created = await createAiImage({
        imagePath,
        widthCells,
        heightCells,
        aiDetail,
        aiStyle,
        aiEffect3d,
        aiShading
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
    const { imagePath, aiImageId, patternSource, widthCells, heightCells, colorComplexity, samplingMode, patternMaxColors } = this.data;
    const normalizedMaxColors = patternMaxColors === "" ? DEFAULT_AI_MAX_COLORS : normalizeAiMaxColors(Number(patternMaxColors));
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
        aiMaxColors: normalizedMaxColors
      });
      const completed = await this.waitForGeneration(created.generationId);
      if (completed.status !== "completed" || !completed.result) {
        throw new Error(completed.error || "图纸生成失败");
      }

      const canvasSize = calculatePreviewCanvasSize(completed.result, wx.getSystemInfoSync().windowWidth);
      const resultBeadCount = this.calculateUsageTotal(completed.result.usage);
      this.setData({
        result: completed.result,
        usage: completed.result.usage,
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
    this.setData({
      editSearchQuery: query,
      editSearchResults: filterPaletteColors(this.data.paletteColors, query, this.data.editPaletteDropdownOpen ? 80 : 12)
    });
  },

  toggleEditPaletteDropdown() {
    const nextOpen = !this.data.editPaletteDropdownOpen;
    this.setData({
      editPaletteDropdownOpen: nextOpen,
      editSearchResults: nextOpen ? filterPaletteColors(this.data.paletteColors, this.data.editSearchQuery, 80) : this.data.editSearchResults
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
    for (const item of candidateUsage.slice(0, 18)) {
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
      if (currentPaletteColor) {
        addCandidate({
          ...currentPaletteColor,
          countLabel: "新颜色"
        });
      }
    }

    return Object.values(byCode).slice(0, 18);
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
      this.applyEditorColor(selection.row, selection.col, paletteColor, true);
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
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },
  highlightUsageColor(event: WechatMiniprogram.TouchEvent) {
    const code = event.currentTarget.dataset.code as string | undefined;
    this.setData({ highlightedBeadCode: this.data.highlightedBeadCode === code ? "" : code || "" });
    wx.nextTick(() => {
      this.drawEditorCanvas();
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
      this.setData({ editorTouchMode: "paint" });
      this.paintEditorCell(cell.row, cell.col, true, true);
      return;
    }
    this.handleEditorCellAction(cell.row, cell.col, true);
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
        this.paintEditorCell(cell.row, cell.col, false, true);
      } else {
        this.clearEditorGuideCell();
      }
    }
  },

  onEditorCanvasTouchEnd() {
    editorStrokeKeysCache = {};
    this.setData({
      editorTouchMode: "idle",
      editorPinchStartDistance: 0
    });
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

  handleEditorCellAction(row: number, col: number, saveHistory: boolean) {
    const result = this.data.result;
    if (!result) {
      return;
    }
    const cell = result.cells[row]?.[col];
    if (!cell || isEmptyCell(cell)) {
      wx.showToast({ title: "空格子", icon: "none" });
      return;
    }

    if (this.data.editorTool === "picker") {
      if (!isBeadCell(cell)) {
        this.setData({ editorStatusText: "该原色格还没有色号，请选择一个色号进行替换。" });
        return;
      }
      this.setActiveEditColor({ code: cell.beadCode, name: cell.beadName, rgb: cell.beadRgb, enabled: true });
      this.setData({ editorTool: "point", editorStatusText: "已吸取颜色，点击格子即可上色。" });
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

    this.paintEditorCell(row, col, saveHistory, false);
  },

  paintEditorCell(row: number, col: number, saveHistory: boolean, isStroke: boolean) {
    const color = this.data.activeEditColor;
    if (!color) {
      wx.showToast({ title: "请先选择颜色", icon: "none" });
      return;
    }
    const key = `${row}-${col}`;
    if (isStroke && editorStrokeKeysCache[key]) {
      return;
    }
    this.applyEditorColor(row, col, color, saveHistory);
    if (isStroke) {
      editorStrokeKeysCache = { ...editorStrokeKeysCache, [key]: true };
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
    const nextResult = replacePatternCellsColor(result, positions, paletteColor);
    if (nextResult === result) {
      return;
    }
    this.commitEditorResult(nextResult, `${paletteColor.code} filled ${positions.length} cells`, true, `${row}-${col}`);
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

  applyEditorColor(row: number, col: number, paletteColor: PaletteColor, saveHistory: boolean) {
    const result = this.data.result;
    if (!result) {
      return;
    }
    const nextResult = this.replaceCellInResult(result, row, col, paletteColor);
    if (nextResult === result) {
      return;
    }
    this.commitEditorResult(nextResult, `${paletteColor.code} applied at row ${row + 1}, col ${col + 1}`, saveHistory, `${row}-${col}`);
  },

  replaceCellInResult(result: PatternResult, row: number, col: number, paletteColor: PaletteColor): PatternResult {
    const nextResult = replacePatternCellColor(result, row, col, paletteColor);
    return nextResult;
  },

  commitEditorResult(nextResult: PatternResult, statusText: string, saveHistory: boolean, selectedKey: string) {
    const result = this.data.result;
    if (!editorHistoryCache) {
      editorHistoryCache = createEditorHistory(result ?? nextResult);
    }
    editorHistoryCache = saveHistory
      ? pushEditorHistory(editorHistoryCache, nextResult)
      : { ...editorHistoryCache, current: nextResult };
    this.data.result = nextResult;
    this.data.usage = nextResult.usage;
    this.setData({
      usage: nextResult.usage,
      resultBeadCount: this.calculateUsageTotal(nextResult.usage),
      editorUndoCount: editorHistoryCache.past.length,
      editorRedoCount: editorHistoryCache.future.length,
      editorStatusText: statusText,
      hoveredTraceCellKey: selectedKey,
      selectedEditCell: this.selectionFromKey(selectedKey),
      selectedEditCellText: this.formatSelectedEditCellText(nextResult, selectedKey),
      editCandidateColors: this.buildEditCandidateColors(this.data.activeEditColor?.code, nextResult.usage),
      editPaletteDropdownOpen: false
    });
    wx.nextTick(() => {
      this.drawEditorCanvas();
    });
  },

  undoEditorChange() {
    if (!editorHistoryCache) {
      return;
    }
    const previousHistory = editorHistoryCache;
    const nextHistory = undoEditorHistory(previousHistory);
    if (nextHistory === previousHistory) {
      return;
    }
    editorHistoryCache = nextHistory;
    const previous = nextHistory.current;
    this.data.result = previous;
    this.data.usage = previous.usage;
    this.setData({
      usage: previous.usage,
      resultBeadCount: this.calculateUsageTotal(previous.usage),
      editorUndoCount: nextHistory.past.length,
      editorRedoCount: nextHistory.future.length,
      editorStatusText: "???",
      selectedEditCellText: this.formatSelectedEditCellText(previous, this.data.hoveredTraceCellKey),
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
    const previousHistory = editorHistoryCache;
    const nextHistory = redoEditorHistory(previousHistory);
    if (nextHistory === previousHistory) {
      return;
    }
    editorHistoryCache = nextHistory;
    const next = nextHistory.current;
    this.data.result = next;
    this.data.usage = next.usage;
    this.setData({
      usage: next.usage,
      resultBeadCount: this.calculateUsageTotal(next.usage),
      editorUndoCount: nextHistory.past.length,
      editorRedoCount: nextHistory.future.length,
      editorStatusText: "???",
      selectedEditCellText: this.formatSelectedEditCellText(next, this.data.hoveredTraceCellKey),
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

    editorHistoryCache = createEditorHistory(pattern);
    editorStrokeKeysCache = {};

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

    const query = wx.createSelectorQuery();
    query
      .select("#editorPatternCanvas")
      .fields({ node: true, size: true })
      .exec((response) => {
        const canvas = response[0]?.node as WechatMiniprogram.Canvas | undefined;
        if (!canvas) {
          return;
        }
        const width = this.data.editorCanvasCssWidth;
        const height = this.data.editorCanvasCssHeight;
        const pixelRatio = wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        const context = canvas.getContext("2d") as unknown as CanvasContextLike;
        context.scale(pixelRatio, pixelRatio);
        context.clearRect(0, 0, width, height);
        context.fillStyle = "#f8fafc";
        context.fillRect(0, 0, width, height);
        this.drawEditorRulers(context, result);
        this.drawEditorCells(context, result);
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
    context.textAlign = "center";
    context.textBaseline = "middle";
    if (drawLabels) {
      context.font = `${Math.max(8, Math.floor(cellSize * 0.32))}px sans-serif`;
    }

    for (const row of result.cells) {
      for (const cell of row) {
        const x = originX + cell.x * cellSize;
        const y = originY + cell.y * cellSize;
        const displayRgb = isBeadCell(cell) ? cell.beadRgb : isEmptyCell(cell) ? [248, 250, 252] : cell.sourceRgb;
        context.fillStyle = `rgb(${displayRgb[0]}, ${displayRgb[1]}, ${displayRgb[2]})`;
        context.globalAlpha = highlighted && isBeadCell(cell) && cell.beadCode !== highlighted ? 0.28 : 1;
        context.fillRect(x, y, cellSize, cellSize);
        if (drawLabels && isBeadCell(cell)) {
          context.fillStyle = this.textColorFor(displayRgb as Rgb);
          context.globalAlpha = highlighted && cell.beadCode !== highlighted ? 0.35 : 0.95;
          context.fillText(cell.beadCode, x + cellSize / 2, y + cellSize / 2);
        }
      }
    }
    context.globalAlpha = 1;
    this.drawEditorGrid(context, result, originX, originY, cellSize);
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
  drawEditorGrid(context: CanvasContextLike, result: PatternResult, originX: number, originY: number, cellSize: number) {
    const width = result.widthCells * cellSize;
    const height = result.heightCells * cellSize;
    context.save();
    for (let col = 0; col <= result.widthCells; col += 1) {
      const x = originX + col * cellSize;
      const isMajor = col % 10 === 0;
      const isGroup = col % 5 === 0;
      context.strokeStyle = isMajor ? "#111827" : isGroup ? "#64748b" : "rgba(148, 163, 184, 0.55)";
      context.lineWidth = isMajor ? 1.4 : isGroup ? 1 : 0.5;
      context.beginPath();
      context.moveTo(x, originY);
      context.lineTo(x, originY + height);
      context.stroke();
    }
    for (let row = 0; row <= result.heightCells; row += 1) {
      const y = originY + row * cellSize;
      const isMajor = row % 10 === 0;
      const isGroup = row % 5 === 0;
      context.strokeStyle = isMajor ? "#111827" : isGroup ? "#64748b" : "rgba(148, 163, 184, 0.55)";
      context.lineWidth = isMajor ? 1.4 : isGroup ? 1 : 0.5;
      context.beginPath();
      context.moveTo(originX, y);
      context.lineTo(originX + width, y);
      context.stroke();
    }
    context.restore();
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
        const rulerSize = forExport ? 42 : 0;
        const patternWidth = result.widthCells * cellSize;
        const patternHeight = result.heightCells * cellSize;
        const width = patternWidth + rulerSize;
        const exportStatsHeight = forExport ? this.exportUsageHeight(result.usage, width) : 0;
        const height = patternHeight + rulerSize + exportStatsHeight;
        const pixelRatio = forExport ? 2 : wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;

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
        await this.saveTempImageToAlbum(response.tempFilePath);
      },
      fail: () => {
        wx.showToast({ title: "下载 AI 图片失败", icon: "none" });
      }
    });
  },

  exportPng() {
    this.drawPattern(true, async (tempFilePath) => {
      if (!tempFilePath) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }
      await this.saveTempImageToAlbum(tempFilePath);
    });
  },

  async saveTempImageToAlbum(tempFilePath: string) {
    const result = await saveImageWithAlbumPermission(wx, tempFilePath);
    if (result === "saved") {
      wx.showToast({ title: "已保存", icon: "success" });
      return;
    }
    if (result === "needs-settings") {
      wx.showToast({ title: "请在设置中允许访问相册", icon: "none" });
      return;
    }
    wx.showToast({ title: "保存失败，请检查权限", icon: "none" });
  }
});
