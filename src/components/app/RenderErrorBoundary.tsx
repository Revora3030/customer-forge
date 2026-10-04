import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportRouteError } from "@/lib/route-error-reporting";

type Props = {
  children: ReactNode;
  title?: string;
  body?: string;
  backHref?: string;
};

type State = { failed: boolean };

export class RenderErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[render-boundary]", error);
    reportRouteError(error, {
      boundary: "render_error_boundary",
      mechanism: "react_error_boundary",
      componentStack: info.componentStack ?? "",
    });
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    const title = this.props.title ?? "This view couldn't load";
    const body =
      this.props.body ??
      "Something went wrong while rendering this page. Your saved work is safe.";
    const backHref = this.props.backHref ?? "/";

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <p className="eyebrow">Revora recovery</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Reload
            </button>
            <a
              href={backHref}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground"
            >
              Go back
            </a>
          </div>
        </div>
      </div>
    );
  }
}

/** Semantic alias for route-level render protection. */
export const ErrorBoundary = RenderErrorBoundary;
