import { useState, useCallback } from "react";
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
import {
  getFaviconUrl,
  getDisplayName,
  getDomain,
  getBadgeLabel,
} from "./helpers";

interface CitationBadgeProps {
  /** Primary source to display */
  source: MessageSource;
  /** Additional sources grouped with this citation */
  additionalSources?: MessageSource[];
  /** Display style */
  variant?: "inline" | "standalone";
  className?: string;
}

/**
 * Inline citation badge with hover card showing source details
 */
export function CitationBadge({
  source,
  additionalSources = [],
  variant = "inline",
  className,
}: CitationBadgeProps) {
  const allSources = [source, ...additionalSources];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const currentSource = allSources[currentIndex];
  const totalSources = allSources.length;

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

  const handleViewDocument = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setViewerOpen(true);
    },
    [setViewerOpen],
  );

  const faviconUrl = getFaviconUrl(source.source);
  const additionalCount = additionalSources.length;
  const badgeLabel = getBadgeLabel(source.source);

  // Check if current source is a document (has document_id)
  const isDocument = !!currentSource.document_id;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
            "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
            variant === "inline" && "mx-0.5 align-baseline",
            className,
          )}
        >
          {faviconUrl && (
            <img
              src={faviconUrl}
              alt=""
              className="h-3 w-3 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
          <span className="max-w-[120px] truncate">{badgeLabel}</span>
          {additionalCount > 0 && (
            <span className="text-[10px] opacity-70">+{additionalCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] max-w-[90vw] p-0 overflow-hidden"
        align="start"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Pagination header - only show if multiple sources */}
          {totalSources > 1 && (
            <div className="flex items-center justify-between px-3 py-2.5 border-b">
              {/* Left side: arrows and counter */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrev}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Previous source"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-muted-foreground min-w-[32px] text-center">
                  {currentIndex + 1}/{totalSources}
                </span>
                <button
                  onClick={handleNext}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Next source"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Right side: favicon stack and count */}
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {allSources.slice(0, 4).map((s, i) => {
                    const favicon = getFaviconUrl(s.source);
                    return favicon ? (
                      <img
                        key={i}
                        src={favicon}
                        alt=""
                        className={cn(
                          "h-5 w-5 rounded-full border-2 border-popover",
                          i === currentIndex && "ring-2 ring-primary",
                        )}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        key={i}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 border-popover bg-muted flex items-center justify-center",
                          i === currentIndex && "ring-2 ring-primary",
                        )}
                      >
                        <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
                <span className="text-sm text-muted-foreground">
                  {totalSources} sources
                </span>
              </div>
            </div>
          )}

          {/* Source card content */}
          <div className="p-4">
            {/* Domain header with favicon */}
            <div className="flex items-center gap-2 mb-1">
              {getFaviconUrl(currentSource.source) ? (
                <img
                  src={getFaviconUrl(currentSource.source)!}
                  alt=""
                  className="h-5 w-5 rounded"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="h-5 w-5 rounded bg-muted flex items-center justify-center">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm text-muted-foreground">
                {getDomain(currentSource.source)}
              </span>
            </div>

            {/* Title */}
            <h4 className="font-bold text-base text-foreground mb-2 line-clamp-2">
              {getDisplayName(currentSource.source)}
            </h4>

            {/* Content preview */}
            <p className="text-sm text-muted-foreground line-clamp-5">
              {currentSource.content}
            </p>

            {/* View Full Document button */}
            {isDocument && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={handleViewDocument}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                View Full Document
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>

      {/* Document Viewer Dialog */}
      {isDocument && (
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
