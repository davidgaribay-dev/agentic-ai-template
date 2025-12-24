import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DisabledByLevel } from "@/lib/api";

export interface MemorySettingsProps {
  memoryEnabled: boolean;
  onMemoryEnabledChange: (enabled: boolean) => void;
  memoryDisabledByOrg?: boolean;
  memoryDisabledByTeam?: boolean;
  isLoading?: boolean;
  level: "org" | "team" | "user";
}

export function MemorySettings({
  memoryEnabled,
  onMemoryEnabledChange,
  memoryDisabledByOrg,
  memoryDisabledByTeam,
  isLoading = false,
  level,
}: MemorySettingsProps) {
  const getDisabledBy = (): DisabledByLevel => {
    if (memoryDisabledByOrg) return "org";
    if (memoryDisabledByTeam && level !== "team") return "team";
    return null;
  };

  const disabledBy = getDisabledBy();
  const isDisabledByHigherLevel = disabledBy === "org" || disabledBy === "team";

  const getTooltipMessage = (): string | null => {
    if (disabledBy === "org") return "Disabled by organization settings";
    if (disabledBy === "team") return "Disabled by team settings";
    return null;
  };

  const tooltipMessage = getTooltipMessage();

  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-0.5 pr-4">
        <div className="flex items-center gap-2">
          <Label
            htmlFor="memory-enabled"
            className={isDisabledByHigherLevel ? "text-muted-foreground" : ""}
          >
            Memory Enabled
          </Label>
          {isDisabledByHigherLevel && tooltipMessage && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltipMessage}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Remember information from conversations to personalize responses
        </p>
      </div>
      <Switch
        id="memory-enabled"
        checked={isDisabledByHigherLevel ? false : memoryEnabled}
        onCheckedChange={onMemoryEnabledChange}
        disabled={isDisabledByHigherLevel || isLoading}
      />
    </div>
  );
}
