from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


client = TestClient(app)


def make_image() -> bytes:
    image = Image.new("RGB", (4, 4), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


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


def test_rejects_invalid_grid_size() -> None:
    response = client.post(
        "/api/generations",
        data={"widthCells": "0", "heightCells": "8"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 400
