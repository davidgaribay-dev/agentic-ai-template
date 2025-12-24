/**
 * Get a favicon URL for a source
 */
export function getFaviconUrl(source: string): string | null {
  try {
    if (source.includes("://")) {
      const url = new URL(source);
      return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
    }
    if (
      source.includes(".") &&
      !source.includes(" ") &&
      !source.includes("/")
    ) {
      return `https://www.google.com/s2/favicons?domain=${source}&sz=32`;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/**
 * Get display name from source path/filename
 */
export function getDisplayName(source: string): string {
  const parts = source.split("/");
  const filename = parts[parts.length - 1] || source;
  return filename.replace(/\.[^/.]+$/, "");
}

/**
 * Get domain from source URL
 */
export function getDomain(source: string): string {
  try {
    if (source.includes("://")) {
      const url = new URL(source);
      return url.hostname.replace("www.", "");
    }
  } catch {
    // Not a valid URL
  }
  // Return file extension or type
  const ext = source.split(".").pop();
  return ext || "document";
}

/**
 * Get badge label - filename for documents, domain for URLs
 */
export function getBadgeLabel(source: string): string {
  // For URLs, return domain
  try {
    if (source.includes("://")) {
      const url = new URL(source);
      return url.hostname.replace("www.", "");
    }
  } catch {
    // Not a valid URL
  }
  // For files, return filename without extension
  return getDisplayName(source);
}
