# 拼豆图纸生成器 — 图片转拼豆图纸技术分析

> 分析对象：https://www.pixel-beads.com/zh/perler-bead-pattern-generator
>
> 日期：2026-07-04

---

## 一、总体架构

**100% 浏览器端处理**，无需上传图片到服务器，保护用户隐私。

| 层级 | 技术方案 |
|------|----------|
| 图像加载与处理 | HTML5 Canvas API |
| 重计算任务 | Web Workers（防 UI 卡顿） |
| 颜色空间转换 | chroma.js 或自研实现 |
| 前端框架 | React + TypeScript + Vite |
| 样式 | Tailwind CSS |

### 整体流程

```
用户上传图片 → Canvas 缩放 → getImageData() 提取像素
    → RGB→LAB 转换 → CIEDE2000 颜色匹配（300+品牌色板）
    → 后处理优化 → 输出图纸（PDF/PNG/CSV）
```

---

## 二、核心转换流程

### 第 1 步：图片加载与像素化重采样

将用户上传的图片按目标网格尺寸（如 29×29、57×57，最大 100×100）进行降采样：

```javascript
const canvas = document.createElement('canvas');
canvas.width = targetWidth;   // 目标网格列数
canvas.height = targetHeight; // 目标网格行数
const ctx = canvas.getContext('2d');
ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
const pixelData = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
// pixelData 为 [R,G,B,A, R,G,B,A, ...] 格式的一维数组
```

关键技术点：
- 使用 `FileReader` 读取文件，转为 Data URL 后交给 Canvas
- 通过 `drawImage` 的后四个参数实现缩放，浏览器底层自动完成插值采样
- `getImageData()` 返回 `Uint8ClampedArray`，每个像素占 4 个字节

### 第 2 步：区域颜色采样（均值池化）

对每个网格单元格覆盖的原图区域，计算平均 RGB 颜色：

```javascript
for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < cellHeight; dy++) {
            for (let dx = 0; dx < cellWidth; dx++) {
                const idx = ((y * cellHeight + dy) * srcWidth + (x * cellWidth + dx)) * 4;
                r += pixelData[idx];
                g += pixelData[idx + 1];
                b += pixelData[idx + 2];
                count++;
            }
        }
        gridColors[y][x] = { r: r / count, g: g / count, b: b / count };
    }
}
```

> 另一种模式取**主导色（Dominant Color）**，即区域内出现频率最高的颜色值。

### 第 3 步：RGB → CIE-L\*a\*b\* 颜色空间转换

**为什么需要转换？** RGB 空间中的欧氏距离不能反映人眼感知的颜色差异。LAB 空间是感知均匀的——数值差异等于人眼感知差异。

转换路径：`sRGB → 线性 RGB（Gamma 校正）→ CIE-XYZ → CIE-L*a*b*`

```javascript
function rgbToLab(r, g, b) {
    // Step 1: sRGB → 线性 RGB（Gamma 逆校正）
    let rr = r / 255, gg = g / 255, bb = b / 255;
    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    // Step 2: 线性 RGB → XYZ（使用 D65 标准光源矩阵）
    const x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
    const y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750) / 1.00000;
    const z = (rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883;

    // Step 3: XYZ → LAB
    const fx = x > 0.008856 ? Math.cbrt(x) : (7.787 * x) + (16 / 116);
    const fy = y > 0.008856 ? Math.cbrt(y) : (7.787 * y) + (16 / 116);
    const fz = z > 0.008856 ? Math.cbrt(z) : (7.787 * z) + (16 / 116);

    return {
        l: (116 * fy) - 16,   // L*: 0=黑, 100=白
        a: 500 * (fx - fy),   // a*: 负=绿, 正=红
        b: 200 * (fy - fz)    // b*: 负=蓝, 正=黄
    };
}
```

### 第 4 步：感知颜色匹配（核心算法）

将每格的 LAB 值与数据库中的 **300+ 种真实品牌珠子颜色**（Perler、Artkal、MARD、Hama、Nabbi）逐一比较，选最接近的：

#### 方案对比

| 方法 | 公式 | 复杂度 | 感知准确性 |
|------|------|:------:|:----------:|
| RGB 欧氏距离 | `√((ΔR)² + (ΔG)² + (ΔB)²)` | 低 | ❌ 差 |
| LAB 欧氏距离 (ΔE₇₆) | `√((ΔL)² + (Δa)² + (Δb)²)` | 中 | ⚠️ 一般 |
| **CIEDE2000 (ΔE₀₀)** | 带权重的 LAB 色差公式 | 高 | ✅ 优秀 |

#### CIEDE2000 原理

CIEDE2000 在 LAB 色差基础上额外修正以下因素：

- **明度权重 SL** — 人眼对暗色和亮色的敏感度低于中等亮度
- **色度权重 SC** — 高饱和度颜色的差异感知更强
- **色相权重 SH** — 蓝色区域的色相差异比绿色区域更明显
- **旋转项 RT** — 修正蓝色区域（~275° 色相角）的椭圆旋转

