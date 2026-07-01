from collections import Counter
from datetime import UTC, datetime
from io import BytesIO

from PIL import Image, ImageFilter, UnidentifiedImageError

from app.color_matching import find_nearest_color
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, PixelCell
from app.palette import PALETTE_VERSION
from app.providers.mock_pixel_art import int_ceil


class LineArtPatternError(ValueError):
    pass


LINE_RATIO_THRESHOLD = 0.15
BACKGROUND_LUMINANCE_THRESHOLD = 236
BACKGROUND_SATURATION_THRESHOLD = 0.12


def process_line_art_bead_pattern(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    bead_palette: list[PaletteColor],
    line_bead_id: str = "S01",
) -> PatternResult:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise LineArtPatternError("Uploaded file is not a supported image") from exc

    if image.width <= 0 or image.height <= 0:
        raise LineArtPatternError("Uploaded image has invalid dimensions")
    if target_width <= 0 or target_height <= 0:
        raise LineArtPatternError("target size must be positive")

    line_mask = make_thickened_line_mask(image, max(target_width, target_height))
    line_bead = find_line_bead(bead_palette, line_bead_id)
    rows = sample_colored_sketch(image, line_mask, target_width, target_height, line_bead, bead_palette)
    usage = build_usage(rows)
    rle_rows = encode_optional_rows_as_rle([[cell.beadCode if isinstance(cell, BeadCell) else None for cell in row] for row in rows])

    return PatternResult(
        widthCells=target_width,
        heightCells=target_height,
        paletteVersion=PALETTE_VERSION,
        usage=usage,
        generatedAt=datetime.now(UTC).isoformat(),
        rleRows=rle_rows,
    )


def make_thickened_line_mask(image: Image.Image, target_size: int) -> Image.Image:
    cv2_mask = make_cv2_line_mask(image, target_size)
    if cv2_mask is not None:
        return cv2_mask

    binary = adaptive_binary_mask(image.convert("L"))
    inverted = Image.eval(binary, lambda value: 255 - value)
    kernel_size = line_kernel_size(image.height, target_size)
    return inverted.filter(ImageFilter.MaxFilter(kernel_size))


def make_cv2_line_mask(image: Image.Image, target_size: int) -> Image.Image | None:
    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
    except Exception:
        return None

    source = np.array(image)
    gray = cv2.cvtColor(source, cv2.COLOR_RGB2GRAY)
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        11,
        2,
    )
    binary_inv = cv2.bitwise_not(binary)
    kernel_size = line_kernel_size(image.height, target_size)
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    dilated = cv2.dilate(binary_inv, kernel, iterations=1)
    return Image.fromarray(dilated, mode="L")


def adaptive_binary_mask(gray: Image.Image) -> Image.Image:
    local_mean = gray.filter(ImageFilter.BoxBlur(5))
    fallback_threshold = otsu_threshold(gray)
    binary = Image.new("L", gray.size, 255)
    pixels = gray.load()
    local_pixels = local_mean.load()
    output = binary.load()
    assert pixels is not None
    assert local_pixels is not None
    assert output is not None

    for y in range(gray.height):
        for x in range(gray.width):
            local_threshold = max(0, local_pixels[x, y] - 12)
            is_line = pixels[x, y] <= fallback_threshold or pixels[x, y] < local_threshold
            output[x, y] = 0 if is_line else 255
    return binary


def otsu_threshold(gray: Image.Image) -> int:
    histogram = gray.histogram()
    total = gray.width * gray.height
    sum_total = sum(index * count for index, count in enumerate(histogram))
    sum_background = 0
    weight_background = 0
    best_threshold = 127
    best_variance = -1.0

    for threshold, count in enumerate(histogram):
        weight_background += count
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break

        sum_background += threshold * count
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        variance = weight_background * weight_foreground * (mean_background - mean_foreground) ** 2
        if variance > best_variance:
            best_variance = variance
            best_threshold = threshold
    return best_threshold


def line_kernel_size(source_height: int, target_size: int) -> int:
    size = max(3, int(source_height / max(1, target_size) * 0.3))
    return size if size % 2 == 1 else size + 1


def find_line_bead(palette: list[PaletteColor], line_bead_id: str) -> PaletteColor:
    for bead in palette:
        if bead.code == line_bead_id:
            return bead
    bead, _distance = find_nearest_color((0, 0, 0), palette)
    return bead


