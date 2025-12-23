import * as React from "react";
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { Check, Copy, Download } from "lucide-react";
import { codeToTokens, bundledLanguages, type BundledLanguage } from "shiki";
import { cn } from "@/lib/utils";

const languageExtensions: Record<string, string> = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  ruby: "rb",
  rust: "rs",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
  csharp: "cs",
  php: "php",
  swift: "swift",
  kotlin: "kt",
  scala: "scala",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  xml: "xml",
  markdown: "md",
  sql: "sql",
  shell: "sh",
  bash: "sh",
  zsh: "zsh",
  powershell: "ps1",
  dockerfile: "dockerfile",
  graphql: "graphql",
  jsx: "jsx",
  tsx: "tsx",
};

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  /** Show the language label in the header */
  showLanguage?: boolean;
  /** Show the copy button */
  showCopy?: boolean;
  /** Show the download button */
  showDownload?: boolean;
  /** Only show controls on hover */
  showControlsOnHover?: boolean;
  /** Custom filename for downloads (default: auto-generated) */
  filename?: string;
  /** Light and dark themes for syntax highlighting */
  themes?: [string, string];
}

interface TokenStyle {
  color?: string;
  bgColor?: string;
  htmlStyle?: React.CSSProperties;
  content: string;
}

interface HighlightResult {
  tokens: TokenStyle[][];
  bg: string;
  fg: string;
}

function CopyButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "cursor-pointer p-1 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      title="Copy code"
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function DownloadButton({
  code,
  language,
  filename,
  className,
}: {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
}) {
  const handleDownload = useCallback(() => {
    const ext =
      language && languageExtensions[language]
        ? languageExtensions[language]
        : "txt";
    const downloadFilename = filename || `code.${ext}`;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [code, language, filename]);

  return (
    <button
      onClick={handleDownload}
      className={cn(
        "cursor-pointer p-1 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      title="Download code"
      type="button"
    >
      <Download size={14} />
    </button>
  );
}

function isValidLanguage(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang);
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = "",
  className,
  showLanguage = false,
  showCopy = true,
  showDownload = false,
  showControlsOnHover = true,
  filename,
  themes = ["github-light", "github-dark"],
}: CodeBlockProps) {
  const [result, setResult] = useState<HighlightResult | null>(null);

  const defaultResult = useMemo<HighlightResult>(
    () => ({
      bg: "transparent",
      fg: "inherit",
      tokens: code
        .split("\n")
        .map((line) => [
          { content: line, color: "inherit", bgColor: "transparent" },
        ]),
    }),
    [code],
  );

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const lang = isValidLanguage(language) ? language : "text";

      try {
        const highlighted = await codeToTokens(code, {
          lang,
          themes: { light: themes[0], dark: themes[1] },
        });

        if (!cancelled) {
          setResult({
            tokens: highlighted.tokens.map((line) =>
              line.map((token) => ({
                content: token.content,
                color: token.color,
                bgColor: token.bgColor,
                htmlStyle: token.htmlStyle as React.CSSProperties,
              })),
            ),
            bg: highlighted.bg || "transparent",
            fg: highlighted.fg || "inherit",
          });
        }
      } catch (err) {
        console.error("Failed to highlight code:", err);
        if (!cancelled) {
          setResult(defaultResult);
        }
      }
    }

    highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language, themes, defaultResult]);

  const displayResult = result || defaultResult;
  const hasControls = showCopy || showDownload;

  return (
    <div
      className={cn(
        "group/code my-4 w-full overflow-hidden rounded-xl border border-border",
        className,
      )}
      data-language={language}
    >
      <pre
        className="m-0 overflow-x-auto text-sm leading-relaxed"
        style={{ backgroundColor: displayResult.bg, color: displayResult.fg }}
      >
        <code className="block px-4 py-2.5 [counter-increment:line_0] [counter-reset:line]">
          {displayResult.tokens.map((line, lineIndex) => (
            <span
              key={lineIndex}
              className="block before:mr-4 before:inline-block before:w-4 before:text-right before:text-muted-foreground/50 before:font-mono before:text-[13px] before:select-none before:content-[counter(line)] before:[counter-increment:line]"
            >
              {line.map((token, tokenIndex) => (
                <span
                  key={tokenIndex}
                  className="dark:bg-(--shiki-dark-bg)! dark:text-(--shiki-dark)!"
                  style={{
                    color: token.color,
                    backgroundColor: token.bgColor,
                    ...token.htmlStyle,
                  }}
                >
                  {token.content}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
      {hasControls && (
        <div
          className={cn(
            "flex items-center justify-end gap-1 border-t border-border bg-muted/80 px-3 py-1.5",
            showControlsOnHover &&
              "h-0 overflow-hidden border-t-0 py-0 opacity-0 transition-all group-hover/code:h-auto group-hover/code:border-t group-hover/code:py-1.5 group-hover/code:opacity-100",
          )}
        >
          {showLanguage && language && (
            <span className="mr-auto font-mono text-xs lowercase text-muted-foreground">
              {language}
            </span>
          )}
          {showDownload && (
            <DownloadButton
              code={code}
              language={language}
              filename={filename}
            />
          )}
          {showCopy && <CopyButton code={code} />}
        </div>
      )}
    </div>
  );
});

export const MinimalCodeBlock = memo(function MinimalCodeBlock(
  props: Omit<CodeBlockProps, "showLanguage" | "showCopy" | "showDownload">,
) {
  return (
    <CodeBlock
      {...props}
      showLanguage={false}
      showCopy={false}
      showDownload={false}
    />
  );
});

export const CopyOnlyCodeBlock = memo(function CopyOnlyCodeBlock(
  props: Omit<CodeBlockProps, "showLanguage" | "showDownload">,
) {
  return <CodeBlock {...props} showLanguage={false} showDownload={false} />;
});
