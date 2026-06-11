import { getGeneration, uploadGeneration } from "../../utils/api";
import type { BeadUsage, PatternResult } from "../../utils/types";
import { isEmptyCell } from "../../utils/types";

const MIN_CELL_SIZE = 16;
const MAX_CANVAS_CSS_WIDTH = 680;

Page({
  data: {
    imagePath: "",
    widthCells: 48,
    heightCells: 48,
    isGenerating: false,
    canGenerate: false,
    result: null as PatternResult | null,
    usage: [] as BeadUsage[],
    canvasCssWidth: 320,
    canvasCssHeight: 320
  },

  chooseImage() {
    const setSelectedImage = (path: string) => {
      this.setData({
        imagePath: path,
        canGenerate: true
      });
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

  async generatePattern() {
    const { imagePath, widthCells, heightCells } = this.data;
    if (!imagePath || widthCells < 1 || heightCells < 1) {
      wx.showToast({ title: "请先选择图片和格数", icon: "none" });
      return;
    }

    this.setData({ isGenerating: true });
    try {
      const created = await uploadGeneration(imagePath, widthCells, heightCells);
      const completed = await this.waitForGeneration(created.generationId);
      if (completed.status !== "completed" || !completed.result) {
        throw new Error(completed.error || "生成失败");
      }

      const canvasSize = this.calculateCanvasSize(completed.result);
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

  calculateCanvasSize(result: PatternResult) {
    const cellSize = Math.max(MIN_CELL_SIZE, Math.floor(MAX_CANVAS_CSS_WIDTH / result.widthCells));
    return {
      width: result.widthCells * cellSize,
      height: result.heightCells * cellSize
    };
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
        context.font = `${Math.max(8, Math.floor(cellSize * 0.38))}px sans-serif`;

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
              context.fillStyle = this.textColorFor(cell.beadRgb);
              context.fillText(cell.beadCode, x + cellSize / 2, y + cellSize / 2);
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

  exportPng() {
    this.drawPattern(true, (tempFilePath) => {
      if (!tempFilePath) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => wx.showToast({ title: "已保存图片", icon: "success" }),
        fail: () => wx.showToast({ title: "保存失败，请检查权限", icon: "none" })
      });
    });
  },

  exportJson() {
    if (!this.data.result) {
      return;
    }

    const fileName = `${wx.env.USER_DATA_PATH}/perler-pattern-${Date.now()}.json`;
    const fileSystem = wx.getFileSystemManager();
    fileSystem.writeFile({
      filePath: fileName,
      data: JSON.stringify(this.data.result, null, 2),
      encoding: "utf8",
      success: () => {
        wx.showModal({
          title: "JSON 已导出",
          content: fileName,
          showCancel: false
        });
      },
      fail: () => wx.showToast({ title: "JSON 导出失败", icon: "none" })
    });
  }
});
