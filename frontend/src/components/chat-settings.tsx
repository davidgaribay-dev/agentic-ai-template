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
import type {
  ChatSettings as ChatSettingsType,
  DisabledByLevel,
} from "@/lib/api";

export interface ChatSettingsProps {
  settings: ChatSettingsType;
  onChatEnabledChange: (enabled: boolean) => void;
  onChatPanelEnabledChange: (enabled: boolean) => void;
  chatDisabledByOrg?: boolean;
  chatDisabledByTeam?: boolean;
  chatPanelDisabledByOrg?: boolean;
  chatPanelDisabledByTeam?: boolean;
  isLoading?: boolean;
  level: "org" | "team" | "user";
}

function SettingRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  tooltipMessage,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  tooltipMessage: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="space-y-0.5 pr-4">
        <div className="flex items-center gap-2">
          <Label
            htmlFor={id}
            className={disabled ? "text-muted-foreground" : ""}
          >
            {label}
          </Label>
          {disabled && tooltipMessage && (
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
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

export function ChatSettings({
  settings,
  onChatEnabledChange,
  onChatPanelEnabledChange,
  chatDisabledByOrg,
  chatDisabledByTeam,
  chatPanelDisabledByOrg,
  chatPanelDisabledByTeam,
  isLoading = false,
  level,
}: ChatSettingsProps) {
  const { t } = useTranslation();

  const getChatDisabledBy = (): DisabledByLevel => {
    if (chatDisabledByOrg) return "org";
    if (chatDisabledByTeam && level !== "team") return "team";
    return null;
  };

  const getChatPanelDisabledBy = (): DisabledByLevel => {
    if (chatPanelDisabledByOrg) return "org";
    if (chatPanelDisabledByTeam && level !== "team") return "team";
    return null;
  };

  const chatDisabledBy = getChatDisabledBy();
  const chatPanelDisabledBy = getChatPanelDisabledBy();

  const isChatDisabledByHigherLevel =
    chatDisabledBy === "org" || chatDisabledBy === "team";
  const isChatPanelDisabledByHigherLevel =
    chatPanelDisabledBy === "org" || chatPanelDisabledBy === "team";

  const getTooltipMessage = (disabledBy: DisabledByLevel): string | null => {
    if (disabledBy === "org") return t("chat_disabled_by_org_setting");
    if (disabledBy === "team") return t("chat_disabled_by_team_setting");
    return null;
  };

  return (
    <div className="space-y-4">
      <SettingRow
        id="chat-enabled"
        label={t("chat_enabled")}
        description={t("chat_enabled_desc")}
        checked={isChatDisabledByHigherLevel ? false : settings.chat_enabled}
        onCheckedChange={onChatEnabledChange}
        disabled={isChatDisabledByHigherLevel || isLoading}
        tooltipMessage={getTooltipMessage(chatDisabledBy)}
      />
      <SettingRow
        id="chat-panel-enabled"
        label={t("chat_panel_enabled")}
        description={t("chat_panel_enabled_desc")}
        checked={
          isChatPanelDisabledByHigherLevel ? false : settings.chat_panel_enabled
        }
        onCheckedChange={onChatPanelEnabledChange}
        disabled={isChatPanelDisabledByHigherLevel || isLoading}
        tooltipMessage={getTooltipMessage(chatPanelDisabledBy)}
      />
    </div>
  );
}
