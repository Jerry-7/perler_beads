# 图纸 JSON 结构

图纸结果是固定宽高的二维矩阵，矩阵尺寸严格等于用户输入的 `widthCells x heightCells`。

## 普通拼豆格

```json
{
  "x": 12,
  "y": 8,
  "sourceRgb": [221, 40, 35],
  "beadCode": "05",
  "beadName": "Red",
  "beadRgb": [205, 35, 45],
  "distance": 19.235
}
```

## 留白格

```json
{
  "x": 0,
  "y": 0,
  "empty": true
}
```

留白格不含 `beadCode`，不参与色号用量统计。

## 用量统计

`usage` 只统计普通拼豆格：

```json
[
  {
    "beadCode": "05",
    "beadName": "Red",
    "beadRgb": [205, 35, 45],
    "count": 128
  }
]
```
