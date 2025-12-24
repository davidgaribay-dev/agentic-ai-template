/**
 * Main guardrail settings component for AI content filtering configuration.
 */

import { useState } from "react";
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
    if (disabledBy === "org") return "Disabled by organization settings";
    if (disabledBy === "team") return "Disabled by team settings";
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
              Guardrails Enabled
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
            Enable AI content filtering for input and output messages
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
          <div className="text-sm font-medium">Override Settings</div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="allow-team-override" className="text-sm">
                Allow team override
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
                Allow user override
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
          Input Guardrails
          <Badge variant="secondary" className="ml-auto text-xs">
            {inputBlockedKeywords.length + inputBlockedPatterns.length} rules
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Label className="text-sm w-32">Action on match:</Label>
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
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Blocked Keywords</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Case-insensitive exact word matches
            </p>
            <KeywordInput
              keywords={inputBlockedKeywords}
              onChange={(kw) => handleUpdate({ input_blocked_keywords: kw })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
          <div>
            <Label className="text-sm">Blocked Patterns (Regex)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Regular expressions to match against input
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
          Output Guardrails
          <Badge variant="secondary" className="ml-auto text-xs">
            {outputBlockedKeywords.length + outputBlockedPatterns.length} rules
          </Badge>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <Label className="text-sm w-32">Action on match:</Label>
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
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">Blocked Keywords</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Case-insensitive exact word matches
            </p>
            <KeywordInput
              keywords={outputBlockedKeywords}
              onChange={(kw) => handleUpdate({ output_blocked_keywords: kw })}
              disabled={isDisabled || !guardrailsEnabled}
            />
          </div>
          <div>
            <Label className="text-sm">Blocked Patterns (Regex)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Regular expressions to match against output
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
          PII Detection
          {piiDetectionEnabled && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {piiTypes.length} types
            </Badge>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="pii-enabled" className="text-sm">
                Enable PII Detection
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically detect personal identifiable information
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
                <Label className="text-sm w-32">Action on match:</Label>
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
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-2 block">Detect:</Label>
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