def sample_colored_sketch(
    image: Image.Image,
    line_mask: Image.Image,
    target_width: int,
    target_height: int,
    line_bead: PaletteColor,
    bead_palette: list[PaletteColor],
) -> list[list[PixelCell | BeadCell]]:
    rows: list[list[PixelCell | BeadCell]] = []
    mask_pixels = line_mask.load()
    image_pixels = image.load()
    assert mask_pixels is not None
    assert image_pixels is not None

    for y in range(target_height):
        row: list[PixelCell | BeadCell] = []
        top = y * line_mask.height / target_height
        bottom = (y + 1) * line_mask.height / target_height
        source_y0 = int(top)
        source_y1 = max(source_y0 + 1, min(line_mask.height, int_ceil(bottom)))
        for x in range(target_width):
            left = x * line_mask.width / target_width
            right = (x + 1) * line_mask.width / target_width
            source_x0 = int(left)
            source_x1 = max(source_x0 + 1, min(line_mask.width, int_ceil(right)))
            ratio = line_ratio(mask_pixels, source_x0, source_y0, source_x1, source_y1)
            fill_color = dominant_colored_fill(image_pixels, source_x0, source_y0, source_x1, source_y1)
            if fill_color is not None:
                bead, distance = find_nearest_color(fill_color, bead_palette)
                row.append(
                    BeadCell(
                        x=x,
                        y=y,
                        sourceRgb=fill_color,
                        beadCode=bead.code,
                        beadName=bead.name,
                        beadRgb=bead.rgb,
                        distance=round(distance, 3),
                    )
                )
            elif ratio > LINE_RATIO_THRESHOLD:
                row.append(
                    BeadCell(
                        x=x,
                        y=y,
                        sourceRgb=(0, 0, 0),
                        beadCode=line_bead.code,
                        beadName=line_bead.name,
                        beadRgb=line_bead.rgb,
                        distance=0,
                    )
                )
            else:
                fill_color = dominant_non_background_color(image_pixels, source_x0, source_y0, source_x1, source_y1)
                if fill_color is None:
                    row.append(PixelCell(x=x, y=y))
                    continue

                bead, distance = find_nearest_color(fill_color, bead_palette)
                row.append(
                    BeadCell(
                        x=x,
                        y=y,
                        sourceRgb=fill_color,
                        beadCode=bead.code,
                        beadName=bead.name,
                        beadRgb=bead.rgb,
                        distance=round(distance, 3),
                    )
                )
        rows.append(row)
    return rows


def line_ratio(pixels, left: int, top: int, right: int, bottom: int) -> float:
    total = max(1, (right - left) * (bottom - top))
    line_pixels = sum(1 for y in range(top, bottom) for x in range(left, right) if pixels[x, y] >= 128)
    return line_pixels / total


def dominant_colored_fill(pixels, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int] | None:
    colors = [
        pixels[x, y]
        for y in range(top, bottom)
        for x in range(left, right)
        if is_colored_fill(pixels[x, y])
    ]
    total = max(1, (right - left) * (bottom - top))
    if len(colors) / total < 0.2:
        return None
    return dominant_bucket_average(colors)


def dominant_non_background_color(pixels, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int] | None:
    colors = [
        pixels[x, y]
        for y in range(top, bottom)
        for x in range(left, right)
        if not is_paper_background(pixels[x, y]) and luminance(pixels[x, y]) >= 40
    ]
    if not colors:
        return None

    return dominant_bucket_average(colors)


def dominant_bucket_average(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = {}
    for rgb in colors:
        buckets.setdefault(quantize_rgb(rgb), []).append(rgb)
    dominant_pixels = max(buckets.values(), key=len)
    return average_rgb(dominant_pixels)


def is_paper_background(rgb: tuple[int, int, int]) -> bool:
    return luminance(rgb) >= BACKGROUND_LUMINANCE_THRESHOLD and saturation(rgb) <= BACKGROUND_SATURATION_THRESHOLD


def is_colored_fill(rgb: tuple[int, int, int]) -> bool:
    return saturation(rgb) >= 0.35 and luminance(rgb) >= 60


def luminance(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def saturation(rgb: tuple[int, int, int]) -> float:
    maximum = max(rgb)
    minimum = min(rgb)
    return 0 if maximum == 0 else (maximum - minimum) / maximum


def quantize_rgb(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(channel // 32 for channel in rgb)


def average_rgb(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return (
        round(sum(color[0] for color in colors) / len(colors)),
        round(sum(color[1] for color in colors) / len(colors)),
        round(sum(color[2] for color in colors) / len(colors)),
    )


def build_usage(rows: list[list[PixelCell | BeadCell]]) -> list[BeadUsage]:
    usage_counter: Counter[str] = Counter()
    usage_colors: dict[str, BeadCell] = {}
    for row in rows:
        for cell in row:
            if isinstance(cell, BeadCell):
                usage_counter[cell.beadCode] += 1
                usage_colors[cell.beadCode] = cell
    return [
        BeadUsage(
            beadCode=code,
            beadName=usage_colors[code].beadName,
            beadRgb=usage_colors[code].beadRgb,
            count=count,
        )
        for code, count in sorted(usage_counter.items(), key=lambda item: item[0])
    ]


def encode_optional_rows_as_rle(rows: list[list[str | None]]) -> list[str]:
    encoded_rows: list[str] = []
    for row in rows:
        if not row:
            encoded_rows.append("")
            continue

        runs: list[str] = []
        current = row[0]
        count = 1
        for code in row[1:]:
            if code == current:
                count += 1
                continue
            runs.append(f"{current or 'EMPTY'}:{count}")
            current = code
            count = 1
        runs.append(f"{current or 'EMPTY'}:{count}")
        encoded_rows.append(",".join(runs))
    return encoded_rows
