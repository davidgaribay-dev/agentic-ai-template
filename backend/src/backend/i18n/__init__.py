"""Backend internationalization (i18n) module.

Provides translation services for API responses, audit logs, and emails.
Supports 11 languages with Accept-Language header parsing and user preferences.

Uses python-i18n library with JSON translation files for consistency
with the frontend's i18next format.
"""

from backend.i18n.config import (
    DEFAULT_LOCALE,
    SUPPORTED_LOCALE_CODES,
    SUPPORTED_LOCALES,
    SupportedLocale,
    is_supported_locale,
    normalize_locale,
)
from backend.i18n.context import get_locale, reset_locale, set_locale
from backend.i18n.middleware import LocaleMiddleware, parse_accept_language
from backend.i18n.translator import (
    init_translations,
    translate,
    translate_with_fallback,
)

__all__ = [
    "DEFAULT_LOCALE",
    "SUPPORTED_LOCALES",
    "SUPPORTED_LOCALE_CODES",
    "LocaleMiddleware",
    "SupportedLocale",
    "get_locale",
    "init_translations",
    "is_supported_locale",
    "normalize_locale",
    "parse_accept_language",
    "reset_locale",
    "set_locale",
    "translate",
    "translate_with_fallback",
]
