import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProcessingStatus } from "@/lib/api";

interface DocumentStatusProps {
  status: ProcessingStatus;
  className?: string;
}

const STATUS_STYLES = {
  pending: {
    icon: Clock,
    variant: "secondary" as const,
    className: "text-yellow-600 dark:text-yellow-400",
  },
  processing: {
    icon: Loader2,
    variant: "secondary" as const,
    className: "text-blue-600 dark:text-blue-400",
    spin: true,
  },
  completed: {
    icon: CheckCircle2,
    variant: "default" as const,
    className: "text-green-600 dark:text-green-400",
  },
  failed: {
    icon: XCircle,
    variant: "destructive" as const,
    className: "text-red-600 dark:text-red-400",
  },
};

export function DocumentStatus({ status, className }: DocumentStatusProps) {
  const { t } = useTranslation();

  const getLabel = (s: ProcessingStatus): string => {
    switch (s) {
      case "pending":
        return t("docs_status_pending");
      case "processing":
        return t("docs_status_processing");
      case "completed":
        return t("docs_status_ready");
      case "failed":
        return t("docs_status_failed");
      default:
        return t("docs_status_pending");
    }
  };

  const config = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      <Icon
        className={cn(
          "h-3.5 w-3.5",
          config.className,
          "spin" in config && config.spin && "animate-spin",
        )}
      />
      <span>{getLabel(status)}</span>
    </Badge>
  );
}
