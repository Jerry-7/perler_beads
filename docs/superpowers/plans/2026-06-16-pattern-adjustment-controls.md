# Pattern Adjustment Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose pattern size during the AI-image-to-pattern step and improve conversion modes so boundaries and details survive better.

**Architecture:** Keep `/api/ai-images` and `/api/generations` separated. The mini program will show size controls in the pattern adjustment panel, and the backend will keep the same `samplingMode` form field while upgrading each mode to a stronger image-processing strategy.

**Tech Stack:** WeChat mini program TypeScript/WXML, FastAPI, Pillow, pytest, TypeScript compiler tests.

---

### Task 1: Move Pattern Size Controls To Pattern Adjustment

**Files:**
- Modify: `miniprogram/miniprogram/pages/index/index.wxml`
- Test: `miniprogram/miniprogram/pages/index/indexLayout.test.ts`

- [ ] Add a test that verifies the size picker appears inside the `图纸调整` panel.
- [ ] Move the existing target size picker and custom width/height inputs from the AI generation panel into the `图纸调整` panel.
- [ ] Keep `generateAiImage` and `generatePattern` using the same `widthCells` and `heightCells` state so pattern generation can use the latest selected size.
- [ ] Run `npm.cmd test` and `npm.cmd run build` in `miniprogram`.

### Task 2: Rename Pattern Effect Modes

**Files:**
- Modify: `miniprogram/miniprogram/utils/samplingModeOptions.ts`
- Test: `miniprogram/miniprogram/utils/samplingModeOptions.test.ts`

- [ ] Change option labels to `清晰轮廓`, `保留细节`, `干净色块`, and `锐利像素`.
- [ ] Keep backend values as `dominant`, `detail`, `smooth`, and `nearest`.
- [ ] Run `npm.cmd test` in `miniprogram`.

### Task 3: Upgrade Local Raster-To-Pattern Modes

**Files:**
- Modify: `server/app/providers/mock_pixel_art.py`
- Test: `server/tests/test_generation.py`

- [ ] Add tests for edge-aware, detail-preserving, clean-block, and nearest modes with small synthetic images.
- [ ] Implement `dominant` as edge-aware region color selection that prefers high-contrast boundary pixels when a region contains a meaningful edge.
- [ ] Implement `detail` as contrast-enhanced selection that preserves high-contrast minority details.
- [ ] Implement `smooth` as a clean-block path that smooths first, then samples stable region colors.
- [ ] Keep `nearest` as center-pixel hard sampling.
- [ ] Run `python -m pytest tests\test_generation.py -q` in `server`.

### Task 4: Final Verification

**Files:**
- All changed files

- [ ] Run `python -m pytest` in `server`.
- [ ] Run `npm.cmd test` in `miniprogram`.
- [ ] Run `npm.cmd run build` in `miniprogram`.
