from __future__ import annotations

from typing import TYPE_CHECKING, Any

from backend.core.config import settings
from backend.core.logging import get_logger

if TYPE_CHECKING:
    from langfuse.langchain import CallbackHandler

logger = get_logger(__name__)

_langfuse_initialized = False


def init_langfuse() -> bool:
    """Initialize the Langfuse client singleton.

    Call this once during application startup. Langfuse v3 uses a singleton
    pattern where credentials are set once, then accessed via get_client().

    Returns:
        True if initialization succeeded, False otherwise
    """
    global _langfuse_initialized

    if not settings.langfuse_enabled:
        logger.debug("langfuse_disabled", reason="missing_configuration")
        return False

    if _langfuse_initialized:
        return True

    try:
        from langfuse import Langfuse

        # Note: Langfuse v3 uses base_url instead of host
        Langfuse(
            public_key=settings.LANGFUSE_PUBLIC_KEY,
            secret_key=settings.LANGFUSE_SECRET_KEY,
            base_url=settings.langfuse_base_url,
        )

        _langfuse_initialized = True
        logger.info(
            "langfuse_initialized",
            base_url=settings.langfuse_base_url,
        )
        return True

    except ImportError:
        logger.warning(
            "langfuse_import_error",
            message="langfuse package not installed, tracing disabled",
        )
        return False
    except Exception as e:
        logger.error(
            "langfuse_init_error",
            error=str(e),
            message="Failed to initialize Langfuse client",
        )
        return False


def get_langfuse_handler() -> CallbackHandler | None:
    if not settings.langfuse_enabled:
        return None

    # Ensure client is initialized
    if not _langfuse_initialized:
        if not init_langfuse():
            return None

    try:
        from langfuse.langchain import CallbackHandler

        handler = CallbackHandler()
        logger.debug("langfuse_handler_created")
        return handler

    except ImportError:
        logger.warning(
            "langfuse_import_error",
            message="langfuse or langchain package not installed",
        )
        return None
    except Exception as e:
        logger.error(
            "langfuse_handler_error",
            error=str(e),
            message="Failed to create Langfuse handler",
        )
        return None


def build_langfuse_config(
    user_id: str | None = None,
    session_id: str | None = None,
    org_id: str | None = None,
    team_id: str | None = None,
    provider: str | None = None,
    existing_config: dict | None = None,
) -> dict[str, Any]:
    """Build a LangGraph config dict with Langfuse callback handler.

    This is a convenience function that creates the full config dict
    needed for agent.ainvoke() or agent.astream_events(), including
    the Langfuse callback handler and metadata if enabled.

    In Langfuse v3, trace attributes are passed via metadata fields
    prefixed with 'langfuse_'.

    Args:
        user_id: Optional user identifier
        session_id: Optional session/thread ID (used for both Langfuse and checkpointer)
        org_id: Optional organization ID (added to tags)
        team_id: Optional team ID (added to tags)
        provider: Optional LLM provider name (added to tags)
        existing_config: Optional existing config dict to extend

    Returns:
        Config dict with callbacks list, metadata, and configurable thread_id

    Example:
        ```python
        config = build_langfuse_config(
            user_id=str(current_user.id),
            session_id=thread_id,
            org_id=org.id,
        )
        async for event in agent.astream_events(input, config=config):
            ...
        ```
    """
    config: dict[str, Any] = dict(existing_config) if existing_config else {}

    if session_id:
        if "configurable" not in config:
            config["configurable"] = {}
        config["configurable"]["thread_id"] = session_id

    handler = get_langfuse_handler()
    if handler:
        if "callbacks" not in config:
            config["callbacks"] = []
        config["callbacks"].append(handler)

        if "metadata" not in config:
            config["metadata"] = {}

        if user_id:
            config["metadata"]["langfuse_user_id"] = user_id
        if session_id:
            config["metadata"]["langfuse_session_id"] = session_id

        tags = []
        if provider:
            tags.append(f"provider:{provider}")
        if org_id:
            tags.append(f"org:{org_id}")
        if team_id:
            tags.append(f"team:{team_id}")
        if tags:
            config["metadata"]["langfuse_tags"] = tags

        if org_id:
            config["metadata"]["org_id"] = org_id
        if team_id:
            config["metadata"]["team_id"] = team_id

    return config


def flush_langfuse() -> None:
    """Flush any pending Langfuse events.

    Call this during application shutdown to ensure all traces are sent.
    """
    if not settings.langfuse_enabled or not _langfuse_initialized:
        return

    try:
        from langfuse import get_client

        client = get_client()
        client.flush()
        logger.info("langfuse_flushed")
    except Exception as e:
        logger.error("langfuse_flush_error", error=str(e))


def shutdown_langfuse() -> None:
    """Shutdown the Langfuse client.

    Call this during application shutdown after flushing.
    """
    global _langfuse_initialized

    if not _langfuse_initialized:
        return

    try:
        from langfuse import get_client

        client = get_client()
        client.shutdown()
        _langfuse_initialized = False
        logger.info("langfuse_shutdown")
    except Exception as e:
        logger.error("langfuse_shutdown_error", error=str(e))


def check_langfuse_connection() -> bool:
    """Check if Langfuse connection is working.

    This also initializes the client if not already done.

    Returns:
        True if connection is successful, False otherwise
    """
    if not settings.langfuse_enabled:
        return False

    if not _langfuse_initialized:
        if not init_langfuse():
            return False

    try:
        from langfuse import get_client

        client = get_client()
        return client.auth_check()
    except Exception as e:
        logger.error("langfuse_auth_check_failed", error=str(e))
        return False
