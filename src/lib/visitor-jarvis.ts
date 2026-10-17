/** Shared, browser-safe pieces of the visitor Jarvis (see visitor-jarvis.functions.ts). */

export type VisitorTurn = { role: "user" | "assistant"; content: string };

export type VisitorAction = "start" | "upgrade" | "audit" | "pricing";

export type VisitorReply = { reply: string; action: VisitorAction | null };

const ACTIONS: VisitorAction[] = ["start", "upgrade", "audit", "pricing"];

/** Splits the model's reply from its one optional [[action]] tag. */
export function parseVisitorReply(raw: string): VisitorReply {
  const tags = [...raw.matchAll(/\[\[\s*(start|upgrade|audit|pricing)\s*\]\]/gi)].map((match) => match[1]!.toLowerCase() as VisitorAction);
  const reply = raw
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200);
  const action = tags.find((tag) => ACTIONS.includes(tag)) ?? null;
  return { reply: reply || "Happy to help. What kind of business do you run?", action };
}

/** The button each action shows. "upgrade" signs up like "start"; the saved starter flag makes onboarding import the site. */
export const VISITOR_ACTION_LABEL: Record<VisitorAction, string> = {
  start: "Start free — no card",
  upgrade: "Upgrade my existing website",
  audit: "Get my free website audit",
  pricing: "See pricing",
};
