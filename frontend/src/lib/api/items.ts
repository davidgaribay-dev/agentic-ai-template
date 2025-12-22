/**
 * Items API module.
 *
 * CRUD operations for items (demo/test resource).
 */

import { apiClient, getAuthHeader } from "./client"
import type { Message } from "./types"

export interface Item {
  id: string
  title: string
  description: string | null
  owner_id: string
}

export interface ItemsPublic {
  data: Item[]
  count: number
}

export interface ItemCreate {
  title: string
  description?: string | null
}

export interface ItemUpdate {
  title?: string | null
  description?: string | null
}

export const itemsApi = {
  /** Get all items (paginated) */
  getItems: (skip = 0, limit = 100) =>
    apiClient.get<ItemsPublic>(`/v1/items/?skip=${skip}&limit=${limit}`, {
      headers: getAuthHeader(),
    }),

  /** Get a single item by ID */
  getItem: (itemId: string) =>
    apiClient.get<Item>(`/v1/items/${itemId}`, {
      headers: getAuthHeader(),
    }),

  /** Create a new item */
  createItem: (item: ItemCreate) =>
    apiClient.post<Item>("/v1/items/", item, {
      headers: getAuthHeader(),
    }),

  /** Update an item */
  updateItem: (itemId: string, item: ItemUpdate) =>
    apiClient.patch<Item>(`/v1/items/${itemId}`, item, {
      headers: getAuthHeader(),
    }),

  /** Delete an item */
  deleteItem: (itemId: string) =>
    apiClient.delete<Message>(`/v1/items/${itemId}`, {
      headers: getAuthHeader(),
    }),
}
