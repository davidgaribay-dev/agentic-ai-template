/**
 * Media API client for chat image uploads.
 *
 * Provides methods for uploading, listing, and managing chat media files.
 */

import { apiClient, getAuthHeader } from "./client";

/** Supported MIME types for chat media */
export const ALLOWED_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

/** Chat media item */
export interface ChatMedia {
  id: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
  created_by_id: string;
  organization_id: string;
  team_id: string | null;
  user_id: string | null;
}

/** Paginated media response (matches backend PaginatedResponse) */
export interface ChatMediasPublic {
  data: ChatMedia[];
  count: number;
}

/** Media upload response (same as ChatMedia) */
export type MediaUploadResponse = ChatMedia;

/** Storage usage response (matches backend StorageUsage) */
export interface StorageUsage {
  total_bytes: number;
  file_count: number;
  quota_bytes: number | null;
  quota_used_percent: number | null;
}

/** Parameters for listing media */
export interface ListMediaParams {
  organizationId: string;
  teamId?: string;
  skip?: number;
  limit?: number;
}

/** Parameters for uploading media */
export interface UploadMediaParams {
  file: File;
  organizationId: string;
  teamId?: string;
}

/**
 * Check if a file type is allowed for upload
 */
export function isAllowedMediaType(
  mimeType: string,
): mimeType is AllowedMediaType {
  return ALLOWED_MEDIA_TYPES.includes(mimeType as AllowedMediaType);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const mediaApi = {
  /**
   * Upload a media file
   */
  async upload(params: UploadMediaParams): Promise<MediaUploadResponse> {
    const formData = new FormData();
    formData.append("file", params.file);

    // Build URL with query parameters (backend expects them as Query params)
    const searchParams = new URLSearchParams();
    searchParams.set("organization_id", params.organizationId);
    if (params.teamId) {
      searchParams.set("team_id", params.teamId);
    }

    return apiClient.post<MediaUploadResponse>(
      `/v1/media/upload?${searchParams.toString()}`,
      formData,
      {
        headers: getAuthHeader(),
      },
    );
  },

  /**
   * List media files for the current user
   */
  async list(params: ListMediaParams): Promise<ChatMediasPublic> {
    const searchParams = new URLSearchParams();
    searchParams.set("organization_id", params.organizationId);
    if (params.teamId) {
      searchParams.set("team_id", params.teamId);
    }
    if (params.skip !== undefined) {
      searchParams.set("skip", params.skip.toString());
    }
    if (params.limit !== undefined) {
      searchParams.set("limit", params.limit.toString());
    }

    return apiClient.get<ChatMediasPublic>(
      `/v1/media?${searchParams.toString()}`,
      { headers: getAuthHeader() },
    );
  },

  /**
   * Get a single media item
   */
  async get(id: string): Promise<ChatMedia> {
    return apiClient.get<ChatMedia>(`/v1/media/${id}`, {
      headers: getAuthHeader(),
    });
  },

  /**
   * Get presigned URL for a media item
   */
  async getUrl(id: string): Promise<{ url: string }> {
    return apiClient.get<{ url: string }>(`/v1/media/${id}/url`, {
      headers: getAuthHeader(),
    });
  },

  /**
   * Get the content URL for a media item (for direct embedding)
   */
  getContentUrl(id: string): string {
    const token = localStorage.getItem("auth_token");
    // For direct image embedding, we need to use the content endpoint
    // which proxies the image from S3
    return `/api/v1/media/${id}/content${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },

  /**
   * Delete a media item (soft delete)
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete<void>(`/v1/media/${id}`, {
      headers: getAuthHeader(),
    });
  },

  /**
   * Get storage usage for the current user
   */
  async getUsage(
    organizationId: string,
    teamId?: string,
  ): Promise<StorageUsage> {
    const searchParams = new URLSearchParams();
    searchParams.set("organization_id", organizationId);
    if (teamId) {
      searchParams.set("team_id", teamId);
    }

    return apiClient.get<StorageUsage>(
      `/v1/media/usage?${searchParams.toString()}`,
      { headers: getAuthHeader() },
    );
  },
};
