from math import sqrt

from app.models import PaletteColor, Rgb


class PaletteEmptyError(ValueError):
    pass


def rgb_distance(left: Rgb, right: Rgb) -> float:
    return sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def find_nearest_color(rgb: Rgb, palette: list[PaletteColor]) -> tuple[PaletteColor, float]:
    if not palette:
        raise PaletteEmptyError("At least one enabled palette color is required")

    nearest = min(palette, key=lambda color: rgb_distance(rgb, color.rgb))
    return nearest, rgb_distance(rgb, nearest.rgb)
