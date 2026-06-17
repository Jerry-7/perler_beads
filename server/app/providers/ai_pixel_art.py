import logging
import re
from dataclasses import dataclass
from io import BytesIO
from time import perf_counter
from typing import Any

import httpx
from PIL import Image, UnidentifiedImageError

from app.providers.base import PixelArtCell
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError


IMAGE_URL_PATTERN = re.compile(r"https?://[^\s\])\"']+", re.IGNORECASE)
LOGGER = logging.getLogger(__name__)
MAX_LOG_RESPONSE_CHARS = 800
IMAGE_EDIT_REQUEST_ATTEMPTS = 3
NEGATIVE_PROMPT = (
    "photorealistic, smooth gradients, anti-aliasing, blurry edges, floating pixels, isolated pixels, "
    "stiff, dull expression, generic subject, extra details, noise, flat"
)
STYLE_PROMPTS = {
    "faithful": "faithful to the source photo, prioritizing subject likeness, proportions, silhouette, and key colors",
    "iconic": "iconic and readable, emphasizing bold silhouette, simplified shapes, and instantly recognizable features",
    "crafted": "Perler bead friendly, reducing stray pixels and favoring connected clusters, clean outlines, and buildable shapes",
    "dramatic": "dramatic and expressive, strengthening contrast, lighting, depth, and visual impact while keeping the subject recognizable",
}
EFFECT_3D_PROMPTS = {
    "none": "flat pixel art with minimal volumetric illusion",
    "subtle": "subtle volumetric 3D depth with restrained highlights and shadows",
    "balanced": "balanced volumetric 3D depth with clear light and shadow separation",
    "strong": "strong volumetric 3D depth with bold highlights, shadows, and pop-out form",
}
SHADING_PROMPTS = {
    "flat": "flat color blocking with very limited shadow steps",
    "step": "distinct step-shading for clean light, midtone, and shadow regions",
    "dithered": "dithered shadow texture using bead-friendly checker and cluster patterns",
}


@dataclass(frozen=True)
class AiPixelArtProviderConfig:
    api_url: str
    api_key: str
    model: str
    prompt: str
    timeout_seconds: float = 600
    size: str = "1024x1024"
    response_format: str = "url"
    quality: str | None = None
    background: str | None = None
    output_format: str | None = None
    output_compression: int | None = None
    moderation: str | None = None
    trust_env: bool = False


