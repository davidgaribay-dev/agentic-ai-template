import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import i18n from "@/locales/i18n";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors anywhere in the
 * child component tree and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-destructive">
              {i18n.t("error_something_wrong")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {i18n.t("error_unexpected")}
            </p>
          </div>

          {import.meta.env.DEV && this.state.error && (
            <details className="max-w-2xl rounded-lg border bg-muted p-4 text-left">
              <summary className="cursor-pointer font-medium">
                {i18n.t("error_details")}
              </summary>
              <pre className="mt-2 overflow-auto text-xs">
                <code>{this.state.error.toString()}</code>
                {this.state.errorInfo && (
                  <>
                    {"\n\n"}
                    {i18n.t("error_component_stack")}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}

          <div className="flex gap-4">
            <button
              onClick={this.handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {i18n.t("error_try_again")}
            </button>
            <Link
              to="/"
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              {i18n.t("error_go_home")}
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Simple fallback component for inline error boundaries
 */
export function ErrorFallback({
  error: _error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-sm text-destructive">
        {i18n.t("error_something_wrong")}
      </p>
      {resetErrorBoundary && (
        <button
          onClick={resetErrorBoundary}
          className="text-sm text-primary underline hover:no-underline"
        >
          {i18n.t("error_try_again")}
        </button>
      )}
    </div>
  );
}
