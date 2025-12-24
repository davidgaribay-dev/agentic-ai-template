import * as React from "react";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Building2,
  Users,
  User,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { promptsApi, type Prompt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface PromptPickerProps {
  organizationId?: string;
  teamId?: string;
  onSelect: (content: string) => void;
  disabled?: boolean;
}

export function PromptPicker({
  organizationId,
  teamId,
  onSelect,
  disabled = false,
}: PromptPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Fetch available prompts when we have org/team context
  const { data: availablePrompts, isLoading: isLoadingAvailable } = useQuery({
    queryKey: ["available-prompts", organizationId, teamId],
    queryFn: () =>
      promptsApi.getAvailablePrompts(organizationId!, teamId!, "template"),
    enabled: open && !!organizationId && !!teamId,
  });

  // Fetch user prompts (always available)
  const { data: userPrompts, isLoading: isLoadingUser } = useQuery({
    queryKey: ["user-prompts-templates"],
    queryFn: () => promptsApi.listUserPrompts("template"),
    enabled: open,
  });

  const isLoading = isLoadingAvailable || isLoadingUser;

  // Combine prompts into groups
  const promptGroups = useMemo(() => {
    const groups: Array<{
      label: string;
      icon: React.ReactNode;
      prompts: Prompt[];
    }> = [];

    // Add org prompts if available
    if (availablePrompts?.org_prompts?.length) {
      groups.push({
        label: t("com_organization"),
        icon: <Building2 className="h-4 w-4" />,
        prompts: availablePrompts.org_prompts,
      });
    }

    // Add team prompts if available
    if (availablePrompts?.team_prompts?.length) {
      groups.push({
        label: t("com_team"),
        icon: <Users className="h-4 w-4" />,
        prompts: availablePrompts.team_prompts,
      });
    }

    // Add user prompts (from the separate user prompts query or from availablePrompts)
    const personalPrompts =
      availablePrompts?.user_prompts ?? userPrompts?.data ?? [];
    if (personalPrompts.length) {
      groups.push({
        label: t("prompts_personal_info"),
        icon: <User className="h-4 w-4" />,
        prompts: personalPrompts,
      });
    }

    return groups;
  }, [availablePrompts, userPrompts, t]);

  // Filter prompts based on search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return promptGroups;

    const searchLower = search.toLowerCase();
    return promptGroups
      .map((group) => ({
        ...group,
        prompts: group.prompts.filter(
          (p) =>
            p.name.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower),
        ),
      }))
      .filter((group) => group.prompts.length > 0);
  }, [promptGroups, search]);

  const totalPrompts = promptGroups.reduce(
    (acc, g) => acc + g.prompts.length,
    0,
  );

  const handleSelect = (prompt: Prompt) => {
    onSelect(prompt.content);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="h-8 w-8 rounded-md hover:bg-muted transition-colors"
          aria-label={t("aria_insert_template")}
        >
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[500px] max-w-[calc(100vw-2rem)] p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Header */}
          <div className="border-b px-3 py-2">
            <h4 className="text-sm font-medium">
              {t("prompts_insert_template")}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t("prompts_choose_template")}
            </p>
          </div>

          {/* Search */}
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("prompts_search_templates")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[300px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : totalPrompts === 0 ? (
              <div className="py-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {t("prompts_no_templates_available")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("prompts_create_in_settings")}
                </p>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("tools_no_match", { search })}
                </p>
              </div>
            ) : (
              <div className="p-1">
                {filteredGroups.map((group, groupIndex) => (
                  <div key={group.label}>
                    {groupIndex > 0 && <div className="my-1 border-t" />}
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <span className="text-muted-foreground">
                        {group.icon}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        onClick={() => handleSelect(prompt)}
                        className={cn(
                          "w-full rounded-md px-2 py-2 text-left",
                          "hover:bg-accent focus:bg-accent focus:outline-none",
                          "transition-colors",
                        )}
                      >
                        <p className="text-sm font-medium">{prompt.name}</p>
                        {prompt.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {prompt.description}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
