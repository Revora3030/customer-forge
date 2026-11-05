import { JARVIS_ACTION_CLASSES, type JarvisActionClass } from "@/lib/jarvis-actions";

/**
 * JC-37: the plain-language safety summary on every approval card.
 *
 * It is computed from the action class (`JARVIS_ACTION_CLASSES`) plus a small,
 * reviewed table of facts about what each approvable action does. It never
 * reads the model's own words, so a persuasive proposal cannot talk its way
 * into looking safer. Anything this module cannot prove says "Not known"; it
 * never defaults to "No".
 */
export type SafetyAnswer = "yes" | "no" | "unknown";
export type UndoAnswer = "yes" | "no" | "unknown" | "nothing";

export type ApprovalSafety = {
  sendsToPerson: SafetyAnswer;
  spendsMoney: SafetyAnswer;
  changesLiveData: SafetyAnswer;
  undoable: UndoAnswer;
  /** Who is affected, in a few words. */
  affects: string;
  /** One extra caution, when the four answers alone would mislead. */
  note?: string | undefined;
  /** True when the action is classified; false means every answer is "Not known". */
  classified: boolean;
};

export type SafetyLine = {
  key: "sends" | "spends" | "changes" | "undo";
  label: string;
  value: string;
  tone: "caution" | "calm" | "unknown";
};

type Facts = Pick<
  ApprovalSafety,
  "sendsToPerson" | "spendsMoney" | "changesLiveData" | "undoable" | "affects" | "note"
>;

type ApprovableId = {
  [
    K in keyof typeof JARVIS_ACTION_CLASSES
  ]: (typeof JARVIS_ACTION_CLASSES)[K]["autoRuns"] extends false ? K : never;
}[keyof typeof JARVIS_ACTION_CLASSES];

/** What each approvable Jarvis action does, from its catalog entry and card text. */
export const JARVIS_APPROVAL_FACTS: Record<string, Facts> = {
  "research.ask": {
    sendsToPerson: "no",
    spendsMoney: "yes",
    changesLiveData: "no",
    undoable: "nothing",
    affects: "Nobody; one web search for you",
    note: "Paid from your Perplexity credits.",
  },
  "instagram.post": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "yes",
    undoable: "unknown",
    affects: "Nobody yet; saves a draft for you to review",
    note: "Nothing posts until you approve the saved draft in Operations.",
  },
  "image.create": {
    sendsToPerson: "no",
    spendsMoney: "yes",
    changesLiveData: "yes",
    undoable: "unknown",
    affects: "That website's picture library",
    note: "Uses workspace AI credits within your spending cap.",
  },
  "demo.build": {
    sendsToPerson: "no",
    spendsMoney: "unknown",
    changesLiveData: "yes",
    undoable: "unknown",
    affects: "A private demo site; nobody is contacted",
  },
  "code.pr": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "no",
    undoable: "yes",
    affects: "Your GitHub repository (an unmerged pull request)",
    note: "Nothing merges until you merge it. Close the pull request to drop it.",
  },
  "claude.code": {
    sendsToPerson: "no",
    spendsMoney: "unknown",
    changesLiveData: "no",
    undoable: "yes",
    affects: "Your GitHub repository (a pull request)",
    note: "Opens a pull request; close it to drop the change.",
  },
  "claude.fix": {
    sendsToPerson: "no",
    spendsMoney: "unknown",
    changesLiveData: "no",
    undoable: "unknown",
    affects: "An open pull request's branch",
  },
  "builds.recover": {
    sendsToPerson: "no",
    spendsMoney: "unknown",
    changesLiveData: "yes",
    undoable: "no",
    affects: "Stalled website builds and the build worker",
  },
  "demo.send": {
    sendsToPerson: "yes",
    spendsMoney: "unknown",
    changesLiveData: "yes",
    undoable: "no",
    affects: "The business receiving the preview link",
    note: "Once sent it can't be recalled. The server enforces do-not-contact, daily caps and the unsubscribe footer.",
  },
  "autopilot.configure": {
    sendsToPerson: "no",
    spendsMoney: "unknown",
    changesLiveData: "yes",
    undoable: "yes",
    affects: "Your autopilot settings",
    note: "Can switch on automatic emails and texts to businesses later. Change it back with another approval.",
  },
  "autopilot.run": {
    sendsToPerson: "yes",
    spendsMoney: "yes",
    changesLiveData: "yes",
    undoable: "no",
    affects: "Businesses autopilot picks this pass",
    note: "Does nothing while autopilot is off.",
  },
  "memory.forget": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "yes",
    undoable: "no",
    affects: "One saved memory",
  },
  "routine.create": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "yes",
    undoable: "yes",
    affects: "You; a routine posts into this chat",
  },
  "routine.update": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "yes",
    undoable: "yes",
    affects: "One of your routines",
  },
  "routine.delete": {
    sendsToPerson: "no",
    spendsMoney: "no",
    changesLiveData: "yes",
    undoable: "no",
    affects: "One of your routines",
  },
} satisfies Record<ApprovableId, Facts> & Record<string, Facts>;

