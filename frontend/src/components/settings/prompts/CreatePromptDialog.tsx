import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import type { PromptType } from "@/lib/api";
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
import { type PromptScope, getQueryKey, createPromptApi } from "./types";

const createPromptSchema = z.object({
  name: z.string().min(1, "prompts_name_required"),
  description: z.string(),
  content: z.string().min(1, "prompts_content_required"),
});

type CreatePromptFormData = z.infer<typeof createPromptSchema>;

interface CreatePromptDialogProps {
  scope: PromptScope;
  defaultType?: PromptType;
  compact?: boolean;
}

export function CreatePromptDialog({
  scope,
  defaultType = "template",
  compact = false,
}: CreatePromptDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<CreatePromptFormData>({
    resolver: zodResolver(createPromptSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  const createMutation = useMutation({
    mutationFn: (data: CreatePromptFormData) =>
      createPromptApi(scope, {
        name: data.name.trim(),
        description: data.description.trim() || null,
        content: data.content.trim(),
        prompt_type: defaultType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
      reset();
      setOpen(false);
    },
  });

  const handleClose = () => {
    reset();
    setOpen(false);
  };

  const onSubmit = handleSubmit((data) => {
    createMutation.mutate(data);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "h-5 text-[10px] px-1.5" : "h-7 text-xs"}
        >
          <Plus className={compact ? "size-2.5 mr-0.5" : "size-3 mr-1"} />
          {t("prompts_add")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {defaultType === "system"
              ? t("prompts_create_system")
              : t("prompts_create_template")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">
                {t("com_name")}
              </Label>
              <Input
                id="name"
                {...register("name")}
                placeholder={t("prompts_name_example")}
                className="h-8 text-sm"
              />
              {errors.name?.message && (
                <p className="text-xs text-destructive">
                  {t(errors.name.message as "prompts_name_required")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs">
                {t("prompts_description_optional")}
              </Label>
              <Input
                id="description"
                {...register("description")}
                placeholder={t("prompts_brief_description")}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content" className="text-xs">
                {t("com_content")}
              </Label>
              <Textarea
                id="content"
                {...register("content")}
                placeholder={
                  defaultType === "system"
                    ? t("prompts_system_content_placeholder")
                    : t("prompts_template_content_placeholder")
                }
                rows={4}
                className="font-mono text-sm"
              />
              {errors.content?.message && (
                <p className="text-xs text-destructive">
                  {t(errors.content.message as "prompts_content_required")}
                </p>
              )}
            </div>
            {createMutation.isError && (
              <ErrorAlert
                error={createMutation.error}
                fallback={t("prompts_failed_create")}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
            >
              {t("com_cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              )}
              {t("com_create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
