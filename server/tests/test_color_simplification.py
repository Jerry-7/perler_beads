from app.models import BeadCell, PixelCell
from app.services.color_simplification import ColorSimplificationProfile, simplify_low_usage_similar_colors


def bead_cell(x: int, y: int, code: str, rgb: tuple[int, int, int]) -> BeadCell:
    return BeadCell(
        x=x,
        y=y,
        sourceRgb=rgb,
        beadCode=code,
        beadName=code,
        beadRgb=rgb,
        distance=0,
    )


def test_merges_low_usage_similar_color_into_more_common_color() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), bead_cell(1, 1, "B", (110, 108, 105))],
    ]

    simplified = simplify_low_usage_similar_colors(rows)

    assert isinstance(simplified[1][1], BeadCell)
    assert simplified[1][1].beadCode == "A"
    assert simplified[1][1].beadRgb == (100, 100, 100)
    assert simplified[1][1].sourceRgb == (110, 108, 105)


def test_keeps_low_usage_color_when_not_similar_to_common_color() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), bead_cell(1, 1, "B", (220, 30, 30))],
    ]

    simplified = simplify_low_usage_similar_colors(rows)

    assert isinstance(simplified[1][1], BeadCell)
    assert simplified[1][1].beadCode == "B"


def test_does_not_modify_empty_cells() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), PixelCell(x=1, y=1)],
    ]

    simplified = simplify_low_usage_similar_colors(rows)

    assert isinstance(simplified[1][1], PixelCell)


def test_uses_ratio_threshold_for_larger_patterns() -> None:
    row = [bead_cell(index, 0, "A", (100, 100, 100)) for index in range(990)]
    row.extend(bead_cell(index, 0, "B", (110, 108, 105)) for index in range(990, 999))

    simplified = simplify_low_usage_similar_colors([row])

    assert all(isinstance(cell, BeadCell) and cell.beadCode == "A" for cell in simplified[0])


def test_simple_profile_merges_more_aggressively_than_detailed_profile() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), bead_cell(1, 1, "B", (138, 100, 100))],
    ]

    simple = simplify_low_usage_similar_colors(rows, profile=ColorSimplificationProfile.SIMPLE)
    detailed = simplify_low_usage_similar_colors(rows, profile=ColorSimplificationProfile.DETAILED)

    assert isinstance(simple[1][1], BeadCell)
    assert simple[1][1].beadCode == "A"
    assert isinstance(detailed[1][1], BeadCell)
    assert detailed[1][1].beadCode == "B"


def test_minimal_profile_merges_more_aggressively_than_simple_profile() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), bead_cell(1, 1, "B", (152, 100, 100))],
    ]

    minimal = simplify_low_usage_similar_colors(rows, profile=ColorSimplificationProfile.MINIMAL)
    simple = simplify_low_usage_similar_colors(rows, profile=ColorSimplificationProfile.SIMPLE)

    assert isinstance(minimal[1][1], BeadCell)
    assert minimal[1][1].beadCode == "A"
    assert isinstance(simple[1][1], BeadCell)
    assert simple[1][1].beadCode == "B"


def test_original_profile_does_not_merge_colors() -> None:
    rows = [
        [bead_cell(0, 0, "A", (100, 100, 100)), bead_cell(1, 0, "A", (100, 100, 100))],
        [bead_cell(0, 1, "A", (100, 100, 100)), bead_cell(1, 1, "B", (110, 108, 105))],
    ]

    simplified = simplify_low_usage_similar_colors(rows, profile=ColorSimplificationProfile.ORIGINAL)

    assert isinstance(simplified[1][1], BeadCell)
    assert simplified[1][1].beadCode == "B"
