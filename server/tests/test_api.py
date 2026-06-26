from io import BytesIO

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.main as main_module
import app.services.ai_images as ai_images_module
from app.main import app
from app.providers.ai_pixel_art import AiPixelArtProvider, AiPixelArtProviderConfig
from app.providers.base import PixelArtCell
from app.services.ai_access import AiAccessService
from app.services.ai_images import AiImageStore
from app.services.auth import SessionTokenService
from app.services.storage import Database
from app.services.generation import GenerationError
from app.services.generation import GenerationStore


client = TestClient(app)

def setup_authenticated_ai_access(monkeypatch: pytest.MonkeyPatch, tmp_path) -> dict[str, str]:
    db = Database(str(tmp_path / "test-api-access.sqlite3"))
    db.initialize()
    access_service = AiAccessService(db)
    token_service = SessionTokenService("test-api-secret", 7)
    user = access_service.ensure_user("openid-test-api")
    order_no, _ = access_service.create_order(user, "pkg_100_3")
    access_service.mark_order_paid(order_no, "txn-test-api")
    token, _ = token_service.issue(user.openid)
    monkeypatch.setattr(main_module, "ai_access_service", access_service)
    monkeypatch.setattr(main_module, "session_token_service", token_service)
    monkeypatch.setattr(ai_images_module, "ai_access_service", access_service)
    return {"Authorization": f"Bearer {token}"}


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