const UNKNOWN: ApprovalSafety = {
  sendsToPerson: "unknown",
  spendsMoney: "unknown",
  changesLiveData: "unknown",
  undoable: "unknown",
  affects: "Not known",
  note: "This action isn't classified, so treat it as risky.",
  classified: false,
};

/** The class-derived baseline, used when only the class (not the facts table) is known. */
function fromClass(cls: JarvisActionClass): ApprovalSafety {
  const writes = cls.effect === "write" || cls.effect === "destructive";
  return {
    sendsToPerson: cls.external ? "unknown" : "no",
    spendsMoney: "unknown",
    changesLiveData: writes ? "yes" : cls.effect === "memory" ? "yes" : "no",
    undoable:
      cls.effect === "destructive"
        ? "no"
        : writes || cls.effect === "memory"
          ? "unknown"
          : "nothing",
    affects: "Not known",
    classified: true,
  };
}

/** Safety facts for one Jarvis action id. Never trusts anything the model wrote. */
export function jarvisApprovalSafety(actionId: string): ApprovalSafety {
  const cls = Object.hasOwn(JARVIS_ACTION_CLASSES, actionId)
    ? JARVIS_ACTION_CLASSES[actionId as keyof typeof JARVIS_ACTION_CLASSES]
    : undefined;
  if (!cls) return UNKNOWN;
  const base = fromClass(cls);
  const facts = Object.hasOwn(JARVIS_APPROVAL_FACTS, actionId)
    ? JARVIS_APPROVAL_FACTS[actionId]
    : undefined;
  if (!facts) return base;
  // The class always wins where it speaks: destructive never reads as undoable,
  // and an action the class marks as staying inside the platform never "sends".
  const sendsToPerson =
    !cls.external && facts.sendsToPerson === "yes" ? base.sendsToPerson : facts.sendsToPerson;
  const undoable = cls.effect === "destructive" && facts.undoable === "yes" ? "no" : facts.undoable;
  return { ...facts, sendsToPerson, undoable, classified: true };
}

/**
 * Agent (PAI-4) tools that reach a customer. The tool registry marks each with
 * the `send_external` risk, so these are customer sends. The legacy labels
 * `approvals-view.ts` knows are included so older rows read the same way.
 */
const AGENT_SEND_TOOLS = new Set([
  "reviews.request",
  "quotes.send",
  "bookings.reminder",
  "send_sms",
  "send_email",
  "send_quote",
  "send_review_request",
  "post_campaign",
  "create_campaign",
]);

/** Safety facts for one workspace-agent tool. Unknown tools read as not known, never as safe. */
export function agentApprovalSafety(tool: string): ApprovalSafety {
  if (AGENT_SEND_TOOLS.has(tool)) {
    return {
      sendsToPerson: "yes",
      spendsMoney: "unknown",
      changesLiveData: "yes",
      undoable: "no",
      affects: "The customer receiving it",
      note: "Once sent it can't be recalled. Approving lets the agent send it once.",
      classified: true,
    };
  }
  return UNKNOWN;
}

const answerText = (answer: SafetyAnswer) =>
  answer === "yes" ? "Yes" : answer === "no" ? "No" : "Not known";

/** The four lines every approval card shows, in a fixed order. */
export function safetyLines(safety: ApprovalSafety): SafetyLine[] {
  const tone = (answer: SafetyAnswer): SafetyLine["tone"] =>
    answer === "yes" ? "caution" : answer === "no" ? "calm" : "unknown";
  const undoValue =
    safety.undoable === "yes"
      ? "Yes"
      : safety.undoable === "no"
        ? "No, it can't be undone"
        : safety.undoable === "nothing"
          ? "Nothing to undo"
          : "Not known";
  const undoTone: SafetyLine["tone"] =
    safety.undoable === "no" ? "caution" : safety.undoable === "unknown" ? "unknown" : "calm";
  return [
    {
      key: "sends",
      label: "Sends to a person",
      value: answerText(safety.sendsToPerson),
      tone: tone(safety.sendsToPerson),
    },
    {
      key: "spends",
      label: "Spends money",
      value: answerText(safety.spendsMoney),
      tone: tone(safety.spendsMoney),
    },
    {
      key: "changes",
      label: "Changes live data",
      value: answerText(safety.changesLiveData),
      tone: tone(safety.changesLiveData),
    },
    { key: "undo", label: "Can be undone", value: undoValue, tone: undoTone },
  ];
}

/**
 * JC-55 / New Bot 4 hard gate for bulk approve.
 *
 * Only an explicit Yes for "can be undone", plus explicit No for "sends to a
 * person" and "spends money", may pass. "Not known", "Nothing to undo", and
 * any other answer fails closed — never treat unknowns as safe.
 */
export function isBulkApproveEligible(safety: ApprovalSafety): boolean {
  return (
    safety.undoable === "yes" &&
    safety.sendsToPerson === "no" &&
    safety.spendsMoney === "no"
  );
}

/** Alias used by callers that look up safety by Jarvis action id. */
export const approvalSafety = jarvisApprovalSafety;
