from io import BytesIO
from math import gcd

from PIL import Image, UnidentifiedImageError

from app.models import PatternSizeRecommendation

MAX_RECOMMENDED_CELLS = 102
MIN_BLOCK_SIZE = 2
MAX_BLOCK_SIZE = 64
CHANGE_THRESHOLD = 24
BOUNDARY_SCORE_THRESHOLD = 0.6
MIN_BOUNDARY_COUNT = 3
MIN_BLOCK_CONFIDENCE = 0.8


class SizeRecommendationError(ValueError):
    pass


def recommend_pattern_size(source_width: int, source_height: int) -> PatternSizeRecommendation:
    if source_width <= 0 or source_height <= 0:
        raise SizeRecommendationError("Uploaded image has invalid dimensions")

    longest_side = max(source_width, source_height)
    scale = min(1, MAX_RECOMMENDED_CELLS / longest_side)
    width_cells = max(1, round(source_width * scale))
    height_cells = max(1, round(source_height * scale))
    reason = f"按原图比例推荐，最长边不超过 {MAX_RECOMMENDED_CELLS} 格"

    return PatternSizeRecommendation(
        widthCells=width_cells,
        heightCells=height_cells,
        sourceWidth=source_width,
        sourceHeight=source_height,
        recommendedColors=16,
        detectedBlockWidth=None,
        detectedBlockHeight=None,
        confidence=0,
        reason=reason,
    )


def recommend_pattern_size_from_image(image_bytes: bytes) -> PatternSizeRecommendation:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            rgb_image = image.convert("RGB")
            detected = detect_pixel_block_size(rgb_image)
            if detected is not None:
                block_width, block_height, confidence = detected
                width_cells = max(1, round(rgb_image.width / block_width))
                height_cells = max(1, round(rgb_image.height / block_height))
                return PatternSizeRecommendation(
                    widthCells=width_cells,
                    heightCells=height_cells,
                    sourceWidth=rgb_image.width,
                    sourceHeight=rgb_image.height,
                    recommendedColors=recommend_color_count(rgb_image),
                    detectedBlockWidth=block_width,
                    detectedBlockHeight=block_height,
                    confidence=round(confidence, 3),
                    reason=f"识别到约 {block_width} x {block_height} 像素块",
                )

            recommendation = recommend_pattern_size(rgb_image.width, rgb_image.height)
            recommendation.recommendedColors = recommend_color_count(rgb_image)
            return recommendation
    except UnidentifiedImageError as exc:
        raise SizeRecommendationError("Uploaded file is not a supported image") from exc


def recommend_color_count(image: Image.Image) -> int:
    preview = image.copy()
    preview.thumbnail((64, 64), Image.Resampling.BILINEAR)
    colors = {quantize_rgb(preview.getpixel((x, y))) for y in range(preview.height) for x in range(preview.width)}
    unique_count = len(colors)
    if unique_count <= 1:
        return 4
    if unique_count <= 8:
        return 8
    if unique_count <= 16:
        return 12
    if unique_count <= 32:
        return 16
    if unique_count <= 96:
        return 24
    if unique_count <= 192:
        return 32
    return 48


def quantize_rgb(rgb: tuple[int, int, int]) -> tuple[int, int, int]:
    return tuple(channel // 32 for channel in rgb)


def detect_pixel_block_size(image: Image.Image) -> tuple[int, int, float] | None:
    block_width, width_confidence = detect_axis_block_size(image, axis="x")
    block_height, height_confidence = detect_axis_block_size(image, axis="y")
    confidence = min(width_confidence, height_confidence)

    if block_width is None or block_height is None or confidence < MIN_BLOCK_CONFIDENCE:
        return None

    return block_width, block_height, confidence


def detect_axis_block_size(image: Image.Image, axis: str) -> tuple[int | None, float]:
    length = image.width if axis == "x" else image.height
    if length < MIN_BLOCK_SIZE * 2:
        return None, 0

    boundary_positions = axis_boundary_positions(image, axis)
    if len(boundary_positions) < MIN_BOUNDARY_COUNT:
        return None, 0

    block_size = boundary_interval_gcd(boundary_positions)
    if block_size is None or block_size < MIN_BLOCK_SIZE or block_size > MAX_BLOCK_SIZE:
        return None, 0

    expected_positions = max(1, (length - 1) // block_size)
    confidence = min(1, len(boundary_positions) / expected_positions)
    return block_size, confidence


def axis_boundary_positions(image: Image.Image, axis: str) -> list[int]:
    length = image.width if axis == "x" else image.height
    cross_length = image.height if axis == "x" else image.width
    positions: list[int] = []
    pixels = image.load()

    for position in range(1, length):
        changed_count = 0
        for cross in range(cross_length):
            left = pixels[position - 1, cross] if axis == "x" else pixels[cross, position - 1]
            right = pixels[position, cross] if axis == "x" else pixels[cross, position]
            if rgb_distance(left, right) >= CHANGE_THRESHOLD:
                changed_count += 1

        if changed_count / cross_length >= BOUNDARY_SCORE_THRESHOLD:
            positions.append(position)

    return positions


def boundary_interval_gcd(positions: list[int]) -> int | None:
    intervals = [right - left for left, right in zip(positions, positions[1:])]
    intervals = [interval for interval in intervals if interval > 0]
    if not intervals:
        return None

    value = intervals[0]
    for interval in intervals[1:]:
        value = gcd(value, interval)

    return value


def rgb_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> int:
    return abs(left[0] - right[0]) + abs(left[1] - right[1]) + abs(left[2] - right[2])
