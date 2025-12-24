import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import type { Prompt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { type PromptScope, getQueryKey, updatePromptApi } from "./types";

const editPromptSchema = z.object({
  name: z.string().min(1, "prompts_name_required"),
  description: z.string(),
  content: z.string().min(1, "prompts_content_required"),
});

type EditPromptFormData = z.infer<typeof editPromptSchema>;

interface EditPromptDialogProps {
  prompt: Prompt;
  scope: PromptScope;
  compact?: boolean;
}

export function EditPromptDialog({
  prompt,
  scope,
  compact = false,
}: EditPromptDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<EditPromptFormData>({
    resolver: zodResolver(editPromptSchema),
    defaultValues: {
      name: prompt.name,
      description: prompt.description ?? "",
      content: prompt.content,
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  // Reset form when prompt changes or dialog opens
  useEffect(() => {
    if (open) {
      reset({
        name: prompt.name,
        description: prompt.description ?? "",
        content: prompt.content,
      });
    }
  }, [open, prompt, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: EditPromptFormData) =>
      updatePromptApi(scope, prompt.id, {
        name: data.name.trim(),
        description: data.description.trim() || null,
        content: data.content.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
      setOpen(false);
    },
  });

  const onSubmit = handleSubmit((data) => {
    updateMutation.mutate(data);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          reset({
            name: prompt.name,
            description: prompt.description ?? "",
            content: prompt.content,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={compact ? "size-6" : "size-7"}
        >
          <Pencil className={compact ? "size-2.5" : "size-3"} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("prompts_edit")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name" className="text-xs">
                {t("com_name")}
              </Label>
              <Input
                id="edit-name"
                {...register("name")}
                className="h-8 text-sm"
              />
              {errors.name?.message && (
                <p className="text-xs text-destructive">
                  {t(errors.name.message as "prompts_name_required")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs">
                {t("prompts_description_optional")}
              </Label>
              <Input
                id="edit-description"
                {...register("description")}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-content" className="text-xs">
                {t("com_content")}
              </Label>
              <Textarea
                id="edit-content"
                {...register("content")}
                rows={4}
                className="font-mono text-sm"
              />
              {errors.content?.message && (
                <p className="text-xs text-destructive">
                  {t(errors.content.message as "prompts_content_required")}
                </p>
              )}
            </div>
            {updateMutation.isError && (
              <ErrorAlert
                error={updateMutation.error}
                fallback={t("prompts_failed_update")}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t("com_cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              )}
              {t("com_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
