/**
 * Agent API module.
 *
 * Handles chat streaming, agent health, and tool approval operations.
 */

import { apiClient, getAuthHeader, API_BASE, ApiError } from "./client";

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  organization_id?: string;
  team_id?: string;
  stream?: boolean;
  /** Media IDs to attach to the message */
  media_ids?: string[];
}

export interface ChatResponse {
  message: string;
  conversation_id: string;
}

export interface HealthResponse {
  status: string;
  llm_configured: boolean;
}

/** Media info for multimodal messages */
export interface MessageMediaInfo {
  id: string;
  filename: string;
  mime_type: string;
  type: string;
}

/**
 * API response type for chat messages.
 * Does not include client-side fields like `id` or `isStreaming`.
 * Use `apiMessageToChatMessage()` to convert to UI-ready format.
 */
export interface APIChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[] | null;
  media?: MessageMediaInfo[] | null;
  /** Whether this message was blocked by guardrails */
  guardrail_blocked?: boolean;
}

/** @deprecated Use APIChatMessage for API responses */
export type ChatMessage = APIChatMessage;

/** SSE Stream Event Types - Discriminated Union for type-safe event handling */
export type StreamTokenEvent = {
  type: "token";
  data: string;
};

export type StreamTitleEvent = {
  type: "title";
  data: {
    title: string;
    conversation_id: string;
  };
};

export type StreamDoneEvent = {
  type: "done";
  data: {
    conversation_id: string;
  };
};

export type StreamErrorEvent = {
  type: "error";
  data: string;
};

export type StreamToolApprovalEvent = {
  type: "tool_approval";
  data: {
    conversation_id: string;
    tool_name: string;
    tool_args: Record<string, unknown>;
    tool_call_id: string | null;
    tool_description: string;
  };
};

export type MessageSource = {
  content: string;
  source: string;
  file_type: string;
  metadata: Record<string, unknown> | null;
  relevance_score: number;
  chunk_index: number;
  document_id: string;
};

export type StreamSourcesEvent = {
  type: "sources";
  data: {
    conversation_id: string;
    sources: MessageSource[];
  };
};

export type StreamGuardrailBlockEvent = {
  type: "guardrail_block";
  data: {
    message: string;
    conversation_id: string;
  };
};

/** Union of all possible stream events */
export type StreamEvent =
  | StreamTokenEvent
  | StreamTitleEvent
  | StreamDoneEvent
  | StreamErrorEvent
  | StreamToolApprovalEvent
  | StreamSourcesEvent
  | StreamGuardrailBlockEvent;

export interface ToolApprovalRequest {
  conversation_id: string;
  organization_id: string;
  team_id?: string | null;
  approved: boolean;
  stream?: boolean;
}

export interface ToolApprovalInfo {
  conversation_id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  tool_call_id: string | null;
  tool_description: string;
}

