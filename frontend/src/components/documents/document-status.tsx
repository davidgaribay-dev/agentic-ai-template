import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ProcessingStatus } from "@/lib/api"

interface DocumentStatusProps {
  status: ProcessingStatus
  className?: string
}

export function DocumentStatus({ status, className }: DocumentStatusProps) {
  const statusConfig = {
    pending: {
      icon: Clock,
      label: "Pending",
      variant: "secondary" as const,
      className: "text-yellow-600 dark:text-yellow-400",
    },
    processing: {
      icon: Loader2,
      label: "Processing",
      variant: "secondary" as const,
      className: "text-blue-600 dark:text-blue-400",
      spin: true,
    },
    completed: {
      icon: CheckCircle2,
      label: "Ready",
      variant: "default" as const,
      className: "text-green-600 dark:text-green-400",
    },
    failed: {
      icon: XCircle,
      label: "Failed",
      variant: "destructive" as const,
      className: "text-red-600 dark:text-red-400",
    },
  }

  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      <Icon className={cn("h-3.5 w-3.5", config.className, config.spin && "animate-spin")} />
      <span>{config.label}</span>
    </Badge>
  )
}
