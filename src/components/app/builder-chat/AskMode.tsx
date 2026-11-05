/**
 * Ask mode for the builder chat (COMP-2 + LOV-1).
 *
 * A small Ask / Change switch in the composer. In Ask mode a message goes to
 * the read-only `askAboutSite` server path instead of the edit planner: no
 * version, checkpoint or edit job is ever created, and every reply carries a
 * visible "No changes made" label. "Make this change" turns a reply into a
 * normal Change request with one tap (it then goes through the usual plan and
 * approval flow). Ask turns live only in this chat session.
 */
import { useState, type ReactNode } from "react";
import { MessageCircleQuestion, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askAboutSite } from "@/lib/builder/ask-mode.functions";
import { ASK_QUESTION_LIMIT, NO_CHANGES_LABEL, changeRequestFrom, type AskAnswer } from "@/lib/builder/ask-mode";
import { ReplyText } from "@/components/app/ReplyText";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { friendlyError } from "@/lib/user-error";
import { cn } from "@/lib/utils";

export type AskTurn = {
  id: string;
  question: string;
  state: "thinking" | "answered" | "failed";
  reply?: AskAnswer;
  error?: string;
  /** Set once "Make this change" was pressed, so it can't be sent twice. */
  sent?: boolean;
};

export function useAskMode({
  organizationId,
  onMakeChange,
  available = true,
}: {
  organizationId: string | null;
  /** Sends a normal Change request (the usual plan + approval flow). */
  onMakeChange: (instruction: string) => void;
  /** Off for first builds and fact questions, where Ask makes no sense. */
  available?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const ask = useServerFn(askAboutSite);
  const on = active && available;

  const update = (id: string, patch: Partial<AskTurn>) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  /** Ask mode handles this message (returns true) or leaves it to the normal Change flow. */
  const intercept = (text: string): boolean => {
    if (!on) return false;
    const question = text.trim().slice(0, ASK_QUESTION_LIMIT);
    if (!question) return true;
    const id = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setTurns((all) => [...all, { id, question, state: "thinking" }]);
    if (!organizationId) {
      update(id, { state: "failed", error: "Open a website first." });
      return true;
    }
    void ask({ data: { organizationId, question } })
      .then((reply) => update(id, { state: "answered", reply }))
      .catch((error: unknown) => update(id, { state: "failed", error: friendlyError(error as Error) }));
    return true;
  };

  const makeChange = (turn: AskTurn) => {
    if (!turn.reply || turn.sent) return;
    update(turn.id, { sent: true });
    setActive(false);
    onMakeChange(changeRequestFrom(turn.question, turn.reply));
  };

  const toggle: ReactNode = available ? (
    <AskToggle active={active} onChange={setActive} />
  ) : null;
  const transcript: ReactNode = turns.length ? (
    <AskTranscript turns={turns} onMakeChange={makeChange} />
  ) : null;
  return {
    active: on,
    intercept,
    toggle,
    transcript,
    placeholder: on ? "Ask a question. Nothing on your site changes…" : null,
  };
}

/** The Ask / Change switch. Default is Change. */
export function AskToggle({ active, onChange }: { active: boolean; onChange: (ask: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Ask mode: questions only, nothing on your site changes"
      title={active ? "Ask mode: I only answer, nothing changes" : "Switch to Ask: questions only, nothing changes"}
      data-testid="ask-mode-toggle"
      onClick={() => onChange(!active)}
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <MessageCircleQuestion className="size-4" aria-hidden />
      {active ? "Ask" : "Change"}
    </button>
  );
}

/** Ask questions and replies. Each reply is labelled "No changes made". */
export function AskTranscript({ turns, onMakeChange }: { turns: AskTurn[]; onMakeChange: (turn: AskTurn) => void }) {
  return (
    <div className="space-y-5" data-testid="ask-transcript">
      {turns.map((turn) => (
        <div key={turn.id} className="chat-rise space-y-3" data-ask-turn={turn.state}>
          <div className="flex justify-end">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--chat-user-bg)] px-3.5 py-2.5 text-[15px] leading-6 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">
              <span className="mb-0.5 block text-xs text-muted-foreground">Question</span>
              {turn.question}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <img src="/revora-mark-144.png" alt="Revora" className="mt-1 hidden size-6 shrink-0 rounded-md sm:flex" />
            <div className="min-w-0 flex-1 space-y-2 text-[15px] leading-7">
              {turn.state === "thinking" ? <Shimmer>Looking at your site…</Shimmer> : null}
              {turn.reply ? <ReplyText text={turn.reply.answer} className="text-[15px] leading-7" /> : null}
              {turn.error ? <p className="text-sm leading-6">{turn.error}</p> : null}
              {turn.state !== "thinking" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted-foreground"
                    data-testid="ask-no-changes"
                  >
                    {NO_CHANGES_LABEL}
                  </span>
                  {turn.reply ? (
                    <button
                      type="button"
                      disabled={turn.sent}
                      onClick={() => onMakeChange(turn)}
                      data-testid="ask-make-change"
                      className="relative inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-medium text-foreground transition-colors after:absolute after:-inset-1 hover:border-primary/50 disabled:opacity-60"
                    >
                      <Wand2 className="size-3.5" aria-hidden />
                      {turn.sent ? "Sent as a change" : "Make this change"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
