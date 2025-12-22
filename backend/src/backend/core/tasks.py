"""Utilities for safe async task management.

Provides wrappers for background tasks that ensure:
- Errors are logged rather than silently swallowed
- Tasks can be tracked and monitored
- Cleanup happens properly on cancellation
"""

import asyncio
from collections.abc import Awaitable, Callable, Coroutine
from typing import Any, TypeVar

from backend.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


def create_safe_task(
    coro: Coroutine[Any, Any, T],
    task_name: str,
    on_success: Callable[[T], None] | None = None,
    on_error: Callable[[Exception], None] | None = None,
) -> asyncio.Task[T | None]:
    """Create a background task with proper error handling.

    Unlike raw asyncio.create_task(), this wrapper:
    - Logs all errors with full context instead of silently failing
    - Handles CancelledError gracefully
    - Optionally calls callbacks on success/error
    - Names the task for easier debugging

    Args:
        coro: The coroutine to run
        task_name: Descriptive name for logging and debugging
        on_success: Optional callback with the result on success
        on_error: Optional callback with the exception on failure

    Returns:
        The created asyncio.Task

    Example:
        create_safe_task(
            extract_memories(conv_id, messages),
            task_name=f"memory_extraction_{conv_id}",
            on_error=lambda e: audit_log.error("extraction_failed", error=str(e))
        )
    """

    async def wrapped() -> T | None:
        try:
            result = await coro
            if on_success:
                try:
                    on_success(result)
                except Exception as callback_error:
                    logger.warning(
                        "background_task_success_callback_failed",
                        task=task_name,
                        error=str(callback_error),
                    )
            logger.debug("background_task_completed", task=task_name)
            return result
        except asyncio.CancelledError:
            logger.info("background_task_cancelled", task=task_name)
            raise
        except Exception as e:
            logger.exception(
                "background_task_failed",
                task=task_name,
                error=str(e),
                error_type=type(e).__name__,
            )
            if on_error:
                try:
                    on_error(e)
                except Exception as callback_error:
                    logger.warning(
                        "background_task_error_callback_failed",
                        task=task_name,
                        original_error=str(e),
                        callback_error=str(callback_error),
                    )
            return None

    task = asyncio.create_task(wrapped(), name=task_name)
    logger.debug("background_task_created", task=task_name)
    return task


async def run_with_timeout(
    coro: Awaitable[T],
    timeout_seconds: float,
    operation_name: str,
) -> T:
    """Run a coroutine with a timeout.

    Args:
        coro: The coroutine to run
        timeout_seconds: Maximum time to wait
        operation_name: Name for error messages

    Returns:
        The result of the coroutine

    Raises:
        TimeoutError: If the operation times out (from core.exceptions)
    """
    from backend.core.exceptions import TimeoutError as AppTimeoutError

    try:
        return await asyncio.wait_for(coro, timeout=timeout_seconds)
    except asyncio.TimeoutError:
        raise AppTimeoutError(operation_name, timeout_seconds)


async def gather_with_errors(
    *coros: Awaitable[T],
    return_exceptions: bool = False,
) -> list[T | BaseException]:
    """Gather coroutines and handle errors consistently.

    Like asyncio.gather but with better error handling:
    - Logs all exceptions
    - Returns exceptions in results if return_exceptions=True
    - Re-raises first exception if return_exceptions=False

    Args:
        *coros: Coroutines to run concurrently
        return_exceptions: If True, return exceptions instead of raising

    Returns:
        List of results (and exceptions if return_exceptions=True)
    """
    results = await asyncio.gather(*coros, return_exceptions=True)

    exceptions = [r for r in results if isinstance(r, BaseException)]
    if exceptions:
        for exc in exceptions:
            logger.warning(
                "gather_task_failed",
                error=str(exc),
                error_type=type(exc).__name__,
            )

        if not return_exceptions:
            raise exceptions[0]

    return results


class TaskGroup:
    """Context manager for managing a group of related background tasks.

    Ensures all tasks in the group are properly cancelled and awaited
    when the context exits, preventing orphaned tasks.

    Example:
        async with TaskGroup("memory_extraction") as group:
            group.create_task(extract_memories(conv1), "conv1")
            group.create_task(extract_memories(conv2), "conv2")
        # All tasks completed or cancelled when exiting
    """

    def __init__(self, group_name: str):
        self.group_name = group_name
        self._tasks: list[asyncio.Task] = []

    async def __aenter__(self) -> "TaskGroup":
        logger.debug("task_group_started", group=self.group_name)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        # Cancel all pending tasks
        for task in self._tasks:
            if not task.done():
                task.cancel()

        # Wait for all tasks to complete (or be cancelled)
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)

        completed = sum(1 for t in self._tasks if t.done() and not t.cancelled())
        cancelled = sum(1 for t in self._tasks if t.cancelled())
        logger.debug(
            "task_group_finished",
            group=self.group_name,
            total=len(self._tasks),
            completed=completed,
            cancelled=cancelled,
        )

    def create_task(
        self,
        coro: Coroutine[Any, Any, T],
        task_name: str,
    ) -> asyncio.Task[T | None]:
        """Create a task within this group."""
        full_name = f"{self.group_name}:{task_name}"
        task = create_safe_task(coro, full_name)
        self._tasks.append(task)
        return task
