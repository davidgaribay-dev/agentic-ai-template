import { memo, useState, useCallback } from "react";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import type { ChatMediaAttachment } from "@/lib/chat-store";

interface MessageMediaProps {
  media: ChatMediaAttachment[];
  className?: string;
}

/** Component for displaying media attachments in a message with click-to-expand */
export const MessageMedia = memo(function MessageMedia({
  media,
  className,
}: MessageMediaProps) {
  const [selectedImage, setSelectedImage] =
    useState<ChatMediaAttachment | null>(null);

  const handleDownload = useCallback(async (item: ChatMediaAttachment) => {
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.filename || "image";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  }, []);

  if (media.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {media.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedImage(item)}
            className="relative rounded-lg overflow-hidden border border-border/50 max-w-[200px] cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <img
              src={item.url}
              alt={item.filename}
              className="object-cover max-h-[150px] w-auto"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Full-size image dialog */}
      <Dialog
        open={!!selectedImage}
        onOpenChange={() => setSelectedImage(null)}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 overflow-hidden bg-background/95 backdrop-blur-sm">
          <VisuallyHidden>
            <DialogTitle>
              {selectedImage?.filename || "Image preview"}
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
                src={selectedImage.url}
                alt={selectedImage.filename}
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
