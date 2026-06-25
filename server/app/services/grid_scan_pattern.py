from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO
from statistics import median

from PIL import Image, UnidentifiedImageError

from app.color_matching import find_nearest_color
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, PixelCell
from app.palette import PALETTE_VERSION


class GridScanPatternError(ValueError):
    pass


@dataclass(frozen=True)
class GridLine:
    start: int
    end: int

    @property
    def center(self) -> float:
        return (self.start + self.end) / 2


MAX_GRID_CELLS = 200
MIN_GRID_STEP = 6
BACKGROUND_LUMINANCE_THRESHOLD = 240
BACKGROUND_SATURATION_THRESHOLD = 0.08


def process_grid_scan_bead_pattern(
    image_bytes: bytes,
    bead_palette: list[PaletteColor],
    target_width: int | None = None,
    target_height: int | None = None,
) -> PatternResult:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise GridScanPatternError("Uploaded file is not a supported image") from exc

    if image.width <= 0 or image.height <= 0:
        raise GridScanPatternError("Uploaded image has invalid dimensions")

    vertical_lines = detect_grid_lines(image, axis="x", expected_cells=target_width)
    horizontal_lines = detect_grid_lines(image, axis="y", expected_cells=target_height)
    width_cells = len(vertical_lines) - 1
    height_cells = len(horizontal_lines) - 1
    if width_cells <= 0 or height_cells <= 0:
        raise GridScanPatternError("Could not detect enough grid lines")
    if width_cells > MAX_GRID_CELLS or height_cells > MAX_GRID_CELLS:
        raise GridScanPatternError("Detected grid size is too large")

    rows: list[list[PixelCell | BeadCell]] = []
    usage_counter: Counter[str] = Counter()
    usage_cells: dict[str, BeadCell] = {}

    for row_index in range(height_cells):
        row: list[PixelCell | BeadCell] = []
        top_line = horizontal_lines[row_index]
        bottom_line = horizontal_lines[row_index + 1]
        for col_index in range(width_cells):
            left_line = vertical_lines[col_index]
            right_line = vertical_lines[col_index + 1]
            source_rgb = sample_cell_color_by_coverage(image, left_line, right_line, top_line, bottom_line)
            if is_background(source_rgb):
                row.append(PixelCell(x=col_index, y=row_index))
                continue

            bead, distance = find_nearest_color(source_rgb, bead_palette)
            cell = BeadCell(
                x=col_index,
                y=row_index,
                sourceRgb=source_rgb,
                beadCode=bead.code,
                beadName=bead.name,
                beadRgb=bead.rgb,
                distance=round(distance, 3),
            )
            row.append(cell)
            usage_counter[cell.beadCode] += 1
            usage_cells[cell.beadCode] = cell
        rows.append(row)

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


def detect_grid_lines(image: Image.Image, axis: str, expected_cells: int | None = None) -> list[GridLine]:
    length = image.width if axis == "x" else image.height
    profile = axis_grid_score_profile(image.convert("RGB"), axis)
    max_line_width = max(4, round(length * 0.025))
    visible_lines = best_visible_lines(profile, max_line_width)
    if len(visible_lines) < 2:
        visible_lines = detect_luminance_lines(image.convert("L"), axis, max_line_width)
    return reconstruct_regular_grid_lines(visible_lines, length, expected_cells)


def best_visible_lines(profile: list[float], max_line_width: int) -> list[GridLine]:
    best: list[GridLine] = []
    for threshold in (0.85, 0.7, 0.55, 0.4, 0.25):
        lines = lines_from_threshold(profile, threshold, max_line_width)
        if len(lines) > len(best):
            best = lines
    return best


def detect_luminance_lines(gray: Image.Image, axis: str, max_line_width: int) -> list[GridLine]:
    profile = axis_luminance_profile(gray, axis)
    if not profile:
        return []
    profile_min = min(profile)
    profile_max = max(profile)
    if profile_max - profile_min < 12:
        return []
    threshold = min(190, profile_min + max(18, (profile_max - profile_min) * 0.35))
    return lines_from_threshold([-value for value in profile], -threshold, max_line_width)


