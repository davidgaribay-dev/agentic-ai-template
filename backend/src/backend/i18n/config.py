"""i18n configuration and supported languages.

Matches the frontend's supported languages for consistency.
"""

from typing import NamedTuple


class SupportedLocale(NamedTuple):
    """A supported locale with its metadata."""

    code: str
    name: str
    native_name: str


# Supported languages - matches frontend/src/locales/i18n.ts
SUPPORTED_LOCALES: tuple[SupportedLocale, ...] = (
    SupportedLocale("en", "English", "English"),
    SupportedLocale("es", "Spanish", "Español"),
    SupportedLocale("zh", "Chinese", "中文"),
    SupportedLocale("hi", "Hindi", "हिन्दी"),
    SupportedLocale("ru", "Russian", "Русский"),
    SupportedLocale("uk", "Ukrainian", "Українська"),
    SupportedLocale("fr", "French", "Français"),
    SupportedLocale("ar", "Arabic", "العربية"),
    SupportedLocale("bn", "Bengali", "বাংলা"),
    SupportedLocale("pt", "Portuguese", "Português"),
    SupportedLocale("ja", "Japanese", "日本語"),
)

# Set of valid locale codes for fast lookup
SUPPORTED_LOCALE_CODES: frozenset[str] = frozenset(
    loc.code for loc in SUPPORTED_LOCALES
)

# Default locale when none specified
DEFAULT_LOCALE = "en"


def is_supported_locale(code: str) -> bool:
    """Check if a locale code is supported."""
    return code in SUPPORTED_LOCALE_CODES


def normalize_locale(code: str) -> str:
    """Normalize a locale code to a supported code.

    Handles cases like:
    - "en-US" -> "en"
    - "zh-CN" -> "zh"
    - "pt-BR" -> "pt"

    Returns DEFAULT_LOCALE if no match found.
    """
    if not code:
        return DEFAULT_LOCALE

    # Exact match
    if code in SUPPORTED_LOCALE_CODES:
        return code

    # Try base language (before hyphen)
    base = code.split("-")[0].lower()
    if base in SUPPORTED_LOCALE_CODES:
        return base

    return DEFAULT_LOCALE
