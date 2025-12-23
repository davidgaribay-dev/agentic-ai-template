"""Pre-built PII detection patterns for guardrails.

These patterns can be used to detect and redact common PII types
in both input and output content.
"""

from typing import ClassVar

# PII type identifiers
PII_TYPES: list[str] = [
    "email",
    "phone",
    "ssn",
    "credit_card",
    "ip_address",
]

# Pre-built regex patterns for common PII types
PII_PATTERNS: dict[str, str] = {
    # Email addresses
    "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    # US phone numbers (various formats)
    "phone": r"\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b",
    # US Social Security Numbers
    "ssn": r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
    # Credit card numbers (16 digits, various formats)
    "credit_card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
    # IPv4 addresses
    "ip_address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
}


class PIIPatternRegistry:
    """Registry for PII patterns with helper methods."""

    _patterns: ClassVar[dict[str, str]] = PII_PATTERNS
    _types: ClassVar[list[str]] = PII_TYPES

    @classmethod
    def get_pattern(cls, pii_type: str) -> str | None:
        """Get the regex pattern for a PII type."""
        return cls._patterns.get(pii_type)

    @classmethod
    def get_patterns_for_types(cls, pii_types: list[str]) -> dict[str, str]:
        """Get patterns for the specified PII types."""
        return {
            pii_type: pattern
            for pii_type, pattern in cls._patterns.items()
            if pii_type in pii_types
        }

    @classmethod
    def get_all_patterns(cls) -> dict[str, str]:
        """Get all registered PII patterns."""
        return cls._patterns.copy()

    @classmethod
    def get_all_types(cls) -> list[str]:
        """Get all supported PII types."""
        return cls._types.copy()
