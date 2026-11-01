/**
 * Offers the AI upgrade a facts-only build left pending. The AI design or
 * writing team was at capacity, so the build saved a basic layout or wording
 * from the owner's own details instead of failing. Upgrading spends AI
 * credits, so nothing runs until the owner presses the button; the press
 * hands one request to the builder queue and the banner says so.
 */
import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  aiUpgradeInstruction,
  aiUpgradeKey,
  aiUpgradeSummary,
  type AiUpgradeFollowUp,
} from "@/lib/builder/ai-upgrade-followups";

const STORAGE_PREFIX = "rv:ai-upgrade-requested:";

function readRequested(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function AiUpgradeBanner({
  organizationId,
  followUps,
  canManage,
  busy = false,
  onApprove,
}: {
  organizationId: string;
  followUps: readonly AiUpgradeFollowUp[];
  canManage: boolean;
  /** The builder is already working on a request: wait before adding this one. */
  busy?: boolean;
  /** Queues the upgrade request. Called only from the owner's press. */
  onApprove: (instruction: string) => void;
}) {
  const key = `${STORAGE_PREFIX}${organizationId}:${aiUpgradeKey(followUps)}`;
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    setRequested(readRequested(key));
  }, [key]);
  const instruction = aiUpgradeInstruction(followUps);
  if (!followUps.length || !instruction) return null;

  const approve = () => {
    if (requested || busy || !canManage) return;
    setRequested(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Private mode: the banner still shows the request was sent this visit.
    }
    onApprove(instruction);
  };

  return (
    <div
      role="status"
      data-testid="ai-upgrade-banner"
      className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-300/60 bg-sky-50 px-3 py-2.5 text-[13px] text-sky-950 dark:border-sky-400/30 dark:bg-sky-950/30 dark:text-sky-100"
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-medium">{aiUpgradeSummary(followUps)}</p>
        <p className="text-sky-900/80 dark:text-sky-100/80">
          {requested
            ? "Upgrade requested. It's in your builder chat; your facts, prices and reviews stay exactly as saved."
            : "Nothing was made up. An AI upgrade can polish the design and wording, keeping every fact, price and review as saved."}
        </p>
      </div>
      {canManage ? (
        requested ? (
          <span data-testid="ai-upgrade-requested" className="inline-flex items-center gap-1.5 font-medium">
            <Check className="size-4" aria-hidden="true" />
            Upgrade requested
          </span>
        ) : (
          <Button size="sm" data-testid="approve-ai-upgrade" onClick={approve} disabled={busy} aria-busy={busy} title={busy ? "Waiting for the current request to finish" : undefined}>
            <Sparkles className="size-4" aria-hidden="true" />
            Upgrade with AI (uses credits)
          </Button>
        )
      ) : (
        <span className="text-sky-900/80 dark:text-sky-100/80">Ask the site owner to approve the upgrade.</span>
      )}
    </div>
  );
}
