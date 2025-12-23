"""RAG settings service layer for hierarchical configuration management.

Mirrors the theme_settings/service.py pattern for consistency.
"""

from datetime import UTC, datetime
import uuid

from sqlmodel import Session, select

from backend.rag_settings.models import (
    EffectiveRAGSettings,
    OrganizationRAGSettings,
    OrganizationRAGSettingsUpdate,
    TeamRAGSettings,
    TeamRAGSettingsUpdate,
    UserRAGSettings,
    UserRAGSettingsUpdate,
)


def get_or_create_org_rag_settings(
    session: Session, organization_id: uuid.UUID
) -> OrganizationRAGSettings:
    """Get or create organization RAG settings with defaults."""
    statement = select(OrganizationRAGSettings).where(
        OrganizationRAGSettings.organization_id == organization_id
    )
    settings = session.exec(statement).first()

    if not settings:
        settings = OrganizationRAGSettings(
            organization_id=organization_id,
            rag_enabled=True,
            rag_customization_enabled=True,
            allow_team_customization=True,
            allow_user_customization=True,
            chunk_size=1000,
            chunk_overlap=200,
            chunks_per_query=4,
            similarity_threshold=0.7,
            use_hybrid_search=False,
            reranking_enabled=False,
            query_rewriting_enabled=False,
            max_documents_per_user=100,
            max_document_size_mb=50,
            max_total_storage_gb=10,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_org_rag_settings(
    session: Session,
    organization_id: uuid.UUID,
    data: OrganizationRAGSettingsUpdate,
) -> OrganizationRAGSettings:
    """Update organization RAG settings."""
    settings = get_or_create_org_rag_settings(session, organization_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_team_rag_settings(
    session: Session, team_id: uuid.UUID
) -> TeamRAGSettings:
    """Get or create team RAG settings with defaults."""
    statement = select(TeamRAGSettings).where(TeamRAGSettings.team_id == team_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = TeamRAGSettings(
            team_id=team_id,
            rag_enabled=True,
            rag_customization_enabled=True,
            allow_user_customization=True,
            chunk_size=1000,
            chunk_overlap=200,
            chunks_per_query=4,
            similarity_threshold=0.7,
            use_hybrid_search=False,
            reranking_enabled=False,
            query_rewriting_enabled=False,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_team_rag_settings(
    session: Session, team_id: uuid.UUID, data: TeamRAGSettingsUpdate
) -> TeamRAGSettings:
    """Update team RAG settings."""
    settings = get_or_create_team_rag_settings(session, team_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_or_create_user_rag_settings(
    session: Session, user_id: uuid.UUID
) -> UserRAGSettings:
    """Get or create user RAG settings with defaults."""
    statement = select(UserRAGSettings).where(UserRAGSettings.user_id == user_id)
    settings = session.exec(statement).first()

    if not settings:
        settings = UserRAGSettings(
            user_id=user_id,
            rag_enabled=True,
            chunks_per_query=4,
            similarity_threshold=0.7,
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)

    return settings


def update_user_rag_settings(
    session: Session, user_id: uuid.UUID, data: UserRAGSettingsUpdate
) -> UserRAGSettings:
    """Update user RAG settings."""
    settings = get_or_create_user_rag_settings(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)

    settings.updated_at = datetime.now(UTC)
    session.add(settings)
    session.commit()
    session.refresh(settings)

    return settings


def get_effective_rag_settings(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    team_id: uuid.UUID | None = None,
) -> EffectiveRAGSettings:
    """Compute effective RAG settings by applying hierarchy: Org > Team > User.

    The hierarchy works as follows:
    1. Check org permissions first (if disabled, block all customization)
    2. Check team permissions (if org allows but team disables, block user customization)
    3. Apply user preferences (if allowed)
    4. Return effective settings with resolved values

    Args:
        session: Database session
        user_id: User UUID
        organization_id: Organization UUID
        team_id: Optional team UUID (for team context)

    Returns:
        EffectiveRAGSettings with computed values and permission metadata
    """
    org_settings = get_or_create_org_rag_settings(session, organization_id)
    team_settings = None
    if team_id:
        team_settings = get_or_create_team_rag_settings(session, team_id)
    user_settings = get_or_create_user_rag_settings(session, user_id)

    # Step 1: Check if org allows any customization
    if not org_settings.rag_customization_enabled:
        # Org disabled all customization - use org defaults
        return EffectiveRAGSettings(
            rag_enabled=org_settings.rag_enabled,
            rag_disabled_by="org" if not org_settings.rag_enabled else None,
            chunk_size=org_settings.chunk_size,
            chunk_overlap=org_settings.chunk_overlap,
            chunks_per_query=org_settings.chunks_per_query,
            similarity_threshold=org_settings.similarity_threshold,
            use_hybrid_search=org_settings.use_hybrid_search,
            reranking_enabled=org_settings.reranking_enabled,
            query_rewriting_enabled=org_settings.query_rewriting_enabled,
            customization_allowed=False,
            customization_disabled_by="org",
            max_documents_per_user=org_settings.max_documents_per_user,
            max_document_size_mb=org_settings.max_document_size_mb,
            allowed_file_types=org_settings.allowed_file_types,
        )

    # Step 2: Check team customization (if in team context)
    if team_settings:
        # Check if org allows team customization
        if not org_settings.allow_team_customization:
            # Org blocks team customization, check if user can customize
            if org_settings.allow_user_customization:
                # User can customize - use user settings
                return EffectiveRAGSettings(
                    rag_enabled=user_settings.rag_enabled,
                    rag_disabled_by="user" if not user_settings.rag_enabled else None,
                    chunk_size=org_settings.chunk_size,
                    chunk_overlap=org_settings.chunk_overlap,
                    chunks_per_query=user_settings.chunks_per_query,
                    similarity_threshold=user_settings.similarity_threshold,
                    use_hybrid_search=org_settings.use_hybrid_search,
                    reranking_enabled=org_settings.reranking_enabled,
                    query_rewriting_enabled=org_settings.query_rewriting_enabled,
                    customization_allowed=True,
                    customization_disabled_by=None,
                    max_documents_per_user=org_settings.max_documents_per_user,
                    max_document_size_mb=org_settings.max_document_size_mb,
                    allowed_file_types=org_settings.allowed_file_types,
                )
            # User cannot customize - use org defaults
            return EffectiveRAGSettings(
                rag_enabled=org_settings.rag_enabled,
                rag_disabled_by="org" if not org_settings.rag_enabled else None,
                chunk_size=org_settings.chunk_size,
                chunk_overlap=org_settings.chunk_overlap,
                chunks_per_query=org_settings.chunks_per_query,
                similarity_threshold=org_settings.similarity_threshold,
                use_hybrid_search=org_settings.use_hybrid_search,
                reranking_enabled=org_settings.reranking_enabled,
                query_rewriting_enabled=org_settings.query_rewriting_enabled,
                customization_allowed=False,
                customization_disabled_by="org",
                max_documents_per_user=org_settings.max_documents_per_user,
                max_document_size_mb=org_settings.max_document_size_mb,
                allowed_file_types=org_settings.allowed_file_types,
            )

        # Org allows team customization - check if team is using it
        if not team_settings.rag_customization_enabled:
            # Team not using custom settings, check if user can customize
            user_can_customize = (
                team_settings.allow_user_customization
                and org_settings.allow_user_customization
            )
            if user_can_customize:
                # User can customize - use user settings
                return EffectiveRAGSettings(
                    rag_enabled=user_settings.rag_enabled,
                    rag_disabled_by="user" if not user_settings.rag_enabled else None,
                    chunk_size=org_settings.chunk_size,
                    chunk_overlap=org_settings.chunk_overlap,
                    chunks_per_query=user_settings.chunks_per_query,
                    similarity_threshold=user_settings.similarity_threshold,
                    use_hybrid_search=org_settings.use_hybrid_search,
                    reranking_enabled=org_settings.reranking_enabled,
                    query_rewriting_enabled=org_settings.query_rewriting_enabled,
                    customization_allowed=True,
                    customization_disabled_by=None,
                    max_documents_per_user=org_settings.max_documents_per_user,
                    max_document_size_mb=org_settings.max_document_size_mb,
                    allowed_file_types=org_settings.allowed_file_types,
                )
            # User cannot customize - use org defaults
            disabled_by = "org" if not org_settings.allow_user_customization else "team"
            return EffectiveRAGSettings(
                rag_enabled=org_settings.rag_enabled,
                rag_disabled_by="org" if not org_settings.rag_enabled else None,
                chunk_size=org_settings.chunk_size,
                chunk_overlap=org_settings.chunk_overlap,
                chunks_per_query=org_settings.chunks_per_query,
                similarity_threshold=org_settings.similarity_threshold,
                use_hybrid_search=org_settings.use_hybrid_search,
                reranking_enabled=org_settings.reranking_enabled,
                query_rewriting_enabled=org_settings.query_rewriting_enabled,
                customization_allowed=False,
                customization_disabled_by=disabled_by,
                max_documents_per_user=org_settings.max_documents_per_user,
                max_document_size_mb=org_settings.max_document_size_mb,
                allowed_file_types=org_settings.allowed_file_types,
            )

        # Team is using custom settings - check if user can override
        user_can_customize = (
            team_settings.allow_user_customization
            and org_settings.allow_user_customization
        )
        if user_can_customize:
            # User can override - use user settings where applicable
            return EffectiveRAGSettings(
                rag_enabled=user_settings.rag_enabled,
                rag_disabled_by=(
                    "user"
                    if not user_settings.rag_enabled
                    else ("team" if not team_settings.rag_enabled else None)
                ),
                chunk_size=team_settings.chunk_size,
                chunk_overlap=team_settings.chunk_overlap,
                chunks_per_query=user_settings.chunks_per_query,
                similarity_threshold=user_settings.similarity_threshold,
                use_hybrid_search=team_settings.use_hybrid_search,
                reranking_enabled=team_settings.reranking_enabled,
                query_rewriting_enabled=team_settings.query_rewriting_enabled,
                customization_allowed=True,
                customization_disabled_by=None,
                max_documents_per_user=org_settings.max_documents_per_user,
                max_document_size_mb=org_settings.max_document_size_mb,
                allowed_file_types=org_settings.allowed_file_types,
            )
        # User cannot override - use team defaults
        disabled_by = "org" if not org_settings.allow_user_customization else "team"
        return EffectiveRAGSettings(
            rag_enabled=team_settings.rag_enabled,
            rag_disabled_by="team" if not team_settings.rag_enabled else None,
            chunk_size=team_settings.chunk_size,
            chunk_overlap=team_settings.chunk_overlap,
            chunks_per_query=team_settings.chunks_per_query,
            similarity_threshold=team_settings.similarity_threshold,
            use_hybrid_search=team_settings.use_hybrid_search,
            reranking_enabled=team_settings.reranking_enabled,
            query_rewriting_enabled=team_settings.query_rewriting_enabled,
            customization_allowed=False,
            customization_disabled_by=disabled_by,
            max_documents_per_user=org_settings.max_documents_per_user,
            max_document_size_mb=org_settings.max_document_size_mb,
            allowed_file_types=org_settings.allowed_file_types,
        )

    # Step 3: No team context - check if user can customize
    if org_settings.allow_user_customization:
        # User can customize - use user settings
        return EffectiveRAGSettings(
            rag_enabled=user_settings.rag_enabled,
            rag_disabled_by="user" if not user_settings.rag_enabled else None,
            chunk_size=org_settings.chunk_size,
            chunk_overlap=org_settings.chunk_overlap,
            chunks_per_query=user_settings.chunks_per_query,
            similarity_threshold=user_settings.similarity_threshold,
            use_hybrid_search=org_settings.use_hybrid_search,
            reranking_enabled=org_settings.reranking_enabled,
            query_rewriting_enabled=org_settings.query_rewriting_enabled,
            customization_allowed=True,
            customization_disabled_by=None,
            max_documents_per_user=org_settings.max_documents_per_user,
            max_document_size_mb=org_settings.max_document_size_mb,
            allowed_file_types=org_settings.allowed_file_types,
        )
    # User cannot customize - use org defaults
    return EffectiveRAGSettings(
        rag_enabled=org_settings.rag_enabled,
        rag_disabled_by="org" if not org_settings.rag_enabled else None,
        chunk_size=org_settings.chunk_size,
        chunk_overlap=org_settings.chunk_overlap,
        chunks_per_query=org_settings.chunks_per_query,
        similarity_threshold=org_settings.similarity_threshold,
        use_hybrid_search=org_settings.use_hybrid_search,
        reranking_enabled=org_settings.reranking_enabled,
        query_rewriting_enabled=org_settings.query_rewriting_enabled,
        customization_allowed=False,
        customization_disabled_by="org",
        max_documents_per_user=org_settings.max_documents_per_user,
        max_document_size_mb=org_settings.max_document_size_mb,
        allowed_file_types=org_settings.allowed_file_types,
    )
