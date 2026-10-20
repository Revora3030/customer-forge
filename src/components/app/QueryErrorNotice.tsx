import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Query failures are not empty business records; keep recovery local to the affected list. */
export function QueryErrorNotice({
  title,
  retry,
  retrying = false,
}: {
  title: string;
  retry: () => unknown;
  retrying?: boolean;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-4">
      <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        {title}
      </p>
      <Button variant="outline" onClick={() => void retry()} disabled={retrying}>
        <RefreshCw className="size-4" aria-hidden="true" />
        {retrying ? "Retrying…" : "Try again"}
      </Button>
    </div>
  );
}