def axis_grid_score_profile(image: Image.Image, axis: str) -> list[float]:
    pixels = image.load()
    assert pixels is not None
    length = image.width if axis == "x" else image.height
    cross_length = image.height if axis == "x" else image.width
    scores: list[float] = []
    for position in range(length):
        grid_like = 0
        for cross in range(cross_length):
            red, green, blue = pixels[position, cross] if axis == "x" else pixels[cross, position]
            luminance = 0.299 * red + 0.587 * green + 0.114 * blue
            max_channel = max(red, green, blue)
            min_channel = min(red, green, blue)
            saturation = 0 if max_channel == 0 else (max_channel - min_channel) / max_channel
            if luminance < 235 and saturation <= 0.22:
                grid_like += 1
        scores.append(grid_like / cross_length)
    return scores


def axis_luminance_profile(gray: Image.Image, axis: str) -> list[float]:
    pixels = gray.load()
    assert pixels is not None
    if axis == "x":
        return [sum(pixels[x, y] for y in range(gray.height)) / gray.height for x in range(gray.width)]
    return [sum(pixels[x, y] for x in range(gray.width)) / gray.width for y in range(gray.height)]


def lines_from_threshold(profile: list[float], threshold: float, max_line_width: int) -> list[GridLine]:
    candidates = [index for index, value in enumerate(profile) if value >= threshold]
    groups = group_positions(candidates)
    lines = [GridLine(start=start, end=end) for start, end in groups if end - start + 1 <= max_line_width]
    return prune_duplicate_lines(lines)


def reconstruct_regular_grid_lines(lines: list[GridLine], length: int, expected_cells: int | None) -> list[GridLine]:
    if len(lines) < 2:
        return lines

    step = estimate_grid_step(lines)
    if step <= 0:
        return lines

    if expected_cells and 1 <= expected_cells <= MAX_GRID_CELLS:
        expected_run = expected_consecutive_run(lines, expected_cells, step)
        if expected_run:
            return expected_run
        sparse_expected_lines = reconstruct_sparse_expected_grid_lines(lines, expected_cells)
        if sparse_expected_lines:
            return sparse_expected_lines
        if expected_cells_matches_visible_span(lines, expected_cells, step):
            expected_lines = reconstruct_expected_grid_lines(lines, expected_cells, step, estimated_line_width(lines))
            if expected_lines:
                return expected_lines

    run = longest_aligned_run(lines, step)
    if len(run) < 2:
        return lines

    start = float(run[0].start)
    end = float(run[-1].start)
    while start - step >= -step * 0.35:
        start -= step
    while end + step <= length - 1 + step * 0.35:
        end += step
    cell_count = max(1, round((end - start) / step))
    return interpolate_lines(start, end, cell_count, estimated_line_width(lines))

def expected_cells_matches_visible_span(lines: list[GridLine], expected_cells: int, step: float) -> bool:
    if len(lines) < 2 or step <= 0:
        return False
    visible_cells = max(1, round((lines[-1].start - lines[0].start) / step))
    return 0.7 * expected_cells <= visible_cells <= 1.3 * expected_cells

def expected_consecutive_run(lines: list[GridLine], expected_cells: int, step: float) -> list[GridLine]:
    target_line_count = expected_cells + 1
    if len(lines) < target_line_count or step <= 0:
        return []

    runs = consecutive_step_runs(lines, step)
    exact_runs = [run for run in runs if len(run) == target_line_count]
    if exact_runs:
        return max(exact_runs, key=lambda run: aligned_run_score(run, step))
    return []


def reconstruct_sparse_expected_grid_lines(lines: list[GridLine], expected_cells: int) -> list[GridLine]:
    if len(lines) < 2 or len(lines) > expected_cells + 1:
        return []

    start = lines[0]
    end = lines[-1]
    implied_step = (end.start - start.start) / expected_cells
    if not (MIN_GRID_STEP <= implied_step <= 80):
        return []

    return interpolate_lines(float(start.start), float(end.start), expected_cells, estimated_line_width(lines))


