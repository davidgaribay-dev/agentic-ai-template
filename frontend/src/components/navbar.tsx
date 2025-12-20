import { Link } from "@tanstack/react-router"
import { PanelRight } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { UserMenu } from "./user-menu"
import { useSidePanel } from "./side-panel"
import { WorkspaceSwitcher } from "./workspace-switcher"

export function Navbar() {
  const { isAuthenticated, isLoading } = useAuth()
  const { toggle } = useSidePanel()

  if (isLoading || !isAuthenticated) {
    return null
  }

  return (
    <header className="z-50 shrink-0 border-b bg-background">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm font-semibold">
            DeepGTM
          </Link>
          <WorkspaceSwitcher />
        </div>
        <div className="flex items-center gap-2">
          <UserMenu />
          <button
            onClick={toggle}
            className="flex size-8 items-center justify-center rounded-md hover:bg-muted"
            aria-label="Toggle panel"
          >
            <PanelRight className="size-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
