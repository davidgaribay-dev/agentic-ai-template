/**
 * Unified preview component for chat attachments (images and documents).
 *
 * Shows thumbnail previews for images and file info for documents.
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, AlertCircle, FileText, File } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/api/media";
import type { PendingUpload } from "@/hooks/useMediaUpload";

/** Get icon for document type */
function getDocumentIcon(mimeType: string) {
  if (mimeType === "application/pdf") {
    return <FileText className="size-5 text-red-500" />;
  }
  if (mimeType.startsWith("text/")) {
    return <FileText className="size-5 text-blue-500" />;
  }
  return <File className="size-5 text-muted-foreground" />;
}

interface ImagePreviewProps {
  upload: PendingUpload;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const ImagePreview = memo(function ImagePreview({
  upload,
  onRemove,
  disabled = false,
}: ImagePreviewProps) {
  const { t } = useTranslation();
  const isLoading = upload.status === "uploading";
  const isError = upload.status === "error";

  return (
    <div
      className={cn(
        "relative group size-16 rounded-lg overflow-hidden border border-border/50",
        isError && "border-destructive",
      )}
    >
      <img
        src={upload.previewUrl}
        alt={upload.file.name}
        className={cn(
          "size-full object-cover",
          isLoading && "opacity-50",
          isError && "opacity-50",
        )}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}

      {/* Error overlay */}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
          <AlertCircle className="size-5 text-destructive" />
        </div>
      )}

      {/* Remove button */}
      {!disabled && (
        <button
          type="button"
          onClick={() => onRemove(upload.id)}
          className={cn(
            "absolute -top-1 -right-1 size-5 rounded-full bg-background border border-border",
            "flex items-center justify-center",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive hover:text-destructive-foreground hover:border-destructive",
          )}
          aria-label={t("aria_remove_file", { filename: upload.file.name })}
        >
          <X className="size-3" />
        </button>
      )}

      {/* Error tooltip */}
      {isError && upload.error && (
        <div className="absolute inset-x-0 bottom-0 px-1 py-0.5 bg-destructive text-destructive-foreground text-[10px] truncate">
          {upload.error}
        </div>
      )}
    </div>
  );
});

interface DocumentPreviewProps {
  upload: PendingUpload;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const DocumentPreview = memo(function DocumentPreview({
  upload,
  onRemove,
  disabled = false,
}: DocumentPreviewProps) {
  const { t } = useTranslation();
  const isLoading = upload.status === "uploading";
  const isError = upload.status === "error";

  return (
    <div
      className={cn(
        "relative group flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50",
        "bg-muted/30 min-w-0 max-w-[200px]",
        isError && "border-destructive bg-destructive/5",
        isLoading && "opacity-70",
      )}
    >
      {/* Icon */}
      <div className="shrink-0">
        {isLoading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : isError ? (
          <AlertCircle className="size-5 text-destructive" />
        ) : (
          getDocumentIcon(upload.file.type)
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{upload.file.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {isError ? upload.error : formatFileSize(upload.file.size)}
        </p>
      </div>

      {/* Remove button */}
      {!disabled && (
        <button
          type="button"
          onClick={() => onRemove(upload.id)}
          className={cn(
            "shrink-0 size-5 rounded-full",
            "flex items-center justify-center",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            "hover:bg-destructive hover:text-destructive-foreground",
            "text-muted-foreground",
          )}
          aria-label={t("aria_remove_file", { filename: upload.file.name })}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
});

interface AttachmentPreviewListProps {
  uploads: PendingUpload[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

export const AttachmentPreviewList = memo(function AttachmentPreviewList({
  uploads,
  onRemove,
  disabled = false,
  className,
}: AttachmentPreviewListProps) {
  if (uploads.length === 0) return null;

  // Separate images and documents for grouped display
  const images = uploads.filter((u) => u.attachmentType === "image");
  const documents = uploads.filter((u) => u.attachmentType === "document");

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Images row */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((upload) => (
            <ImagePreview
              key={upload.id}
              upload={upload}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Documents row */}
      {documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {documents.map((upload) => (
            <DocumentPreview
              key={upload.id}
              upload={upload}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// Re-export individual components for flexibility
export { ImagePreview, DocumentPreview };
