import { useTranslation } from "react-i18next";
import { Globe, Loader2 } from "lucide-react";
import { supportedLanguages } from "@/locales/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/lib/auth";

export function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const updateLanguageMutation = useMutation({
    mutationFn: (language: string) => authApi.updateLanguage({ language }),
    onSuccess: () => {
      // Invalidate user query to refresh user data
      queryClient.invalidateQueries({ queryKey: authKeys.user });
    },
    onError: (error) => {
      // Log error - the frontend language is already updated optimistically
      console.error(
        "Failed to sync language to backend:",
        error instanceof Error ? error.message : t("error_update_language"),
      );
    },
  });

  const handleLanguageChange = (languageCode: string) => {
    // Update frontend immediately for responsive UX
    i18n.changeLanguage(languageCode);
    // Sync to backend
    updateLanguageMutation.mutate(languageCode);
  };

  const currentLanguage = supportedLanguages.find(
    (lang) => lang.code === i18n.language,
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("language_title")}</h3>
        <p className="text-sm text-muted-foreground">{t("language_desc")}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="language-select" className="flex items-center gap-2">
            <Globe className="size-4" />
            {t("language_select")}
            {updateLanguageMutation.isPending && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </Label>
          <Select
            value={i18n.language}
            onValueChange={handleLanguageChange}
            disabled={updateLanguageMutation.isPending}
          >
            <SelectTrigger id="language-select" className="w-full max-w-xs">
              <SelectValue>
                {currentLanguage?.nativeName ||
                  currentLanguage?.name ||
                  i18n.language}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span>{lang.nativeName}</span>
                    {lang.nativeName !== lang.name && (
                      <span className="text-muted-foreground">
                        ({lang.name})
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
