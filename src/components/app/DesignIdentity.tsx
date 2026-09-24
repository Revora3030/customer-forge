/**
 * DESIGN IDENTITY — shows the look the AI design team saved for this site.
 *
 * Read-only: nothing here picks, seeds or invents a style. When no look has
 * been saved yet, it says so and offers to ask the AI for one.
 */
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readDesignFingerprint } from "@/lib/builder/design-fingerprint";

const human = (value: string | undefined) => (value ? value.replace(/-/g, " ") : "—");

export function DesignIdentity({
  generation,
  onRestyle,
}: {
  generation: unknown;
  onRestyle?: (instruction: string) => void;
}) {
  const saved = readDesignFingerprint(generation);
  const authored = saved && saved.family !== "neutral" ? saved : null;
  const rows: [string, string][] = authored
    ? [
        ["Look", human(authored.family)],
        ["Opening", human(authored.heroComposition)],
        ["Cards", human(authored.cardSystem)],
        ["Type", human(authored.typeSystem)],
        ["Density", human(authored.density)],
        ["Motion", human(authored.motionLevel)],
      ]
    : [];

  return (
    <section className="panel p-4" aria-labelledby="design-identity-title">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-4 text-primary" aria-hidden />
        <p id="design-identity-title" className="text-[13px] font-semibold">
          Your design identity
        </p>
      </div>
      {authored ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border/60 bg-background/40 p-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-[12px] capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">
          No look has been saved yet. The AI designs one on your first build or redesign.
        </p>
      )}
      {onRestyle ? (
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() =>
            onRestyle(
              "Restyle my site with a fresh visual direction: keep all my content and facts, change layout, spacing and type feel only.",
            )
          }
        >
          Try a different direction
        </Button>
      ) : null}
    </section>
  );
}
