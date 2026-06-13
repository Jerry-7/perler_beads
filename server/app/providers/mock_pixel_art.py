from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.providers.base import PixelArtCell


class PixelArtProviderError(ValueError):
    pass


class MockPixelArtProvider:
    """Local placeholder for the future third-party AI pixel-art provider."""

    def convert(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        source_mode: str = "auto",
    ) -> list[list[PixelArtCell]]:
        try:
            original = Image.open(BytesIO(image_bytes)).convert("RGB")
        except UnidentifiedImageError as exc:
            raise PixelArtProviderError("Uploaded file is not a supported image") from exc

        if original.width <= 0 or original.height <= 0:
            raise PixelArtProviderError("Uploaded image has invalid dimensions")

        if source_mode == "resample":
            resized = original.resize((width_cells, height_cells), Image.Resampling.LANCZOS)
            return [
                [PixelArtCell(x=x, y=y, rgb=resized.getpixel((x, y))) for x in range(width_cells)]
                for y in range(height_cells)
            ]

        scale = min(width_cells / original.width, height_cells / original.height)
        scaled_width = max(1, min(width_cells, round(original.width * scale)))
        scaled_height = max(1, min(height_cells, round(original.height * scale)))
        offset_x = (width_cells - scaled_width) // 2
        offset_y = (height_cells - scaled_height) // 2

        resized = original.resize((scaled_width, scaled_height), Image.Resampling.LANCZOS)
        matrix: list[list[PixelArtCell]] = []

        for y in range(height_cells):
            row: list[PixelArtCell] = []
            for x in range(width_cells):
                source_x = x - offset_x
                source_y = y - offset_y
                if 0 <= source_x < scaled_width and 0 <= source_y < scaled_height:
                    row.append(PixelArtCell(x=x, y=y, rgb=resized.getpixel((source_x, source_y))))
                else:
                    row.append(PixelArtCell(x=x, y=y, rgb=None, empty=True))
            matrix.append(row)

        return matrix
