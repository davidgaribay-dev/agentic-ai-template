from functools import lru_cache
from typing import Literal

from langchain_core.language_models.chat_models import BaseChatModel

from backend.core.config import settings
from backend.core.logging import get_logger

logger = get_logger(__name__)

LLMProvider = Literal["anthropic", "openai", "google"]


@lru_cache
def get_chat_model(provider: LLMProvider | None = None) -> BaseChatModel:
    """Get a chat model instance for the specified provider (legacy, uses env vars).

    This function is cached and uses environment variables directly.
    For multi-tenant support with Infisical, use get_chat_model_with_context instead.

    Args:
        provider: LLM provider to use. Defaults to settings.DEFAULT_LLM_PROVIDER

    Returns:
        A configured chat model instance

    Raises:
        ValueError: If the provider is not supported or API key is missing
    """
    provider = provider or settings.DEFAULT_LLM_PROVIDER

    logger.info("initializing_llm", provider=provider, source="environment")

    if provider == "anthropic":
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is not set")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=4096,
        )

    elif provider == "openai":
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is not set")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model="gpt-4o",
            api_key=settings.OPENAI_API_KEY,
        )

    elif provider == "google":
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is not set")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=settings.GOOGLE_API_KEY,
        )

    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


def get_chat_model_with_context(
    org_id: str,
    team_id: str | None = None,
    provider: LLMProvider | None = None,
) -> BaseChatModel:
    """Get a chat model with API key from Infisical (multi-tenant).

    This function fetches the API key from Infisical with the following
    fallback chain:
    1. Team-level key (if team_id provided)
    2. Org-level key
    3. Environment variable

    Args:
        org_id: Organization ID for scoping
        team_id: Optional team ID for team-level override
        provider: LLM provider to use. If None, uses the org/team default

    Returns:
        A configured chat model instance

    Raises:
        ValueError: If no API key is available for the provider
    """
    from backend.core.secrets import get_secrets_service

    secrets = get_secrets_service()

    if provider is None:
        provider = secrets.get_default_provider(org_id, team_id)

    api_key = secrets.get_llm_api_key(provider, org_id, team_id)

    if not api_key:
        raise ValueError(
            f"No API key configured for {provider}. "
            f"Set it in team/org settings or via environment variable."
        )

    logger.info(
        "initializing_llm",
        provider=provider,
        org_id=org_id,
        team_id=team_id,
        source="infisical",
    )

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            api_key=api_key,
            max_tokens=4096,
        )

    elif provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model="gpt-4o",
            api_key=api_key,
        )

    elif provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            google_api_key=api_key,
        )

    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")


async def generate_conversation_title(
    user_message: str,
    assistant_response: str,
    org_id: str | None = None,
    team_id: str | None = None,
) -> str:
    """Generate a short, descriptive title for a conversation.

    Uses the LLM to summarize the first exchange into a concise title.

    Args:
        user_message: The user's first message
        assistant_response: The assistant's first response
        org_id: Optional organization ID for context-aware key fetching
        team_id: Optional team ID for context-aware key fetching

    Returns:
        A short title (5-7 words) summarizing the conversation topic
    """
    if org_id:
        llm = get_chat_model_with_context(org_id, team_id)
    else:
        llm = get_chat_model()

    prompt = f"""Generate a very short title (3-6 words max) that summarizes this conversation topic.
The title should be descriptive and help the user identify the conversation later.
Do NOT use quotes or punctuation. Just output the title text.

User: {user_message[:500]}
Assistant: {assistant_response[:500]}

Title:"""

    try:
        response = await llm.ainvoke(prompt)
        title = str(response.content).strip()
        title = title.strip('"\'').strip()
        if len(title) > 50:
            title = title[:47] + "..."
        return title or user_message[:50]
    except Exception as e:
        logger.warning("title_generation_failed", error=str(e))
        return user_message[:50] + ("..." if len(user_message) > 50 else "")
