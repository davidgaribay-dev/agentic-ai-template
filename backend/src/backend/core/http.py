"""HTTP client utilities with built-in timeout and retry support.

Provides pre-configured HTTP clients for external service calls,
ensuring consistent timeout and error handling across the application.
"""

import asyncio
import builtins
import random
from typing import Any, TypeVar

import httpx

from backend.core.exceptions import ExternalServiceError, TimeoutError
from backend.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


DEFAULT_TIMEOUT = httpx.Timeout(
    connect=5.0,  # Connection timeout
    read=30.0,  # Read timeout
    write=10.0,  # Write timeout
    pool=5.0,  # Pool timeout
)

# Longer timeout for LLM/streaming operations
LLM_TIMEOUT = httpx.Timeout(
    connect=5.0,
    read=120.0,  # LLM responses can take time
    write=10.0,
    pool=5.0,
)

# Short timeout for health checks
HEALTH_CHECK_TIMEOUT = httpx.Timeout(
    connect=2.0,
    read=5.0,
    write=2.0,
    pool=2.0,
)


def create_http_client(
    timeout: httpx.Timeout | None = None,
    **kwargs: Any,
) -> httpx.AsyncClient:
    """Create an async HTTP client with sensible defaults.

    Args:
        timeout: Custom timeout configuration. Defaults to DEFAULT_TIMEOUT.
        **kwargs: Additional arguments passed to AsyncClient.

    Returns:
        Configured AsyncClient instance.

    Usage:
        async with create_http_client() as client:
            response = await client.get("https://api.example.com/data")
    """
    return httpx.AsyncClient(
        timeout=timeout or DEFAULT_TIMEOUT,
        follow_redirects=True,
        **kwargs,
    )


async def fetch_with_timeout(
    url: str,
    method: str = "GET",
    timeout_seconds: float = 30.0,
    service_name: str = "external service",
    **kwargs: Any,
) -> httpx.Response:
    """Fetch a URL with explicit timeout and error handling.

    Args:
        url: URL to fetch
        method: HTTP method (GET, POST, etc.)
        timeout_seconds: Total timeout for the request
        service_name: Name for error messages
        **kwargs: Additional arguments for the request

    Returns:
        HTTP response

    Raises:
        TimeoutError: If request times out
        ExternalServiceError: If request fails
    """
    try:
        async with create_http_client() as client:
            return await asyncio.wait_for(
                client.request(method, url, **kwargs),
                timeout=timeout_seconds,
            )
    except builtins.TimeoutError as err:
        logger.warning("http_request_timeout", url=url, timeout=timeout_seconds)
        raise TimeoutError(f"Request to {service_name}", timeout_seconds) from err
    except httpx.RequestError as e:
        logger.warning("http_request_failed", url=url, error=str(e))
        raise ExternalServiceError(service_name, str(e)) from e


async def fetch_json(
    url: str,
    method: str = "GET",
    timeout_seconds: float = 30.0,
    service_name: str = "external service",
    **kwargs: Any,
) -> dict[str, Any]:
    """Fetch JSON from a URL with error handling.

    Args:
        url: URL to fetch
        method: HTTP method
        timeout_seconds: Total timeout
        service_name: Name for error messages
        **kwargs: Additional request arguments

    Returns:
        Parsed JSON response

    Raises:
        TimeoutError: If request times out
        ExternalServiceError: If request fails or response is not valid JSON
    """
    response = await fetch_with_timeout(
        url, method, timeout_seconds, service_name, **kwargs
    )

    try:
        response.raise_for_status()
        result: dict[str, Any] = response.json()
    except httpx.HTTPStatusError as e:
        logger.warning(
            "http_status_error",
            url=url,
            status=e.response.status_code,
        )
        raise ExternalServiceError(
            service_name, f"HTTP {e.response.status_code}"
        ) from e
    except ValueError as e:
        logger.warning("http_invalid_json", url=url, error=str(e))
        raise ExternalServiceError(service_name, "Invalid JSON response") from e
    else:
        return result


class RetryConfig:
    """Configuration for retry behavior."""

    def __init__(
        self,
        max_attempts: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 30.0,
        exponential_base: float = 2.0,
        retry_on_status: set[int] | None = None,
    ):
        self.max_attempts = max_attempts
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.retry_on_status = retry_on_status or {429, 500, 502, 503, 504}


async def fetch_with_retry(
    url: str,
    method: str = "GET",
    service_name: str = "external service",
    retry_config: RetryConfig | None = None,
    **kwargs: Any,
) -> httpx.Response:
    """Fetch with exponential backoff retry.

    Args:
        url: URL to fetch
        method: HTTP method
        service_name: Name for error messages
        retry_config: Retry configuration
        **kwargs: Additional request arguments

    Returns:
        HTTP response

    Raises:
        ExternalServiceError: If all retries fail
    """
    config = retry_config or RetryConfig()
    last_error: Exception | None = None

    for attempt in range(config.max_attempts):
        try:
            async with create_http_client() as client:
                response = await client.request(method, url, **kwargs)

                # Check if we should retry on this status
                if (
                    response.status_code in config.retry_on_status
                    and attempt < config.max_attempts - 1
                ):
                    base_delay = min(
                        config.initial_delay * (config.exponential_base**attempt),
                        config.max_delay,
                    )
                    # Add jitter to prevent thundering herd on failures
                    jitter = random.uniform(0, base_delay * 0.1)
                    delay = base_delay + jitter
                    logger.info(
                        "http_retry",
                        url=url,
                        attempt=attempt + 1,
                        status=response.status_code,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue

                return response

        except (httpx.RequestError, TimeoutError) as e:
            last_error = e
            if attempt < config.max_attempts - 1:
                base_delay = min(
                    config.initial_delay * (config.exponential_base**attempt),
                    config.max_delay,
                )
                # Add jitter to prevent thundering herd on failures
                jitter = random.uniform(0, base_delay * 0.1)
                delay = base_delay + jitter
                logger.info(
                    "http_retry_error",
                    url=url,
                    attempt=attempt + 1,
                    error=str(e),
                    delay=delay,
                )
                await asyncio.sleep(delay)
            else:
                logger.warning(
                    "http_all_retries_failed",
                    url=url,
                    attempts=config.max_attempts,
                    last_error=str(e),
                )

    raise ExternalServiceError(
        service_name,
        f"Failed after {config.max_attempts} attempts: {last_error}",
    )
