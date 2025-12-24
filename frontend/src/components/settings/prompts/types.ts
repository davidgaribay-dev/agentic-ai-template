import { promptsApi, type PromptCreate, type PromptUpdate } from "@/lib/api";

export type PromptScope =
  | { type: "user" }
  | { type: "org"; orgId: string }
  | { type: "team"; orgId: string; teamId: string };

export function getQueryKey(scope: PromptScope): string[] {
  switch (scope.type) {
    case "user":
      return ["user-prompts"];
    case "org":
      return ["org-prompts", scope.orgId];
    case "team":
      return ["team-prompts", scope.orgId, scope.teamId];
  }
}

export function activatePrompt(scope: PromptScope, promptId: string) {
  switch (scope.type) {
    case "user":
      return promptsApi.activateUserPrompt(promptId);
    case "org":
      return promptsApi.activateOrgPrompt(scope.orgId, promptId);
    case "team":
      return promptsApi.activateTeamPrompt(scope.orgId, scope.teamId, promptId);
  }
}

export function createPromptApi(scope: PromptScope, data: PromptCreate) {
  switch (scope.type) {
    case "user":
      return promptsApi.createUserPrompt(data);
    case "org":
      return promptsApi.createOrgPrompt(scope.orgId, data);
    case "team":
      return promptsApi.createTeamPrompt(scope.orgId, scope.teamId, data);
  }
}

export function updatePromptApi(
  scope: PromptScope,
  promptId: string,
  data: PromptUpdate,
) {
  switch (scope.type) {
    case "user":
      return promptsApi.updateUserPrompt(promptId, data);
    case "org":
      return promptsApi.updateOrgPrompt(scope.orgId, promptId, data);
    case "team":
      return promptsApi.updateTeamPrompt(
        scope.orgId,
        scope.teamId,
        promptId,
        data,
      );
  }
}

export function deletePromptApi(scope: PromptScope, promptId: string) {
  switch (scope.type) {
    case "user":
      return promptsApi.deleteUserPrompt(promptId);
    case "org":
      return promptsApi.deleteOrgPrompt(scope.orgId, promptId);
    case "team":
      return promptsApi.deleteTeamPrompt(scope.orgId, scope.teamId, promptId);
  }
}
