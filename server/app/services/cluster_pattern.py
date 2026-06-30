"""
Color-clustering grid-scan pattern generation.

Two sampling modes:
  - ``cluster-ms``  — Mean Shift clustering in CIELAB space (perceptually uniform).
  - ``cluster-dbscan`` — DBSCAN density clustering in BGR space.

Both modes detect a grid in the uploaded image, extract the dominant colour
of each cell, then cluster similar colours together before matching to the
bead palette.  This reduces the effective colour count while preserving the
visual structure of the original grid.
"""

from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.color_matching import find_nearest_color
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, PixelCell
from app.palette import PALETTE_VERSION
from app.services.grid_scan_pattern import (
    GridScanPatternError,
    detect_grid_lines,
    force_expected_grid_size,
    is_background,
    sample_cell_color_by_coverage,
    encode_grid_rows_as_rle,
    MAX_GRID_CELLS,
)


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ClusterParams:
    """Parameters forwarded by the generation store."""


def process_cluster_ms_bead_pattern(
    image_bytes: bytes,
    bead_palette: list[PaletteColor],
    target_width: int | None = None,
    target_height: int | None = None,
    quantile: float = 0.2,
) -> PatternResult:
    """Mean-Shift (CIELAB) clustering pipeline."""
    return _process_cluster_bead_pattern(
        image_bytes=image_bytes,
        bead_palette=bead_palette,
        target_width=target_width,
        target_height=target_height,
        algorithm="meanshift",
        quantile=quantile,
    )


def process_cluster_dbscan_bead_pattern(
    image_bytes: bytes,
    bead_palette: list[PaletteColor],
    target_width: int | None = None,
    target_height: int | None = None,
    eps: float = 30.0,
) -> PatternResult:
    """DBSCAN (BGR) clustering pipeline."""
    return _process_cluster_bead_pattern(
        image_bytes=image_bytes,
        bead_palette=bead_palette,
        target_width=target_width,
        target_height=target_height,
        algorithm="dbscan",
        eps=eps,
    )


# ---------------------------------------------------------------------------
# Shared pipeline
# ---------------------------------------------------------------------------

