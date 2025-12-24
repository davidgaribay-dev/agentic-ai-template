/**
 * Tag input component for adding/removing blocked keywords.
 */

import { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface KeywordInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function KeywordInput({
  keywords,
  onChange,
  disabled,
  placeholder = "Add keyword...",
}: KeywordInputProps) {
  const [input, setInput] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
      setInput("");
    }
  }, [input, keywords, onChange]);

  const handleRemove = useCallback(
    (keyword: string) => {
      onChange(keywords.filter((k) => k !== keyword));
    },
    [keywords, onChange],
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1"
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
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1 pr-1">
              {keyword}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(keyword)}
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
