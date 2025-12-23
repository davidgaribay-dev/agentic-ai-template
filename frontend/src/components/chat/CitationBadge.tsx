import * as React from "react"
import { useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, ChevronDown, FileText, Search, Check, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { DocumentViewer } from "@/components/documents/document-viewer"
import type { MessageSource } from "@/lib/chat-store"

/** Regex to match inline citation markers like [[filename.md]] */
const CITATION_REGEX = /\[\[([^\]]+)\]\]/g

/** Result of parsing content for inline citations */
export interface ParsedCitation {
  /** The citation marker text (e.g., "filename.md") */
  marker: string
  /** Matching sources from the message's sources array */
  sources: MessageSource[]
}

/**
 * Parse content to extract inline citation markers and match them with sources
 */
export function parseCitations(
  content: string,
  sources: MessageSource[]
): { cleanContent: string; citations: Map<string, ParsedCitation> } {
  const citations = new Map<string, ParsedCitation>()

  // Find all citation markers
  const matches = content.matchAll(CITATION_REGEX)
  for (const match of matches) {
    const marker = match[1]
    if (!citations.has(marker)) {
      // Find matching sources (by filename)
      const matchingSources = sources.filter((s) => {
        const filename = s.source.split("/").pop() || s.source
        return filename === marker || filename.toLowerCase() === marker.toLowerCase()
      })
      citations.set(marker, { marker, sources: matchingSources })
    }
  }

  // Clean content is returned as-is - we'll replace markers during rendering
  return { cleanContent: content, citations }
}

/**
 * Check if content contains inline citation markers
 */
export function hasInlineCitations(content: string): boolean {
  // Create a new regex instance to avoid global state issues
  const regex = new RegExp(CITATION_REGEX.source)
  return regex.test(content)
}

/**
 * Split content into segments: text and citations
 */
export interface ContentSegment {
  type: "text" | "citation"
  content: string
  sources?: MessageSource[]
}

export function splitContentWithCitations(
  content: string,
  sources: MessageSource[]
): ContentSegment[] {
  const segments: ContentSegment[] = []
  let lastIndex = 0

  // Reset regex state
  const regex = new RegExp(CITATION_REGEX.source, "g")
  let match

  while ((match = regex.exec(content)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      })
    }

    // Find matching sources for this citation
    const marker = match[1]
    const matchingSources = sources.filter((s) => {
      const filename = s.source.split("/").pop() || s.source
      return filename === marker || filename.toLowerCase() === marker.toLowerCase()
    })

    segments.push({
      type: "citation",
      content: marker,
      sources: matchingSources.length > 0 ? matchingSources : undefined,
    })

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      content: content.slice(lastIndex),
    })
  }

  return segments
}

/**
 * Remove citation markers from content for clean display
 */
export function stripCitationMarkers(content: string): string {
  return content.replace(CITATION_REGEX, "").replace(/\s{2,}/g, " ").trim()
}

interface CitationBadgeProps {
  /** Primary source to display */
  source: MessageSource
  /** Additional sources grouped with this citation */
  additionalSources?: MessageSource[]
  /** Display style */
  variant?: "inline" | "standalone"
  className?: string
}

/**
 * Get a favicon URL for a source
 */
function getFaviconUrl(source: string): string | null {
  try {
    if (source.includes("://")) {
      const url = new URL(source)
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
    }
    if (source.includes(".") && !source.includes(" ") && !source.includes("/")) {
      return `https://www.google.com/s2/favicons?domain=${source}&sz=32`
    }
  } catch {
    // Not a valid URL
  }
  return null
}

/**
 * Get display name from source path/filename
 */
function getDisplayName(source: string): string {
  const parts = source.split("/")
  const filename = parts[parts.length - 1] || source
  return filename.replace(/\.[^/.]+$/, "")
}

/**
 * Get domain from source URL
 */
function getDomain(source: string): string {
  try {
    if (source.includes("://")) {
      const url = new URL(source)
      return url.hostname.replace("www.", "")
    }
  } catch {
    // Not a valid URL
  }
  // Return file extension or type
  const ext = source.split(".").pop()
  return ext || "document"
}

/**
 * Get badge label - filename for documents, domain for URLs
 */
function getBadgeLabel(source: string): string {
  // For URLs, return domain
  try {
    if (source.includes("://")) {
      const url = new URL(source)
      return url.hostname.replace("www.", "")
    }
  } catch {
    // Not a valid URL
  }
  // For files, return filename without extension
  return getDisplayName(source)
}

