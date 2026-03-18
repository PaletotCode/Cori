import redis
from redis.exceptions import RedisError

from app.core.config import settings

redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def check_redis() -> bool:
    try:
        return bool(redis_client.ping())
    except RedisError:
        return False
