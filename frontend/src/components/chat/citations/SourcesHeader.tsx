import { useState } from "react";
import {
  ChevronDown,
  FileText,
  Search,
  Check,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DocumentViewer } from "@/components/documents/document-viewer";
import type { MessageSource } from "@/lib/chat-store";
import { getFaviconUrl, getDisplayName, getDomain } from "./helpers";

interface SourcesHeaderProps {
  sources: MessageSource[];
  className?: string;
}

/**
 * Collapsible sources header showing the search process and source list
 * Similar to the "Reviewed X sources" UI in the reference
 */
export function SourcesHeader({ sources, className }: SourcesHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewerDocId, setViewerDocId] = useState<string | null>(null);
  const [viewerFilename, setViewerFilename] = useState<string>("");
  const [viewerFileType, setViewerFileType] = useState<string>("");

  if (sources.length === 0) return null;

  // Group sources by filename/domain for cleaner display
  const groupedSources = sources.reduce(
    (acc, source) => {
      const key = getDisplayName(source.source);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(source);
      return acc;
    },
    {} as Record<string, MessageSource[]>,
  );

  const uniqueSources = Object.values(groupedSources).map((group) => group[0]);
  const uniqueCount = uniqueSources.length;

  const handleSourceClick = (source: MessageSource) => {
    if (source.document_id) {
      setViewerDocId(source.document_id);
      setViewerFilename(source.source);
      setViewerFileType(source.file_type);
    }
  };

  return (
    <>
      <Collapsible
        open={isExpanded}
        onOpenChange={setIsExpanded}
        className={className}
      >
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <span>
            Reviewed {uniqueCount} {uniqueCount === 1 ? "source" : "sources"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="rounded-lg border bg-card overflow-hidden">
            {/* Search process indicator */}
            <div className="border-b px-3 py-2 bg-muted/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Search className="h-3 w-3" />
                <span>Searching documents</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-500" />
                <span>Reviewing sources · {uniqueCount}</span>
              </div>
            </div>

            {/* Source list */}
            <div className="divide-y max-h-64 overflow-y-auto">
              {uniqueSources.map((source, index) => {
                const faviconUrl = getFaviconUrl(source.source);
                const domain = getDomain(source.source);
                const title = getDisplayName(source.source);
                const isClickable = !!source.document_id;

                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSourceClick(source)}
                    disabled={!isClickable}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 w-full text-left transition-colors",
                      isClickable
                        ? "hover:bg-muted/50 cursor-pointer"
                        : "cursor-default",
                    )}
                  >
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt=""
                        className="h-5 w-5 rounded flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-5 w-5 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {title}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {domain}
                    </span>
                    {isClickable && (
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Finished indicator */}
            <div className="px-3 py-2 bg-muted/30 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-green-500" />
                <span>Finished</span>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Document Viewer Dialog */}
      <DocumentViewer
        documentId={viewerDocId}
        filename={viewerFilename}
        fileType={viewerFileType}
        open={!!viewerDocId}
        onOpenChange={(open) => {
          if (!open) setViewerDocId(null);
        }}
      />
    </>
  );
}
