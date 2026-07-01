from __future__ import annotations

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import app.main as main_module
import app.services.ai_images as ai_images_module
from app.main import app
from app.services.ai_access import AiAccessService
from app.models import AiOrderPaymentParams
from app.services.auth import AdminTokenService, AuthError, SessionTokenService
from app.services.storage import Database


client = TestClient(app)


def make_image() -> bytes:
    image = Image.new("RGB", (4, 4), (255, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class FakeWechatAuthClient:
    def exchange_code(self, code: str):
        if code == "valid-code":
            return type("WechatSession", (), {"openid": "openid-test"})()
        raise AuthError("invalid code")


class FakeWechatPayClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def create_jsapi_order(self, order_no: str, amount_fen: int, description: str, openid: str):
        self.calls.append(
            {
                "order_no": order_no,
                "amount_fen": amount_fen,
                "description": description,
                "openid": openid,
            }
        )
        return type("WechatPrepayResult", (), {"prepay_id": "mock-prepay", "payment_params": AiOrderPaymentParams(timeStamp="1710000000", nonceStr="nonce", package="prepay_id=mock-prepay", signType="RSA", paySign="mock-sign")})()

    def parse_notify(self, payload):
        return payload


class RecordingAiImageStore:
    def __init__(self) -> None:
        self.created: dict[str, object] | None = None

    def create(self, **kwargs):
        self.created = kwargs
        return type(
            "AiImage",
            (),
            {
                "id": "ai-paid-1",
                "status": "processing",
                "image_bytes": None,
                "content_type": "image/png",
                "error": None,
            },
        )()


@pytest.fixture
def access_env(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch):
    db = Database(str(tmp_path / "access.sqlite3"))
    db.initialize()
    access_service = AiAccessService(db)
    token_service = SessionTokenService("test-secret", 7)
    admin_token_service = AdminTokenService("admin", "secret", "admin-secret", 8)
    pay_client = FakeWechatPayClient()
    monkeypatch.setenv("AI_ADMIN_API_KEY", "test-admin-key")

    monkeypatch.setattr(main_module, "ai_access_service", access_service)
    monkeypatch.setattr(main_module, "session_token_service", token_service)
    monkeypatch.setattr(main_module, "admin_token_service", admin_token_service)
    monkeypatch.setattr(main_module, "wechat_auth_client", FakeWechatAuthClient())
    monkeypatch.setattr(main_module, "wechat_pay_client", pay_client)
    monkeypatch.setattr(ai_images_module, "ai_access_service", access_service)

    return {
        "access_service": access_service,
        "token_service": token_service,
        "pay_client": pay_client,
        "admin_token_service": admin_token_service,
    }


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def login() -> dict[str, object]:
    response = client.post("/api/auth/wechat/login", json={"code": "valid-code"})
    assert response.status_code == 200
    return response.json()


def test_wechat_login_returns_session_token(access_env) -> None:
    response = client.post("/api/auth/wechat/login", json={"code": "valid-code"})

    assert response.status_code == 200
    body = response.json()
    assert body["sessionToken"]
    assert body["userSummary"]["openid"] == "openid-test"


def test_ai_access_me_returns_zero_quota_for_new_user(access_env) -> None:
    login_response = login()

    response = client.get("/api/ai-access/me", headers=auth_header(login_response["sessionToken"]))

    assert response.status_code == 200
    assert response.json()["remainingQuota"] == 0
    assert response.json()["hasFreeAccess"] is False


def test_create_admin_codes_requires_admin_key_and_redeem_grants_free_access(access_env) -> None:
    create_response = client.post(
        "/api/admin/ai-access/codes",
        json={"count": 1},
        headers={"X-Admin-Api-Key": "test-admin-key"},
    )

    assert create_response.status_code == 200
    code = create_response.json()["codes"][0]["code"]

    login_response = login()
    redeem_response = client.post(
        "/api/ai-access/admin-codes/redeem",
        json={"code": code},
        headers=auth_header(login_response["sessionToken"]),
    )

    assert redeem_response.status_code == 200
    assert redeem_response.json()["hasFreeAccess"] is True


def admin_header(access_env) -> dict[str, str]:
    token, _ = access_env["admin_token_service"].issue("admin", "secret")
    return {"Authorization": f"Bearer {token}"}


def test_admin_login_returns_admin_token(access_env) -> None:
    response = client.post("/api/admin/login", json={"username": "admin", "password": "secret"})

    assert response.status_code == 200
    assert response.json()["adminToken"]


def test_create_access_keys_requires_admin_token(access_env) -> None:
    response = client.post("/api/admin/ai-access/keys", json={"count": 1, "usesPerCode": 3})

    assert response.status_code == 401


def test_create_access_keys_and_summary(access_env) -> None:
    create_response = client.post(
        "/api/admin/ai-access/keys",
        json={"count": 2, "usesPerCode": 4},
        headers=admin_header(access_env),
    )

    assert create_response.status_code == 200
    key = create_response.json()["keys"][0]
    assert key["totalUses"] == 4

    summary_response = client.post("/api/ai-access/keys/summary", json={"code": key["code"]})
    assert summary_response.status_code == 200
    assert summary_response.json()["remainingUses"] == 4


def test_ai_images_requires_access_key(access_env) -> None:
    response = client.post(
        "/api/ai-images",
        data={"widthCells": "8", "heightCells": "8"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 422


def test_ai_images_rejects_invalid_access_key(access_env) -> None:
    response = client.post(
        "/api/ai-images",
        data={"widthCells": "8", "heightCells": "8", "accessCode": "missing"},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 403


def test_ai_images_allows_generation_with_access_key(access_env, monkeypatch: pytest.MonkeyPatch) -> None:
    store = RecordingAiImageStore()
    monkeypatch.setattr(main_module, "ai_image_store", store)
    key = access_env["access_service"].create_access_keys(1, uses_per_code=3, created_by="tester")[0]

    response = client.post(
        "/api/ai-images",
        data={"widthCells": "8", "heightCells": "8", "accessCode": key.code},
        files={"image": ("test.png", make_image(), "image/png")},
    )

    assert response.status_code == 200
    assert store.created is not None
    assert store.created["access_code"] == key.code


def test_create_ai_order_returns_payment_params(access_env) -> None:
    login_response = login()

    response = client.post(
        "/api/ai-access/orders",
        json={"packageCode": "pkg_500_20"},
        headers=auth_header(login_response["sessionToken"]),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["packageCode"] == "pkg_500_20"
    assert body["amountFen"] == 500
    assert body["quotaAmount"] == 20
    assert body["paymentParams"]["package"] == "prepay_id=mock-prepay"



