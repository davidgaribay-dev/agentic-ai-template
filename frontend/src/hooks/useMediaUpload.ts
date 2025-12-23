/**
 * Hook for handling media file uploads in chat.
 *
 * Provides upload functionality with progress tracking and validation.
 */

import { useState, useCallback } from "react";
import {
  mediaApi,
  isAllowedMediaType,
  type ChatMedia,
  type AllowedMediaType,
} from "@/lib/api";

/** Maximum file size in bytes (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum number of files per message */
const MAX_FILES_PER_MESSAGE = 5;

export interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  media?: ChatMedia;
}

export interface UseMediaUploadOptions {
  organizationId: string;
  teamId?: string;
  maxFiles?: number;
  maxFileSize?: number;
  onUploadComplete?: (media: ChatMedia) => void;
  onError?: (error: string) => void;
}

export interface UseMediaUploadReturn {
  pendingUploads: PendingUpload[];
  isUploading: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeUpload: (id: string) => void;
  clearUploads: () => void;
  uploadAll: () => Promise<ChatMedia[]>;
  validateFile: (file: File) => { valid: boolean; error?: string };
}

export function useMediaUpload(
  options: UseMediaUploadOptions,
): UseMediaUploadReturn {
  const {
    organizationId,
    teamId,
    maxFiles = MAX_FILES_PER_MESSAGE,
    maxFileSize = MAX_FILE_SIZE,
    onUploadComplete,
    onError,
  } = options;

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      if (!isAllowedMediaType(file.type)) {
        return {
          valid: false,
          error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP`,
        };
      }

      if (file.size > maxFileSize) {
        const maxMB = Math.round(maxFileSize / (1024 * 1024));
        return {
          valid: false,
          error: `File too large: ${file.name}. Maximum size: ${maxMB}MB`,
        };
      }

      return { valid: true };
    },
    [maxFileSize],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newUploads: PendingUpload[] = [];

      for (const file of fileArray) {
        // Check max files limit
        if (pendingUploads.length + newUploads.length >= maxFiles) {
          onError?.(`Maximum ${maxFiles} files per message`);
          break;
        }

        const validation = validateFile(file);
        if (!validation.valid) {
          onError?.(validation.error!);
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        newUploads.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
          status: "pending",
          progress: 0,
        });
      }

      if (newUploads.length > 0) {
        setPendingUploads((prev) => [...prev, ...newUploads]);
      }
    },
    [pendingUploads.length, maxFiles, validateFile, onError],
  );

  const removeUpload = useCallback((id: string) => {
    setPendingUploads((prev) => {
      const upload = prev.find((u) => u.id === id);
      if (upload) {
        URL.revokeObjectURL(upload.previewUrl);
      }
      return prev.filter((u) => u.id !== id);
    });
  }, []);

  const clearUploads = useCallback(() => {
    setPendingUploads((prev) => {
      prev.forEach((upload) => URL.revokeObjectURL(upload.previewUrl));
      return [];
    });
  }, []);

  const uploadAll = useCallback(async (): Promise<ChatMedia[]> => {
    if (pendingUploads.length === 0) return [];

    setIsUploading(true);
    const results: ChatMedia[] = [];

    try {
      for (const upload of pendingUploads) {
        if (upload.status === "success" && upload.media) {
          results.push(upload.media);
          continue;
        }

        setPendingUploads((prev) =>
          prev.map((u) =>
            u.id === upload.id
              ? { ...u, status: "uploading", progress: 50 }
              : u,
          ),
        );

        try {
          const media = await mediaApi.upload({
            file: upload.file,
            organizationId,
            teamId,
          });

          setPendingUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id
                ? { ...u, status: "success", progress: 100, media }
                : u,
            ),
          );

          results.push(media);
          onUploadComplete?.(media);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Upload failed";
          setPendingUploads((prev) =>
            prev.map((u) =>
              u.id === upload.id
                ? { ...u, status: "error", error: errorMsg }
                : u,
            ),
          );
          onError?.(errorMsg);
        }
      }

      return results;
    } finally {
      setIsUploading(false);
    }
  }, [pendingUploads, organizationId, teamId, onUploadComplete, onError]);

  return {
    pendingUploads,
    isUploading,
    addFiles,
    removeUpload,
    clearUploads,
    uploadAll,
    validateFile,
  };
}

/** Helper to convert ChatMedia to ChatMediaAttachment format */
export function mediaToAttachment(media: ChatMedia, contentUrl: string) {
  return {
    id: media.id,
    url: contentUrl,
    filename: media.filename,
    mime_type: media.mime_type,
    width: media.width,
    height: media.height,
  };
}

/** Get allowed MIME types as accept string for file input */
export function getAllowedMediaAccept(): string {
  return "image/jpeg,image/png,image/gif,image/webp";
}

export { isAllowedMediaType, MAX_FILE_SIZE, MAX_FILES_PER_MESSAGE };
export type { AllowedMediaType };
