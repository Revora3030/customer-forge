import { useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { Panel, Pill } from "@/components/app/Bits";
import type { ActionRequestView, EvidenceCard } from "@/lib/agent-gateway";
import type { Tone } from "@/lib/domain";
import { needsSecondTap } from "@/lib/agent-authority";

/**
 * One bot request on the founder's Approvals screen: what it is, the link to
 * what will change, the evidence card, and thumb-sized Approve / Reject.
 */

const STATE: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for you", tone: "attention" },
  approved: { label: "Approved — bot may act", tone: "info" },
  rejected: { label: "Rejected", tone: "neutral" },
  completed: { label: "Done", tone: "signal" },
  failed: { label: "Bot reported a failure", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

function expiresIn(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours} h left` : `${Math.max(1, Math.round(ms / 60_000))} min left`;
}

export function Evidence({ evidence }: { evidence: EvidenceCard | null }) {
  if (!evidence) return <p className="text-xs text-muted-foreground">No evidence card attached.</p>;
  const tests = evidence.tests;
  const files = evidence.affected_files ?? [];
  const rows: [string, string | undefined][] = [
    ["Task", evidence.task_id],
    ["Tests", tests ? `${tests.passed} passed, ${tests.failed} failed${tests.command ? ` (${tests.command})` : ""}` : "not reported"],
    ["Type check", (evidence.typecheck ?? "not_run").replace("_", " ")],
    ["Build", (evidence.build ?? "not_run").replace("_", " ")],
    ["Problem", evidence.observed_failure],
    ["Fix", evidence.fix_applied],
    ["Security", evidence.security],
    ["Rollback", evidence.rollback],
    ["Files", files.length ? `${files.length}: ${files.slice(0, 6).map((file) => file.split("/").pop()).join(", ")}${files.length > 6 ? "…" : ""}` : undefined],
  ];
  const failing = (tests?.failed ?? 0) > 0 || evidence.typecheck === "failed" || evidence.build === "failed";
  return (
    <div className="space-y-1">
      {failing ? <p className="text-xs font-medium text-destructive">The bot's own checks failed. Reject unless you know why.</p> : null}
      <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-xs">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {evidence.ci_url ? (
        <a className="inline-flex min-h-11 items-center gap-1 text-xs underline" href={evidence.ci_url} target="_blank" rel="noreferrer">
          CI run <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

export function AgentRequestCard({ item, focused, onDecide, busy }: { item: ActionRequestView; focused: boolean; onDecide: (approve: boolean) => void; busy: boolean }) {
  const [armed, setArmed] = useState(false);
  const state = STATE[item.state] ?? { label: item.state, tone: "neutral" as const };
  const waiting = item.state === "pending";
  const approve = () => {
    if (needsSecondTap(item.kind) && !armed) {
      setArmed(true);
      return;
    }
    onDecide(true);
  };
  return (
    <Panel id={`request-${item.id}`} className={`space-y-3 p-4 ${focused ? "ring-2 ring-primary" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
        <Pill tone={state.tone}>{state.label}</Pill>
      </div>
      <h2 className="text-base font-semibold leading-snug break-words">{item.title}</h2>
      {item.detail ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.detail}</p> : null}
      {item.target_url ? (
        <a className="inline-flex min-h-11 items-center gap-1 text-sm underline" href={item.target_url} target="_blank" rel="noreferrer">
          Open what will change <ExternalLink className="size-4" />
        </a>
      ) : null}
      <details open={waiting}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">Evidence</summary>
        <Evidence evidence={item.evidence} />
      </details>
      <p className="text-xs text-muted-foreground">
        From {item.requested_by} · {new Date(item.created_at).toLocaleString()}
        {waiting ? ` · ${expiresIn(item.expires_at)}` : ""}
        {item.result_note ? ` · ${item.result_note}` : ""}
      </p>
      {item.result_url ? (
        <a className="inline-flex min-h-11 items-center gap-1 text-sm underline" href={item.result_url} target="_blank" rel="noreferrer">
          Result <ExternalLink className="size-4" />
        </a>
      ) : null}
      {waiting ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onDecide(false)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <X className="size-4" /> Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={approve}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-4" /> {armed ? "Tap again to confirm" : "Approve"}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}

