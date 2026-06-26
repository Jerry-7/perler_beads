from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

from app.settings import load_settings


class AuthError(ValueError):
    pass


@dataclass(frozen=True)
class WechatSession:
    openid: str


@dataclass(frozen=True)
class SessionPrincipal:
    openid: str
    expires_at: datetime


class WechatAuthClient:
    def __init__(self, app_id: str, app_secret: str, transport: httpx.BaseTransport | None = None) -> None:
        self._app_id = app_id
        self._app_secret = app_secret
        self._transport = transport

    def exchange_code(self, code: str) -> WechatSession:
        with httpx.Client(timeout=10, transport=self._transport, trust_env=False) as client:
            response = client.get(
                'https://api.weixin.qq.com/sns/jscode2session',
                params={
                    'appid': self._app_id,
                    'secret': self._app_secret,
                    'js_code': code,
                    'grant_type': 'authorization_code',
                },
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise AuthError('wechat login returned invalid json') from exc
        if response.status_code >= 400 or payload.get('errcode'):
            raise AuthError(payload.get('errmsg') or 'wechat login failed')
        openid = payload.get('openid')
        if not isinstance(openid, str) or not openid:
            raise AuthError('wechat login did not return openid')
        return WechatSession(openid=openid)


class SessionTokenService:
    def __init__(self, secret: str, ttl_days: int) -> None:
        self._secret = secret.encode('utf-8')
        self._ttl_days = ttl_days

    def issue(self, openid: str) -> tuple[str, datetime]:
        expires_at = datetime.now(UTC) + timedelta(days=self._ttl_days)
        payload = {'openid': openid, 'exp': expires_at.isoformat()}
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8')
        encoded = base64.urlsafe_b64encode(body).decode('ascii').rstrip('=')
        signature = hmac.new(self._secret, encoded.encode('ascii'), hashlib.sha256).hexdigest()
        return f'{encoded}.{signature}', expires_at

    def verify(self, token: str) -> SessionPrincipal:
        try:
            encoded, signature = token.split('.', 1)
        except ValueError as exc:
            raise AuthError('invalid session token') from exc
        expected = hmac.new(self._secret, encoded.encode('ascii'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise AuthError('invalid session token signature')
        padding = '=' * (-len(encoded) % 4)
        try:
            payload = json.loads(base64.urlsafe_b64decode(encoded + padding).decode('utf-8'))
        except Exception as exc:
            raise AuthError('invalid session token payload') from exc
        openid = payload.get('openid')
        expires_at_raw = payload.get('exp')
        if not isinstance(openid, str) or not isinstance(expires_at_raw, str):
            raise AuthError('invalid session token payload')
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(UTC):
            raise AuthError('session token expired')
        return SessionPrincipal(openid=openid, expires_at=expires_at)


def create_wechat_auth_client(transport: httpx.BaseTransport | None = None) -> WechatAuthClient:
    settings = load_settings()
    return WechatAuthClient(settings.wechat_app_id, settings.wechat_app_secret, transport=transport)


def create_session_token_service() -> SessionTokenService:
    settings = load_settings()
    return SessionTokenService(settings.session_token_secret, settings.session_token_ttl_days)
