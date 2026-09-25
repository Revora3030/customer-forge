/**
 * Growth & audit inside the builder.
 *
 * Same audit model, findings, proposals and fix engine the Growth Command
 * Center uses — surfaced where the customer is already editing, so a problem and
 * the place that fixes it are one click apart. Every action here writes to the
 * real workspace records and snapshots a restore point first.
 */
import { useState } from "react";
import { SiteAuditor } from "@/components/app/SiteAuditor";
import { LoadingRows } from "@/components/app/Bits";
import { useAuditModel } from "@/lib/audit-model.hooks";
import {
  useApplyUpgrade,
  useBatchFix,
  useLiveAudit,
  useUndoUpgrade,
  type AppliedUpgrade,
} from "@/lib/auto-upgrade.hooks";
import type { UpgradeProposal } from "@/lib/auto-upgrade";
import type { LivePageResult } from "@/lib/site-audit";

export function BuilderAudit({
  organizationId,
  org,
  canManage,
}: {
  organizationId: string | undefined;
  org: { name?: string | null; slug?: string | null; conversion_goal?: string | null } | null | undefined;
  canManage: boolean;
}) {
  const model = useAuditModel(organizationId, org);
  const liveAudit = useLiveAudit(organizationId);
  const applyUpgrade = useApplyUpgrade(organizationId, model.seo);
  const batchFix = useBatchFix(organizationId, model.seo);
  const undoUpgrade = useUndoUpgrade(organizationId);

  const [live, setLive] = useState<LivePageResult[] | null>(null);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<AppliedUpgrade | null>(null);

  if (model.isLoading) return <LoadingRows rows={4} />;

  const scanLive = async () => {
    const result = await liveAudit.mutateAsync();
    setLive(result.pages ?? []);
    setLiveNote(result.note ?? null);
  };

  const runUpgrade = async (proposal: UpgradeProposal) => {
    if (!canManage || !proposal.applyable) return;
    setApplyingId(proposal.id);
    try {
      setLastApplied(await applyUpgrade.mutateAsync(proposal));
    } finally {
      setApplyingId(null);
    }
  };

  const runBatch = async (mode: "critical" | "all") => {
    if (!canManage) return;
    const criticalKinds = new Set(
      model.structure.issues
        .filter((issue) => issue.severity === "critical")
        .map((issue) => issue.upgrade),
    );
    const selected =
      mode === "critical"
        ? model.proposals.filter((proposal) => criticalKinds.has(proposal.kind))
        : model.proposals;
    const result = await batchFix.mutateAsync({
      proposals: selected,
      label: mode === "critical" ? "Fix all critical issues" : "Optimise entire website",
    });
    if (result.restore) setLastApplied(result.restore);
    if (live) await scanLive();
  };

  return (
    <SiteAuditor
      structureIssues={model.structure.issues}
      pageScores={model.structure.pageScores}
      goal={model.goal}
      conversionCtx={model.conversionCtx}
      conversionGaps={model.gaps}
      proposals={model.proposals}
      live={live}
      liveNote={liveNote}
      isScanning={liveAudit.isPending}
      canManage={canManage}
      applyingId={applyingId}
      lastApplied={lastApplied}
      isUndoing={undoUpgrade.isPending}
      isBatchRunning={batchFix.isPending}
      onScanLive={() => void scanLive()}
      onApply={(proposal) => void runUpgrade(proposal)}
      onBatchFix={(mode) => void runBatch(mode)}
      onUndo={() => {
        if (lastApplied) void undoUpgrade.mutateAsync(lastApplied).then(() => setLastApplied(null));
      }}
    />
  );
}
