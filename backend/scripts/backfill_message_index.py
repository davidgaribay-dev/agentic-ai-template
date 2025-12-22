"""One-time script to backfill conversation_message index from existing LangGraph checkpoints.

This script extracts messages from LangGraph's checkpointer and populates the
conversation_message index table for fast search. Only needed for conversations
that existed before the message indexing feature was implemented.

Usage:
    uv run python scripts/backfill_message_index.py

The script will:
1. Fetch all existing conversations from the database
2. For each conversation, extract message history from LangGraph checkpointer
3. Index each message (user and assistant) into the conversation_message table
4. Skip conversations that already have indexed messages
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from backend.agents.base import get_conversation_history
from backend.conversations.crud import create_conversation_message
from backend.conversations.models import Conversation, ConversationMessage
from backend.core.db import engine
from backend.core.logging import get_logger
from sqlmodel import Session, select, func

logger = get_logger(__name__)


def get_all_conversations(session: Session) -> list[Conversation]:
    """Fetch all conversations from the database."""
    statement = select(Conversation).where(Conversation.deleted_at.is_(None))
    return list(session.exec(statement).all())


def count_indexed_messages(session: Session, conversation_id: str) -> int:
    """Count how many messages are already indexed for a conversation."""
    statement = select(func.count(ConversationMessage.id)).where(
        ConversationMessage.conversation_id == conversation_id
    )
    return session.exec(statement).one()


async def backfill_conversation(
    session: Session, conversation: Conversation, dry_run: bool = False
) -> tuple[int, int]:
    """Backfill messages for a single conversation.

    Returns:
        Tuple of (messages_extracted, messages_indexed)
    """
    conv_id = str(conversation.id)

    # Check if already indexed
    existing_count = count_indexed_messages(session, conv_id)
    if existing_count > 0:
        logger.info(
            "conversation_already_indexed",
            conversation_id=conv_id,
            existing_messages=existing_count,
        )
        return 0, 0

    # Extract messages from LangGraph checkpointer
    try:
        messages = await get_conversation_history(conv_id)
    except Exception as e:
        logger.warning(
            "failed_to_get_conversation_history",
            conversation_id=conv_id,
            error=str(e),
        )
        return 0, 0

    if not messages:
        logger.info("no_messages_in_conversation", conversation_id=conv_id)
        return 0, 0

    # Index each message
    indexed_count = 0
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")

        if not role or not content:
            continue

        if dry_run:
            logger.info(
                "dry_run_would_index_message",
                conversation_id=conv_id,
                role=role,
                content_length=len(content),
            )
            indexed_count += 1
        else:
            try:
                create_conversation_message(
                    session=session,
                    conversation_id=conversation.id,
                    role=role,
                    content=content,
                    organization_id=conversation.organization_id,
                    team_id=conversation.team_id,
                    created_by_id=conversation.created_by_id,
                )
                indexed_count += 1
            except Exception as e:
                logger.warning(
                    "failed_to_index_message",
                    conversation_id=conv_id,
                    role=role,
                    error=str(e),
                )

    logger.info(
        "conversation_backfilled",
        conversation_id=conv_id,
        messages_extracted=len(messages),
        messages_indexed=indexed_count,
        dry_run=dry_run,
    )

    return len(messages), indexed_count


async def main(dry_run: bool = False):
    """Main backfill logic.

    Args:
        dry_run: If True, only simulate the backfill without writing to database
    """
    logger.info("backfill_started", dry_run=dry_run)

    with Session(engine) as session:
        conversations = get_all_conversations(session)
        total_conversations = len(conversations)

        logger.info("conversations_found", count=total_conversations)

        total_extracted = 0
        total_indexed = 0
        processed = 0

        for i, conversation in enumerate(conversations, 1):
            logger.info(
                "processing_conversation",
                progress=f"{i}/{total_conversations}",
                conversation_id=str(conversation.id),
                title=conversation.title,
            )

            extracted, indexed = await backfill_conversation(
                session, conversation, dry_run=dry_run
            )
            total_extracted += extracted
            total_indexed += indexed
            processed += 1 if indexed > 0 else 0

        logger.info(
            "backfill_completed",
            total_conversations=total_conversations,
            conversations_processed=processed,
            total_messages_extracted=total_extracted,
            total_messages_indexed=total_indexed,
            dry_run=dry_run,
        )

        if dry_run:
            print("\n" + "=" * 60)
            print("DRY RUN SUMMARY")
            print("=" * 60)
            print(f"Total conversations: {total_conversations}")
            print(f"Conversations to backfill: {processed}")
            print(f"Total messages to index: {total_indexed}")
            print("\nRun without --dry-run to perform actual backfill")
        else:
            print("\n" + "=" * 60)
            print("BACKFILL COMPLETE")
            print("=" * 60)
            print(f"Total conversations: {total_conversations}")
            print(f"Conversations backfilled: {processed}")
            print(f"Total messages indexed: {total_indexed}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Backfill conversation message index from LangGraph checkpoints"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the backfill without writing to database",
    )
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run))
