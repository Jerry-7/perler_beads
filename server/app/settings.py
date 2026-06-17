import os
from dataclasses import dataclass

from app.providers.ai_pixel_art import AiPixelArtProvider, AiPixelArtProviderConfig
from app.providers.base import PixelArtProvider
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError


DEFAULT_AI_IMAGE_API_URL = "https://www.packyapi.com/v1/images/edits"
DEFAULT_AI_IMAGE_MODEL = "gpt-image-2"
DEFAULT_AI_IMAGE_PROMPT = (
    "A {resolution}x{resolution} pixel art sprite/pattern, strictly based on the provided photo. "
    "Primary goal: preserve the subject likeness, silhouette, key colors, iconic features, and mood. "
    "If the subject is a person or animal, extract expressive facial/body cues; otherwise preserve the object's "
    "distinct shape, material cues, and recognizable details. Generation style: {style_prompt}. "
    "Detail level: {ai_detail}. 3D effect: {effect_3d}. Shading: {shading}. "
    "Designed as a physical Perler bead pattern at {size} cells. Strict crafting constraints: max {max_colors} colors, "
    "bold 1-pixel dark outlines, no anti-aliasing, no smooth gradients, connected pixel clusters, "
    "zero isolated floating pixels, solid light-gray background. Dynamic and expressive. "
    "Negative prompt: {negative_prompt}."
)


@dataclass(frozen=True)
class AiImageSettings:
    pixel_art_provider: str = "local"
    ai_image_api_url: str = DEFAULT_AI_IMAGE_API_URL
    ai_image_api_key: str = ""
    ai_image_model: str = DEFAULT_AI_IMAGE_MODEL
    ai_image_prompt: str = DEFAULT_AI_IMAGE_PROMPT
    ai_image_timeout_seconds: float = 600
    ai_image_size: str = "1024x1024"
    ai_image_response_format: str = "url"
    ai_image_quality: str | None = None
    ai_image_background: str | None = None
    ai_image_output_format: str | None = None
    ai_image_output_compression: int | None = None
    ai_image_moderation: str | None = None


def load_settings() -> AiImageSettings:
    return AiImageSettings(
        pixel_art_provider=os.getenv("PIXEL_ART_PROVIDER", "local").strip().lower(),
        ai_image_api_url=os.getenv("AI_IMAGE_API_URL", DEFAULT_AI_IMAGE_API_URL).strip(),
        ai_image_api_key=os.getenv("AI_IMAGE_API_KEY", "").strip(),
        ai_image_model=os.getenv("AI_IMAGE_MODEL", DEFAULT_AI_IMAGE_MODEL).strip(),
        ai_image_prompt=os.getenv("AI_IMAGE_PROMPT", DEFAULT_AI_IMAGE_PROMPT).strip() or DEFAULT_AI_IMAGE_PROMPT,
        ai_image_timeout_seconds=float(os.getenv("AI_IMAGE_TIMEOUT_SECONDS", "600")),
        ai_image_size=os.getenv("AI_IMAGE_SIZE", "1024x1024").strip(),
        ai_image_response_format=os.getenv("AI_IMAGE_RESPONSE_FORMAT", "url").strip(),
        ai_image_quality=optional_env("AI_IMAGE_QUALITY"),
        ai_image_background=optional_env("AI_IMAGE_BACKGROUND"),
        ai_image_output_format=optional_env("AI_IMAGE_OUTPUT_FORMAT"),
        ai_image_output_compression=optional_int_env("AI_IMAGE_OUTPUT_COMPRESSION"),
        ai_image_moderation=optional_env("AI_IMAGE_MODERATION"),
    )


def create_pixel_art_provider(settings: AiImageSettings | None = None) -> PixelArtProvider:
    settings = settings or load_settings()
    if settings.pixel_art_provider in {"local", "mock"}:
        return MockPixelArtProvider()
    if settings.pixel_art_provider != "ai":
        raise PixelArtProviderError("PIXEL_ART_PROVIDER must be local or ai")
    return create_ai_pixel_art_provider(settings)


def create_ai_pixel_art_provider(settings: AiImageSettings | None = None) -> AiPixelArtProvider:
    settings = settings or load_settings()
    if not settings.ai_image_api_url or not settings.ai_image_api_key or not settings.ai_image_model:
        raise PixelArtProviderError("AI image provider requires AI_IMAGE_API_URL, AI_IMAGE_API_KEY, and AI_IMAGE_MODEL")

    return AiPixelArtProvider(
        AiPixelArtProviderConfig(
            api_url=settings.ai_image_api_url,
            api_key=settings.ai_image_api_key,
            model=settings.ai_image_model,
            prompt=settings.ai_image_prompt,
            timeout_seconds=settings.ai_image_timeout_seconds,
            size=settings.ai_image_size,
            response_format=settings.ai_image_response_format,
            quality=settings.ai_image_quality,
            background=settings.ai_image_background,
            output_format=settings.ai_image_output_format,
            output_compression=settings.ai_image_output_compression,
            moderation=settings.ai_image_moderation,
        )
    )


def optional_env(name: str) -> str | None:
    value = os.getenv(name, "").strip()
    return value or None


def optional_int_env(name: str) -> int | None:
    value = optional_env(name)
    if value is None:
        return None
    return int(value)
