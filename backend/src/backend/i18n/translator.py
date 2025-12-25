"""Translation service using python-i18n.

Provides translation functionality with JSON file support,
matching the frontend's i18next format.
"""

from pathlib import Path
from typing import ClassVar

import i18n  # type: ignore[import-untyped]

from backend.i18n.config import DEFAULT_LOCALE, SUPPORTED_LOCALE_CODES
from backend.i18n.context import get_locale

# Path to translation files
TRANSLATIONS_DIR = Path(__file__).parent / "translations"


class _TranslationState:
    """Singleton to track translation initialization state.

    Uses class variable to avoid PLW0603 global statement warning.
    """

    initialized: ClassVar[bool] = False


def init_translations() -> None:
    """Initialize the i18n library with our translation files.

    This should be called once at application startup.
    """
    if _TranslationState.initialized:
        return

    # Configure python-i18n
    i18n.set("file_format", "json")
    i18n.set("fallback", DEFAULT_LOCALE)
    i18n.set("enable_memoization", True)
    # Skip the locale root element since our JSON files have flat keys
    i18n.set("skip_locale_root_data", True)
    # Use simple filename format: en.json, es.json, etc.
    i18n.set("filename_format", "{locale}.{format}")

    # Add translation directory to load path
    i18n.load_path.append(str(TRANSLATIONS_DIR))

    _TranslationState.initialized = True


def translate(
    key: str,
    locale: str | None = None,
    **params: str | int | float,
) -> str:
    """Translate a key to the specified locale.

    Uses python-i18n with fallback to default locale.
    Interpolation uses %{variable} syntax in JSON files.

    Args:
        key: The translation key (e.g., "error_auth_failed")
        locale: Target locale code. If None, uses context locale.
        **params: Interpolation parameters (e.g., resource="User")

    Returns:
        Translated string, or the key itself if not found.

    Example:
        translate("error_not_found", "es", resource="Usuario")
        # Returns: "Usuario no encontrado"
    """
    # Ensure translations are loaded
    init_translations()

    # Use provided locale or get from context
    target_locale = locale or get_locale()

    # Validate locale
    if target_locale not in SUPPORTED_LOCALE_CODES:
        target_locale = DEFAULT_LOCALE

    # Set the locale for this translation
    i18n.set("locale", target_locale)

    # Translate with interpolation
    # python-i18n returns the key if translation not found
    result: str = i18n.t(key, **params)
    return result


def translate_with_fallback(
    key: str,
    locale: str | None = None,
    fallback: str | None = None,
    **params: str | int | float,
) -> str:
    """Translate a key with a custom fallback message.

    Args:
        key: The translation key
        locale: Target locale code
        fallback: Fallback message if key not found. If None, returns key.
        **params: Interpolation parameters

    Returns:
        Translated string, fallback, or key if neither found.
    """
    result = translate(key, locale, **params)

    # python-i18n returns the key if not found
    if result == key and fallback is not None:
        return fallback

    return result
