from io import BytesIO
from collections import defaultdict

from PIL import Image, ImageFilter, UnidentifiedImageError

from app.providers.base import PixelArtCell


class PixelArtProviderError(ValueError):
    pass


ORIGINAL_GRID_MAX_SIDE = 768


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
            return original_grid_resample(original, width_cells, height_cells)

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
    if sampling_mode == "smooth":
        smoothed = image.filter(ImageFilter.MedianFilter(size=3))
        return region_resample(smoothed, width_cells, height_cells, average_region_color)
    if sampling_mode == "nearest":
        return nearest_region_resample(image, width_cells, height_cells)
    if sampling_mode == "detail":
        return region_resample(image, width_cells, height_cells, detail_region_color)
    return dominant_region_resample(image, width_cells, height_cells)


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
    return region_resample(image, width_cells, height_cells, original_grid_region_color)


def dominant_region_resample(image: Image.Image, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
    return region_resample(image, width_cells, height_cells, dominant_region_color)


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


def original_grid_region_color(image: Image.Image, left: int, top: int, right: int, bottom: int) -> tuple[int, int, int]:
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
        if coverage < 0.12:
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


def luminance(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def color_distance_squared(rgb: tuple[int, int, int], other: tuple[float, float, float]) -> float:
    return (rgb[0] - other[0]) ** 2 + (rgb[1] - other[1]) ** 2 + (rgb[2] - other[2]) ** 2


def quantize_rgb(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(channel // 32 for channel in rgb)


def int_ceil(value: float) -> int:
    integer = int(value)
    return integer if value == integer else integer + 1
