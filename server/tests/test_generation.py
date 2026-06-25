from io import BytesIO

from PIL import Image
from app.providers.mock_pixel_art import MockPixelArtProvider, encode_rows_as_rle

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


def make_thin_boundary_image() -> bytes:
    image = Image.new("RGB", (18, 6), (240, 240, 240))
    for y in range(6):
        image.putpixel((8, y), (10, 10, 10))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_single_pixel_noise_image() -> bytes:
    image = Image.new("RGB", (8, 8), (120, 120, 120))
    image.putpixel((0, 0), (255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_center_shrink_image() -> bytes:
    image = Image.new("RGB", (10, 10), (0, 0, 255))
    for y in range(3, 7):
        for x in range(3, 7):
            image.putpixel((x, y), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_line_art_image() -> bytes:
    image = Image.new("RGB", (20, 20), (246, 246, 246))
    for index in range(20):
        image.putpixel((index, index), (12, 12, 12))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_colored_sketch_image() -> bytes:
    image = Image.new("RGB", (20, 20), (246, 246, 246))
    for y in range(2, 10):
        for x in range(2, 10):
            image.putpixel((x, y), (245, 30, 30))
    for y in range(2, 10):
        image.putpixel((2, y), (8, 8, 8))
        image.putpixel((9, y), (8, 8, 8))
    for x in range(2, 10):
        image.putpixel((x, 2), (8, 8, 8))
        image.putpixel((x, 9), (8, 8, 8))
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


def test_edge_sampling_preserves_thin_boundaries_when_downscaling() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_thin_boundary_image(),
        width_cells=3,
        height_cells=2,
        source_mode="resample",
        sampling_mode="edge",
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


def test_raw_mapping_uses_region_mode_instead_of_center_pixel() -> None:
    image = Image.new("RGB", (4, 4), (255, 0, 0))
    image.putpixel((2, 2), (0, 0, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=buffer.getvalue(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
        sampling_mode="nearest",
    )

    assert cells[0][0].rgb == (255, 0, 0)


def test_raw_mapping_preserves_dark_outline_when_threshold_is_met() -> None:
    image = Image.new("RGB", (4, 4), (240, 240, 240))
    for x, y in [(0, 0), (1, 0), (2, 0), (3, 0), (0, 1)]:
        image.putpixel((x, y), (10, 10, 10))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=buffer.getvalue(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
        sampling_mode="nearest",
    )

    assert cells[0][0].rgb == (10, 10, 10)


def test_coverage_sampling_uses_quantized_color_coverage() -> None:
    image = Image.new("RGB", (4, 4), (0, 0, 255))
    red_variants = [(250, 10, 10), (245, 15, 15), (240, 20, 20), (235, 25, 25)]
    for index, (x, y) in enumerate((x, y) for y in range(3) for x in range(3)):
        image.putpixel((x, y), red_variants[index % len(red_variants)])
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=buffer.getvalue(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
        sampling_mode="coverage",
    )

    assert cells[0][0].rgb == (243, 17, 17)


def test_coverage_sampling_respects_fractional_source_overlap() -> None:
    image = Image.new("RGB", (3, 1), (0, 0, 255))
    image.putpixel((0, 0), (255, 0, 0))
    image.putpixel((2, 0), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=buffer.getvalue(),
        width_cells=2,
        height_cells=1,
        source_mode="resample",
        sampling_mode="coverage",
    )

    assert [cell.rgb for cell in cells[0]] == [(255, 0, 0), (255, 0, 0)]


def test_coverage_sampling_preserves_dark_outline_when_threshold_is_met() -> None:
    image = Image.new("RGB", (4, 4), (240, 240, 240))
    for x, y in [(0, 0), (1, 0), (2, 0), (3, 0), (0, 1)]:
        image.putpixel((x, y), (10, 10, 10))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=buffer.getvalue(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
        sampling_mode="coverage",
    )

    assert cells[0][0].rgb == (10, 10, 10)


def test_original_grid_pipeline_uses_consistent_result_for_legacy_modes() -> None:
    provider = MockPixelArtProvider()

    smooth_cells = provider.convert(
        image_bytes=make_edge_image(),
        width_cells=2,
        height_cells=2,
        source_mode="resample",
        sampling_mode="smooth",
    )
    edge_cells = provider.convert(
        image_bytes=make_edge_image(),
        width_cells=2,
        height_cells=2,
        source_mode="resample",
        sampling_mode="edge",
    )

    assert [[cell.rgb for cell in row] for row in smooth_cells] != [[cell.rgb for cell in row] for row in edge_cells]


def test_center_shrink_sampling_ignores_block_edges() -> None:
    provider = MockPixelArtProvider()

    cells = provider.convert(
        image_bytes=make_center_shrink_image(),
        width_cells=1,
        height_cells=1,
        source_mode="resample",
        sampling_mode="center-shrink",
    )

    assert cells[0][0].rgb == (255, 0, 0)


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


def test_raw_sampling_maps_source_colors_to_bead_codes() -> None:
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_image(1, 1, (123, 45, 67)),
        width_cells=1,
        height_cells=1,
        palette=[PaletteColor(code="A", name="A", rgb=(0, 0, 0)), PaletteColor(code="B", name="B", rgb=(123, 45, 67))],
        source_mode="resample",
        sampling_mode="raw",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=4,
    )

    assert generation.result is not None
    cell = generation.result.cells[0][0]
    assert cell.sourceRgb == (123, 45, 67)
    assert cell.beadCode == "B"
    assert cell.beadName == "B"
    assert cell.beadRgb == (123, 45, 67)
    assert [item.beadCode for item in generation.result.usage] == ["B"]


def test_nearest_sampling_maps_source_colors_to_bead_codes() -> None:
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_image(1, 1, (123, 45, 67)),
        width_cells=1,
        height_cells=1,
        palette=[PaletteColor(code="A", name="A", rgb=(0, 0, 0)), PaletteColor(code="B", name="B", rgb=(123, 45, 67))],
        source_mode="resample",
        sampling_mode="nearest",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=4,
    )

    assert generation.result is not None
    cell = generation.result.cells[0][0]
    assert cell.sourceRgb == (123, 45, 67)
    assert cell.beadCode == "B"
    assert cell.beadName == "B"
    assert cell.beadRgb == (123, 45, 67)
    assert [item.beadCode for item in generation.result.usage] == ["B"]


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


def test_small_nearest_generation_respects_user_size_and_max_colors_without_ultra_small_clamp() -> None:
    class ColorfulProvider:
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
                    PixelArtCell(
                        x=x,
                        y=y,
                        rgb=((x * 17 + y * 11) % 256, (x * 29 + y * 7) % 256, (x * 5 + y * 37) % 256),
                    )
                    for x in range(width_cells)
                ]
                for y in range(height_cells)
            ]

    palette = [
        PaletteColor(code=f"C{index:02d}", name=f"Color {index}", rgb=((index * 17) % 256, (index * 31) % 256, (index * 47) % 256))
        for index in range(24)
    ]
    store = GenerationStore(provider=ColorfulProvider())

    generation = store.create(
        image_bytes=b"unused",
        width_cells=16,
        height_cells=16,
        palette=palette,
        source_mode="resample",
        sampling_mode="nearest",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=24,
    )

    assert generation.result is not None
    assert generation.result.widthCells == 16
    assert generation.result.heightCells == 16
    assert len(generation.result.cells) == 16
    assert len(generation.result.cells[0]) == 16
    assert len(generation.result.usage) > 8
    assert len(generation.result.usage) <= 24


def test_center_shrink_generation_quantizes_before_palette_mapping() -> None:
    image = Image.new("RGB", (4, 1))
    for x, rgb in enumerate([(250, 10, 10), (230, 20, 20), (10, 10, 250), (20, 20, 230)]):
        image.putpixel((x, 0), rgb)
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    store = GenerationStore()
    generation = store.create(
        image_bytes=buffer.getvalue(),
        width_cells=4,
        height_cells=1,
        palette=[
            PaletteColor(code="RED", name="Red", rgb=(255, 0, 0)),
            PaletteColor(code="BLUE", name="Blue", rgb=(0, 0, 255)),
        ],
        source_mode="resample",
        sampling_mode="center-shrink",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=2,
    )

    assert generation.result is not None
    assert [item.beadCode for item in generation.result.usage] == ["BLUE", "RED"]
    assert [item.count for item in generation.result.usage] == [2, 2]


def test_line_art_generation_outputs_black_beads_and_empty_background() -> None:
    palette = [
        PaletteColor(code="S01", name="纯黑", rgb=(0, 0, 0)),
        PaletteColor(code="S02", name="纯白", rgb=(255, 255, 255)),
    ]
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_line_art_image(),
        width_cells=10,
        height_cells=10,
        palette=palette,
        source_mode="resample",
        sampling_mode="line-art",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=16,
    )

    assert generation.result is not None
    cells = generation.result.cells
    bead_cells = [cell for row in cells for cell in row if hasattr(cell, "beadCode")]
    empty_cells = [cell for row in cells for cell in row if getattr(cell, "empty", False)]

    assert bead_cells
    assert empty_cells
    assert {cell.beadCode for cell in bead_cells} == {"S01"}
    assert generation.result.usage[0].beadCode == "S01"
    assert generation.result.rleRows is not None


