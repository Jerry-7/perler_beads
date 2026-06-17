from dataclasses import dataclass
from uuid import uuid4

from app.providers.ai_pixel_art import AiPixelArtProvider
from app.providers.mock_pixel_art import PixelArtProviderError
from app.settings import create_ai_pixel_art_provider


class AiImageError(ValueError):
    pass


@dataclass
class AiImage:
    id: str
    status: str
    image_bytes: bytes | None = None
    content_type: str = "image/png"
    error: str | None = None


class AiImageStore:
    def __init__(self, provider: AiPixelArtProvider | None = None) -> None:
        self._items: dict[str, AiImage] = {}
        self._provider = provider

    def create(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        ai_detail: str = "balanced",
        ai_style: str = "faithful",
        ai_effect_3d: str = "balanced",
        ai_shading: str = "step",
        ai_max_colors: int = 16,
    ) -> AiImage:
        item = AiImage(id=uuid4().hex, status="processing")
        self._items[item.id] = item
        try:
            item.image_bytes = self._get_provider().generate_image(
                image_bytes=image_bytes,
                width_cells=width_cells,
                height_cells=height_cells,
                ai_detail=ai_detail,
                ai_style=ai_style,
                ai_effect_3d=ai_effect_3d,
                ai_shading=ai_shading,
                ai_max_colors=ai_max_colors,
            )
            item.status = "completed"
        except PixelArtProviderError as exc:
            item.status = "failed"
            item.error = str(exc)
            raise AiImageError(str(exc)) from exc
        return item

    def get(self, ai_image_id: str) -> AiImage | None:
        return self._items.get(ai_image_id)

    def _get_provider(self) -> AiPixelArtProvider:
        if self._provider is None:
            self._provider = create_ai_pixel_art_provider()
        return self._provider


ai_image_store = AiImageStore()
