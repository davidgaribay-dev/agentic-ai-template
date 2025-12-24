/**
 * Media Library component for viewing and managing uploaded chat media.
 *
 * Displays a grid of uploaded images with delete functionality and click-to-expand preview.
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Trash2,
  Image as ImageIcon,
  AlertCircle,
  HardDrive,
  Download,
  X,
} from "lucide-react";
import { mediaApi, formatFileSize, type ChatMedia } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface MediaLibraryProps {
  organizationId: string;
  teamId?: string;
}

export function MediaLibrary({ organizationId, teamId }: MediaLibraryProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ChatMedia | null>(null);

  const handleDownload = useCallback(async (item: ChatMedia) => {
    try {
      const url = mediaApi.getContentUrl(item.id);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = item.filename || "image";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  }, []);

  // Fetch media list
  const {
    data: mediaData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["media", organizationId, teamId],
    queryFn: () =>
      mediaApi.list({
        organizationId,
        teamId,
        limit: 100,
      }),
    enabled: !!organizationId,
  });

  // Fetch storage usage
  const { data: usageData } = useQuery({
    queryKey: ["media-usage", organizationId, teamId],
    queryFn: () => mediaApi.getUsage(organizationId, teamId),
    enabled: !!organizationId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => mediaApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media", organizationId] });
      queryClient.invalidateQueries({
        queryKey: ["media-usage", organizationId],
      });
      setDeleteId(null);
    },
  });

  const mediaItems = mediaData?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="size-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground">
          {t("media_failed_load")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Storage usage */}
      {usageData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardDrive className="size-4" />
          <span>
            {formatFileSize(usageData.total_bytes)} {t("media_used")} (
            {t("media_file", { count: usageData.file_count })})
          </span>
          {usageData.quota_bytes && (
            <span>
              {t("media_of")} {formatFileSize(usageData.quota_bytes)}
            </span>
          )}
        </div>
      )}

      {/* Media grid */}
      {mediaItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
          <ImageIcon className="size-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("media_no_images")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("media_no_images_desc")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {mediaItems.map((item) => (
            <div
              key={item.id}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
            >
              <img
                src={mediaApi.getContentUrl(item.id)}
                alt={item.filename}
                className="size-full object-cover"
                loading="lazy"
              />
              {/* Bottom toolbar - visible on hover */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-2 py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Filename and size */}
                <div className="text-left mb-2">
                  <p className="text-xs text-white truncate">{item.filename}</p>
                  <p className="text-[10px] text-white/70">
                    {formatFileSize(item.file_size)}
                  </p>
                </div>
                {/* Action buttons */}
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-white hover:bg-white/20"
                    onClick={() => setSelectedImage(item)}
                  >
                    <ImageIcon className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-white hover:bg-white/20"
                    onClick={() => handleDownload(item)}
                  >
                    <Download className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-white hover:bg-white/20 hover:text-destructive"
                    onClick={() => setDeleteId(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("media_delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("media_delete_confirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("com_cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              {t("com_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full-size image preview dialog */}
      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-background/95 backdrop-blur-sm">
          <VisuallyHidden>
            <DialogTitle>
              {selectedImage?.filename || t("media_preview")}
            </DialogTitle>
          </VisuallyHidden>

          {/* Header with filename and actions */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 bg-gradient-to-b from-black/50 to-transparent z-10">
            <span className="text-sm text-white font-medium truncate max-w-[60%]">
              {selectedImage?.filename}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/20"
                onClick={() => selectedImage && handleDownload(selectedImage)}
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-white hover:bg-white/20"
                onClick={() => setSelectedImage(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>

          {/* Full-size image */}
          <div className="flex items-center justify-center min-h-[300px] p-4">
            {selectedImage && (
              <img
                src={mediaApi.getContentUrl(selectedImage.id)}
                alt={selectedImage.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
