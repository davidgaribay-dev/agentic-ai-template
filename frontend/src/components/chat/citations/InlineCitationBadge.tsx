import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { DocumentViewer } from "@/components/documents/document-viewer";
import type { MessageSource } from "@/lib/chat-store";
import { getFaviconUrl, getDisplayName, getDomain } from "./helpers";

interface InlineCitationBadgeProps {
  /** Citation marker text (e.g., "filename.md") */
  marker: string;
  /** Matching sources for this citation */
  sources?: MessageSource[];
  className?: string;
}

/**
 * Small inline citation badge for use within markdown text
 * Shows as a clickable badge that opens the full CitationBadge popover
 */
export function InlineCitationBadge({
  marker,
  sources,
  className,
}: InlineCitationBadgeProps) {
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Get display label (filename without extension)
  const displayLabel = marker.replace(/\.[^/.]+$/, "");

  // Compute values that are safe even when sources is empty
  const hasSources = sources && sources.length > 0;
  const totalSources = hasSources ? sources.length : 0;
  const currentSource = hasSources ? sources[currentIndex] : null;

  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalSources - 1));
    },
    [totalSources],
  );

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev < totalSources - 1 ? prev + 1 : 0));
    },
    [totalSources],
  );

  const handleViewDocument = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setViewerOpen(true);
  }, []);

  const isDocument = !!currentSource?.document_id;

  // If no sources match, show a simple badge without popover
  if (!hasSources) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
          "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
          "whitespace-nowrap align-baseline",
          className,
        )}
      >
        <FileText className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{displayLabel}</span>
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
            "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
            "hover:bg-zinc-200 dark:hover:bg-zinc-700",
            "whitespace-nowrap align-baseline cursor-pointer",
            className,
          )}
        >
          <FileText className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{displayLabel}</span>
          {totalSources > 1 && (
            <span className="text-zinc-400 dark:text-zinc-500">
              +{totalSources - 1}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 overflow-hidden"
        align="start"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Pagination header - only show if multiple sources */}
          {totalSources > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrev}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label={t("aria_prev_source")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground min-w-[28px] text-center">
                  {currentIndex + 1}/{totalSources}
                </span>
                <button
                  onClick={handleNext}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label={t("aria_next_source")}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {t("sources_plural_count", { count: totalSources })}
              </span>
            </div>
          )}

          {/* Source card content */}
          {currentSource && (
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                {getFaviconUrl(currentSource.source) ? (
                  <img
                    src={getFaviconUrl(currentSource.source)!}
                    alt=""
                    className="h-4 w-4 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="h-4 w-4 rounded bg-muted flex items-center justify-center">
                    <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  {getDomain(currentSource.source)}
                </span>
              </div>

              <h4 className="font-semibold text-sm text-foreground mb-1.5 line-clamp-2">
                {getDisplayName(currentSource.source)}
              </h4>

              <p className="text-xs text-muted-foreground line-clamp-3">
                {currentSource.content}
              </p>

              {isDocument && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full h-7 text-xs"
                  onClick={handleViewDocument}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t("docs_view_document")}
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>

      {/* Document Viewer Dialog */}
      {isDocument && currentSource && (
        <DocumentViewer
          documentId={currentSource.document_id!}
          filename={currentSource.source}
          fileType={currentSource.file_type}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
        />
      )}
    </Popover>
  );
}
