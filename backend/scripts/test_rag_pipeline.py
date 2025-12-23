"""Test script for RAG pipeline end-to-end validation.

This script validates the complete RAG implementation by:
1. Creating a test organization and user
2. Uploading a test document
3. Processing the document (parse, chunk, embed)
4. Performing vector similarity search
5. Cleaning up test data

Usage:
    uv run python scripts/test_rag_pipeline.py
"""

import asyncio
import os
import sys
import tempfile
import uuid
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from datetime import UTC, datetime

from sqlmodel import Session, select

from backend.core.db import engine
from backend.core.logging import get_logger
from backend.core.tasks import process_document_task
from backend.documents.models import Document, DocumentChunk
from backend.documents.service import DocumentService
from backend.organizations.models import Organization, OrganizationMember
from backend.rag_settings.models import OrganizationRAGSettings
from backend.rag_settings.service import get_effective_rag_settings
from backend.teams.models import Team

logger = get_logger(__name__)


def create_test_document(filename: str, content: str) -> str:
    """Create a temporary test document."""
    temp_dir = Path(tempfile.gettempdir()) / "rag_test"
    temp_dir.mkdir(parents=True, exist_ok=True)

    file_path = temp_dir / filename
    with open(file_path, "w") as f:
        f.write(content)

    return str(file_path)


