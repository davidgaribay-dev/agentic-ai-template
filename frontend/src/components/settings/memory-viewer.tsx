import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Brain,
  Trash2,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/ui/data-table";
import { useWorkspace } from "@/lib/workspace";
import {
  useUserMemories,
  useDeleteMemory,
  useClearAllMemories,
} from "@/lib/queries";
import type { Memory, MemoryType } from "@/lib/api";

const memoryTypeColors: Record<MemoryType, string> = {
  preference: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  fact: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  entity:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  relationship:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  summary: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

const memoryTypeKeys = {
  preference: "memory_type_preference",
  fact: "memory_type_fact",
  entity: "memory_type_entity",
  relationship: "memory_type_relationship",
  summary: "memory_type_summary",
} as const;

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

interface MemoryDataTableProps {
  data: Memory[];
  onDelete: (id: string) => void;
  deletingId: string | null;
}

function MemoryDataTable({ data, onDelete, deletingId }: MemoryDataTableProps) {
  const { t } = useTranslation();
  const columns: ColumnDef<Memory>[] = useMemo(
    () => [
      {
        accessorKey: "content",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("memory_content")}
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[400px]">
            {row.getValue("content")}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("com_type")}
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const type = row.getValue("type") as MemoryType;
          return (
            <Badge
              variant="secondary"
              className={memoryTypeColors[type] || memoryTypeColors.fact}
            >
              {t(memoryTypeKeys[type]) || type}
            </Badge>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <Button
            variant="ghost"
            className="-ml-4"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("memory_created")}
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {formatDate(row.getValue("created_at"))}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">{t("com_actions")}</div>,
        cell: ({ row }) => {
          const memory = row.original;
          const isDeleting = deletingId === memory.id;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <MoreHorizontal className="size-4" />
                    )}
                    <span className="sr-only">{t("com_open_menu")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(memory.id)}
                  >
                    <Trash2 className="mr-2 size-4" />
                    {t("com_delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [deletingId, onDelete, t],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      searchKey="content"
      searchPlaceholder={t("com_search") + "..."}
    />
  );
}

export function MemoryViewer() {
  const { t } = useTranslation();
  const { currentOrg, currentTeam } = useWorkspace();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const orgId = currentOrg?.id;
  const teamId = currentTeam?.id;

  const {
    data: memoriesResponse,
    isLoading,
    error,
  } = useUserMemories(orgId, teamId);
  const deleteMutation = useDeleteMemory(orgId, teamId);
  const clearMutation = useClearAllMemories(orgId, teamId);

  const memories = memoriesResponse?.data ?? [];

  const handleDeleteMemory = async (memoryId: string) => {
    setDeletingId(memoryId);
    try {
      await deleteMutation.mutateAsync(memoryId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    await clearMutation.mutateAsync();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-4 text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>{t("memory_failed_load")}</span>
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">{t("memory_no_memories")}</p>
        <p className="text-sm text-muted-foreground/75 mt-1">
          {t("memory_no_memories_desc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {t("memory_one", { count: memories.length })} {t("memory_stored")}
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={clearMutation.isPending}
            >
              {clearMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {t("memory_clear_all")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("memory_clear_confirm")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("memory_clear_desc", { count: memories.length })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("com_cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearAll}>
                {t("memory_clear_all")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <MemoryDataTable
        data={memories}
        onDelete={handleDeleteMemory}
        deletingId={deletingId}
      />
    </div>
  );
}
