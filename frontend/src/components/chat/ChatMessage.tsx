import * as React from "react";
import { useState, useCallback, isValidElement, memo, useMemo } from "react";
import { Streamdown } from "streamdown";
import { Copy, Check, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { StreamingIndicator } from "./StreamingIndicator";
import { CodeBlock } from "./CodeBlock";
import { TableBlock } from "./TableBlock";
import { MessageMedia } from "./MessageMedia";
import {
  SourcesHeader,
  CitationBadge,
  InlineCitationBadge,
  hasInlineCitations,
} from "./CitationBadge";
import type { MessageSource, ChatMediaAttachment } from "@/lib/chat-store";

type MessageRole = "user" | "assistant";

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  sources?: MessageSource[];
  media?: ChatMediaAttachment[];
  className?: string;
  /** Whether this message was blocked by guardrails */
  guardrail_blocked?: boolean;
}

/** Code block configuration */
export interface CodeBlockConfig {
  /** Show the language label in the header */
  showLanguage?: boolean;
  /** Show the copy button */
  showCopy?: boolean;
  /** Show the download button */
  showDownload?: boolean;
  /** Only show controls on hover */
  showControlsOnHover?: boolean;
}

/** Table block configuration */
export interface TableBlockConfig {
  /** Show the copy button */
  showCopy?: boolean;
  /** Show the download button (exports as CSV) */
  showDownload?: boolean;
  /** Only show controls on hover */
  showControlsOnHover?: boolean;
}

const MessageCopyButton = memo(function MessageCopyButton({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
      aria-label="Copy message"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
});

const defaultCodeBlockConfig: CodeBlockConfig = {
  showLanguage: false,
  showCopy: true,
  showDownload: true,
  showControlsOnHover: true,
};

const defaultTableBlockConfig: TableBlockConfig = {
  showCopy: true,
  showDownload: true,
  showControlsOnHover: true,
};

const languageRegex = /language-([^\s]+)/;

const PreComponent = ({ children }: { children?: React.ReactNode }) => children;

function createTableComponent(config: TableBlockConfig) {
  return function CustomTable({ children }: { children?: React.ReactNode }) {
    return (
      <TableBlock
        showCopy={config.showCopy}
        showDownload={config.showDownload}
        showControlsOnHover={config.showControlsOnHover}
      >
        {children}
      </TableBlock>
    );
  };
}

function createCodeComponent(config: CodeBlockConfig) {
  return function CustomCode({
    children,
    className,
    node,
  }: {
    children?: React.ReactNode;
    className?: string;
    node?: { position?: { start: { line: number }; end: { line: number } } };
  }) {
    const isInline = node?.position?.start.line === node?.position?.end.line;

    if (isInline) {
      return (
        <code
          className={cn(
            "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
            className,
          )}
        >
          {children}
        </code>
      );
    }

    const match = className?.match(languageRegex);
    const language = match?.[1] || "";

    let code = "";
    if (
      isValidElement(children) &&
      children.props &&
      typeof children.props === "object" &&
      "children" in children.props
    ) {
      code = String(children.props.children);
    } else if (typeof children === "string") {
      code = children;
    }

    return (
      <CodeBlock
        code={code}
        language={language}
        showLanguage={config.showLanguage}
        showCopy={config.showCopy}
        showDownload={config.showDownload}
        showControlsOnHover={config.showControlsOnHover}
      />
    );
  };
}

const defaultCustomComponents = {
  code: createCodeComponent(defaultCodeBlockConfig),
  pre: PreComponent,
  table: createTableComponent(defaultTableBlockConfig),
};

/** Unique placeholder for citations that won't appear in normal text */
const CITATION_PLACEHOLDER_PREFIX = "〈CITE:";
const CITATION_PLACEHOLDER_SUFFIX = "〉";
const CITATION_PLACEHOLDER_REGEX = /〈CITE:(\d+)〉/g;

/**
 * Pre-process content to replace [[citation]] markers with unique placeholders
 * that we can then render with custom components
 */
function preprocessCitations(content: string): {
  processedContent: string;
  citationMap: Map<number, string>;
} {
  const citationMap = new Map<number, string>();
  let index = 0;

  const processedContent = content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, citation) => {
      citationMap.set(index, citation);
      const placeholder = `${CITATION_PLACEHOLDER_PREFIX}${index}${CITATION_PLACEHOLDER_SUFFIX}`;
      index++;
      return placeholder;
    },
  );

  return { processedContent, citationMap };
}

