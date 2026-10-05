/**
 * Website picture approvals (spec D).
 *
 * Every picture on the site with its art direction and state. The owner
 * approves or rejects each one, and can regenerate a single picture (with an
 * optional note) without touching anything else. Rendered URLs can be
 * verified with a real fetch. Owner photos are shown as approved and are never
 * regenerated.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { EmptyState, ErrorNote, LoadingRows, Panel, Pill, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { imageApprovalSummary } from "@/lib/builder/image-records";
import {
  decideImage,
  listImageRecords,
  regenerateImage,
  verifyRenderedImages,
  type ImageRecord,
} from "@/lib/image-records.functions";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";

const STATUS_TONE = {
  pending: "attention",
  approved: "signal",
  rejected: "danger",
  regenerating: "info",
  failed: "danger",
} as const;

const STATUS_LABEL = {
  pending: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  regenerating: "Making a new one…",
  failed: "Couldn't regenerate",
} as const;

export function ImageApprovalPanel({
  organizationId,
  canManage,
}: {
  organizationId: string | null | undefined;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const list = useServerFn(listImageRecords);
  const decide = useServerFn(decideImage);
  const regenerate = useServerFn(regenerateImage);
  const verify = useServerFn(verifyRenderedImages);
  const key = ["image_records", organizationId];
  const records = useQuery({
    queryKey: key,
    enabled: Boolean(organizationId),
    queryFn: () => list({ data: { organizationId: organizationId! } }),
    refetchInterval: (q) =>
      (q.state.data?.records ?? []).some((r) => r.status === "regenerating") ? 3000 : false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["website_content", organizationId] });
  };

  const decision = useMutation({
    mutationFn: (input: { recordId: string; decision: "approve" | "reject"; reason?: string }) =>
      decide({ data: { organizationId: organizationId!, ...input } }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't save your decision.")),
  });
  const regen = useMutation({
    mutationFn: (input: { recordId: string; note?: string }) =>
      regenerate({ data: { organizationId: organizationId!, ...input } }),
    onSuccess: (result) => {
      if (result.ok) toast.success("New picture ready to review. It's in your draft only.");
      else toast.error(result.message);
      refresh();
    },
    onError: (error: Error) => {
      toast.error(friendlyError(error, "Couldn't make a new picture."));
      refresh();
    },
  });
  const check = useMutation({
    mutationFn: () => verify({ data: { organizationId: organizationId! } }),
    onSuccess: (result) => {
      toast.message(`${result.verified} of ${result.checked} pictures load correctly.`);
      refresh();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't check the pictures.")),
  });

  const rows = records.data?.records ?? [];
  const summary = imageApprovalSummary(rows);

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Pictures"
        title="Approve your website pictures"
        description="Review each picture. Reject one with a reason and regenerate just that picture. Nothing goes live until you publish."
        action={
          canManage && rows.length ? (
            <Button variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Check pictures load
            </Button>
          ) : null
        }
      />
      {records.isLoading ? (
        <div className="mt-4">
          <LoadingRows rows={3} />
        </div>
      ) : records.error ? (
        <div className="mt-4">
          <ErrorNote message={friendlyError(records.error as Error, "Couldn't load your pictures.")} />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No pictures recorded yet"
            description="Pictures made during your build appear here for approval."
          />
        </div>
      ) : (
        <>
          <p className="mt-3 text-[12.5px] text-muted-foreground" aria-live="polite">
            {summary.approved} of {summary.total} approved
            {summary.needsReview ? ` · ${summary.needsReview} need review` : ""}
            {summary.failed ? ` · ${summary.failed} couldn't regenerate` : ""}
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {rows.map((record) => (
              <ImageCard
                key={record.id}
                record={record}
                canManage={canManage}
                busy={decision.isPending || regen.isPending}
                onApprove={() => decision.mutate({ recordId: record.id, decision: "approve" })}
                onReject={(reason) => decision.mutate({ recordId: record.id, decision: "reject", reason })}
                onRegenerate={(note) => regen.mutate({ recordId: record.id, note })}
              />
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ImageCard({
  record,
  canManage,
  busy,
  onApprove,
  onReject,
  onRegenerate,
}: {
  record: ImageRecord;
  canManage: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onRegenerate: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const owner = record.source === "owner";
  return (
    <li className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
      <div className="aspect-[3/2] bg-muted/40">
        {record.preview ? (
          <img
            src={record.preview}
            alt={record.altText ?? `Picture for ${record.slot}`}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[12.5px] font-medium">{record.slot}</span>
          <Pill tone={owner ? "signal" : STATUS_TONE[record.status]}>{owner ? "Your photo" : STATUS_LABEL[record.status]}</Pill>
          {record.renderedVerifiedAt ? <Pill tone="info">Loads</Pill> : null}
        </div>
        {record.direction ? (
          <p className="line-clamp-3 text-[12px] text-muted-foreground" title={record.direction}>
            {record.direction}
          </p>
        ) : null}
        {record.rejectionReason ? (
          <p className="text-[12px] text-destructive">Rejected: {record.rejectionReason}</p>
        ) : null}
        {canManage && !owner ? (
          <>
            <Input
              value={note}
              maxLength={400}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What should change? (optional)"
              aria-label={`What should change in the ${record.slot} picture`}
              className="h-8 text-[12px]"
            />
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="signal"
                disabled={busy || record.status === "approved" || record.status === "regenerating"}
                onClick={onApprove}
              >
                <Check className="size-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || record.status === "rejected" || record.status === "regenerating"}
                onClick={() => onReject(note)}
              >
                <X className="size-3.5" /> Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || record.status === "regenerating"}
                onClick={() => {
                  onRegenerate(note);
                  setNote("");
                }}
              >
                {record.status === "regenerating" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Regenerate this picture
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
