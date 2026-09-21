/**
 * "Only what your website actually needs."
 *
 * Instead of tabs for brand, photos, domains, lead capture and reports, the
 * builder shows a short list of cards — and each card only appears when the
 * real workspace data says it is needed. When the site is healthy this renders
 * nothing at all. Presentation only: every card points at an existing panel or
 * an existing assistant request.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type BuilderNeed = {
  key: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Blocks going live, as opposed to an improvement. */
  blocking?: boolean;
};

export function BuilderNeeds({ needs }: { needs: BuilderNeed[] }) {
  if (needs.length === 0) return null;
  return (
    <div className="grid auto-cols-[minmax(240px,82vw)] grid-flow-col gap-3 overflow-x-auto pb-1 md:auto-cols-auto md:grid-flow-row md:grid-cols-2 xl:grid-cols-3">
      {needs.map((need) => (
        <section
          key={need.key}
          className={cn(
            "panel flex min-h-[138px] flex-col p-4",
            need.blocking && "border-accent/40 bg-accent/5",
          )}
        >
          <p className="text-[13px] font-medium">{need.title}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{need.body}</p>
          <Button
            className="mt-auto self-start pt-3"
            size="sm"
            variant={need.blocking ? "signal" : "outline"}
            onClick={need.onAction}
          >
            {need.actionLabel}
          </Button>
        </section>
      ))}
    </div>
  );
}
