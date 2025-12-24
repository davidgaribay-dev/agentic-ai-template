/**
 * Image preview component for chat media attachments.
 *
 * Shows thumbnail previews with remove button and upload status.
 */

import { memo } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingUpload } from "@/hooks/useMediaUpload";

interface ImagePreviewProps {
  upload: PendingUpload;
  onRemove: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

export const ImagePreview = memo(function ImagePreview({
  upload,
  onRemove,
  disabled = false,
  className,
}: ImagePreviewProps) {
  const { t } = useTranslation();
  const isLoading = upload.status === "uploading";
  const isError = upload.status === "error";

  return (
    <div
      className={cn(
        "relative group size-16 rounded-lg overflow-hidden border border-border/50",
        isError && "border-destructive",
        className,
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

interface ImagePreviewListProps {
  uploads: PendingUpload[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

export const ImagePreviewList = memo(function ImagePreviewList({
  uploads,
  onRemove,
  disabled = false,
  className,
}: ImagePreviewListProps) {
  if (uploads.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {uploads.map((upload) => (
        <ImagePreview
          key={upload.id}
          upload={upload}
          onRemove={onRemove}
          disabled={disabled}
        />
      ))}
    </div>
  );
});
