import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Undo2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { cn } from "@/lib/utils";
import type { AuditIssue, LivePageResult } from "@/lib/site-audit";
import { auditScore } from "@/lib/site-audit";
import { summarizeProposals, type UpgradeProposal } from "@/lib/auto-upgrade";
import type { AppliedUpgrade } from "@/lib/auto-upgrade.hooks";
import {
  builderLink,
  criticalFirst,
  fixTargets,
  gapTargets,
  type FixTarget,
} from "@/lib/issue-fix";
import {
  ctaLadder,
  type ConversionContext,
  type ConversionGap,
  type ConversionGoal,
} from "@/lib/conversion-engine";

const TONE = { critical: "danger", warning: "attention", opportunity: "info" } as const;

/**
 * One finding, made actionable. Expanding it explains what is wrong, why it
 * matters and the recommended fix, then offers the automatic fix (when Revora
 * can do it without inventing facts) and a direct link to the exact builder
 * area that owns it.
 */
function FixCard({
  target,
  canManage,
  busy,
  onFixAutomatically,
}: {
  target: FixTarget;
  canManage: boolean;
  busy: boolean;
  onFixAutomatically: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-3.5 py-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 text-left"
      >
        <Pill tone={TONE[target.severity]}>{target.severity}</Pill>
        <span className="text-[13px] font-medium">{target.title}</span>
        <span className="text-[11px] text-muted-foreground">{target.scope}</span>
        <span className="ml-auto text-[11px] text-primary">{open ? "Hide" : "Fix this"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2 rounded-md border border-border p-3 text-[12px]">
          <p>
            <span className="font-medium">What is wrong: </span>
            <span className="text-muted-foreground">{target.whatIsWrong}</span>
          </p>
          <p>
            <span className="font-medium">Why it matters: </span>
            <span className="text-muted-foreground">{target.whyItMatters}</span>
          </p>
          <p>
            <span className="font-medium">Recommended fix: </span>
            <span className="text-muted-foreground">{target.recommendedFix}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {target.proposalId ? (
              <Button
                size="sm"
                variant="signal"
                disabled={!canManage || busy}
                onClick={() => onFixAutomatically(target.proposalId!)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
                Fix automatically
              </Button>
            ) : null}
            <Button size="sm" variant="outline" asChild>
              <Link to={builderLink(target.area).to} search={builderLink(target.area).search}>
                Fix manually in {target.areaLabel}
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {target.proposalId ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <RotateCcw className="size-3" aria-hidden="true" /> A restore point is saved first, so
              this can be undone.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              This one needs a real business fact from you — Revora will not invent it.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function FixList({
  targets,
  canManage,
  busyProposalId,
  onFixAutomatically,
  emptyLabel = "No issues found here.",
}: {
  targets: FixTarget[];
  canManage: boolean;
  busyProposalId: string | null;
  onFixAutomatically: (proposalId: string) => void;
  emptyLabel?: string;
}) {
  if (!targets.length)
    return (
      <p className="flex items-center gap-2 px-3.5 py-6 text-[13px] text-muted-foreground">
        <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> {emptyLabel}
      </p>
    );
  return (
    <ul className="divide-y divide-border">
      {criticalFirst(targets).map((target) => (
        <FixCard
          key={target.issueKey}
          target={target}
          canManage={canManage}
          busy={!!target.proposalId && busyProposalId === target.proposalId}
          onFixAutomatically={onFixAutomatically}
        />
      ))}
    </ul>
  );
}

export function SiteAuditor({
  structureIssues,
  pageScores,
  goal,
  conversionCtx,
  conversionGaps,
  proposals,
  live,
  liveNote,
  isScanning,
  canManage,
  applyingId,
  lastApplied,
  isUndoing,
  isBatchRunning,
  onScanLive,
  onApply,
  onUndo,
  onBatchFix,
}: {
  structureIssues: AuditIssue[];
  pageScores: { pageId: string; title: string; score: number }[];
  goal: ConversionGoal | null;
  conversionCtx: ConversionContext;
  conversionGaps: ConversionGap[];
  proposals: UpgradeProposal[];
  live: LivePageResult[] | null;
  liveNote: string | null;
  isScanning: boolean;
  canManage: boolean;
  applyingId: string | null;
  lastApplied: AppliedUpgrade | null;
  isUndoing: boolean;
  isBatchRunning?: boolean;
  onScanLive: () => void;
  onApply: (proposal: UpgradeProposal) => void;
  onUndo: () => void;
  onBatchFix?: (mode: "critical" | "all") => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const liveIssues = useMemo(() => (live ?? []).flatMap((page) => page.issues), [live]);
  const allIssues = useMemo(
    () => [...structureIssues, ...liveIssues],
    [structureIssues, liveIssues],
  );
  const score = auditScore(allIssues, 60);
  const summary = summarizeProposals(proposals);
  const ladder = ctaLadder(goal, conversionCtx);

  const structureTargets = useMemo(
    () => fixTargets(structureIssues, proposals),
    [structureIssues, proposals],
  );
  const liveTargets = useMemo(() => fixTargets(liveIssues, proposals), [liveIssues, proposals]);
  const gapCards = useMemo(() => gapTargets(conversionGaps), [conversionGaps]);
  const criticalCount = allIssues.filter((issue) => issue.severity === "critical").length;
  const autoFixable = proposals.filter(
    (proposal) => proposal.applyable && proposal.kind !== "publish_site",
  ).length;

  const fixOne = (proposalId: string) => {
    const proposal = proposals.find((item) => item.id === proposalId);
    if (proposal) onApply(proposal);
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <ScanSearch className="size-3.5 text-primary" aria-hidden="true" /> Website auditor
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">
              <span className="tnum">{score}</span>
              <span className="text-[14px] font-normal text-muted-foreground">
                /100 page quality
              </span>
            </p>
            <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">
              Structure is scanned from your saved pages. Run the live scan to check the HTML your
              customers and Google actually receive. Every finding below opens the exact place that
              fixes it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={criticalCount ? "danger" : "signal"}>
              {allIssues.length} finding{allIssues.length === 1 ? "" : "s"}
            </Pill>
            <Button size="sm" variant="outline" onClick={onScanLive} disabled={isScanning}>
              {isScanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanSearch className="size-4" />
              )}
              Scan live pages
            </Button>
          </div>
        </div>

        {onBatchFix ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border p-3">
            <Button
              size="sm"
              variant="signal"
              disabled={!canManage || !autoFixable || isBatchRunning}
              onClick={() => onBatchFix("critical")}
            >
              {isBatchRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wrench className="size-4" />
              )}
              Fix all critical issues
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canManage || !autoFixable || isBatchRunning}
              onClick={() => onBatchFix("all")}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              Optimise entire website
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {autoFixable
                ? `${autoFixable} safe change${autoFixable === 1 ? "" : "s"} available. One restore point is saved first; publishing stays your decision.`
                : "Nothing can be fixed automatically right now — the remaining findings need a business fact from you."}
            </p>
          </div>
        ) : null}

        {pageScores.length ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pageScores.map((page) => (
              <div
                key={page.pageId}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <p className="truncate text-[12px]">{page.title}</p>
                <span
                  className={cn(
                    "tnum text-[12px]",
                    page.score >= 75 ? "text-primary" : "text-accent",
                  )}
                >
                  {page.score}%
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel p-0">
        <div className="border-b border-border px-3.5 py-3">
          <p className="eyebrow flex items-center gap-2">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" /> Conversion engine
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {goal
              ? "Your site is built around one goal, with backup paths for visitors who convert differently."
              : "No primary conversion goal is saved yet. Choose one before Revora audits conversion paths."}
          </p>
          {ladder.length ? (
            <ol className="mt-3 flex flex-wrap items-center gap-1.5">
              {ladder.map((step, index) => (
                <li key={step.key} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px]",
                      index === 0
                        ? "border-primary bg-primary/10 text-foreground"
                        : step.available
                          ? "border-border text-muted-foreground"
                          : "border-dashed border-border text-muted-foreground/60",
                    )}
                    title={step.note}
                  >
                    {index === 0 ? "Primary · " : ""}
                    {step.label}
                    {step.available ? "" : " (off)"}
                  </span>
                  {index < ladder.length - 1 ? (
                    <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
        <FixList
          targets={gapCards}
          canManage={canManage}
          busyProposalId={applyingId}
          onFixAutomatically={fixOne}
          emptyLabel={
            goal
              ? "Every conversion path for your goal is wired up."
              : "Choose a primary conversion goal to audit conversion paths."
          }
        />
      </section>

      <section className="panel p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              <ClipboardCheck className="size-3.5 text-primary" aria-hidden="true" /> Auto-upgrade
              proposals
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {summary.headline} Nothing is applied without your approval.
            </p>
          </div>
          {lastApplied?.versionId ? (
            <Button size="sm" variant="outline" onClick={onUndo} disabled={isUndoing}>
              {isUndoing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Undo2 className="size-4" />
              )}
              Undo “{lastApplied.title}”
            </Button>
          ) : null}
        </div>

        {proposals.length ? (
          <ul className="divide-y divide-border">
            {proposals.map((proposal) => {
              const open = openId === proposal.id;
              return (
                <li key={proposal.id} className="px-3.5 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium">{proposal.title}</p>
                        <Pill tone={proposal.applyable ? "signal" : "attention"}>
                          {proposal.applyable ? `+${proposal.impact} pts` : "Needs your input"}
                        </Pill>
                      </div>
                      <p className="mt-1 text-[12px] text-muted-foreground">{proposal.why}</p>
                      {proposal.needs ? <p className="mt-1 text-[12px]">{proposal.needs}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenId(open ? null : proposal.id)}
                      >
                        {open ? "Hide changes" : `Show changes (${proposal.changes.length})`}
                      </Button>
                      <Button
                        size="sm"
                        variant="signal"
                        disabled={!canManage || !proposal.applyable || applyingId !== null}
                        onClick={() => onApply(proposal)}
                      >
                        {applyingId === proposal.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Approve &amp; apply
                      </Button>
                    </div>
                  </div>

                  {open ? (
                    <ul className="mt-3 space-y-2 rounded-md border border-border p-3">
                      {proposal.changes.map((change, index) => (
                        <li key={index} className="text-[12px]">
                          <p className="font-medium">{change.label}</p>
                          <p className="mt-0.5 text-muted-foreground line-through decoration-destructive/60">
                            {change.before}
                          </p>
                          <p className="text-foreground">{change.after}</p>
                        </li>
                      ))}
                      <li className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <RotateCcw className="size-3" aria-hidden="true" /> A restore point is saved
                        before this is applied, so it can be undone.
                      </li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-2 px-3.5 py-6 text-[13px] text-muted-foreground">
            <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> No upgrades needed
            right now.
          </p>
        )}
      </section>

      <section className="panel p-0">
        <div className="border-b border-border px-3.5 py-3">
          <p className="eyebrow">Structure findings</p>
        </div>
        <FixList
          targets={structureTargets}
          canManage={canManage}
          busyProposalId={applyingId}
          onFixAutomatically={fixOne}
        />
      </section>

      <section className="panel p-0">
        <div className="border-b border-border px-3.5 py-3">
          <p className="eyebrow">Live page findings</p>
          {liveNote ? <p className="mt-1 text-[12px] text-muted-foreground">{liveNote}</p> : null}
        </div>
        {live && live.length ? (
          <>
            <ul className="divide-y divide-border">
              {live.map((page) => (
                <li
                  key={page.path}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <p className="truncate text-[12px]">{page.path}</p>
                  <p className="text-[11px] text-muted-foreground">
                    HTTP {page.status} · {page.observed.wordCount} words · {page.observed.telLinks}{" "}
                    call link
                    {page.observed.telLinks === 1 ? "" : "s"} · {page.observed.forms} form
                    {page.observed.forms === 1 ? "" : "s"}
                  </p>
                </li>
              ))}
            </ul>
            <div className="border-t border-border">
              <FixList
                targets={liveTargets}
                canManage={canManage}
                busyProposalId={applyingId}
                onFixAutomatically={fixOne}
              />
            </div>
          </>
        ) : (
          <p className="px-3.5 py-6 text-[13px] text-muted-foreground">
            {liveNote ? (
              <Link to="/app/launch" className="text-primary hover:underline">
                Open the launch checklist
              </Link>
            ) : (
              "Run the live scan to check the pages your customers receive."
            )}
          </p>
        )}
      </section>
    </div>
  );
}
