"""Guardrails service for content filtering.

Provides functions for checking content against guardrails and
computing effective guardrails from the org/team/user hierarchy.
"""

from datetime import UTC, datetime
import re
import uuid

from sqlmodel import Session, select

from backend.guardrails.models import (
    EffectiveGuardrails,
    GuardrailAction,
    GuardrailMatch,
    GuardrailResult,
    OrganizationGuardrails,
    OrganizationGuardrailsUpdate,
    TeamGuardrails,
    TeamGuardrailsUpdate,
    UserGuardrails,
    UserGuardrailsUpdate,
)
from backend.guardrails.patterns import PII_PATTERNS


def get_or_create_org_guardrails(
    session: Session, organization_id: uuid.UUID
) -> OrganizationGuardrails:
    """Get or create guardrails for an organization."""
    statement = select(OrganizationGuardrails).where(
        OrganizationGuardrails.organization_id == organization_id
    )
    guardrails = session.exec(statement).first()

    if not guardrails:
        guardrails = OrganizationGuardrails(
            organization_id=organization_id,
            guardrails_enabled=True,
            input_blocked_keywords=[],
            input_blocked_patterns=[],
            input_action=GuardrailAction.BLOCK,
            output_blocked_keywords=[],
            output_blocked_patterns=[],
            output_action=GuardrailAction.REDACT,
            pii_detection_enabled=False,
            pii_types=[],
            pii_action=GuardrailAction.REDACT,
            allow_team_override=True,
            allow_user_override=True,
        )
        session.add(guardrails)
        session.commit()
        session.refresh(guardrails)

    return guardrails


