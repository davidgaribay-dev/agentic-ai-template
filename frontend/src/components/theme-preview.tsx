import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import type { ThemeColors } from "@/lib/api";

interface ThemePreviewProps {
  themeId: string;
  themeName: string;
  colors: ThemeColors;
  isSelected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

export function ThemePreview({
  themeId: _themeId,
  themeName,
  colors,
  isSelected,
  onSelect,
  disabled = false,
}: ThemePreviewProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="relative group w-full text-left"
      type="button"
    >
      <Card
        className={`transition-all ${
          isSelected
            ? "ring-2 ring-primary shadow-md"
            : "hover:shadow-lg hover:scale-[1.02]"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">{themeName}</h3>
            {isSelected && (
              <div className="bg-primary text-primary-foreground rounded-full p-1">
                <Check className="h-3 w-3" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div
              className="h-16 rounded-md border flex items-center justify-center text-xs font-medium"
              style={{
                backgroundColor: colors.background,
                color: colors.foreground,
                borderColor: colors.border,
              }}
            >
              <div
                className="px-3 py-1.5 rounded"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.primary_foreground,
                }}
              >
                {t("theme_preview_primary")}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1">
              <div
                className="h-6 rounded border"
                style={{
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                }}
                title={t("theme_preview_secondary")}
              />
              <div
                className="h-6 rounded border"
                style={{
                  backgroundColor: colors.accent,
                  borderColor: colors.border,
                }}
                title={t("theme_preview_accent")}
              />
              <div
                className="h-6 rounded border"
                style={{
                  backgroundColor: colors.muted,
                  borderColor: colors.border,
                }}
                title={t("theme_preview_muted")}
              />
              <div
                className="h-6 rounded border"
                style={{
                  backgroundColor: colors.destructive,
                  borderColor: colors.border,
                }}
                title={t("theme_preview_destructive")}
              />
              <div
                className="h-6 rounded border"
                style={{
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
                title={t("theme_preview_card")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

interface ThemeModeSelectorProps {
  value: "light" | "dark" | "system";
  onChange: (mode: "light" | "dark" | "system") => void;
  disabled?: boolean;
}

export function ThemeModeSelector({
  value,
  onChange,
  disabled = false,
}: ThemeModeSelectorProps) {
  const { t } = useTranslation();

  const themeModeOptions = [
    {
      value: "light" as const,
      label: t("theme_mode_light"),
      description: t("theme_mode_light_desc"),
    },
    {
      value: "dark" as const,
      label: t("theme_mode_dark"),
      description: t("theme_mode_dark_desc"),
    },
    {
      value: "system" as const,
      label: t("theme_mode_system"),
      description: t("theme_mode_system_desc"),
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {themeModeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={`p-4 border rounded-lg text-center transition-all ${
            value === option.value
              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
              : "border-border hover:border-primary/50 hover:bg-accent"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="font-medium text-sm mb-1">{option.label}</div>
          <div className="text-xs text-muted-foreground">
            {option.description}
          </div>
        </button>
      ))}
    </div>
  );
}

interface ThemeGridProps {
  themes: Record<string, ThemeColors>;
  selectedTheme: string;
  onSelectTheme: (themeId: string) => void;
  disabled?: boolean;
  title?: string;
}

export function ThemeGrid({
  themes,
  selectedTheme,
  onSelectTheme,
  disabled = false,
  title,
}: ThemeGridProps) {
  const formatThemeName = (id: string) => {
    return id
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div>
      {title && <h3 className="font-medium text-sm mb-3">{title}</h3>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(themes).map(([themeId, colors]) => (
          <ThemePreview
            key={themeId}
            themeId={themeId}
            themeName={formatThemeName(themeId)}
            colors={colors}
            isSelected={selectedTheme === themeId}
            onSelect={() => onSelectTheme(themeId)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
