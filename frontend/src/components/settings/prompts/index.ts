/**
 * Prompts components module.
 *
 * This module provides components for managing prompts at different scopes
 * (user, organization, team).
 */

export { type PromptScope, getQueryKey } from "./types";
export { PromptRow } from "./PromptRow";
export { CreatePromptDialog } from "./CreatePromptDialog";
export { EditPromptDialog } from "./EditPromptDialog";
export { DeletePromptButton } from "./DeletePromptButton";
