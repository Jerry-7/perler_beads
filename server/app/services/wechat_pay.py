from __future__ import annotations

import base64
import json
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.models import AiOrderPaymentParams
from app.settings import load_settings


class WechatPayError(ValueError):
    pass


@dataclass(frozen=True)
class WechatPrepayResult:
    prepay_id: str
    payment_params: AiOrderPaymentParams


class WechatPayClient:
    def __init__(
        self,
        app_id: str,
        mch_id: str,
        v3_key: str,
        cert_serial_no: str,
        private_key_path: str,
        notify_url: str,
        platform_cert_path: str = "",
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._app_id = app_id
        self._mch_id = mch_id
        self._v3_key = v3_key.encode("utf-8")
        self._cert_serial_no = cert_serial_no
        self._notify_url = notify_url
        self._transport = transport
        self._private_key = serialization.load_pem_private_key(Path(private_key_path).read_bytes(), password=None)
        self._platform_public_key = load_platform_public_key(platform_cert_path) if platform_cert_path else None

    def create_jsapi_order(self, order_no: str, amount_fen: int, description: str, openid: str) -> WechatPrepayResult:
        nonce = secrets.token_hex(16)
        timestamp = str(int(datetime.now(UTC).timestamp()))
        body = {
            "appid": self._app_id,
            "mchid": self._mch_id,
            "description": description,
            "out_trade_no": order_no,
            "notify_url": self._notify_url,
            "amount": {"total": amount_fen, "currency": "CNY"},
            "payer": {"openid": openid},
        }
        body_text = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
        authorization = self._build_authorization("POST", "/v3/pay/transactions/jsapi", timestamp, nonce, body_text)
        with httpx.Client(timeout=15, transport=self._transport, trust_env=False) as client:
            response = client.post(
                "https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi",
                content=body_text.encode("utf-8"),
                headers={"Authorization": authorization, "Accept": "application/json", "Content-Type": "application/json"},
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise WechatPayError("wechat pay returned invalid json") from exc
        if response.status_code >= 400:
            raise WechatPayError(payload.get("message") or payload.get("code") or "wechat pay order failed")
        prepay_id = payload.get("prepay_id")
        if not isinstance(prepay_id, str) or not prepay_id:
            raise WechatPayError("wechat pay response missing prepay_id")
        payment_nonce = secrets.token_hex(16)
        payment_timestamp = str(int(datetime.now(UTC).timestamp()))
        package = f"prepay_id={prepay_id}"
        pay_sign = self._sign_message(f"{self._app_id}\n{payment_timestamp}\n{payment_nonce}\n{package}\n")
        return WechatPrepayResult(
            prepay_id=prepay_id,
            payment_params=AiOrderPaymentParams(timeStamp=payment_timestamp, nonceStr=payment_nonce, package=package, paySign=pay_sign),
        )

    def parse_notify(self, payload: dict[str, Any], headers: dict[str, str] | None = None, raw_body: bytes | None = None) -> dict[str, Any]:
        if self._platform_public_key is not None:
            if headers is None or raw_body is None:
                raise WechatPayError("missing notify signature inputs")
            self._verify_notify_signature(headers, raw_body)
        resource = payload.get("resource")
        if not isinstance(resource, dict):
            raise WechatPayError("missing notify resource")
        ciphertext = resource.get("ciphertext")
        nonce = resource.get("nonce")
        associated_data = resource.get("associated_data", "")
        if not isinstance(ciphertext, str) or not isinstance(nonce, str):
            raise WechatPayError("invalid notify resource")
        aesgcm = AESGCM(self._v3_key)
        try:
            plaintext = aesgcm.decrypt(nonce.encode("utf-8"), base64.b64decode(ciphertext), associated_data.encode("utf-8"))
        except Exception as exc:
            raise WechatPayError("failed to decrypt notify payload") from exc
        try:
            return json.loads(plaintext.decode("utf-8"))
        except ValueError as exc:
            raise WechatPayError("notify payload is not valid json") from exc

    def _verify_notify_signature(self, headers: dict[str, str], raw_body: bytes) -> None:
        timestamp = header_value(headers, "wechatpay-timestamp")
        nonce = header_value(headers, "wechatpay-nonce")
        signature = header_value(headers, "wechatpay-signature")
        if not timestamp or not nonce or not signature:
            raise WechatPayError("missing wechat pay signature headers")
        message = f"{timestamp}\n{nonce}\n{raw_body.decode('utf-8')}\n".encode("utf-8")
        try:
            self._platform_public_key.verify(base64.b64decode(signature), message, padding.PKCS1v15(), hashes.SHA256())
        except (InvalidSignature, ValueError) as exc:
            raise WechatPayError("invalid wechat pay notify signature") from exc

    def _build_authorization(self, method: str, canonical_url: str, timestamp: str, nonce: str, body: str) -> str:
        message = f"{method}\n{canonical_url}\n{timestamp}\n{nonce}\n{body}\n"
        signature = self._sign_message(message)
        return (
            "WECHATPAY2-SHA256-RSA2048 "
            f'mchid="{self._mch_id}",'
            f'nonce_str="{nonce}",'
            f'signature="{signature}",'
            f'timestamp="{timestamp}",'
            f'serial_no="{self._cert_serial_no}"'
        )

    def _sign_message(self, message: str) -> str:
        signature = self._private_key.sign(message.encode("utf-8"), padding.PKCS1v15(), hashes.SHA256())
        return base64.b64encode(signature).decode("ascii")


def header_value(headers: dict[str, str], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return ""


def load_platform_public_key(platform_cert_path: str):
    cert_bytes = Path(platform_cert_path).read_bytes()
    try:
        return x509.load_pem_x509_certificate(cert_bytes).public_key()
    except ValueError:
        return serialization.load_pem_public_key(cert_bytes)


def create_wechat_pay_client(transport: httpx.BaseTransport | None = None) -> WechatPayClient:
    settings = load_settings()
    return WechatPayClient(
        app_id=settings.wechat_app_id,
        mch_id=settings.wechat_pay_mch_id,
        v3_key=settings.wechat_pay_v3_key,
        cert_serial_no=settings.wechat_pay_cert_serial_no,
        private_key_path=settings.wechat_pay_private_key_path,
        notify_url=settings.wechat_pay_notify_url,
        platform_cert_path=settings.wechat_pay_platform_cert_path,
        transport=transport,
    )
