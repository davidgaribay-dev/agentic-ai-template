import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    // Redirect if authenticated OR if we're loading auth state (have token, fetching user)
    // This prevents showing the landing page while the authenticated layout is displayed
    if (context.auth.isAuthenticated || context.auth.isLoading) {
      throw redirect({ to: "/chat" });
    }
  },
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t("home_title")}</CardTitle>
          <CardDescription>{t("home_description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-muted-foreground">
              {t("home_sign_in_prompt")}
            </p>
            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <Link to="/login">{t("auth_sign_in")}</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/signup">{t("auth_sign_up")}</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
