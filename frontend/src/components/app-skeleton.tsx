import { Skeleton } from "@/components/ui/skeleton"

export function AppSkeleton() {
  return (
    <div
      className="grid h-screen w-screen overflow-hidden bg-background"
      style={{
        gridTemplateColumns: "16rem 1fr",
        gridTemplateRows: "1fr",
      }}
    >
      {/* Sidebar skeleton */}
      <div className="flex flex-col bg-sidebar border-r border-sidebar-border">
        {/* Header - Team switcher */}
        <div className="p-2">
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="size-6 rounded-md" />
            <Skeleton className="h-4 flex-1" />
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 p-2">
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>

        {/* Footer - User */}
        <div className="p-2">
          <div className="flex items-center gap-2 p-2">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content skeleton */}
      <main className="overflow-auto p-6">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-full max-w-xl" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
        </div>
      </main>
    </div>
  )
}
