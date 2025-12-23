/**
 * Documents API module.
 *
 * Handles document upload, management, and vector search for the RAG system.
 */

import { apiClient, getAuthHeader } from "./client"

export type DocumentScope = "org" | "team" | "user"

export type ProcessingStatus = "pending" | "processing" | "completed" | "failed"

export interface Document {
  id: string
  organization_id: string
  team_id: string | null
  user_id: string | null
  created_by_id: string
  filename: string
  file_path: string
  file_size: number
  file_type: string
  mime_type: string | null
  processing_status: ProcessingStatus
  processing_error: string | null
  chunk_count: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  document_id: string
  chunk_index: number
  content: string
  token_count: number | null
  metadata_: Record<string, any> | null
  created_at: string
}

export interface PaginatedDocuments {
  data: Document[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface UploadDocumentParams {
  file: File
  organization_id: string
  team_id?: string
  scope: DocumentScope
}

export interface ListDocumentsParams {
  organization_id: string
  team_id?: string
  status?: ProcessingStatus
  page?: number
  page_size?: number
}

export interface SearchResult {
  content: string
  source: string
  file_type: string
  metadata: Record<string, any> | null
  relevance_score: number
}

export interface DocumentContent {
  content: string
  filename: string
  file_type: string
  mime_type: string
}

export const documentsApi = {
  /** Upload a document for RAG processing */
  upload: async (params: UploadDocumentParams) => {
    const formData = new FormData()
    formData.append("file", params.file)
    formData.append("organization_id", params.organization_id)
    if (params.team_id) formData.append("team_id", params.team_id)
    formData.append("scope", params.scope)

    return apiClient.post<Document>("/v1/documents", formData, {
      headers: {
        ...getAuthHeader(),
        // Let browser set Content-Type for multipart/form-data
      },
    })
  },

  /** List documents with optional filters */
  list: (params: ListDocumentsParams) => {
    const searchParams = new URLSearchParams()
    searchParams.append("organization_id", params.organization_id)
    if (params.team_id) searchParams.append("team_id", params.team_id)
    if (params.status) searchParams.append("status", params.status)
    if (params.page) searchParams.append("page", String(params.page))
    if (params.page_size) searchParams.append("page_size", String(params.page_size))

    return apiClient.get<PaginatedDocuments>(
      `/v1/documents?${searchParams.toString()}`,
      { headers: getAuthHeader() }
    )
  },

  /** Get document by ID */
  get: (documentId: string) =>
    apiClient.get<Document>(`/v1/documents/${documentId}`, {
      headers: getAuthHeader(),
    }),

  /** Delete document (soft delete) */
  delete: (documentId: string) =>
    apiClient.delete<{ message: string }>(`/v1/documents/${documentId}`, {
      headers: getAuthHeader(),
    }),

  /** Reprocess a failed document */
  reprocess: (documentId: string) =>
    apiClient.post<{ status: string; message: string }>(
      `/v1/documents/${documentId}/reprocess`,
      {},
      { headers: getAuthHeader() }
    ),

  /** Get document chunks - used for debugging or chunk-level inspection */
  getChunks: (documentId: string) =>
    apiClient.get<DocumentChunk[]>(`/v1/documents/${documentId}/chunks`, {
      headers: getAuthHeader(),
    }),

  /** Get full document content (reads original file or reconstructs from chunks) */
  getContent: (documentId: string) =>
    apiClient.get<DocumentContent>(`/v1/documents/${documentId}/content`, {
      headers: getAuthHeader(),
    }),
}
