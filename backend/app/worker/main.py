import logging
import time
from uuid import uuid4

from app.core.config import settings
from app.core.db import SessionLocal, check_database
from app.core.redis_client import check_redis
from app.worker.job_handlers import (
    JOB_ACTIVITIES_DISPATCH,
    JOB_ACTIVITIES_OVERDUE,
    JOB_FORMS_DISPATCH,
    JOB_SESSION_REMINDERS,
    handle_job,
)
from app.worker.job_queue import JobEnvelope, WorkerJobQueue, job_queue

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cori-worker")


def _configured_scheduler_jobs() -> list[str]:
    jobs: list[str] = []
    if settings.worker_enable_session_reminders:
        jobs.append(JOB_SESSION_REMINDERS)
    if settings.worker_enable_activities_overdue:
        jobs.append(JOB_ACTIVITIES_OVERDUE)
    if settings.worker_enable_activities_dispatch:
        jobs.append(JOB_ACTIVITIES_DISPATCH)
    if settings.worker_enable_forms_dispatch:
        jobs.append(JOB_FORMS_DISPATCH)
    return jobs


def _enqueue_scheduler_jobs(
    queue: WorkerJobQueue,
    *,
    interval_seconds: int,
    now_epoch: float,
) -> dict[str, int]:
    jobs = _configured_scheduler_jobs()
    if len(jobs) == 0:
        return {"enqueued": 0, "replayed": 0}

    bucket = int(now_epoch // max(1, interval_seconds))
    enqueued = 0
    replayed = 0

    for job_type in jobs:
        result = queue.enqueue(
            job_type=job_type,
            payload={},
            idempotency_key=f"{job_type}:{bucket}",
            max_attempts=settings.worker_job_max_attempts,
            trace_id=uuid4().hex,
        )
        if result.replayed:
            replayed += 1
        else:
            enqueued += 1

    return {"enqueued": enqueued, "replayed": replayed}


def _run_job_once(*, job: JobEnvelope) -> dict[str, object]:
    with SessionLocal() as db:
        try:
            result = handle_job(db=db, job=job)
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise


def _drain_ready_jobs(queue: WorkerJobQueue) -> dict[str, int]:
    processed = 0
    acked = 0
    retried = 0
    dead = 0

    max_jobs = max(1, settings.worker_max_jobs_per_cycle)
    timeout_seconds = max(0, settings.worker_job_claim_timeout_seconds)

    for idx in range(max_jobs):
        job = queue.claim_next(timeout_seconds=timeout_seconds if idx == 0 else 0)
        if job is None:
            break

        processed += 1
        try:
            result = _run_job_once(job=job)
            queue.ack(job)
            acked += 1
            logger.info(
                "job_ack job_id=%s type=%s attempt=%s trace_id=%s result=%s",
                job.job_id,
                job.job_type,
                job.attempt,
                job.trace_id,
                result,
            )
        except Exception as exc:
            will_dead_letter = job.attempt + 1 >= job.max_attempts
            queue.retry(job=job, error=str(exc))
            if will_dead_letter:
                dead += 1
            else:
                retried += 1
            logger.warning(
                "job_failed job_id=%s type=%s attempt=%s max_attempts=%s dead_letter=%s error=%s",
                job.job_id,
                job.job_type,
                job.attempt,
                job.max_attempts,
                will_dead_letter,
                exc,
            )

    return {
        "processed": processed,
        "acked": acked,
        "retried": retried,
        "dead": dead,
    }


def run() -> None:
    interval_seconds = max(settings.worker_heartbeat_seconds, 5)
    recovered = job_queue.requeue_processing()

    logger.info(
        "worker_started interval_seconds=%s recovered_processing=%s scheduler_jobs=%s",
        interval_seconds,
        recovered,
        ",".join(_configured_scheduler_jobs()) or "none",
    )

    while True:
        cycle_started = time.time()

        db_ok = check_database()
        redis_ok = check_redis()

        if not db_ok or not redis_ok:
            logger.warning(
                "heartbeat dependencies db=%s redis=%s",
                "ok" if db_ok else "down",
                "ok" if redis_ok else "down",
            )
            time.sleep(interval_seconds)
            continue

        promoted = job_queue.promote_due_retries(now_epoch=cycle_started)
        enqueue_result = _enqueue_scheduler_jobs(
            job_queue,
            interval_seconds=interval_seconds,
            now_epoch=cycle_started,
        )
        drain_result = _drain_ready_jobs(job_queue)
        depth = job_queue.queue_depth()

        logger.info(
            "heartbeat db=ok redis=ok promoted_retries=%s enqueued=%s replayed=%s "
            "processed=%s acked=%s retried=%s dead=%s queue_ready=%s queue_processing=%s "
            "queue_retry=%s queue_dead=%s",
            promoted,
            enqueue_result["enqueued"],
            enqueue_result["replayed"],
            drain_result["processed"],
            drain_result["acked"],
            drain_result["retried"],
            drain_result["dead"],
            depth["ready"],
            depth["processing"],
            depth["retry"],
            depth["dead"],
        )

        elapsed = time.time() - cycle_started
        sleep_seconds = max(0.0, interval_seconds - elapsed)
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)


if __name__ == "__main__":
    run()
