import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Get initials from a name or email for avatar display.
 * @param name - Full name (optional)
 * @param email - Email address (fallback)
 * @returns 1-2 character initials string
 */
export function getInitials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

/**
 * Validate that a URL is safe to use as an image source.
 * Prevents potential XSS/SSRF vectors from untrusted URLs.
 *
 * @param url - The URL to validate
 * @returns true if the URL is safe to use, false otherwise
 */
export function isValidImageUrl(url: string | null | undefined): url is string {
  if (!url) return false

  // Block javascript: and data: URLs that might be embedded
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.includes("javascript:") || lowerUrl.includes("data:")) {
    return false
  }

  // Allow relative URLs starting with /
  if (url.startsWith("/")) {
    return true
  }

  try {
    const parsed = new URL(url)

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false
    }

    return true
  } catch {
    // Invalid URL format
    return false
  }
}

/**
 * Format a date as a human-friendly relative time string.
 * Examples: "30s ago", "2m ago", "1h ago", "3d ago", "2w ago"
 *
 * @param date - The date to format (ISO string or Date object)
 * @returns Human-friendly relative time string
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date()
  const then = typeof date === "string" ? new Date(date) : date
  const diffMs = now.getTime() - then.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 10) {
    return "just now"
  } else if (diffSec < 60) {
    return `${diffSec}s ago`
  } else if (diffMin < 60) {
    return `${diffMin}m ago`
  } else if (diffHour < 24) {
    return `${diffHour}h ago`
  } else if (diffDay < 7) {
    return `${diffDay}d ago`
  } else if (diffWeek < 4) {
    return `${diffWeek}w ago`
  } else if (diffMonth < 12) {
    return `${diffMonth}mo ago`
  } else {
    return `${diffYear}y ago`
  }
}
