from io import BytesIO

from PIL import Image

from app.models import PaletteColor
from app.services.ultra_small_pattern import process_ultra_small_bead_pattern


def make_feature_line_image() -> bytes:
    image = Image.new("RGB", (64, 64), (230, 210, 190))
    for y in range(64):
        for x in range(27, 32):
            image.putpixel((x, y), (5, 5, 5))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_ultra_small_sampling_preserves_dark_feature_lines() -> None:
    result = process_ultra_small_bead_pattern(
        image_bytes=make_feature_line_image(),
        target_width=4,
        target_height=4,
        max_colors=24,
        bead_palette=[
            PaletteColor(code="SKIN", name="Skin", rgb=(230, 210, 190)),
            PaletteColor(code="BLACK", name="Black", rgb=(0, 0, 0)),
        ],
    )

    codes = [[cell.beadCode for cell in row] for row in result.cells]

    assert any("BLACK" in row for row in codes)
    assert len(result.usage) <= 8
    assert result.rleRows == [
        "SKIN:1,BLACK:1,SKIN:2",
        "SKIN:1,BLACK:1,SKIN:2",
        "SKIN:1,BLACK:1,SKIN:2",
        "SKIN:1,BLACK:1,SKIN:2",
    ]


def test_ultra_small_despeckle_removes_non_feature_isolated_colors() -> None:
    image = Image.new("RGB", (48, 48), (200, 200, 200))
    for y in range(16, 32):
        for x in range(16, 32):
            image.putpixel((x, y), (255, 255, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    result = process_ultra_small_bead_pattern(
        image_bytes=buffer.getvalue(),
        target_width=3,
        target_height=3,
        max_colors=24,
        bead_palette=[
            PaletteColor(code="GRAY", name="Gray", rgb=(200, 200, 200)),
            PaletteColor(code="YELLOW", name="Yellow", rgb=(255, 255, 0)),
        ],
    )

    assert [[cell.beadCode for cell in row] for row in result.cells] == [
        ["GRAY", "GRAY", "GRAY"],
        ["GRAY", "GRAY", "GRAY"],
        ["GRAY", "GRAY", "GRAY"],
    ]