def update_org_guardrails(
    session: Session, organization_id: uuid.UUID, data: OrganizationGuardrailsUpdate
) -> OrganizationGuardrails:
    """Update guardrails for an organization."""
    guardrails = get_or_create_org_guardrails(session, organization_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(guardrails, key, value)

    guardrails.updated_at = datetime.now(UTC)
    session.add(guardrails)
    session.commit()
    session.refresh(guardrails)

    return guardrails


def get_or_create_team_guardrails(
    session: Session, team_id: uuid.UUID
) -> TeamGuardrails:
    """Get or create guardrails for a team."""
    statement = select(TeamGuardrails).where(TeamGuardrails.team_id == team_id)
    guardrails = session.exec(statement).first()

    if not guardrails:
        guardrails = TeamGuardrails(
            team_id=team_id,
            guardrails_enabled=True,
            input_blocked_keywords=[],
            input_blocked_patterns=[],
            input_action=GuardrailAction.BLOCK,
            output_blocked_keywords=[],
            output_blocked_patterns=[],
            output_action=GuardrailAction.REDACT,
            pii_detection_enabled=False,
            pii_types=[],
            pii_action=GuardrailAction.REDACT,
        )
        session.add(guardrails)
        session.commit()
        session.refresh(guardrails)

    return guardrails


def update_team_guardrails(
    session: Session, team_id: uuid.UUID, data: TeamGuardrailsUpdate
) -> TeamGuardrails:
    """Update guardrails for a team."""
    guardrails = get_or_create_team_guardrails(session, team_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(guardrails, key, value)

    guardrails.updated_at = datetime.now(UTC)
    session.add(guardrails)
    session.commit()
    session.refresh(guardrails)

    return guardrails


def get_or_create_user_guardrails(
    session: Session, user_id: uuid.UUID
) -> UserGuardrails:
    """Get or create guardrails for a user."""
    statement = select(UserGuardrails).where(UserGuardrails.user_id == user_id)
    guardrails = session.exec(statement).first()

    if not guardrails:
        guardrails = UserGuardrails(
            user_id=user_id,
            guardrails_enabled=True,
            input_blocked_keywords=[],
            input_blocked_patterns=[],
            input_action=GuardrailAction.BLOCK,
            output_blocked_keywords=[],
            output_blocked_patterns=[],
            output_action=GuardrailAction.REDACT,
            pii_detection_enabled=False,
            pii_types=[],
            pii_action=GuardrailAction.REDACT,
        )
        session.add(guardrails)
        session.commit()
        session.refresh(guardrails)

    return guardrails


def update_user_guardrails(
    session: Session, user_id: uuid.UUID, data: UserGuardrailsUpdate
) -> UserGuardrails:
    """Update guardrails for a user."""
    guardrails = get_or_create_user_guardrails(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(guardrails, key, value)

    guardrails.updated_at = datetime.now(UTC)
    session.add(guardrails)
    session.commit()
    session.refresh(guardrails)

    return guardrails


def _get_most_restrictive_action(
    actions: list[GuardrailAction],
) -> GuardrailAction:
    """Get the most restrictive action from a list.

    Precedence: BLOCK > REDACT > WARN
    """
    if GuardrailAction.BLOCK in actions:
        return GuardrailAction.BLOCK
    if GuardrailAction.REDACT in actions:
        return GuardrailAction.REDACT
    return GuardrailAction.WARN


def get_effective_guardrails(
    session: Session,
    user_id: uuid.UUID,
    organization_id: uuid.UUID | None = None,
    team_id: uuid.UUID | None = None,
) -> EffectiveGuardrails:
    """Compute effective guardrails by applying hierarchy: Org > Team > User.

    The hierarchy works as follows:
    - Keywords and patterns are merged (union from all levels)
    - Actions use the most restrictive (block > redact > warn)
    - If org disables guardrails, they're disabled for everyone
    - If org disallows team/user override, those levels can't add rules
    """
    org_guardrails = None
    team_guardrails = None
    user_guardrails = get_or_create_user_guardrails(session, user_id)

    if organization_id:
        org_guardrails = get_or_create_org_guardrails(session, organization_id)
    if team_id:
        team_guardrails = get_or_create_team_guardrails(session, team_id)

    # Check if guardrails are enabled at each level
    guardrails_enabled = True
    guardrails_disabled_by = None

    if org_guardrails and not org_guardrails.guardrails_enabled:
        guardrails_enabled = False
        guardrails_disabled_by = "org"
    elif team_guardrails and not team_guardrails.guardrails_enabled:
        guardrails_enabled = False
        guardrails_disabled_by = "team"
    elif not user_guardrails.guardrails_enabled:
        guardrails_enabled = False

    # Merge input blocked keywords (union)
    input_blocked_keywords: set[str] = set()
    if org_guardrails:
        input_blocked_keywords.update(org_guardrails.input_blocked_keywords or [])
    if team_guardrails and (not org_guardrails or org_guardrails.allow_team_override):
        input_blocked_keywords.update(team_guardrails.input_blocked_keywords or [])
    if (not org_guardrails or org_guardrails.allow_user_override) and (
        not team_guardrails or not org_guardrails or org_guardrails.allow_user_override
    ):
        input_blocked_keywords.update(user_guardrails.input_blocked_keywords or [])

    # Merge input blocked patterns (union)
    input_blocked_patterns: set[str] = set()
    if org_guardrails:
        input_blocked_patterns.update(org_guardrails.input_blocked_patterns or [])
    if team_guardrails and (not org_guardrails or org_guardrails.allow_team_override):
        input_blocked_patterns.update(team_guardrails.input_blocked_patterns or [])
    if not org_guardrails or org_guardrails.allow_user_override:
        input_blocked_patterns.update(user_guardrails.input_blocked_patterns or [])

    # Merge output blocked keywords (union)
    output_blocked_keywords: set[str] = set()
    if org_guardrails:
        output_blocked_keywords.update(org_guardrails.output_blocked_keywords or [])
    if team_guardrails and (not org_guardrails or org_guardrails.allow_team_override):
        output_blocked_keywords.update(team_guardrails.output_blocked_keywords or [])
    if not org_guardrails or org_guardrails.allow_user_override:
        output_blocked_keywords.update(user_guardrails.output_blocked_keywords or [])

    # Merge output blocked patterns (union)
    output_blocked_patterns: set[str] = set()
    if org_guardrails:
        output_blocked_patterns.update(org_guardrails.output_blocked_patterns or [])
    if team_guardrails and (not org_guardrails or org_guardrails.allow_team_override):
        output_blocked_patterns.update(team_guardrails.output_blocked_patterns or [])
    if not org_guardrails or org_guardrails.allow_user_override:
        output_blocked_patterns.update(user_guardrails.output_blocked_patterns or [])

    # Get most restrictive input action
    input_actions = [user_guardrails.input_action]
    if org_guardrails:
        input_actions.append(org_guardrails.input_action)
    if team_guardrails:
        input_actions.append(team_guardrails.input_action)
    input_action = _get_most_restrictive_action(input_actions)

    # Get most restrictive output action
    output_actions = [user_guardrails.output_action]
    if org_guardrails:
        output_actions.append(org_guardrails.output_action)
    if team_guardrails:
        output_actions.append(team_guardrails.output_action)
    output_action = _get_most_restrictive_action(output_actions)

    # Merge PII settings
    pii_detection_enabled = user_guardrails.pii_detection_enabled
    if org_guardrails and org_guardrails.pii_detection_enabled:
        pii_detection_enabled = True
    if team_guardrails and team_guardrails.pii_detection_enabled:
        pii_detection_enabled = True

    pii_types: set[str] = set()
    if org_guardrails and org_guardrails.pii_types:
        pii_types.update(org_guardrails.pii_types)
    if team_guardrails and team_guardrails.pii_types:
        pii_types.update(team_guardrails.pii_types)
    if user_guardrails.pii_types:
        pii_types.update(user_guardrails.pii_types)

    # Get most restrictive PII action
    pii_actions = [user_guardrails.pii_action]
    if org_guardrails:
        pii_actions.append(org_guardrails.pii_action)
    if team_guardrails:
        pii_actions.append(team_guardrails.pii_action)
    pii_action = _get_most_restrictive_action(pii_actions)

    # Check if user can modify
    can_user_modify = True
    if org_guardrails and not org_guardrails.allow_user_override:
        can_user_modify = False

    return EffectiveGuardrails(
        guardrails_enabled=guardrails_enabled,
        guardrails_disabled_by=guardrails_disabled_by,
        input_blocked_keywords=list(input_blocked_keywords),
        input_blocked_patterns=list(input_blocked_patterns),
        input_action=input_action,
        output_blocked_keywords=list(output_blocked_keywords),
        output_blocked_patterns=list(output_blocked_patterns),
        output_action=output_action,
        pii_detection_enabled=pii_detection_enabled,
        pii_types=list(pii_types),
        pii_action=pii_action,
        can_user_modify=can_user_modify,
    )


def _check_keywords(content: str, keywords: list[str]) -> list[GuardrailMatch]:
    """Check content for blocked keywords (case-insensitive word boundaries)."""
    matches = []
    content_lower = content.lower()

    for keyword in keywords:
        keyword_lower = keyword.lower()
        # Use word boundary matching for keywords
        pattern = rf"\b{re.escape(keyword_lower)}\b"
        for match in re.finditer(pattern, content_lower, re.IGNORECASE):
            matches.append(
                GuardrailMatch(
                    pattern=keyword,
                    pattern_type="keyword",
                    matched_text=content[match.start() : match.end()],
                    start=match.start(),
                    end=match.end(),
                )
            )

    return matches


def _check_patterns(content: str, patterns: list[str]) -> list[GuardrailMatch]:
    """Check content against regex patterns."""
    matches = []

    for pattern in patterns:
        try:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                matches.append(
                    GuardrailMatch(
                        pattern=pattern,
                        pattern_type="regex",
                        matched_text=match.group(),
                        start=match.start(),
                        end=match.end(),
                    )
                )
        except re.error:
            # Invalid regex pattern, skip it
            continue

    return matches


def _check_pii(content: str, pii_types: list[str]) -> list[GuardrailMatch]:
    """Check content for PII patterns."""
    matches = []

    for pii_type in pii_types:
        pattern = PII_PATTERNS.get(pii_type)
        if not pattern:
            continue

        for match in re.finditer(pattern, content, re.IGNORECASE):
            matches.append(
                GuardrailMatch(
                    pattern=f"PII:{pii_type}",
                    pattern_type="pii",
                    matched_text=match.group(),
                    start=match.start(),
                    end=match.end(),
                )
            )

    return matches


def check_input(content: str, guardrails: EffectiveGuardrails) -> GuardrailResult:
    """Check user input against guardrails.

    Returns a result indicating if the content passed and any matches found.
    """
    if not guardrails.guardrails_enabled:
        return GuardrailResult(passed=True)

    all_matches: list[GuardrailMatch] = []

    # Check keywords
    keyword_matches = _check_keywords(content, guardrails.input_blocked_keywords)
    all_matches.extend(keyword_matches)

    # Check patterns
    pattern_matches = _check_patterns(content, guardrails.input_blocked_patterns)
    all_matches.extend(pattern_matches)

    # Check PII if enabled
    if guardrails.pii_detection_enabled and guardrails.pii_types:
        pii_matches = _check_pii(content, guardrails.pii_types)
        all_matches.extend(pii_matches)

    if not all_matches:
        return GuardrailResult(passed=True)

    # Determine action - PII matches use PII action, others use input action
    has_pii_match = any(m.pattern_type == "pii" for m in all_matches)
    has_other_match = any(m.pattern_type != "pii" for m in all_matches)

    actions_to_consider = []
    if has_other_match:
        actions_to_consider.append(guardrails.input_action)
    if has_pii_match:
        actions_to_consider.append(guardrails.pii_action)

    action = _get_most_restrictive_action(actions_to_consider)

    # Apply action
    if action == GuardrailAction.BLOCK:
        return GuardrailResult(
            passed=False,
            action=action,
            matches=all_matches,
            message="Message blocked by content policy",
        )
    if action == GuardrailAction.REDACT:
        redacted = apply_redactions(content, all_matches)
        return GuardrailResult(
            passed=True,
            action=action,
            matches=all_matches,
            redacted_content=redacted,
        )
    # WARN
    return GuardrailResult(
        passed=True,
        action=action,
        matches=all_matches,
    )


def check_output(content: str, guardrails: EffectiveGuardrails) -> GuardrailResult:
    """Check LLM output against guardrails.

    Returns a result indicating if the content passed and any matches found.
    """
    if not guardrails.guardrails_enabled:
        return GuardrailResult(passed=True)

    all_matches: list[GuardrailMatch] = []

    # Check keywords
    keyword_matches = _check_keywords(content, guardrails.output_blocked_keywords)
    all_matches.extend(keyword_matches)

    # Check patterns
    pattern_matches = _check_patterns(content, guardrails.output_blocked_patterns)
    all_matches.extend(pattern_matches)

    # Check PII if enabled
    if guardrails.pii_detection_enabled and guardrails.pii_types:
        pii_matches = _check_pii(content, guardrails.pii_types)
        all_matches.extend(pii_matches)

    if not all_matches:
        return GuardrailResult(passed=True)

    # Determine action - PII matches use PII action, others use output action
    has_pii_match = any(m.pattern_type == "pii" for m in all_matches)
    has_other_match = any(m.pattern_type != "pii" for m in all_matches)

    actions_to_consider = []
    if has_other_match:
        actions_to_consider.append(guardrails.output_action)
    if has_pii_match:
        actions_to_consider.append(guardrails.pii_action)

    action = _get_most_restrictive_action(actions_to_consider)

    # Apply action
    if action == GuardrailAction.BLOCK:
        return GuardrailResult(
            passed=False,
            action=action,
            matches=all_matches,
            message="Response blocked by content policy",
        )
    if action == GuardrailAction.REDACT:
        redacted = apply_redactions(content, all_matches)
        return GuardrailResult(
            passed=True,
            action=action,
            matches=all_matches,
            redacted_content=redacted,
        )
    # WARN
    return GuardrailResult(
        passed=True,
        action=action,
        matches=all_matches,
    )


def apply_redactions(content: str, matches: list[GuardrailMatch]) -> str:
    """Replace matched content with [REDACTED].

    Handles overlapping matches by processing from end to start.
    """
    if not matches:
        return content

    # Sort by start position descending to avoid offset issues
    sorted_matches = sorted(matches, key=lambda m: m.start, reverse=True)

    result = content
    for match in sorted_matches:
        result = result[: match.start] + "[REDACTED]" + result[match.end :]

    return result


def test_guardrails(
    content: str,
    direction: str,
    guardrails: EffectiveGuardrails,
) -> GuardrailResult:
    """Test content against guardrails without actually blocking.

    This is a dry-run for users to test their guardrail configuration.
    """
    if direction == "input":
        return check_input(content, guardrails)
    return check_output(content, guardrails)