interface InlineCitationBadgeProps {
  /** Citation marker text (e.g., "filename.md") */
  marker: string
  /** Matching sources for this citation */
  sources?: MessageSource[]
  className?: string
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
  const [viewerOpen, setViewerOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Get display label (filename without extension)
  const displayLabel = marker.replace(/\.[^/.]+$/, "")

  // Compute values that are safe even when sources is empty
  const hasSources = sources && sources.length > 0
  const totalSources = hasSources ? sources.length : 0
  const primarySource = hasSources ? sources[0] : null
  const additionalSources = hasSources ? sources.slice(1) : []
  const currentSource = hasSources ? sources[currentIndex] : null
  const faviconUrl = primarySource ? getFaviconUrl(primarySource.source) : null

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalSources - 1))
  }, [totalSources])

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev < totalSources - 1 ? prev + 1 : 0))
  }, [totalSources])

  const handleViewDocument = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setViewerOpen(true)
  }, [])

  const isDocument = !!currentSource?.document_id

  // If no sources match, show a simple badge without popover
  if (!hasSources) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
          "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
          "whitespace-nowrap align-baseline",
          className
        )}
      >
        <FileText className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{displayLabel}</span>
      </span>
    )
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
            className
          )}
        >
          <FileText className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{displayLabel}</span>
          {totalSources > 1 && (
            <span className="text-zinc-400 dark:text-zinc-500">+{totalSources - 1}</span>
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
                  aria-label="Previous source"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs text-muted-foreground min-w-[28px] text-center">
                  {currentIndex + 1}/{totalSources}
                </span>
                <button
                  onClick={handleNext}
                  className="rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                  aria-label="Next source"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <span className="text-xs text-muted-foreground">
                {totalSources} sources
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
                      e.currentTarget.style.display = "none"
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
                  View Document
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
  )
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
  const allSources = [source, ...additionalSources]
  const [currentIndex, setCurrentIndex] = useState(0)
  const [viewerOpen, setViewerOpen] = useState(false)
  const currentSource = allSources[currentIndex]
  const totalSources = allSources.length

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : totalSources - 1))
  }, [totalSources])

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev < totalSources - 1 ? prev + 1 : 0))
  }, [totalSources])

  const handleViewDocument = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setViewerOpen(true)
  }, [])

  const faviconUrl = getFaviconUrl(source.source)
  const additionalCount = additionalSources.length
  const badgeLabel = getBadgeLabel(source.source)

  // Check if current source is a document (has document_id)
  const isDocument = !!currentSource.document_id

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
            "bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground",
            variant === "inline" && "mx-0.5 align-baseline",
            className
          )}
        >
          {faviconUrl && (
            <img
              src={faviconUrl}
              alt=""
              className="h-3 w-3 rounded-sm"
              onError={(e) => {
                e.currentTarget.style.display = "none"
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
        className="w-80 p-0 overflow-hidden"
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
                    const favicon = getFaviconUrl(s.source)
                    return favicon ? (
                      <img
                        key={i}
                        src={favicon}
                        alt=""
                        className={cn(
                          "h-5 w-5 rounded-full border-2 border-popover",
                          i === currentIndex && "ring-2 ring-primary"
                        )}
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                        }}
                      />
                    ) : (
                      <div
                        key={i}
                        className={cn(
                          "h-5 w-5 rounded-full border-2 border-popover bg-muted flex items-center justify-center",
                          i === currentIndex && "ring-2 ring-primary"
                        )}
                      >
                        <FileText className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                    )
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
                    e.currentTarget.style.display = "none"
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
            <p className="text-sm text-muted-foreground line-clamp-3">
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
  )
}

interface SourcesHeaderProps {
  sources: MessageSource[]
  className?: string
}

/**
 * Collapsible sources header showing the search process and source list
 * Similar to the "Reviewed X sources" UI in the reference
 */
export function SourcesHeader({ sources, className }: SourcesHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewerDocId, setViewerDocId] = useState<string | null>(null)
  const [viewerFilename, setViewerFilename] = useState<string>("")
  const [viewerFileType, setViewerFileType] = useState<string>("")

  if (sources.length === 0) return null

  // Group sources by filename/domain for cleaner display
  const groupedSources = sources.reduce((acc, source) => {
    const key = getDisplayName(source.source)
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(source)
    return acc
  }, {} as Record<string, MessageSource[]>)

  const uniqueSources = Object.values(groupedSources).map(group => group[0])
  const uniqueCount = uniqueSources.length

  const handleSourceClick = (source: MessageSource) => {
    if (source.document_id) {
      setViewerDocId(source.document_id)
      setViewerFilename(source.source)
      setViewerFileType(source.file_type)
    }
  }

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className={className}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group">
          <span>Reviewed {uniqueCount} {uniqueCount === 1 ? "source" : "sources"}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180"
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
                const faviconUrl = getFaviconUrl(source.source)
                const domain = getDomain(source.source)
                const title = getDisplayName(source.source)
                const isClickable = !!source.document_id

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
                        : "cursor-default"
                    )}
                  >
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt=""
                        className="h-5 w-5 rounded flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
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
                )
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
          if (!open) setViewerDocId(null)
        }}
      />
    </>
  )
}
