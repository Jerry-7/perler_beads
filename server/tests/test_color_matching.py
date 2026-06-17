from app.color_matching import ciede2000_distance, find_nearest_color, rgb_to_lab
from app.models import PaletteColor


def assert_close(actual: float, expected: float, tolerance: float = 0.01) -> None:
    assert abs(actual - expected) <= tolerance


def test_rgb_to_lab_converts_srgb_using_d65_reference_white() -> None:
    lab = rgb_to_lab((255, 0, 0))

    assert_close(lab[0], 53.24)
    assert_close(lab[1], 80.09)
    assert_close(lab[2], 67.20)


def test_ciede2000_uses_standard_reference_pair() -> None:
    distance = ciede2000_distance(
        (50.0000, 2.6772, -79.7751),
        (50.0000, 0.0000, -82.7485),
    )

    assert_close(distance, 2.0425, 0.0005)


def test_find_nearest_color() -> None:
    palette = [
        PaletteColor(code="black", name="Black", rgb=(0, 0, 0)),
        PaletteColor(code="white", name="White", rgb=(255, 255, 255)),
    ]

    color, distance = find_nearest_color((12, 10, 9), palette)

    assert color.code == "black"
    assert distance > 0


def test_find_nearest_color_uses_perceptual_lab_distance() -> None:
    palette = [
        PaletteColor(code="blue-black", name="Blue Black", rgb=(0, 0, 16)),
        PaletteColor(code="soft-black", name="Soft Black", rgb=(16, 16, 16)),
    ]

    color, distance = find_nearest_color((0, 0, 0), palette)

    assert color.code == "soft-black"
    assert_close(distance, 2.734, 0.001)
