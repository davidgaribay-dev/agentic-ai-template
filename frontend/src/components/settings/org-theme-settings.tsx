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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import { ThemeModeSelector, ThemeGrid } from "@/components/theme-preview";
import {
  useOrgThemeSettings,
  useUpdateOrgThemeSettings,
  usePredefinedThemes,
} from "@/lib/queries";
import type { OrganizationThemeSettingsUpdate } from "@/lib/api";

interface OrgThemeSettingsProps {
  orgId: string;
}

export function OrgThemeSettings({ orgId }: OrgThemeSettingsProps) {
  const { t } = useTranslation();
  const { data: orgSettings, isLoading: isLoadingSettings } =
    useOrgThemeSettings(orgId);
  const { data: predefinedThemes, isLoading: isLoadingThemes } =
    usePredefinedThemes();
  const updateMutation = useUpdateOrgThemeSettings(orgId);

  const [themeCustomizationEnabled, setThemeCustomizationEnabled] =
    useState(true);
  const [allowTeamCustomization, setAllowTeamCustomization] = useState(true);
  const [allowUserCustomization, setAllowUserCustomization] = useState(true);
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [lightTheme, setLightTheme] = useState("github-light");
  const [darkTheme, setDarkTheme] = useState("one-dark-pro");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (orgSettings) {
      setThemeCustomizationEnabled(orgSettings.theme_customization_enabled);
      setAllowTeamCustomization(orgSettings.allow_team_customization);
      setAllowUserCustomization(orgSettings.allow_user_customization);
      setThemeMode(orgSettings.default_theme_mode);
      setLightTheme(orgSettings.default_light_theme);
      setDarkTheme(orgSettings.default_dark_theme);
      setHasChanges(false);
    }
  }, [orgSettings]);

  const handleSave = () => {
    const updates: OrganizationThemeSettingsUpdate = {};

    if (
      themeCustomizationEnabled !== orgSettings?.theme_customization_enabled
    ) {
      updates.theme_customization_enabled = themeCustomizationEnabled;
    }
    if (allowTeamCustomization !== orgSettings?.allow_team_customization) {
      updates.allow_team_customization = allowTeamCustomization;
    }
    if (allowUserCustomization !== orgSettings?.allow_user_customization) {
      updates.allow_user_customization = allowUserCustomization;
    }
    if (themeMode !== orgSettings?.default_theme_mode) {
      updates.default_theme_mode = themeMode;
    }
    if (lightTheme !== orgSettings?.default_light_theme) {
      updates.default_light_theme = lightTheme;
    }
    if (darkTheme !== orgSettings?.default_dark_theme) {
      updates.default_dark_theme = darkTheme;
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
    if (orgSettings) {
      setThemeCustomizationEnabled(orgSettings.theme_customization_enabled);
      setAllowTeamCustomization(orgSettings.allow_team_customization);
      setAllowUserCustomization(orgSettings.allow_user_customization);
      setThemeMode(orgSettings.default_theme_mode);
      setLightTheme(orgSettings.default_light_theme);
      setDarkTheme(orgSettings.default_dark_theme);
      setHasChanges(false);
    }
  };

  useEffect(() => {
    if (orgSettings) {
      const changed =
        themeCustomizationEnabled !== orgSettings.theme_customization_enabled ||
        allowTeamCustomization !== orgSettings.allow_team_customization ||
        allowUserCustomization !== orgSettings.allow_user_customization ||
        themeMode !== orgSettings.default_theme_mode ||
        lightTheme !== orgSettings.default_light_theme ||
        darkTheme !== orgSettings.default_dark_theme;
      setHasChanges(changed);
    }
  }, [
    themeCustomizationEnabled,
    allowTeamCustomization,
    allowUserCustomization,
    themeMode,
    lightTheme,
    darkTheme,
    orgSettings,
  ]);

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
      <Card>
        <CardHeader>
          <CardTitle>{t("theme_customization")}</CardTitle>
          <CardDescription>{t("theme_control_teams_users")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="theme-customization">
                {t("theme_enable_customization")}
              </Label>
              <div className="text-sm text-muted-foreground">
                {t("theme_allow_customization_desc")}
              </div>
            </div>
            <Switch
              id="theme-customization"
              checked={themeCustomizationEnabled}
              onCheckedChange={setThemeCustomizationEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="team-customization">
                {t("theme_allow_team")}
              </Label>
              <div className="text-sm text-muted-foreground">
                {t("theme_allow_team_desc")}
              </div>
            </div>
            <Switch
              id="team-customization"
              checked={allowTeamCustomization}
              onCheckedChange={setAllowTeamCustomization}
              disabled={!themeCustomizationEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="user-customization">
                {t("theme_allow_user")}
              </Label>
              <div className="text-sm text-muted-foreground">
                {t("theme_allow_user_desc")}
              </div>
            </div>
            <Switch
              id="user-customization"
              checked={allowUserCustomization}
              onCheckedChange={setAllowUserCustomization}
              disabled={!themeCustomizationEnabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_default_mode")}</CardTitle>
          <CardDescription>{t("theme_org_default_mode_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeModeSelector value={themeMode} onChange={setThemeMode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_default_light")}</CardTitle>
          <CardDescription>{t("theme_org_light_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeGrid
            themes={lightThemes}
            selectedTheme={lightTheme}
            onSelectTheme={setLightTheme}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("theme_default_dark")}</CardTitle>
          <CardDescription>{t("theme_org_dark_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeGrid
            themes={darkThemes}
            selectedTheme={darkTheme}
            onSelectTheme={setDarkTheme}
          />
        </CardContent>
      </Card>

      {hasChanges && (
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
