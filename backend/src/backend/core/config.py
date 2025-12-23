from functools import lru_cache
import os
import secrets
from typing import Annotated, Any, Literal
import warnings

from pydantic import (
    AnyUrl,
    BeforeValidator,
    ValidationInfo,
    computed_field,
    field_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

# Minimum recommended length for SECRET_KEY in characters
MIN_SECRET_KEY_LENGTH = 32


def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    if isinstance(v, list | str):
        return v
    raise ValueError(v)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    API_V1_STR: str = "/v1"
    PROJECT_NAME: str = "AI Agent API"
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000
    FRONTEND_URL: str = "http://localhost:5173"

    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    CORS_ORIGINS: Annotated[list[AnyUrl] | str, BeforeValidator(parse_cors)] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        """Return all CORS origins as strings."""
        origins = [str(origin).rstrip("/") for origin in self.CORS_ORIGINS]
        if self.FRONTEND_URL and self.FRONTEND_URL not in origins:
            origins.append(self.FRONTEND_URL.rstrip("/"))
        return origins

    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "changethis"
    POSTGRES_DB: str = "app"

    @field_validator("POSTGRES_PASSWORD", mode="after")
    @classmethod
    def validate_postgres_password(cls, v: str, info: ValidationInfo) -> str:
        """Validate that POSTGRES_PASSWORD is changed in production."""
        env = (
            info.data.get("ENVIRONMENT")
            if info.data
            else os.getenv("ENVIRONMENT", "local")
        )
        if v == "changethis" and env == "production":
            raise ValueError(
                "POSTGRES_PASSWORD must be changed from default value in production. "
                "Set a strong, unique password via the POSTGRES_PASSWORD environment variable."
            )
        if v == "changethis" and env != "local":
            warnings.warn(
                "POSTGRES_PASSWORD is set to default value 'changethis'. "
                "Consider using a strong, unique password.",
                UserWarning,
                stacklevel=2,
            )
        return v

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> MultiHostUrl:
        """Build PostgreSQL connection URI for SQLAlchemy."""
        return MultiHostUrl.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def CHECKPOINT_DATABASE_URI(self) -> str:
        """Build PostgreSQL connection URI for LangGraph checkpointer."""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # JWT Security Settings
    # SECRET_KEY should be set via environment variable in production
    # If not set, a random key is generated (only suitable for development)
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def validate_secret_key(cls, v: str, info: ValidationInfo) -> str:
        """Validate and warn about SECRET_KEY configuration."""
        if not v:
            generated_key = secrets.token_urlsafe(MIN_SECRET_KEY_LENGTH)
            warnings.warn(
                "SECRET_KEY not set! Using a randomly generated key. "
                "This is only suitable for development. "
                "Set SECRET_KEY environment variable in production.",
                UserWarning,
                stacklevel=2,
            )
            return generated_key
        if len(v) < MIN_SECRET_KEY_LENGTH:
            warnings.warn(
                f"SECRET_KEY is shorter than {MIN_SECRET_KEY_LENGTH} characters. "
                "Consider using a longer key for better security.",
                UserWarning,
                stacklevel=2,
            )
        return v

    FIRST_SUPERUSER_EMAIL: str = "admin@example.com"
    FIRST_SUPERUSER_PASSWORD: str = "changethis"

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: str | None = None
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    EMAILS_FROM_EMAIL: str | None = None
    EMAILS_FROM_NAME: str | None = None
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        """Check if email sending is properly configured."""
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    S3_ENDPOINT_URL: str = "http://localhost:8333"
    S3_ACCESS_KEY: str = "any"
    S3_SECRET_KEY: str = "any"
    S3_BUCKET_NAME: str = "uploads"
    S3_PUBLIC_URL: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def s3_public_base_url(self) -> str:
        """Return the public base URL for S3 objects."""
        return self.S3_PUBLIC_URL or self.S3_ENDPOINT_URL

    ANTHROPIC_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None

    DEFAULT_LLM_PROVIDER: Literal["anthropic", "openai", "google"] = "anthropic"

    # Memory Store - uses OpenAI embeddings for semantic search
    MEMORY_EMBEDDING_MODEL: str = "text-embedding-3-small"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def MEMORY_DATABASE_URI(self) -> str:
        """Build PostgreSQL connection URI for LangGraph memory store."""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_llm_api_key(self) -> bool:
        """Check if at least one LLM API key is configured via environment."""
        return any(
            [
                self.ANTHROPIC_API_KEY,
                self.OPENAI_API_KEY,
                self.GOOGLE_API_KEY,
            ]
        )

    # Infisical Secrets Management
    INFISICAL_URL: str | None = None
    INFISICAL_CLIENT_ID: str | None = None
    INFISICAL_CLIENT_SECRET: str | None = None
    INFISICAL_PROJECT_ID: str | None = None
    INFISICAL_ENVIRONMENT: str = "dev"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def infisical_enabled(self) -> bool:
        """Check if Infisical is properly configured."""
        return all(
            [
                self.INFISICAL_URL,
                self.INFISICAL_CLIENT_ID,
                self.INFISICAL_CLIENT_SECRET,
                self.INFISICAL_PROJECT_ID,
            ]
        )

    # OpenSearch Configuration
    OPENSEARCH_URL: str | None = None
    OPENSEARCH_VERIFY_CERTS: bool = False
    OPENSEARCH_AUDIT_RETENTION_DAYS: int = 90
    OPENSEARCH_APP_LOG_RETENTION_DAYS: int = 30

    @computed_field  # type: ignore[prop-decorator]
    @property
    def opensearch_enabled(self) -> bool:
        """Check if OpenSearch is configured."""
        return bool(self.OPENSEARCH_URL)

    # Langfuse - LLM Observability
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str = "http://localhost:3001"
    LANGFUSE_BASE_URL: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def langfuse_base_url(self) -> str:
        return self.LANGFUSE_BASE_URL or self.LANGFUSE_HOST

    @computed_field  # type: ignore[prop-decorator]
    @property
    def langfuse_enabled(self) -> bool:
        return bool(self.LANGFUSE_PUBLIC_KEY and self.LANGFUSE_SECRET_KEY)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
