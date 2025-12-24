import type { MessageSource } from "@/lib/chat-store";
import type { ParsedCitation, ContentSegment } from "./types";

/** Regex to match inline citation markers like [[filename.md]] */
const CITATION_REGEX = /\[\[([^\]]+)\]\]/g;

/**
 * Parse content to extract inline citation markers and match them with sources
 */
export function parseCitations(
  content: string,
  sources: MessageSource[],
): { cleanContent: string; citations: Map<string, ParsedCitation> } {
  const citations = new Map<string, ParsedCitation>();

  // Find all citation markers
  const matches = content.matchAll(CITATION_REGEX);
  for (const match of matches) {
    const marker = match[1];
    if (!citations.has(marker)) {
      // Find matching sources (by filename)
      const matchingSources = sources.filter((s) => {
        const filename = s.source.split("/").pop() || s.source;
        return (
          filename === marker || filename.toLowerCase() === marker.toLowerCase()
        );
      });
      citations.set(marker, { marker, sources: matchingSources });
    }
  }

  // Clean content is returned as-is - we'll replace markers during rendering
  return { cleanContent: content, citations };
}

/**
 * Check if content contains inline citation markers
 */
export function hasInlineCitations(content: string): boolean {
  // Create a new regex instance to avoid global state issues
  const regex = new RegExp(CITATION_REGEX.source);
  return regex.test(content);
}

/**
 * Split content into segments: text and citations
 */
export function splitContentWithCitations(
  content: string,
  sources: MessageSource[],
): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  // Reset regex state
  const regex = new RegExp(CITATION_REGEX.source, "g");
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the citation
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    // Find matching sources for this citation
    const marker = match[1];
    const matchingSources = sources.filter((s) => {
      const filename = s.source.split("/").pop() || s.source;
      return (
        filename === marker || filename.toLowerCase() === marker.toLowerCase()
      );
    });

    segments.push({
      type: "citation",
      content: marker,
      sources: matchingSources.length > 0 ? matchingSources : undefined,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Remove citation markers from content for clean display
 */
export function stripCitationMarkers(content: string): string {
  return content
    .replace(CITATION_REGEX, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
