"""Backend pre-start script to wait for database readiness."""

import logging

from sqlmodel import Session, select
from tenacity import after_log, before_log, retry, stop_after_attempt, wait_fixed

from backend.core.db import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

max_tries = 60 * 5  # 5 minutes
wait_seconds = 1


@retry(
    stop=stop_after_attempt(max_tries),
    wait=wait_fixed(wait_seconds),
    before=before_log(logger, logging.INFO),
    after=after_log(logger, logging.WARN),
)
def init(engine) -> None:
    """Wait for database to be ready by attempting a simple query."""
    try:
        with Session(engine) as session:
            # Try to execute a simple query
            session.exec(select(1))
    except Exception as e:
        logger.error(f"Database not ready: {e}")
        raise e


def main() -> None:
    """Main function to initialize database connection."""
    logger.info("Initializing service")
    init(engine)
    logger.info("Service finished initializing")


if __name__ == "__main__":
    main()
