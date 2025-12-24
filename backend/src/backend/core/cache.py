"""Request-scoped and TTL-based caching utilities.

Provides caching for frequently accessed data:
- Request-scoped cache: Data cached for duration of a single request
- TTL cache: Data cached with time-based expiration
"""

from collections import OrderedDict
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from functools import wraps
from typing import Any, TypeVar

from backend.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")

# Maximum size for request-scoped cache to prevent memory DoS
REQUEST_CACHE_MAX_SIZE = 1000

_request_cache: ContextVar[OrderedDict[str, Any] | None] = ContextVar(
    "_request_cache", default=None
)


def get_request_cache() -> OrderedDict[str, Any]:
    """Get or create the request-scoped cache.

    Returns an empty OrderedDict if called outside of a request context.
    Uses OrderedDict for LRU-style eviction when max size is reached.
    """
    cache = _request_cache.get()
    if cache is None:
        cache = OrderedDict()
        _request_cache.set(cache)
    return cache


def _set_cache_with_limit(cache: OrderedDict[str, Any], key: str, value: Any) -> None:
    """Set a cache value, evicting oldest entries if max size is exceeded."""
    if key in cache:
        # Move to end (most recently used)
        cache.move_to_end(key)
        cache[key] = value
    else:
        # New entry
        cache[key] = value
        # Evict oldest entries if we exceed max size
        while len(cache) > REQUEST_CACHE_MAX_SIZE:
            evicted_key, _ = cache.popitem(last=False)
            logger.debug("request_cache_evicted", key=evicted_key)


def clear_request_cache() -> None:
    """Clear the request-scoped cache.

    Should be called at the end of each request.
    """
    _request_cache.set(None)


def request_cached(
    key_func: Callable[..., str],
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for request-scoped caching.

    Caches the result of an async function for the duration of a request.
    Same key = same cached value within the request.

    Args:
        key_func: Function that takes the same args as the decorated function
                  and returns a cache key string.

    Usage:
        @request_cached(lambda org_id, team_id, user_id: f"settings:{org_id}:{team_id}:{user_id}")
        async def get_effective_settings(org_id: UUID, team_id: UUID | None, user_id: UUID):
            # Expensive database lookup
            ...
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            cache = get_request_cache()
            key = key_func(*args, **kwargs)

            if key in cache:
                # Move to end for LRU ordering
                cache.move_to_end(key)
                logger.debug("request_cache_hit", key=key)
                return cache[key]

            result = await func(*args, **kwargs)  # type: ignore[misc]
            _set_cache_with_limit(cache, key, result)
            logger.debug("request_cache_miss", key=key)
            return result

        return wrapper  # type: ignore[return-value]

    return decorator


def request_cached_sync(
    key_func: Callable[..., str],
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for request-scoped caching (sync version).

    Same as request_cached but for synchronous functions.
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            cache = get_request_cache()
            key = key_func(*args, **kwargs)

            if key in cache:
                # Move to end for LRU ordering
                cache.move_to_end(key)
                logger.debug("request_cache_hit", key=key)
                return cache[key]

            result = func(*args, **kwargs)
            _set_cache_with_limit(cache, key, result)
            logger.debug("request_cache_miss", key=key)
            return result

        return wrapper

    return decorator


@dataclass
class CachedValue:
    """A value with expiration time."""

    value: Any
    expires_at: datetime


@dataclass
class TTLCache:
    """Simple TTL-based cache with manual expiration.

    Thread-safe for read/write operations.
    Does not automatically evict expired entries - they are cleaned
    on access or when explicitly cleared.
    """

    ttl_seconds: int = 300  # 5 minutes default
    _cache: dict[str, CachedValue] = field(default_factory=dict)

    def get(self, key: str) -> Any | None:
        """Get a value from cache if it exists and hasn't expired."""
        cached = self._cache.get(key)
        if cached is None:
            return None

        if datetime.now(UTC) > cached.expires_at:
            # Expired, remove and return None
            del self._cache[key]
            logger.debug("ttl_cache_expired", key=key)
            return None

        logger.debug("ttl_cache_hit", key=key)
        return cached.value

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        """Set a value in the cache with optional custom TTL."""
        ttl = ttl_seconds if ttl_seconds is not None else self.ttl_seconds
        expires_at = datetime.now(UTC) + timedelta(seconds=ttl)
        self._cache[key] = CachedValue(value=value, expires_at=expires_at)
        logger.debug("ttl_cache_set", key=key, ttl=ttl)

    def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        self._cache.pop(key, None)
        logger.debug("ttl_cache_deleted", key=key)

    def clear(self) -> None:
        """Clear all entries from the cache."""
        self._cache.clear()
        logger.debug("ttl_cache_cleared")

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        now = datetime.now(UTC)
        expired_keys = [k for k, v in self._cache.items() if now > v.expires_at]
        for key in expired_keys:
            del self._cache[key]
        if expired_keys:
            logger.debug("ttl_cache_cleanup", removed=len(expired_keys))
        return len(expired_keys)


class CachingWrapper:
    """Wraps a service/function with TTL caching.

    Useful for caching external service calls like Infisical secrets.
    """

    def __init__(self, ttl_seconds: int = 300):
        self._cache = TTLCache(ttl_seconds=ttl_seconds)

    def cached(
        self, key_func: Callable[..., str]
    ) -> Callable[[Callable[..., T]], Callable[..., T]]:
        """Decorator for caching async function results with TTL."""

        def decorator(func: Callable[..., T]) -> Callable[..., T]:
            @wraps(func)
            async def wrapper(*args: Any, **kwargs: Any) -> Any:
                key = key_func(*args, **kwargs)
                cached_value = self._cache.get(key)
                if cached_value is not None:
                    return cached_value

                result = await func(*args, **kwargs)  # type: ignore[misc]
                if result is not None:  # Don't cache None values
                    self._cache.set(key, result)
                return result

            return wrapper  # type: ignore[return-value]

        return decorator

    def invalidate(self, key: str) -> None:
        """Invalidate a specific cache entry."""
        self._cache.delete(key)

    def clear(self) -> None:
        """Clear all cached entries."""
        self._cache.clear()


# Global cache instances for common use cases
settings_cache = TTLCache(ttl_seconds=60)  # 1 minute for settings
secrets_cache = TTLCache(ttl_seconds=300)  # 5 minutes for secrets
