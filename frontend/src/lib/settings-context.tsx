import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useEffectiveChatSettings } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import type { EffectiveChatSettings } from "@/lib/api";

interface SettingsContextValue {
  effectiveSettings: EffectiveChatSettings | null;
  isLoading: boolean;
}

const defaultEffectiveSettings: EffectiveChatSettings = {
  chat_enabled: true,
  chat_disabled_by: null,
  chat_panel_enabled: true,
  chat_panel_disabled_by: null,
  memory_enabled: true,
  memory_disabled_by: null,
  mcp_enabled: true,
  mcp_disabled_by: null,
  mcp_allow_custom_servers: true,
  mcp_custom_servers_disabled_by: null,
  disabled_mcp_servers: [],
  disabled_tools: [],
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { currentOrg, currentTeam } = useWorkspace();

  const { data: effectiveSettings, isLoading } = useEffectiveChatSettings(
    currentOrg?.id,
    currentTeam?.id,
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      effectiveSettings: effectiveSettings ?? defaultEffectiveSettings,
      isLoading,
    }),
    [effectiveSettings, isLoading],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    return {
      effectiveSettings: defaultEffectiveSettings,
      isLoading: false,
    };
  }
  return context;
}

export function useEffectiveSettings(): EffectiveChatSettings {
  const { effectiveSettings } = useSettings();
  return effectiveSettings ?? defaultEffectiveSettings;
}