def test_line_art_generation_keeps_colored_sketch_fills() -> None:
    palette = [
        PaletteColor(code="S01", name="纯黑", rgb=(0, 0, 0)),
        PaletteColor(code="RED", name="红色", rgb=(255, 0, 0)),
        PaletteColor(code="WHITE", name="白色", rgb=(255, 255, 255)),
    ]
    store = GenerationStore()

    generation = store.create(
        image_bytes=make_colored_sketch_image(),
        width_cells=10,
        height_cells=10,
        palette=palette,
        source_mode="resample",
        sampling_mode="line-art",
        color_complexity=ColorSimplificationProfile.ORIGINAL,
        max_colors=16,
    )

    assert generation.result is not None
    bead_codes = {cell.beadCode for row in generation.result.cells for cell in row if hasattr(cell, "beadCode")}
    empty_count = sum(1 for row in generation.result.cells for cell in row if getattr(cell, "empty", False))

    assert "S01" in bead_codes
    assert "RED" in bead_codes
    assert "WHITE" not in bead_codes
    assert empty_count > 0


def test_encode_rows_as_rle_compresses_horizontal_runs() -> None:
    assert encode_rows_as_rle([["S01", "S01", "S01", "S02", "S02"], ["S03"]]) == [
        "S01:3,S02:2",
        "S03:1",
    ]