export const agentApi = {
  /** Check agent health status */
  health: () => apiClient.get<HealthResponse>("/v1/agent/health"),

  /** Send a chat message (non-streaming) */
  chat: (request: ChatRequest) =>
    apiClient.post<ChatResponse>(
      "/v1/agent/chat",
      { ...request, stream: false },
      {
        headers: getAuthHeader(),
      },
    ),

  /** Get conversation history */
  getHistory: (conversationId: string) =>
    apiClient.get<ChatMessage[]>(
      `/v1/agent/conversations/${conversationId}/history`,
      {
        headers: getAuthHeader(),
      },
    ),

  /** Update conversation title */
  updateTitle: (conversationId: string, title: string) =>
    apiClient.patch<{ success: boolean; title: string }>(
      `/v1/agent/conversations/${conversationId}/title?title=${encodeURIComponent(title)}`,
      {},
      { headers: getAuthHeader() },
    ),

  /**
   * Stream a chat response using Server-Sent Events.
   * Returns an async generator that yields typed stream events.
   */
  chatStream: async function* (
    request: Omit<ChatRequest, "stream">,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/v1/agent/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);

              if (currentEvent === "title" && parsed.title) {
                yield {
                  type: "title",
                  data: {
                    title: parsed.title,
                    conversation_id: parsed.conversation_id,
                  },
                } satisfies StreamTitleEvent;
              } else if (currentEvent === "error" || parsed.error) {
                yield {
                  type: "error",
                  data: String(
                    parsed.error || parsed.message || "Unknown error",
                  ),
                } satisfies StreamErrorEvent;
              } else if (currentEvent === "done") {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id },
                } satisfies StreamDoneEvent;
              } else if (currentEvent === "tool_approval") {
                yield {
                  type: "tool_approval",
                  data: {
                    conversation_id: parsed.conversation_id,
                    tool_name: parsed.tool_name,
                    tool_args: parsed.tool_args || {},
                    tool_call_id: parsed.tool_call_id || null,
                    tool_description: parsed.tool_description || "",
                  },
                } satisfies StreamToolApprovalEvent;
              } else if (currentEvent === "sources" && parsed.sources) {
                yield {
                  type: "sources",
                  data: {
                    conversation_id: parsed.conversation_id,
                    sources: parsed.sources || [],
                  },
                } satisfies StreamSourcesEvent;
              } else if (currentEvent === "guardrail_block") {
                yield {
                  type: "guardrail_block",
                  data: {
                    message: parsed.message,
                    conversation_id: parsed.conversation_id,
                  },
                } satisfies StreamGuardrailBlockEvent;
              } else if (parsed.token) {
                yield {
                  type: "token",
                  data: String(parsed.token),
                } satisfies StreamTokenEvent;
              } else if (
                parsed.conversation_id &&
                !parsed.token &&
                !parsed.title
              ) {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id },
                } satisfies StreamDoneEvent;
              }
            } catch {
              // Non-JSON lines are ignored (SSE keepalive, etc.)
            }
          }
          currentEvent = "message";
        }
      }
    }
  },

  /** Get pending tool approval for a conversation */
  getPendingApproval: (
    conversationId: string,
    organizationId: string,
    teamId?: string,
  ) => {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (teamId) params.append("team_id", teamId);
    return apiClient.get<ToolApprovalInfo | null>(
      `/v1/agent/conversations/${conversationId}/pending-approval?${params}`,
      { headers: getAuthHeader() },
    );
  },

  /** Resume a conversation after tool approval decision (non-streaming) */
  resume: (request: ToolApprovalRequest) =>
    apiClient.post<ChatResponse>(
      "/v1/agent/resume",
      { ...request, stream: false },
      {
        headers: getAuthHeader(),
      },
    ),

  /**
   * Resume a conversation with streaming response.
   * Returns an async generator that yields typed stream events.
   */
  resumeStream: async function* (
    request: Omit<ToolApprovalRequest, "stream">,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/v1/agent/resume`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          const data = line.slice(5).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);

              if (currentEvent === "error" || parsed.error) {
                yield {
                  type: "error",
                  data: String(
                    parsed.error || parsed.message || "Unknown error",
                  ),
                } satisfies StreamErrorEvent;
              } else if (currentEvent === "done") {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id },
                } satisfies StreamDoneEvent;
              } else if (currentEvent === "tool_approval") {
                yield {
                  type: "tool_approval",
                  data: {
                    conversation_id: parsed.conversation_id,
                    tool_name: parsed.tool_name,
                    tool_args: parsed.tool_args || {},
                    tool_call_id: parsed.tool_call_id || null,
                    tool_description: parsed.tool_description || "",
                  },
                } satisfies StreamToolApprovalEvent;
              } else if (currentEvent === "sources" && parsed.sources) {
                yield {
                  type: "sources",
                  data: {
                    conversation_id: parsed.conversation_id,
                    sources: parsed.sources || [],
                  },
                } satisfies StreamSourcesEvent;
              } else if (parsed.token) {
                yield {
                  type: "token",
                  data: String(parsed.token),
                } satisfies StreamTokenEvent;
              } else if (parsed.conversation_id && !parsed.token) {
                yield {
                  type: "done",
                  data: { conversation_id: parsed.conversation_id },
                } satisfies StreamDoneEvent;
              }
            } catch {
              // Non-JSON lines are ignored (SSE keepalive, etc.)
            }
          }
          currentEvent = "message";
        }
      }
    }
  },
};
