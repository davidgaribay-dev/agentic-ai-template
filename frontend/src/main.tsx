import { StrictMode, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import "./index.css"
import { routeTree } from "./routeTree.gen"
import { startTokenRefresh, useAuth } from "./lib/auth"
import type { RouterContext } from "./lib/router-context"

startTokenRefresh()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
  } as RouterContext,
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

function InnerApp() {
  const auth = useAuth()
  const hasSettledRef = useRef(false)
  const prevAuthRef = useRef<boolean | undefined>(undefined)

  useEffect(() => {
    // Don't do anything while auth is still loading
    // This prevents false transitions from loading -> loaded being treated as auth changes
    if (auth.isLoading) {
      return
    }

    const wasAuthenticated = prevAuthRef.current
    const isAuthenticated = auth.isAuthenticated

    // First time auth has settled - record the state but don't navigate
    // This allows users to stay on their current page after reload
    if (!hasSettledRef.current) {
      hasSettledRef.current = true
      prevAuthRef.current = isAuthenticated
      return
    }

    // Only navigate when auth state actually changes (login/logout)
    if (wasAuthenticated !== isAuthenticated) {
      prevAuthRef.current = isAuthenticated

      if (isAuthenticated) {
        router.navigate({ to: "/chat" })
      } else {
        router.navigate({ to: "/login" })
      }
    }
  }, [auth.isAuthenticated, auth.isLoading])

  return <RouterProvider router={router} context={{ auth }} />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <InnerApp />
    </QueryClientProvider>
  </StrictMode>
)
