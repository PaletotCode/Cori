from __future__ import annotations

from collections import defaultdict

from app.worker.job_queue import WorkerJobQueue


class _FakePipeline:
    def __init__(self, redis: InMemoryRedis) -> None:
        self._redis = redis
        self._ops: list[tuple[str, tuple[object, ...]]] = []

    def lpush(self, key: str, value: str) -> _FakePipeline:
        self._ops.append(("lpush", (key, value)))
        return self

    def zrem(self, key: str, value: str) -> _FakePipeline:
        self._ops.append(("zrem", (key, value)))
        return self

    def execute(self) -> list[object]:
        results: list[object] = []
        for op, args in self._ops:
            if op == "lpush":
                results.append(self._redis.lpush(args[0], args[1]))
            elif op == "zrem":
                results.append(self._redis.zrem(args[0], args[1]))
        self._ops.clear()
        return results


class InMemoryRedis:
    def __init__(self) -> None:
        self._kv: dict[str, str] = {}
        self._lists: dict[str, list[str]] = defaultdict(list)
        self._zsets: dict[str, dict[str, float]] = defaultdict(dict)

    def get(self, key: str) -> str | None:
        return self._kv.get(key)

    def set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        if nx and key in self._kv:
            return False
        self._kv[key] = value
        return True

    def lpush(self, key: str, value: str) -> int:
        self._lists[key].insert(0, value)
        return len(self._lists[key])

    def rpoplpush(self, src: str, dst: str) -> str | None:
        if len(self._lists[src]) == 0:
            return None
        value = self._lists[src].pop()
        self._lists[dst].insert(0, value)
        return value

    def brpoplpush(self, src: str, dst: str, timeout: int = 1) -> str | None:
        return self.rpoplpush(src, dst)

    def lrem(self, key: str, count: int, value: str) -> int:
        if count <= 0:
            count = len(self._lists[key])
        removed = 0
        remaining: list[str] = []
        for item in self._lists[key]:
            if item == value and removed < count:
                removed += 1
                continue
            remaining.append(item)
        self._lists[key] = remaining
        return removed

    def llen(self, key: str) -> int:
        return len(self._lists[key])

    def zadd(self, key: str, mapping: dict[str, float]) -> int:
        created = 0
        for member, score in mapping.items():
            if member not in self._zsets[key]:
                created += 1
            self._zsets[key][member] = float(score)
        return created

    def zrangebyscore(self, key: str, min: str | float, max: str | float) -> list[str]:
        del min
        max_value = float(max)
        members = [member for member, score in self._zsets[key].items() if score <= max_value]
        return sorted(members, key=lambda member: self._zsets[key][member])

    def zrem(self, key: str, member: str) -> int:
        if member not in self._zsets[key]:
            return 0
        del self._zsets[key][member]
        return 1

    def zcard(self, key: str) -> int:
        return len(self._zsets[key])

    def pipeline(self, transaction: bool = True) -> _FakePipeline:
        del transaction
        return _FakePipeline(self)


def _make_queue(redis: InMemoryRedis) -> WorkerJobQueue:
    return WorkerJobQueue(
        redis=redis,
        ready_key="ready",
        processing_key="processing",
        retry_key="retry",
        dead_key="dead",
        idempotency_prefix="idem:",
    )


def test_enqueue_is_idempotent_by_key() -> None:
    redis = InMemoryRedis()
    queue = _make_queue(redis)

    first = queue.enqueue(
        job_type="scheduler.activities_dispatch",
        payload={"tenant_id": "tenant-001"},
        idempotency_key="dispatch:tenant-001:bucket-1",
    )
    replay = queue.enqueue(
        job_type="scheduler.activities_dispatch",
        payload={"tenant_id": "tenant-001"},
        idempotency_key="dispatch:tenant-001:bucket-1",
    )

    assert first.replayed is False
    assert replay.replayed is True
    assert replay.job_id == first.job_id
    assert queue.queue_depth()["ready"] == 1


def test_retry_promotes_and_moves_to_dead_letter() -> None:
    redis = InMemoryRedis()
    queue = _make_queue(redis)

    queue.enqueue(
        job_type="scheduler.forms_dispatch",
        payload={},
        max_attempts=2,
    )

    first_claim = queue.claim_next(timeout_seconds=0)
    assert first_claim is not None

    queue.retry(job=first_claim, error="db-timeout")
    assert queue.queue_depth()["processing"] == 0
    assert queue.queue_depth()["retry"] == 1

    promoted = queue.promote_due_retries(now_epoch=10_000_000_000)
    assert promoted == 1

    second_claim = queue.claim_next(timeout_seconds=0)
    assert second_claim is not None
    assert second_claim.attempt == 1

    queue.retry(job=second_claim, error="db-timeout-again")
    assert queue.queue_depth()["dead"] == 1
    assert queue.queue_depth()["retry"] == 0
    assert queue.queue_depth()["processing"] == 0


def test_requeue_processing_recovers_abandoned_jobs() -> None:
    redis = InMemoryRedis()
    queue = _make_queue(redis)

    queue.enqueue(job_type="job.a", payload={})
    queue.enqueue(job_type="job.b", payload={})

    claimed = queue.claim_next(timeout_seconds=0)
    assert claimed is not None
    assert queue.queue_depth()["processing"] == 1

    moved = queue.requeue_processing()
    assert moved == 1
    assert queue.queue_depth()["processing"] == 0
    assert queue.queue_depth()["ready"] == 2
