import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleSlash, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SimulationCheck } from "@/lib/lead-simulation";
import { friendlyError } from "@/lib/user-error";

type Result = { ok: boolean; leadId: string | null; checks: SimulationCheck[] };

const ICON = {
  pass: <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />,
  fail: <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />,
  skipped: <CircleSlash className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />,
} as const;

const STATUS_WORD = { pass: "Passed", fail: "Failed", skipped: "Skipped" } as const;

/**
 * B12-3 checklist for "/lead-test": one TEST lead sent to the owner's own
 * workspace, every line read back from stored rows. Failures show as failures.
 */
export function LeadSimulationDialog({
  open,
  onOpenChange,
  pending,
  result,
  error,
  onRunAgain,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  result: Result | undefined;
  error: Error | null;
  onRunAgain: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Test lead check</DialogTitle>
          <DialogDescription>
            One sample lead labeled TEST, sent through your real lead path. Only you are emailed; no
            customer is contacted and it is left out of your numbers.
          </DialogDescription>
        </DialogHeader>
        {pending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Sending the test lead and checking each step…
          </p>
        ) : error ? (
          <p className="text-sm text-destructive" role="alert">{friendlyError(error)}</p>
        ) : result ? (
          <div>
            <p className="mb-2 text-sm font-medium" role="status">
              {result.ok ? "Everything checked out." : "Something needs a look."}
            </p>
            <ul className="space-y-2" aria-label="Test lead checklist">
              {result.checks.map((check) => (
                <li key={check.key} className="flex items-start gap-2 text-sm">
                  {ICON[check.status]}
                  <span className="min-w-0">
                    <span className="font-medium">{check.label}</span>
                    <span className="sr-only">: {STATUS_WORD[check.status]}</span>
                    <span className="block text-[13px] leading-snug text-muted-foreground">{check.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          {result?.leadId ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/leads">See it in Leads</Link>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled={pending} onClick={onRunAgain}>
            Run again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
