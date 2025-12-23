import { useState } from "react";
import {
  FileText,
  FileCode,
  FileSpreadsheet,
  File,
  MoreVertical,
  Trash2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { DocumentStatus } from "./document-status";
import {
  useDocuments,
  useDeleteDocument,
  useReprocessDocument,
} from "@/lib/queries";
import type { Document, ProcessingStatus } from "@/lib/api";

interface DocumentListProps {
  orgId: string;
  teamId?: string;
  status?: ProcessingStatus;
  /** Filter documents by scope - filters client-side based on team_id/user_id fields */
  scope?: "org" | "team" | "user";
  /** Current user ID - required when scope is "user" to filter personal documents */
  userId?: string;
}

function getFileIcon(fileType: string) {
  const codeExtensions = [
    "py",
    "js",
    "ts",
    "jsx",
    "tsx",
    "java",
    "cpp",
    "c",
    "h",
    "go",
    "rs",
    "rb",
    "php",
    "sh",
    "sql",
    "html",
    "css",
  ];
  const spreadsheetExtensions = ["csv", "xlsx"];

  if (codeExtensions.includes(fileType)) {
    return FileCode;
  }
  if (spreadsheetExtensions.includes(fileType)) {
    return FileSpreadsheet;
  }
  if (["pdf", "txt", "md", "docx"].includes(fileType)) {
    return FileText;
  }
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({
  orgId,
  teamId,
  status,
  scope,
  userId,
}: DocumentListProps) {
  const {
    data: documents,
    isLoading,
    error,
  } = useDocuments({
    organization_id: orgId,
    team_id: teamId,
    status: status,
  });
  const deleteMutation = useDeleteDocument();
  const reprocessMutation = useReprocessDocument();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  // Filter documents by scope (client-side filtering)
  const filteredDocuments =
    documents?.data?.filter((doc: Document) => {
      if (!scope) return true; // No filter, show all

      switch (scope) {
        case "org":
          // Org-level: no team_id, no user_id
          return !doc.team_id && !doc.user_id;
        case "team":
          // Team-level: has team_id, no user_id
          return doc.team_id && !doc.user_id;
        case "user":
          // User-level: has user_id (and optionally team_id)
          return doc.user_id === userId;
        default:
          return true;
      }
    }) ?? [];

  const handleDelete = (documentId: string) => {
    setDeletingId(documentId);
    deleteMutation.mutate(documentId, {
      onSettled: () => setDeletingId(null),
    });
  };

  const handleReprocess = (documentId: string) => {
    setReprocessingId(documentId);
    reprocessMutation.mutate(documentId, {
      onSettled: () => setReprocessingId(null),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error instanceof Error ? error.message : "Failed to load documents"}
        </AlertDescription>
      </Alert>
    );
  }

  if (filteredDocuments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-sm font-medium text-muted-foreground">
            No documents uploaded yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload documents above to enable AI-powered search
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {filteredDocuments.map((doc: Document) => {
        const IconComponent = getFileIcon(doc.file_type);
        const isDeleting = deletingId === doc.id;
        const isReprocessing = reprocessingId === doc.id;

        return (
          <Card key={doc.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <IconComponent className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{doc.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(doc.file_size)}
                    {doc.chunk_count > 0 && ` • ${doc.chunk_count} chunks`}
                  </p>
                  {doc.processing_error && (
                    <p className="text-xs text-destructive mt-1 line-clamp-1">
                      Error: {doc.processing_error}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <DocumentStatus status={doc.processing_status} />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {doc.processing_status === "failed" && (
                      <DropdownMenuItem
                        onClick={() => handleReprocess(doc.id)}
                        disabled={isReprocessing}
                      >
                        {isReprocessing ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Retry Processing
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(doc.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {documents && documents.total > filteredDocuments.length && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <p className="text-xs text-muted-foreground">
            Showing {filteredDocuments.length} documents
          </p>
        </div>
      )}
    </div>
  );
}
