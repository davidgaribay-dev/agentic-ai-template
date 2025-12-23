import { Link } from "@tanstack/react-router";
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
  const message = error.message || "An error occurred";

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
        title="Rate limit exceeded"
        description="Too many requests. Please wait a moment and try again."
        className={className}
      />
    );
  }

  // Check for network error
  if (ERROR_PATTERNS.NETWORK.pattern.test(message)) {
    return (
      <ErrorCard
        icon={<AlertCircle className="size-4" />}
        title="Connection error"
        description="Unable to connect to the server. Please check your internet connection."
        className={className}
      />
    );
  }

  // Default error display
  return (
    <ErrorCard
      icon={<AlertCircle className="size-4" />}
      title="Something went wrong"
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
      return "Team Settings";
    }
    if (organizationId) {
      return "Organization Settings";
    }
    return "Settings";
  };

  return (
    <ErrorCard
      icon={<KeyRound className="size-4" />}
      title={`${provider} API key not configured`}
      description={`To use the chat, you need to configure your ${provider} API key in your team or organization settings.`}
      action={
        <Link
          to={getSettingsLink()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Settings className="size-3" />
          Configure in {getSettingsLabel()}
        </Link>
      }
      className={className}
    />
  );
}
