from datetime import UTC, datetime
import uuid

from sqlmodel import Session, col, func, select

from backend.prompts.models import (
    ActiveSystemPrompt,
    Prompt,
    PromptCreate,
    PromptPublic,
    PromptsAvailable,
    PromptType,
    PromptUpdate,
)

__all__ = [
    "activate_prompt",
    "create_org_prompt",
    "create_team_prompt",
    "create_user_prompt",
    "deactivate_prompts_in_scope",
    "delete_prompt",
    "get_active_system_prompt",
    "get_available_prompts",
    "get_prompt",
    "get_prompts_by_org",
    "get_prompts_by_team",
    "get_prompts_by_user",
    "update_prompt",
]


def create_org_prompt(
    *,
    session: Session,
    prompt_in: PromptCreate,
    organization_id: uuid.UUID,
    created_by_id: uuid.UUID,
) -> Prompt:
    db_prompt = Prompt.model_validate(
        prompt_in,
        update={
            "organization_id": organization_id,
            "team_id": None,
            "user_id": None,
            "created_by_id": created_by_id,
        },
    )
    session.add(db_prompt)
    session.commit()
    session.refresh(db_prompt)
    return db_prompt


def create_team_prompt(
    *,
    session: Session,
    prompt_in: PromptCreate,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    created_by_id: uuid.UUID,
) -> Prompt:
    db_prompt = Prompt.model_validate(
        prompt_in,
        update={
            "organization_id": organization_id,
            "team_id": team_id,
            "user_id": None,
            "created_by_id": created_by_id,
        },
    )
    session.add(db_prompt)
    session.commit()
    session.refresh(db_prompt)
    return db_prompt


def create_user_prompt(
    *,
    session: Session,
    prompt_in: PromptCreate,
    user_id: uuid.UUID,
) -> Prompt:
    db_prompt = Prompt.model_validate(
        prompt_in,
        update={
            "organization_id": None,
            "team_id": None,
            "user_id": user_id,
            "created_by_id": user_id,
        },
    )
    session.add(db_prompt)
    session.commit()
    session.refresh(db_prompt)
    return db_prompt


def get_prompt(*, session: Session, prompt_id: uuid.UUID) -> Prompt | None:
    return session.get(Prompt, prompt_id)


def get_prompts_by_org(
    *,
    session: Session,
    organization_id: uuid.UUID,
    prompt_type: PromptType | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Prompt], int]:
    conditions = [
        Prompt.organization_id == organization_id,
        Prompt.team_id.is_(None),
        Prompt.user_id.is_(None),
    ]
    if prompt_type:
        conditions.append(Prompt.prompt_type == prompt_type)

    count_statement = select(func.count()).select_from(Prompt).where(*conditions)
    count = session.exec(count_statement).one()

    statement = (
        select(Prompt)
        .where(*conditions)
        .order_by(
            col(Prompt.prompt_type).asc(),
            col(Prompt.is_active).desc(),
            col(Prompt.name).asc(),
        )
        .offset(skip)
        .limit(limit)
    )
    prompts = session.exec(statement).all()

    return list(prompts), count


def get_prompts_by_team(
    *,
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    prompt_type: PromptType | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Prompt], int]:
    conditions = [
        Prompt.organization_id == organization_id,
        Prompt.team_id == team_id,
        Prompt.user_id.is_(None),
    ]
    if prompt_type:
        conditions.append(Prompt.prompt_type == prompt_type)

    count_statement = select(func.count()).select_from(Prompt).where(*conditions)
    count = session.exec(count_statement).one()

    statement = (
        select(Prompt)
        .where(*conditions)
        .order_by(
            col(Prompt.prompt_type).asc(),
            col(Prompt.is_active).desc(),
            col(Prompt.name).asc(),
        )
        .offset(skip)
        .limit(limit)
    )
    prompts = session.exec(statement).all()

    return list(prompts), count


def get_prompts_by_user(
    *,
    session: Session,
    user_id: uuid.UUID,
    prompt_type: PromptType | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Prompt], int]:
    conditions = [
        Prompt.user_id == user_id,
        Prompt.organization_id.is_(None),
        Prompt.team_id.is_(None),
    ]
    if prompt_type:
        conditions.append(Prompt.prompt_type == prompt_type)

    count_statement = select(func.count()).select_from(Prompt).where(*conditions)
    count = session.exec(count_statement).one()

    statement = (
        select(Prompt)
        .where(*conditions)
        .order_by(
            col(Prompt.prompt_type).asc(),
            col(Prompt.is_active).desc(),
            col(Prompt.name).asc(),
        )
        .offset(skip)
        .limit(limit)
    )
    prompts = session.exec(statement).all()

    return list(prompts), count


def get_available_prompts(
    *,
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
    prompt_type: PromptType | None = None,
) -> PromptsAvailable:
    """Get all prompts available to a user in their current context.

    Returns prompts grouped by scope level:
    - org_prompts: Organization-level prompts
    - team_prompts: Team-level prompts
    - user_prompts: User's personal prompts (global)
    """
    # Get org prompts
    org_prompts, _ = get_prompts_by_org(
        session=session,
        organization_id=organization_id,
        prompt_type=prompt_type,
        limit=1000,
    )

    # Get team prompts
    team_prompts, _ = get_prompts_by_team(
        session=session,
        organization_id=organization_id,
        team_id=team_id,
        prompt_type=prompt_type,
        limit=1000,
    )

    # Get user prompts
    user_prompts, _ = get_prompts_by_user(
        session=session,
        user_id=user_id,
        prompt_type=prompt_type,
        limit=1000,
    )

    return PromptsAvailable(
        org_prompts=[PromptPublic.model_validate(p) for p in org_prompts],
        team_prompts=[PromptPublic.model_validate(p) for p in team_prompts],
        user_prompts=[PromptPublic.model_validate(p) for p in user_prompts],
    )


