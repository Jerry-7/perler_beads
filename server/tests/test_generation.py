from io import BytesIO

from PIL import Image

from app.models import PaletteColor
from app.palette import get_enabled_palette
from app.providers.base import PixelArtCell
from app.services.color_simplification import ColorSimplificationProfile
from app.services.generation import GenerationStore


def make_image(width: int, height: int, color: tuple[int, int, int]) -> bytes:
    image = Image.new("RGB", (width, height), color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_generation_marks_letterbox_cells_empty() -> None:
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_image(10, 5, (250, 250, 250)),
        width_cells=10,
        height_cells=10,
        palette=get_enabled_palette(),
    )

    assert generation.status == "completed"
    assert generation.result is not None
    assert generation.result.widthCells == 10
    assert generation.result.heightCells == 10
    assert len(generation.result.cells) == 10
    assert len(generation.result.cells[0]) == 10

    empty_count = sum(1 for row in generation.result.cells for cell in row if getattr(cell, "empty", False))
    usage_count = sum(item.count for item in generation.result.usage)

    assert empty_count == 50
    assert usage_count == 50


def test_generation_does_not_assign_bead_code_to_empty_cells() -> None:
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_image(2, 1, (255, 0, 0)),
        width_cells=2,
        height_cells=3,
        palette=get_enabled_palette(),
    )

    assert generation.result is not None
    empty_cells = [cell for row in generation.result.cells for cell in row if getattr(cell, "empty", False)]

    assert empty_cells
    assert all(not hasattr(cell, "beadCode") for cell in empty_cells)


def test_resample_mode_fills_requested_dimensions_without_letterbox() -> None:
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_image(10, 5, (255, 0, 0)),
        width_cells=10,
        height_cells=10,
        palette=get_enabled_palette(),
        source_mode="resample",
    )

    assert generation.result is not None
    empty_count = sum(1 for row in generation.result.cells for cell in row if getattr(cell, "empty", False))
    usage_count = sum(item.count for item in generation.result.usage)

    assert empty_count == 0
    assert usage_count == 100


def test_generation_simplifies_low_usage_similar_bead_colors() -> None:
    class FixedProvider:
        def convert(
            self,
            image_bytes: bytes,
            width_cells: int,
            height_cells: int,
            source_mode: str = "auto",
        ) -> list[list[PixelArtCell]]:
            return [
                [
                    PixelArtCell(x=0, y=0, rgb=(100, 100, 100)),
                    PixelArtCell(x=1, y=0, rgb=(100, 100, 100)),
                ],
                [
                    PixelArtCell(x=0, y=1, rgb=(100, 100, 100)),
                    PixelArtCell(x=1, y=1, rgb=(110, 108, 105)),
                ],
            ]

    store = GenerationStore()
    store._provider = FixedProvider()

    generation = store.create(
        image_bytes=b"unused",
        width_cells=2,
        height_cells=2,
        palette=[
            PaletteColor(code="A", name="A", rgb=(100, 100, 100)),
            PaletteColor(code="B", name="B", rgb=(110, 108, 105)),
        ],
    )

    assert generation.result is not None
    assert len(generation.result.usage) == 1
    assert generation.result.usage[0].count == 4


def test_generation_respects_color_complexity_profile() -> None:
    class FixedProvider:
        def convert(
            self,
            image_bytes: bytes,
            width_cells: int,
            height_cells: int,
            source_mode: str = "auto",
        ) -> list[list[PixelArtCell]]:
            return [
                [
                    PixelArtCell(x=0, y=0, rgb=(100, 100, 100)),
                    PixelArtCell(x=1, y=0, rgb=(100, 100, 100)),
                ],
                [
                    PixelArtCell(x=0, y=1, rgb=(100, 100, 100)),
                    PixelArtCell(x=1, y=1, rgb=(138, 100, 100)),
                ],
            ]

    palette = [
        PaletteColor(code="A", name="A", rgb=(100, 100, 100)),
        PaletteColor(code="B", name="B", rgb=(138, 100, 100)),
    ]

    simple_store = GenerationStore()
    simple_store._provider = FixedProvider()
    simple = simple_store.create(
        image_bytes=b"unused",
        width_cells=2,
        height_cells=2,
        palette=palette,
        color_complexity=ColorSimplificationProfile.SIMPLE,
    )

    detailed_store = GenerationStore()
    detailed_store._provider = FixedProvider()
    detailed = detailed_store.create(
        image_bytes=b"unused",
        width_cells=2,
        height_cells=2,
        palette=palette,
        color_complexity=ColorSimplificationProfile.DETAILED,
    )

    assert simple.result is not None
    assert detailed.result is not None
    assert len(simple.result.usage) == 1
    assert len(detailed.result.usage) == 2