def consecutive_step_runs(lines: list[GridLine], step: float) -> list[list[GridLine]]:
    if not lines:
        return []

    tolerance = max(1.25, step * 0.28)
    runs: list[list[GridLine]] = []
    current = [lines[0]]
    for line in lines[1:]:
        gap = line.start - current[-1].start
        if abs(gap - step) <= tolerance:
            current.append(line)
            continue
        runs.append(current)
        current = [line]
    runs.append(current)
    return runs


def reconstruct_expected_grid_lines(lines: list[GridLine], expected_cells: int, estimated_step: float, interpolated_line_width: int = 1) -> list[GridLine]:
    edge_pool = min(12, len(lines))
    start_candidates = [line for line in lines[:edge_pool] if line_width(line) <= max(3, estimated_step * 0.35)]
    end_candidates = [line for line in lines[-edge_pool:] if line_width(line) <= max(3, estimated_step * 0.35)]
    best: tuple[float, GridLine, GridLine] | None = None
    for start in start_candidates:
        for end in end_candidates:
            if end.start <= start.start:
                continue
            implied_step = (end.start - start.start) / expected_cells
            if not (MIN_GRID_STEP <= implied_step <= 80):
                continue
            if abs(implied_step - estimated_step) > max(1.0, estimated_step * 0.22):
                continue
            aligned_count = count_aligned_lines(lines, start.start, implied_step, expected_cells)
            step_penalty = abs(implied_step - estimated_step) * 0.15
            score = aligned_count - step_penalty
            if best is None or score > best[0]:
                best = (score, start, end)
    required_score = min(expected_cells + 1, max(2, round((expected_cells + 1) * 0.6)))
    if best is None or best[0] < required_score:
        return []
    _score, start, end = best
    return interpolate_lines(float(start.start), float(end.start), expected_cells, interpolated_line_width)


def line_width(line: GridLine) -> int:
    return line.end - line.start + 1


def estimated_line_width(lines: list[GridLine]) -> int:
    if not lines:
        return 1
    return max(1, round(median(line_width(line) for line in lines)))


def count_aligned_lines(lines: list[GridLine], start: int, step: float, expected_cells: int) -> int:
    tolerance = max(1.5, step * 0.28)
    count = 0
    for line in lines:
        index = round((line.start - start) / step)
        if 0 <= index <= expected_cells and abs(line.start - (start + index * step)) <= tolerance:
            count += 1
    return count


def estimate_grid_step(lines: list[GridLine]) -> float:
    starts = [line.start for line in lines]
    candidates: list[float] = []
    for left, right in zip(starts, starts[1:]):
        gap = right - left
        if gap < 3:
            continue
        for divisor in range(1, 9):
            step = gap / divisor
            if MIN_GRID_STEP <= step <= 80:
                candidates.append(step)
    if not candidates:
        return 0

    buckets: Counter[int] = Counter(round(value) for value in candidates)
    bucket, _count = buckets.most_common(1)[0]
    bucket_values = [value for value in candidates if round(value) == bucket]
    return float(median(bucket_values))


def longest_aligned_run(lines: list[GridLine], step: float) -> list[GridLine]:
    best = [lines[0]]
    current = [lines[0]]
    tolerance = max(1.5, step * 0.35)
    for line in lines[1:]:
        gap = line.start - current[-1].start
        multiple = max(1, round(gap / step))
        if abs(gap - multiple * step) <= tolerance:
            current.append(line)
        else:
            if aligned_run_score(current, step) > aligned_run_score(best, step):
                best = current
            current = [line]
    if aligned_run_score(current, step) > aligned_run_score(best, step):
        best = current
    return best


def aligned_run_score(lines: list[GridLine], step: float) -> float:
    if len(lines) < 2:
        return len(lines)
    return len(lines) + (lines[-1].start - lines[0].start) / max(1, step)


