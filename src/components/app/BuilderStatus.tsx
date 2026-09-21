/**
 * The builder home, answered as four questions.
 *
 * Presentation only: it renders the answers produced by builderHomeStatus and
 * hands any "next move" back to the page, which already owns every panel.
 */
import { Pill } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import type { HomeAnswer } from "@/lib/builder/home-status";

export function BuilderStatus({
  answers,
  onGo,
}: {
  answers: HomeAnswer[];
  onGo: (target: string) => void;
}) {
  if (answers.length === 0) return null;
  return (
    <section aria-label="Website status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {answers.map((answer) => (
        <article
          key={answer.key}
          data-testid={`builder-status-${answer.key}`}
          className="panel flex min-h-[132px] flex-col gap-2 p-4"
        >
          <p className="text-[11px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
            {answer.question}
          </p>
          <div className="min-w-0">
            <Pill tone={answer.tone} dot>
              {answer.answer}
            </Pill>
          </div>
          {answer.detail ? (
            <p className="text-[12px] leading-snug text-muted-foreground">{answer.detail}</p>
          ) : null}
          {answer.action ? (
            <Button
              className="mt-auto self-start"
              size="sm"
              variant={answer.tone === "attention" ? "signal" : "outline"}
              onClick={() => onGo(answer.action!.target)}
            >
              {answer.action.label}
            </Button>
          ) : null}
        </article>
      ))}
    </section>
  );
}