def get_active_system_prompt(
    *,
    session: Session,
    organization_id: uuid.UUID,
    team_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ActiveSystemPrompt:
    """Get the effective system prompt for the agent.

    Concatenates active system prompts from all levels:
    1. Organization-level active system prompt
    2. Team-level active system prompt
    3. User-level active system prompt

    If no active prompts exist, returns empty content.
    """
    # Get active org system prompt
    org_prompt_stmt = select(Prompt).where(
        Prompt.organization_id == organization_id,
        Prompt.team_id.is_(None),
        Prompt.user_id.is_(None),
        Prompt.prompt_type == PromptType.SYSTEM,
        Prompt.is_active == True,  # noqa: E712
    )
    org_prompt = session.exec(org_prompt_stmt).first()

    # Get active team system prompt
    team_prompt_stmt = select(Prompt).where(
        Prompt.organization_id == organization_id,
        Prompt.team_id == team_id,
        Prompt.user_id.is_(None),
        Prompt.prompt_type == PromptType.SYSTEM,
        Prompt.is_active == True,  # noqa: E712
    )
    team_prompt = session.exec(team_prompt_stmt).first()

    # Get active user system prompt
    user_prompt_stmt = select(Prompt).where(
        Prompt.user_id == user_id,
        Prompt.organization_id.is_(None),
        Prompt.team_id.is_(None),
        Prompt.prompt_type == PromptType.SYSTEM,
        Prompt.is_active == True,  # noqa: E712
    )
    user_prompt = session.exec(user_prompt_stmt).first()

    # Concatenate all active system prompts
    parts = []
    if org_prompt:
        parts.append(org_prompt.content)
    if team_prompt:
        parts.append(team_prompt.content)
    if user_prompt:
        parts.append(user_prompt.content)

    content = "\n\n".join(parts) if parts else ""

    return ActiveSystemPrompt(
        content=content,
        org_prompt=PromptPublic.model_validate(org_prompt) if org_prompt else None,
        team_prompt=PromptPublic.model_validate(team_prompt) if team_prompt else None,
        user_prompt=PromptPublic.model_validate(user_prompt) if user_prompt else None,
    )


def update_prompt(
    *,
    session: Session,
    db_prompt: Prompt,
    prompt_in: PromptUpdate,
) -> Prompt:
    """Update a prompt in the database."""
    prompt_data = prompt_in.model_dump(exclude_unset=True)
    prompt_data["updated_at"] = datetime.now(UTC)
    db_prompt.sqlmodel_update(prompt_data)
    session.add(db_prompt)
    session.commit()
    session.refresh(db_prompt)
    return db_prompt


def delete_prompt(*, session: Session, db_prompt: Prompt) -> None:
    """Delete a prompt from the database."""
    session.delete(db_prompt)
    session.commit()


def deactivate_prompts_in_scope(
    *,
    session: Session,
    organization_id: uuid.UUID | None,
    team_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
) -> None:
    """Deactivate all system prompts in a given scope.

    Used before activating a new system prompt to ensure only one is active.
    """
    if user_id and not organization_id and not team_id:
        # User scope
        conditions = [
            Prompt.user_id == user_id,
            Prompt.organization_id.is_(None),
            Prompt.team_id.is_(None),
        ]
    elif team_id:
        # Team scope
        conditions = [
            Prompt.organization_id == organization_id,
            Prompt.team_id == team_id,
            Prompt.user_id.is_(None),
        ]
    elif organization_id:
        # Org scope
        conditions = [
            Prompt.organization_id == organization_id,
            Prompt.team_id.is_(None),
            Prompt.user_id.is_(None),
        ]
    else:
        return

    conditions.append(Prompt.prompt_type == PromptType.SYSTEM)
    conditions.append(Prompt.is_active == True)  # noqa: E712

    statement = select(Prompt).where(*conditions)
    prompts = session.exec(statement).all()

    for prompt in prompts:
        prompt.is_active = False
        prompt.updated_at = datetime.now(UTC)
        session.add(prompt)

    session.commit()


def activate_prompt(
    *,
    session: Session,
    db_prompt: Prompt,
) -> Prompt:
    """Activate a system prompt, deactivating others in the same scope.

    Only works for system prompts. Template prompts don't have activation.
    """
    if db_prompt.prompt_type != PromptType.SYSTEM:
        raise ValueError("Only system prompts can be activated")

    # Deactivate other system prompts in the same scope
    deactivate_prompts_in_scope(
        session=session,
        organization_id=db_prompt.organization_id,
        team_id=db_prompt.team_id,
        user_id=db_prompt.user_id,
    )

    # Activate this prompt
    db_prompt.is_active = True
    db_prompt.updated_at = datetime.now(UTC)
    session.add(db_prompt)
    session.commit()
    session.refresh(db_prompt)
    return db_prompt
