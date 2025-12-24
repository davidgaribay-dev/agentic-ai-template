/**
 * Shared types and constants for guardrails components.
 */

import type {
  GuardrailAction,
  PIIType,
  OrganizationGuardrailsUpdate,
  TeamGuardrailsUpdate,
  UserGuardrailsUpdate,
} from "@/lib/api";

/** Props shared across all levels */
export interface GuardrailSettingsBaseProps {
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

export interface OrgGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "org";
  orgId: string;
  allowTeamOverride: boolean;
  allowUserOverride: boolean;
  onUpdate: (data: OrganizationGuardrailsUpdate) => void;
}

export interface TeamGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "team";
  orgId: string;
  teamId: string;
  onUpdate: (data: TeamGuardrailsUpdate) => void;
}

export interface UserGuardrailSettingsProps extends GuardrailSettingsBaseProps {
  level: "user";
  onUpdate: (data: UserGuardrailsUpdate) => void;
}

export type GuardrailSettingsProps =
  | OrgGuardrailSettingsProps
  | TeamGuardrailSettingsProps
  | UserGuardrailSettingsProps;

export const ACTION_OPTIONS: {
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