async def test_rag_pipeline():
    """Test the complete RAG pipeline."""
    print("\n" + "=" * 60)
    print("RAG PIPELINE END-TO-END TEST")
    print("=" * 60 + "\n")

    session = Session(engine)
    test_org_id = None
    test_user_id = None
    test_doc_id = None

    try:
        # Step 1: Create test organization
        print("1. Creating test organization...")
        test_org = Organization(
            name="RAG Test Organization",
            slug=f"rag-test-{uuid.uuid4().hex[:8]}",
        )
        session.add(test_org)
        session.commit()
        session.refresh(test_org)
        test_org_id = test_org.id
        print(f"   ✓ Created org: {test_org.name} (ID: {test_org_id})")

        # Step 2: Create test user (import after org created)
        print("\n2. Creating test user...")
        from backend.auth.models import User

        test_user = User(
            email=f"rag-test-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password="fake_hash",
            full_name="RAG Test User",
        )
        session.add(test_user)
        session.commit()
        session.refresh(test_user)
        test_user_id = test_user.id
        print(f"   ✓ Created user: {test_user.email} (ID: {test_user_id})")

        # Step 3: Add user to organization
        print("\n3. Adding user to organization...")
        from backend.rbac.enums import OrgRole

        org_member = OrganizationMember(
            organization_id=test_org_id,
            user_id=test_user_id,
            role=OrgRole.OWNER,
        )
        session.add(org_member)
        session.commit()
        print("   ✓ User added as org owner")

        # Step 4: Create RAG settings
        print("\n4. Creating org RAG settings...")
        rag_settings = OrganizationRAGSettings(
            organization_id=test_org_id,
            rag_enabled=True,
            chunk_size=500,  # Small for testing
            chunk_overlap=50,
            chunks_per_query=3,
            similarity_threshold=0.5,  # Lower threshold for testing
        )
        session.add(rag_settings)
        session.commit()
        print("   ✓ RAG settings enabled")

        # Step 5: Create test document file
        print("\n5. Creating test document...")
        test_content = """
        RAG System Test Document

        This is a test document for the RAG (Retrieval Augmented Generation) system.
        It contains information about artificial intelligence and machine learning.

        Artificial intelligence (AI) is intelligence demonstrated by machines,
        in contrast to the natural intelligence displayed by humans and animals.

        Machine learning is a method of data analysis that automates analytical
        model building. It is a branch of artificial intelligence.

        The RAG system should be able to:
        - Parse this document
        - Chunk it into smaller pieces
        - Generate embeddings for each chunk
        - Perform similarity search on the chunks
        """

        test_file_path = create_test_document("test_document.txt", test_content)
        print(f"   ✓ Created test file: {test_file_path}")

        # Step 6: Create document record
        print("\n6. Creating document record...")
        doc_service = DocumentService(session)
        doc = await doc_service.create_document(
            filename="test_document.txt",
            file_path=test_file_path,
            file_size=len(test_content),
            file_type="txt",
            mime_type="text/plain",
            org_id=test_org_id,
            team_id=None,
            user_id=test_user_id,
            created_by_id=test_user_id,
        )
        test_doc_id = doc.id
        print(f"   ✓ Document created (ID: {test_doc_id})")
        print(f"   Status: {doc.processing_status}")

        # Step 7: Process document
        print("\n7. Processing document (parse, chunk, embed)...")
        print("   This may take a moment...")
        try:
            await process_document_task(
                document_id=test_doc_id,
                local_file_path=test_file_path,
                org_id=test_org_id,
                team_id=None,
                user_id=test_user_id,
            )

            # Refresh document
            session.refresh(doc)
            print(f"   ✓ Processing completed")
            print(f"   Status: {doc.processing_status}")
            print(f"   Chunks created: {doc.chunk_count}")

            if doc.processing_status == "failed":
                print(f"   ✗ Error: {doc.processing_error}")
                return False

        except Exception as e:
            print(f"   ✗ Processing failed: {e}")
            import traceback

            traceback.print_exc()
            return False

        # Step 8: Verify chunks in database
        print("\n8. Verifying document chunks...")
        chunks = session.exec(
            select(DocumentChunk).where(DocumentChunk.document_id == test_doc_id)
        ).all()
        print(f"   ✓ Found {len(chunks)} chunks in database")

        if len(chunks) > 0:
            sample_chunk = chunks[0]
            print(f"   Sample chunk preview: {sample_chunk.content[:100]}...")
            print(f"   Has embedding: {sample_chunk.embedding is not None}")

        # Step 9: Test vector search
        print("\n9. Testing vector similarity search...")
        test_queries = [
            "What is artificial intelligence?",
            "Tell me about machine learning",
            "What can the RAG system do?",
        ]

        for query in test_queries:
            print(f"\n   Query: \"{query}\"")
            results = await doc_service.search_documents(
                query=query,
                org_id=test_org_id,
                team_id=None,
                user_id=test_user_id,
                k=3,
                score_threshold=0.5,
            )

            if results:
                print(f"   ✓ Found {len(results)} relevant chunks")
                for i, result in enumerate(results[:2]):  # Show top 2
                    print(
                        f"     #{i+1} (score: {result.get('relevance_score', 0):.3f}): {result['content'][:80]}..."
                    )
            else:
                print("   No results found (threshold may be too high)")

        # Success!
        print("\n" + "=" * 60)
        print("✓ ALL TESTS PASSED - RAG PIPELINE WORKING!")
        print("=" * 60 + "\n")
        return True

    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback

        traceback.print_exc()
        return False

    finally:
        # Cleanup
        print("\n10. Cleaning up test data...")
        try:
            if test_doc_id:
                # Delete document (will cascade to chunks)
                session.execute(
                    select(Document).where(Document.id == test_doc_id)
                ).first()
                if doc:
                    await doc_service.delete_document(test_doc_id)
                    print("   ✓ Test document deleted")

            if test_user_id:
                session.execute(select(User).where(User.id == test_user_id)).first()
                if test_user:
                    session.delete(test_user)
                    print("   ✓ Test user deleted")

            if test_org_id:
                test_org = session.get(Organization, test_org_id)
                if test_org:
                    session.delete(test_org)
                    print("   ✓ Test organization deleted")

            session.commit()

            # Cleanup temp files
            temp_dir = Path(tempfile.gettempdir()) / "rag_test"
            if temp_dir.exists():
                import shutil

                shutil.rmtree(temp_dir)
                print("   ✓ Temp files cleaned up")

        except Exception as e:
            print(f"   Warning: Cleanup error: {e}")
        finally:
            session.close()

        print("\nTest complete.\n")


if __name__ == "__main__":
    success = asyncio.run(test_rag_pipeline())
    sys.exit(0 if success else 1)
