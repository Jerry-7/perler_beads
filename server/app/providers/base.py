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
        """Convert image bytes into a fixed-size pixel-art matrix."""
