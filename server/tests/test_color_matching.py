from app.color_matching import find_nearest_color
from app.models import PaletteColor


def test_find_nearest_color() -> None:
    palette = [
        PaletteColor(code="black", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="white", name="White", rgb=(255, 255, 255)),
    ]

    color, distance = find_nearest_color((12, 10, 9), palette)

    assert color.code == "black"
    assert distance > 0
