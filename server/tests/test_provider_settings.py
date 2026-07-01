import pytest

from app.providers.ai_pixel_art import AiPixelArtProvider
from app.providers.mock_pixel_art import MockPixelArtProvider, PixelArtProviderError
from app.settings import AiImageSettings, DEFAULT_AI_IMAGE_API_URL, DEFAULT_AI_IMAGE_MODEL, create_pixel_art_provider, load_settings


def test_create_pixel_art_provider_defaults_to_local_provider() -> None:
    settings = AiImageSettings(pixel_art_provider="local")

    provider = create_pixel_art_provider(settings)

    assert isinstance(provider, MockPixelArtProvider)


def test_create_pixel_art_provider_uses_ai_provider_when_configured() -> None:
    settings = AiImageSettings(
        pixel_art_provider="ai",
        ai_image_api_url="https://example.test/v1/chat/completions",
        ai_image_api_key="test-key",
        ai_image_model="pixel-model",
    )

    provider = create_pixel_art_provider(settings)

    assert isinstance(provider, AiPixelArtProvider)


def test_create_pixel_art_provider_passes_proxy_trust_setting() -> None:
    settings = AiImageSettings(
        pixel_art_provider="ai",
        ai_image_api_url="https://example.test/v1/images/edits",
        ai_image_api_key="test-key",
        ai_image_model="pixel-model",
        ai_image_trust_env=True,
    )

    provider = create_pixel_art_provider(settings)

    assert isinstance(provider, AiPixelArtProvider)
    assert provider._config.trust_env is True


def test_create_pixel_art_provider_requires_ai_configuration() -> None:
    settings = AiImageSettings(pixel_art_provider="ai")

    with pytest.raises(PixelArtProviderError, match="AI image provider requires"):
        create_pixel_art_provider(settings)


def test_ai_settings_default_to_packyapi_image_edits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AI_IMAGE_API_URL", raising=False)
    monkeypatch.delenv("AI_IMAGE_MODEL", raising=False)
    monkeypatch.delenv("AI_IMAGE_SIZE", raising=False)
    monkeypatch.delenv("AI_IMAGE_QUALITY", raising=False)
    monkeypatch.delenv("AI_IMAGE_BACKGROUND", raising=False)
    monkeypatch.delenv("AI_IMAGE_OUTPUT_FORMAT", raising=False)
    monkeypatch.delenv("AI_IMAGE_OUTPUT_COMPRESSION", raising=False)
    monkeypatch.delenv("AI_IMAGE_MODERATION", raising=False)
    monkeypatch.delenv("AI_IMAGE_RESPONSE_FORMAT", raising=False)
    monkeypatch.delenv("AI_IMAGE_TRUST_ENV", raising=False)

    settings = load_settings()

    assert settings.ai_image_api_url == DEFAULT_AI_IMAGE_API_URL
    assert settings.ai_image_model == DEFAULT_AI_IMAGE_MODEL
    assert settings.ai_image_size == "1024x1024"
    assert settings.ai_image_response_format == "url"
    assert settings.ai_image_quality is None
    assert settings.ai_image_background is None
    assert settings.ai_image_output_format is None
    assert settings.ai_image_output_compression is None
    assert settings.ai_image_moderation is None
    assert settings.ai_image_trust_env is False


def test_ai_settings_can_enable_environment_proxy_trust(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_IMAGE_TRUST_ENV", "true")

    settings = load_settings()

    assert settings.ai_image_trust_env is True


def test_ai_settings_read_optional_image_edit_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_IMAGE_QUALITY", "high")
    monkeypatch.setenv("AI_IMAGE_BACKGROUND", "transparent")
    monkeypatch.setenv("AI_IMAGE_OUTPUT_FORMAT", "webp")
    monkeypatch.setenv("AI_IMAGE_OUTPUT_COMPRESSION", "80")
    monkeypatch.setenv("AI_IMAGE_MODERATION", "low")

    settings = load_settings()

    assert settings.ai_image_quality == "high"
    assert settings.ai_image_background == "transparent"
    assert settings.ai_image_output_format == "webp"
    assert settings.ai_image_output_compression == 80
    assert settings.ai_image_moderation == "low"


def test_settings_read_wechat_pay_platform_cert_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WECHAT_PAY_PLATFORM_CERT_PATH", "./certs/platform.pem")

    settings = load_settings()

    assert settings.wechat_pay_platform_cert_path == "./certs/platform.pem"
