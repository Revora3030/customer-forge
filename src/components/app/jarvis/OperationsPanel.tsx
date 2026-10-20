import { ApprovalLogCard } from "./ApprovalLogCard";
import { useEffect, useRef } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Ban, Copy, Megaphone, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProspectDemoBuilder, type DemoCardTarget } from "@/components/app/ProspectDemoBuilder";
import { ClaudeCodePanel } from "@/components/app/ClaudeCodePanel";
import { ProspectAutopilotCard } from "./ProspectAutopilotCard";
import { ProspectInboxCard } from "./ProspectInboxCard";
import type { getJarvisAcquisitionReadiness, getJarvisDiagnostics, runJarvisDiagnosticTool } from "@/lib/jarvis.functions";
import type { ProspectDraft } from "@/lib/jarvis-prospecting.functions";

type Diagnostics = Awaited<ReturnType<typeof getJarvisDiagnostics>>;
type Acquisition = Awaited<ReturnType<typeof getJarvisAcquisitionReadiness>>;
type ToolResult = Awaited<ReturnType<typeof runJarvisDiagnosticTool>>;

type CapabilityScorePayload = {
  /** The prospect demo engine's seven self-audit rows (absent on older releases). */
  engine?: { score: number; verified: number; total: number; rows: Array<{ id: string; title: string; status: string; summary: string }> };
  overallScore: number;
  verifiedChecks: number;
  totalChecks: number;
  verified10Of10Areas: number;
  areas: Array<{
    id: string;
    title: string;
    score: number;
    verified: number;
    total: number;
    status: "verified_10_of_10" | "gaps_found" | "evidence_incomplete";
    blockers: string[];
  }>;
  nextActions: string[];
};

export type ProspectorState = {
  text: string;
  onTextChange: (value: string) => void;
  lineCount: number;
  drafting: boolean;
  onDraft: () => void;
  drafts: ProspectDraft[];
  edits: Record<number, string>;
  onEdit: (index: number, value: string) => void;
  dncCount: number;
  onClearDnc: () => void;
  addressConfigured: boolean;
  onSuppress: (draft: ProspectDraft) => void;
  onCopy: (text: string) => void;
  addressPlaceholder: string;
};

type Props = {
  diagnostics: UseQueryResult<Diagnostics, Error>;
  acquisition: UseQueryResult<Acquisition, Error>;
  scorecard: UseQueryResult<ToolResult, Error>;
  prospector: ProspectorState;
  /** Increments each time the owner asks to see diagnostics (the header's Checks button). */
  focusDiagnostics: number;
  /** Shows a demo's live build card / preview in the chat (a new build, or "Preview here"). */
  onShowDemo?: ((demo: DemoCardTarget) => void) | undefined;
};

export const DIAGNOSTIC_SECTIONS = [["errors", "Errors"], ["builds", "Builds"], ["schema", "Schema"]] as const;

const clock = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const dot = (status?: string) => status === "checked" ? "bg-emerald-500" : status === "unavailable" ? "bg-destructive" : "bg-muted-foreground/50";
const summaryRow = "flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium";

/**
 * The operator tools beside the chat (a sticky column on wide screens, a bottom
 * sheet on phones). Most-used first: the demo builder, then Claude Code, then
 * health, prospecting, acquisition and the scorecard. The honesty copy is fixed.
 */
