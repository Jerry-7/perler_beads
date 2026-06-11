import json
from functools import lru_cache
from pathlib import Path

from app.models import PaletteColor

PALETTE_VERSION = "color-pdf-v1"
PALETTE_PATH = Path(__file__).parent / "color_template" / "colors.json"
DEFAULT_BEAD_TYPE = "round"


@lru_cache(maxsize=1)
def load_palettes() -> dict[str, list[PaletteColor]]:
    payload = json.loads(PALETTE_PATH.read_text(encoding="utf-8"))
    return {
        bead_type: [
            PaletteColor(code=item["code"], name=item["name"], rgb=tuple(item["rgb"]), enabled=item["enabled"])
            for item in colors
        ]
        for bead_type, colors in payload["palettes"].items()
    }


def get_palette() -> list[PaletteColor]:
    return load_palettes()[DEFAULT_BEAD_TYPE]


def get_enabled_palette() -> list[PaletteColor]:
    return [color for color in get_palette() if color.enabled]
