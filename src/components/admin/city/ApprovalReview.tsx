import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decideApproval, listApprovals } from "@/lib/growth-engine.functions";
import { approvalContentHash } from "@/lib/cognition/approval-token";
import { ApprovalCard, type ApprovalItem } from "./ApprovalCard";

const SHOWN = 4;

/** Pending approvals for the Growth district, approvable in place. */
export function ApprovalReview({ now }: { now: number }) {
  const load = useServerFn(listApprovals);
  const decide = useServerFn(decideApproval);
  const client = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const query = useQuery({ queryKey: ["city-approvals"], queryFn: () => load({ data: { status: "pending" } }) });
  const act = useMutation({
    mutationFn: async (input: { item: ApprovalItem; decision: "approve" | "reject" }) => {
      // The fingerprint is of exactly what was on screen; the server refuses if the item changed since.
      const seenHash = input.decision === "approve" ? await approvalContentHash(input.item) : undefined;
      return decide({ data: { id: input.item.id, decision: input.decision, ...(seenHash ? { seenHash } : {}) } });
    },
    onSuccess: (result, input) => setNotes((prev) => ({ ...prev, [input.item.id]: "note" in result ? String(result.note) : "Done." })),
    onError: (error, input) => setNotes((prev) => ({ ...prev, [input.item.id]: error instanceof Error ? error.message : "That did not go through." })),
    onSettled: () => { for (const key of ["city-approvals", "admin-ai-city", "growth-queue", "growth-overview"]) void client.invalidateQueries({ queryKey: [key] }); },
  });
  if (query.isError) return <p role="alert" className="mt-2 text-xs text-destructive">The approval queue could not be read, so nothing can be approved here. Try the Growth queue.</p>;
  if (query.isLoading) return <p role="status" className="mt-2 text-xs text-muted-foreground">Loading the approval queue…</p>;
  const items = (query.data ?? []) as ApprovalItem[];
  if (!items.length) return <p className="mt-2 text-xs text-muted-foreground">Nothing is waiting for your approval.</p>;
  return (
    <div className="mt-2 space-y-3">
      {items.slice(0, SHOWN).map((item) => (
        <ApprovalCard key={item.id} item={item} now={now} busy={act.isPending} note={notes[item.id] ?? null} onApprove={() => act.mutate({ item, decision: "approve" })} onReject={() => act.mutate({ item, decision: "reject" })} />
      ))}
      {items.length > SHOWN ? <p className="text-[11px] text-muted-foreground">{items.length - SHOWN} more are in the <Link to="/admin/growth" className="underline">Growth queue</Link>.</p> : null}
    </div>
  );
}