```javascript
// CIEDE2000 核心结构（简化示意）
function ciede2000(lab1, lab2) {
    // 1. 计算 C'（修正色度）和 h'（修正色相角）
    const c1 = Math.sqrt(lab1.a ** 2 + lab1.b ** 2);
    const c2 = Math.sqrt(lab2.a ** 2 + lab2.b ** 2);
    const cBar = (c1 + c2) / 2;

    // 2. 计算 ΔL', ΔC', ΔH'（明度差、色度差、色相差）
    const deltaLPrime = lab2.l - lab1.l;
    const deltaCPrime = c2 - c1;
    const deltaHPrime = 2 * Math.sqrt(c1 * c2) * Math.sin(deltaH / 2);

    // 3. 应用权重因子 SL, SC, SH
    const sL = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
    const sC = 1 + 0.045 * cBar;
    const sH = 1 + 0.015 * cBar * t;

    // 4. 应用旋转项 RT
    const rT = -2 * Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7))
               * Math.sin(Math.PI * deltaTheta / 180);

    // 5. 返回 ΔE₀₀
    return Math.sqrt(
        (deltaLPrime / (kL * sL)) ** 2 +
        (deltaCPrime / (kC * sC)) ** 2 +
        (deltaHPrime / (kH * sH)) ** 2 +
        rT * (deltaCPrime / (kC * sC)) * (deltaHPrime / (kH * sH))
    );
}
```

> ΔE₀₀ 值越小越匹配：< 1.0 几乎无法区分，1.0~2.0 需仔细观察，> 5.0 明显不同。

### 第 5 步：后处理优化

| 处理步骤 | 算法 | 作用 |
|----------|------|------|
| **边缘检测与增强** | Sobel / Canny 算子 | 识别轮廓线并加粗边界，使图案更清晰 |
| **区域平滑** | BFS 连通区域合并 | 将颜色相近的相邻像素合并为同一色号，减少碎片 |
| **噪声抑制** | 孤立像素移除 | 删除周围没有同类颜色的散点 |
| **背景移除** | 洪水填充 (Flood Fill) | 识别并标记图片背景区域，可选保留或移除 |
| **智能裁剪** | 主体检测 | 自动裁掉边缘空白，使主体居中 |

---

## 三、用户可调参数

| 参数 | 说明 |
|------|------|
| **网格尺寸** | 29×29 ~ 100×100，决定图案精度和制作难度 |
| **品牌色板** | 切换 Perler / Artkal / MARD / Hama / Nabbi 色板 |
| **颜色数量限制** | 限制使用的颜色种类数（颜色量化） |
| **抗锯齿开关** | 关闭获得锐利的像素艺术效果 |
| **亮度 / 对比度** | 预处理调整原图 |
| **精确匹配 vs 近似聚合** | 聚合模式合并视觉相似的色号，减少购豆种类 |
| **手动编辑** | 点击替换单个珠子颜色，笔刷/填充工具批量编辑 |

---

## 四、Web Worker 多线程架构

为避免主线程阻塞，颜色计算在 Web Worker 中执行：

```
主线程（UI）                    Web Worker
    │                               │
    ├─ 用户调整参数 ─────────────────┤
    │                               ├─ RGB→LAB 转换
    │                               ├─ CIEDE2000 匹配
    │                               ├─ 后处理计算
    │                               │
    ├─ 显示加载状态 ←───────────────┤
    │                               │
    ├─ 接收结果数据 ←──────────── postMessage(结果)
    │                               │
    └─ Canvas 重新渲染              │
```

```javascript
// 主线程
const worker = new Worker('/workers/colorMatcher.js');
worker.postMessage({
    type: 'MATCH',
    pixels: gridColors,      // 待匹配的像素颜色数组
    palette: selectedPalette, // 选中的品牌色板
    settings: { maxColors, algorithm: 'CIEDE2000' }
});
worker.onmessage = (e) => {
    const { matches } = e.data;
    renderGrid(matches);     // 渲染结果网格
};
```

---

## 五、导出格式

| 格式 | 内容 |
|------|------|
| **PDF** | 带坐标网格、色号标注、图例和用豆统计表的可打印图纸 |
| **PNG** | 高清像素图，可选透明背景（叠加到实体 pegboard 上对比） |
| **CSV** | 材料清单：每种色号 + 所需数量，方便采购 |
| **分享卡片** | 含二维码的分享图，扫码可回到可编辑项目 |

---

## 六、关键技术要点总结

1. **CIEDE2000 感知色彩匹配**是核心壁垒——比简单 RGB/LAB 欧氏距离更符合人眼感知，选出的珠子颜色"看起来就是对的"
2. **Web Worker 多线程**确保参数实时调整时 UI 不冻结
3. **100% 本地处理**无需服务器，隐私友好
4. **品牌色板数据库**需要精确采集每一种真实珠子的 LAB 色彩值，这是另一项关键资产

---

## 七、相关开源项目

| 项目 | 地址 | 技术栈 |
|------|------|--------|
| PixelBead AI Studio | `github.com/poweredbyalgo/PixelBead` | React + TypeScript + Vite |
| Perler Beads Generator | `github.com/Zippland/perler-beads` | Next.js + React + TypeScript |
| Perler Beads AI 增强版 | `github.com/liangdabiao/perler-beads-ai` | Next.js + 火山引擎 AI |

---

## 参考来源

- [pixel-beads.com 官网](https://www.pixel-beads.com/zh/perler-bead-pattern-generator)
- [PixelBead GitHub](https://github.com/poweredbyalgo/PixelBead)
- [Zippland Perler Beads Generator](https://github.com/Zippland/perler-beads)
- [Building Pixelbead - Dev.to](https://dev.to/lurline_244691a114512c06e/building-pixelbead-a-free-browser-based-photo-to-bead-pattern-maker-51jo)
- [非AI技术路径下的网站开发实践：以拼豆图纸生成器为例 - 百度开发者](https://developer.baidu.com/article/detail.html?id=7767548)
- [perler-beads-ai 开源项目](https://github.com/liangdabiao/perler-beads-ai)
