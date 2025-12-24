import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2, Eye, EyeOff, Check, Building2 } from "lucide-react";
import { apiKeysApi, type APIKeyStatus, type LLMProvider } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

type ApiKeyScope =
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string };

export const PROVIDER_INFO: Record<
  LLMProvider,
  { name: string; icon: string }
> = {
  openai: { name: "OpenAI", icon: "O" },
  anthropic: { name: "Anthropic", icon: "A" },
  google: { name: "Google", icon: "G" },
};

function getQueryKey(scope: ApiKeyScope): string[] {
  switch (scope.type) {
    case "org":
      return ["org-api-keys", scope.orgId];
    case "team":
      return ["team-api-keys", scope.orgId, scope.teamId];
  }
}

function getDefaultProviderQueryKey(scope: ApiKeyScope): string[] {
  switch (scope.type) {
    case "org":
      return ["org-default-provider", scope.orgId];
    case "team":
      return ["team-default-provider", scope.orgId, scope.teamId];
  }
}

function setApiKey(scope: ApiKeyScope, provider: LLMProvider, apiKey: string) {
  switch (scope.type) {
    case "org":
      return apiKeysApi.setOrgKey(scope.orgId, { provider, api_key: apiKey });
    case "team":
      return apiKeysApi.setTeamKey(scope.orgId, scope.teamId, {
        provider,
        api_key: apiKey,
      });
  }
}

function deleteApiKey(scope: ApiKeyScope, provider: LLMProvider) {
  switch (scope.type) {
    case "org":
      return apiKeysApi.deleteOrgKey(scope.orgId, provider);
    case "team":
      return apiKeysApi.deleteTeamKey(scope.orgId, scope.teamId, provider);
  }
}

function setDefaultProvider(scope: ApiKeyScope, provider: LLMProvider) {
  switch (scope.type) {
    case "org":
      return apiKeysApi.setOrgDefaultProvider(scope.orgId, { provider });
    case "team":
      return apiKeysApi.setTeamDefaultProvider(scope.orgId, scope.teamId, {
        provider,
      });
  }
}

interface DefaultProviderSelectorProps {
  scope: ApiKeyScope;
  currentProvider?: string;
  isLoading: boolean;
}

export function DefaultProviderSelector({
  scope,
  currentProvider,
  isLoading,
}: DefaultProviderSelectorProps) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (provider: LLMProvider) => setDefaultProvider(scope, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getDefaultProviderQueryKey(scope),
      });
    },
  });

  if (isLoading) return <Skeleton className="h-7 w-32" />;

  return (
    <Select
      value={currentProvider || "anthropic"}
      onValueChange={(value) => updateMutation.mutate(value as LLMProvider)}
      disabled={updateMutation.isPending}
    >
      <SelectTrigger className="h-7 w-32 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="anthropic">Anthropic</SelectItem>
        <SelectItem value="openai">OpenAI</SelectItem>
        <SelectItem value="google">Google</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface ProviderRowProps {
  provider: LLMProvider;
  status?: APIKeyStatus;
  scope: ApiKeyScope;
}

export function ProviderRow({ provider, status, scope }: ProviderRowProps) {
  const info = PROVIDER_INFO[provider];
  const isConfigured = status?.is_configured || false;
  const level = status?.level;

  const getLevelLabel = () => {
    if (!isConfigured) return "Not set";
    if (scope.type === "team") {
      if (level === "team") return "Team key";
      if (level === "org") return "Org fallback";
      if (level === "environment") return "Env fallback";
      return "Set";
    }
    if (level === "org") return "Configured";
    if (level === "environment") return "Env fallback";
    return "Set";
  };

  const hasOwnKey = scope.type === "team" ? level === "team" : level === "org";

  return (
    <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded bg-background font-bold text-xs">
          {info.icon}
        </div>
        <div>
          <span className="text-xs font-medium">{info.name}</span>
          <div className="text-[10px] text-muted-foreground">
            {getLevelLabel()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isConfigured && (
          <Badge
            variant="secondary"
            className={`text-[10px] h-4 ${hasOwnKey ? "bg-emerald-500/15 text-emerald-600" : ""}`}
          >
            {hasOwnKey ? (
              <Check className="size-2 mr-0.5" />
            ) : level === "org" ? (
              <Building2 className="size-2 mr-0.5" />
            ) : null}
            {hasOwnKey ? "Set" : level === "org" ? "Org" : "Env"}
          </Badge>
        )}
        <SetApiKeyDialog provider={provider} scope={scope} hasKey={hasOwnKey} />
        {hasOwnKey && <DeleteApiKeyButton provider={provider} scope={scope} />}
      </div>
    </div>
  );
}

const apiKeySchema = z.object({
  api_key: z.string().min(1, "API key is required"),
});

type ApiKeyFormData = z.infer<typeof apiKeySchema>;

interface SetApiKeyDialogProps {
  provider: LLMProvider;
  scope: ApiKeyScope;
  hasKey: boolean;
}

export function SetApiKeyDialog({
  provider,
  scope,
  hasKey,
}: SetApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<ApiKeyFormData>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      api_key: "",
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  const mutation = useMutation({
    mutationFn: (data: ApiKeyFormData) =>
      setApiKey(scope, provider, data.api_key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
      setOpen(false);
      reset();
    },
  });

  const onSubmit = handleSubmit((data) => {
    mutation.mutate(data);
  });

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      reset();
      setShowKey(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={hasKey ? "ghost" : "outline"}
          size="sm"
          className="h-6 text-[10px] px-2"
        >
          {hasKey ? "Update" : "Set"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {hasKey ? "Update" : "Set"} {PROVIDER_INFO[provider].name} Key
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="api-key" className="text-xs">
                API Key
              </Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  {...register("api_key")}
                  placeholder="sk-..."
                  className="h-8 text-sm pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-8 w-8"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
              </div>
              {errors.api_key && (
                <p className="text-xs text-destructive">
                  {errors.api_key.message}
                </p>
              )}
            </div>
            {mutation.isError && (
              <ErrorAlert
                error={mutation.error}
                fallback="Failed to save API key"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteApiKeyButtonProps {
  provider: LLMProvider;
  scope: ApiKeyScope;
}

export function DeleteApiKeyButton({
  provider,
  scope,
}: DeleteApiKeyButtonProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deleteApiKey(scope, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(scope) });
    },
  });

  const fallbackMessage =
    scope.type === "team"
      ? "The team will fall back to organization or environment keys."
      : "Teams will fall back to environment variables.";

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-2.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete API Key</AlertDialogTitle>
          <AlertDialogDescription>
            Delete the {PROVIDER_INFO[provider].name} API key? {fallbackMessage}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
