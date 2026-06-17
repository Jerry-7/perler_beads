import base64
from io import BytesIO
from math import gcd

from PIL import Image, UnidentifiedImageError

from app.models import PatternDebugAnalysis
from app.providers.mock_pixel_art import compressed_pixel_art_region_color, region_resample
from app.services.size_recommendation import axis_boundary_positions


class PatternDebugError(ValueError):
    pass


PREVIEW_CELL_SIZE = 8


def analyze_pattern_mapping(image_bytes: bytes, width_cells: int, height_cells: int) -> PatternDebugAnalysis:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise PatternDebugError("Uploaded file is not a supported image") from exc

    if image.width <= 0 or image.height <= 0:
        raise PatternDebugError("Uploaded image has invalid dimensions")

    block_width = debug_axis_block_size(image, "x")
    block_height = debug_axis_block_size(image, "y")
    detected_grid = image.resize(
        (max(1, round(image.width / block_width)), max(1, round(image.height / block_height))),
        Image.Resampling.NEAREST,
    )

    compressed_grid = compressed_preview_grid(detected_grid, width_cells, height_cells)

    return PatternDebugAnalysis(
        sourceWidth=image.width,
        sourceHeight=image.height,
        detectedBlockWidth=block_width,
        detectedBlockHeight=block_height,
        detectedGridWidth=detected_grid.width,
        detectedGridHeight=detected_grid.height,
        detectedPixelCount=detected_grid.width * detected_grid.height,
        compressedGridWidth=width_cells,
        compressedGridHeight=height_cells,
        compressedPixelCount=width_cells * height_cells,
        originalPreviewDataUrl=png_data_url(scale_preview(detected_grid)),
        compressedPreviewDataUrl=png_data_url(scale_preview(compressed_grid)),
    )


def scale_preview(image: Image.Image) -> Image.Image:
    return image.resize((image.width * PREVIEW_CELL_SIZE, image.height * PREVIEW_CELL_SIZE), Image.Resampling.NEAREST)


def compressed_preview_grid(image: Image.Image, width_cells: int, height_cells: int) -> Image.Image:
    cells = region_resample(image, width_cells, height_cells, compressed_pixel_art_region_color)
    output = Image.new("RGB", (width_cells, height_cells))
    for row in cells:
        for cell in row:
            if cell.rgb is not None:
                output.putpixel((cell.x, cell.y), cell.rgb)
    return output


def debug_axis_block_size(image: Image.Image, axis: str) -> int:
    length = image.width if axis == "x" else image.height
    positions = axis_boundary_positions(image, axis)
    if not positions:
        return length

    intervals = [positions[0]]
    intervals.extend(right - left for left, right in zip(positions, positions[1:]))
    intervals.append(length - positions[-1])
    intervals = [interval for interval in intervals if interval > 0]

    value = intervals[0]
    for interval in intervals[1:]:
        value = gcd(value, interval)
    return max(1, value)


def png_data_url(image: Image.Image) -> str:
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"
