import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Power, ChevronDown, ChevronRight } from "lucide-react";
import type { Prompt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type PromptScope, getQueryKey, activatePrompt } from "./types";
import { EditPromptDialog } from "./EditPromptDialog";
import { DeletePromptButton } from "./DeletePromptButton";

interface PromptRowProps {
  prompt: Prompt;
  scope: PromptScope;
  compact?: boolean;
}

export function PromptRow({ prompt, scope, compact = false }: PromptRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const activateMutation = useMutation({
    mutationFn: () => activatePrompt(scope, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
    },
  });

  const isSystem = prompt.prompt_type === "system";

  const sizes = compact
    ? {
        container: "rounded-md",
        text: "text-xs",
        icon: "size-3",
        badge: "text-[10px] h-4",
        pre: "text-[10px] max-h-24",
        padding: "px-2.5 py-2",
        expandPadding: "px-2.5 pb-2",
      }
    : {
        container: "rounded-lg",
        text: "text-sm",
        icon: "size-3.5",
        badge: "text-xs h-5",
        pre: "text-xs max-h-32",
        padding: "px-3 py-2.5",
        expandPadding: "px-3 pb-3",
      };

  return (
    <div
      className={`group ${sizes.container} bg-muted/30 hover:bg-muted/50 transition-colors`}
    >
      <div
        className={`flex items-center justify-between ${sizes.padding} cursor-pointer`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button className="text-muted-foreground hover:text-foreground">
            {expanded ? (
              <ChevronDown className={sizes.icon} />
            ) : (
              <ChevronRight className={sizes.icon} />
            )}
          </button>
          <span className={`${sizes.text} font-medium truncate`}>
            {prompt.name}
          </span>
          {isSystem && prompt.is_active && (
            <Badge
              variant="secondary"
              className={`bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 ${sizes.badge}`}
            >
              {t("com_active")}
            </Badge>
          )}
        </div>
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {isSystem && !prompt.is_active && (
            <Button
              variant="ghost"
              size="sm"
              className={compact ? "h-6 text-[10px] px-1.5" : "h-7 text-xs"}
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? (
                <Loader2
                  className={
                    compact ? "size-2.5 animate-spin" : "size-3 animate-spin"
                  }
                />
              ) : (
                <Power className={compact ? "size-2.5" : "size-3"} />
              )}
            </Button>
          )}
          <EditPromptDialog prompt={prompt} scope={scope} compact={compact} />
          <DeletePromptButton prompt={prompt} scope={scope} compact={compact} />
        </div>
      </div>
      {expanded && (
        <div className={sizes.expandPadding}>
          {prompt.description && (
            <p
              className={`${compact ? "text-[10px]" : "text-xs"} text-muted-foreground mb-${compact ? "1.5" : "2"}`}
            >
              {prompt.description}
            </p>
          )}
          <pre
            className={`${sizes.pre} text-muted-foreground bg-background/50 rounded p-${compact ? "1.5" : "2"} whitespace-pre-wrap font-mono overflow-auto`}
          >
            {prompt.content}
          </pre>
        </div>
      )}
    </div>
  );
}
