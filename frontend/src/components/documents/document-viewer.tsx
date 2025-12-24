import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { FileText, Loader2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { documentsApi } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";

interface DocumentViewerProps {
  /** Document ID to view */
  documentId: string | null;
  /** Filename for display (fallback if not fetched) */
  filename?: string;
  /** File type for syntax highlighting (fallback if not fetched) */
  fileType?: string;
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
}

/** Map file extensions to Monaco language identifiers */
function getMonacoLanguage(fileType: string): string {
  const languageMap: Record<string, string> = {
    // Code files
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    php: "php",
    swift: "swift",
    scala: "scala",
    r: "r",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    // Config/data files
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    toml: "toml",
    ini: "ini",
    conf: "ini",
    // Documentation
    md: "markdown",
    mdx: "markdown",
    rst: "restructuredtext",
    tex: "latex",
    // Plain text
    txt: "plaintext",
    log: "plaintext",
    csv: "plaintext",
  };
  return languageMap[fileType.toLowerCase()] || "plaintext";
}

/** Check if file type should use Monaco code view */
function isCodeFile(fileType: string): boolean {
  const codeExtensions = new Set([
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "rb",
    "go",
    "rs",
    "java",
    "kt",
    "cpp",
    "c",
    "cs",
    "php",
    "swift",
    "scala",
    "r",
    "sql",
    "sh",
    "bash",
    "zsh",
    "ps1",
    "json",
    "yaml",
    "yml",
    "xml",
    "html",
    "htm",
    "css",
    "scss",
    "less",
    "toml",
    "ini",
    "conf",
    "md",
    "mdx",
  ]);
  return codeExtensions.has(fileType.toLowerCase());
}

export function DocumentViewer({
  documentId,
  filename: providedFilename,
  fileType: providedFileType,
  open,
  onOpenChange,
}: DocumentViewerProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  // Determine Monaco theme based on app theme
  const monacoTheme = useMemo(() => {
    if (theme === "system") {
      // Check system preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "vs-dark"
        : "light";
    }
    return theme === "dark" ? "vs-dark" : "light";
  }, [theme]);

  // Fetch document content (reads original file or reconstructs from chunks)
  const {
    data: docContent,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["document-content", documentId],
    queryFn: async () => {
      if (!documentId) return null;
      return documentsApi.getContent(documentId);
    },
    enabled: open && !!documentId,
  });

  const content = docContent?.content || "";
  const filename = providedFilename || docContent?.filename || "Document";
  const fileType = providedFileType || docContent?.file_type || "txt";

  const useCodeView = isCodeFile(fileType);
  const monacoLanguage = getMonacoLanguage(fileType);

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Reset copied state when dialog closes
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl w-[90vw] h-[80vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <DialogTitle className="text-base font-semibold">
                {filename}
              </DialogTitle>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {fileType.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                disabled={!content}
                className="h-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-12 w-12 mb-2 opacity-50" />
              <p>Failed to load document content</p>
              <p className="text-sm">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          ) : useCodeView ? (
            <Editor
              height="100%"
              language={monacoLanguage}
              value={content || ""}
              theme={monacoTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                wrappingIndent: "indent",
                automaticLayout: true,
                padding: { top: 16, bottom: 16 },
                folding: true,
                renderLineHighlight: "none",
                selectionHighlight: true,
                occurrencesHighlight: "off",
              }}
            />
          ) : (
            <div className="h-full overflow-auto p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                {content}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
