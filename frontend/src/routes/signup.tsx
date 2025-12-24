import {
  createFileRoute,
  Link,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegister, authKeys } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/chat" });
    }
  },
});

type Step = "account" | "organization";

function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const register = useRegister();
  const [step, setStep] = useState<Step>("account");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");

  const [localError, setLocalError] = useState<string | null>(null);

  const validateAccountStep = () => {
    if (!email) {
      setLocalError(t("auth_email_required"));
      return false;
    }
    if (password !== confirmPassword) {
      setLocalError(t("auth_passwords_no_match"));
      return false;
    }
    if (password.length < 8) {
      setLocalError(t("auth_password_min_length"));
      return false;
    }
    return true;
  };

  const handleNextStep = () => {
    setLocalError(null);
    if (validateAccountStep()) {
      setStep("organization");
    }
  };

  const handlePrevStep = () => {
    setLocalError(null);
    setStep("account");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!validateAccountStep()) {
      setStep("account");
      return;
    }

    try {
      await register.mutateAsync({
        email,
        password,
        full_name: fullName || undefined,
        organization_name: organizationName || undefined,
      });
      await queryClient.refetchQueries({ queryKey: authKeys.user });
      navigate({ to: "/chat" });
    } catch {
      // Mutation handles error display
    }
  };

  const error = localError || register.error?.message;

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-[360px]">
        {/* Logo/Brand section */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {step === "account"
              ? t("auth_sign_up_title")
              : t("auth_setup_workspace")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === "account" ? (
            <div className="space-y-3">
              <Input
                id="fullName"
                type="text"
                placeholder={t("auth_full_name_optional")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
              />
              <Input
                id="email"
                type="email"
                placeholder={t("auth_email_placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
              />
              <Input
                id="password"
                type="password"
                placeholder={t("auth_password_create_placeholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
              />
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t("auth_password_confirm_placeholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                id="organizationName"
                type="text"
                placeholder={t("auth_org_name_optional")}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                autoFocus
                className="h-11 rounded-xl border-border/50 bg-muted/30 px-4 text-[15px] placeholder:text-muted-foreground/60"
              />
              <p className="text-sm text-muted-foreground">
                {t("auth_org_name_hint")}
              </p>
            </div>
          )}

          {step === "account" ? (
            <Button
              type="button"
              className="h-11 w-full rounded-xl text-[15px] font-medium"
              onClick={handleNextStep}
            >
              {t("auth_continue_email")}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevStep}
                className="h-11 gap-2 rounded-xl"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("com_back")}
              </Button>
              <Button
                type="submit"
                className="h-11 flex-1 rounded-xl text-[15px] font-medium"
                disabled={register.isPending}
              >
                {register.isPending
                  ? t("auth_creating")
                  : t("auth_create_account")}
              </Button>
            </div>
          )}

          <p className="pt-4 text-center text-sm text-muted-foreground">
            {t("auth_have_account")}{" "}
            <Link
              to="/login"
              className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-muted-foreground"
            >
              {t("auth_sign_in")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
