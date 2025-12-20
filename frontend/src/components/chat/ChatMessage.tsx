import * as React from "react"
import { useState, useCallback, isValidElement, memo } from "react"
import { Streamdown } from "streamdown"
import { Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { StreamingIndicator } from "./StreamingIndicator"
import { CodeBlock } from "./CodeBlock"
import { TableBlock } from "./TableBlock"

type MessageRole = "user" | "assistant"

interface ChatMessageProps {
  role: MessageRole
  content: string
  isStreaming?: boolean
  className?: string
}

/** Code block configuration */
export interface CodeBlockConfig {
  /** Show the language label in the header */
  showLanguage?: boolean
  /** Show the copy button */
  showCopy?: boolean
  /** Show the download button */
  showDownload?: boolean
  /** Only show controls on hover */
  showControlsOnHover?: boolean
}

/** Table block configuration */
export interface TableBlockConfig {
  /** Show the copy button */
  showCopy?: boolean
  /** Show the download button (exports as CSV) */
  showDownload?: boolean
  /** Only show controls on hover */
  showControlsOnHover?: boolean
}

const MessageCopyButton = memo(function MessageCopyButton({
  content,
  className
}: {
  content: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className
      )}
      aria-label="Copy message"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  )
})

const defaultCodeBlockConfig: CodeBlockConfig = {
  showLanguage: false,
  showCopy: true,
  showDownload: true,
  showControlsOnHover: true,
}

const defaultTableBlockConfig: TableBlockConfig = {
  showCopy: true,
  showDownload: true,
  showControlsOnHover: true,
}

const languageRegex = /language-([^\s]+)/

const PreComponent = ({ children }: { children?: React.ReactNode }) => children

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
    )
  }
}

function createCodeComponent(config: CodeBlockConfig) {
  return function CustomCode({
    children,
    className,
    node,
  }: {
    children?: React.ReactNode
    className?: string
    node?: { position?: { start: { line: number }; end: { line: number } } }
  }) {
    const isInline = node?.position?.start.line === node?.position?.end.line

    if (isInline) {
      return (
        <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-sm", className)}>
          {children}
        </code>
      )
    }

    const match = className?.match(languageRegex)
    const language = match?.[1] || ""

    let code = ""
    if (
      isValidElement(children) &&
      children.props &&
      typeof children.props === "object" &&
      "children" in children.props
    ) {
      code = String(children.props.children)
    } else if (typeof children === "string") {
      code = children
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
    )
  }
}

const defaultCustomComponents = {
  code: createCodeComponent(defaultCodeBlockConfig),
  pre: PreComponent,
  table: createTableComponent(defaultTableBlockConfig),
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isStreaming = false,
  className,
}: ChatMessageProps) {
  const isUser = role === "user"

  if (isUser) {
    return (
      <div className={cn("group flex w-full items-start justify-end gap-2", className)}>
        <MessageCopyButton
          content={content}
          className="mt-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        />
        <div className="max-w-[85%] rounded-full bg-muted px-4 py-2.5 text-[15px]">
          {content ? (
            <div className="prose max-w-none break-words text-[15px] leading-normal prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground [&>*]:my-0 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-0">
              <Streamdown isAnimating={isStreaming}>{content}</Streamdown>
            </div>
          ) : null}
        </div>
      </div>
    )
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
              "prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground dark:prose-invert"
            )}
          >
            <Streamdown
              isAnimating={isStreaming}
              components={defaultCustomComponents}
            >
              {content}
            </Streamdown>
          </div>
          <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100">
            <MessageCopyButton content={content} />
          </div>
        </>
      ) : isStreaming ? (
        <StreamingIndicator className="text-muted-foreground" />
      ) : null}
    </div>
  )
})
