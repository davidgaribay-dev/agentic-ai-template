import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Building2, User, ArrowLeft, ArrowRight, Mail, Lock, UserPlus, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRegister, authKeys } from "@/lib/auth"

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/chat" })
    }
  },
})

type Step = "account" | "organization"

function SignupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const register = useRegister()
  const [step, setStep] = useState<Step>("account")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [organizationName, setOrganizationName] = useState("")

  const [localError, setLocalError] = useState<string | null>(null)

  const validateAccountStep = () => {
    if (!email) {
      setLocalError("Email is required")
      return false
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match")
      return false
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters")
      return false
    }
    return true
  }

  const handleNextStep = () => {
    setLocalError(null)
    if (validateAccountStep()) {
      setStep("organization")
    }
  }

  const handlePrevStep = () => {
    setLocalError(null)
    setStep("account")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!validateAccountStep()) {
      setStep("account")
      return
    }

    try {
      await register.mutateAsync({
        email,
        password,
        full_name: fullName || undefined,
        organization_name: organizationName || undefined,
      })
      await queryClient.refetchQueries({ queryKey: authKeys.user })
      navigate({ to: "/chat" })
    } catch {
      // Mutation handles error display
    }
  }

  const error = localError || register.error?.message

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted p-4">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo/Brand section */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <UserPlus className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="mt-1 text-muted-foreground">Get started in just a few steps</p>
        </div>

        <Card className="border-border/50 bg-card/80 shadow-xl shadow-black/5 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {step === "account" ? "Personal details" : "Organization setup"}
            </CardTitle>
            <CardDescription>
              {step === "account"
                ? "Tell us a bit about yourself"
                : "Set up your workspace"}
            </CardDescription>
            {/* Progress indicator */}
            <div className="flex items-center gap-3 pt-4">
              <div className="flex items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all ${
                  step === "account"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-primary/20 text-primary"
                }`}>
                  {step === "organization" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <span className={`text-sm font-medium ${step === "account" ? "text-foreground" : "text-muted-foreground"}`}>
                  Account
                </span>
              </div>
              <div className={`h-0.5 flex-1 rounded-full transition-colors ${step === "organization" ? "bg-primary" : "bg-border"}`} />
              <div className="flex items-center gap-2">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all ${
                  step === "organization"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-muted text-muted-foreground"
                }`}>
                  <Building2 className="h-4 w-4" />
                </div>
                <span className={`text-sm font-medium ${step === "organization" ? "text-foreground" : "text-muted-foreground"}`}>
                  Organization
                </span>
              </div>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {step === "account" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name <span className="text-muted-foreground">(optional)</span></Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="fullName"
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="At least 8 characters"
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
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                        minLength={8}
                        className="pl-10"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="organizationName">Organization Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="organizationName"
                        type="text"
                        placeholder="Acme Inc."
                        value={organizationName}
                        onChange={(e) => setOrganizationName(e.target.value)}
                        autoFocus
                        className="pl-10"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use a default name based on your email.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/50 p-4">
                    <p className="font-medium text-sm">What happens next?</p>
                    <ul className="mt-3 space-y-2">
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        You&apos;ll be the owner of your organization
                      </li>
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        You can create teams to organize your work
                      </li>
                      <li className="flex items-start gap-2 text-sm text-muted-foreground">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        You can invite team members later
                      </li>
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pt-2">
              {step === "account" ? (
                <Button
                  type="button"
                  className="w-full gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                  size="lg"
                  onClick={handleNextStep}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <div className="flex w-full gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handlePrevStep}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    type="submit"
                    size="lg"
                    className="flex-1 gap-2 shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30"
                    disabled={register.isPending}
                  >
                    {register.isPending ? "Creating..." : "Create account"}
                  </Button>
                </div>
              )}
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="font-medium text-primary transition-colors hover:text-primary/80">
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
