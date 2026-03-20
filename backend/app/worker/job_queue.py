from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast
from uuid import uuid4

from redis import Redis

from app.core.config import settings
from app.core.redis_client import redis_client


@dataclass(frozen=True)
class EnqueueResult:
    job_id: str
    replayed: bool


@dataclass(frozen=True)
class JobEnvelope:
    job_id: str
    job_type: str
    payload: dict[str, object]
    attempt: int
    max_attempts: int
    enqueued_at: str
    trace_id: str
    idempotency_key: str | None = None
    last_error: str | None = None

    def as_json(self) -> str:
        return json.dumps(
            {
                "job_id": self.job_id,
                "job_type": self.job_type,
                "payload": self.payload,
                "attempt": self.attempt,
                "max_attempts": self.max_attempts,
                "enqueued_at": self.enqueued_at,
                "trace_id": self.trace_id,
                "idempotency_key": self.idempotency_key,
                "last_error": self.last_error,
            },
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )

    @classmethod
    def from_json(cls, raw: str) -> JobEnvelope:
        parsed = json.loads(raw)
        return cls(
            job_id=str(parsed["job_id"]),
            job_type=str(parsed["job_type"]),
            payload=dict(parsed.get("payload") or {}),
            attempt=int(parsed.get("attempt") or 0),
            max_attempts=int(parsed.get("max_attempts") or 1),
            enqueued_at=str(parsed.get("enqueued_at") or datetime.now(UTC).isoformat()),
            trace_id=str(parsed.get("trace_id") or uuid4().hex),
            idempotency_key=(
                str(parsed["idempotency_key"])
                if parsed.get("idempotency_key") is not None
                else None
            ),
            last_error=(
                str(parsed["last_error"]) if parsed.get("last_error") is not None else None
            ),
        )


class WorkerJobQueue:
    def __init__(
        self,
        *,
        redis: Redis = redis_client,
        ready_key: str = "cori:jobs:ready",
        processing_key: str = "cori:jobs:processing",
        retry_key: str = "cori:jobs:retry",
        dead_key: str = "cori:jobs:dead",
        idempotency_prefix: str = "cori:jobs:idempotency:",
    ) -> None:
        self._redis = redis
        self._ready_key = ready_key
        self._processing_key = processing_key
        self._retry_key = retry_key
        self._dead_key = dead_key
        self._idempotency_prefix = idempotency_prefix

    def enqueue(
        self,
        *,
        job_type: str,
        payload: dict[str, object],
        idempotency_key: str | None = None,
        max_attempts: int = 5,
        delay_seconds: int = 0,
        trace_id: str | None = None,
    ) -> EnqueueResult:
        if idempotency_key is not None:
            cached_job_id = cast(
                str | None,
                self._redis.get(self._idempotency_key(idempotency_key)),
            )
            if cached_job_id:
                return EnqueueResult(job_id=cached_job_id, replayed=True)

        job = JobEnvelope(
            job_id=uuid4().hex,
            job_type=job_type,
            payload=payload,
            attempt=0,
            max_attempts=max(1, max_attempts),
            enqueued_at=datetime.now(UTC).isoformat(),
            trace_id=trace_id or uuid4().hex,
            idempotency_key=idempotency_key,
            last_error=None,
        )
        raw = job.as_json()

        if delay_seconds > 0:
            run_at_epoch = time.time() + max(1, delay_seconds)
            self._redis.zadd(self._retry_key, {raw: run_at_epoch})
        else:
            self._redis.lpush(self._ready_key, raw)

        if idempotency_key is not None:
            self._redis.set(
                self._idempotency_key(idempotency_key),
                job.job_id,
                ex=60 * 60 * 24,
                nx=True,
            )
        return EnqueueResult(job_id=job.job_id, replayed=False)

    def promote_due_retries(self, *, now_epoch: float | None = None) -> int:
        now = now_epoch or time.time()
        due_items = cast(
            list[str],
            self._redis.zrangebyscore(self._retry_key, min="-inf", max=now),
        )
        if not due_items:
            return 0
        pipe = self._redis.pipeline(transaction=True)
        for raw in due_items:
            pipe.lpush(self._ready_key, raw)
            pipe.zrem(self._retry_key, raw)
        pipe.execute()
        return len(due_items)

    def claim_next(self, *, timeout_seconds: int = 1) -> JobEnvelope | None:
        if timeout_seconds <= 0:
            raw = cast(
                str | None,
                self._redis.rpoplpush(self._ready_key, self._processing_key),
            )
        else:
            raw = cast(
                str | None,
                self._redis.brpoplpush(
                    self._ready_key,
                    self._processing_key,
                    timeout=timeout_seconds,
                ),
            )
        if raw is None:
            return None
        return JobEnvelope.from_json(raw)

    def requeue_processing(self, *, limit: int = 10_000) -> int:
        moved = 0
        while moved < max(1, limit):
            raw = self._redis.rpoplpush(self._processing_key, self._ready_key)
            if raw is None:
                break
            moved += 1
        return moved

    def ack(self, job: JobEnvelope) -> None:
        self._redis.lrem(self._processing_key, count=1, value=job.as_json())

    def retry(self, *, job: JobEnvelope, error: str) -> None:
        self._redis.lrem(self._processing_key, count=1, value=job.as_json())
        next_attempt = job.attempt + 1
        if next_attempt >= job.max_attempts:
            dead = JobEnvelope(
                job_id=job.job_id,
                job_type=job.job_type,
                payload=job.payload,
                attempt=next_attempt,
                max_attempts=job.max_attempts,
                enqueued_at=job.enqueued_at,
                trace_id=job.trace_id,
                idempotency_key=job.idempotency_key,
                last_error=error,
            )
            self._redis.lpush(self._dead_key, dead.as_json())
            return

        delay_seconds = min(
            settings.worker_retry_backoff_max_seconds,
            settings.worker_retry_backoff_base_seconds * (2**next_attempt),
        )
        scheduled = JobEnvelope(
            job_id=job.job_id,
            job_type=job.job_type,
            payload=job.payload,
            attempt=next_attempt,
            max_attempts=job.max_attempts,
            enqueued_at=job.enqueued_at,
            trace_id=job.trace_id,
            idempotency_key=job.idempotency_key,
            last_error=error,
        )
        self._redis.zadd(self._retry_key, {scheduled.as_json(): time.time() + delay_seconds})

    def queue_depth(self) -> dict[str, int]:
        return {
            "ready": cast(int, self._redis.llen(self._ready_key)),
            "processing": cast(int, self._redis.llen(self._processing_key)),
            "retry": cast(int, self._redis.zcard(self._retry_key)),
            "dead": cast(int, self._redis.llen(self._dead_key)),
        }

    def _idempotency_key(self, value: str) -> str:
        return f"{self._idempotency_prefix}{value}"


job_queue = WorkerJobQueue()
