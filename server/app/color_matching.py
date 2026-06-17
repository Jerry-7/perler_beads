from functools import lru_cache
from math import atan2, cos, degrees, exp, radians, sin, sqrt

from app.models import PaletteColor, Rgb

Lab = tuple[float, float, float]


class PaletteEmptyError(ValueError):
    pass


def rgb_distance(left: Rgb, right: Rgb) -> float:
    return sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


@lru_cache(maxsize=8192)
def rgb_to_lab(rgb: Rgb) -> Lab:
    red, green, blue = (_srgb_channel_to_linear(channel / 255) for channel in rgb)

    x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) * 100
    y = (red * 0.2126729 + green * 0.7151522 + blue * 0.0721750) * 100
    z = (red * 0.0193339 + green * 0.1191920 + blue * 0.9503041) * 100

    x_ref = 95.047
    y_ref = 100.000
    z_ref = 108.883

    fx = _xyz_to_lab_component(x / x_ref)
    fy = _xyz_to_lab_component(y / y_ref)
    fz = _xyz_to_lab_component(z / z_ref)

    return (
        116 * fy - 16,
        500 * (fx - fy),
        200 * (fy - fz),
    )


def _srgb_channel_to_linear(channel: float) -> float:
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def _xyz_to_lab_component(value: float) -> float:
    delta = 6 / 29
    if value > delta**3:
        return value ** (1 / 3)
    return value / (3 * delta**2) + 4 / 29


def cie76_distance(left: Lab, right: Lab) -> float:
    return sqrt(sum((left[index] - right[index]) ** 2 for index in range(3)))


def ciede2000_distance(left: Lab, right: Lab) -> float:
    left_l, left_a, left_b = left
    right_l, right_a, right_b = right

    average_l = (left_l + right_l) / 2
    left_c = sqrt(left_a**2 + left_b**2)
    right_c = sqrt(right_a**2 + right_b**2)
    average_c = (left_c + right_c) / 2

    g = 0.5 * (1 - sqrt(average_c**7 / (average_c**7 + 25**7)))
    left_a_prime = (1 + g) * left_a
    right_a_prime = (1 + g) * right_a
    left_c_prime = sqrt(left_a_prime**2 + left_b**2)
    right_c_prime = sqrt(right_a_prime**2 + right_b**2)
    average_c_prime = (left_c_prime + right_c_prime) / 2

    left_h_prime = _lab_hue_degrees(left_b, left_a_prime, left_c_prime)
    right_h_prime = _lab_hue_degrees(right_b, right_a_prime, right_c_prime)

    delta_l_prime = right_l - left_l
    delta_c_prime = right_c_prime - left_c_prime
    delta_h_prime = _delta_hue_prime(left_h_prime, right_h_prime, left_c_prime, right_c_prime)
    delta_h_big_prime = 2 * sqrt(left_c_prime * right_c_prime) * sin(radians(delta_h_prime / 2))

    average_h_prime = _average_hue_prime(left_h_prime, right_h_prime, left_c_prime, right_c_prime)
    t = (
        1
        - 0.17 * cos(radians(average_h_prime - 30))
        + 0.24 * cos(radians(2 * average_h_prime))
        + 0.32 * cos(radians(3 * average_h_prime + 6))
        - 0.20 * cos(radians(4 * average_h_prime - 63))
    )
    delta_theta = 30 * exp(-((average_h_prime - 275) / 25) ** 2)
    r_c = 2 * sqrt(average_c_prime**7 / (average_c_prime**7 + 25**7))
    s_l = 1 + (0.015 * (average_l - 50) ** 2) / sqrt(20 + (average_l - 50) ** 2)
    s_c = 1 + 0.045 * average_c_prime
    s_h = 1 + 0.015 * average_c_prime * t
    r_t = -sin(radians(2 * delta_theta)) * r_c

    return sqrt(
        (delta_l_prime / s_l) ** 2
        + (delta_c_prime / s_c) ** 2
        + (delta_h_big_prime / s_h) ** 2
        + r_t * (delta_c_prime / s_c) * (delta_h_big_prime / s_h)
    )


def _lab_hue_degrees(b: float, a_prime: float, c_prime: float) -> float:
    if c_prime == 0:
        return 0
    return degrees(atan2(b, a_prime)) % 360


def _delta_hue_prime(left_h: float, right_h: float, left_c: float, right_c: float) -> float:
    if left_c * right_c == 0:
        return 0
    hue_delta = right_h - left_h
    if abs(hue_delta) <= 180:
        return hue_delta
    if hue_delta > 180:
        return hue_delta - 360
    return hue_delta + 360


def _average_hue_prime(left_h: float, right_h: float, left_c: float, right_c: float) -> float:
    if left_c * right_c == 0:
        return left_h + right_h
    if abs(left_h - right_h) <= 180:
        return (left_h + right_h) / 2
    if left_h + right_h < 360:
        return (left_h + right_h + 360) / 2
    return (left_h + right_h - 360) / 2


def perceptual_distance(left: Rgb, right: Rgb) -> float:
    return ciede2000_distance(rgb_to_lab(left), rgb_to_lab(right))


def find_nearest_color(rgb: Rgb, palette: list[PaletteColor]) -> tuple[PaletteColor, float]:
    if not palette:
        raise PaletteEmptyError("At least one enabled palette color is required")

    nearest = min(palette, key=lambda color: perceptual_distance(rgb, color.rgb))
    return nearest, perceptual_distance(rgb, nearest.rgb)
