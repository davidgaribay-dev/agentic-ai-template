/**
 * Standardized error display component using the Alert primitive.
 */

import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getApiErrorMessage } from "@/lib/api";

interface ErrorAlertProps {
  /** The error to display. Can be an Error object, API error, or unknown. */
  error: unknown;
  /** Fallback message when error cannot be parsed */
  fallback?: string;
  /** Optional title for the error alert */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * A standardized error alert component that handles various error types
 * and displays them in a consistent format.
 */
export function ErrorAlert({
  error,
  fallback,
  title,
  className,
}: ErrorAlertProps) {
  const { t } = useTranslation();
  const effectiveFallback = fallback ?? t("error_default");
  const message = getApiErrorMessage(error, effectiveFallback);

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="size-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
