import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/Bits";
import { cn } from "@/lib/utils";
import {
  GROWTH_COMMANDS,
  commandPlan,
  growthAudit,
  type AutoFixKey,
  type GrowthAuditInput,
  type GrowthFinding,
  type Severity,
} from "@/lib/growth-command";

const TONE: Record<Severity, { pill: "danger" | "attention" | "info" | "signal"; label: string }> = {
  critical: { pill: "danger", label: "Needs attention" },
  warning: { pill: "attention", label: "Next improvement" },
  opportunity: { pill: "info", label: "Growth opportunity" },
  healthy: { pill: "signal", label: "Ready" },
};

const AUTO_LABEL: Record<AutoFixKey, string> = {
  generate_site: "Build my site",
  apply_cta: "Apply this improvement",
  apply_meta: "Improve my search preview",
  publish_site: "Publish my site",
};

function FindingAction({ finding, canManage, busy, onAutoFix }: { finding: GrowthFinding; canManage: boolean; busy: AutoFixKey | null; onAutoFix: (key: AutoFixKey) => void }) {
  if (finding.severity === "healthy") return <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {finding.autoFix && canManage ? (
        <Button size="sm" variant="signal" disabled={busy !== null} onClick={() => onAutoFix(finding.autoFix!)}>
          {busy === finding.autoFix ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wand2 className="size-4" aria-hidden="true" />}
          {AUTO_LABEL[finding.autoFix]}
        </Button>
      ) : null}
      {finding.to ? (
        <Button asChild size="sm" variant="outline">
          <Link to={finding.to}>Open <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
        </Button>
      ) : null}
    </div>
  );
}

function PlanRow({ finding, canManage, busy, onAutoFix }: { finding: GrowthFinding; canManage: boolean; busy: AutoFixKey | null; onAutoFix: (key: AutoFixKey) => void }) {
  const tone = TONE[finding.severity];
  return (
    <li className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{finding.title}</p><Pill tone={tone.pill}>{tone.label}</Pill></div>
        <p className="mt-1 text-xs text-muted-foreground">{finding.evidence}</p>
        {finding.severity !== "healthy" ? <p className="mt-2 text-xs">{finding.action}</p> : null}
      </div>
      <FindingAction finding={finding} canManage={canManage} busy={busy} onAutoFix={onAutoFix} />
    </li>
  );
}

export function GrowthCommandCenter({ input, canManage, isRefreshing, busyFix, onRefresh, onAutoFix }: { input: GrowthAuditInput; canManage: boolean; isRefreshing?: boolean; busyFix: AutoFixKey | null; onRefresh: () => void; onAutoFix: (key: AutoFixKey) => void }) {
  const audit = useMemo(() => growthAudit(input), [input]);
  const [commandKey, setCommandKey] = useState<string>("upgrade-all");
  const [showDetails, setShowDetails] = useState(false);
  const command = GROWTH_COMMANDS.find((item) => item.key === commandKey) ?? GROWTH_COMMANDS[0]!;
  const plan = commandPlan(command, audit);
  const next = plan.find((finding) => finding.severity !== "healthy") ?? plan[0];
  const criticals = audit.issues.filter((issue) => issue.severity === "critical").length;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden p-0">
        <div className="bg-primary/[0.04] px-5 py-6 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="eyebrow flex items-center gap-2"><Sparkles className="size-3.5 text-primary" aria-hidden="true" /> Revora AI</p>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">What would you like Revora to achieve?</h2>
              <p className="mt-2 text-sm text-muted-foreground">Choose a goal. Revora checks your real business data, explains the plan, and only changes items you approve. Every change remains recoverable.</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="tnum font-display text-2xl font-semibold">{audit.score}</p><p className="text-[11px] text-muted-foreground">Growth score · {audit.grade}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {GROWTH_COMMANDS.map((item) => (
              <button key={item.key} type="button" onClick={() => setCommandKey(item.key)} className={cn("rounded-full border px-3 py-2 text-xs font-medium transition-colors", item.key === commandKey ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")} aria-pressed={item.key === commandKey}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 sm:px-6">
          <p className="eyebrow">Your AI plan</p>
          <p className="mt-1 text-sm text-muted-foreground">{command.intent}</p>
          {next ? (
            <div className="mt-4 rounded-lg border border-primary/25 bg-primary/[0.035] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold">Start here: {next.title}</p><p className="mt-1 text-xs text-muted-foreground">{next.action}</p></div>
                <FindingAction finding={next} canManage={canManage} busy={busyFix} onAutoFix={onAutoFix} />
              </div>
            </div>
          ) : null}
        </div>
        {plan.length ? <ul>{plan.filter((finding) => finding.key !== next?.key).map((finding) => <PlanRow key={finding.key} finding={finding} canManage={canManage} busy={busyFix} onAutoFix={onAutoFix} />)}</ul> : <div className="px-5 pb-5 text-sm text-muted-foreground">Your system is ready for this goal.</div>}
      </section>

      <section className="panel p-0">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}>
          <span><span className="eyebrow flex items-center gap-2">{criticals ? <AlertTriangle className="size-3.5 text-accent" aria-hidden="true" /> : <Lightbulb className="size-3.5 text-primary" aria-hidden="true" />} Behind the scenes</span><span className="mt-1 block text-xs text-muted-foreground">{criticals ? `${criticals} priority issue${criticals === 1 ? "" : "s"} and ${audit.issues.length - criticals} additional improvement${audit.issues.length - criticals === 1 ? "" : "s"}` : "See detailed scores, checks, and improvements"}</span></span>
          {showDetails ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
        </button>
        {showDetails ? <div className="border-t border-border"><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{audit.categories.map((category) => <div key={category.key} className="rounded-md border border-border p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{category.label}</p><span className="tnum text-xs text-muted-foreground">{category.score}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className={cn("h-full rounded-full", category.score >= 75 ? "bg-primary" : "bg-accent")} style={{ width: `${Math.max(category.score, 2)}%` }} /></div><p className="mt-2 text-[11px] text-muted-foreground">{category.blurb}</p></div>)}</div><div className="flex justify-end border-t border-border px-4 py-3"><Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>{isRefreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />} Refresh score</Button></div></div> : null}
      </section>
    </div>
  );
}
