from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"] if settings.ENVIRONMENT != "local" else [],
    enabled=settings.ENVIRONMENT != "local",
)

AUTH_RATE_LIMIT = "5/minute"
AUTH_RATE_LIMIT_BURST = "10/hour"

REFRESH_RATE_LIMIT = "30/minute"

PASSWORD_RESET_RATE_LIMIT = "3/minute"

API_RATE_LIMIT = "100/minute"

AGENT_RATE_LIMIT = "20/minute"
