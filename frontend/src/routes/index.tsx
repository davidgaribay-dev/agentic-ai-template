import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/chat" })
    }
  },
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">AI Agent Template</CardTitle>
          <CardDescription>
            FastAPI + LangGraph + React + TanStack
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-muted-foreground">
              Sign in to access the AI agent
            </p>
            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/signup">Sign up</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
