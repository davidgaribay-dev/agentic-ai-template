import { useState } from "react";
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  ArrowLeft,
  Sparkles,
  MessageSquare,
  Power,
  PowerOff,
} from "lucide-react";
import {
  promptsApi,
  type Prompt,
  type PromptCreate,
  type PromptUpdate,
  type PromptType,
  type ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/settings/prompts")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated && !context.auth.isLoading) {
      throw redirect({ to: "/login" });
    }
  },
  component: UserPromptsPage,
});

function UserPromptsPage() {
  return (
    <div className="bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
            <Link to="/settings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Settings
            </Link>
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">My Prompts</h1>
                <p className="text-sm text-muted-foreground">
                  Personal prompts that follow you across all organizations
                </p>
              </div>
            </div>
            <CreatePromptDialog />
          </div>
        </div>

        {/* Info banner */}
        <div className="mb-8 rounded-lg border bg-muted/50 p-4">
          <div className="flex gap-3">
            <Sparkles className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Personal Prompts</p>
              <p className="text-muted-foreground">
                These prompts are private to you and available in all your
                conversations, regardless of which organization or team you're
                working in.
              </p>
            </div>
          </div>
        </div>

        {/* Prompts Tabs */}
        <PromptsTabsSection />
      </div>
    </div>
  );
}

function PromptsTabsSection() {
  const { data: promptsData, isLoading } = useQuery({
    queryKey: ["user-prompts"],
    queryFn: () => promptsApi.listUserPrompts(),
  });

  const prompts = promptsData?.data ?? [];
  const systemPrompts = prompts.filter((p) => p.prompt_type === "system");
  const templatePrompts = prompts.filter((p) => p.prompt_type === "template");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="system" className="space-y-6">
      <TabsList>
        <TabsTrigger value="system" className="gap-2">
          <Sparkles className="h-4 w-4" />
          System Prompts
          {systemPrompts.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {systemPrompts.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="templates" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Templates
          {templatePrompts.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {templatePrompts.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="system" className="space-y-4">
        {systemPrompts.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No system prompts"
            description="Personal system prompts add to the AI's behavior on top of organization and team prompts."
          />
        ) : (
          systemPrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))
        )}
      </TabsContent>

      <TabsContent value="templates" className="space-y-4">
        {templatePrompts.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No templates"
            description="Personal templates are text snippets only you can see and use in conversations."
          />
        ) : (
          templatePrompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Icon className="mx-auto h-10 w-10 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PromptCard({ prompt }: { prompt: Prompt }) {
  const queryClient = useQueryClient();

  const activateMutation = useMutation({
    mutationFn: () => promptsApi.activateUserPrompt(prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] });
    },
  });

  const isSystem = prompt.prompt_type === "system";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {isSystem ? (
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              ) : (
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {prompt.name}
                {isSystem && prompt.is_active && (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0"
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                )}
              </CardTitle>
              {prompt.description && (
                <CardDescription>{prompt.description}</CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSystem && !prompt.is_active && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
              >
                {activateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Power className="mr-2 h-4 w-4" />
                )}
                Activate
              </Button>
            )}
            {isSystem && prompt.is_active && (
              <Badge variant="outline" className="text-muted-foreground">
                <PowerOff className="mr-1 h-3 w-3" />
                In Use
              </Badge>
            )}
            <EditPromptDialog prompt={prompt} />
            <DeletePromptButton prompt={prompt} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md bg-muted/50 p-3">
          <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
            {prompt.content.length > 300
              ? `${prompt.content.slice(0, 300)}...`
              : prompt.content}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

function CreatePromptDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [promptType, setPromptType] = useState<PromptType>("template");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: PromptCreate) => promptsApi.createUserPrompt(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] });
      resetForm();
    },
    onError: (err: ApiError) => {
      setError(
        (err.body as { detail?: string })?.detail || "Failed to create prompt",
      );
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setContent("");
    setPromptType("template");
    setError(null);
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required");
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
      prompt_type: promptType,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Personal Prompt</DialogTitle>
          <DialogDescription>
            Create a new prompt for your personal use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="prompt-type">Type</Label>
              <Select
                value={promptType}
                onValueChange={(v) => setPromptType(v as PromptType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Template
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      System Prompt
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {promptType === "system"
                  ? "System prompts add to the AI's behavior (combined with org/team prompts)"
                  : "Templates are text snippets you can insert into messages"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., My Writing Style"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this prompt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setError(null);
                }}
                placeholder={
                  promptType === "system"
                    ? "Always respond in a concise manner..."
                    : "Enter the template text..."
                }
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPromptDialog({ prompt }: { prompt: Prompt }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(prompt.name);
  const [description, setDescription] = useState(prompt.description ?? "");
  const [content, setContent] = useState(prompt.content);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data: PromptUpdate) =>
      promptsApi.updateUserPrompt(prompt.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] });
      setOpen(false);
      setError(null);
    },
    onError: (err: ApiError) => {
      setError(
        (err.body as { detail?: string })?.detail || "Failed to update prompt",
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      setError("Name and content are required");
      return;
    }
    updateMutation.mutate({
      name: name.trim(),
      description: description.trim() || null,
      content: content.trim(),
    });
  };

  const resetForm = () => {
    setName(prompt.name);
    setDescription(prompt.description ?? "");
    setContent(prompt.content);
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Prompt</DialogTitle>
          <DialogDescription>Update the prompt details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  setError(null);
                }}
                rows={6}
                className="font-mono text-sm"
              />
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
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePromptButton({ prompt }: { prompt: Prompt }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => promptsApi.deleteUserPrompt(prompt.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-prompts"] });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Prompt</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{prompt.name}"? This action cannot
            be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteMutation.isPending ? (
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
