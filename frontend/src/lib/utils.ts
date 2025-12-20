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
