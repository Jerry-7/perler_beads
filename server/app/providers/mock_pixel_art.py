from io import BytesIO
from collections import Counter, defaultdict

from PIL import Image, ImageFilter, UnidentifiedImageError

from app.providers.base import PixelArtCell


class PixelArtProviderError(ValueError):
    pass


ORIGINAL_GRID_MAX_SIDE = 768
DARK_PIXEL_SUM_THRESHOLD = 150
DARK_PIXEL_RATIO_THRESHOLD = 0.25


class MockPixelArtProvider:
    """Local placeholder for the future third-party AI pixel-art provider."""

    def convert(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        source_mode: str = "auto",
        ai_detail: str = "balanced",
        ai_style: str = "faithful",
        ai_effect_3d: str = "balanced",
        ai_shading: str = "step",
        ai_max_colors: int = 16,
        sampling_mode: str = "dominant",
    ) -> list[list[PixelArtCell]]:
        try:
            original = Image.open(BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError as exc:
            raise PixelArtProviderError("Uploaded file is not a supported image") from exc

        if original.width <= 0 or original.height <= 0:
            raise PixelArtProviderError("Uploaded image has invalid dimensions")

        if source_mode == "resample":
            original_grid = make_original_color_grid(original)
            return resample_by_mode(original_grid, width_cells, height_cells, sampling_mode)

        scale = min(width_cells / original.width, height_cells / original.height)
        scaled_width = max(1, min(width_cells, round(original.width * scale)))
        scaled_height = max(1, min(height_cells, round(original.height * scale)))
        offset_x = (width_cells - scaled_width) // 2
        offset_y = (height_cells - scaled_height) // 2

        resized = original.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)
        matrix: list[list[PixelArtCell]] = []

        for y in range(height_cells):
            row: list[PixelArtCell] = []
            for x in range(width_cells):
                source_x = x - offset_x
                source_y = y - offset_y
                if 0 <= source_x < scaled_width and 0 <= source_y < scaled_height:
                    row.append(PixelArtCell(x=x, y=y, rgb=resized.getpixel((source_x, source_y))))
                else:
                    row.append(PixelArtCell(x=x, y=y, rgb=None, empty=True))
            matrix.append(row)

        return matrix


def resample_by_mode(
    image: Image.Image,
    width_cells: int,
    height_cells: int,
    sampling_mode: str,
) -> list[list[PixelArtCell]]:
    if sampling_mode == "center-shrink":
        return center_shrink_resample(image, width_cells, height_cells)
    if sampling_mode == "coverage":
        return coverage_region_resample(image, width_cells, height_cells)
    if sampling_mode == "raw":
        return compressed_pixel_art_resample(image, width_cells, height_cells)
    if sampling_mode == "smooth":
        smoothed = image.filter(ImageFilter.MedianFilter(size=3))
        return region_resample(smoothed, width_cells, height_cells, average_region_color)
    if sampling_mode == "nearest":
        return compressed_pixel_art_resample(image, width_cells, height_cells)
    if sampling_mode == "detail":
        return region_resample(image, width_cells, height_cells, detail_region_color)
    return edge_preserving_region_resample(image, width_cells, height_cells)


def original_grid_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    original_grid = make_original_color_grid(image)
    return scale_original_grid_to_cells(original_grid, width_cells, height_cells)


def make_original_color_grid(image: Image.Image) -> Image.Image:
    max_side = max(image.width, image.height)
    if max_side <= ORIGINAL_GRID_MAX_SIDE:
        return image.copy()

    scale = ORIGINAL_GRID_MAX_SIDE / max_side
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def scale_original_grid_to_cells(
    image: Image.Image,
    width_cells: int,
    height_cells: int,
) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, edge_preserving_region_color)


def dominant_region_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, dominant_region_color)


def edge_preserving_region_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, edge_preserving_region_color)


def nearest_region_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    matrix: list[list[PixelArtCell]] = []
    for y in range(height_cells):
        row: list[PixelArtCell] = []
        source_y = min(image.height - 1, int((y + 0.5) * image.height / height_cells))
        for x in range(width_cells):
            source_x = min(image.width - 1, int((x + 0.5) * image.width / width_cells))
            row.append(PixelArtCell(x=x, y=y, rgb=image.getpixel((source_x, source_y))))
        matrix.append(row)
    return matrix


def compressed_pixel_art_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, compressed_pixel_art_region_color)


