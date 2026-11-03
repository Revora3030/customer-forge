/**
 * Reads back the "Heads up" notices the event watch posts into Jarvis chat
 * (see jarvis-event-watch.server.ts) so the chat can draw them as a compact
 * card with a one-tap triage button instead of raw tags and copy-paste text.
 * Pure: it only reinterprets saved message text, never runs or changes anything.
 */
export type EventNotice = {
  ruleId: string;
  subject: string;
  /** One factual sentence or two from the record that raised the event. */
  summary: string;
  /** The suggested question, or null on older notices that did not quote one. */
  prompt: string | null;
  label: string;
  /** Low-signal notices (for example Dependabot) are drawn as one muted line. */
  quiet: boolean;
};

const NOTICE = /^Heads up \[event:([a-z0-9-]+)\|([^\]]{1,120})\]\s*\n\n([\s\S]*)$/;
const PROMPT = /\s*Send this to Jarvis to open the recovery: [“"]([\s\S]*?)[”"]\s*$/;
// The card says once that nothing was changed or sent, so both the trailer and the summary's own ending are dropped.
const TAIL = /\s*Nothing was changed(?: or sent(?: from here)?)?\.?\s*$/;

const LABELS: Record<string, string> = {
  "build-failed-review": "Site build failed",
  "ci-failed-triage": "Release check failed",
  "dependabot-failed-quiet": "Dependabot update failed",
  "routine-failed": "Routine did not finish",
  "payment-failed": "Payment failed",
  "site-down": "Site health",
  "lead-unanswered": "Lead waiting",
  "trial-expiring": "Trial ending",
  "retention-case": "Client health low",
  "retention-escalate": "Client health critical",
  "client-no-leads": "Client has no leads",
  "client-leads-unanswered": "Client leads waiting",
};

export const QUIET_RULES: ReadonlySet<string> = new Set(["dependabot-failed-quiet"]);

export function eventNoticeLabel(ruleId: string): string {
  return LABELS[ruleId] ?? ruleId.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function parseEventNotice(content: string): EventNotice | null {
  const match = NOTICE.exec(content.trim());
  if (!match) return null;
  const ruleId = match[1]!;
  let rest = match[3]!;
  const promptMatch = PROMPT.exec(rest);
  const prompt = promptMatch ? promptMatch[1]!.trim() || null : null;
  if (promptMatch) rest = rest.slice(0, promptMatch.index);
  rest = rest.replace(TAIL, "").replace(TAIL, "").trim();
  return { ruleId, subject: match[2]!.trim(), summary: rest, prompt, label: eventNoticeLabel(ruleId), quiet: QUIET_RULES.has(ruleId) };
}
