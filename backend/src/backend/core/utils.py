from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import logging
from pathlib import Path
from typing import Any

import emails
from jinja2 import Template
import jwt

from backend.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_path = (
        Path(__file__).parent.parent / "email-templates" / "build" / template_name
    )
    if not template_path.exists():
        # Fallback to a simple template if build doesn't exist
        template_path = Path(__file__).parent.parent / "email-templates" / template_name

    if template_path.exists():
        template_str = template_path.read_text()
        return Template(template_str).render(context)

    # Generate simple HTML if template not found
    return f"""
    <html>
    <body>
        <h1>{context.get("subject", "Email")}</h1>
        <p>Link: <a href="{context.get("link", "#")}">{context.get("link", "Click here")}</a></p>
    </body>
    </html>
    """


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    """Send an email using SMTP.

    Args:
        email_to: Recipient email address
        subject: Email subject
        html_content: HTML content of the email
    """
    if not settings.emails_enabled:
        logger.warning("Email sending is not configured. Skipping email.")
        return

    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    smtp_options: dict[str, Any] = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
    }
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_options["password"] = settings.SMTP_PASSWORD

    response = message.send(to=email_to, smtp=smtp_options)
    logger.info(f"Email sent to {email_to}, response: {response}")


def generate_password_reset_token(email: str, password_changed_at: datetime) -> str:
    """Generate a password reset token.

    The token includes a timestamp of when the password was last changed,
    which is used to invalidate the token after a password reset.

    Args:
        email: User's email address
        password_changed_at: Timestamp of when the password was last changed

    Returns:
        JWT token for password reset
    """
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(UTC)
    expires = now + delta
    exp = expires.timestamp()
    return jwt.encode(
        {
            "exp": exp,
            "nbf": now.timestamp(),
            "sub": email,
            "pca": password_changed_at.timestamp(),  # password_changed_at for invalidation
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def verify_password_reset_token(token: str) -> tuple[str, float] | None:
    """Verify a password reset token.

    Args:
        token: JWT token to verify

    Returns:
        Tuple of (email, password_changed_at_timestamp) if token is valid, None otherwise
    """
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        email = str(decoded_token["sub"])
        pca = float(decoded_token.get("pca", 0))
    except jwt.InvalidTokenError:
        return None
    else:
        return (email, pca)


def generate_password_recovery_email(
    email_to: str, email: str, token: str
) -> EmailData:
    """Generate password recovery email data.

    Args:
        email_to: Recipient email address
        email: User's email (for display)
        token: Password reset token

    Returns:
        EmailData with HTML content and subject
    """
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password Recovery"
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": project_name,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
            "subject": subject,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    """Generate new account welcome email data.

    Args:
        email_to: Recipient email address
        username: User's username/email
        password: User's initial password

    Returns:
        EmailData with HTML content and subject
    """
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New Account"
    link = settings.FRONTEND_URL

    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": project_name,
            "username": username,
            "password": password,
            "email": email_to,
            "link": link,
            "subject": subject,
        },
    )
    return EmailData(html_content=html_content, subject=subject)
