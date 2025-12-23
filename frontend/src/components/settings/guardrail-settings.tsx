/**
 * Guardrail Settings component for AI content filtering configuration.
 *
 * Provides UI for managing input/output keyword and regex filters,
 * PII detection, and testing guardrails.
 */

import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  X,
  Info,
  AlertTriangle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import {
  guardrailsApi,
  PII_TYPES,
  PII_TYPE_LABELS,
  type GuardrailAction,
  type PIIType,
  type OrganizationGuardrailsUpdate,
  type TeamGuardrailsUpdate,
  type UserGuardrailsUpdate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

/** Props shared across all levels */
interface GuardrailSettingsBaseProps {
  guardrailsEnabled: boolean;
  inputBlockedKeywords: string[];
  inputBlockedPatterns: string[];
  inputAction: GuardrailAction;
  outputBlockedKeywords: string[];
  outputBlockedPatterns: string[];
  outputAction: GuardrailAction;
  piiDetectionEnabled: boolean;
  piiTypes: PIIType[];
  piiAction: GuardrailAction;
  isLoading?: boolean;
  disabledBy?: "org" | "team" | null;
}

interface OrgGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "org";
  orgId: string;
  allowTeamOverride: boolean;
  allowUserOverride: boolean;
  onUpdate: (data: OrganizationGuardrailsUpdate) => void;
}

interface TeamGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "team";
  orgId: string;
  teamId: string;
  onUpdate: (data: TeamGuardrailsUpdate) => void;
}

interface UserGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "user";
  onUpdate: (data: UserGuardrailsUpdate) => void;
}

type GuardrailSettingsProps =
  | OrgGuardrailSettingsProps
  | TeamGuardrailSettingsProps
  | UserGuardrailSettingsProps;

const ACTION_OPTIONS: {
  value: GuardrailAction;
  label: string;
  description: string;
}[] = [
  {
    value: "block",
    label: "Block",
    description: "Reject the message entirely",
  },
  { value: "warn", label: "Warn", description: "Allow but log warning" },
  {
    value: "redact",
    label: "Redact",
    description: "Replace matched content with [REDACTED]",
  },
];

/** Tag input for keywords */
function KeywordInput({
  keywords,
  onChange,
  disabled,
  placeholder = "Add keyword...",
}: {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed && !keywords.includes(trimmed)) {
      onChange([...keywords, trimmed]);
      setInput("");
    }
  }, [input, keywords, onChange]);

  const handleRemove = useCallback(
    (keyword: string) => {
      onChange(keywords.filter((k) => k !== keyword));
    },
    [keywords, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={disabled || !input.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <Badge key={keyword} variant="secondary" className="gap-1 pr-1">
              {keyword}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(keyword)}
                  className="ml-0.5 hover:bg-muted rounded-sm p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pattern input for regex patterns */
function PatternInput({
  patterns,
  onChange,
  disabled,
  placeholder = "Add regex pattern...",
}: {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;

    // Validate regex
    try {
      new RegExp(trimmed);
      if (!patterns.includes(trimmed)) {
        onChange([...patterns, trimmed]);
        setInput("");
        setError(null);
      }
    } catch {
      setError("Invalid regex pattern");
    }
  }, [input, patterns, onChange]);

  const handleRemove = useCallback(
    (pattern: string) => {
      onChange(patterns.filter((p) => p !== pattern));
    },
    [patterns, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 font-mono text-sm",
            error && "border-destructive",
          )}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={disabled || !input.trim()}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((pattern) => (
            <Badge
              key={pattern}
              variant="outline"
              className="gap-1 pr-1 font-mono text-xs"
            >
              {pattern}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(pattern)}
                  className="ml-0.5 hover:bg-muted rounded-sm p-0.5"
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** PII type checkboxes */
function PIITypeSelector({
  selectedTypes,
  onChange,
  disabled,
}: {
  selectedTypes: PIIType[];
  onChange: (types: PIIType[]) => void;
  disabled?: boolean;
}) {
  const handleToggle = useCallback(
    (type: PIIType, checked: boolean) => {
      if (checked) {
        onChange([...selectedTypes, type]);
      } else {
        onChange(selectedTypes.filter((t) => t !== type));
      }
    },
    [selectedTypes, onChange],
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      {PII_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-2">
          <Checkbox
            id={`pii-${type}`}
            checked={selectedTypes.includes(type)}
            onCheckedChange={(checked) => handleToggle(type, checked === true)}
            disabled={disabled}
          />
          <Label
            htmlFor={`pii-${type}`}
            className={cn("text-sm", disabled && "text-muted-foreground")}
          >
            {PII_TYPE_LABELS[type]}
          </Label>
        </div>
      ))}
    </div>
  );
}

/** Test panel for testing guardrails */
function GuardrailTestPanel({
  orgId,
  teamId,
}: {
  orgId?: string;
  teamId?: string;
}) {
  const [content, setContent] = useState("");
  const [direction, setDirection] = useState<"input" | "output">("input");
  const [result, setResult] = useState<{
    passed: boolean;
    action: GuardrailAction | null;
    matches: { pattern: string; pattern_type: string; matched_text: string }[];
    redacted_content: string | null;
  } | null>(null);

  const testMutation = useMutation({
    mutationFn: () =>
      guardrailsApi.testGuardrails({ content, direction }, orgId, teamId),
    onSuccess: (data) => setResult(data),
  });

  const handleTest = () => {
    if (content.trim()) {
      testMutation.mutate();
    }
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FlaskConical className="size-4" />
        Test Guardrails
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter content to test..."
        className="min-h-[80px]"
      />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-sm">Direction:</Label>
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as "input" | "output")}
          >
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="input">Input</SelectItem>
              <SelectItem value="output">Output</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          onClick={handleTest}
          disabled={!content.trim() || testMutation.isPending}
        >
          {testMutation.isPending ? (
            <Loader2 className="size-4 animate-spin mr-1" />
          ) : null}
          Test
        </Button>
      </div>

      {result && (
        <div
          className={cn(
            "p-2 rounded text-sm",
            result.passed
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <div className="flex items-center gap-2 font-medium">
            {result.passed ? (
              <>
                <ShieldCheck className="size-4" />
                Passed
              </>
            ) : (
              <>
                <ShieldAlert className="size-4" />
                {result.action === "block"
                  ? "Blocked"
                  : result.action === "redact"
                    ? "Would be redacted"
                    : "Warning triggered"}
              </>
            )}
          </div>
          {result.matches.length > 0 && (
            <div className="mt-2 text-xs">
              <strong>Matches:</strong>
              <ul className="list-disc list-inside mt-1">
                {result.matches.map((m, i) => (
                  <li key={i}>
                    <code className="bg-background px-1 rounded">
                      {m.matched_text}
                    </code>{" "}
                    ({m.pattern_type}: {m.pattern})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.redacted_content && (
            <div className="mt-2 text-xs">
              <strong>Redacted:</strong>
              <pre className="mt-1 p-2 bg-background rounded overflow-auto">
                {result.redacted_content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
          checked={guardrailsEnabled}
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
