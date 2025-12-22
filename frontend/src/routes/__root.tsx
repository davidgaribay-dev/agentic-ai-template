import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router"
import { SidePanelProvider, SidePanel, useSidePanel } from "@/components/side-panel"
import { WorkspaceProvider } from "@/lib/workspace"
import { SettingsProvider, useEffectiveSettings } from "@/lib/settings-context"
import { ThemeProvider } from "@/components/theme-provider"
import { useAuth } from "@/lib/auth"
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AppSkeleton } from "@/components/app-skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import { PanelRight } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { RouterContext } from "@/lib/router-context"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
})

function ChatToggleButton() {
  const { toggle, isOpen } = useSidePanel()
  const effectiveSettings = useEffectiveSettings()

  if (isOpen) return null

  // Hide the toggle button entirely if chat panel is disabled
  if (!effectiveSettings.chat_panel_enabled) {
    return null
  }

  return (
    <button
      onClick={toggle}
      className="fixed top-3 right-4 z-50 flex size-8 items-center justify-center rounded-md hover:bg-muted"
      aria-label="Open panel"
    >
      <PanelRight className="size-4" />
    </button>
  )
}

function MainLayout() {
  const { open: sidebarOpen } = useSidebar()
  const { isOpen: panelOpen, width: panelWidth } = useSidePanel()
  const effectiveSettings = useEffectiveSettings()

  const sidebarWidth = sidebarOpen ? "16rem" : "3rem"
  const chatPanelEnabled = effectiveSettings.chat_panel_enabled
  const rightPanelWidth = panelOpen && chatPanelEnabled ? `${panelWidth}px` : "0px"

  return (
    <div
      className="grid h-screen w-screen overflow-hidden"
      style={{
        gridTemplateColumns: `${sidebarWidth} 1fr ${rightPanelWidth}`,
        gridTemplateRows: "1fr",
        transition: "grid-template-columns 200ms ease-linear",
      }}
    >
      <AppSidebar />

      <main className="overflow-auto bg-background border-0">
        <Outlet />
      </main>

      {/* Right panel area - only render if chat panel is enabled */}
      {panelOpen && chatPanelEnabled && <SidePanel />}

      <ChatToggleButton />
    </div>
  )
}

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <MainLayout />
    </SidebarProvider>
  )
}

function UnauthenticatedLayout() {
  return (
    <main className="h-screen w-screen overflow-y-auto">
      <Outlet />
    </main>
  )
}

function RootComponent() {
  // Use useAuth directly instead of router context to ensure reactivity
  // Router context doesn't re-render components when it changes
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <ThemeProvider defaultTheme="system" storageKey="ui-theme">
          <SettingsProvider>
            <SidePanelProvider>
              {isAuthenticated || isLoading ? (
                <AuthenticatedLayout />
              ) : (
                <UnauthenticatedLayout />
              )}
            </SidePanelProvider>
          </SettingsProvider>
        </ThemeProvider>
      </WorkspaceProvider>
    </ErrorBoundary>
  )
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-primary hover:underline">
        Go back home
      </Link>
    </div>
  )
}
