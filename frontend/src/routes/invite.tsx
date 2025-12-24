/**
 * Invitation Acceptance Page.
 *
 * Handles invitation links for joining organizations.
 * - Shows invitation details
 * - Allows new users to sign up and join
 * - Allows existing users to accept invitation after login
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2,
  Users,
  User,
  Mail,
  Clock,
  AlertCircle,
  CheckCircle,
  Lock,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationsApi } from "@/lib/api";
import {
  useRegisterWithInvitation,
  isLoggedIn,
  useCurrentUser,
} from "@/lib/auth";

export const Route = createFileRoute("/invite")({
  component: InvitePage,
  validateSearch: (search: Record<string, unknown>): { token?: string } => {
    return { token: search.token as string | undefined };
  },
});

function InvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const registerWithInvitation = useRegisterWithInvitation();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    data: invitationInfo,
    isLoading: isLoadingInvitation,
    error: invitationError,
  } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => invitationsApi.getInvitationInfo(token!),
    enabled: !!token,
    retry: false,
  });

  const acceptInvitation = useMutation({
    mutationFn: () => invitationsApi.acceptInvitation(token!),
    onSuccess: () => {
      navigate({ to: "/" });
    },
  });

  useEffect(() => {
    if (!token) {
      navigate({ to: "/" });
    }
  }, [token, navigate]);

  const handleNewUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (password !== confirmPassword) {
      setLocalError(t("auth_passwords_no_match"));
      return;
    }

    if (password.length < 8) {
      setLocalError(t("auth_password_min_length"));
      return;
    }

    if (!invitationInfo?.email) {
      setLocalError(t("error_invalid_invitation"));
      return;
    }

    try {
      await registerWithInvitation.mutateAsync({
        token: token!,
        password,
        full_name: fullName || undefined,
        email: invitationInfo.email,
      });
      navigate({ to: "/" });
    } catch {
      // Error handled by mutation
    }
  };

  const handleAcceptInvitation = async () => {
    try {
      await acceptInvitation.mutateAsync();
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoadingInvitation || isLoadingUser) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <Card className="relative w-full max-w-md border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-muted-foreground">{t("invite_loading")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitationError || !invitationInfo) {
    const errorMessage =
      (invitationError as Error)?.message || t("invite_expired_desc");
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("invite_invalid")}
            </h1>
            <p className="mt-1 text-muted-foreground">{errorMessage}</p>
          </div>
          <Card className="border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
            <CardContent className="pt-6">
              <Button
                asChild
                className="w-full shadow-lg shadow-primary/25"
                size="lg"
              >
                <Link to="/">{t("error_go_home")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isExpired = new Date(invitationInfo.expires_at) < new Date();

  if (isExpired) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <Clock className="h-7 w-7 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("invite_expired")}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {t("invite_expired_desc")}
            </p>
          </div>
          <Card className="border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
            <CardContent className="pt-6">
              <Button
                asChild
                className="w-full shadow-lg shadow-primary/25"
                size="lg"
              >
                <Link to="/">{t("error_go_home")}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoggedIn() && currentUser) {
    const isCorrectEmail = currentUser.email === invitationInfo.email;

    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {/* Header section */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
              <Building2 className="h-7 w-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("invite_join_org", {
                orgName: invitationInfo.organization_name,
              })}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {invitationInfo.invited_by_name
                ? t("invite_invited_by", {
                    name: invitationInfo.invited_by_name,
                  })
                : t("invite_been_invited")}
            </p>
          </div>

          <Card className="border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">{t("invite_accept")}</CardTitle>
              <CardDescription>{t("invite_review_join")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Invitation details */}
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/50 p-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("invite_organization")}
                    </p>
                    <p className="font-medium">
                      {invitationInfo.organization_name}
                    </p>
                  </div>
                </div>
                {invitationInfo.team_name && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("invite_team")}
                      </p>
                      <p className="font-medium">
                        {invitationInfo.team_name}{" "}
                        <span className="text-muted-foreground">
                          ({invitationInfo.team_role})
                        </span>
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("invite_your_role")}
                    </p>
                    <p className="font-medium capitalize">
                      {invitationInfo.org_role}
                    </p>
                  </div>
                </div>
              </div>

              {!isCorrectEmail && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  <p>
                    {t("invite_email_mismatch", {
                      inviteEmail: invitationInfo.email,
                      currentEmail: currentUser.email,
                    })}
                  </p>
                  <p className="mt-2">{t("invite_email_mismatch_action")}</p>
                </div>
              )}

              {acceptInvitation.error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {(acceptInvitation.error as Error).message ||
                    t("invite_failed_accept")}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                className="w-full gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                size="lg"
                onClick={handleAcceptInvitation}
                disabled={!isCorrectEmail || acceptInvitation.isPending}
              >
                {acceptInvitation.isPending ? (
                  t("invite_joining")
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    {t("invite_accept")}
                  </>
                )}
              </Button>
              {!isCorrectEmail && (
                <Button variant="outline" className="w-full" size="lg" asChild>
                  <Link to="/login">{t("invite_login_different")}</Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  const error = localError || registerWithInvitation.error?.message;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header section */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <UserPlus className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("invite_join_org", {
              orgName: invitationInfo.organization_name,
            })}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t("invite_create_account")}
          </p>
        </div>

        <Card className="border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {t("invite_create_title")}
            </CardTitle>
            <CardDescription>{t("invite_create_desc")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleNewUserSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Invitation details */}
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/50 p-4">
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("invite_your_email")}
                    </p>
                    <p className="font-medium">{invitationInfo.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("invite_organization")}
                    </p>
                    <p className="font-medium">
                      {invitationInfo.organization_name}
                    </p>
                  </div>
                </div>
                {invitationInfo.team_name && (
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("invite_team")}
                      </p>
                      <p className="font-medium">{invitationInfo.team_name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("invite_your_role")}
                    </p>
                    <p className="font-medium capitalize">
                      {invitationInfo.org_role}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">
                  {t("invite_full_name_optional")}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder={t("invite_full_name_placeholder")}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("invite_password_label")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("auth_password_min_chars")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  {t("invite_confirm_password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t("invite_confirm_placeholder")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-2">
              <Button
                type="submit"
                className="w-full gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                size="lg"
                disabled={registerWithInvitation.isPending}
              >
                {registerWithInvitation.isPending
                  ? t("auth_creating_account")
                  : t("invite_create_join")}
              </Button>
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    {t("com_or")}
                  </span>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                {t("auth_have_account")}{" "}
                <Link
                  to="/login"
                  search={{ redirect: `/invite?token=${token}` }}
                  className="font-medium text-primary transition-colors hover:text-primary/80"
                >
                  {t("auth_sign_in")}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
