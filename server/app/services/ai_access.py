from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.models import AccessKeyItem, AccessKeySummary, AiAccessSummary, AiPackageOffer, AdminCodeItem
from app.services.storage import Database, database


class AiAccessError(ValueError):
    pass


PACKAGE_OFFERS = [
    AiPackageOffer(code="pkg_100_3", title="1 CNY / 3 credits", amountFen=100, quotaAmount=3),
    AiPackageOffer(code="pkg_150_5", title="1.5 CNY / 5 credits", amountFen=150, quotaAmount=5),
    AiPackageOffer(code="pkg_200_8", title="2 CNY / 8 credits", amountFen=200, quotaAmount=8),
    AiPackageOffer(code="pkg_500_20", title="5 CNY / 20 credits", amountFen=500, quotaAmount=20),
]
PACKAGE_BY_CODE = {offer.code: offer for offer in PACKAGE_OFFERS}


@dataclass(frozen=True)
class UserRecord:
    id: int
    openid: str
    created_at: str
    last_login_at: str


@dataclass(frozen=True)
class AccessKeyRecord:
    code: str
    total_uses: int
    used_count: int
    status: str
    expires_at: str | None
    created_at: str
    created_by: str
    last_used_at: str | None


class AiAccessService:
    def __init__(self, db: Database | None = None) -> None:
        self._db = db or database

    def get_package_offers(self) -> list[AiPackageOffer]:
        return PACKAGE_OFFERS

    def ensure_user(self, openid: str) -> UserRecord:
        now = datetime.now(UTC).isoformat()
        with self._db.connect() as conn:
            row = conn.execute("SELECT id, openid, created_at, last_login_at FROM users WHERE openid = ?", (openid,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO users (openid, created_at, last_login_at) VALUES (?, ?, ?)",
                    (openid, now, now),
                )
                user_id = conn.execute("SELECT id FROM users WHERE openid = ?", (openid,)).fetchone()["id"]
                conn.execute(
                    "INSERT INTO ai_quota_accounts (user_id, purchased_quota_total, purchased_quota_used, updated_at) VALUES (?, 0, 0, ?)",
                    (user_id, now),
                )
                return UserRecord(id=user_id, openid=openid, created_at=now, last_login_at=now)
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, row["id"]))
            return UserRecord(id=row["id"], openid=row["openid"], created_at=row["created_at"], last_login_at=now)

    def get_access_summary(self, user: UserRecord) -> AiAccessSummary:
        remaining = self.get_remaining_quota(user.id)
        free_until = self.get_active_free_access_expiry(user.id)
        return AiAccessSummary(
            remainingQuota=remaining,
            hasFreeAccess=free_until is not None,
            freeAccessExpiresAt=free_until,
            canGenerateAi=remaining > 0 or free_until is not None,
            activePackageOffers=PACKAGE_OFFERS,
        )

    def get_remaining_quota(self, user_id: int) -> int:
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT purchased_quota_total, purchased_quota_used FROM ai_quota_accounts WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            if row is None:
                return 0
            return max(0, row["purchased_quota_total"] - row["purchased_quota_used"])

    def get_active_free_access_expiry(self, user_id: int) -> str | None:
        now = datetime.now(UTC).isoformat()
        with self._db.connect() as conn:
            row = conn.execute(
                """
                SELECT expires_at
                FROM ai_admin_access_grants
                WHERE user_id = ? AND expires_at > ?
                ORDER BY expires_at DESC
                LIMIT 1
                """,
                (user_id, now),
            ).fetchone()
            return row["expires_at"] if row else None

    def create_order(self, user: UserRecord, package_code: str) -> tuple[str, AiPackageOffer]:
        offer = PACKAGE_BY_CODE.get(package_code)
        if offer is None:
            raise AiAccessError("unknown package code")
        now = datetime.now(UTC).isoformat()
        order_no = f"AI{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}{secrets.randbelow(1000000):06d}"
        with self._db.connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_payment_orders (order_no, user_id, package_code, amount_fen, quota_amount, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'created', ?, ?)
                """,
                (order_no, user.id, offer.code, offer.amountFen, offer.quotaAmount, now, now),
            )
        return order_no, offer

    def mark_order_paid(self, order_no: str, wechat_transaction_id: str, paid_at: str | None = None) -> None:
        effective_paid_at = paid_at or datetime.now(UTC).isoformat()
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT user_id, quota_amount, status FROM ai_payment_orders WHERE order_no = ?",
                (order_no,),
            ).fetchone()
            if row is None:
                raise AiAccessError("order not found")
            if row["status"] == "paid":
                return
            conn.execute(
                """
                UPDATE ai_payment_orders
                SET status = 'paid', wechat_transaction_id = ?, paid_at = ?, updated_at = ?
                WHERE order_no = ?
                """,
                (wechat_transaction_id, effective_paid_at, effective_paid_at, order_no),
            )
            conn.execute(
                """
                UPDATE ai_quota_accounts
                SET purchased_quota_total = purchased_quota_total + ?, updated_at = ?
                WHERE user_id = ?
                """,
                (row["quota_amount"], effective_paid_at, row["user_id"]),
            )

    def redeem_admin_code(self, user: UserRecord, code: str) -> str:
        now = datetime.now(UTC)
        now_iso = now.isoformat()
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT code, status, expires_at FROM ai_admin_codes WHERE code = ?",
                (code,),
            ).fetchone()
            if row is None:
                raise AiAccessError("admin code not found")
            if row["status"] != "unused":
                raise AiAccessError("admin code already used")
            expires_at = datetime.fromisoformat(row["expires_at"])
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at <= now:
                conn.execute("UPDATE ai_admin_codes SET status = ? WHERE code = ?", ("expired", code))
                raise AiAccessError("admin code expired")
            free_expires_at = (now + timedelta(hours=24)).isoformat()
            conn.execute(
                "UPDATE ai_admin_codes SET status = ?, redeemed_by_user_id = ?, redeemed_at = ? WHERE code = ?",
                ("redeemed", user.id, now_iso, code),
            )
            conn.execute(
                """
                INSERT INTO ai_admin_access_grants (user_id, granted_by_code, starts_at, expires_at, redeemed_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user.id, code, now_iso, free_expires_at, now_iso),
            )
            return free_expires_at

    def create_admin_codes(self, count: int, created_by: str) -> list[AdminCodeItem]:
        now = datetime.now(UTC)
        now_iso = now.isoformat()
        expires_at = (now + timedelta(hours=24)).isoformat()
        items: list[AdminCodeItem] = []
        with self._db.connect() as conn:
            for _ in range(count):
                code = f"ADMIN-{secrets.token_hex(4).upper()}"
                conn.execute(
                    "INSERT INTO ai_admin_codes (code, status, expires_at, created_at, created_by) VALUES (?, ?, ?, ?, ?)",
                    (code, "unused", expires_at, now_iso, created_by),
                )
                items.append(AdminCodeItem(code=code, expiresAt=expires_at))
        return items

    def create_access_keys(self, count: int, uses_per_code: int, created_by: str, expires_at: str | None = None) -> list[AccessKeyItem]:
        now_iso = datetime.now(UTC).isoformat()
        items: list[AccessKeyItem] = []
        with self._db.connect() as conn:
            for _ in range(count):
                code = self._new_access_code()
                conn.execute(
                    """
                    INSERT INTO ai_access_keys (code, total_uses, used_count, status, expires_at, created_at, created_by)
                    VALUES (?, ?, 0, 'active', ?, ?, ?)
                    """,
                    (code, uses_per_code, expires_at, now_iso, created_by),
                )
                items.append(
                    AccessKeyItem(
                        code=code,
                        totalUses=uses_per_code,
                        usedCount=0,
                        remainingUses=uses_per_code,
                        status="active",
                        expiresAt=expires_at,
                        createdAt=now_iso,
                        createdBy=created_by,
                    )
                )
        return items

    def get_access_key_summary(self, code: str) -> AccessKeySummary:
        record = self._get_access_key_record(code)
        self._ensure_access_key_exists(record)
        assert record is not None
        status = self._effective_access_key_status(record)
        remaining = max(0, record.total_uses - record.used_count)
        return AccessKeySummary(
            code=record.code,
            totalUses=record.total_uses,
            usedCount=record.used_count,
            remainingUses=remaining,
            status=status,
            expiresAt=record.expires_at,
            canGenerateAi=status == "active" and remaining > 0,
        )

    def validate_access_key_for_generation(self, code: str) -> AccessKeyRecord:
        record = self._get_access_key_record(code)
        self._ensure_access_key_exists(record)
        assert record is not None
        status = self._effective_access_key_status(record)
        if status != "active":
            raise AiAccessError(f"access key is {status}")
        if record.used_count >= record.total_uses:
            raise AiAccessError("access key has no remaining uses")
        return record

    def register_ai_image_job(self, ai_image_id: str, user_id: int, used_free_access: bool) -> None:
        with self._db.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO ai_image_jobs (ai_image_id, user_id, quota_debited, used_free_access, created_at)
                VALUES (?, ?, 0, ?, ?)
                """,
                (ai_image_id, user_id, 1 if used_free_access else 0, datetime.now(UTC).isoformat()),
            )

    def register_ai_image_key_job(self, ai_image_id: str, access_code: str) -> None:
        with self._db.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO ai_key_image_jobs (ai_image_id, access_code, quota_debited, created_at)
                VALUES (?, ?, 0, ?)
                """,
                (ai_image_id, access_code, datetime.now(UTC).isoformat()),
            )

    def debit_quota_for_ai_image_if_needed(self, ai_image_id: str, succeeded: bool) -> None:
        if not succeeded:
            return
        now = datetime.now(UTC).isoformat()
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT user_id, quota_debited, used_free_access FROM ai_image_jobs WHERE ai_image_id = ?",
                (ai_image_id,),
            ).fetchone()
            if row is None or row["quota_debited"] or row["used_free_access"]:
                return
            conn.execute("UPDATE ai_image_jobs SET quota_debited = 1 WHERE ai_image_id = ?", (ai_image_id,))
            conn.execute(
                """
                UPDATE ai_quota_accounts
                SET purchased_quota_used = purchased_quota_used + 1, updated_at = ?
                WHERE user_id = ?
                """,
                (now, row["user_id"]),
            )

    def debit_access_key_for_ai_image_if_needed(self, ai_image_id: str, succeeded: bool) -> None:
        if not succeeded:
            return
        now = datetime.now(UTC).isoformat()
        with self._db.connect() as conn:
            row = conn.execute(
                "SELECT access_code, quota_debited FROM ai_key_image_jobs WHERE ai_image_id = ?",
                (ai_image_id,),
            ).fetchone()
            if row is None or row["quota_debited"]:
                return
            key_row = conn.execute(
                "SELECT total_uses, used_count, status, expires_at FROM ai_access_keys WHERE code = ?",
                (row["access_code"],),
            ).fetchone()
            if key_row is None:
                return
            if self._effective_status_from_values(key_row["status"], key_row["expires_at"], key_row["used_count"], key_row["total_uses"]) != "active":
                return
            conn.execute("UPDATE ai_key_image_jobs SET quota_debited = 1 WHERE ai_image_id = ?", (ai_image_id,))
            conn.execute(
                """
                UPDATE ai_access_keys
                SET used_count = used_count + 1,
                    last_used_at = ?,
                    status = CASE WHEN used_count + 1 >= total_uses THEN 'exhausted' ELSE status END
                WHERE code = ?
                """,
                (now, row["access_code"]),
            )

    def _new_access_code(self) -> str:
        return f"AI-{secrets.token_urlsafe(12).replace('_', '').replace('-', '').upper()[:16]}"

    def _get_access_key_record(self, code: str) -> AccessKeyRecord | None:
        normalized = code.strip().upper()
        with self._db.connect() as conn:
            row = conn.execute(
                """
                SELECT code, total_uses, used_count, status, expires_at, created_at, created_by, last_used_at
                FROM ai_access_keys
                WHERE code = ?
                """,
                (normalized,),
            ).fetchone()
            if row is None:
                return None
            return AccessKeyRecord(
                code=row["code"],
                total_uses=row["total_uses"],
                used_count=row["used_count"],
                status=row["status"],
                expires_at=row["expires_at"],
                created_at=row["created_at"],
                created_by=row["created_by"],
                last_used_at=row["last_used_at"],
            )

    def _ensure_access_key_exists(self, record: AccessKeyRecord | None) -> None:
        if record is None:
            raise AiAccessError("access key not found")

    def _effective_access_key_status(self, record: AccessKeyRecord) -> str:
        return self._effective_status_from_values(record.status, record.expires_at, record.used_count, record.total_uses)

    def _effective_status_from_values(self, status: str, expires_at: str | None, used_count: int, total_uses: int) -> str:
        if status not in {"active", "exhausted"}:
            return status
        if expires_at:
            expires_datetime = datetime.fromisoformat(expires_at)
            if expires_datetime.tzinfo is None:
                expires_datetime = expires_datetime.replace(tzinfo=UTC)
            if expires_datetime <= datetime.now(UTC):
                return "expired"
        if used_count >= total_uses:
            return "exhausted"
        return status


ai_access_service = AiAccessService()



