/**
 * LOV-16 "Ask AI about this". Owner/admin/manager only (renders nothing for
 * staff or viewers; the server checks the role again). Opens a bottom sheet
 * where the owner asks a question; the answer is grounded in numbers read for
 * this workspace and the sheet lists what was read. Read-only: the button
 * never changes anything, sends anything or contacts anyone.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { askAiAboutWorkspace } from "@/lib/ask-ai.functions";
import { ASK_AI_DAY_OPTIONS, ASK_AI_MAX_QUESTION_CHARS, ASK_AI_SUGGESTIONS, type AskAiTopic } from "@/lib/ask-ai";
import { canManage } from "@/lib/domain";
import { friendlyError } from "@/lib/user-error";
import { useWorkspace } from "@/lib/use-tenant";

export function AskAiButton({
  topic = "general",
  leadId = null,
  defaultDays = 30,
  label = "Ask AI",
  size = "sm",
}: {
  topic?: AskAiTopic;
  leadId?: string | null;
  defaultDays?: number;
  label?: string;
  size?: "sm" | "default";
}) {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const role = ws?.workspace?.role;
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState<number>((ASK_AI_DAY_OPTIONS as readonly number[]).includes(defaultDays) ? defaultDays : 30);
  const ask = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Workspace not loaded yet.");
      return askAiAboutWorkspace({ data: { organizationId: orgId, question, topic, days, leadId } });
    },
  });
  if (!canManage(role ?? "viewer") || !orgId) return null;
  const result = ask.data;
  const submit = () => {
    if (question.trim() && !ask.isPending) ask.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <Sparkles className="size-4" /> {label}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-h-[88dvh] w-full max-w-xl gap-3 rounded-t-xl p-4 sm:p-6">
        <SheetHeader className="text-left">
          <SheetTitle>{leadId ? "Ask AI about this lead" : "Ask AI about your business"}</SheetTitle>
          <SheetDescription>
            Answers use only your own Revora data. It can't change anything, send anything or contact anyone.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Time window">
          <span className="text-[12px] text-muted-foreground">Look at:</span>
          {ASK_AI_DAY_OPTIONS.map((d) => (
            <Button key={d} type="button" size="sm" variant={days === d ? "default" : "outline"} aria-pressed={days === d} onClick={() => setDays(d)} className="min-h-9">
              Last {d} days
            </Button>
          ))}
        </div>

        <Textarea
          aria-label="Your question"
          placeholder="Type your question"
          rows={3}
          maxLength={ASK_AI_MAX_QUESTION_CHARS}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
          }}
          className="text-base"
        />
        <div className="flex flex-wrap gap-1.5">
          {ASK_AI_SUGGESTIONS[leadId ? "leads" : topic].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuestion(s)}
              className="min-h-9 cursor-pointer rounded-full border border-border px-3 py-1 text-left text-[12px] text-muted-foreground hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
        <Button type="button" variant="signal" disabled={!question.trim() || ask.isPending} onClick={submit}>
          <Sparkles className="size-4" /> {ask.isPending ? "Looking at your data…" : "Ask"}
        </Button>

        {ask.isError ? (
          <p role="alert" className="text-[13px] text-destructive">
            {friendlyError(ask.error, "Couldn't answer that right now. Try again in a minute.")}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-2.5" aria-live="polite">
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            {result.unverifiedFigures.length ? (
              <p className="flex items-start gap-1.5 rounded-md border border-warning/40 p-2 text-[12px] text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                Double-check {result.unverifiedFigures.join(", ")}: it doesn't match the numbers Revora read.
              </p>
            ) : null}
            {result.unavailable.length ? (
              <p className="text-[12px] text-muted-foreground">Couldn't read right now: {result.unavailable.join(", ")}. Treat those as unknown.</p>
            ) : null}
            <details className="text-[12px] text-muted-foreground">
              <summary className="min-h-9 cursor-pointer py-2">What I looked at (last {result.days} days)</summary>
              <ul className="mt-1 space-y-1 break-words">
                {result.facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
