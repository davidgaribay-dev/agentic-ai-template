/**
 * Common types used across multiple API domains.
 */

export interface Message {
  message: string
}

export type OrgRole = "owner" | "admin" | "member"
export type TeamRole = "admin" | "member" | "viewer"
export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked"
