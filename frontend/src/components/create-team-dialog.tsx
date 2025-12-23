/**
 * Create Team Dialog Component.
 *
 * A reusable dialog for creating new teams within the current organization.
 * Can be triggered from various places in the UI.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
import { useWorkspace, workspaceKeys } from "@/lib/workspace";
import { teamsApi, type TeamCreate, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CreateTeamDialogProps {
  /** Custom trigger element. If not provided, uses default button */
  trigger?: React.ReactNode;
  /** Called after team is successfully created */
  onSuccess?: (teamId: string) => void;
  /** Whether the dialog is controlled externally */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

export function CreateTeamDialog({
  trigger,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
}: CreateTeamDialogProps) {
  const queryClient = useQueryClient();
  const { currentOrg, currentOrgRole, switchTeam, refresh } = useWorkspace();
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;
  const canCreateTeam =
    currentOrgRole === "owner" || currentOrgRole === "admin";

  const createMutation = useMutation({
    mutationFn: (data: TeamCreate) => teamsApi.createTeam(currentOrg!.id, data),
    onSuccess: (newTeam) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.teams(currentOrg!.id),
      });
      refresh();
      switchTeam(newTeam.id);
      onSuccess?.(newTeam.id);
      resetDialog();
    },
    onError: (err: ApiError) => {
      const detail = (err.body as { detail?: string })?.detail;
      setError(detail || "Failed to create team");
    },
  });

  const handleCreate = () => {
    if (!currentOrg) return;
    setError(null);
    createMutation.mutate({ name, description: description || null });
  };

  const resetDialog = () => {
    setName("");
    setDescription("");
    setError(null);
    setIsOpen(false);
  };

  if (!currentOrg || !canCreateTeam) {
    return null;
  }

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Plus className="mr-2 h-4 w-4" />
      Create Team
    </Button>
  );

  const isControlled = controlledOpen !== undefined;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => (o ? setIsOpen(true) : resetDialog())}
    >
      {!isControlled && (
        <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Team</DialogTitle>
          <DialogDescription>
            Create a new team in {currentOrg.name} to organize your work.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-description">Description (optional)</Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of this team's purpose"
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetDialog}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
