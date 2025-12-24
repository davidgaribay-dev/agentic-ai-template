import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffectiveChatSettings, queryKeys } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import type { EffectiveChatSettings } from "@/lib/api";

interface SettingsContextValue {
  effectiveSettings: EffectiveChatSettings | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isStale: boolean;
  refetch: () => void;
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
  const queryClient = useQueryClient();

  const {
    data: effectiveSettings,
    isLoading,
    isError,
    error,
    isStale,
  } = useEffectiveChatSettings(currentOrg?.id, currentTeam?.id);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.chatSettings.effective(
        currentOrg?.id,
        currentTeam?.id,
      ),
    });
  }, [queryClient, currentOrg?.id, currentTeam?.id]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      effectiveSettings: effectiveSettings ?? defaultEffectiveSettings,
      isLoading,
      isError,
      error: error as Error | null,
      isStale,
      refetch,
    }),
    [effectiveSettings, isLoading, isError, error, isStale, refetch],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

const noopRefetch = () => {};

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    return {
      effectiveSettings: defaultEffectiveSettings,
      isLoading: false,
      isError: false,
      error: null,
      isStale: false,
      refetch: noopRefetch,
    };
  }
  return context;
}

export function useEffectiveSettings(): EffectiveChatSettings {
  const { effectiveSettings } = useSettings();
  return effectiveSettings ?? defaultEffectiveSettings;
}