def _process_cluster_bead_pattern(
    image_bytes: bytes,
    bead_palette: list[PaletteColor],
    target_width: int | None,
    target_height: int | None,
    algorithm: str,
    quantile: float = 0.2,
    eps: float = 30.0,
) -> PatternResult:
    # --- load image --------------------------------------------------------
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise GridScanPatternError("Uploaded file is not a supported image") from exc
    if image.width <= 0 or image.height <= 0:
        raise GridScanPatternError("Uploaded image has invalid dimensions")

    # --- detect grid -------------------------------------------------------
    vertical_lines = detect_grid_lines(image, axis="x", expected_cells=target_width)
    horizontal_lines = detect_grid_lines(image, axis="y", expected_cells=target_height)
    vertical_lines = force_expected_grid_size(vertical_lines, target_width)
    horizontal_lines = force_expected_grid_size(horizontal_lines, target_height)
    width_cells = len(vertical_lines) - 1
    height_cells = len(horizontal_lines) - 1
    if width_cells <= 0 or height_cells <= 0:
        raise GridScanPatternError("Could not detect enough grid lines")
    if width_cells > MAX_GRID_CELLS or height_cells > MAX_GRID_CELLS:
        raise GridScanPatternError("Detected grid size is too large")

    # --- extract per-cell dominant colours ---------------------------------
    cell_colors_bgr: list[tuple[int, int, int]] = []
    cell_coords: list[tuple[int, int]] = []  # (row, col)

    for row_index in range(height_cells):
        top_line = horizontal_lines[row_index]
        bottom_line = horizontal_lines[row_index + 1]
        for col_index in range(width_cells):
            left_line = vertical_lines[col_index]
            right_line = vertical_lines[col_index + 1]
            rgb = sample_cell_color_by_coverage(
                image, left_line, right_line, top_line, bottom_line
            )
            # BGR for OpenCV compatibility in clustering (same as the
            # reference scripts that use cv2.imread → BGR).
            cell_colors_bgr.append((rgb[2], rgb[1], rgb[0]))
            cell_coords.append((row_index, col_index))

    # --- cluster colours ---------------------------------------------------
    if len(cell_colors_bgr) == 0:
        raise GridScanPatternError("No cells to process")

    if algorithm == "meanshift":
        labels = _meanshift_cluster_lab(cell_colors_bgr, quantile)
    else:
        labels = _dbscan_cluster_bgr(cell_colors_bgr, eps)

    # Build cluster-centre colour for each label (in BGR, then → RGB).
    unique_labels = sorted(set(labels))
    cluster_center_bgr: dict[int, tuple[int, int, int]] = {}
    for label in unique_labels:
        mask = [i for i, lb in enumerate(labels) if lb == label]
        mean_b = round(sum(cell_colors_bgr[i][0] for i in mask) / len(mask))
        mean_g = round(sum(cell_colors_bgr[i][1] for i in mask) / len(mask))
        mean_r = round(sum(cell_colors_bgr[i][2] for i in mask) / len(mask))
        cluster_center_bgr[label] = (mean_b, mean_g, mean_r)

    # --- build pattern -----------------------------------------------------
    rows: list[list[PixelCell | BeadCell]] = [
        [PixelCell(x=c, y=r) for c in range(width_cells)]
        for r in range(height_cells)
    ]
    usage_counter: Counter[str] = Counter()
    usage_cells: dict[str, BeadCell] = {}

    for idx, (row, col) in enumerate(cell_coords):
        b, g, r = cluster_center_bgr[labels[idx]]
        source_rgb = (r, g, b)  # BGR → RGB

        if is_background(source_rgb):
            continue  # leave as PixelCell (empty / un-beaded)

        bead, distance = find_nearest_color(source_rgb, bead_palette)
        cell = BeadCell(
            x=col,
            y=row,
            sourceRgb=source_rgb,
            beadCode=bead.code,
            beadName=bead.name,
            beadRgb=bead.rgb,
            distance=round(distance, 3),
        )
        rows[row][col] = cell
        usage_counter[cell.beadCode] += 1
        usage_cells[cell.beadCode] = cell

    usage = [
        BeadUsage(
            beadCode=code,
            beadName=usage_cells[code].beadName,
            beadRgb=usage_cells[code].beadRgb,
            count=count,
        )
        for code, count in sorted(usage_counter.items(), key=lambda item: item[0])
    ]

    return PatternResult(
        widthCells=width_cells,
        heightCells=height_cells,
        paletteVersion=PALETTE_VERSION,
        cells=rows,
        usage=usage,
        generatedAt=datetime.now(UTC).isoformat(),
        rleRows=encode_grid_rows_as_rle(rows),
    )


# ---------------------------------------------------------------------------
# Clustering implementations (standalone — no sklearn dependency)
# ---------------------------------------------------------------------------

def _bgr_to_lab(bgr_values: list[tuple[int, int, int]]) -> np.ndarray:
    """Convert list of (B, G, R) → (N, 3) float64 CIELAB array.

    Uses standard sRGB → CIEXYZ → CIELAB with D65 reference white.
    """
    arr = np.array(bgr_values, dtype=np.float64)  # (N, 3) in BGR order
    # BGR → RGB
    rgb = arr[:, ::-1] / 255.0

    # sRGB → linear
    mask = rgb > 0.04045
    rgb_lin = np.where(mask, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)

    # linear RGB → CIEXYZ (D65)
    xyz = np.dot(
        rgb_lin,
        np.array([
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]).T,
    )

    # Normalise by D65 reference white
    xyz_n = xyz / np.array([0.95047, 1.0, 1.08883])

    # CIEXYZ → CIELAB
    delta = 6 / 29
    f = np.where(
        xyz_n > delta**3,
        np.cbrt(xyz_n),
        xyz_n / (3 * delta**2) + 4 / 29,
    )
    L = 116 * f[:, 1] - 16
    a_val = 500 * (f[:, 0] - f[:, 1])
    b_val = 200 * (f[:, 1] - f[:, 2])

    return np.column_stack([L, a_val, b_val])


