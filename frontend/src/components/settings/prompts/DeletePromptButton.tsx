import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, Trash2 } from "lucide-react";
import type { Prompt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type PromptScope, getQueryKey, deletePromptApi } from "./types";

interface DeletePromptButtonProps {
  prompt: Prompt;
  scope: PromptScope;
  compact?: boolean;
}

export function DeletePromptButton({
  prompt,
  scope,
  compact = false,
}: DeletePromptButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deletePromptApi(scope, prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`${compact ? "size-6" : "size-7"} text-muted-foreground hover:text-destructive`}
        >
          <Trash2 className={compact ? "size-2.5" : "size-3"} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("prompts_delete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("prompts_delete_confirm_msg", { name: prompt.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("com_cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("prompts_deleting")}
              </>
            ) : (
              t("com_delete")
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
