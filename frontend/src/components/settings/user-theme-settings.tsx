import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, Info } from "lucide-react";
import { ThemeModeSelector, ThemeGrid } from "@/components/theme-preview";
import {
  useUserThemeSettings,
  useUpdateUserThemeSettings,
  usePredefinedThemes,
  useEffectiveThemeSettings,
} from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import type { UserThemeSettingsUpdate } from "@/lib/api";

export function UserThemeSettings() {
  const { t } = useTranslation();
  const { currentOrg, currentTeam } = useWorkspace();
  const { data: userSettings, isLoading: isLoadingSettings } =
    useUserThemeSettings();
  const { data: predefinedThemes, isLoading: isLoadingThemes } =
    usePredefinedThemes();
  const { data: effectiveSettings } = useEffectiveThemeSettings(
    currentOrg?.id,
    currentTeam?.id,
  );
  const updateMutation = useUpdateUserThemeSettings();

  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [lightTheme, setLightTheme] = useState("github-light");
  const [darkTheme, setDarkTheme] = useState("one-dark-pro");
  const [hasChanges, setHasChanges] = useState(false);

  const customizationAllowed = effectiveSettings?.customization_allowed ?? true;
  const customizationDisabledBy = effectiveSettings?.customization_disabled_by;

  useEffect(() => {
    if (userSettings) {
      setThemeMode(userSettings.theme_mode);
      setLightTheme(userSettings.light_theme);
      setDarkTheme(userSettings.dark_theme);
      setHasChanges(false);
    }
  }, [userSettings]);

  const handleSave = () => {
    const updates: UserThemeSettingsUpdate = {};

    if (themeMode !== userSettings?.theme_mode) {
      updates.theme_mode = themeMode;
    }
    if (lightTheme !== userSettings?.light_theme) {
      updates.light_theme = lightTheme;
    }
    if (darkTheme !== userSettings?.dark_theme) {
      updates.dark_theme = darkTheme;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates, {
        onSuccess: () => {
          setHasChanges(false);
        },
      });
    }
  };

  const handleReset = () => {
    if (userSettings) {
      setThemeMode(userSettings.theme_mode);
      setLightTheme(userSettings.light_theme);
      setDarkTheme(userSettings.dark_theme);
      setHasChanges(false);
    }
  };

  useEffect(() => {
    if (userSettings) {
      const changed =
        themeMode !== userSettings.theme_mode ||
        lightTheme !== userSettings.light_theme ||
        darkTheme !== userSettings.dark_theme;
      setHasChanges(changed);
    }
  }, [themeMode, lightTheme, darkTheme, userSettings]);

  if (isLoadingSettings || isLoadingThemes) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!predefinedThemes) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{t("theme_failed_load")}</AlertDescription>
      </Alert>
    );
  }

  // Filter themes by light/dark
  const lightThemes = Object.fromEntries(
    Object.entries(predefinedThemes).filter(([id]) =>
      [
        "github-light",
        "tokyo-day",
        "gruvbox-light",
        "catppuccin-latte",
        "ayu-light",
        "rose-pine-dawn",
        "github-light-high-contrast",
        "solarized-light",
        "everforest-light",
        "min-light",
        "notebook-light",
      ].includes(id),
    ),
  );

  const darkThemes = Object.fromEntries(
    Object.entries(predefinedThemes).filter(([id]) =>
      [
        "one-dark-pro",
        "dracula",
        "tokyo-night",
        "nord",
        "catppuccin-mocha",
        "rose-pine-moon",
        "material-ocean",
        "synthwave-84",
        "palenight",
        "shades-of-purple",
        "notebook-dark",
      ].includes(id),
    ),
  );

  return (
    <div className="space-y-6">
      {!customizationAllowed && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("theme_disabled_by_org_team", {
              level:
                customizationDisabledBy === "org" ? "organization" : "team",
            })}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_mode_label")}</CardTitle>
          <CardDescription>{t("theme_mode_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeModeSelector
            value={themeMode}
            onChange={setThemeMode}
            disabled={!customizationAllowed}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_light_theme")}</CardTitle>
          <CardDescription>{t("theme_light_theme_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeGrid
            themes={lightThemes}
            selectedTheme={lightTheme}
            onSelectTheme={setLightTheme}
            disabled={!customizationAllowed}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_dark_theme")}</CardTitle>
          <CardDescription>{t("theme_dark_theme_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeGrid
            themes={darkThemes}
            selectedTheme={darkTheme}
            onSelectTheme={setDarkTheme}
            disabled={!customizationAllowed}
          />
        </CardContent>
      </Card>

      {customizationAllowed && hasChanges && (
        <div className="flex justify-end gap-2 sticky bottom-4 bg-background/95 backdrop-blur p-4 border rounded-lg shadow-lg">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={updateMutation.isPending}
          >
            {t("com_reset")}
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("com_save_changes")}
          </Button>
        </div>
      )}

      {updateMutation.isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{t("theme_failed_save")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
