import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ageLabel, approveTap } from "@/lib/ai-city";

export type ApprovalItem = { id: string; item_type: string; summary: string; preview: string | null; risk_level: string; status: string; created_at: string };

const RISK_TONE: Record<string, string> = { high: "border-destructive/50 text-destructive", medium: "border-gold/50 text-gold", low: "border-border text-muted-foreground" };

/**
 * One item waiting in the approval queue, shown in full so it is read before it
 * is approved. Medium and high risk items need a second tap. The container sends
 * a fingerprint of exactly this content, and the server refuses if it changed.
 */
export function ApprovalCard({ item, now, busy, note, onApprove, onReject }: { item: ApprovalItem; now: number; busy: boolean; note?: string | null; onApprove: () => void; onReject: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  const tone = RISK_TONE[item.risk_level] ?? RISK_TONE["low"];
  return (
    <article aria-label={item.summary} className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{item.item_type.replaceAll("_", " ")}</span>
        <span className={`rounded-full border px-2 py-0.5 ${tone}`}>{item.risk_level} risk</span>
        <span className="text-muted-foreground">{ageLabel(Math.max(0, now - Date.parse(item.created_at)))} ago</span>
      </div>
      <h4 className="mt-2 break-words text-sm font-medium">{item.summary}</h4>
      <pre tabIndex={0} aria-label="Full content to review" className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-sans text-xs">{item.preview?.trim() ? item.preview : "No preview was saved for this item, so there is nothing to review. Open it in the Growth queue."}</pre>
      {note ? <p role="status" className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          variant="signal"
          className="min-h-11"
          disabled={busy || !item.preview?.trim()}
          onClick={() => { const tap = approveTap(item.risk_level, armed); setArmed(tap.armed); if (tap.fire) onApprove(); }}
        >
          <Check className="size-4" aria-hidden="true" /> {armed ? "Tap again to approve" : "Approve this"}
        </Button>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { setArmed(false); onReject(); }}>
          <X className="size-4" aria-hidden="true" /> Reject
        </Button>
      </div>
      {armed ? <p role="status" className="mt-1 text-[11px] text-muted-foreground">You are approving exactly the text above.</p> : null}
    </article>
  );
}
