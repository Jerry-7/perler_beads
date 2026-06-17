from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.main as main_module
from app.main import app
from app.providers.ai_pixel_art import AiPixelArtProvider, AiPixelArtProviderConfig
from app.providers.base import PixelArtCell
from app.services.generation import GenerationError
from app.services.generation import GenerationStore


client = TestClient(app)


def make_image() -> bytes:
    image = Image.new("RGB", (4, 4), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_sized_image(width: int, height: int) -> bytes:
    image = Image.new("RGB", (width, height), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class FakeAiImageStore:
    created: dict[str, object] | None = None
    image_bytes = make_sized_image(4, 4)

    def create(self, **kwargs):
        self.created = kwargs
        return type(
            "AiImage",
            (),
            {
                "id": "ai-1",
                "status": "completed",
                "image_bytes": self.image_bytes,
                "content_type": "image/png",
                "error": None,
            },
        )()

    def get(self, ai_image_id: str):
        if ai_image_id != "ai-1":
            return None
        return type(
            "AiImage",
            (),
            {
                "id": "ai-1",
                "status": "completed",
                "image_bytes": self.image_bytes,
                "content_type": "image/png",
                "error": None,
            },
        )()


def test_create_and_get_generation() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "8", "heightCells": "8"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]

    result_response = client.get(f"/api/generations/{generation_id}")

    assert result_response.status_code == 200
    body = result_response.json()
    assert body["status"] == "completed"
    assert body["result"]["widthCells"] == 8
    assert body["result"]["heightCells"] == 8


def test_create_ai_image_and_fetch_generated_image(monkeypatch: pytest.MonkeyPatch) -> None:
    store = FakeAiImageStore()
    monkeypatch.setattr(main_module, "ai_image_store", store)

    response = client.post(
        "/api/ai-images",
        data={
            "widthCells": "8",
            "heightCells": "10",
            "aiStyle": "crafted",
            "aiEffect3d": "strong",
            "aiShading": "dithered",
            "aiMaxColors": "32",
        },
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "aiImageId": "ai-1",
        "status": "completed",
        "imageUrl": "/api/ai-images/ai-1/image",
    }
    assert store.created is not None
    assert store.created["width_cells"] == 8
    assert store.created["height_cells"] == 10
    assert store.created["ai_style"] == "crafted"
    assert store.created["ai_effect_3d"] == "strong"
    assert store.created["ai_shading"] == "dithered"
    assert store.created["ai_max_colors"] == 32

    status_response = client.get("/api/ai-images/ai-1")
    assert status_response.status_code == 200
    assert status_response.json()["imageUrl"] == "/api/ai-images/ai-1/image"

    image_response = client.get("/api/ai-images/ai-1/image")
    assert image_response.status_code == 200
    assert image_response.headers["content-type"] == "image/png"
    assert image_response.content == store.image_bytes


def test_create_generation_can_use_existing_ai_image(monkeypatch: pytest.MonkeyPatch) -> None:
    store = FakeAiImageStore()
    monkeypatch.setattr(main_module, "ai_image_store", store)

    response = client.post(
        "/api/generations",
        data={"aiImageId": "ai-1", "widthCells": "4", "heightCells": "4", "sourceMode": "resample"},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")

    assert result_response.status_code == 200
    body = result_response.json()
    assert body["status"] == "completed"
    assert body["result"]["widthCells"] == 4
    assert body["result"]["heightCells"] == 4


def test_create_generation_accepts_sampling_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    class RecordingStore:
        sampling_mode: str | None = None

        def create(self, **kwargs):
            self.sampling_mode = kwargs["sampling_mode"]
            return type("Generation", (), {"id": "gen-1", "status": "completed"})()

    store = RecordingStore()
    monkeypatch.setattr(main_module, "generation_store", store)

    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "samplingMode": "detail"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    assert store.sampling_mode == "detail"


def test_create_generation_accepts_ai_max_colors(monkeypatch: pytest.MonkeyPatch) -> None:
    class RecordingStore:
        max_colors: int | None = None

        def create(self, **kwargs):
            self.max_colors = kwargs["max_colors"]
            return type("Generation", (), {"id": "gen-1", "status": "completed"})()

    store = RecordingStore()
    monkeypatch.setattr(main_module, "generation_store", store)

    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "aiMaxColors": "12"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    assert store.max_colors == 12


def test_rejects_invalid_generation_ai_max_colors() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "aiMaxColors": "65"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_rejects_invalid_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "samplingMode": "muddy"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_rejects_generation_without_image_or_ai_image_id() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample"},
    )

    assert response.status_code == 400


def test_rejects_invalid_grid_size() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "0", "heightCells": "8"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_create_generation_resample_mode_fills_requested_dimensions() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "10", "heightCells": "10", "sourceMode": "resample"},
        files={"image": ("wide.png", make_sized_image(10, 5), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]

    result_response = client.get(f"/api/generations/{generation_id}")
    body = result_response.json()
    empty_count = sum(1 for row in body["result"]["cells"] for cell in row if cell.get("empty"))
    usage_count = sum(item["count"] for item in body["result"]["usage"])

    assert empty_count == 0
    assert usage_count == 100


def test_create_generation_accepts_color_complexity() -> None:
    for complexity in ["minimal", "simple", "balanced", "detailed", "original"]:
        response = client.post(
            "/api/generations",
            data={"widthCells": "8", "heightCells": "8", "colorComplexity": complexity},
            files={"image": ("test.png", make_image(), "image/png")},
        )

        assert response.status_code == 200


def test_rejects_invalid_color_complexity() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "8", "heightCells": "8", "colorComplexity": "wild"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_create_generation_returns_400_when_provider_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    class FailingStore:
        def create(self, **kwargs):
            raise GenerationError("AI image request failed with status 500")

    monkeypatch.setattr(main_module, "generation_store", FailingStore())

    response = client.post(
        "/api/generations",
        data={"widthCells": "8", "heightCells": "8"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "AI image request failed with status 500"


def test_create_generation_can_use_ai_provider_with_image_url_response(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == "https://example.test/generated.png":
            return httpx.Response(200, content=make_sized_image(4, 4))
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "https://example.test/generated.png"}}]},
        )

    provider = AiPixelArtProvider(
        AiPixelArtProviderConfig(
            api_url="https://example.test/v1/chat/completions",
            api_key="test-key",
            model="pixel-model",
            prompt="Make pixel art.",
            timeout_seconds=5,
        ),
        transport=httpx.MockTransport(handler),
    )
    monkeypatch.setattr(main_module, "generation_store", GenerationStore(provider=provider))

    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")

    assert result_response.status_code == 200
    body = result_response.json()
    assert body["status"] == "completed"
    assert body["result"]["widthCells"] == 4
    assert body["result"]["heightCells"] == 4


def test_rejects_invalid_ai_detail_for_ai_image_generation() -> None:
    response = client.post(
        "/api/ai-images",
        data={"widthCells": "8", "heightCells": "8", "aiDetail": "too-much"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_rejects_invalid_ai_prompt_controls_for_ai_image_generation() -> None:
    invalid_cases = [
        {"aiStyle": "portrait"},
        {"aiEffect3d": "extreme"},
        {"aiShading": "gradient"},
        {"aiMaxColors": "3"},
        {"aiMaxColors": "65"},
    ]

    for data in invalid_cases:
        response = client.post(
            "/api/ai-images",
            data={"widthCells": "8", "heightCells": "8", **data},
            files={"image": ("test.png", make_image(), "image/png")},
        )

        assert response.status_code == 400
