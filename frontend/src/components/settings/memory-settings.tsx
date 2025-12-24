import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const getDisabledBy = (): DisabledByLevel => {
    if (memoryDisabledByOrg) return "org";
    if (memoryDisabledByTeam && level !== "team") return "team";
    return null;
  };

  const disabledBy = getDisabledBy();
  const isDisabledByHigherLevel = disabledBy === "org" || disabledBy === "team";

  const getTooltipMessage = (): string | null => {
    if (disabledBy === "org") return t("memory_disabled_by_org");
    if (disabledBy === "team") return t("memory_disabled_by_team");
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
            {t("memory_enabled")}
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
          {t("memory_enabled_desc")}
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
