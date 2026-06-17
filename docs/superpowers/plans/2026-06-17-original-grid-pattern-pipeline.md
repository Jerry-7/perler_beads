# Original Grid Pattern Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild AI-image-to-pattern conversion so it first creates a high-fidelity original-color grid, then scales that grid to the user-selected size before bead color matching.

**Architecture:** Keep the public `/api/generations` contract unchanged. Replace the provider-side direct image-to-target sampling path with a fixed pipeline: normalize the image into an internal RGB grid capped by a max side length, downscale that RGB grid using region colors, then let `GenerationStore` match bead colors and apply the existing max color limit.

**Tech Stack:** FastAPI, Pillow, pytest, existing mini program client.

---

### Task 1: Add Regression Tests For The New Pipeline

**Files:**
- Modify: `server/tests/test_generation.py`

- [ ] Add a test showing a thin line preserved when scaling from the original grid to a smaller pattern.
- [ ] Add a test showing isolated source pixels are not allowed to dominate the scaled result.
- [ ] Run `python -m pytest tests\test_generation.py::test_original_grid_pipeline_preserves_scaled_boundary tests\test_generation.py::test_original_grid_pipeline_resists_single_pixel_noise -q` and confirm the first test fails under the current provider.

### Task 2: Replace Provider Sampling With Original Grid Pipeline

**Files:**
- Modify: `server/app/providers/mock_pixel_art.py`

- [ ] Add `ORIGINAL_GRID_MAX_SIDE = 768`.
- [ ] Add `make_original_color_grid(image)` that keeps original size when possible and shrinks only oversized images with `LANCZOS`.
- [ ] Add `scale_original_grid_to_cells(image, width_cells, height_cells)` that computes every target cell from its covered source region.
- [ ] Use a robust region picker: return a meaningful minority edge color only when it has enough coverage and contrast; otherwise return the dominant quantized color average.
- [ ] Make `source_mode="resample"` use this pipeline and ignore old sampling-mode branches.
- [ ] Run the two new regression tests and existing provider tests.

### Task 3: Full Verification

**Files:**
- All changed backend files

- [ ] Run `python -m pytest` in `server`.
- [ ] Run `npm.cmd test` and `npm.cmd run build` in `miniprogram` to ensure unchanged client code still compiles.
