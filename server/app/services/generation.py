from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from app.color_matching import PaletteEmptyError, find_nearest_color
from app.color_matching import rgb_distance
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, PixelCell
from app.palette import PALETTE_VERSION
from app.providers.base import PixelArtCell, PixelArtProvider
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError
from app.services.color_simplification import ColorSimplificationProfile, simplify_low_usage_similar_colors
from app.services.grid_scan_pattern import GridScanPatternError, process_grid_scan_bead_pattern
from app.services.line_art_pattern import LineArtPatternError, process_line_art_bead_pattern
from app.services.ultra_small_pattern import UltraSmallPatternError, process_ultra_small_bead_pattern


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
        cluster_quantile: float = 0.2,
        cluster_eps: float = 30.0,
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
                cluster_quantile,
                cluster_eps,
            )
            generation.status = "completed"
        except (PaletteEmptyError, PixelArtProviderError, UltraSmallPatternError, LineArtPatternError, GridScanPatternError) as exc:
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
        cluster_quantile: float = 0.2,
        cluster_eps: float = 30.0,
    ) -> PatternResult:
        if sampling_mode == "grid-scan":
            return process_grid_scan_bead_pattern(
                image_bytes=image_bytes,
                bead_palette=palette,
                target_width=width_cells,
                target_height=height_cells,
            )
        if sampling_mode == "cluster-ms":
            from app.services.cluster_pattern import process_cluster_ms_bead_pattern

            return process_cluster_ms_bead_pattern(
                image_bytes=image_bytes,
                bead_palette=palette,
                target_width=width_cells,
                target_height=height_cells,
                quantile=cluster_quantile,
            )
        if sampling_mode == "cluster-dbscan":
            from app.services.cluster_pattern import process_cluster_dbscan_bead_pattern

            return process_cluster_dbscan_bead_pattern(
                image_bytes=image_bytes,
                bead_palette=palette,
                target_width=width_cells,
                target_height=height_cells,
                eps=cluster_eps,
            )
        if sampling_mode == "ultra-small":
            return process_ultra_small_bead_pattern(
                image_bytes=image_bytes,
                target_width=width_cells,
                target_height=height_cells,
                max_colors=max_colors,
                bead_palette=palette,
            )
        if sampling_mode == "line-art":
            return process_line_art_bead_pattern(
                image_bytes=image_bytes,
                target_width=width_cells,
                target_height=height_cells,
                bead_palette=palette,
            )

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
        rle_rows = encode_pattern_rows_as_rle(rows)
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
            usage=usage,
            generatedAt=datetime.now(UTC).isoformat(),
            rleRows=rle_rows,
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


def quantize_pixel_matrix(pixel_matrix: list[list[PixelArtCell]], max_colors: int) -> list[list[PixelArtCell]]:
    colors = [cell.rgb for row in pixel_matrix for cell in row if not cell.empty and cell.rgb is not None]
    unique_colors = sorted(set(colors))
    cluster_count = min(max_colors, len(unique_colors))
    if cluster_count <= 0 or len(unique_colors) <= cluster_count:
        return pixel_matrix

    centroids = kmeans_rgb(colors, cluster_count)
    return [
        [
            PixelArtCell(
                x=cell.x,
                y=cell.y,
                rgb=nearest_centroid(cell.rgb, centroids) if not cell.empty and cell.rgb is not None else None,
                empty=cell.empty,
            )
            for cell in row
        ]
        for row in pixel_matrix
    ]


def kmeans_rgb(colors: list[tuple[int, int, int]], cluster_count: int, iterations: int = 12) -> list[tuple[int, int, int]]:
    unique_colors = sorted(set(colors), key=lambda rgb: (luminance(rgb), rgb))
    if cluster_count >= len(unique_colors):
        return unique_colors

    if cluster_count == 1:
        return [average_rgb(colors)]

    step = (len(unique_colors) - 1) / (cluster_count - 1)
    centroids = [unique_colors[round(index * step)] for index in range(cluster_count)]

    for _ in range(iterations):
        buckets: list[list[tuple[int, int, int]]] = [[] for _ in centroids]
        for color in colors:
            bucket_index = min(range(len(centroids)), key=lambda index: rgb_distance(color, centroids[index]))
            buckets[bucket_index].append(color)

        next_centroids = [average_rgb(bucket) if bucket else centroids[index] for index, bucket in enumerate(buckets)]
        if next_centroids == centroids:
            break
        centroids = next_centroids

    return centroids


def nearest_centroid(rgb: tuple[int, int, int], centroids: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return min(centroids, key=lambda centroid: rgb_distance(rgb, centroid))


def average_rgb(colors: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    return (
        round(sum(color[0] for color in colors) / len(colors)),
        round(sum(color[1] for color in colors) / len(colors)),
        round(sum(color[2] for color in colors) / len(colors)),
    )


def luminance(rgb: tuple[int, int, int]) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def encode_pattern_rows_as_rle(rows: list[list[PixelCell | BeadCell]]) -> list[str]:
    encoded_rows: list[str] = []
    for row in rows:
        if not row:
            encoded_rows.append("")
            continue

        runs: list[str] = []
        current = pattern_cell_code(row[0])
        count = 1
        for cell in row[1:]:
            code = pattern_cell_code(cell)
            if code == current:
                count += 1
                continue
            runs.append(f"{current}:{count}")
            current = code
            count = 1
        runs.append(f"{current}:{count}")
        encoded_rows.append(",".join(runs))
    return encoded_rows


def pattern_cell_code(cell: PixelCell | BeadCell) -> str:
    if isinstance(cell, BeadCell):
        return cell.beadCode
    return "EMPTY"
