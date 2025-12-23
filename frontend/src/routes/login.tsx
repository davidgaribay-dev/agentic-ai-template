import {
  createFileRoute,
  Link,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLogin, authQueryOptions, isLoggedIn } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  beforeLoad: ({ context }) => {
    // Check both router context AND localStorage token for immediate redirect
    if (context.auth.isAuthenticated || isLoggedIn()) {
      throw redirect({ to: "/chat" });
    }
  },
});

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      // Wait for the user query to fully resolve before navigating
      // This ensures the auth context is updated before route guards run
      await queryClient.fetchQuery(authQueryOptions.user);
      navigate({ to: "/chat" });
    } catch {
      // Mutation handles error display
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-[360px]">
        {/* Logo/Brand section */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Sign in below to continue
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {login.error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {login.error.message}
            </div>
          )}

          <div className="space-y-3">
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
            />
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={8}
              className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
            />
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl text-[15px] font-medium"
            disabled={login.isPending}
          >
            {login.isPending ? "Signing in..." : "Continue with email"}
          </Button>

          <p className="pt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
