# API

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

## `POST /api/generations`

`multipart/form-data`：

- `image`：图片文件
- `widthCells`：目标宽度格数，1-200
- `heightCells`：目标高度格数，1-200

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