def coverage_region_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    matrix: list[list[PixelArtCell]] = []
    for y in range(height_cells):
        row: list[PixelArtCell] = []
        top = y * image.height / height_cells
        bottom = (y + 1) * image.height / height_cells
        for x in range(width_cells):
            left = x * image.width / width_cells
            right = (x + 1) * image.width / width_cells
            row.append(PixelArtCell(x=x, y=y, rgb=coverage_region_color(image, left, top, right, bottom)))
        matrix.append(row)
    return matrix


def center_shrink_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, center_shrink_region_color)


def region_resample(
    image: Image.Image,
    width_cells: int,
    height_cells: int,
    color_picker,
) -> list[list[PixelArtCell]]:
    matrix: list[list[PixelArtCell]] = []
    for y in range(height_cells):
        row: list[PixelArtCell] = []
        top = y * image.height / height_cells
        bottom = (y + 1) * image.height / height_cells
        source_y0 = int(top)
        source_y1 = max(source_y0 + 1, min(image.height, int_ceil(bottom)))
        for x in range(width_cells):
            left = x * image.width / width_cells
            right = (x + 1) * image.width / width_cells
            source_x0 = int(left)
            source_x1 = max(source_x0 + 1, min(image.width, int_ceil(right)))
            row.append(PixelArtCell(x=x, y=y, rgb=color_picker(image, source_x0, source_y0, source_x1, source_y1)))
        matrix.append(row)
    return matrix


def compressed_pixel_art_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    pixels = [image.getpixel((x, y)) for y in range(top, bottom) for x in range(left, right)]
    if not pixels:
        return (0, 0, 0)

    dark_pixels = [pixel for pixel in pixels if sum(pixel) < DARK_PIXEL_SUM_THRESHOLD]
    if dark_pixels and len(dark_pixels) / len(pixels) > DARK_PIXEL_RATIO_THRESHOLD:
        return min(dark_pixels, key=sum)

    return Counter(pixels).most_common(1)[0][0]


def coverage_region_color(image: Image.Image, left: float, top: float, right: float, bottom: float) -> tuple[int, int, int]:
    weighted_pixels = [
        (image.getpixel((x, y)), overlap_area(left, top, right, bottom, x, y))
        for y in range(max(0, int(top)), min(image.height, int_ceil(bottom)))
        for x in range(max(0, int(left)), min(image.width, int_ceil(right)))
        if overlap_area(left, top, right, bottom, x, y) > 0
    ]
    if not weighted_pixels:
        return (0, 0, 0)

    total_area = sum(area for _pixel, area in weighted_pixels)
    dark_weighted_pixels = [(pixel, area) for pixel, area in weighted_pixels if sum(pixel) < DARK_PIXEL_SUM_THRESHOLD]
    dark_area = sum(area for _pixel, area in dark_weighted_pixels)
    if dark_weighted_pixels and dark_area / total_area > DARK_PIXEL_RATIO_THRESHOLD:
        return min((pixel for pixel, _area in dark_weighted_pixels), key=sum)

    buckets: dict[tuple[int, int, int], list[tuple[tuple[int, int, int], float]]] = defaultdict(list)
    for pixel, area in weighted_pixels:
        buckets[quantize_rgb(pixel)].append((pixel, area))

    dominant_weighted_pixels = max(buckets.values(), key=lambda items: sum(area for _pixel, area in items))
    return weighted_average_color(dominant_weighted_pixels)


def overlap_area(left: float, top: float, right: float, bottom: float, pixel_x: int, pixel_y: int) -> float:
    overlap_width = max(0.0, min(right, pixel_x + 1) - max(left, pixel_x))
    overlap_height = max(0.0, min(bottom, pixel_y + 1) - max(top, pixel_y))
    return overlap_width * overlap_height


def center_shrink_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    width = right - left
    height = bottom - top
    inset_x = int(width * 0.3)
    inset_y = int(height * 0.3)
    core_left = min(right - 1, left + inset_x)
    core_right = max(core_left + 1, right - inset_x)
    core_top = min(bottom - 1, top + inset_y)
    core_bottom = max(core_top + 1, bottom - inset_y)
    pixels = [image.getpixel((x, y)) for y in range(core_top, core_bottom) for x in range(core_left, core_right)]
    if not pixels:
        return (0, 0, 0)
    return Counter(pixels).most_common(1)[0][0]