export function OperationsPanel({ diagnostics, acquisition, scorecard, prospector, focusDiagnostics, onShowDemo }: Props) {
  const diagnosticsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!focusDiagnostics || !diagnosticsRef.current) return;
    const el = diagnosticsRef.current;
    el.open = true;
    el.querySelector("summary")?.focus({ preventScroll: true });
    // The cards above load after the sheet opens and push diagnostics down,
    // so re-align a few times instead of stopping midway at autopilot.
    const scroll = () => {
      // Scroll only the panel's own scroller so the sheet itself never shifts.
      let box = el.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
      if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 16;
    };
    scroll();
    const timers = [250, 800, 1600].map((ms) => window.setTimeout(scroll, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [focusDiagnostics]);

  return (
    <div className="space-y-3">
      <ProspectDemoBuilder onBuildStarted={onShowDemo} onPreview={onShowDemo} />
      <ClaudeCodePanel />
      <ProspectAutopilotCard />
      <ProspectInboxCard />
      <ApprovalLogCard />

      <details ref={diagnosticsRef} id="jarvis-diagnostics" className="scroll-mt-4 rounded-xl border border-border bg-card">
        <summary className={summaryRow}>
          <Stethoscope className="size-4 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            {DIAGNOSTIC_SECTIONS.map(([name, label]) => (
              <span key={name} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${dot(diagnostics.data?.sections[name]?.status)}`} aria-hidden />{label}</span>
            ))}
          </span>
          <span className="text-xs text-muted-foreground">{diagnostics.isFetching ? "Checking…" : "Details"}</span>
        </summary>
        <div className="space-y-3 border-t border-border p-3 text-sm">
          {DIAGNOSTIC_SECTIONS.map(([name, label]) => {
            const section = diagnostics.data?.sections[name];
            const reason = section && section.status === "unavailable" ? section.reason : undefined;
            return (
              <div key={name}>
                <p className="font-medium">{label} · {section?.status ?? "not checked"}</p>
                <p className="text-xs text-muted-foreground">{section?.note ?? "Run diagnostics to collect evidence."}</p>
                {reason ? <p className="break-words text-xs text-destructive">Reason: {reason}</p> : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">Snapshot: {diagnostics.data?.checkedAt ?? "not collected"}. “Checked” means the query ran—not that the subsystem is healthy.</p>
            <Button type="button" size="sm" variant="outline" data-jarvis-tap="" disabled={diagnostics.isFetching} onClick={() => { void diagnostics.refetch(); }}>{diagnostics.isFetching ? "Checking…" : "Refresh diagnostics"}</Button>
          </div>
          {diagnostics.error ? <p role="alert" className="text-xs text-destructive">Diagnostics unavailable. No healthy verdict can be inferred.</p> : null}
          {diagnostics.data ? <details className="rounded-lg border border-border p-2"><summary className="cursor-pointer text-xs">Inspect bounded diagnostic evidence</summary><pre className="mt-2 max-h-80 overflow-auto text-xs">{JSON.stringify(diagnostics.data, null, 2)}</pre></details> : null}
        </div>
      </details>

      <details className="rounded-xl border border-border bg-card">
        <summary className={summaryRow}><Megaphone className="size-4 shrink-0" aria-hidden />Prospector · research and draft, you approve every send</summary>
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">One business per line: name | website | city | email. Website and email are optional; up to 5 at a time. Jarvis reads each public homepage, writes a short honest email from what it actually sees, adds your opt-out line and mailing address, then stops. You review and send. Email only: cold texts and auto-dialed calls need prior consent.</p>
          <Textarea aria-label="Prospects, one per line" value={prospector.text} rows={4} onChange={(event) => prospector.onTextChange(event.target.value)} placeholder="Triangle Comfort HVAC | triangle-comfort.com | Raleigh | owner@triangle-comfort.com" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" data-jarvis-tap="" disabled={prospector.drafting || prospector.lineCount === 0} onClick={prospector.onDraft}>{prospector.drafting ? "Reading sites and drafting…" : `Draft outreach${prospector.lineCount ? ` (${prospector.lineCount})` : ""}`}</Button>
            {prospector.dncCount > 0 ? <span className="text-xs text-muted-foreground">{prospector.dncCount} on do-not-contact (this device) <button type="button" className="min-h-8 underline" onClick={prospector.onClearDnc}>clear</button></span> : null}
          </div>
          {prospector.drafts.length > 0 && !prospector.addressConfigured ? <p role="alert" className="text-xs text-destructive">Your mailing address isn't configured. Set REVORA_MAILING_ADDRESS (a real street address or PO box) in your server environment. Until then every draft carries a placeholder and the mail button stays off.</p> : null}
          {prospector.drafts.map((draft, index) => {
            const body = prospector.edits[index] ?? draft.body;
            const blocked = body.includes(prospector.addressPlaceholder);
            return (
              <article key={`${draft.name}-${index}`} className="space-y-2 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{draft.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{draft.website ?? "No website"}{draft.email ? ` · ${draft.email}` : " · no email yet"}</p>
                </div>
                {draft.skipped ? <p className="text-xs text-destructive">{draft.skipped}</p> : (
                  <>
                    <p className="text-xs text-muted-foreground">{draft.notes.join(" · ")}</p>
                    <p className="break-words text-sm font-medium">Subject: {draft.subject}</p>
                    <Textarea aria-label={`Email to ${draft.name}`} rows={9} value={body} onChange={(event) => prospector.onEdit(index, event.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => prospector.onCopy(`Subject: ${draft.subject}\n\n${body}`)}><Copy className="mr-1 size-3.5" aria-hidden />Copy</Button>
                      {draft.email && !blocked ? <a className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted sm:min-h-8" href={`mailto:${draft.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`}>Open in mail app</a> : null}
                      <Button type="button" size="sm" variant="ghost" onClick={() => prospector.onSuppress(draft)}><Ban className="mr-1 size-3.5" aria-hidden />Do not contact</Button>
                    </div>
                    {blocked ? <p className="text-xs text-destructive">Add your mailing address to the footer before sending.</p> : null}
                  </>
                )}
              </article>
            );
          })}
        </div>
      </details>

      <section aria-label="Jarvis customer acquisition autopilot" className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0"><h2 className="font-semibold">Customer acquisition autopilot</h2><p className="text-xs text-muted-foreground">Measure → qualify → prepare → approve → verify paid conversion. No guaranteed revenue claims.</p></div>
          <Button type="button" size="sm" variant="outline" data-jarvis-tap="" disabled={acquisition.isFetching} onClick={() => { void acquisition.refetch(); }}>{acquisition.isFetching ? "Checking…" : "Check acquisition readiness"}</Button>
        </div>
        <p className="text-sm text-muted-foreground">Jarvis can prepare an evidence-backed daily plan and identify missing integrations. This check does not read prospect records, send messages, publish changes, or spend money.</p>
        {acquisition.data ? <div className="space-y-3">
          <div className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Readiness: {acquisition.data.status.replaceAll("_", " ")}</strong><span className="text-xs text-muted-foreground">Spend authorized: No · Sending enabled: No</span></div><p className="mt-1 text-xs text-muted-foreground">{acquisition.data.note}</p><p className="mt-2 text-xs">Verified signals: analytics {acquisition.data.analyticsVerified ? "yes" : "unknown"}, lead source {acquisition.data.liveLeadSourceVerified ? "yes" : "unknown"}, outbound provider {acquisition.data.outboundProviderVerified ? "yes" : "unknown"}, booking {acquisition.data.bookingVerified ? "yes" : "unknown"}, payment flow {acquisition.data.paymentFlowVerified ? "yes" : "unknown"}.</p><p className="mt-1 text-xs">Server-approved daily spend cap: {(acquisition.data.configuredSpendCapCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}; this run requested $0.</p></div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Observed funnel signals</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ["Organizations", acquisition.data.funnelMetrics.organizationsTotal],
                ["Trial records", acquisition.data.funnelMetrics.trialRecordsTotal],
                ["Leads · 7 days", acquisition.data.funnelMetrics.leadsCreatedLast7Days],
                ["Appointments · 7 days", acquisition.data.funnelMetrics.appointmentsCreatedLast7Days],
                ["Paid invoices · 30 days", acquisition.data.funnelMetrics.paidInvoicesLast30Days],
                ["Active subscription records", acquisition.data.funnelMetrics.activeSubscriptionRecords],
              ].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value === null ? "Unknown" : value}</p></div>)}
            </div>
            <p className="text-xs text-muted-foreground">{acquisition.data.funnelMetrics.note}</p>
          </div>
          <ol className="space-y-2">{acquisition.data.steps.map((step) => <li key={step.id} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{step.title}</strong><span className="text-xs text-muted-foreground">{step.mode.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs text-muted-foreground">{step.reason}</p></li>)}</ol>
        </div> : acquisition.error ? <p role="alert" className="text-sm text-destructive">Acquisition readiness could not be verified. Treat all live integrations as unavailable.</p> : <p className="text-xs text-muted-foreground">Not checked yet. Jarvis will verify server-side connector evidence when requested.</p>}
      </section>

      <section aria-label="Jarvis seven-area capability scorecard" className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold">Jarvis capability scorecard</h2>
            <p className="text-xs text-muted-foreground">Seven capability areas · evidence-backed · missing proof never counts as a pass.</p>
          </div>
          <Button type="button" size="sm" variant="outline" data-jarvis-tap="" disabled={scorecard.isFetching} onClick={() => { void scorecard.refetch(); }}>
            {scorecard.isFetching ? "Auditing…" : "Run seven-area audit"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">This reads bounded diagnostics, public-site smoke checks, and release-branch CI summaries. It does not enable writes, outreach, publishing, or spend.</p>
        {scorecard.data ? (() => {
          const toolResult = scorecard.data;
          const payload = toolResult.data as unknown as CapabilityScorePayload;
          const valid = payload && typeof payload === "object" && Array.isArray(payload.areas) &&
            typeof payload.overallScore === "number" && typeof payload.totalChecks === "number";
          return valid ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>Overall verified score: {payload.overallScore.toFixed(1)}/10</strong>
                  <span className="text-xs text-muted-foreground">{payload.verifiedChecks}/{payload.totalChecks} checks verified</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{payload.verified10Of10Areas}/7 areas fully verified · status: {toolResult.status.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">Checked {clock(toolResult.checkedAt)} · {toolResult.durationMs} ms</p>
              </div>
              <div className="space-y-3">
                {payload.areas.map((area) => (
                  <article key={area.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{area.title}</span>
                      <span className="text-xs tabular-nums">{area.score.toFixed(1)}/10 · {area.verified}/{area.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={area.title} aria-valuemin={0} aria-valuemax={10} aria-valuenow={area.score}>
                      <div className="h-full rounded-full bg-primary" style={{ width: Math.min(100, Math.max(0, area.score * 10)) + "%" }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{area.status.replaceAll("_", " ")}</p>
                    {area.blockers.length > 0 ? <details className="rounded-md border border-border px-2 py-1.5"><summary className="cursor-pointer text-xs">Show {area.blockers.length} evidence gaps</summary><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{area.blockers.slice(0, 8).map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></details> : <p className="text-xs text-muted-foreground">All required checks verified.</p>}
                  </article>
                ))}
              </div>
              {payload.engine && Array.isArray(payload.engine.rows) ? (
                <section aria-label="Prospect demo engine self-audit" className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Prospect demo engine</h3>
                    <span className="text-xs tabular-nums">{payload.engine.score.toFixed(1)}/10 · {payload.engine.verified}/{payload.engine.total} verified</span>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {payload.engine.rows.map((row) => (
                      <li key={row.id} className="text-xs">
                        <span className="font-medium">{row.title}</span>
                        <span className={row.status === "verified" ? "text-primary" : row.status === "failed" ? "text-destructive" : "text-muted-foreground"}> · {row.status}</span>
                        <p className="break-words text-muted-foreground">{row.summary}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {payload.nextActions.length > 0 ? <div className="rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">Highest-priority next actions</h3><ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">{payload.nextActions.map((action) => <li key={action}>{action}</li>)}</ol></div> : null}
              <p className="text-xs text-muted-foreground">{toolResult.limitations.join(" ")}</p>
            </div>
          ) : <p role="alert" className="text-sm text-destructive">Jarvis returned a result that did not match the capability scorecard contract.</p>;
        })() : scorecard.error ? <p role="alert" className="text-sm text-destructive">Capability audit failed: {scorecard.error.message}. No area should be treated as verified.</p> : <p className="text-xs text-muted-foreground">Run the audit to see evidence, exact gaps, and prioritized next actions.</p>}
      </section>
    </div>
  );
}
