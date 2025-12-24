/**
 * PII type selector component with checkboxes.
 */

import { useCallback } from "react";

import { PII_TYPES, PII_TYPE_LABELS, type PIIType } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PIITypeSelectorProps {
  selectedTypes: PIIType[];
  onChange: (types: PIIType[]) => void;
  disabled?: boolean;
}

export function PIITypeSelector({
  selectedTypes,
  onChange,
  disabled,
}: PIITypeSelectorProps) {
  const handleToggle = useCallback(
    (type: PIIType, checked: boolean) => {
      if (checked) {
        onChange([...selectedTypes, type]);
      } else {
        onChange(selectedTypes.filter((t) => t !== type));
      }
    },
    [selectedTypes, onChange],
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {PII_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-2">
          <Checkbox
            id={`pii-${type}`}
            checked={selectedTypes.includes(type)}
            onCheckedChange={(checked) => handleToggle(type, checked === true)}
            disabled={disabled}
          />
          <Label
            htmlFor={`pii-${type}`}
            className={cn("text-sm", disabled && "text-muted-foreground")}
          >
            {PII_TYPE_LABELS[type]}
          </Label>
        </div>
      ))}
    </div>
  );
}
