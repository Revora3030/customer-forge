/**
 * REVORA PRE-FLIGHT™ panel.
 *
 * Shows the real result of the pre-publish verification in plain language and
 * gates the publish button behind it. Warnings are visibly separated from
 * blockers so an owner is never stopped by an optional improvement.
 */

import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Loader2, MinusCircle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreflightCheck, PreflightGroup, PreflightResult } from "@/lib/preflight";
import type { Regression } from "@/lib/site-regression";
import { autoFixable } from "@/lib/preflight";
import type { ClaimState } from "@/lib/claim-registry";
import { SecurityCheckLine, type RenderFix } from "@/components/app/SecurityCheckLine";

const groupIcon = (group: PreflightGroup) => {
  if (group.status === "fail") return <X className="size-3.5 text-destructive" aria-hidden />;
  if (group.status === "warn")
    return <AlertTriangle className="size-3.5 text-accent" aria-hidden />;
  if (group.status === "skip")
    return <MinusCircle className="size-3.5 text-muted-foreground" aria-hidden />;
  return <Check className="size-3.5 text-primary" aria-hidden />;
};

function CheckRow({ check }: { check: PreflightCheck }) {
  return (
    <li className="rounded-md border border-border/60 bg-card/40 p-3">
      <p className="text-[13px] font-medium">{check.label}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{check.detail}</p>
      {check.fix ? <p className="mt-1 text-[12px]">{check.fix}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {check.autoFixable ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            Revora can fix this
          </span>
        ) : (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            Needs your input
          </span>
        )}
        {check.to ? (
          <Button asChild size="sm" variant="outline">
            <Link to={check.to}>Open</Link>
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function PreFlightPanel({
  result,
  isChecking = false,
  canPublish,
  isPublishing = false,
  onPublish,
  onSelfHeal,
  isHealing = false,
  healSummary,
  regressions = [],
  renderSecurityFix,
}: {
  result: PreflightResult;
  isChecking?: boolean;
  canPublish: boolean;
  isPublishing?: boolean;
  onPublish?: () => void;
  /** Runs Revora's safe repairs. Omitted when the viewer can't edit the site. */
  onSelfHeal?: () => void;
  isHealing?: boolean;
  /** Real outcome of the last repair run, in plain language. */
  healSummary?: string | null;
  /** Anything that got worse since this workspace's previous check. */
  regressions?: Regression[];
  /** Hook for the shared LOV-5 "Fix it with AI" card; a plain Fix link is used when omitted. */
  renderSecurityFix?: RenderFix | undefined;
}) {
  const fixable = autoFixable(result);

  return (
    <section className="panel p-4" aria-labelledby="preflight-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="preflight-title" className="flex items-center gap-2 text-[14px] font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Revora Pre-Flight
          </h2>
          <p className="mt-1 max-w-prose text-[12px] text-muted-foreground">{result.summary}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{result.score}%</p>
          <p className="text-[11px] text-muted-foreground">
            {isChecking ? "checking…" : result.publishSafe ? "publish safe" : "not ready"}
          </p>
        </div>
      </header>

      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {result.groups.map((group) => (
          <li
            key={group.key}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-2"
            title={group.purpose}
          >
            {groupIcon(group)}
            <span className="truncate text-[12px]">{group.label}</span>
          </li>
        ))}
      </ul>

      <SecurityCheckLine check={result.securityCheck} renderFix={renderSecurityFix} />

      {result.blockers.length > 0 ? (
        <div className="mt-4">
          <p className="text-[13px] font-medium text-destructive">
            Must be sorted before going live
          </p>
          <ul className="mt-2 space-y-2">
            {result.blockers.map((check) => (
              <CheckRow key={check.key} check={check} />
            ))}
          </ul>
        </div>
      ) : null}

      {result.warnings.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-[13px] font-medium">
            {result.warnings.length} optional improvement
            {result.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-2">
            {result.warnings.map((check) => (
              <CheckRow key={check.key} check={check} />
            ))}
          </ul>
        </details>
      ) : null}

      {regressions.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3"
          role="status"
        >
          <p className="text-[12px] font-semibold">Changed for the worse since your last check</p>
          <ul className="mt-1 space-y-1">
            {regressions.slice(0, 4).map((regression, index) => (
              <li key={`${regression.kind}-${index}`} className="text-[12px]">
                {regression.severity === "critical" ? "Critical: " : "Warning: "}
                {regression.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fixable.length > 0 || onSelfHeal ? (
        <div className="mt-3 rounded-md border border-border/60 bg-card/40 p-3">
          <p className="text-[12px] text-muted-foreground">
            {fixable.length > 0
              ? `${fixable.length} of these are things Revora can correct for you from details you already gave. Your previous version is saved first, and if any part of the repair fails nothing is changed.`
              : "Revora can run its safe repairs any time — it saves a restore point first and changes nothing it can't verify."}
          </p>
          {onSelfHeal ? (
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              disabled={isHealing || isChecking}
              onClick={onSelfHeal}
            >
              {isHealing ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
              Fix what Revora safely can
            </Button>
          ) : null}
          {healSummary ? <p className="mt-2 text-[12px]">{healSummary}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="signal"
          disabled={!result.publishSafe || !canPublish || isPublishing || isChecking}
          onClick={onPublish}
        >
          {isPublishing ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
          {result.publishSafe ? "Publish my website" : "Publishing locked"}
        </Button>
        {!canPublish ? (
          <span className="text-[12px] text-muted-foreground">
            Your Revora plan needs to be active to publish.
          </span>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Every capability Revora advertises, with its real state for this workspace.
 * A promise with no implementation can't appear here — the claim registry test
 * fails the build first.
 */
export function ServiceStatusPanel({ states }: { states: ClaimState[] }) {
  return (
    <section className="panel p-4" aria-labelledby="claims-title">
      <h2 id="claims-title" className="text-[14px] font-semibold">
        Your Revora services
      </h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        What you were promised, and whether it is switched on for your business right now.
      </p>
      <ul className="mt-3 space-y-2">
        {states.map(({ claim, live, detail }) => (
          <li
            key={claim.key}
            className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card/40 p-3"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{claim.promise}</p>
              {detail ? <p className="mt-0.5 text-[12px] text-muted-foreground">{detail}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {live ? (
                <Check className="size-3.5 text-primary" aria-label="Live" />
              ) : (
                <MinusCircle className="size-3.5 text-muted-foreground" aria-label="Not on yet" />
              )}
              <Button asChild size="sm" variant="outline">
                <Link to={claim.to}>Open</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
