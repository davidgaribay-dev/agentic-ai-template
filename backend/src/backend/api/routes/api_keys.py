from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.core.secrets import LLMProvider, SUPPORTED_PROVIDERS, get_secrets_service
from backend.rbac.deps import (
    OrgContextDep,
    TeamContextDep,
    require_org_admin,
    require_team_admin,
)

router = APIRouter(tags=["api-keys"])


class APIKeyCreate(BaseModel):
    provider: LLMProvider = Field(
        description="LLM provider (openai, anthropic, google)"
    )
    api_key: str = Field(
        min_length=1,
        description="The API key value (will be stored securely in Infisical)",
    )


class APIKeyStatus(BaseModel):
    provider: str = Field(description="LLM provider name")
    is_configured: bool = Field(description="Whether any API key is available")
    level: str | None = Field(
        description="Where the key is configured: 'team', 'org', 'environment', or None"
    )
    has_team_override: bool = Field(
        default=False, description="Whether a team-level key exists"
    )
    has_org_key: bool = Field(
        default=False, description="Whether an org-level key exists"
    )
    has_env_fallback: bool = Field(
        default=False, description="Whether an environment variable fallback exists"
    )


class DefaultProviderUpdate(BaseModel):
    provider: LLMProvider = Field(description="The provider to set as default")


class DefaultProviderResponse(BaseModel):
    provider: str = Field(description="The current default provider")
    level: str = Field(
        description="Where the default is configured: 'team', 'org', or 'settings'"
    )


class APIKeyDeleteResponse(BaseModel):
    message: str
    provider: str
    level: str


@router.get(
    "/organizations/{organization_id}/api-keys",
    response_model=list[APIKeyStatus],
    dependencies=[Depends(require_org_admin)],
)
async def list_org_api_keys(
    org_context: OrgContextDep,
) -> list[APIKeyStatus]:
    """List API key status for all providers at the organization level.

    Only org admins and owners can view this information.
    Shows which providers have keys configured and at what level.
    """
    secrets = get_secrets_service()
    statuses = secrets.list_api_key_status(
        org_id=str(org_context.org_id),
        team_id=None,  # Org-level only
    )
    return [APIKeyStatus(**s) for s in statuses]


