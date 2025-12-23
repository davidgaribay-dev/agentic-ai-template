/**
 * Hook for handling media file uploads in chat.
 *
 * Supports both images and documents for inline attachment.
 * Provides upload functionality with progress tracking and validation.
 */

import { useState, useCallback } from "react";
import {
  mediaApi,
  isAllowedMediaType,
  type ChatMedia,
  type AllowedMediaType,
} from "@/lib/api";

/** Maximum file size for images in bytes (10MB) */
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum file size for documents in bytes (32MB - Claude limit) */
const MAX_DOCUMENT_FILE_SIZE = 32 * 1024 * 1024;

/** Maximum number of files per message */
const MAX_FILES_PER_MESSAGE = 5;

/** Allowed document MIME types for inline chat */
const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

/** Check if a MIME type is an allowed document type */
export function isAllowedDocumentType(
  mimeType: string,
): mimeType is AllowedDocumentType {
  return ALLOWED_DOCUMENT_TYPES.includes(mimeType as AllowedDocumentType);
}

/** Check if a file is an allowed inline attachment (image or document) */
export function isAllowedAttachmentType(mimeType: string): boolean {
  return isAllowedMediaType(mimeType) || isAllowedDocumentType(mimeType);
}

/** Attachment type discriminator */
export type AttachmentType = "image" | "document";

/** Get the attachment type for a MIME type */
export function getAttachmentType(mimeType: string): AttachmentType | null {
  if (isAllowedMediaType(mimeType)) return "image";
  if (isAllowedDocumentType(mimeType)) return "document";
  return null;
}

export interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  media?: ChatMedia;
  /** Type of attachment: image or document */
  attachmentType: AttachmentType;
}

export interface UseMediaUploadOptions {
  organizationId: string;
  teamId?: string;
  maxFiles?: number;
  /** Max file size for images (default 10MB) */
  maxImageSize?: number;
  /** Max file size for documents (default 32MB) */
  maxDocumentSize?: number;
  /** Allow document uploads (PDFs, text files) */
  allowDocuments?: boolean;
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
  /** Count of pending image uploads */
  imageCount: number;
  /** Count of pending document uploads */
  documentCount: number;
}

export function useMediaUpload(
  options: UseMediaUploadOptions,
): UseMediaUploadReturn {
  const {
    organizationId,
    teamId,
    maxFiles = MAX_FILES_PER_MESSAGE,
    maxImageSize = MAX_IMAGE_FILE_SIZE,
    maxDocumentSize = MAX_DOCUMENT_FILE_SIZE,
    allowDocuments = true,
    onUploadComplete,
    onError,
  } = options;

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      const attachmentType = getAttachmentType(file.type);

      if (!attachmentType) {
        const allowedTypes = allowDocuments
          ? "JPEG, PNG, GIF, WebP, PDF, TXT, MD, CSV"
          : "JPEG, PNG, GIF, WebP";
        return {
          valid: false,
          error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes}`,
        };
      }

      if (attachmentType === "document" && !allowDocuments) {
        return {
          valid: false,
          error: `Document uploads not allowed. Use images only.`,
        };
      }

      const maxSize =
        attachmentType === "image" ? maxImageSize : maxDocumentSize;
      if (file.size > maxSize) {
        const maxMB = Math.round(maxSize / (1024 * 1024));
        return {
          valid: false,
          error: `File too large: ${file.name}. Maximum size: ${maxMB}MB`,
        };
      }

      return { valid: true };
    },
    [maxImageSize, maxDocumentSize, allowDocuments],
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

        const attachmentType = getAttachmentType(file.type)!;
        const previewUrl = URL.createObjectURL(file);
        newUploads.push({
          id: crypto.randomUUID(),
          file,
          previewUrl,
          status: "pending",
          progress: 0,
          attachmentType,
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

  // Compute counts
  const imageCount = pendingUploads.filter(
    (u) => u.attachmentType === "image",
  ).length;
  const documentCount = pendingUploads.filter(
    (u) => u.attachmentType === "document",
  ).length;

  return {
    pendingUploads,
    isUploading,
    addFiles,
    removeUpload,
    clearUploads,
    uploadAll,
    validateFile,
    imageCount,
    documentCount,
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

/** Get allowed MIME types as accept string for file input (images only) */
export function getAllowedMediaAccept(): string {
  return "image/jpeg,image/png,image/gif,image/webp";
}

/** Get allowed MIME types as accept string for all inline attachments */
export function getAllowedAttachmentAccept(): string {
  return "image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv";
}

// Re-export for backwards compatibility
const MAX_FILE_SIZE = MAX_IMAGE_FILE_SIZE;

export {
  isAllowedMediaType,
  MAX_FILE_SIZE,
  MAX_FILES_PER_MESSAGE,
  MAX_IMAGE_FILE_SIZE,
  MAX_DOCUMENT_FILE_SIZE,
  ALLOWED_DOCUMENT_TYPES,
};
export type { AllowedMediaType };
