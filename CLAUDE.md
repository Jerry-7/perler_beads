# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project summary

WeChat Mini Program + FastAPI backend for generating Perler bead (fuse bead) pattern sheets from uploaded images. Users upload an image, specify grid dimensions, and receive a bead placement chart with color codes and usage statistics.

- `miniprogram/` — Native WeChat Mini Program (TypeScript, no framework)
- `server/` — Python FastAPI backend (image processing, color matching, pixel art generation)
- `docs/` — API reference and pattern JSON spec

## Commands

### Backend (from `server/`)

```bash
# Run dev server
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Run all tests
python -m pytest

# Run a single test file
python -m pytest tests/test_api.py

# Run a specific test
python -m pytest tests/test_api.py -k test_generate_endpoint
```

### Frontend / Mini Program (from `miniprogram/`)

```bash
# Type-check (no emit — WeChat DevTools handles compilation)
npm run build          # tsc --noEmit

# Run all tests (compiles then runs Node test runner)
npm test               # tsc -p tsconfig.test.json && node --test dist-tests/**/*.test.js

# Run a single test file (after compilation)
npx tsc -p tsconfig.test.json && node --test dist-tests/utils/canvasSizing.test.js
```

Open `miniprogram/` in WeChat Developer Tools to preview the app. For local dev, set the backend URL in `miniprogram/miniprogram/utils/config.ts` to `http://127.0.0.1:8000` and enable "skip domain validation" in DevTools settings.

## Architecture

### Backend: generation pipeline

```
upload image → provider.convert() → color matching (CIEDE2000) → color simplification → RLE encode → response
```

**Provider pattern (`server/app/providers/`)** — `PixelArtProvider` is a Protocol with a single `convert()` method that turns image bytes into a `list[list[PixelArtCell]]` matrix. Two implementations:

- `MockPixelArtProvider` (the "local" provider) — Supports 11 sampling modes: `raw`, `edge`, `dominant`, `detail`, `smooth`, `nearest`, `coverage`, `center-shrink`, `grid-scan`, `ultra-small`, `line-art`. Each mode uses different region-sampling and edge-detection strategies. Despite the name, this is the production local provider.
- `AiPixelArtProvider` — Calls an OpenAI-compatible `/v1/images/edits` endpoint to generate a pixel-art version of the image, downloads the result, then delegates to `MockPixelArtProvider` for final pixelation.

Provider selection is controlled by `PIXEL_ART_PROVIDER` env var (`"local"` or `"ai"`).

**Color matching (`server/app/color_matching.py`)** — Uses **CIEDE2000** perceptual color distance (the industry standard), with RGB→CIELAB conversion (D65 reference white). Results cached via `@lru_cache`. The bead palette lives in `server/app/color_template/colors.json`.

**Color simplification (`server/app/services/color_simplification.py`)** — After palette matching, merges low-usage colors that are visually similar to more common ones. Five profiles: `MINIMAL`, `SIMPLE`, `BALANCED` (default), `DETAILED`, `ORIGINAL` (no merging).

**RLE encoding** — The final pattern matrix is run-length encoded before returning to the client to reduce payload size for large grids.

### Backend: API route structure

All routes are in `server/app/main.py`. Key groups:

| Prefix | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/palette` | Bead color palette |
| `POST /api/auth/wechat/login` | WeChat jscode2session → session token |
| `POST /api/admin/login` | Admin HMAC token |
| `POST /api/generations` | Create a pattern generation (multipart upload) |
| `GET /api/generations/{id}` | Poll generation status/result |
| `POST /api/pattern-size/recommendation` | Recommend grid size from image |
| `POST /api/pattern-debug/analyze` | Debug pixel-block visualization |
| `POST /api/ai-images` | Create AI-generated image (async) |
| `GET /api/ai-images/{id}` | Poll AI image status |
| `/api/ai-access/*` | Quota, orders, access keys, admin codes |
| `/api/admin/ai-access/*` | Admin key/code management |

### Backend: authentication

Two token types, both using HMAC-SHA256 signing:
- **Session tokens** — From WeChat login (`js_code` → `openid`). Payload: `{openid, exp}`. TTL configurable via `SESSION_TOKEN_TTL_DAYS`.
- **Admin tokens** — From username/password login. Payload: `{username, exp}`. TTL configurable via `AI_ADMIN_TOKEN_TTL_HOURS`.

Tokens are base64-encoded JSON bodies with a hex signature, passed as `Authorization: Bearer <token>`.

### Backend: async AI image generation

`POST /api/ai-images` spawns a `threading.Thread` to call the external AI API (may take minutes). Returns immediately with `status: "processing"`. The frontend polls `GET /api/ai-images/{id}` until `status: "completed"`, then fetches the result image.

### Backend: database

SQLite via `server/app/services/storage.py`. Schema includes tables for users, quota accounts, payment orders, access keys, admin codes, and AI image jobs. Connection uses `sqlite3.Row` factory. Test suite overrides `SQLITE_DB_PATH` to a temp directory via `conftest.py`.

### Frontend: page structure

The frontend is a **native WeChat Mini Program** — no React, Vue, or other framework. Pages use WeChat's `Page()` API with inline `Page.Data` types.

| Page | Path | Purpose |
|---|---|---|
| `pages/index/` | Main page | Image upload, AI generation, pattern generation, canvas viewer/editor (~2220 line controller) |
| `pages/home/` | Home tab | Community content, weekly creators |
| `pages/gallery/` | Gallery | Saved patterns |
| `pages/ai-access/` | AI access | Key redemption, quota purchase |
| `pages/ai-admin/` | Admin | Admin panel |

### Frontend: canvas-based pattern editor (`utils/patternCanvasEditor.ts`)

The main page renders patterns on a canvas with these interaction modes:
- **Pan** — Drag to move around
- **Point** — Single-cell paint
- **Paint** — Stroke painting
- **Picker** — Eyedropper to select a color from the canvas
- **Fill** — Flood fill
- **Trace** — Hover/selection detection (`utils/patternTracing.ts`)

Undo/redo uses a **patch history** approach (stores only changed cells, not full snapshots).

### Frontend: test setup

Tests use Node's built-in `node:test` runner (no Jest/Vitest). They are plain `.test.ts` files living alongside source files. `tsconfig.test.json` compiles them to `dist-tests/` with Node16 module resolution and DOM lib. Test files import from relative paths to the source TypeScript — they are compiled together, not bundled.

### Key environment variables (backend)

| Variable | Purpose | Default |
|---|---|---|
| `PIXEL_ART_PROVIDER` | `"local"` or `"ai"` | `local` |
| `AI_IMAGE_API_URL/KEY/MODEL` | External AI image generation API | packyapi.com / gpt-image-2 |
| `WECHAT_APP_ID/SECRET` | WeChat Mini Program credentials | — |
| `WECHAT_PAY_*` | WeChat Pay v3 integration | — |
| `SESSION_TOKEN_SECRET` | HMAC key for session tokens | `change-me` |
| `AI_ADMIN_*` | Admin credentials and token settings | — |
| `SQLITE_DB_PATH` | Database file path | `./data/perler_beads.sqlite3` |
