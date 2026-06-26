from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.models import AiAccessSummary, AiPackageOffer, AdminCodeItem
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

    def register_ai_image_job(self, ai_image_id: str, user_id: int, used_free_access: bool) -> None:
        with self._db.connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO ai_image_jobs (ai_image_id, user_id, quota_debited, used_free_access, created_at)
                VALUES (?, ?, 0, ?, ?)
                """,
                (ai_image_id, user_id, 1 if used_free_access else 0, datetime.now(UTC).isoformat()),
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


ai_access_service = AiAccessService()



