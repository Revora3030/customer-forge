/**
 * B12-1 Self-repair card for the builder chat.
 *
 * Appears only when Revora's own post-apply check found something and tried
 * a safe repair for this request. It says what was found, what changed and
 * what the re-check measured. A repair the re-check could not confirm is
 * shown as not fixed, with the restore point offered. No event, no card.
 */
import { Undo2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { repairCard, type RepairCard, type RepairEvent } from "@/lib/builder/repair-card";

function List({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: "ok" | "bad" | "muted";
}) {
  if (!items.length) return null;
  const cls =
    tone === "ok"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "bad"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="mt-2">
      <p className="text-[12px] font-medium">{label}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className={`text-[12px] break-words ${cls}`}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RepairStreamCardView({
  card,
  onRestore,
}: {
  card: RepairCard;
  onRestore?: (() => void) | undefined;
}) {
  const verified = card.verdict === "verified";
  return (
    <div
      className="mt-2 rounded-lg border border-border bg-background p-3"
      data-result-card="self-repair"
      data-verdict={card.verdict}
      role="status"
    >
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
        <Wrench className="size-3.5 shrink-0" aria-hidden />
        {verified
          ? "Found a problem, fixed it, checked again"
          : "Found a problem, the re-check didn't confirm the fix"}
      </p>
      <List label="Found" items={card.found} tone="muted" />
      <List label="Fixed and confirmed by the re-check" items={card.fixed} tone="ok" />
      <List label="Changed, but the re-check still finds it" items={card.stillThere} tone="bad" />
      <List label="Couldn't be saved" items={card.notApplied} tone="bad" />
      <List
        label="Left for you (not safe to change automatically)"
        items={card.leftForYou}
        tone="muted"
      />
      <p className="mt-2 text-[12px] text-muted-foreground">
        Re-check: {card.findingsBefore} issue{card.findingsBefore === 1 ? "" : "s"} before,{" "}
        {card.findingsAfter} after.
      </p>
      {!verified && onRestore ? (
        <div className="mt-2">
          <Button size="sm" variant="outline" data-tap="primary" onClick={onRestore}>
            <Undo2 className="size-3.5" aria-hidden />
            Restore an earlier version
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The single mount point: renders nothing unless a real repair event was recorded for this request. */
export function RepairStreamCard({
  repair,
  onRestore,
}: {
  repair: RepairEvent | null | undefined;
  onRestore?: (() => void) | undefined;
}) {
  const card = repairCard(repair);
  return card ? <RepairStreamCardView card={card} onRestore={onRestore} /> : null;
}
