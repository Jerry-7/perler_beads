from io import BytesIO

from PIL import Image
from app.providers.mock_pixel_art import MockPixelArtProvider

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


def make_split_image(left_width: int, right_width: int) -> bytes:
    image = Image.new("RGB", (left_width + right_width, 1), (0, 0, 255))
    for x in range(left_width):
        image.putpixel((x, 0), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_edge_image() -> bytes:
    image = Image.new("RGB", (6, 4), (240, 240, 240))
    for y in range(4):
        image.putpixel((3, y), (15, 15, 15))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_noisy_image() -> bytes:
    image = Image.new("RGB", (4, 4), (120, 120, 120))
    image.putpixel((0, 0), (0, 0, 0))
    image.putpixel((3, 3), (255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_scaled_boundary_image() -> bytes:
    image = Image.new("RGB", (12, 4), (240, 240, 240))
    for y in range(4):
        for x in (6, 7):
            image.putpixel((x, y), (10, 10, 10))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_single_pixel_noise_image() -> bytes:
    image = Image.new("RGB", (8, 8), (120, 120, 120))
    image.putpixel((0, 0), (255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_resample_preserves_dominant_region_color_at_boundaries() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_split_image(left_width=3, right_width=1),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
    )

    assert cells[0][0].rgb == (255, 0, 0)


def test_original_grid_pipeline_preserves_scaled_boundary() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_scaled_boundary_image(),
        width_cells=3,
        height_cells=2,
        source_mode="resample",
    )

    boundary_column = [cells[0][1].rgb, cells[1][1].rgb]
    assert all(rgb is not None and rgb[0] < 80 for rgb in boundary_column)


def test_original_grid_pipeline_resists_single_pixel_noise() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_single_pixel_noise_image(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
    )

    assert cells[0][0].rgb == (120, 120, 120)


def test_dominant_sampling_mode_marks_meaningful_edges() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_edge_image(),
        width_cells=2,
        height_cells=2,
        source_mode="resample",
        sampling_mode="dominant",
    )

    right_column = [cells[0][1].rgb, cells[1][1].rgb]
    assert all(rgb is not None and rgb[0] < 80 for rgb in right_column)


def test_resample_keeps_adjacent_regions_separate() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_split_image(left_width=2, right_width=2),
        width_cells=2,
        height_cells=1,
        source_mode="resample",
    )

    assert [cell.rgb for cell in cells[0]] == [(255, 0, 0), (0, 0, 255)]


def test_original_grid_pipeline_uses_consistent_result_for_legacy_modes() -> None:
    provider = MockPixelArtProvider()

    results = []
    for sampling_mode in ["dominant", "detail", "smooth", "nearest"]:
        cells = provider.convert(
            image_bytes=make_scaled_boundary_image(),
            width_cells=3,
            height_cells=2,
            source_mode="resample",
            sampling_mode=sampling_mode,
        )
        results.append([[cell.rgb for cell in row] for row in cells])

    assert results[1:] == [results[0], results[0], results[0]]


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
            ai_detail: str = "balanced",
            ai_style: str = "faithful",
            ai_effect_3d: str = "balanced",
            ai_shading: str = "step",
            ai_max_colors: int = 16,
            sampling_mode: str = "dominant",
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
            ai_detail: str = "balanced",
            ai_style: str = "faithful",
            ai_effect_3d: str = "balanced",
            ai_shading: str = "step",
            ai_max_colors: int = 16,
            sampling_mode: str = "dominant",
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


def test_generation_store_accepts_injected_provider() -> None:
    class FixedProvider:
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
            return [[PixelArtCell(x=0, y=0, rgb=(255, 0, 0))]]

    store = GenerationStore(provider=FixedProvider())

    generation = store.create(
        image_bytes=b"unused",
        width_cells=1,
        height_cells=1,
        palette=get_enabled_palette(),
    )

    assert generation.status == "completed"
    assert generation.result is not None
    assert generation.result.widthCells == 1


def test_generation_limits_usage_to_max_colors() -> None:
    class FixedProvider:
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
            return [
                [
                    PixelArtCell(x=0, y=0, rgb=(10, 10, 10)),
                    PixelArtCell(x=1, y=0, rgb=(80, 80, 80)),
                ],
                [
                    PixelArtCell(x=0, y=1, rgb=(160, 160, 160)),
                    PixelArtCell(x=1, y=1, rgb=(240, 240, 240)),
                ],
            ]

    palette = [
        PaletteColor(code="A", name="A", rgb=(10, 10, 10)),
        PaletteColor(code="B", name="B", rgb=(80, 80, 80)),
        PaletteColor(code="C", name="C", rgb=(160, 160, 160)),
        PaletteColor(code="D", name="D", rgb=(240, 240, 240)),
    ]
    store = GenerationStore(provider=FixedProvider())

    generation = store.create(
        image_bytes=b"unused",
        width_cells=2,
        height_cells=2,
        palette=palette,
        max_colors=2,
        color_complexity=ColorSimplificationProfile.ORIGINAL,
    )

    assert generation.result is not None
    assert len(generation.result.usage) <= 2
