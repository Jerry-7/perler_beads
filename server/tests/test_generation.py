from io import BytesIO

from PIL import Image

from app.palette import get_enabled_palette
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