def interpolate_lines(start: float, end: float, cell_count: int, line_width: int = 1) -> list[GridLine]:
    if cell_count <= 0:
        return []
    width = max(1, line_width)
    return [
        GridLine(start=round(position), end=round(position) + width - 1)
        for position in (start + (end - start) * index / cell_count for index in range(cell_count + 1))
    ]


def group_positions(positions: list[int]) -> list[tuple[int, int]]:
    if not positions:
        return []
    groups: list[tuple[int, int]] = []
    start = positions[0]
    previous = positions[0]
    for position in positions[1:]:
        if position <= previous + 1:
            previous = position
            continue
        groups.append((start, previous))
        start = position
        previous = position
    groups.append((start, previous))
    return groups


def prune_duplicate_lines(lines: list[GridLine]) -> list[GridLine]:
    if len(lines) < 2:
        return lines
    pruned = [lines[0]]
    for line in lines[1:]:
        previous = pruned[-1]
        if line.start - previous.end <= 1:
            pruned[-1] = GridLine(start=previous.start, end=line.end)
            continue
        pruned.append(line)
    return pruned


def sample_cell_color_by_coverage(
    image: Image.Image,
    left_line: GridLine,
    right_line: GridLine,
    top_line: GridLine,
    bottom_line: GridLine,
) -> tuple[int, int, int]:
    inner_left = min(image.width - 1, left_line.end + 1)
    inner_right = max(inner_left, right_line.start - 1)
    inner_top = min(image.height - 1, top_line.end + 1)
    inner_bottom = max(inner_top, bottom_line.start - 1)
    sample_left, sample_right = shrink_range(inner_left, inner_right)
    sample_top, sample_bottom = shrink_range(inner_top, inner_bottom)

    pixels = [
        image.getpixel((x, y))
        for y in range(sample_top, sample_bottom + 1)
        for x in range(sample_left, sample_right + 1)
    ]
    return dominant_bucket_average(pixels)


def shrink_range(start: int, end: int) -> tuple[int, int]:
    length = end - start + 1
    if length <= 4:
        return start, end

    margin = max(1, round(length * 0.22))
    shrunk_start = start + margin
    shrunk_end = end - margin
    if shrunk_start > shrunk_end:
        center = round((start + end) / 2)
        return center, center
    return shrunk_start, shrunk_end


def dominant_bucket_average(pixels: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    if not pixels:
        return (255, 255, 255)

    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = {}
    for pixel in pixels:
        buckets.setdefault(quantize_rgb(pixel), []).append(pixel)

    dominant_pixels = max(buckets.values(), key=len)
    return average_color(dominant_pixels)


def quantize_rgb(rgb: tuple[int, int, int], step: int = 16) -> tuple[int, int, int]:
    return tuple(round(channel / step) * step for channel in rgb)


def average_color(pixels: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    count = len(pixels)
    return (
        round(sum(pixel[0] for pixel in pixels) / count),
        round(sum(pixel[1] for pixel in pixels) / count),
        round(sum(pixel[2] for pixel in pixels) / count),
    )


def is_background(rgb: tuple[int, int, int]) -> bool:
    red, green, blue = rgb
    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    max_channel = max(rgb)
    min_channel = min(rgb)
    saturation = 0 if max_channel == 0 else (max_channel - min_channel) / max_channel
    return luminance >= BACKGROUND_LUMINANCE_THRESHOLD and saturation <= BACKGROUND_SATURATION_THRESHOLD


def encode_grid_rows_as_rle(rows: list[list[PixelCell | BeadCell]]) -> list[str]:
    encoded_rows: list[str] = []
    for row in rows:
        codes = [cell.beadCode if isinstance(cell, BeadCell) else "EMPTY" for cell in row]
        if not codes:
            encoded_rows.append("")
            continue

        runs: list[str] = []
        current = codes[0]
        count = 1
        for code in codes[1:]:
            if code == current:
                count += 1
                continue
            runs.append(f"{current}:{count}")
            current = code
            count = 1
        runs.append(f"{current}:{count}")
        encoded_rows.append(",".join(runs))
    return encoded_rows