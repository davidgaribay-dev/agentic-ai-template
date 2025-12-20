import type { useAuth } from "./auth"

export interface RouterContext {
  auth: ReturnType<typeof useAuth>
}
