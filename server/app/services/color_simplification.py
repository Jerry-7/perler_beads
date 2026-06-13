from collections import Counter
from enum import StrEnum
from math import ceil

from app.color_matching import rgb_distance
from app.models import BeadCell, PixelCell


class ColorSimplificationProfile(StrEnum):
    MINIMAL = "minimal"
    SIMPLE = "simple"
    BALANCED = "balanced"
    DETAILED = "detailed"
    ORIGINAL = "original"


PROFILE_SETTINGS = {
    ColorSimplificationProfile.MINIMAL: {
        "min_low_usage_cells": 10,
        "low_usage_ratio": 0.035,
        "similar_color_distance": 60,
    },
    ColorSimplificationProfile.SIMPLE: {
        "min_low_usage_cells": 6,
        "low_usage_ratio": 0.02,
        "similar_color_distance": 45,
    },
    ColorSimplificationProfile.BALANCED: {
        "min_low_usage_cells": 3,
        "low_usage_ratio": 0.01,
        "similar_color_distance": 35,
    },
    ColorSimplificationProfile.DETAILED: {
        "min_low_usage_cells": 2,
        "low_usage_ratio": 0.005,
        "similar_color_distance": 25,
    },
}


def simplify_low_usage_similar_colors(
    rows: list[list[PixelCell | BeadCell]],
    profile: ColorSimplificationProfile = ColorSimplificationProfile.BALANCED,
) -> list[list[PixelCell | BeadCell]]:
    if profile == ColorSimplificationProfile.ORIGINAL:
        return rows

    settings = PROFILE_SETTINGS[profile]
    bead_counts = Counter(cell.beadCode for row in rows for cell in row if isinstance(cell, BeadCell))
    bead_colors = {cell.beadCode: cell for row in rows for cell in row if isinstance(cell, BeadCell)}
    total_bead_cells = sum(bead_counts.values())
    if total_bead_cells == 0:
        return rows

    low_usage_limit = max(settings["min_low_usage_cells"], ceil(total_bead_cells * settings["low_usage_ratio"]))
    replacements = build_replacements(bead_counts, bead_colors, low_usage_limit, settings["similar_color_distance"])
    if not replacements:
        return rows

    return [
        [replace_cell_color(cell, replacements[cell.beadCode]) if isinstance(cell, BeadCell) and cell.beadCode in replacements else cell for cell in row]
        for row in rows
    ]


def build_replacements(
    bead_counts: Counter[str],
    bead_colors: dict[str, BeadCell],
    low_usage_limit: int,
    similar_color_distance: float,
) -> dict[str, BeadCell]:
    replacements: dict[str, BeadCell] = {}
    for code, count in bead_counts.items():
        if count >= low_usage_limit:
            continue

        source = bead_colors[code]
        candidates = [
            bead_colors[target_code]
            for target_code, target_count in bead_counts.items()
            if target_count > count and rgb_distance(source.beadRgb, bead_colors[target_code].beadRgb) <= similar_color_distance
        ]
        if not candidates:
            continue

        replacements[code] = max(candidates, key=lambda candidate: bead_counts[candidate.beadCode])

    return replacements


def replace_cell_color(cell: BeadCell, target: BeadCell) -> BeadCell:
    return BeadCell(
        x=cell.x,
        y=cell.y,
        sourceRgb=cell.sourceRgb,
        beadCode=target.beadCode,
        beadName=target.beadName,
        beadRgb=target.beadRgb,
        distance=round(rgb_distance(cell.sourceRgb, target.beadRgb), 3),
    )
