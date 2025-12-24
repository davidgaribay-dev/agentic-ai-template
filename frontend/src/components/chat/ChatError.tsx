import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AlertCircle, Settings, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatErrorProps {
  error: Error;
  className?: string;
  /** Organization ID for building settings links */
  organizationId?: string;
  /** Team ID for building settings links */
  teamId?: string;
}

/** Known error patterns with user-friendly messages and actions */
const ERROR_PATTERNS = {
  API_KEY_MISSING: {
    pattern: /No API key configured for (\w+)/i,
    getProvider: (match: RegExpMatchArray) => match[1],
  },
  RATE_LIMIT: {
    pattern: /rate limit|too many requests/i,
  },
  NETWORK: {
    pattern: /network|fetch|connection|timeout/i,
  },
} as const;

export function ChatError({
  error,
  className,
  organizationId,
  teamId,
}: ChatErrorProps) {
  const { t } = useTranslation();
  const message = error.message || t("error_occurred");

  // Check for API key configuration error
  const apiKeyMatch = message.match(ERROR_PATTERNS.API_KEY_MISSING.pattern);
  if (apiKeyMatch) {
    const provider = ERROR_PATTERNS.API_KEY_MISSING.getProvider(apiKeyMatch);
    return (
      <ApiKeyError
        provider={provider}
        organizationId={organizationId}
        teamId={teamId}
        className={className}
      />
    );
  }

  // Check for rate limit error
  if (ERROR_PATTERNS.RATE_LIMIT.pattern.test(message)) {
    return (
      <ErrorCard
        icon={<AlertCircle className="size-4" />}
        title={t("error_rate_limit")}
        description={t("error_rate_limit_desc")}
        className={className}
      />
    );
  }

  // Check for network error
  if (ERROR_PATTERNS.NETWORK.pattern.test(message)) {
    return (
      <ErrorCard
        icon={<AlertCircle className="size-4" />}
        title={t("error_connection")}
        description={t("error_connection_desc")}
        className={className}
      />
    );
  }

  // Default error display
  return (
    <ErrorCard
      icon={<AlertCircle className="size-4" />}
      title={t("error_something_wrong")}
      description={message}
      className={className}
    />
  );
}

interface ErrorCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

function ErrorCard({
  icon,
  title,
  description,
  action,
  className,
}: ErrorCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm",
        className,
      )}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        {icon}
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-medium text-destructive">{title}</p>
        <p className="text-muted-foreground">{description}</p>
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

interface ApiKeyErrorProps {
  provider: string;
  organizationId?: string;
  teamId?: string;
  className?: string;
}

function ApiKeyError({
  provider,
  organizationId,
  teamId,
  className,
}: ApiKeyErrorProps) {
  const { t } = useTranslation();

  // Build the settings link based on available context
  const getSettingsLink = () => {
    if (organizationId && teamId) {
      return `/org/team/${teamId}/settings`;
    }
    if (organizationId) {
      return "/org/settings";
    }
    return "/settings";
  };

  const getSettingsLabel = () => {
    if (teamId) {
      return t("error_team_settings");
    }
    if (organizationId) {
      return t("error_org_settings");
    }
    return t("com_settings");
  };

  return (
    <ErrorCard
      icon={<KeyRound className="size-4" />}
      title={t("error_api_key_not_configured", { provider })}
      description={t("error_api_key_configure_prompt", { provider })}
      action={
        <Link
          to={getSettingsLink()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Settings className="size-3" />
          {t("error_configure_in", { label: getSettingsLabel() })}
        </Link>
      }
      className={className}
    />
  );
}
