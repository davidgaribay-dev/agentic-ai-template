import type { MessageSource } from "@/lib/chat-store";

/** Result of parsing content for inline citations */
export interface ParsedCitation {
  /** The citation marker text (e.g., "filename.md") */
  marker: string;
  /** Matching sources from the message's sources array */
  sources: MessageSource[];
}

/** Segment of content - either plain text or a citation */
export interface ContentSegment {
  type: "text" | "citation";
  content: string;
  sources?: MessageSource[];
}
