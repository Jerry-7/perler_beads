from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from app.color_matching import PaletteEmptyError, find_nearest_color
from app.color_matching import rgb_distance
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, PixelCell
from app.palette import PALETTE_VERSION
from app.providers.base import PixelArtProvider
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError
from app.services.color_simplification import ColorSimplificationProfile, simplify_low_usage_similar_colors


class GenerationError(ValueError):
    pass


@dataclass
class Generation:
    id: str
    status: str
    result: PatternResult | None = None
    error: str | None = None


class GenerationStore:
    def __init__(self, provider: PixelArtProvider | None = None) -> None:
        self._items: dict[str, Generation] = {}
        self._provider = provider

    def create(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        palette: list[PaletteColor],
        source_mode: str = "auto",
        color_complexity: ColorSimplificationProfile = ColorSimplificationProfile.BALANCED,
        sampling_mode: str = "dominant",
        max_colors: int = 16,
    ) -> Generation:
        generation = Generation(id=uuid4().hex, status="processing")
        self._items[generation.id] = generation

        try:
            generation.result = self._generate(
                image_bytes,
                width_cells,
                height_cells,
                palette,
                source_mode,
                color_complexity,
                sampling_mode,
                max_colors,
            )
            generation.status = "completed"
        except (PaletteEmptyError, PixelArtProviderError) as exc:
            generation.status = "failed"
            generation.error = str(exc)
            raise GenerationError(str(exc)) from exc

        return generation

    def get(self, generation_id: str) -> Generation | None:
        return self._items.get(generation_id)

    def _generate(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        palette: list[PaletteColor],
        source_mode: str,
        color_complexity: ColorSimplificationProfile,
        sampling_mode: str,
        max_colors: int,
    ) -> PatternResult:
        pixel_matrix = self._get_provider().convert(
            image_bytes=image_bytes,
            width_cells=width_cells,
            height_cells=height_cells,
            source_mode=source_mode,
            sampling_mode=sampling_mode,
        )
        rows: list[list[PixelCell | BeadCell]] = []

        for pixel_row in pixel_matrix:
            row: list[PixelCell | BeadCell] = []
            for pixel in pixel_row:
                if pixel.empty or pixel.rgb is None:
                    row.append(PixelCell(x=pixel.x, y=pixel.y))
                    continue

                bead, distance = find_nearest_color(pixel.rgb, palette)
                row.append(
                    BeadCell(
                        x=pixel.x,
                        y=pixel.y,
                        sourceRgb=pixel.rgb,
                        beadCode=bead.code,
                        beadName=bead.name,
                        beadRgb=bead.rgb,
                        distance=round(distance, 3),
                    )
                )
            rows.append(row)

        rows = simplify_low_usage_similar_colors(rows, profile=color_complexity)
        rows = limit_bead_colors(rows, max_colors)
        usage_counter: Counter[str] = Counter()
        usage_colors: dict[str, BeadCell] = {}
        for row in rows:
            for cell in row:
                if isinstance(cell, BeadCell):
                    usage_counter[cell.beadCode] += 1
                    usage_colors[cell.beadCode] = cell

        usage = [
            BeadUsage(
                beadCode=code,
                beadName=usage_colors[code].beadName,
                beadRgb=usage_colors[code].beadRgb,
                count=count,
            )
            for code, count in sorted(usage_counter.items(), key=lambda item: item[0])
        ]

        return PatternResult(
            widthCells=width_cells,
            heightCells=height_cells,
            paletteVersion=PALETTE_VERSION,
            cells=rows,
            usage=usage,
            generatedAt=datetime.now(UTC).isoformat(),
        )

    def _get_provider(self) -> PixelArtProvider:
        if self._provider is None:
            self._provider = MockPixelArtProvider()
        return self._provider


generation_store = GenerationStore()


def limit_bead_colors(rows: list[list[PixelCell | BeadCell]], max_colors: int) -> list[list[PixelCell | BeadCell]]:
    usage_counter: Counter[str] = Counter(cell.beadCode for row in rows for cell in row if isinstance(cell, BeadCell))
    if len(usage_counter) <= max_colors:
        return rows

    representative_cells: dict[str, BeadCell] = {}
    for row in rows:
        for cell in row:
            if isinstance(cell, BeadCell):
                representative_cells[cell.beadCode] = cell

    kept_codes = {
        code
        for code, _count in sorted(
            usage_counter.items(),
            key=lambda item: (-item[1], item[0]),
        )[:max_colors]
    }
    kept_cells = [representative_cells[code] for code in kept_codes]

    return [
        [replace_with_nearest_kept_color(cell, kept_cells) if isinstance(cell, BeadCell) and cell.beadCode not in kept_codes else cell for cell in row]
        for row in rows
    ]


def replace_with_nearest_kept_color(cell: BeadCell, kept_cells: list[BeadCell]) -> BeadCell:
    target = min(kept_cells, key=lambda kept: rgb_distance(cell.beadRgb, kept.beadRgb))
    return BeadCell(
        x=cell.x,
        y=cell.y,
        sourceRgb=cell.sourceRgb,
        beadCode=target.beadCode,
        beadName=target.beadName,
        beadRgb=target.beadRgb,
        distance=round(rgb_distance(cell.sourceRgb, target.beadRgb), 3),
    )
