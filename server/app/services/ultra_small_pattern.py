from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.color_matching import find_nearest_color
from app.models import BeadCell, BeadUsage, PaletteColor, PatternResult, Rgb
from app.palette import PALETTE_VERSION
from app.providers.mock_pixel_art import encode_rows_as_rle, int_ceil


class UltraSmallPatternError(ValueError):
    pass


@dataclass(frozen=True)
class WeightedSample:
    x: int
    y: int
    rgb: Rgb
    protected_feature: bool = False


def process_ultra_small_bead_pattern(
    image_bytes: bytes,
    target_width: int,
    target_height: int,
    max_colors: int,
    bead_palette: list[PaletteColor],
) -> PatternResult:
    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except UnidentifiedImageError as exc:
        raise UltraSmallPatternError("Uploaded file is not a supported image") from exc

    if image.width <= 0 or image.height <= 0:
        raise UltraSmallPatternError("Uploaded image has invalid dimensions")
    if target_width <= 0 or target_height <= 0:
        raise UltraSmallPatternError("target size must be positive")

    clamped_colors = clamp_ultra_small_colors(max_colors, max(target_width, target_height))
    samples = salience_weighted_resample(image, target_width, target_height)
    samples = quantize_weighted_samples(samples, clamped_colors)
    rows, protected_flags = map_samples_to_beads(samples, bead_palette)
    rows = despeckle_isolated_cells(rows, protected_flags)
    usage = build_usage(rows)
    rle_rows = encode_rows_as_rle([[cell.beadCode for cell in row] for row in rows])

    return PatternResult(
        widthCells=target_width,
        heightCells=target_height,
        paletteVersion=PALETTE_VERSION,
        usage=usage,
        generatedAt=datetime.now(UTC).isoformat(),
        rleRows=rle_rows,
    )


def clamp_ultra_small_colors(max_colors: int, target_size: int) -> int:
    if target_size <= 24:
        return max(1, min(max_colors, 8))
    if target_size <= 48:
        return max(1, min(max_colors, 16))
    return max(1, max_colors)


def salience_weighted_resample(image: Image.Image, target_width: int, target_height: int) -> list[list[WeightedSample]]:
    rows: list[list[WeightedSample]] = []
    for y in range(target_height):
        row: list[WeightedSample] = []
        top = y * image.height / target_height
        bottom = (y + 1) * image.height / target_height
        source_y0 = int(top)
        source_y1 = max(source_y0 + 1, min(image.height, int_ceil(bottom)))
        for x in range(target_width):
            left = x * image.width / target_width
            right = (x + 1) * image.width / target_width
            source_x0 = int(left)
            source_x1 = max(source_x0 + 1, min(image.width, int_ceil(right)))
            row.append(weighted_region_sample(image, x, y, source_x0, source_y0, source_x1, source_y1))
        rows.append(row)
    return rows


def weighted_region_sample(
    image: Image.Image,
    target_x: int,
    target_y: int,
    left: int,
    top: int,
    right: int,
    bottom: int,
) -> WeightedSample:
    scores: defaultdict[Rgb, float] = defaultdict(float)
    protected_scores: defaultdict[Rgb, float] = defaultdict(float)
    for y in range(top, bottom):
        for x in range(left, right):
            rgb = image.getpixel((x, y))
            weight = 1.0
            protected = False
            if luminance(rgb) < 80:
                weight += 4
                protected = True
            if is_high_saturation_or_value(rgb):
                weight += 2
            scores[rgb] += weight
            if protected:
                protected_scores[rgb] += weight

    if not scores:
        return WeightedSample(x=target_x, y=target_y, rgb=(0, 0, 0))

    rgb = max(scores.items(), key=lambda item: (item[1], protected_scores[item[0]], -luminance(item[0])))[0]
    return WeightedSample(
        x=target_x,
        y=target_y,
        rgb=rgb,
        protected_feature=protected_scores[rgb] > 0 and protected_scores[rgb] >= scores[rgb] * 0.5,
    )


def quantize_weighted_samples(samples: list[list[WeightedSample]], max_colors: int) -> list[list[WeightedSample]]:
    colors = [sample.rgb for row in samples for sample in row]
    unique_colors = set(colors)
    cluster_count = min(max_colors, len(unique_colors))
    if cluster_count <= 0 or len(unique_colors) <= cluster_count:
        return samples

    centroids = kmeans_rgb(colors, cluster_count)
    return [
        [
            WeightedSample(
                x=sample.x,
                y=sample.y,
                rgb=nearest_centroid(sample.rgb, centroids),
                protected_feature=sample.protected_feature,
            )
            for sample in row
        ]
        for row in samples
    ]


