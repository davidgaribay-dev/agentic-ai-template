"""Request-scoped locale context using contextvars.

This module provides a thread-safe way to access the current locale
for any request, similar to how structlog uses contextvars for request_id.

Note: We use both contextvars (for async code) and a request-scoped
state dict (for sync dependencies that run in threadpools).
"""

from contextvars import ContextVar, Token
from typing import Any

from backend.i18n.config import DEFAULT_LOCALE

# Context variable for the current locale (works in async code)
_locale_context: ContextVar[str] = ContextVar("locale", default=DEFAULT_LOCALE)

# Request state reference for cross-thread communication
# This is set by middleware to point to request.scope["state"]
_request_state: ContextVar[dict[str, Any] | None] = ContextVar(
    "request_state", default=None
)

# Key used in request state for locale
LOCALE_STATE_KEY = "_i18n_locale"


def get_locale() -> str:
    """Get the current request's locale.

    First checks request state (for sync dependency updates),
    then falls back to contextvar, then DEFAULT_LOCALE.
    """
    # Check request state first (updated by sync dependencies)
    state = _request_state.get()
    if state is not None and LOCALE_STATE_KEY in state:
        locale_value = state[LOCALE_STATE_KEY]
        if isinstance(locale_value, str):
            return locale_value

    # Fall back to contextvar
    return _locale_context.get()


def set_locale(locale: str) -> Token[str]:
    """Set the locale for the current request context.

    Updates both the contextvar (for async code) and request state
    (for visibility across threads).

    Args:
        locale: The BCP 47 locale code (e.g., "en", "es", "zh")

    Returns:
        Token that can be used with reset_locale to restore previous value.
    """
    # Update request state if available (visible to middleware)
    state = _request_state.get()
    if state is not None:
        state[LOCALE_STATE_KEY] = locale

    # Also set contextvar
    return _locale_context.set(locale)


def reset_locale(token: Token[str]) -> None:
    """Reset the locale to its previous value.

    Args:
        token: The token returned from set_locale.
    """
    _locale_context.reset(token)


def set_request_state(state: dict[str, Any] | None) -> Token[dict[str, Any] | None]:
    """Set the request state reference for cross-thread locale sharing.

    Called by middleware to establish the shared state dict.

    Args:
        state: The request.scope["state"] dict, or None to clear.

    Returns:
        Token for resetting.
    """
    return _request_state.set(state)
