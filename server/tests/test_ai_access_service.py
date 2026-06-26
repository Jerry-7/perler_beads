from datetime import UTC, datetime, timedelta

from app.services.ai_access import AiAccessService
from app.services.storage import Database


def create_service(tmp_path) -> AiAccessService:
    db = Database(str(tmp_path / "ai-access.sqlite3"))
    db.initialize()
    return AiAccessService(db)


def test_mark_order_paid_is_idempotent(tmp_path) -> None:
    service = create_service(tmp_path)
    user = service.ensure_user("openid-1")
    order_no, _ = service.create_order(user, "pkg_100_3")

    service.mark_order_paid(order_no, "txn-1")
    service.mark_order_paid(order_no, "txn-1")

    assert service.get_remaining_quota(user.id) == 3


def test_debit_quota_for_ai_image_only_happens_once(tmp_path) -> None:
    service = create_service(tmp_path)
    user = service.ensure_user("openid-2")
    order_no, _ = service.create_order(user, "pkg_150_5")
    service.mark_order_paid(order_no, "txn-2")

    service.register_ai_image_job("job-1", user.id, used_free_access=False)
    service.debit_quota_for_ai_image_if_needed("job-1", succeeded=True)
    service.debit_quota_for_ai_image_if_needed("job-1", succeeded=True)

    assert service.get_remaining_quota(user.id) == 4


def test_debit_quota_skips_failed_jobs_and_free_access_jobs(tmp_path) -> None:
    service = create_service(tmp_path)
    user = service.ensure_user("openid-3")
    order_no, _ = service.create_order(user, "pkg_200_8")
    service.mark_order_paid(order_no, "txn-3")

    service.register_ai_image_job("failed-job", user.id, used_free_access=False)
    service.debit_quota_for_ai_image_if_needed("failed-job", succeeded=False)

    service.register_ai_image_job("free-job", user.id, used_free_access=True)
    service.debit_quota_for_ai_image_if_needed("free-job", succeeded=True)

    assert service.get_remaining_quota(user.id) == 8


def test_redeem_admin_code_grants_free_access_for_twenty_four_hours(tmp_path) -> None:
    service = create_service(tmp_path)
    user = service.ensure_user("openid-4")
    code = service.create_admin_codes(1, created_by="tester")[0].code

    expires_at = service.redeem_admin_code(user, code)
    expires_datetime = datetime.fromisoformat(expires_at)

    assert expires_datetime > datetime.now(UTC) + timedelta(hours=23, minutes=59)
    assert service.get_active_free_access_expiry(user.id) == expires_at
