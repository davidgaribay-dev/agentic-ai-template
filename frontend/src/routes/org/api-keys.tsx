import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowLeft,
  Shield,
  Building2,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/lib/workspace";
import {
  apiKeysApi,
  type APIKeyStatus,
  type LLMProvider,
  type ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/org/api-keys")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: OrgApiKeysPage,
});

const PROVIDER_INFO: Record<
  LLMProvider,
  { name: string; description: string; icon: string }
> = {
  openai: {
    name: "OpenAI",
    description: "GPT-4o and other OpenAI models",
    icon: "O",
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude models for advanced reasoning",
    icon: "A",
  },
  google: {
    name: "Google",
    description: "Gemini models from Google AI",
    icon: "G",
  },
};

function OrgApiKeysPage() {
  const { currentOrg, currentOrgRole } = useWorkspace();
  const isAdmin = currentOrgRole === "owner" || currentOrgRole === "admin";

  const { data: apiKeyStatuses, isLoading } = useQuery({
    queryKey: ["org-api-keys", currentOrg?.id],
    queryFn: () => apiKeysApi.listOrgKeys(currentOrg!.id),
    enabled: !!currentOrg?.id && isAdmin,
  });

  const { data: defaultProvider, isLoading: isLoadingDefault } = useQuery({
    queryKey: ["org-default-provider", currentOrg?.id],
    queryFn: () => apiKeysApi.getOrgDefaultProvider(currentOrg!.id),
    enabled: !!currentOrg?.id && isAdmin,
  });

  if (!currentOrg || currentOrgRole === null) {
    return (
      <div className="bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-background">
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="mt-4 text-xl font-semibold">Access Denied</h2>
            <p className="mt-2 text-muted-foreground">
              Only organization admins and owners can manage API keys.
            </p>
            <Button asChild className="mt-4">
              <Link to="/org/settings">Back to Settings</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
            <Link to="/org/settings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Key className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">API Keys</h1>
              <p className="text-sm text-muted-foreground">
                Manage LLM provider API keys for {currentOrg.name}
              </p>
            </div>
          </div>
        </div>

        {/* Info banner */}
        <div className="mb-8 rounded-lg border bg-muted/50 p-4">
          <div className="flex gap-3">
            <Shield className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Secure Storage</p>
              <p className="text-muted-foreground">
                API keys are stored securely in Infisical and never saved to the
                database. Teams can override these defaults with their own keys
                for cost tracking.
              </p>
            </div>
          </div>
        </div>

        {/* Default Provider Selection */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Default Provider</h2>
          <DefaultProviderSelector
            orgId={currentOrg.id}
            currentProvider={defaultProvider?.provider}
            isLoading={isLoadingDefault}
          />
        </section>

        {/* API Key Cards */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Provider API Keys</h2>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {(["openai", "anthropic", "google"] as LLMProvider[]).map(
                (provider) => {
                  const status = apiKeyStatuses?.find(
                    (s) => s.provider === provider,
                  );
                  return (
                    <ProviderCard
                      key={provider}
                      provider={provider}
                      status={status}
                      orgId={currentOrg.id}
                    />
                  );
                },
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function DefaultProviderSelector({
  orgId,
  currentProvider,
  isLoading,
}: {
  orgId: string;
  currentProvider?: string;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (provider: LLMProvider) =>
      apiKeysApi.setOrgDefaultProvider(orgId, { provider }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["org-default-provider", orgId],
      });
      setError(null);
    },
    onError: (err: ApiError) => {
      setError(
        (err.body as { detail?: string })?.detail ||
          "Failed to update default provider",
      );
    },
  });

  if (isLoading) {
    return <Skeleton className="h-10 w-48" />;
  }

  return (
    <div className="flex items-center gap-4">
      <Select
        value={currentProvider || "anthropic"}
        onValueChange={(value) => updateMutation.mutate(value as LLMProvider)}
        disabled={updateMutation.isPending}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
          <SelectItem value="openai">OpenAI (GPT-4)</SelectItem>
          <SelectItem value="google">Google (Gemini)</SelectItem>
        </SelectContent>
      </Select>
      {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}

function ProviderCard({
  provider,
  status,
  orgId,
}: {
  provider: LLMProvider;
  status?: APIKeyStatus;
  orgId: string;
}) {
  const info = PROVIDER_INFO[provider];
  const isConfigured = status?.is_configured || false;
  const level = status?.level;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted font-bold text-lg">
              {info.icon}
            </div>
            <div>
              <CardTitle className="text-base">{info.name}</CardTitle>
              <CardDescription className="text-sm">
                {info.description}
              </CardDescription>
            </div>
          </div>
          <StatusBadge isConfigured={isConfigured} level={level} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {isConfigured ? (
              level === "org" ? (
                <span className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Configured at organization level
                </span>
              ) : level === "environment" ? (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Using environment variable
                </span>
              ) : (
                "Configured"
              )
            ) : (
              "Not configured"
            )}
          </div>
          <div className="flex gap-2">
            <SetApiKeyDialog
              provider={provider}
              orgId={orgId}
              hasKey={level === "org"}
            />
            {level === "org" && (
              <DeleteApiKeyButton provider={provider} orgId={orgId} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  isConfigured,
  level,
}: {
  isConfigured: boolean;
  level?: string | null;
}) {
  if (!isConfigured) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <X className="mr-1 h-3 w-3" />
        Not Set
      </Badge>
    );
  }

  if (level === "environment") {
    return (
      <Badge variant="secondary">
        <Sparkles className="mr-1 h-3 w-3" />
        Env Fallback
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0"
    >
      <Check className="mr-1 h-3 w-3" />
      Configured
    </Badge>
  );
}

function SetApiKeyDialog({
  provider,
  orgId,
  hasKey,
}: {
  provider: LLMProvider;
  orgId: string;
  hasKey: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      apiKeysApi.setOrgKey(orgId, { provider, api_key: apiKey }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-api-keys", orgId] });
      setOpen(false);
      setApiKey("");
      setError(null);
    },
    onError: (err: ApiError) => {
      setError(
        (err.body as { detail?: string })?.detail || "Failed to save API key",
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={hasKey ? "outline" : "default"} size="sm">
          {hasKey ? "Update" : "Set Key"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {hasKey ? "Update" : "Set"} {PROVIDER_INFO[provider].name} API Key
          </DialogTitle>
          <DialogDescription>
            Enter your {PROVIDER_INFO[provider].name} API key. It will be stored
            securely in Infisical and never saved to the database.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError(null);
                  }}
                  placeholder={`Enter your ${PROVIDER_INFO[provider].name} API key`}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Key"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteApiKeyButton({
  provider,
  orgId,
}: {
  provider: LLMProvider;
  orgId: string;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.deleteOrgKey(orgId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-api-keys", orgId] });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete API Key</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete the {PROVIDER_INFO[provider].name}{" "}
            API key? Teams using this organization's key will fall back to
            environment variables.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => mutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