def map_samples_to_beads(samples: list[list[WeightedSample]], palette: list[PaletteColor]) -> tuple[list[list[BeadCell]], list[list[bool]]]:
    rows: list[list[BeadCell]] = []
    protected_flags: list[list[bool]] = []
    for sample_row in samples:
        row: list[BeadCell] = []
        protected_row: list[bool] = []
        for sample in sample_row:
            bead, distance = find_nearest_color(sample.rgb, palette)
            row.append(
                BeadCell(
                    x=sample.x,
                    y=sample.y,
                    sourceRgb=sample.rgb,
                    beadCode=bead.code,
                    beadName=bead.name,
                    beadRgb=bead.rgb,
                    distance=round(distance, 3),
                )
            )
            protected_row.append(sample.protected_feature)
        rows.append(row)
        protected_flags.append(protected_row)
    return rows, protected_flags


def despeckle_isolated_cells(rows: list[list[BeadCell]], protected_flags: list[list[bool]]) -> list[list[BeadCell]]:
    if not rows:
        return rows

    height = len(rows)
    width = len(rows[0])
    cleaned = [[cell for cell in row] for row in rows]
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            neighbor_codes = [
                rows[ny][nx].beadCode
                for ny in range(max(0, y - 1), min(height, y + 2))
                for nx in range(max(0, x - 1), min(width, x + 2))
                if not (ny == y and nx == x)
            ]
            if not neighbor_codes or cell.beadCode in neighbor_codes or protected_flags[y][x]:
                continue
            replacement_code, _count = Counter(neighbor_codes).most_common(1)[0]
            target = next(rows[ny][nx] for ny in range(max(0, y - 1), min(height, y + 2)) for nx in range(max(0, x - 1), min(width, x + 2)) if rows[ny][nx].beadCode == replacement_code)
            cleaned[y][x] = BeadCell(
                x=cell.x,
                y=cell.y,
                sourceRgb=cell.sourceRgb,
                beadCode=target.beadCode,
                beadName=target.beadName,
                beadRgb=target.beadRgb,
                distance=target.distance,
            )
    return cleaned


def build_usage(rows: list[list[BeadCell]]) -> list[BeadUsage]:
    usage_counter: Counter[str] = Counter()
    usage_colors: dict[str, BeadCell] = {}
    for row in rows:
        for cell in row:
            usage_counter[cell.beadCode] += 1
            usage_colors[cell.beadCode] = cell
    return [
        BeadUsage(
            beadCode=code,
            beadName=usage_colors[code].beadName,
            beadRgb=usage_colors[code].beadRgb,
            count=count,
        )
        for code, count in sorted(usage_counter.items(), key=lambda item: item[0])
    ]


def luminance(rgb: Rgb) -> float:
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]


def is_high_saturation_or_value(rgb: Rgb) -> bool:
    maximum = max(rgb)
    minimum = min(rgb)
    saturation = 0 if maximum == 0 else (maximum - minimum) / maximum
    value = maximum / 255
    return saturation > 0.72 or value > 0.92


def kmeans_rgb(colors: list[Rgb], cluster_count: int, iterations: int = 12) -> list[Rgb]:
    unique_colors = sorted(set(colors), key=lambda rgb: (luminance(rgb), rgb))
    if cluster_count >= len(unique_colors):
        return unique_colors
    if cluster_count == 1:
        return [average_rgb(colors)]

    step = (len(unique_colors) - 1) / (cluster_count - 1)
    centroids = [unique_colors[round(index * step)] for index in range(cluster_count)]
    for _ in range(iterations):
        buckets: list[list[Rgb]] = [[] for _ in centroids]
        for color in colors:
            bucket_index = min(range(len(centroids)), key=lambda index: rgb_distance(color, centroids[index]))
            buckets[bucket_index].append(color)
        next_centroids = [average_rgb(bucket) if bucket else centroids[index] for index, bucket in enumerate(buckets)]
        if next_centroids == centroids:
            break
        centroids = next_centroids
    return centroids


def nearest_centroid(rgb: Rgb, centroids: list[Rgb]) -> Rgb:
    return min(centroids, key=lambda centroid: rgb_distance(rgb, centroid))


def average_rgb(colors: list[Rgb]) -> Rgb:
    return (
        round(sum(color[0] for color in colors) / len(colors)),
        round(sum(color[1] for color in colors) / len(colors)),
        round(sum(color[2] for color in colors) / len(colors)),
    )


def rgb_distance(left: Rgb, right: Rgb) -> float:
    return sum((left[index] - right[index]) ** 2 for index in range(3))
