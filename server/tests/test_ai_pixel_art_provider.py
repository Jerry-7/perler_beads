from io import BytesIO
import logging

import httpx
import pytest
from PIL import Image

from app.providers.ai_pixel_art import AiPixelArtProvider, AiPixelArtProviderConfig
from app.providers.mock_pixel_art import PixelArtProviderError


def make_image_bytes(color: tuple[int, int, int] = (255, 0, 0)) -> bytes:
    image = Image.new("RGB", (4, 4), color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_transport(handler):
    return httpx.MockTransport(handler)


def make_provider(handler) -> AiPixelArtProvider:
    return AiPixelArtProvider(
        config=AiPixelArtProviderConfig(
            api_url="https://example.test",
            api_key="test-key",
            model="pixel-model",
            prompt="Make this image pixel art at {size} with {ai_detail} detail.",
            timeout_seconds=5,
        ),
        transport=make_transport(handler),
    )


def test_ai_provider_sends_multipart_image_edit_request() -> None:
    image_response = make_image_bytes((0, 255, 0))
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=image_response)
        return httpx.Response(
            200,
            json={"data": [{"url": "https://example.test/generated.png"}]},
        )

    provider = make_provider(handler)
    cells = provider.convert(
        make_image_bytes(),
        width_cells=32,
        height_cells=24,
        source_mode="resample",
        ai_detail="detailed",
    )

    edit_request = requests[0]
    body_bytes = edit_request.read()
    body = body_bytes.decode("utf-8", errors="ignore")

    assert str(edit_request.url) == "https://example.test/v1/images/edits"
    assert edit_request.headers["authorization"] == "Bearer test-key"
    assert edit_request.headers["accept"] == "application/json"
    assert edit_request.headers["content-type"].startswith("multipart/form-data; boundary=")
    assert 'name="model"' in body
    assert "pixel-model" in body
    assert 'name="prompt"' in body
    assert "Make this image pixel art" in body
    assert "32 x 24" in body
    assert "detailed" in body
    assert 'name="size"' in body
    assert "1024x1024" in body
    assert 'name="response_format"' in body
    assert "url" in body
    assert 'name="n"' not in body
    assert 'name="quality"' not in body
    assert 'name="background"' not in body
    assert 'name="output_format"' not in body
    assert 'name="output_compression"' not in body
    assert 'name="moderation"' not in body
    assert 'name="image"; filename="source.png"' in body
    assert "Content-Type: image/png" in body
    assert b"\x89PNG\r\n\x1a\n" in body_bytes
    assert len(cells) == 24
    assert len(cells[0]) == 32


def test_ai_provider_sends_only_configured_optional_image_edit_fields() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=make_image_bytes((0, 255, 0)))
        return httpx.Response(200, json={"data": [{"url": "https://example.test/generated.png"}]})

    provider = AiPixelArtProvider(
        config=AiPixelArtProviderConfig(
            api_url="https://example.test",
            api_key="test-key",
            model="pixel-model",
            prompt="Make pixel art.",
            timeout_seconds=5,
            quality="high",
            background="transparent",
            output_format="webp",
            output_compression=80,
            moderation="low",
        ),
        transport=make_transport(handler),
    )

    provider.convert(make_image_bytes(), width_cells=1, height_cells=1, source_mode="resample")

    body = requests[0].read().decode("utf-8", errors="ignore")

    assert 'name="quality"' in body
    assert "high" in body
    assert 'name="background"' in body
    assert "transparent" in body
    assert 'name="output_format"' in body
    assert "webp" in body
    assert 'name="output_compression"' in body
    assert "80" in body
    assert 'name="moderation"' in body
    assert "low" in body


def test_ai_provider_renders_prompt_controls() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=make_image_bytes((0, 255, 0)))
        return httpx.Response(200, json={"data": [{"url": "https://example.test/generated.png"}]})

    provider = AiPixelArtProvider(
        config=AiPixelArtProviderConfig(
            api_url="https://example.test",
            api_key="test-key",
            model="pixel-model",
            prompt=(
                "{resolution} {size} {width_cells} {height_cells} {max_colors} "
                "{ai_detail} {ai_style} {style_prompt} {effect_3d} {shading} {negative_prompt}"
            ),
            timeout_seconds=5,
        ),
        transport=make_transport(handler),
    )

    provider.convert(
        make_image_bytes(),
        width_cells=52,
        height_cells=78,
        source_mode="resample",
        ai_detail="detailed",
        ai_style="crafted",
        ai_effect_3d="strong",
        ai_shading="dithered",
        ai_max_colors=32,
    )

    body = requests[0].read().decode("utf-8", errors="ignore")

    assert "78" in body
    assert "52 x 78" in body
    assert "52" in body
    assert "32" in body
    assert "detailed" in body
    assert "crafted" in body
    assert "Perler bead friendly" in body
    assert "strong volumetric 3D" in body
    assert "dithered shadow" in body
    assert "photorealistic" in body


def test_ai_provider_extracts_plain_image_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=make_image_bytes((0, 255, 0)))
        return httpx.Response(200, json={"choices": [{"message": {"content": "https://example.test/generated.png"}}]})

    provider = make_provider(handler)
    cells = provider.convert(make_image_bytes(), width_cells=1, height_cells=1, source_mode="resample")

    assert cells[0][0].rgb == (0, 255, 0)


def test_ai_provider_extracts_openai_images_data_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=make_image_bytes((0, 255, 0)))
        return httpx.Response(200, json={"data": [{"url": "https://example.test/generated.png"}]})

    provider = make_provider(handler)
    cells = provider.convert(make_image_bytes(), width_cells=1, height_cells=1, source_mode="resample")

    assert cells[0][0].rgb == (0, 255, 0)


def test_ai_provider_rejects_response_without_image_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "no image here"}}]})

    provider = make_provider(handler)

    with pytest.raises(PixelArtProviderError, match="AI response did not include an image URL"):
        provider.convert(make_image_bytes(), width_cells=1, height_cells=1)


def test_ai_provider_rejects_failed_ai_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "upstream failed"})

    provider = make_provider(handler)

    with pytest.raises(PixelArtProviderError, match="AI image request failed"):
        provider.convert(make_image_bytes(), width_cells=1, height_cells=1)


def test_ai_provider_logs_failed_ai_response(caplog: pytest.LogCaptureFixture) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "upstream failed"})

    provider = make_provider(handler)

    with caplog.at_level(logging.INFO, logger="app.providers.ai_pixel_art"):
        with pytest.raises(PixelArtProviderError):
            provider.convert(make_image_bytes(), width_cells=52, height_cells=52, ai_detail="detailed")

    messages = "\n".join(record.getMessage() for record in caplog.records)

    assert "request_start" in messages
    assert "request_failed_status" in messages
    assert "status_code=500" in messages
    assert "test-key" not in messages


def test_ai_provider_rejects_failed_image_download() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(404)
        return httpx.Response(200, json={"choices": [{"message": {"content": "https://example.test/generated.png"}}]})

    provider = make_provider(handler)

    with pytest.raises(PixelArtProviderError, match="AI image download failed"):
        provider.convert(make_image_bytes(), width_cells=1, height_cells=1)


def test_ai_provider_rejects_non_image_download() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=b"not an image")
        return httpx.Response(200, json={"choices": [{"message": {"content": "https://example.test/generated.png"}}]})

    provider = make_provider(handler)

    with pytest.raises(PixelArtProviderError, match="AI image URL did not return a supported image"):
        provider.convert(make_image_bytes(), width_cells=1, height_cells=1)
