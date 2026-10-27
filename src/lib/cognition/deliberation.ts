/**
 * Pillar 6 (Multi-agent): bounded peer deliberation. One agent proposes,
 * specialist critics vote, and the proposer revises against their objections
 * for a capped number of rounds. Agents are injected, so this spends nothing;
 * the outcome is a recommendation for the owner, never an executed action.
 */
export type Vote = { approve: boolean; objection?: string };

export type Deliberator = {
  name: string;
  critique: (proposal: string) => Promise<Vote>;
};

export type DeliberationResult = {
  outcome: "consensus" | "no_consensus";
  proposal: string;
  rounds: number;
  /** Objections still standing on the final proposal. */
  openObjections: { by: string; objection: string }[];
  /** Always true: an agreeing panel recommends, the owner decides. */
  needsOwner: true;
};

export async function deliberate(input: {
  propose: (feedback: readonly string[]) => Promise<string>;
  critics: readonly Deliberator[];
  /** Share of critics that must approve, 0-1. */
  quorum?: number;
  maxRounds?: number;
}): Promise<DeliberationResult> {
  if (!input.critics.length) throw new Error("Deliberation needs at least one critic.");
  const quorum = Math.min(1, Math.max(0.5, input.quorum ?? 1));
  const maxRounds = Math.min(5, Math.max(1, input.maxRounds ?? 3));
  let feedback: string[] = [];
  let proposal = "";
  let open: { by: string; objection: string }[] = [];

  for (let round = 1; round <= maxRounds; round += 1) {
    proposal = await input.propose(feedback);
    const votes = await Promise.all(
      input.critics.map(async (critic) => {
        try {
          return { name: critic.name, vote: await critic.critique(proposal) };
        } catch {
          // A critic that errors is an objection, not a silent yes.
          return { name: critic.name, vote: { approve: false, objection: "critic unavailable" } as Vote };
        }
      }),
    );
    const approvals = votes.filter((v) => v.vote.approve).length;
    open = votes.filter((v) => !v.vote.approve).map((v) => ({ by: v.name, objection: (v.vote.objection ?? "no reason given").slice(0, 300) }));
    if (approvals / votes.length >= quorum) return { outcome: "consensus", proposal, rounds: round, openObjections: open, needsOwner: true };
    feedback = open.map((o) => `${o.by}: ${o.objection}`);
  }
  return { outcome: "no_consensus", proposal, rounds: maxRounds, openObjections: open, needsOwner: true };
}
