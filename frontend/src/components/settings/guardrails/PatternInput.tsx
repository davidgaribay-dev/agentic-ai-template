/**
 * Pattern input component for adding/removing regex patterns.
 */

import { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PatternInputProps {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function PatternInput({
  patterns,
  onChange,
  disabled,
  placeholder = "Add regex pattern...",
}: PatternInputProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Validate regex
    try {
      new RegExp(trimmed);
      if (!patterns.includes(trimmed)) {
        onChange([...patterns, trimmed]);
        setInput("");
        setError(null);
      }
    } catch {
      setError("Invalid regex pattern");
    }
  }, [input, patterns, onChange]);

  const handleRemove = useCallback(
    (pattern: string) => {
      onChange(patterns.filter((p) => p !== pattern));
    },
    [patterns, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 font-mono text-sm",
            error && "border-destructive",
          )}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={disabled || !input.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((pattern) => (
            <Badge
              key={pattern}
              variant="outline"
              className="gap-1 pr-1 font-mono text-xs"
            >
              {pattern}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(pattern)}
                  className="ml-0.5 hover:bg-muted rounded-sm p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