@router.post(
    "/organizations/{organization_id}/api-keys",
    response_model=APIKeyStatus,
    dependencies=[Depends(require_org_admin)],
)
async def set_org_api_key(
    http_request: Request,
    org_context: OrgContextDep,
    request: APIKeyCreate,
) -> APIKeyStatus:
    """Set an organization-level API key for an LLM provider.

    Only org admins and owners can set API keys.
    The key is stored securely in Infisical, never in the database.
    Teams without their own key will use this as a fallback.
    """
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    success = secrets.set_llm_api_key(
        provider=request.provider,
        api_key=request.api_key,
        org_id=str(org_context.org_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store API key. Check Infisical configuration.",
        )

    status_info = secrets.check_api_key_status(
        provider=request.provider,
        org_id=str(org_context.org_id),
    )

    await audit_service.log(
        AuditAction.API_KEY_CREATED,
        actor=org_context.user,
        request=http_request,
        organization_id=org_context.org_id,
        targets=[Target(type="api_key", id=request.provider, name=f"{request.provider} API Key")],
        metadata={
            "provider": request.provider,
            "level": "organization",
            "key_prefix": request.api_key[:8] + "..." if len(request.api_key) > 8 else "***",
        },
    )

    return APIKeyStatus(**status_info)


@router.delete(
    "/organizations/{organization_id}/api-keys/{provider}",
    response_model=APIKeyDeleteResponse,
    dependencies=[Depends(require_org_admin)],
)
async def delete_org_api_key(
    http_request: Request,
    org_context: OrgContextDep,
    provider: LLMProvider,
) -> APIKeyDeleteResponse:
    """Delete an organization-level API key.

    Only org admins and owners can delete API keys.
    Teams will still work if they have their own keys or environment fallback.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    success = secrets.delete_llm_api_key(
        provider=provider,
        org_id=str(org_context.org_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete API key. It may not exist or check Infisical configuration.",
        )

    await audit_service.log(
        AuditAction.API_KEY_DELETED,
        actor=org_context.user,
        request=http_request,
        organization_id=org_context.org_id,
        targets=[Target(type="api_key", id=provider, name=f"{provider} API Key")],
        metadata={
            "provider": provider,
            "level": "organization",
        },
    )

    return APIKeyDeleteResponse(
        message=f"API key for {provider} deleted successfully",
        provider=provider,
        level="org",
    )


@router.get(
    "/organizations/{organization_id}/default-provider",
    response_model=DefaultProviderResponse,
    dependencies=[Depends(require_org_admin)],
)
async def get_org_default_provider(
    org_context: OrgContextDep,
) -> DefaultProviderResponse:
    """Get the default LLM provider for the organization."""
    secrets = get_secrets_service()
    provider = secrets.get_default_provider(
        org_id=str(org_context.org_id),
    )
    return DefaultProviderResponse(provider=provider, level="org")


@router.put(
    "/organizations/{organization_id}/default-provider",
    response_model=DefaultProviderResponse,
    dependencies=[Depends(require_org_admin)],
)
async def set_org_default_provider(
    http_request: Request,
    org_context: OrgContextDep,
    request: DefaultProviderUpdate,
) -> DefaultProviderResponse:
    """Set the default LLM provider for the organization.

    Only org admins and owners can change this setting.
    Teams can override this with their own default.
    """
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    previous_provider = secrets.get_default_provider(org_id=str(org_context.org_id))

    success = secrets.set_default_provider(
        provider=request.provider,
        org_id=str(org_context.org_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update default provider. Check Infisical configuration.",
        )

    await audit_service.log(
        AuditAction.DEFAULT_PROVIDER_CHANGED,
        actor=org_context.user,
        request=http_request,
        organization_id=org_context.org_id,
        targets=[Target(type="configuration", id="default_provider", name="Default LLM Provider")],
        changes={"before": {"provider": previous_provider}, "after": {"provider": request.provider}},
        metadata={"level": "organization"},
    )

    return DefaultProviderResponse(provider=request.provider, level="org")


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/api-keys",
    response_model=list[APIKeyStatus],
    dependencies=[Depends(require_team_admin)],
)
async def list_team_api_keys(
    team_context: TeamContextDep,
) -> list[APIKeyStatus]:
    """List API key status for all providers at the team level.

    Only team admins can view this information.
    Shows which providers have keys at team level vs org level fallback.
    """
    secrets = get_secrets_service()
    statuses = secrets.list_api_key_status(
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )
    return [APIKeyStatus(**s) for s in statuses]


@router.post(
    "/organizations/{organization_id}/teams/{team_id}/api-keys",
    response_model=APIKeyStatus,
    dependencies=[Depends(require_team_admin)],
)
async def set_team_api_key(
    http_request: Request,
    team_context: TeamContextDep,
    request: APIKeyCreate,
) -> APIKeyStatus:
    """Set a team-level API key for an LLM provider.

    Only team admins can set API keys.
    This key takes priority over the organization-level key.
    Useful for cost tracking per team.
    """
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    success = secrets.set_llm_api_key(
        provider=request.provider,
        api_key=request.api_key,
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store API key. Check Infisical configuration.",
        )

    status_info = secrets.check_api_key_status(
        provider=request.provider,
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )

    await audit_service.log(
        AuditAction.API_KEY_CREATED,
        actor=team_context.org_context.user,
        request=http_request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="api_key", id=request.provider, name=f"{request.provider} API Key")],
        metadata={
            "provider": request.provider,
            "level": "team",
            "team_id": str(team_context.team_id),
            "key_prefix": request.api_key[:8] + "..." if len(request.api_key) > 8 else "***",
        },
    )

    return APIKeyStatus(**status_info)


@router.delete(
    "/organizations/{organization_id}/teams/{team_id}/api-keys/{provider}",
    response_model=APIKeyDeleteResponse,
    dependencies=[Depends(require_team_admin)],
)
async def delete_team_api_key(
    http_request: Request,
    team_context: TeamContextDep,
    provider: LLMProvider,
) -> APIKeyDeleteResponse:
    """Delete a team-level API key.

    Only team admins can delete API keys.
    After deletion, the team will use the organization-level key as fallback.
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    success = secrets.delete_llm_api_key(
        provider=provider,
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete API key. It may not exist or check Infisical configuration.",
        )

    await audit_service.log(
        AuditAction.API_KEY_DELETED,
        actor=team_context.org_context.user,
        request=http_request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="api_key", id=provider, name=f"{provider} API Key")],
        metadata={
            "provider": provider,
            "level": "team",
            "team_id": str(team_context.team_id),
        },
    )

    return APIKeyDeleteResponse(
        message=f"API key for {provider} deleted successfully. Will use org-level fallback.",
        provider=provider,
        level="team",
    )


@router.get(
    "/organizations/{organization_id}/teams/{team_id}/default-provider",
    response_model=DefaultProviderResponse,
    dependencies=[Depends(require_team_admin)],
)
async def get_team_default_provider(
    team_context: TeamContextDep,
) -> DefaultProviderResponse:
    secrets = get_secrets_service()
    provider = secrets.get_default_provider(
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )
    return DefaultProviderResponse(provider=provider, level="team")


@router.put(
    "/organizations/{organization_id}/teams/{team_id}/default-provider",
    response_model=DefaultProviderResponse,
    dependencies=[Depends(require_team_admin)],
)
async def set_team_default_provider(
    http_request: Request,
    team_context: TeamContextDep,
    request: DefaultProviderUpdate,
) -> DefaultProviderResponse:
    """Set the default LLM provider for the team.

    Only team admins can change this setting.
    This takes priority over the organization default.
    """
    if request.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider. Must be one of: {SUPPORTED_PROVIDERS}",
        )

    secrets = get_secrets_service()
    previous_provider = secrets.get_default_provider(
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )

    success = secrets.set_default_provider(
        provider=request.provider,
        org_id=str(team_context.org_id),
        team_id=str(team_context.team_id),
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update default provider. Check Infisical configuration.",
        )

    await audit_service.log(
        AuditAction.DEFAULT_PROVIDER_CHANGED,
        actor=team_context.org_context.user,
        request=http_request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="configuration", id="default_provider", name="Default LLM Provider")],
        changes={"before": {"provider": previous_provider}, "after": {"provider": request.provider}},
        metadata={"level": "team", "team_id": str(team_context.team_id)},
    )

    return DefaultProviderResponse(provider=request.provider, level="team")
