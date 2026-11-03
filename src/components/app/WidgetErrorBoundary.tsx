/**
 * Widget-sized render boundary (T047). One dashboard card that throws while
 * rendering shows a small "couldn't load" note in its own slot instead of
 * blanking the whole /app page. Reuses the route boundary's error reporting.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { reportRouteError } from "@/lib/route-error-reporting";

type Props = {
  children: ReactNode;
  /** Short name of the widget, used in the fallback text and the error report. */
  name: string;
};

type State = { failed: boolean };

export class WidgetErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(`[widget-boundary:${this.props.name}]`, error);
    reportRouteError(error, {
      boundary: `widget_error_boundary:${this.props.name}`,
      mechanism: "react_error_boundary",
      componentStack: info.componentStack ?? "",
    });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="panel p-4" role="status" aria-live="polite" data-widget-error={this.props.name}>
        <p className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4 text-muted-foreground" aria-hidden /> {this.props.name} couldn't load
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          The rest of your dashboard is fine. This doesn't mean anything is wrong with your website.
        </p>
        <button
          type="button"
          className="mt-2 min-h-11 rounded-md border border-border px-3 text-xs font-medium"
          onClick={() => this.setState({ failed: false })}
        >
          Try again
        </button>
      </section>
    );
  }
}
