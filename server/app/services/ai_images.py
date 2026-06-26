import logging
from collections.abc import Callable
from dataclasses import dataclass
from threading import Thread
from uuid import uuid4

from app.providers.ai_pixel_art import AiPixelArtProvider
from app.services.ai_access import ai_access_service
from app.settings import create_ai_pixel_art_provider


LOGGER = logging.getLogger(__name__)
TaskRunner = Callable[[Callable[[], None]], None]


@dataclass
class AiImage:
    id: str
    status: str
    image_bytes: bytes | None = None
    content_type: str = "image/png"
    error: str | None = None


class AiImageStore:
    def __init__(self, provider: AiPixelArtProvider | None = None, task_runner: TaskRunner | None = None) -> None:
        self._items: dict[str, AiImage] = {}
        self._provider = provider
        self._task_runner = task_runner or run_in_thread

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
        user_id: int | None = None,
        used_free_access: bool = False,
    ) -> AiImage:
        item = AiImage(id=uuid4().hex, status="processing")
        self._items[item.id] = item
        LOGGER.info(
            "ai_image task_created id=%s width_cells=%s height_cells=%s ai_detail=%s ai_style=%s ai_effect_3d=%s ai_shading=%s ai_max_colors=%s image_bytes=%s user_id=%s used_free_access=%s",
            item.id,
            width_cells,
            height_cells,
            ai_detail,
            ai_style,
            ai_effect_3d,
            ai_shading,
            ai_max_colors,
            len(image_bytes),
            user_id,
            used_free_access,
        )
        if user_id is not None:
            ai_access_service.register_ai_image_job(item.id, user_id, used_free_access)
        self._task_runner(
            lambda: self._run_generation(
                item,
                image_bytes,
                width_cells,
                height_cells,
                ai_detail,
                ai_style,
                ai_effect_3d,
                ai_shading,
                ai_max_colors,
            )
        )
        return item

    def _run_generation(
        self,
        item: AiImage,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        ai_detail: str,
        ai_style: str,
        ai_effect_3d: str,
        ai_shading: str,
        ai_max_colors: int,
    ) -> None:
        LOGGER.info("ai_image task_started id=%s", item.id)
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
            ai_access_service.debit_quota_for_ai_image_if_needed(item.id, succeeded=True)
            LOGGER.info("ai_image task_completed id=%s image_bytes=%s", item.id, len(item.image_bytes))
        except Exception as exc:
            item.status = "failed"
            item.error = str(exc)
            ai_access_service.debit_quota_for_ai_image_if_needed(item.id, succeeded=False)
            LOGGER.exception("ai_image task_failed id=%s error=%s", item.id, exc)

    def get(self, ai_image_id: str) -> AiImage | None:
        return self._items.get(ai_image_id)

    def _get_provider(self) -> AiPixelArtProvider:
        if self._provider is None:
            self._provider = create_ai_pixel_art_provider()
        return self._provider


def run_in_thread(run: Callable[[], None]) -> None:
    Thread(target=run, daemon=True).start()


ai_image_store = AiImageStore()