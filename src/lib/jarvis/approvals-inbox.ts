import { splitReplyMeta, type WriteProposal } from "@/lib/jarvis-actions";
import { splitJarvisPlan } from "@/lib/jarvis/multi-step-plan";
import {
  jarvisApprovalSafety,
  safetyLines,
  type ApprovalSafety,
  type SafetyLine,
} from "@/lib/jarvis/approval-safety";

/** The shape of one `jarvis_approvals` row the inbox needs (see `listApprovals`). */
export type InboxApprovalItem = {
  id: string;
  approval_key: string;
  action_id: string;
  summary: string;
  state: string;
  expires_at: string;
};

export type InboxRow = { id: string; role: string; content: string };

export type InboxEntry = {
  key: string;
  actionId: string;
  title: string;
  /** What: Jarvis's saved one-line summary of the proposal. */
  summary: string;
  /** Who is affected, from the action class table, never from model text. */
  affects: string;
  safety: ApprovalSafety;
  lines: SafetyLine[];
  retry: boolean;
  expiresLabel: string;
  /** The proposal itself, when its chat message is loaded. Approve needs it. */
  proposal: WriteProposal | undefined;
  /** The exact customer-facing content on this card, when there is any. */
  exact: { label: string; value: string }[];
};

const TITLES: Record<string, string> = {
  "research.ask": "Paid web research",
  "instagram.post": "Instagram draft",
  "image.create": "AI picture",
  "demo.build": "Build a demo site",
  "code.pr": "Open a pull request",
  "claude.code": "Hand a task to Claude Code",
  "claude.fix": "Ask Claude Code to fix a pull request",
  "builds.recover": "Recover stalled builds",
  "demo.send": "Send a demo link",
  "autopilot.configure": "Change autopilot settings",
  "autopilot.run": "Run autopilot now",
  "memory.forget": "Forget a memory",
  "routine.create": "Create a routine",
  "routine.update": "Change a routine",
  "routine.delete": "Delete a routine",
};

/** `messageId:index` to proposal, for every loaded assistant message. */
export function proposalIndex(rows: readonly InboxRow[]): Map<string, WriteProposal> {
  const out = new Map<string, WriteProposal>();
  for (const row of rows) {
    if (row.role !== "assistant" || !row.content.includes("jarvis-meta")) continue;
    const { body } = splitJarvisPlan(row.content);
    splitReplyMeta(body).meta.proposals.forEach((proposal, index) =>
      out.set(`${row.id}:${index}`, proposal),
    );
  }
  return out;
}

/**
 * The exact content a customer-facing approval puts in front of a person.
 * For a demo link the AI writes the message when it sends, so the wording is
 * not known yet; the card says so rather than showing invented text.
 */
export function exactSendContent(
  proposal: WriteProposal | undefined,
): { label: string; value: string }[] {
  if (!proposal) return [];
  if (proposal.id === "demo.send") {
    return [
      { label: "Channel", value: proposal.channel === "sms" ? "Text message" : "Email" },
      {
        label: "To",
        value: proposal.to?.trim() || "The address or number on file for that business",
      },
      {
        label: "Message",
        value:
          "Written by the AI at send time, so the exact wording isn't known until it goes out.",
      },
    ];
  }
  if (proposal.id === "instagram.post") {
    return [
      { label: "Caption", value: proposal.draft.caption },
      { label: "Image", value: proposal.draft.imageUrl },
    ];
  }
  return [];
}

function expiresLabel(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `Expires in ${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/** Waiting items only (pending, or failed and retryable), soonest-expiring first. */
export function inboxEntries(
  items: readonly InboxApprovalItem[],
  proposals: ReadonlyMap<string, WriteProposal>,
  now = Date.now(),
): InboxEntry[] {
  return items
    .filter((item) => item.state === "pending" || item.state === "failed")
    .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))
    .map((item) => {
      const safety = jarvisApprovalSafety(item.action_id);
      const proposal = proposals.get(item.approval_key);
      return {
        key: item.approval_key,
        actionId: item.action_id,
        title: TITLES[item.action_id] ?? "Action to approve",
        summary: item.summary || item.action_id,
        affects: safety.affects,
        safety,
        lines: safetyLines(safety),
        retry: item.state === "failed",
        expiresLabel: expiresLabel(item.expires_at, now),
        proposal,
        exact: exactSendContent(proposal),
      };
    });
}
