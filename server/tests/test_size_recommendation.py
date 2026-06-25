from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services.size_recommendation import recommend_pattern_size, recommend_pattern_size_from_image


client = TestClient(app)


def make_image(width: int, height: int) -> bytes:
    image = Image.new("RGB", (width, height), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_scaled_pixel_art(width_cells: int, height_cells: int, block_size: int) -> bytes:
    image = Image.new("RGB", (width_cells * block_size, height_cells * block_size))
    pixels = image.load()
    for y in range(height_cells):
        for x in range(width_cells):
            color = ((x * 37) % 256, (y * 53) % 256, ((x + y) * 29) % 256)
            for block_y in range(block_size):
                for block_x in range(block_size):
                    pixels[x * block_size + block_x, y * block_size + block_y] = color

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_gradient_image(width: int, height: int) -> bytes:
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            pixels[x, y] = ((x * 3) % 256, (y * 5) % 256, (x + y) % 256)

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_recommends_source_size_when_within_limit() -> None:
    recommendation = recommend_pattern_size(48, 64)

    assert recommendation.widthCells == 48
    assert recommendation.heightCells == 64


def test_scales_longest_side_to_limit() -> None:
    recommendation = recommend_pattern_size(300, 150)

    assert recommendation.widthCells == 102
    assert recommendation.heightCells == 51


def test_recommendation_api_returns_scaled_image_size() -> None:
    response = client.post(
        "/api/pattern-size/recommendation",
        files={"image": ("large.png", make_image(300, 150), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sourceWidth"] == 300
    assert body["sourceHeight"] == 150
    assert body["widthCells"] == 102
    assert body["heightCells"] == 51
    assert 4 <= body["recommendedColors"] <= 64


def test_detects_scaled_pixel_block_size_from_image() -> None:
    recommendation = recommend_pattern_size_from_image(make_scaled_pixel_art(32, 24, 8))

    assert recommendation.widthCells == 32
    assert recommendation.heightCells == 24
    assert recommendation.detectedBlockWidth == 8
    assert recommendation.detectedBlockHeight == 8
    assert recommendation.confidence >= 0.8


def test_falls_back_when_pixel_blocks_are_not_stable() -> None:
    recommendation = recommend_pattern_size_from_image(make_gradient_image(300, 150))

    assert recommendation.widthCells == 102
    assert recommendation.heightCells == 51
    assert recommendation.detectedBlockWidth is None
    assert recommendation.detectedBlockHeight is None
    assert recommendation.confidence == 0


def test_recommends_more_colors_for_colorful_images() -> None:
    flat = recommend_pattern_size_from_image(make_image(64, 64))
    colorful = recommend_pattern_size_from_image(make_gradient_image(64, 64))

    assert flat.recommendedColors == 4
    assert colorful.recommendedColors > flat.recommendedColors
