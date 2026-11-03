/**
 * The publish-time security line for the Pre-Flight panel (COMP-5 + LOV-10).
 *
 * Reads "Security check: passed" or "Security check: N things to fix", then
 * lists each item in plain words with a Fix control.
 *
 * LOV-5 HOOK: pass `renderFix` to swap the plain fallback button for the shared
 * "Fix it with AI" card. It receives `{ title, plainReason, scope }` (the same
 * props that card takes) plus `needsOwner`. Until then the fallback opens the
 * website editor, which never changes anything by itself.
 */

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SecurityCheck, SecurityItem } from "@/lib/preflight-security";

export type RenderFix = (item: SecurityItem) => ReactNode;

function FallbackFix({ item }: { item: SecurityItem }) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/app/website" aria-label={`Fix: ${item.title}`}>
        Fix
      </Link>
    </Button>
  );
}

export function SecurityCheckLine({
  check,
  renderFix,
}: {
  check: SecurityCheck;
  renderFix?: RenderFix | undefined;
}) {
  return (
    <div className="mt-4 rounded-md border border-border/60 bg-card/40 p-3" data-testid="security-check">
      <p
        className="flex items-center gap-2 text-[13px] font-medium"
        role="status"
        data-state={check.passed ? "passed" : "fix"}
      >
        {check.passed ? (
          <ShieldCheck className="size-4 text-primary" aria-hidden />
        ) : check.blockers > 0 ? (
          <X className="size-4 text-destructive" aria-hidden />
        ) : (
          <AlertTriangle className="size-4 text-accent" aria-hidden />
        )}
        {check.line}
      </p>
      {check.passed && !check.headersChecked ? (
        <p className="mt-1 text-[12px] text-muted-foreground">
          Your live page's safety settings are checked once the site is published.
        </p>
      ) : null}
      {check.items.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {check.items.map((item) => (
            <li key={item.key} className="rounded-md border border-border/60 p-2.5">
              <p className="text-[12px] font-medium">
                {item.title}
                {item.severity === "blocker" ? (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
                    stops publishing
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{item.plainReason}</p>
              <div className="mt-2">{renderFix ? renderFix(item) : <FallbackFix item={item} />}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