/**
 * Create custom components that handle inline citations via placeholder replacement
 */
function createComponentsWithCitations(
  sources: MessageSource[],
  citationMap: Map<number, string>,
) {
  // Shared function to process children for citation placeholders
  const processChildren = (child: React.ReactNode): React.ReactNode => {
    if (typeof child === "string") {
      // Check if this string contains any citation placeholders
      if (child.includes(CITATION_PLACEHOLDER_PREFIX)) {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;
        const regex = new RegExp(CITATION_PLACEHOLDER_REGEX.source, "g");

        while ((match = regex.exec(child)) !== null) {
          // Add text before the placeholder
          if (match.index > lastIndex) {
            parts.push(child.slice(lastIndex, match.index));
          }

          // Get the citation marker from our map
          const citationIndex = parseInt(match[1], 10);
          const marker = citationMap.get(citationIndex) || "";

          // Find matching sources for this citation (deduplicated by document_id)
          const allMatching = sources.filter((s) => {
            const filename = s.source.split("/").pop() || s.source;
            return (
              filename === marker ||
              filename.toLowerCase() === marker.toLowerCase()
            );
          });
          // Deduplicate by document_id - keep only one chunk per document
          const seenDocIds = new Set<string>();
          const matchingSources = allMatching.filter((s) => {
            const docId = s.document_id || s.source;
            if (seenDocIds.has(docId)) return false;
            seenDocIds.add(docId);
            return true;
          });

          parts.push(
            <InlineCitationBadge
              key={`cite-${citationIndex}`}
              marker={marker}
              sources={matchingSources.length > 0 ? matchingSources : undefined}
            />,
          );

          lastIndex = match.index + match[0].length;
        }

        // Add remaining text after last placeholder
        if (lastIndex < child.length) {
          parts.push(child.slice(lastIndex));
        }

        return parts.length === 1 ? parts[0] : <>{parts}</>;
      }
      return child;
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{
        children?: React.ReactNode;
      }>;
      if (element.props.children) {
        return React.cloneElement(element, {
          ...element.props,
          children: React.Children.map(element.props.children, processChildren),
        } as React.Attributes & { children?: React.ReactNode });
      }
    }
    return child;
  };

  // Override paragraph to use citation-aware text rendering
  const ParagraphWithCitations = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => {
    return <p>{React.Children.map(children, processChildren)}</p>;
  };

  // Override list items to handle citations
  const ListItemWithCitations = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => {
    return <li>{React.Children.map(children, processChildren)}</li>;
  };

  // Override strong (bold) text
  const StrongWithCitations = ({
    children,
  }: {
    children?: React.ReactNode;
  }) => {
    return <strong>{React.Children.map(children, processChildren)}</strong>;
  };

  // Override emphasis (italic) text
  const EmWithCitations = ({ children }: { children?: React.ReactNode }) => {
    return <em>{React.Children.map(children, processChildren)}</em>;
  };

  // Override headings
  const H1WithCitations = ({ children }: { children?: React.ReactNode }) => {
    return <h1>{React.Children.map(children, processChildren)}</h1>;
  };
  const H2WithCitations = ({ children }: { children?: React.ReactNode }) => {
    return <h2>{React.Children.map(children, processChildren)}</h2>;
  };
  const H3WithCitations = ({ children }: { children?: React.ReactNode }) => {
    return <h3>{React.Children.map(children, processChildren)}</h3>;
  };

  // Override spans and other inline elements
  const SpanWithCitations = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
  } & React.HTMLAttributes<HTMLSpanElement>) => {
    return (
      <span {...props}>{React.Children.map(children, processChildren)}</span>
    );
  };

  return {
    ...defaultCustomComponents,
    p: ParagraphWithCitations,
    li: ListItemWithCitations,
    strong: StrongWithCitations,
    em: EmWithCitations,
    h1: H1WithCitations,
    h2: H2WithCitations,
    h3: H3WithCitations,
    span: SpanWithCitations,
  };
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isStreaming = false,
  sources,
  media,
  className,
  guardrail_blocked = false,
}: ChatMessageProps) {
  const isUser = role === "user";

  // Pre-process content to replace [[citation]] markers with placeholders
  const { processedContent, citationMap } = useMemo(() => {
    if (content && sources && sources.length > 0 && !isStreaming) {
      return preprocessCitations(content);
    }
    return {
      processedContent: content,
      citationMap: new Map<number, string>(),
    };
  }, [content, sources, isStreaming]);

  // Create custom components with citation support when sources are available
  const customComponents = useMemo(() => {
    if (sources && sources.length > 0 && !isStreaming && citationMap.size > 0) {
      return createComponentsWithCitations(sources, citationMap);
    }
    return defaultCustomComponents;
  }, [sources, isStreaming, citationMap]);

  // Check if content has inline citations (for deciding whether to show bottom badges)
  const contentHasInlineCitations = useMemo(() => {
    return content ? hasInlineCitations(content) : false;
  }, [content]);

  if (isUser) {
    const hasMedia = media && media.length > 0;

    return (
      <div
        className={cn(
          "group flex w-full items-start justify-end gap-2",
          className,
        )}
      >
        <MessageCopyButton
          content={content}
          className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        />
        <div
          className={cn(
            "max-w-[85%] bg-muted text-[15px]",
            hasMedia ? "rounded-xl px-3 py-2.5" : "rounded-full px-4 py-2.5",
          )}
        >
          {hasMedia && <MessageMedia media={media} className="mb-2" />}
          {content ? (
            <div className="prose max-w-none break-words text-[15px] leading-normal prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground [&>*]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0">
              <Streamdown isAnimating={isStreaming}>{content}</Streamdown>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Guardrail blocked message - show special UI
  if (guardrail_blocked) {
    return (
      <div className={cn("group w-full", className)}>
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-4 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive mb-1">
              Message blocked by content policy
            </p>
            <p className="text-sm text-muted-foreground">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group w-full", className)}>
      {content ? (
        <>
          <div
            className={cn(
              "prose max-w-none break-words text-[15px] leading-relaxed",
              "[&>*]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mb-2 [&_h1]:mt-4",
              "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3",
              "[&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2",
              "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-1 [&_p]:my-2",
              "[&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-4 [&_td]:py-2.5",
              "[&_pre]:m-0 [&_pre]:p-0 [&_pre]:bg-transparent [&_code]:p-0 [&_code]:bg-transparent",
              "prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground dark:prose-invert",
            )}
          >
            <Streamdown isAnimating={isStreaming} components={customComponents}>
              {processedContent}
            </Streamdown>
          </div>

          {/* Source Citations - Collapsible header showing search process */}
          {sources && sources.length > 0 && !isStreaming && (
            <SourcesHeader sources={sources} className="mt-4" />
          )}

          {/* Bottom citation badges - only show if content doesn't have inline citations */}
          {sources &&
            sources.length > 0 &&
            !isStreaming &&
            !contentHasInlineCitations && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(() => {
                  // Group sources by filename for inline display
                  const grouped: Record<string, MessageSource[]> = {};
                  for (const source of sources) {
                    const filename =
                      source.source.split("/").pop() || source.source;
                    if (!grouped[filename]) {
                      grouped[filename] = [];
                    }
                    grouped[filename].push(source);
                  }

                  return Object.values(grouped).map((sourceGroup) => (
                    <CitationBadge
                      key={sourceGroup[0].source}
                      source={sourceGroup[0]}
                      additionalSources={sourceGroup.slice(1)}
                      variant="standalone"
                    />
                  ));
                })()}
              </div>
            )}

          <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
            <MessageCopyButton content={content} />
          </div>
        </>
      ) : isStreaming ? (
        <StreamingIndicator className="text-muted-foreground" />
      ) : null}
    </div>
  );
});
