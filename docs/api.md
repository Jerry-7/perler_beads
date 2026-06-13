# API

## Color Complexity

`POST /api/generations` accepts an optional `colorComplexity` form field:

- `minimal`: fewest bead colors, merges similar low-usage colors most aggressively.
- `simple`: fewer bead colors, merges similar low-usage colors more aggressively.
- `balanced`: default backend behavior.
- `detailed`: preserves more color detail.
- `original`: keeps the original nearest-palette result without low-usage color merging.

## `GET /api/palette`

返回当前内置拼豆色板。

```json
{
  "version": "sample-v1",
  "colors": [
    {
      "code": "01",
      "name": "White",
      "rgb": [245, 245, 240],
      "enabled": true
    }
  ]
}
```

## `POST /api/pattern-size/recommendation`

`multipart/form-data`：

- `image`：图片文件

响应会按原图比例推荐图纸格数，最长边不超过 102 格：

```json
{
  "widthCells": 32,
  "heightCells": 24,
  "sourceWidth": 256,
  "sourceHeight": 192,
  "detectedBlockWidth": 8,
  "detectedBlockHeight": 8,
  "confidence": 0.96,
  "reason": "识别到约 8 x 8 像素块"
}
```

如果未稳定识别像素块，会回退到按原图比例推荐，并将最长边限制为 102 格。

## `POST /api/generations`

`multipart/form-data`：

- `image`：图片文件
- `widthCells`：目标宽度格数，1-200
- `heightCells`：目标高度格数，1-200
- `sourceMode`：可选，`auto`、`pixel-art` 或 `resample`。默认 `auto` 保持原比例并留白；`resample` 会强制重采样到指定宽高，适合 AI 生成图转为固定格数图纸。

响应：

```json
{
  "generationId": "abc123",
  "status": "completed"
}
```

## `GET /api/generations/{generationId}`

响应包含任务状态和生成结果。当前 v1 为同步生成，接口仍保留任务查询形态，方便后续改为异步队列。

```json
{
  "generationId": "abc123",
  "status": "completed",
  "error": null,
  "result": {
    "widthCells": 48,
    "heightCells": 48,
    "paletteVersion": "sample-v1",
    "cells": [],
    "usage": [],
    "generatedAt": "2026-06-11T00:00:00+00:00"
  }
}
```
