# Perler Beads Pattern Generator

微信小程序拼豆图纸生成器 v1。

## 项目结构

- `miniprogram/`：原生微信小程序 + TypeScript
- `server/`：Python FastAPI 后端
- `docs/`：接口和数据结构说明

## 后端快速启动

```powershell
cd server
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 小程序开发

1. 使用微信开发者工具导入 `miniprogram/`。
2. 在 `miniprogram/miniprogram/utils/config.ts` 中确认后端地址。
3. 启动后端后，在小程序首页选择图片并生成图纸。

## 当前能力

- 上传图片并指定输出格数宽高。
- 留白适配：不拉伸、不裁切，留白格不分配色号。
- 非留白像素匹配最近拼豆颜色。
- 图纸网格中显示拼豆颜色编号。
- 统计非留白区域的色号用量。
- 导出 PNG 图纸和 JSON 工程数据。