def _meanshift_cluster_lab(
    bgr_colors: list[tuple[int, int, int]], quantile: float = 0.2
) -> list[int]:
    """Mean-Shift clustering in CIELAB space.

    Parameters
    ----------
    quantile : float
        Fraction of pairwise distances used to estimate the kernel bandwidth.
        Smaller values → more aggressive merging.  Range ~0.05–0.40.
    """
    if len(bgr_colors) <= 1:
        return [0] * len(bgr_colors)

    lab = _bgr_to_lab(bgr_colors)
    n = len(lab)

    # Estimate bandwidth from the distribution of pairwise distances.
    # We sample ~500 pairs to keep it fast.
    rng = np.random.RandomState(42)
    sample_size = min(500, n * (n - 1) // 2)
    indices_i = rng.randint(0, n, size=sample_size)
    indices_j = rng.randint(0, n, size=sample_size)
    # Avoid self-pairs
    same = indices_i == indices_j
    indices_j[same] = (indices_j[same] + 1) % n
    sample_dists = np.sqrt(np.sum((lab[indices_i] - lab[indices_j]) ** 2, axis=1))
    bandwidth = max(5.0, float(np.quantile(sample_dists, quantile)))

    # Mean-Shift iteration
    max_iter = 100
    points = lab.copy()
    for _ in range(max_iter):
        max_shift = 0.0
        for i in range(n):
            old = points[i].copy()
            # Points within bandwidth of the current shifted position
            dists = np.sqrt(np.sum((lab - points[i]) ** 2, axis=1))
            neighbors = lab[dists <= bandwidth]
            if len(neighbors) > 0:
                points[i] = neighbors.mean(axis=0)
            max_shift = max(max_shift, float(np.sqrt(np.sum((points[i] - old) ** 2))))
        if max_shift < 1e-3 * bandwidth:
            break

    # Assign cluster labels — points that converged close together share a label.
    labels = [-1] * n
    cluster_id = 0
    merge_radius = bandwidth * 0.5
    for i in range(n):
        if labels[i] != -1:
            continue
        labels[i] = cluster_id
        for j in range(i + 1, n):
            if labels[j] != -1:
                continue
            if np.sqrt(np.sum((points[i] - points[j]) ** 2)) <= merge_radius:
                labels[j] = cluster_id
        cluster_id += 1

    return labels


def _dbscan_cluster_bgr(
    bgr_colors: list[tuple[int, int, int]], eps: float = 30.0
) -> list[int]:
    """DBSCAN density-based clustering in BGR space (union-find, min_samples=1).

    Parameters
    ----------
    eps : float
        Euclidean distance threshold in BGR space (0–441).
        Larger values merge more colours.  Typical: 15–50.
    """
    n = len(bgr_colors)
    if n <= 1:
        return [0] * n

    arr = np.array(bgr_colors, dtype=np.float64)

    # Union-Find
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: int, y: int) -> None:
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    eps_sq = eps * eps
    for i in range(n):
        for j in range(i + 1, n):
            diff = arr[i] - arr[j]
            if float(np.dot(diff, diff)) <= eps_sq:
                union(i, j)

    # Compress paths
    for i in range(n):
        find(i)

    # Map root → sequential label
    root_to_label: dict[int, int] = {}
    labels: list[int] = []
    for i in range(n):
        root = parent[i]
        if root not in root_to_label:
            root_to_label[root] = len(root_to_label)
        labels.append(root_to_label[root])

    return labels