class AiPixelArtProvider:
    def __init__(
        self,
        config: AiPixelArtProviderConfig,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._config = config
        self._transport = transport
        self._local_provider = MockPixelArtProvider()

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
        ai_image_bytes = self.generate_image(
            image_bytes,
            width_cells,
            height_cells,
            ai_detail,
            ai_style,
            ai_effect_3d,
            ai_shading,
            ai_max_colors,
        )
        return self._local_provider.convert(
            ai_image_bytes,
            width_cells,
            height_cells,
            source_mode,
            sampling_mode=sampling_mode,
        )

    def generate_image(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        ai_detail: str,
        ai_style: str,
        ai_effect_3d: str,
        ai_shading: str,
        ai_max_colors: int,
    ) -> bytes:
        response = self._request_image_edit(
            image_bytes,
            width_cells,
            height_cells,
            ai_detail,
            ai_style,
            ai_effect_3d,
            ai_shading,
            ai_max_colors,
        )
        image_url = extract_image_url(response)
        if not image_url:
            raise PixelArtProviderError("AI response did not include an image URL")
        return self._download_image(image_url)

    def _request_image_edit(
        self,
        image_bytes: bytes,
        width_cells: int,
        height_cells: int,
        ai_detail: str,
        ai_style: str,
        ai_effect_3d: str,
        ai_shading: str,
        ai_max_colors: int,
    ) -> dict[str, Any]:
        prompt = render_prompt(
            self._config.prompt,
            width_cells,
            height_cells,
            ai_detail,
            ai_style,
            ai_effect_3d,
            ai_shading,
            ai_max_colors,
        )
        LOGGER.info(
            "ai_image request_start url=%s model=%s size=%s response_format=%s width_cells=%s height_cells=%s ai_detail=%s ai_style=%s ai_effect_3d=%s ai_shading=%s ai_max_colors=%s prompt_chars=%s image_bytes=%s",
            image_edits_url(self._config.api_url),
            self._config.model,
            self._config.size,
            self._config.response_format,
            width_cells,
            height_cells,
            ai_detail,
            ai_style,
            ai_effect_3d,
            ai_shading,
            ai_max_colors,
            len(prompt),
            len(image_bytes),
        )
        data = image_edit_form_data(self._config, prompt)
        image_png = encode_png(image_bytes)
        with httpx.Client(timeout=self._config.timeout_seconds, transport=self._transport, trust_env=self._config.trust_env) as client:
            response: httpx.Response | None = None
            try:
                for attempt in range(1, IMAGE_EDIT_REQUEST_ATTEMPTS + 1):
                    started_at = perf_counter()
                    try:
                        response = client.post(
                            image_edits_url(self._config.api_url),
                            headers={"Authorization": f"Bearer {self._config.api_key}", "Accept": "application/json"},
                            data=data,
                            files={"image": ("source.png", image_png, "image/png")},
                        )
                        LOGGER.info(
                            "ai_image request_finished attempt=%s status_code=%s elapsed_ms=%s",
                            attempt,
                            response.status_code,
                            round((perf_counter() - started_at) * 1000),
                        )
                        break
                    except httpx.HTTPError as exc:
                        LOGGER.warning(
                            "ai_image request_attempt_failed attempt=%s max_attempts=%s elapsed_ms=%s error=%s",
                            attempt,
                            IMAGE_EDIT_REQUEST_ATTEMPTS,
                            round((perf_counter() - started_at) * 1000),
                            exc,
                        )
                        if attempt == IMAGE_EDIT_REQUEST_ATTEMPTS:
                            raise
            except httpx.HTTPError as exc:
                LOGGER.exception("ai_image request_error error=%s", exc)
                raise PixelArtProviderError(f"AI image request failed: {exc}") from exc

        assert response is not None
        if response.status_code >= 400:
            LOGGER.warning(
                "ai_image request_failed_status status_code=%s response=%s",
                response.status_code,
                trim_for_log(response.text),
            )
            raise PixelArtProviderError(f"AI image request failed with status {response.status_code}")

        try:
            payload = response.json()
        except ValueError as exc:
            LOGGER.warning("ai_image invalid_json status_code=%s response=%s", response.status_code, trim_for_log(response.text))
            raise PixelArtProviderError("AI image request returned invalid JSON") from exc
        LOGGER.info("ai_image response_json_parsed keys=%s", sorted(payload.keys()))
        return payload

    def _download_image(self, image_url: str) -> bytes:
        LOGGER.info("ai_image download_start url=%s", image_url)
        started_at = perf_counter()
        with httpx.Client(timeout=self._config.timeout_seconds, transport=self._transport, trust_env=self._config.trust_env) as client:
            try:
                response = client.get(image_url)
            except httpx.HTTPError as exc:
                LOGGER.exception("ai_image download_error error=%s", exc)
                raise PixelArtProviderError(f"AI image download failed: {exc}") from exc

        LOGGER.info(
            "ai_image download_finished status_code=%s bytes=%s elapsed_ms=%s",
            response.status_code,
            len(response.content),
            round((perf_counter() - started_at) * 1000),
        )
        if response.status_code >= 400:
            LOGGER.warning("ai_image download_failed_status status_code=%s", response.status_code)
            raise PixelArtProviderError(f"AI image download failed with status {response.status_code}")

        try:
            with Image.open(BytesIO(response.content)) as image:
                image.verify()
        except (UnidentifiedImageError, OSError) as exc:
            LOGGER.warning("ai_image unsupported_downloaded_image bytes=%s", len(response.content))
            raise PixelArtProviderError("AI image URL did not return a supported image") from exc

        return response.content


def extract_image_url(response: dict[str, Any]) -> str | None:
    for item in response.get("data", []):
        if isinstance(item, dict):
            url = item.get("url")
            if isinstance(url, str) and url.startswith(("http://", "https://")):
                LOGGER.info("ai_image image_url_extracted source=data")
                return url

    for choice in response.get("choices", []):
        message = choice.get("message", {})
        content = message.get("content")
        image_url = extract_image_url_from_content(content)
        if image_url:
            LOGGER.info("ai_image image_url_extracted source=choices")
            return image_url
    LOGGER.warning("ai_image image_url_missing keys=%s", sorted(response.keys()))
    return None


def extract_image_url_from_content(content: Any) -> str | None:
    if isinstance(content, str):
        return first_image_url(content)
    if isinstance(content, list):
        for item in content:
            if isinstance(item, str):
                url = first_image_url(item)
                if url:
                    return url
            if not isinstance(item, dict):
                continue
            image_url = item.get("image_url")
            if isinstance(image_url, str) and image_url.startswith(("http://", "https://")):
                return image_url
            if isinstance(image_url, dict):
                url = image_url.get("url")
                if isinstance(url, str) and url.startswith(("http://", "https://")):
                    return url
            text = item.get("text")
            if isinstance(text, str):
                url = first_image_url(text)
                if url:
                    return url
    return None


def first_image_url(text: str) -> str | None:
    match = IMAGE_URL_PATTERN.search(text)
    return match.group(0) if match else None


def render_prompt(
    prompt_template: str,
    width_cells: int,
    height_cells: int,
    ai_detail: str,
    ai_style: str = "faithful",
    ai_effect_3d: str = "balanced",
    ai_shading: str = "step",
    ai_max_colors: int = 16,
) -> str:
    resolution = max(width_cells, height_cells)
    return prompt_template.format(
        resolution=resolution,
        width_cells=width_cells,
        height_cells=height_cells,
        size=f"{width_cells} x {height_cells}",
        max_colors=ai_max_colors,
        ai_detail=ai_detail,
        ai_style=ai_style,
        style_prompt=STYLE_PROMPTS.get(ai_style, STYLE_PROMPTS["faithful"]),
        effect_3d=EFFECT_3D_PROMPTS.get(ai_effect_3d, EFFECT_3D_PROMPTS["balanced"]),
        shading=SHADING_PROMPTS.get(ai_shading, SHADING_PROMPTS["step"]),
        negative_prompt=NEGATIVE_PROMPT,
    )


def image_edits_url(base_url: str) -> str:
    trimmed = base_url.rstrip("/")
    if trimmed.endswith("/v1/images/edits"):
        return trimmed
    return f"{trimmed}/v1/images/edits"


def image_edit_form_data(config: AiPixelArtProviderConfig, prompt: str) -> dict[str, str]:
    data = {
        "model": config.model,
        "prompt": prompt,
        "size": config.size,
        "response_format": config.response_format,
    }
    optional_fields: list[tuple[str, object | None]] = [
        ("quality", config.quality),
        ("background", config.background),
        ("output_format", config.output_format),
        ("output_compression", config.output_compression),
        ("moderation", config.moderation),
    ]
    for name, value in optional_fields:
        if value is not None and value != "":
            data[name] = str(value)
    return data


def encode_png(image_bytes: bytes) -> BytesIO:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            if image.mode in {"RGBA", "LA", "P"}:
                converted = image.convert("RGBA")
            else:
                converted = image.convert("RGB")
            buffer = BytesIO()
            converted.save(buffer, format="PNG")
            buffer.seek(0)
            return buffer
    except (UnidentifiedImageError, OSError) as exc:
        raise PixelArtProviderError("Unsupported image format") from exc


def trim_for_log(value: str) -> str:
    if len(value) <= MAX_LOG_RESPONSE_CHARS:
        return value
    return f"{value[:MAX_LOG_RESPONSE_CHARS]}...<truncated>"
