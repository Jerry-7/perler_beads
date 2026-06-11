from dataclasses import dataclass
from typing import Protocol

from app.models import Rgb


@dataclass(frozen=True)
class PixelArtCell:
    x: int
    y: int
    rgb: Rgb | None
    empty: bool = False


class PixelArtProvider(Protocol):
    def convert(self, image_bytes: bytes, width_cells: int, height_cells: int) -> list[list[PixelArtCell]]:
        """Convert image bytes into a fixed-size pixel-art matrix."""