def dominant_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for y in range(top, bottom):
        for x in range(left, right):
            rgb = image.getpixel((x, y))
            buckets[quantize_rgb(rgb)].append(rgb)

    edge_pixels = meaningful_edge_pixels(buckets) if right - left > 1 and bottom - top > 1 else []
    if edge_pixels:
        return average_color(edge_pixels)

    dominant_pixels = max(buckets.values(), key=len)
    return average_color(dominant_pixels)


def edge_preserving_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for y in range(top, bottom):
        for x in range(left, right):
            rgb = image.getpixel((x, y))
            buckets[quantize_rgb(rgb)].append(rgb)

    structural_pixels = structural_region_pixels(buckets) if right - left > 1 and bottom - top > 1 else []
    if structural_pixels:
        return average_color(structural_pixels)

    dominant_pixels = max(buckets.values(), key=len)
    return average_color(dominant_pixels)


def structural_region_pixels(
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]],
) -> list[tuple[int, int, int]]:
    if len(buckets) < 2:
        return []

    total_count = sum(len(pixels) for pixels in buckets.values())
    bucket_averages = [(average_color(pixels), len(pixels), pixels) for pixels in buckets.values()]
    dominant_average, dominant_count, _ = max(bucket_averages, key=lambda item: item[1])

    candidates: list[tuple[int, int, int]] = []
    for average, count, pixels in bucket_averages:
        coverage = count / total_count
        if count > dominant_count:
            continue
        if coverage < 0.08:
            continue
        if color_distance_squared(average, dominant_average) < 70**2:
            continue
        candidates.extend(pixels)

    if candidates:
        return min(
            (pixels for average, count, pixels in bucket_averages if pixels[0] in candidates),
            key=lambda pixels: luminance(average_color(pixels)),
        )
    return []


def average_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    return average_color([image.getpixel((x, y)) for y in range(top, bottom) for x in range(left, right)])


def detail_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
    pixels = [image.getpixel((x, y)) for y in range(top, bottom) for x in range(left, right)]
    count = len(pixels)
    average = (
        sum(pixel[0] for pixel in pixels) / count,
        sum(pixel[1] for pixel in pixels) / count,
        sum(pixel[2] for pixel in pixels) / count,
    )
    return max(pixels, key=lambda pixel: color_distance_squared(pixel, average))


def meaningful_edge_pixels(
    buckets: dict[tuple[int, int, int], list[tuple[int, int, int]]],
) -> list[tuple[int, int, int]]:
    if len(buckets) < 2:
        return []

    total_count = sum(len(pixels) for pixels in buckets.values())
    bucket_averages = [(average_color(pixels), len(pixels), pixels) for pixels in buckets.values()]
    dominant_average, dominant_count, _ = max(bucket_averages, key=lambda item: item[1])

    candidates: list[tuple[int, int, int]] = []
    for average, count, pixels in bucket_averages:
        coverage = count / total_count
        if count >= dominant_count:
            continue
        if coverage < 0.18:
            continue
        if color_distance_squared(average, dominant_average) < 90**2:
            continue
        candidates.extend(pixels)

    return candidates


def average_color(pixels: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    count = len(pixels)
    return (
        round(sum(pixel[0] for pixel in pixels) / count),
        round(sum(pixel[1] for pixel in pixels) / count),
        round(sum(pixel[2] for pixel in pixels) / count),
    )


def weighted_average_color(weighted_pixels: list[tuple[tuple[int, int, int], float]]) -> tuple[int, int, int]:
    total_area = sum(area for _pixel, area in weighted_pixels)
    return (
        round(sum(pixel[0] * area for pixel, area in weighted_pixels) / total_area),
        round(sum(pixel[1] * area for pixel, area in weighted_pixels) / total_area),
        round(sum(pixel[2] * area for pixel, area in weighted_pixels) / total_area),
    )


def luminance(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def color_distance_squared(rgb: tuple[int, int, int], other: tuple[float, float, float]) -> float:
    return (rgb[0] - other[0]) ** 2 + (rgb[1] - other[1]) ** 2 + (rgb[2] - other[2]) ** 2


def quantize_rgb(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(channel // 32 for channel in rgb)


def int_ceil(value: float) -> int:
    integer = int(value)
    return integer if value == integer else integer + 1


def encode_rows_as_rle(rows: list[list[str]]) -> list[str]:
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
            runs.append(f"{current}:{count}")
            current = code
            count = 1
        runs.append(f"{current}:{count}")
        encoded_rows.append(",".join(runs))
    return encoded_rows
