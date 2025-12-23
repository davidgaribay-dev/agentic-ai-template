import * as React from "react";
import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Check, Copy, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface TableBlockProps {
  children: React.ReactNode;
  className?: string;
  /** Show the copy button */
  showCopy?: boolean;
  /** Show the download button (exports as CSV) */
  showDownload?: boolean;
  /** Only show controls on hover */
  showControlsOnHover?: boolean;
  /** Custom filename for downloads (default: table.csv) */
  filename?: string;
}

function CopyButton({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [content]);

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
      title="Copy table"
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function DownloadButton({
  content,
  filename,
  className,
}: {
  content: string;
  filename?: string;
  className?: string;
}) {
  const handleDownload = useCallback(() => {
    const downloadFilename = filename || "table.csv";
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [content, filename]);

  return (
    <button
      onClick={handleDownload}
      className={cn(
        "cursor-pointer p-1 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      title="Download as CSV"
      type="button"
    >
      <Download size={14} />
    </button>
  );
}

function extractTableData(tableElement: HTMLTableElement): {
  text: string;
  csv: string;
} {
  const rows: string[][] = [];

  const thead = tableElement.querySelector("thead");
  if (thead) {
    const headerRow = thead.querySelector("tr");
    if (headerRow) {
      const cells = Array.from(headerRow.querySelectorAll("th, td"));
      rows.push(cells.map((cell) => cell.textContent?.trim() || ""));
    }
  }

  const tbody = tableElement.querySelector("tbody") || tableElement;
  const bodyRows = tbody.querySelectorAll("tr");
  bodyRows.forEach((row) => {
    if (row.closest("thead")) return;
    const cells = Array.from(row.querySelectorAll("th, td"));
    rows.push(cells.map((cell) => cell.textContent?.trim() || ""));
  });

  const text = rows.map((row) => row.join("\t")).join("\n");

  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        })
        .join(","),
    )
    .join("\n");

  return { text, csv };
}

export const TableBlock = memo(function TableBlock({
  children,
  className,
  showCopy = true,
  showDownload = true,
  showControlsOnHover = true,
  filename,
}: TableBlockProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableData, setTableData] = useState<{ text: string; csv: string }>({
    text: "",
    csv: "",
  });

  useEffect(() => {
    if (tableRef.current) {
      const table = tableRef.current.querySelector("table");
      if (table) {
        setTableData(extractTableData(table));
      }
    }
  }, [children]);

  const hasControls = showCopy || showDownload;

  return (
    <div
      className={cn(
        "group/table my-4 w-full overflow-hidden rounded-xl border border-border",
        className,
      )}
    >
      <div
        ref={tableRef}
        className="overflow-x-auto [&>*]:my-0 [&_p]:my-0 [&_p]:py-0"
      >
        <table className="m-0 w-full border-collapse text-sm [&_thead]:bg-muted [&_thead]:border-b [&_thead]:border-border [&_tbody]:divide-y [&_tbody]:divide-border">
          {children}
        </table>
      </div>
      {hasControls && (
        <div
          className={cn(
            "flex items-center justify-end gap-1 border-t border-border bg-muted/80 px-3 py-1.5",
            showControlsOnHover &&
              "h-0 overflow-hidden border-t-0 py-0 opacity-0 transition-all group-hover/table:h-auto group-hover/table:border-t group-hover/table:py-1.5 group-hover/table:opacity-100",
          )}
        >
          {showDownload && (
            <DownloadButton content={tableData.csv} filename={filename} />
          )}
          {showCopy && <CopyButton content={tableData.text} />}
        </div>
      )}
    </div>
  );
});

export const MinimalTableBlock = memo(function MinimalTableBlock(
  props: Omit<TableBlockProps, "showCopy" | "showDownload">,
) {
  return <TableBlock {...props} showCopy={false} showDownload={false} />;
});

export const CopyOnlyTableBlock = memo(function CopyOnlyTableBlock(
  props: Omit<TableBlockProps, "showDownload">,
) {
  return <TableBlock {...props} showDownload={false} />;
});
