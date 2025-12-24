/**
 * Main guardrail settings component for AI content filtering configuration.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, AlertTriangle, Shield } from "lucide-react";

import type { GuardrailAction, OrganizationGuardrailsUpdate } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import {
  type GuardrailSettingsProps,
  type OrgGuardrailSettingsProps,
  type TeamGuardrailSettingsProps,
  ACTION_OPTIONS,
} from "./types";
import { KeywordInput } from "./KeywordInput";
import { PatternInput } from "./PatternInput";
import { PIITypeSelector } from "./PIITypeSelector";
import { GuardrailTestPanel } from "./GuardrailTestPanel";

export function GuardrailSettings(props: GuardrailSettingsProps) {
  const { t } = useTranslation();
  const {
    guardrailsEnabled,
    inputBlockedKeywords,
    inputBlockedPatterns,
    inputAction,
    outputBlockedKeywords,
    outputBlockedPatterns,
    outputAction,
    piiDetectionEnabled,
    piiTypes,
    piiAction,
    isLoading = false,
    disabledBy,
    onUpdate,
    level,
  } = props;

  const isDisabledByHigherLevel = !!disabledBy;
  const isDisabled = isDisabledByHigherLevel || isLoading;

  const [inputOpen, setInputOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [piiOpen, setPiiOpen] = useState(true);

  const getTooltipMessage = (): string | null => {
    if (disabledBy === "org") return t("guardrails_disabled_by_org");
    if (disabledBy === "team") return t("guardrails_disabled_by_team");
    return null;
  };

  const tooltipMessage = getTooltipMessage();

  // Type-safe update handler
  const handleUpdate = (data: Partial<OrganizationGuardrailsUpdate>) => {
    onUpdate(data as Parameters<typeof onUpdate>[0]);
  };

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between py-2">
        <div className="space-y-0.5 pr-4">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="guardrails-enabled"
              className={cn(isDisabledByHigherLevel && "text-muted-foreground")}
            >
              {t("guardrails_enabled")}
            </Label>
            {isDisabledByHigherLevel && tooltipMessage && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{tooltipMessage}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("guardrails_enable_desc")}
          </p>
        </div>
        <Switch
          id="guardrails-enabled"
          checked={isDisabledByHigherLevel ? false : guardrailsEnabled}
          onCheckedChange={(enabled) =>
            handleUpdate({ guardrails_enabled: enabled })
          }
          disabled={isDisabled}
        />
      </div>

      {/* Org-level override controls */}
      {level === "org" && (
        <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
          <div className="text-sm font-medium">
            {t("guardrails_override_settings")}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="allow-team-override" className="text-sm">
                {t("guardrails_allow_team_override")}
              </Label>
              <Switch
                id="allow-team-override"
                checked={(props as OrgGuardrailSettingsProps).allowTeamOverride}
                onCheckedChange={(v) =>
                  handleUpdate({ allow_team_override: v })
                }
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="allow-user-override" className="text-sm">
                {t("guardrails_allow_user_override")}
              </Label>
              <Switch
                id="allow-user-override"
                checked={(props as OrgGuardrailSettingsProps).allowUserOverride}
                onCheckedChange={(v) =>
                  handleUpdate({ allow_user_override: v })
                }
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
      )}

      {/* Input guardrails */}
      <Collapsible open={inputOpen} onOpenChange={setInputOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-foreground/80">
          <Shield className="size-4" />
          {t("guardrails_input")}
          <Badge variant="secondary" className="ml-auto text-xs">
            {inputBlockedKeywords.length + inputBlockedPatterns.length}{" "}
            {t("guardrails_rules")}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Label className="text-sm w-32">
              {t("guardrails_action_on_match")}
            </Label>
            <Select
              value={inputAction}
              onValueChange={(v) =>
                handleUpdate({ input_action: v as GuardrailAction })
              }
              disabled={isDisabled || !guardrailsEnabled}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(
                      opt.labelKey as
                        | "guardrails_action_block"
                        | "guardrails_action_warn"
                        | "guardrails_action_redact",
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">
              {t("guardrails_blocked_keywords")}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("guardrails_blocked_keywords_desc")}
            </p>
            <KeywordInput
              keywords={inputBlockedKeywords}
              onChange={(kw) => handleUpdate({ input_blocked_keywords: kw })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
          <div>
            <Label className="text-sm">
              {t("guardrails_blocked_patterns")}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("guardrails_blocked_patterns_input_desc")}
            </p>
            <PatternInput
              patterns={inputBlockedPatterns}
              onChange={(p) => handleUpdate({ input_blocked_patterns: p })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* Output guardrails */}
      <Collapsible open={outputOpen} onOpenChange={setOutputOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-foreground/80">
          <Shield className="size-4" />
          {t("guardrails_output")}
          <Badge variant="secondary" className="ml-auto text-xs">
            {outputBlockedKeywords.length + outputBlockedPatterns.length}{" "}
            {t("guardrails_rules")}
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Label className="text-sm w-32">
              {t("guardrails_action_on_match")}
            </Label>
            <Select
              value={outputAction}
              onValueChange={(v) =>
                handleUpdate({ output_action: v as GuardrailAction })
              }
              disabled={isDisabled || !guardrailsEnabled}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(
                      opt.labelKey as
                        | "guardrails_action_block"
                        | "guardrails_action_warn"
                        | "guardrails_action_redact",
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">
              {t("guardrails_blocked_keywords")}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("guardrails_blocked_keywords_desc")}
            </p>
            <KeywordInput
              keywords={outputBlockedKeywords}
              onChange={(kw) => handleUpdate({ output_blocked_keywords: kw })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
          <div>
            <Label className="text-sm">
              {t("guardrails_blocked_patterns")}
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              {t("guardrails_blocked_patterns_output_desc")}
            </p>
            <PatternInput
              patterns={outputBlockedPatterns}
              onChange={(p) => handleUpdate({ output_blocked_patterns: p })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* PII Detection */}
      <Collapsible open={piiOpen} onOpenChange={setPiiOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm font-medium hover:text-foreground/80">
          <AlertTriangle className="size-4" />
          {t("guardrails_pii")}
          {piiDetectionEnabled && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {piiTypes.length} {t("guardrails_pii_types")}
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="pii-enabled" className="text-sm">
                {t("guardrails_pii_enable")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("guardrails_pii_desc")}
              </p>
            </div>
            <Switch
              id="pii-enabled"
              checked={piiDetectionEnabled}
              onCheckedChange={(v) =>
                handleUpdate({ pii_detection_enabled: v })
              }
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
          {piiDetectionEnabled && (
            <>
              <div className="flex items-center gap-3">
                <Label className="text-sm w-32">
                  {t("guardrails_action_on_match")}
                </Label>
                <Select
                  value={piiAction}
                  onValueChange={(v) =>
                    handleUpdate({ pii_action: v as GuardrailAction })
                  }
                  disabled={isDisabled || !guardrailsEnabled}
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(
                          opt.labelKey as
                            | "guardrails_action_block"
                            | "guardrails_action_warn"
                            | "guardrails_action_redact",
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-2 block">
                  {t("guardrails_detect")}
                </Label>
                <PIITypeSelector
                  selectedTypes={piiTypes}
                  onChange={(types) => handleUpdate({ pii_types: types })}
                  disabled={isDisabled || !guardrailsEnabled}
                />
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Test panel */}
      {guardrailsEnabled && (
        <>
          <div className="border-t" />
          <GuardrailTestPanel
            orgId={
              level === "org"
                ? (props as OrgGuardrailSettingsProps).orgId
                : level === "team"
                  ? (props as TeamGuardrailSettingsProps).orgId
                  : undefined
            }
            teamId={
              level === "team"
                ? (props as TeamGuardrailSettingsProps).teamId
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