class ImmediateFakeAiImageStore(FakeAiImageStore):
    def create(self, **kwargs):
        self.created = kwargs
        return type(
            "AiImage",
            (),
            {
                "id": "ai-1",
                "status": "processing",
                "image_bytes": None,
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


def test_health_reports_supported_sampling_modes() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert "coverage" in response.json()["samplingModes"]
    assert "center-shrink" in response.json()["samplingModes"]
    assert "grid-scan" in response.json()["samplingModes"]
    assert "ultra-small" in response.json()["samplingModes"]
    assert "line-art" in response.json()["samplingModes"]


def test_create_ai_image_and_fetch_generated_image(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    store = FakeAiImageStore()
    headers = setup_authenticated_ai_access(monkeypatch, tmp_path)
    monkeypatch.setattr(main_module, "ai_image_store", store)

    response = client.post(
        "/api/ai-images",
        headers=headers,
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


def test_create_ai_image_returns_processing_before_background_result(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    store = ImmediateFakeAiImageStore()
    headers = setup_authenticated_ai_access(monkeypatch, tmp_path)
    monkeypatch.setattr(main_module, "ai_image_store", store)

    response = client.post(
        "/api/ai-images",
        headers=headers,
        data={"widthCells": "8", "heightCells": "10"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "aiImageId": "ai-1",
        "status": "processing",
        "imageUrl": None,
    }


def test_ai_image_store_create_starts_background_task_without_waiting() -> None:
    class RecordingProvider:
        called = False

        def generate_image(self, **kwargs):
            self.called = True
            return make_image()

    task_runner_calls = []

    def task_runner(run):
        task_runner_calls.append(run)

    provider = RecordingProvider()
    store = AiImageStore(provider=provider, task_runner=task_runner)

    item = store.create(
        image_bytes=make_image(),
        width_cells=8,
        height_cells=8,
    )

    assert item.status == "processing"
    assert item.image_bytes is None
    assert provider.called is False
    assert len(task_runner_calls) == 1

    task_runner_calls[0]()

    assert item.status == "completed"
    assert item.image_bytes == make_image()


def test_ai_image_store_marks_unexpected_background_error_as_failed() -> None:
    class FailingProvider:
        def generate_image(self, **kwargs):
            raise RuntimeError("network exploded")

    store = AiImageStore(provider=FailingProvider(), task_runner=lambda run: run())

    item = store.create(
        image_bytes=make_image(),
        width_cells=8,
        height_cells=8,
    )

    assert item.status == "failed"
    assert item.image_bytes is None
    assert item.error == "network exploded"


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


def test_create_generation_accepts_octet_stream_upload_with_image_bytes() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample", "samplingMode": "edge"},
        files={"image": ("upload.tmp", make_image(), "application/octet-stream")},
    )

    assert response.status_code == 200


def test_create_generation_accepts_raw_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample", "samplingMode": "raw"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")
    body = result_response.json()

    assert body["result"]["usage"]
    assert "sourceRgb" in body["result"]["cells"][0][0]
    assert "beadCode" in body["result"]["cells"][0][0]


def test_create_generation_accepts_center_shrink_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample", "samplingMode": "center-shrink"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200


def test_create_generation_accepts_coverage_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample", "samplingMode": "coverage"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")
    body = result_response.json()

    assert body["result"]["widthCells"] == 4
    assert body["result"]["heightCells"] == 4
    assert body["result"]["usage"]


def test_create_generation_accepts_ultra_small_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "16", "heightCells": "16", "sourceMode": "resample", "samplingMode": "ultra-small"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")
    body = result_response.json()

    assert body["result"]["rleRows"]


def test_create_generation_accepts_line_art_sampling_mode() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "4", "heightCells": "4", "sourceMode": "resample", "samplingMode": "line-art"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200


def test_create_generation_accepts_grid_scan_sampling_mode() -> None:
    cell_size = 7
    image = Image.new("RGB", (3 * cell_size + 4, 2 * cell_size + 3), (20, 20, 20))
    for row, rgb_row in enumerate([[(255, 0, 0), (0, 0, 255), (248, 248, 248)], [(0, 220, 0), (255, 0, 0), (0, 0, 255)]]):
        for col, rgb in enumerate(rgb_row):
            left = 1 + col * (cell_size + 1)
            top = 1 + row * (cell_size + 1)
            for y in range(top, top + cell_size):
                for x in range(left, left + cell_size):
                    image.putpixel((x, y), rgb)
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    response = client.post(
        "/api/generations",
        data={"widthCells": "1", "heightCells": "1", "sourceMode": "resample", "samplingMode": "grid-scan"},
        files={"image": ("grid.png", buffer.getvalue(), "image/png")},
    )

    assert response.status_code == 200
    generation_id = response.json()["generationId"]
    result_response = client.get(f"/api/generations/{generation_id}")
    body = result_response.json()

    assert body["result"]["widthCells"] == 3
    assert body["result"]["heightCells"] == 2
    assert any(cell.get("empty") for row in body["result"]["cells"] for cell in row)


def test_pattern_debug_analyze_reports_detected_and_compressed_grids() -> None:
    image = Image.new("RGB", (4, 4), (255, 0, 0))
    for y in range(4):
        for x in range(2, 4):
            image.putpixel((x, y), (0, 0, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")

    response = client.post(
        "/api/pattern-debug/analyze",
        data={"widthCells": "3", "heightCells": "2"},
        files={"image": ("blocks.png", buffer.getvalue(), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["sourceWidth"] == 4
    assert body["sourceHeight"] == 4
    assert body["detectedBlockWidth"] == 2
    assert body["detectedBlockHeight"] == 4
    assert body["detectedGridWidth"] == 2
    assert body["detectedGridHeight"] == 1
    assert body["detectedPixelCount"] == 2
    assert body["compressedGridWidth"] == 3
    assert body["compressedGridHeight"] == 2
    assert body["compressedPixelCount"] == 6
    assert body["originalPreviewDataUrl"].startswith("data:image/png;base64,")
    assert body["compressedPreviewDataUrl"].startswith("data:image/png;base64,")


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


def test_rejects_invalid_ai_detail_for_ai_image_generation(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    headers = setup_authenticated_ai_access(monkeypatch, tmp_path)
    response = client.post(
        "/api/ai-images",
        headers=headers,
        data={"widthCells": "8", "heightCells": "8", "aiDetail": "too-much"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400


def test_rejects_invalid_ai_prompt_controls_for_ai_image_generation(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    headers = setup_authenticated_ai_access(monkeypatch, tmp_path)
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
            headers=headers,
            data={"widthCells": "8", "heightCells": "8", **data},
            files={"image": ("test.png", make_image(), "image/png")},
        )

        assert response.status_code == 400




