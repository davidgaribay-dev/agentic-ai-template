from typing import Annotated, Any
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status

from backend.audit.schemas import AuditAction, Target
from backend.audit.service import audit_service
from backend.auth import CurrentUser, SessionDep
from backend.prompts import crud
from backend.prompts.models import (
    ActiveSystemPrompt,
    PromptCreate,
    PromptPublic,
    PromptsAvailable,
    PromptsPublic,
    PromptType,
    PromptUpdate,
)
from backend.rbac.deps import (
    OrgContextDep,
    TeamContextDep,
    require_org_permission,
    require_team_permission,
)
from backend.rbac.permissions import OrgPermission, TeamPermission

org_router = APIRouter(
    prefix="/organizations/{organization_id}/prompts",
    tags=["prompts"],
)

team_router = APIRouter(
    prefix="/organizations/{organization_id}/teams/{team_id}/prompts",
    tags=["prompts"],
)

user_router = APIRouter(
    prefix="/users/me/prompts",
    tags=["prompts"],
)


@org_router.get(
    "/",
    response_model=PromptsPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_READ))],
)
def list_org_prompts(
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_type: Annotated[
        PromptType | None, Query(description="Filter by prompt type")
    ] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> Any:
    """List organization-level prompts."""
    prompts, count = crud.get_prompts_by_org(
        session=session,
        organization_id=org_context.org_id,
        prompt_type=prompt_type,
        skip=skip,
        limit=limit,
    )
    return PromptsPublic(
        data=[PromptPublic.model_validate(p) for p in prompts],
        count=count,
    )


@org_router.post(
    "/",
    response_model=PromptPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_MANAGE))],
)
async def create_org_prompt(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_in: PromptCreate,
) -> Any:
    """Create a new organization-level prompt."""
    prompt = crud.create_org_prompt(
        session=session,
        prompt_in=prompt_in,
        organization_id=org_context.org_id,
        created_by_id=org_context.user.id,
    )

    await audit_service.log(
        AuditAction.PROMPT_CREATED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={
            "prompt_type": prompt.prompt_type.value,
            "scope": "organization",
        },
    )

    return PromptPublic.model_validate(prompt)


@org_router.get(
    "/{prompt_id}",
    response_model=PromptPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_READ))],
)
def get_org_prompt(
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Get an organization-level prompt by ID."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    # Verify it's an org-level prompt for this organization
    if (
        prompt.organization_id != org_context.org_id
        or prompt.team_id is not None
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    return PromptPublic.model_validate(prompt)


@org_router.patch(
    "/{prompt_id}",
    response_model=PromptPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_MANAGE))],
)
async def update_org_prompt(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
    prompt_in: PromptUpdate,
) -> Any:
    """Update an organization-level prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != org_context.org_id
        or prompt.team_id is not None
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    old_name = prompt.name
    prompt = crud.update_prompt(session=session, db_prompt=prompt, prompt_in=prompt_in)

    await audit_service.log(
        AuditAction.PROMPT_UPDATED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        changes={"before": {"name": old_name}, "after": {"name": prompt.name}},
    )

    return PromptPublic.model_validate(prompt)


@org_router.delete(
    "/{prompt_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_MANAGE))],
)
async def delete_org_prompt(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> None:
    """Delete an organization-level prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != org_context.org_id
        or prompt.team_id is not None
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    prompt_name = prompt.name
    crud.delete_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_DELETED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="prompt", id=str(prompt_id), name=prompt_name)],
    )


