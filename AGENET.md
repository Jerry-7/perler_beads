# AGENET.md

## Project Overview

This repository contains a WeChat Mini Program and a FastAPI backend for generating perler bead pattern sheets from uploaded images.

- `miniprogram/`: native WeChat Mini Program written in TypeScript.
- `server/`: Python FastAPI backend for image pixelation, palette matching, and pattern generation.
- `docs/`: API and pattern JSON documentation.

## Core Workflow

1. The user uploads an image in the Mini Program.
2. The user chooses the target grid width and height.
3. The Mini Program uploads the image and grid settings to the backend.
4. The backend converts the image into a fixed-size pixel grid.
5. Letterbox/empty cells are marked with `empty: true` and do not receive bead color codes.
6. Non-empty pixels are matched to the nearest enabled bead color by RGB distance.
7. The backend returns a pattern matrix and bead usage summary.
8. The Mini Program renders the numbered grid and supports PNG/JSON export.

## Backend

Run from `server/`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run tests:

```powershell
python -m pytest
```

The default palette is loaded from:

```text
server/app/color_template/colors.json
```

The palette extraction script is:

```text
server/app/color_template/extract_palette_pdf.py
```

## Mini Program

Open `miniprogram/` in WeChat Developer Tools.

The backend base URL is configured in:

```text
miniprogram/miniprogram/utils/config.ts
```

For local development, keep:

```ts
export const API_BASE_URL = "http://127.0.0.1:8000";
```

If requests fail in WeChat Developer Tools, enable the local setting that skips legal domain, TLS, and HTTPS certificate validation.

## Conventions

- Keep empty/letterbox cells free of bead codes.
- Keep bead color matching centralized in the backend.
- Preserve the provider abstraction for future third-party AI pixelation integration.
- Do not commit generated caches such as `__pycache__`, `.pytest_cache`, or `node_modules`.
- Prefer focused tests for color matching, empty-cell handling, API responses, and matrix dimensions.
