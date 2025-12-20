import structlog
from typing import Literal

from backend.core.config import settings

logger = structlog.get_logger()

# Supported LLM providers
LLMProvider = Literal["openai", "anthropic", "google"]
SUPPORTED_PROVIDERS: list[LLMProvider] = ["openai", "anthropic", "google"]


class SecretsService:
    """Service for managing LLM API keys via Infisical.

    Provides secure storage for API keys with team-level scoping
    and organization-level fallback for enterprise cost tracking.

    Fallback chain (priority order):
    1. Team-level key (highest priority)
    2. Org-level key
    3. Environment variable (backward compatible)
    """

    def __init__(self):
        self._client = None
        self._initialized = False

    def _ensure_initialized(self) -> bool:
        if self._initialized:
            return self._client is not None

        self._initialized = True

        if not settings.infisical_enabled:
            logger.info(
                "infisical_disabled",
                message="Infisical not configured, using environment fallback only",
            )
            return False

        try:
            from infisical_sdk import InfisicalSDKClient

            self._client = InfisicalSDKClient(host=settings.INFISICAL_URL)
            self._client.auth.universal_auth.login(
                settings.INFISICAL_CLIENT_ID,
                settings.INFISICAL_CLIENT_SECRET,
            )
            logger.info(
                "infisical_initialized",
                url=settings.INFISICAL_URL,
                project_id=settings.INFISICAL_PROJECT_ID,
            )
            return True
        except Exception as e:
            logger.error(
                "infisical_init_failed",
                error=str(e),
                message="Falling back to environment variables",
            )
            self._client = None
            return False

    def _get_secret_path(self, org_id: str, team_id: str | None = None) -> str:
        if team_id:
            return f"/organizations/{org_id}/teams/{team_id}"
        return f"/organizations/{org_id}"

    def _ensure_folder_exists(self, path: str) -> bool:
        """Ensure the folder path exists in Infisical, creating it if necessary.

        Creates folders recursively from root to the target path.
        For example, path="/organizations/abc/teams/xyz" will create:
        1. /organizations
        2. /organizations/abc
        3. /organizations/abc/teams
        4. /organizations/abc/teams/xyz
        """
        if not self._ensure_initialized() or self._client is None:
            logger.error("infisical_not_initialized_for_folder_creation")
            return False

        # Split path into components (skip empty strings from leading /)
        parts = [p for p in path.split("/") if p]
        if not parts:
            return True  # Root path always exists

        logger.debug("infisical_ensuring_folders", path=path, parts=parts)

        current_path = "/"
        for folder_name in parts:
            parent_path = current_path
            if current_path == "/":
                current_path = f"/{folder_name}"
            else:
                current_path = f"{current_path}/{folder_name}"

            logger.debug(
                "infisical_checking_folder",
                folder_name=folder_name,
                parent_path=parent_path,
                current_path=current_path,
            )

            # Try to create the folder - Infisical will return an error if it exists
            try:
                self._client.folders.create_folder(
                    name=folder_name,
                    project_id=settings.INFISICAL_PROJECT_ID,
                    environment_slug=settings.INFISICAL_ENVIRONMENT,
                    path=parent_path,
                )
                logger.info(
                    "infisical_folder_created",
                    folder_name=folder_name,
                    parent_path=parent_path,
                )
            except Exception as e:
                error_str = str(e).lower()
                if "already exists" in error_str or "duplicate" in error_str:
                    logger.debug(
                        "infisical_folder_already_exists",
                        folder_name=folder_name,
                        parent_path=parent_path,
                    )
                    continue
                logger.error(
                    "infisical_folder_create_failed",
                    folder_name=folder_name,
                    parent_path=parent_path,
                    error=str(e),
                )
                return False

        logger.info("infisical_folders_ensured", path=path)
        return True

    def _get_secret(self, secret_name: str, path: str) -> str | None:
        """Get a secret from Infisical by name and path."""
        if not self._ensure_initialized() or self._client is None:
            return None

        try:
            secret = self._client.secrets.get_secret_by_name(
                secret_name=secret_name,
                project_id=settings.INFISICAL_PROJECT_ID,
                environment_slug=settings.INFISICAL_ENVIRONMENT,
                secret_path=path,
            )
            return secret.secretValue if secret else None
        except Exception as e:
            # Secret not found is expected for unconfigured keys
            logger.debug(
                "infisical_get_secret_failed",
                secret_name=secret_name,
                path=path,
                error=str(e),
            )
            return None

    def _set_secret(self, secret_name: str, secret_value: str, path: str) -> bool:
        """Create or update a secret in Infisical."""
        if not self._ensure_initialized() or self._client is None:
            logger.error("infisical_not_available", operation="set_secret")
            return False

        # Ensure the folder path exists before creating the secret
        if not self._ensure_folder_exists(path):
            logger.error(
                "infisical_folder_creation_failed",
                path=path,
                secret_name=secret_name,
            )
            return False

        try:
            # Try to create first
            self._client.secrets.create_secret_by_name(
                secret_name=secret_name,
                secret_value=secret_value,
                project_id=settings.INFISICAL_PROJECT_ID,
                environment_slug=settings.INFISICAL_ENVIRONMENT,
                secret_path=path,
            )
            logger.info(
                "infisical_secret_created",
                secret_name=secret_name,
                path=path,
            )
            return True
        except Exception:
            # Secret might already exist, try update
            try:
                self._client.secrets.update_secret_by_name(
                    current_secret_name=secret_name,
                    secret_value=secret_value,
                    project_id=settings.INFISICAL_PROJECT_ID,
                    environment_slug=settings.INFISICAL_ENVIRONMENT,
                    secret_path=path,
                )
                logger.info(
                    "infisical_secret_updated",
                    secret_name=secret_name,
                    path=path,
                )
                return True
            except Exception as e:
                logger.error(
                    "infisical_set_secret_failed",
                    secret_name=secret_name,
                    path=path,
                    error=str(e),
                )
                return False

    def _delete_secret(self, secret_name: str, path: str) -> bool:
        """Delete a secret from Infisical."""
        if not self._ensure_initialized() or self._client is None:
            logger.error("infisical_not_available", operation="delete_secret")
            return False

        try:
            self._client.secrets.delete_secret_by_name(
                secret_name=secret_name,
                project_id=settings.INFISICAL_PROJECT_ID,
                environment_slug=settings.INFISICAL_ENVIRONMENT,
                secret_path=path,
            )
            logger.info(
                "infisical_secret_deleted",
                secret_name=secret_name,
                path=path,
            )
            return True
        except Exception as e:
            logger.error(
                "infisical_delete_secret_failed",
                secret_name=secret_name,
                path=path,
                error=str(e),
            )
            return False

    def _get_env_fallback(self, provider: LLMProvider) -> str | None:
        """Get API key from environment variables (backward compatibility)."""
        mapping = {
            "openai": settings.OPENAI_API_KEY,
            "anthropic": settings.ANTHROPIC_API_KEY,
            "google": settings.GOOGLE_API_KEY,
        }
        return mapping.get(provider)

    def get_llm_api_key(
        self,
        provider: LLMProvider,
        org_id: str,
        team_id: str | None = None,
    ) -> str | None:
        """Get LLM API key with fallback chain.

        Fallback chain (priority order):
        1. Team-level key (if team_id provided)
        2. Org-level key
        3. Environment variable

        Args:
            provider: The LLM provider (openai, anthropic, google)
            org_id: Organization ID for scoping
            team_id: Optional team ID for team-level override

        Returns:
            API key string or None if not configured
        """
        secret_name = f"{provider}_api_key"

        if team_id:
            team_path = self._get_secret_path(org_id, team_id)
            key = self._get_secret(secret_name, team_path)
            if key:
                logger.debug(
                    "api_key_resolved",
                    provider=provider,
                    level="team",
                    org_id=org_id,
                    team_id=team_id,
                )
                return key

        org_path = self._get_secret_path(org_id)
        key = self._get_secret(secret_name, org_path)
        if key:
            logger.debug(
                "api_key_resolved",
                provider=provider,
                level="org",
                org_id=org_id,
            )
            return key

        env_key = self._get_env_fallback(provider)
        if env_key:
            logger.debug(
                "api_key_resolved",
                provider=provider,
                level="environment",
            )
        return env_key

    def set_llm_api_key(
        self,
        provider: LLMProvider,
        api_key: str,
        org_id: str,
        team_id: str | None = None,
    ) -> bool:
        """Store LLM API key in Infisical.

        Args:
            provider: The LLM provider (openai, anthropic, google)
            api_key: The API key to store
            org_id: Organization ID for scoping
            team_id: Optional team ID for team-level storage

        Returns:
            True if successful, False otherwise
        """
        if provider not in SUPPORTED_PROVIDERS:
            logger.error("invalid_provider", provider=provider)
            return False

        secret_name = f"{provider}_api_key"
        path = self._get_secret_path(org_id, team_id)

        success = self._set_secret(secret_name, api_key, path)
        if success:
            logger.info(
                "llm_api_key_stored",
                provider=provider,
                org_id=org_id,
                team_id=team_id,
                level="team" if team_id else "org",
            )
        return success

    def delete_llm_api_key(
        self,
        provider: LLMProvider,
        org_id: str,
        team_id: str | None = None,
    ) -> bool:
        """Delete LLM API key from Infisical.

        Args:
            provider: The LLM provider (openai, anthropic, google)
            org_id: Organization ID for scoping
            team_id: Optional team ID for team-level deletion

        Returns:
            True if successful, False otherwise
        """
        if provider not in SUPPORTED_PROVIDERS:
            logger.error("invalid_provider", provider=provider)
            return False

        secret_name = f"{provider}_api_key"
        path = self._get_secret_path(org_id, team_id)

        success = self._delete_secret(secret_name, path)
        if success:
            logger.info(
                "llm_api_key_deleted",
                provider=provider,
                org_id=org_id,
                team_id=team_id,
                level="team" if team_id else "org",
            )
        return success

    def check_api_key_status(
        self,
        provider: LLMProvider,
        org_id: str,
        team_id: str | None = None,
    ) -> dict:
        """Check where an API key is configured.

        Args:
            provider: The LLM provider to check
            org_id: Organization ID
            team_id: Optional team ID to check team-level config

        Returns:
            Dict with is_configured, level, and has_fallback info
        """
        secret_name = f"{provider}_api_key"
        result = {
            "provider": provider,
            "is_configured": False,
            "level": None,
            "has_team_override": False,
            "has_org_key": False,
            "has_env_fallback": False,
        }

        if team_id:
            team_path = self._get_secret_path(org_id, team_id)
            if self._get_secret(secret_name, team_path):
                result["has_team_override"] = True
                result["is_configured"] = True
                result["level"] = "team"

        org_path = self._get_secret_path(org_id)
        if self._get_secret(secret_name, org_path):
            result["has_org_key"] = True
            if not result["is_configured"]:
                result["is_configured"] = True
                result["level"] = "org"

        if self._get_env_fallback(provider):
            result["has_env_fallback"] = True
            if not result["is_configured"]:
                result["is_configured"] = True
                result["level"] = "environment"

        return result

    def list_api_key_status(
        self,
        org_id: str,
        team_id: str | None = None,
    ) -> list[dict]:
        """List status of all provider API keys.

        Args:
            org_id: Organization ID
            team_id: Optional team ID for team context

        Returns:
            List of status dicts for each provider
        """
        return [
            self.check_api_key_status(provider, org_id, team_id)
            for provider in SUPPORTED_PROVIDERS
        ]

    def get_default_provider(
        self,
        org_id: str,
        team_id: str | None = None,
    ) -> LLMProvider:
        """Get the default LLM provider for an org/team.

        Checks Infisical for team/org level override, falls back to settings.

        Args:
            org_id: Organization ID
            team_id: Optional team ID

        Returns:
            The default provider name
        """
        # Check team-level default
        if team_id:
            team_path = self._get_secret_path(org_id, team_id)
            provider = self._get_secret("default_provider", team_path)
            if provider and provider in SUPPORTED_PROVIDERS:
                return provider  # type: ignore

        # Check org-level default
        org_path = self._get_secret_path(org_id)
        provider = self._get_secret("default_provider", org_path)
        if provider and provider in SUPPORTED_PROVIDERS:
            return provider  # type: ignore

        # Fall back to settings
        return settings.DEFAULT_LLM_PROVIDER

    def set_default_provider(
        self,
        provider: LLMProvider,
        org_id: str,
        team_id: str | None = None,
    ) -> bool:
        """Set the default LLM provider for an org/team.

        Args:
            provider: The provider to set as default
            org_id: Organization ID
            team_id: Optional team ID for team-level setting

        Returns:
            True if successful
        """
        if provider not in SUPPORTED_PROVIDERS:
            return False

        path = self._get_secret_path(org_id, team_id)
        return self._set_secret("default_provider", provider, path)


_secrets_service: SecretsService | None = None


def get_secrets_service() -> SecretsService:
    """Get the singleton secrets service instance."""
    global _secrets_service
    if _secrets_service is None:
        _secrets_service = SecretsService()
    return _secrets_service
