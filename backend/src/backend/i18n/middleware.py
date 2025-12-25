"""Locale middleware for Accept-Language header parsing.

Sets the request locale in context based on:
1. Accept-Language header
2. User's language preference (if authenticated)
3. DEFAULT_LANGUAGE setting

Uses pure ASGI middleware to avoid BaseHTTPMiddleware's contextvars issues.
See: https://github.com/encode/starlette/discussions/1729

Cross-thread communication:
Since FastAPI runs sync dependencies (like get_current_user) in a threadpool,
contextvars changes made there aren't visible to async code. We use request
scope state as a shared dict that both threads can access.
"""

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.i18n.config import DEFAULT_LOCALE, normalize_locale
from backend.i18n.context import (
    LOCALE_STATE_KEY,
    reset_locale,
    set_locale,
    set_request_state,
)


def parse_accept_language(header: str | None) -> str | None:
    """Parse Accept-Language header and return the best matching locale.

    Handles formats like:
    - "en-US,en;q=0.9,es;q=0.8"
    - "fr"
    - "zh-CN"

    Args:
        header: The Accept-Language header value

    Returns:
        The best matching supported locale code, or None if no match.
    """
    if not header:
        return None

    # Parse language tags with quality values
    languages: list[tuple[str, float]] = []

    for raw_part in header.split(","):
        part = raw_part.strip()
        if not part:
            continue

        # Split by semicolon for quality value
        if ";" in part:
            lang, quality_part = part.split(";", 1)
            lang = lang.strip()
            # Parse q=0.9 format
            try:
                q_value = float(quality_part.strip().split("=")[1])
            except (IndexError, ValueError):
                q_value = 1.0
        else:
            lang = part
            q_value = 1.0

        languages.append((lang, q_value))

    # Sort by quality value (highest first)
    languages.sort(key=lambda x: x[1], reverse=True)

    # Find first supported language
    for lang, _ in languages:
        normalized = normalize_locale(lang)
        if normalized != DEFAULT_LOCALE or lang.lower().startswith("en"):
            return normalized

    return None


class LocaleMiddleware:
    """Pure ASGI middleware to set request locale from Accept-Language header.

    Also adds Content-Language header to responses.

    Uses pure ASGI instead of BaseHTTPMiddleware to properly support
    contextvars propagation from route handlers back to middleware.

    Important: We capture the final locale when the response starts (before
    sending headers) rather than in a finally block, because the response
    may be sent before the finally block runs.
    """

    def __init__(
        self,
        app: ASGIApp,
        default_locale: str = DEFAULT_LOCALE,
    ) -> None:
        self.app = app
        self.default_locale = default_locale

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """ASGI interface."""
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Parse Accept-Language header
        headers: dict[bytes, bytes] = dict(scope.get("headers", []))
        accept_language = headers.get(b"accept-language", b"").decode("utf-8", "ignore")
        locale = parse_accept_language(accept_language) or self.default_locale

        # Set locale in contextvar
        token = set_locale(locale)

        # Ensure scope has a state dict for cross-thread communication
        # This allows sync dependencies (running in threadpool) to update locale
        if "state" not in scope:
            scope["state"] = {}

        # Store initial locale in scope state
        scope["state"][LOCALE_STATE_KEY] = locale

        # Set request state reference in contextvar for cross-thread access
        # Note: We don't use the token since we just set to None in finally
        set_request_state(scope["state"])

        async def send_with_locale(message: Message) -> None:
            """Wrapper to add Content-Language header to response."""
            if message["type"] == "http.response.start":
                # Read locale from scope state (may have been updated by sync deps)
                # This works because scope["state"] is a shared dict
                current_locale = scope["state"].get(LOCALE_STATE_KEY, locale)

                # Add Content-Language header
                response_headers = MutableHeaders(raw=list(message.get("headers", [])))
                response_headers["Content-Language"] = current_locale
                message["headers"] = response_headers.raw

            await send(message)

        try:
            await self.app(scope, receive, send_with_locale)
        finally:
            # Reset context
            set_request_state(None)
            reset_locale(token)