@org_router.post(
    "/{prompt_id}/activate",
    response_model=PromptPublic,
    dependencies=[Depends(require_org_permission(OrgPermission.PROMPTS_MANAGE))],
)
async def activate_org_prompt(
    request: Request,
    session: SessionDep,
    org_context: OrgContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Activate an organization-level system prompt.

    Only one system prompt can be active per scope. Activating a prompt
    will deactivate any other active system prompt at the same scope level.
    """
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != org_context.org_id
        or prompt.team_id is not None
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.prompt_type != PromptType.SYSTEM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only system prompts can be activated",
        )

    prompt = crud.activate_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_ACTIVATED,
        actor=org_context.user,
        request=request,
        organization_id=org_context.org_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={"scope": "organization"},
    )

    return PromptPublic.model_validate(prompt)


@team_router.get(
    "/",
    response_model=PromptsPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_READ))],
)
def list_team_prompts(
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_type: Annotated[
        PromptType | None, Query(description="Filter by prompt type")
    ] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> Any:
    """List team-level prompts."""
    prompts, count = crud.get_prompts_by_team(
        session=session,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        prompt_type=prompt_type,
        skip=skip,
        limit=limit,
    )
    return PromptsPublic(
        data=[PromptPublic.model_validate(p) for p in prompts],
        count=count,
    )


@team_router.post(
    "/",
    response_model=PromptPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_MANAGE))],
)
async def create_team_prompt(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_in: PromptCreate,
) -> Any:
    """Create a new team-level prompt."""
    prompt = crud.create_team_prompt(
        session=session,
        prompt_in=prompt_in,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        created_by_id=team_context.user.id,
    )

    await audit_service.log(
        AuditAction.PROMPT_CREATED,
        actor=team_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={
            "prompt_type": prompt.prompt_type.value,
            "scope": "team",
        },
    )

    return PromptPublic.model_validate(prompt)


@team_router.get(
    "/available",
    response_model=PromptsAvailable,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_READ))],
)
def get_available_prompts(
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_type: Annotated[
        PromptType | None, Query(description="Filter by prompt type")
    ] = None,
) -> Any:
    """Get all prompts available to the user in the current context.

    Returns prompts grouped by scope level:
    - org_prompts: Organization-level prompts
    - team_prompts: Team-level prompts
    - user_prompts: User's personal prompts (global)
    """
    return crud.get_available_prompts(
        session=session,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        user_id=team_context.user.id,
        prompt_type=prompt_type,
    )


@team_router.get(
    "/active-system",
    response_model=ActiveSystemPrompt,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_READ))],
)
def get_active_system_prompt(
    session: SessionDep,
    team_context: TeamContextDep,
) -> Any:
    """Get the effective system prompt for the agent.

    Returns the concatenated active system prompts from all levels:
    organization + team + user
    """
    return crud.get_active_system_prompt(
        session=session,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        user_id=team_context.user.id,
    )


@team_router.get(
    "/{prompt_id}",
    response_model=PromptPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_READ))],
)
def get_team_prompt(
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Get a team-level prompt by ID."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != team_context.org_id
        or prompt.team_id != team_context.team_id
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    return PromptPublic.model_validate(prompt)


@team_router.patch(
    "/{prompt_id}",
    response_model=PromptPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_MANAGE))],
)
async def update_team_prompt(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
    prompt_in: PromptUpdate,
) -> Any:
    """Update a team-level prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != team_context.org_id
        or prompt.team_id != team_context.team_id
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    old_name = prompt.name
    prompt = crud.update_prompt(session=session, db_prompt=prompt, prompt_in=prompt_in)

    await audit_service.log(
        AuditAction.PROMPT_UPDATED,
        actor=team_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        changes={"before": {"name": old_name}, "after": {"name": prompt.name}},
    )

    return PromptPublic.model_validate(prompt)


@team_router.delete(
    "/{prompt_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_MANAGE))],
)
async def delete_team_prompt(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> None:
    """Delete a team-level prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != team_context.org_id
        or prompt.team_id != team_context.team_id
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    prompt_name = prompt.name
    crud.delete_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_DELETED,
        actor=team_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="prompt", id=str(prompt_id), name=prompt_name)],
    )


@team_router.post(
    "/{prompt_id}/activate",
    response_model=PromptPublic,
    dependencies=[Depends(require_team_permission(TeamPermission.PROMPTS_MANAGE))],
)
async def activate_team_prompt(
    request: Request,
    session: SessionDep,
    team_context: TeamContextDep,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Activate a team-level system prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if (
        prompt.organization_id != team_context.org_id
        or prompt.team_id != team_context.team_id
        or prompt.user_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.prompt_type != PromptType.SYSTEM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only system prompts can be activated",
        )

    prompt = crud.activate_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_ACTIVATED,
        actor=team_context.user,
        request=request,
        organization_id=team_context.org_id,
        team_id=team_context.team_id,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={"scope": "team"},
    )

    return PromptPublic.model_validate(prompt)


@user_router.get("/", response_model=PromptsPublic)
def list_user_prompts(
    session: SessionDep,
    current_user: CurrentUser,
    prompt_type: Annotated[
        PromptType | None, Query(description="Filter by prompt type")
    ] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
) -> Any:
    """List user's personal prompts (global, available across all orgs/teams)."""
    prompts, count = crud.get_prompts_by_user(
        session=session,
        user_id=current_user.id,
        prompt_type=prompt_type,
        skip=skip,
        limit=limit,
    )
    return PromptsPublic(
        data=[PromptPublic.model_validate(p) for p in prompts],
        count=count,
    )


@user_router.post(
    "/",
    response_model=PromptPublic,
    status_code=status.HTTP_201_CREATED,
)
async def create_user_prompt(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    prompt_in: PromptCreate,
) -> Any:
    """Create a new personal prompt (global, available across all orgs/teams)."""
    prompt = crud.create_user_prompt(
        session=session,
        prompt_in=prompt_in,
        user_id=current_user.id,
    )

    await audit_service.log(
        AuditAction.PROMPT_CREATED,
        actor=current_user,
        request=request,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={
            "prompt_type": prompt.prompt_type.value,
            "scope": "user",
        },
    )

    return PromptPublic.model_validate(prompt)


@user_router.get("/{prompt_id}", response_model=PromptPublic)
def get_user_prompt(
    session: SessionDep,
    current_user: CurrentUser,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Get a personal prompt by ID."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    return PromptPublic.model_validate(prompt)


@user_router.patch("/{prompt_id}", response_model=PromptPublic)
async def update_user_prompt(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
    prompt_in: PromptUpdate,
) -> Any:
    """Update a personal prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    old_name = prompt.name
    prompt = crud.update_prompt(session=session, db_prompt=prompt, prompt_in=prompt_in)

    await audit_service.log(
        AuditAction.PROMPT_UPDATED,
        actor=current_user,
        request=request,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        changes={"before": {"name": old_name}, "after": {"name": prompt.name}},
    )

    return PromptPublic.model_validate(prompt)


@user_router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_prompt(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> None:
    """Delete a personal prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )

    prompt_name = prompt.name
    crud.delete_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_DELETED,
        actor=current_user,
        request=request,
        targets=[Target(type="prompt", id=str(prompt_id), name=prompt_name)],
    )


@user_router.post("/{prompt_id}/activate", response_model=PromptPublic)
async def activate_user_prompt(
    request: Request,
    session: SessionDep,
    current_user: CurrentUser,
    prompt_id: Annotated[uuid.UUID, Path(description="Prompt ID")],
) -> Any:
    """Activate a personal system prompt."""
    prompt = crud.get_prompt(session=session, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt not found",
        )
    if prompt.prompt_type != PromptType.SYSTEM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only system prompts can be activated",
        )

    prompt = crud.activate_prompt(session=session, db_prompt=prompt)

    await audit_service.log(
        AuditAction.PROMPT_ACTIVATED,
        actor=current_user,
        request=request,
        targets=[Target(type="prompt", id=str(prompt.id), name=prompt.name)],
        metadata={"scope": "user"},
    )

    return PromptPublic.model_validate(prompt)
