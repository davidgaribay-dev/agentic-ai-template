/**
 * API module barrel export.
 *
 * This file provides backwards compatibility by re-exporting all API modules.
 * Import from "@/lib/api" or "@/lib/api/{module}" for specific modules.
 *
 * Structure:
 * - client.ts: Core API client, error handling, auth helpers
 * - types/: Shared types across modules
 * - auth.ts: Authentication and user profile
 * - agent.ts: Chat streaming and AI agent
 * - organizations.ts: Organization management
 * - teams.ts: Team management
 * - invitations.ts: Invitation management
 * - conversations.ts: Chat conversation management
 * - prompts.ts: System and template prompts
 * - chat-settings.ts: Feature visibility settings
 * - memory.ts: User memory management
 * - mcp-servers.ts: MCP server management
 * - api-keys.ts: LLM API key management
 * - items.ts: Demo/test items CRUD
 */

// Core client and error handling
export {
  API_BASE,
  ApiError,
  getApiErrorMessage,
  getApiErrorDetail,
  api,
  apiClient,
  getAuthHeader,
  type ApiErrorBody,
} from "./client"

// Shared types
export * from "./types"

// Auth module
export {
  authApi,
  type User,
  type UsersPublic,
  type Token,
  type UpdatePassword,
  type NewPassword,
  type UserUpdateMe,
} from "./auth"

// Items module
export {
  itemsApi,
  type Item,
  type ItemsPublic,
  type ItemCreate,
  type ItemUpdate,
} from "./items"

// Conversations module
export {
  conversationsApi,
  type Conversation,
  type ConversationsPublic,
  type ConversationCreate,
  type ConversationUpdate,
} from "./conversations"

// Agent module
export {
  agentApi,
  type ChatRequest,
  type ChatResponse,
  type HealthResponse,
  type ChatMessage,
  type StreamTokenEvent,
  type StreamTitleEvent,
  type StreamDoneEvent,
  type StreamErrorEvent,
  type StreamToolApprovalEvent,
  type StreamSourcesEvent,
  type StreamEvent,
  type ToolApprovalRequest,
  type ToolApprovalInfo,
  type MessageSource,
} from "./agent"

// Organizations module
export {
  organizationsApi,
  type Organization,
  type OrganizationsPublic,
  type OrganizationCreate,
  type OrganizationUpdate,
  type OrganizationMember,
  type OrganizationMembersPublic,
} from "./organizations"

// Teams module
export {
  teamsApi,
  type Team,
  type TeamsPublic,
  type TeamCreate,
  type TeamUpdate,
  type TeamMember,
  type TeamMembersPublic,
} from "./teams"

// Invitations module
export {
  invitationsApi,
  type Invitation,
  type InvitationsPublic,
  type InvitationCreate,
  type InvitationInfo,
  type InvitationCreatedResponse,
} from "./invitations"

// API Keys module
export {
  apiKeysApi,
  type LLMProvider,
  type APIKeyStatus,
  type APIKeyCreate,
  type APIKeyDeleteResponse,
  type DefaultProviderResponse,
  type DefaultProviderUpdate,
} from "./api-keys"

// Prompts module
export {
  promptsApi,
  type PromptType,
  type Prompt,
  type PromptsPublic,
  type PromptCreate,
  type PromptUpdate,
  type PromptsAvailable,
  type ActiveSystemPrompt,
} from "./prompts"

// Chat Settings module
export {
  chatSettingsApi,
  type ChatSettings,
  type OrganizationChatSettings,
  type TeamChatSettings,
  type UserChatSettings,
  type ChatSettingsUpdate,
  type OrgSettingsUpdate,
  type TeamSettingsUpdate,
  type DisabledByLevel,
  type EffectiveChatSettings,
} from "./chat-settings"

// Memory module
export {
  memoryApi,
  type MemoryType,
  type Memory,
  type MemoriesListResponse,
  type DeleteMemoryResponse,
  type ClearMemoriesResponse,
} from "./memory"

// MCP Servers module
export {
  mcpServersApi,
  type MCPTransport,
  type MCPAuthType,
  type MCPServer,
  type MCPServersPublic,
  type MCPServerCreate,
  type MCPServerUpdate,
  type MCPTool,
  type MCPTestResult,
  type MCPServerWithTools,
  type MCPToolsList,
  type ToolConfigUpdate,
} from "./mcp-servers"

// Theme Settings module
export {
  themeSettingsApi,
  type ThemeColors,
  type ThemeMode,
  type ThemeSettingsBase,
  type OrganizationThemeSettings,
  type TeamThemeSettings,
  type UserThemeSettings,
  type OrganizationThemeSettingsUpdate,
  type TeamThemeSettingsUpdate,
  type UserThemeSettingsUpdate,
  type EffectiveThemeSettings,
} from "./theme-settings"

// RAG Settings module
export {
  ragSettingsApi,
  type RAGSettingsBase,
  type OrganizationRAGSettings,
  type TeamRAGSettings,
  type UserRAGSettings,
  type OrganizationRAGSettingsUpdate,
  type TeamRAGSettingsUpdate,
  type UserRAGSettingsUpdate,
  type EffectiveRAGSettings,
} from "./rag-settings"

// Documents module
export {
  documentsApi,
  type Document,
  type DocumentChunk,
  type DocumentContent,
  type PaginatedDocuments,
  type UploadDocumentParams,
  type ListDocumentsParams,
  type SearchResult,
  type DocumentScope,
  type ProcessingStatus,
} from "./documents"
