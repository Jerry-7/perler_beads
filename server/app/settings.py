import os
from dataclasses import dataclass

from app.providers.ai_pixel_art import AiPixelArtProvider, AiPixelArtProviderConfig
from app.providers.base import PixelArtProvider
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError


DEFAULT_AI_IMAGE_API_URL = "https://www.packyapi.com/v1/images/edits"
DEFAULT_AI_IMAGE_MODEL = "gpt-image-2"
DEFAULT_AI_IMAGE_PROMPT = (
    '''
On a {resolution}×{resolution} square canvas, create a pixel‑art sprite/pattern strictly derived from the provided photo.

【MODIFIED】Canvas & Aspect‑Ratio Core Rules (Most Important):

Absolutely forbid stretching, squashing, or distorting the original photo to fit the {resolution}×{resolution} square canvas.

Strictly preserve the original photo’s aspect ratio (do not crop the subject unless the edges contain completely irrelevant clutter).

Use a letterbox / pillarbox approach: place the subject at the center of the canvas in its original proportion, and fill all remaining empty areas uniformly with the solid background colour (light grey #E0E0E0).

Ensure that, while keeping the original ratio, the subject fits completely and comfortably inside the canvas with adequate margins on all sides.

Critical Execution Logic (Pixel‑Level):

Use nearest‑neighbour scaling logic. Every pixel must be a solid, flat colour.

NO anti‑aliasing, NO colour mixing at edges, NO alpha transparency.

Draw clear grid lines on the image (each pixel cell corresponds to one bead).

Basic Rules:

Output must be a grid‑based pixel art design.

Each pixel cell represents exactly one bead and must be a single flat solid colour only.

Strong edge clarity and blocky structure are required.

Primary Goals:

Preserve the subject's likeness, silhouette, key colours, iconic features, and mood.

For people/animals: extract expressive facial/body cues. For objects: retain distinct shape, material hints, and recognisable details.

Crafting Constraints (Perler Bead / Fuse Bead Pattern):

The output MUST be a clear, gridded diagram where each cell is exactly 1 pixel.

Every grid cell contains ONE solid, flat colour.

Grid lines must be visible and clear to separate each bead position.

Maximum number of unique colours: {max_colors}.

Use bold 1‑pixel dark outlines around major shapes.

All coloured pixels must form connected clusters (no isolated single pixels floating alone).

Background: solid light grey (#E0E0E0 or similar) – clearly different from the subject.

Style & Detail:

Generation style: {style_prompt}.

Detail level: {ai_detail}.

3D effect: {effect_3d} (if applicable, only via blocky shading).

Shading: {shading} (must be blocky, using distinct colour steps, not smooth).

Additional Instructions:

The image must look like a ready‑to‑use bead placement chart – each pixel corresponds to one bead position.

Ensure the whole subject fits comfortably within the {resolution}×{resolution} grid with adequate margins, while strictly maintaining the original aspect ratio.

Expression: dynamic and expressive within the pixel limitation.

Negative Prompt:
{negative_prompt} (explicitly forbid: anti‑aliasing, gradients, dithering, semi‑transparent pixels, floating orphan pixels, blur, smooth shading, non‑grid layouts, and any form of image stretching or warping).
    '''
    # '''
    #
    # Create a {resolution}x{resolution} pixel art sprite/pattern, strictly derived from the provided photo.
    #
    # CRITICAL:
    # - Use nearest-neighbor scaling logic. Every pixel must be a SOLID, FLAT color.
    # - NO anti-aliasing, NO color mixing at edges, NO alpha transparency.
    # - Draw grid lines on the image.
    #
    # Rules:
    # - Output must be a grid pixel art design.
    # - Each pixel cell represents exactly one bead.
    # - Each cell must be a single flat solid color only.
    # - Strong edge clarity and blocky structure.
    # - Keep the original image ratio
    #
    # PRIMARY GOALS:
    # - Preserve the subject's likeness, silhouette, key colors, iconic features, and mood.
    # - For people/animals: extract expressive facial/body cues. For objects: retain distinct shape, material hints, and recognizable details.
    #
    # CRAFTING CONSTRAINTS (Perler bead / fuse bead pattern):
    # - The output MUST be a clear, gridded diagram where each cell is exactly 1 pixel.
    # - Every grid cell contains ONE solid, flat color.
    # - Grid lines are visible and clear to separate each bead position.
    # - Maximum number of unique colors: {max_colors}.
    # - Use bold 1‑pixel dark outlines around major shapes.
    # - All colored pixels must form connected clusters (no isolated single pixels floating alone).
    # - Background: solid light gray (#E0E0E0 or similar) – clearly different from the subject.
    #
    # STYLE & DETAIL:
    # - Generation style: {style_prompt}.
    # - Detail level: {ai_detail}.
    # - 3D effect: {effect_3d} (if applicable, only via shading).
    # - Shading: {shading} (must be blocky, using distinct color steps, not smooth).
    #
    # ADDITIONAL INSTRUCTIONS:
    # - The image must look like a ready‑to‑use bead placement chart – each pixel corresponds to one bead position.
    # - Ensure the whole subject fits comfortably within the {resolution}x{resolution} grid with adequate margins.
    # - Expression: dynamic and expressive within the pixel limitation.
    #
    # NEGATIVE PROMPT:
    # {negative_prompt} (explicitly forbid: anti‑aliasing, gradients, dithering, semi‑transparent pixels, floating orphan pixels, blur, smooth shading, and non‑grid layouts).
    # '''
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
    ai_image_trust_env: bool = False
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    wechat_pay_mch_id: str = ""
    wechat_pay_v3_key: str = ""
    wechat_pay_cert_serial_no: str = ""
    wechat_pay_private_key_path: str = ""
    wechat_pay_platform_cert_path: str = ""
    wechat_pay_notify_url: str = ""
    ai_admin_api_key: str = ""
    ai_admin_username: str = "admin"
    ai_admin_password: str = ""
    ai_admin_token_secret: str = "change-me-admin"
    ai_admin_token_ttl_hours: int = 8
    session_token_secret: str = "change-me"
    session_token_ttl_days: int = 7
    sqlite_db_path: str = "./data/perler_beads.sqlite3"


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
        ai_image_trust_env=bool_env("AI_IMAGE_TRUST_ENV", False),
        wechat_app_id=os.getenv("WECHAT_APP_ID", "").strip(),
        wechat_app_secret=os.getenv("WECHAT_APP_SECRET", "").strip(),
        wechat_pay_mch_id=os.getenv("WECHAT_PAY_MCH_ID", "").strip(),
        wechat_pay_v3_key=os.getenv("WECHAT_PAY_V3_KEY", "").strip(),
        wechat_pay_cert_serial_no=os.getenv("WECHAT_PAY_CERT_SERIAL_NO", "").strip(),
        wechat_pay_private_key_path=os.getenv("WECHAT_PAY_PRIVATE_KEY_PATH", "").strip(),
        wechat_pay_platform_cert_path=os.getenv("WECHAT_PAY_PLATFORM_CERT_PATH", "").strip(),
        wechat_pay_notify_url=os.getenv("WECHAT_PAY_NOTIFY_URL", "").strip(),
        ai_admin_api_key=os.getenv("AI_ADMIN_API_KEY", "").strip(),
        ai_admin_username=os.getenv("AI_ADMIN_USERNAME", "admin").strip() or "admin",
        ai_admin_password=os.getenv("AI_ADMIN_PASSWORD", "").strip(),
        ai_admin_token_secret=os.getenv("AI_ADMIN_TOKEN_SECRET", "change-me-admin").strip() or "change-me-admin",
        ai_admin_token_ttl_hours=int(os.getenv("AI_ADMIN_TOKEN_TTL_HOURS", "8")),
        session_token_secret=os.getenv("SESSION_TOKEN_SECRET", "change-me").strip() or "change-me",
        session_token_ttl_days=int(os.getenv("SESSION_TOKEN_TTL_DAYS", "7")),
        sqlite_db_path=os.getenv("SQLITE_DB_PATH", "./data/perler_beads.sqlite3").strip() or "./data/perler_beads.sqlite3",
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
            trust_env=settings.ai_image_trust_env,
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


def bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

