/**
 * Hook for uploading documents to the RAG knowledge base.
 *
 * Handles document upload with progress tracking and status management.
 * Documents are processed asynchronously and become searchable once complete.
 */

import { useState, useCallback } from "react";
import { documentsApi, type Document, type DocumentScope } from "@/lib/api";

export interface UseDocumentUploadOptions {
  organizationId: string;
  teamId?: string;
  /** Document scope: org, team, or user */
  scope?: DocumentScope;
  onUploadComplete?: (doc: Document) => void;
  onError?: (error: string, filename: string) => void;
}

export interface DocumentUploadState {
  filename: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  document?: Document;
}

export interface UseDocumentUploadReturn {
  /** Current upload states */
  uploads: DocumentUploadState[];
  /** Whether any upload is in progress */
  isUploading: boolean;
  /** Upload a single file */
  uploadFile: (file: File) => Promise<Document | null>;
  /** Upload multiple files */
  uploadFiles: (files: FileList | File[]) => Promise<Document[]>;
  /** Clear completed/failed uploads from the list */
  clearCompleted: () => void;
}

export function useDocumentUpload(
  options: UseDocumentUploadOptions,
): UseDocumentUploadReturn {
  const {
    organizationId,
    teamId,
    scope = teamId ? "team" : "org",
    onUploadComplete,
    onError,
  } = options;

  const [uploads, setUploads] = useState<DocumentUploadState[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File): Promise<Document | null> => {
      // Add to uploads list
      setUploads((prev) => [
        ...prev,
        {
          filename: file.name,
          status: "pending",
          progress: 0,
        },
      ]);

      setIsUploading(true);

      try {
        // Update status to uploading
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? { ...u, status: "uploading", progress: 50 }
              : u,
          ),
        );

        const document = await documentsApi.upload({
          file,
          organization_id: organizationId,
          team_id: teamId,
          scope,
        });

        // Update status to success
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? { ...u, status: "success", progress: 100, document }
              : u,
          ),
        );

        onUploadComplete?.(document);
        return document;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";

        // Update status to error
        setUploads((prev) =>
          prev.map((u) =>
            u.filename === file.name
              ? { ...u, status: "error", error: errorMsg }
              : u,
          ),
        );

        onError?.(errorMsg, file.name);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [organizationId, teamId, scope, onUploadComplete, onError],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]): Promise<Document[]> => {
      const fileArray = Array.from(files);
      const results: Document[] = [];

      for (const file of fileArray) {
        const doc = await uploadFile(file);
        if (doc) {
          results.push(doc);
        }
      }

      return results;
    },
    [uploadFile],
  );

  const clearCompleted = useCallback(() => {
    setUploads((prev) =>
      prev.filter((u) => u.status !== "success" && u.status !== "error"),
    );
  }, []);

  return {
    uploads,
    isUploading,
    uploadFile,
    uploadFiles,
    clearCompleted,
  };
}
