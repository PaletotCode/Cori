import logging
import time

from sqlalchemy import text

from app.core.config import settings
from app.core.db import SessionLocal, check_database
from app.core.redis_client import check_redis
from app.services.session_service import ReminderRunResult, session_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cori-worker")


def run_session_reminders_once() -> ReminderRunResult:
    with SessionLocal() as db:
        db.execute(text("SET LOCAL ROLE cori_app"))
        db.execute(text("SELECT set_config('app.rls_bypass', 'on', true)"))
        result = session_service.run_due_reminders_job(db)
        db.commit()
        return result


def run() -> None:
    interval_seconds = max(settings.worker_heartbeat_seconds, 5)
    logger.info(
        "Worker started with heartbeat interval=%ss reminders_enabled=%s",
        interval_seconds,
        settings.worker_enable_session_reminders,
    )

    while True:
        db_ok = check_database()
        redis_ok = check_redis()
        logger.info(
            "heartbeat database=%s redis=%s",
            "ok" if db_ok else "down",
            "ok" if redis_ok else "down",
        )
        if settings.worker_enable_session_reminders:
            reminder_result = run_session_reminders_once()
            logger.info(
                "session_reminders processed=%s sent=%s failed=%s",
                reminder_result.processed,
                reminder_result.sent,
                reminder_result.failed,
            )
        time.sleep(interval_seconds)


if __name__ == "__main__":
    run()
