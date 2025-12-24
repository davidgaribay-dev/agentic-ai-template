/**
 * Actions dropdown cell for MCP server table rows.
 */

import { useState } from "react";
import {
  MoreHorizontal,
  ExternalLink,
  Power,
  PowerOff,
  Trash2,
  PlayCircle,
} from "lucide-react";

import type { MCPServer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { Scope } from "./types";
import { EditServerDialog } from "./EditServerDialog";
import { TestConnectionDialog } from "./TestConnectionDialog";

interface ServerActionsCellProps {
  server: MCPServer;
  scope: Scope;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isToggling: boolean;
}

export function ServerActionsCell({
  server,
  scope,
  onToggle,
  onDelete,
  isToggling,
}: ServerActionsCellProps) {
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setTestDialogOpen(true)}>
            <PlayCircle className="mr-2 size-3.5" />
            Test Connection
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => window.open(server.url, "_blank")}>
            <ExternalLink className="mr-2 size-3.5" />
            Open URL
          </DropdownMenuItem>
          <EditServerDialog server={server} scope={scope} />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onToggle(!server.enabled)}
            disabled={isToggling}
          >
            {server.enabled ? (
              <>
                <PowerOff className="mr-2 size-3.5" />
                Disable
              </>
            ) : (
              <>
                <Power className="mr-2 size-3.5" />
                Enable
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => e.preventDefault()}
              >
                <Trash2 className="mr-2 size-3.5" />
                Delete
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete MCP Server</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{server.name}"? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Test Connection Dialog - rendered outside dropdown to avoid focus conflicts */}
      <TestConnectionDialog
        server={server}
        scope={scope}
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
      />
    </div>
  );
}
