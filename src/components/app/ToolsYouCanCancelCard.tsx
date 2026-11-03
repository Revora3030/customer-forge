import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usdExact } from "@/lib/offer";
import {
  CANCELABLE_TOOLS,
  readEntries,
  toolsStorageKey,
  toolsTotals,
  type ToolsEntries,
} from "@/lib/tools-you-can-cancel";

/**
 * The owner types what they pay today for each kind of tool Revora's plan
 * includes. Nothing is pre-filled; blank means $0. Entries are saved in this
 * browser only (per workspace), not on Revora's servers.
 */
export function ToolsYouCanCancelCard({ organizationId }: { organizationId: string | undefined }) {
  const [entries, setEntries] = useState<ToolsEntries>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    try {
      setEntries(readEntries(window.localStorage.getItem(toolsStorageKey(organizationId))));
    } catch {
      setEntries({});
    }
    setLoadedFor(organizationId);
  }, [organizationId]);

  const update = (key: string, value: string) => {
    const next = { ...entries, [key]: value.slice(0, 12) };
    setEntries(next);
    if (!organizationId || loadedFor !== organizationId) return;
    try {
      window.localStorage.setItem(toolsStorageKey(organizationId), JSON.stringify(next));
    } catch {
      // Private mode or full storage: the totals still work for this visit.
    }
  };

  if (!organizationId) return null;
  const totals = toolsTotals(entries);
  const typedAnything = totals.monthlyTotal > 0;

  return (
    <Panel className="p-5">
      <SectionHeading
        eyebrow="Your own numbers"
        title="Tools you can cancel"
      />
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        These are the kinds of tools Revora's plan includes. Type what you pay today, per month, for
        any you use. Leave the rest blank. Check that the matching Revora feature works for you
        before you cancel anything.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {CANCELABLE_TOOLS.map((tool) => {
          const id = `tool-cost-${tool.key}`;
          return (
            <li key={tool.key} className="rounded-md border border-border p-3">
              <Label htmlFor={id} className="text-[13px] font-medium">
                {tool.replaces}
              </Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Replaced by: <Link to={tool.to} className="underline">{tool.feature}</Link>
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[13px] text-muted-foreground" aria-hidden="true">$</span>
                <Input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={entries[tool.key] ?? ""}
                  onChange={(event) => update(tool.key, event.target.value)}
                  aria-describedby="tools-cancel-note"
                  className="h-9 max-w-[8rem]"
                />
                <span className="text-[12px] text-muted-foreground">per month</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-md bg-muted/40 p-4" aria-live="polite">
        <p className="text-[13px]">
          Your tools today: <strong>{usdExact(totals.monthlyTotal)}</strong>/month · Revora:{" "}
          <strong>{usdExact(totals.revoraMonthly)}</strong>/month
        </p>
        {!typedAnything ? (
          <p className="mt-1 text-[13px] text-muted-foreground">
            Enter what you pay to see your own total.
          </p>
        ) : totals.net > 0 ? (
          <p className="mt-1 text-[14px] font-medium">
            Based on what you entered, you would save {usdExact(totals.net)} per month (
            {usdExact(totals.yearly)} per year).
          </p>
        ) : totals.net === 0 ? (
          <p className="mt-1 text-[14px] font-medium">
            Based on what you entered, the tools you pay for cost the same as Revora.
          </p>
        ) : (
          <p className="mt-1 text-[14px] font-medium">
            Based on what you entered, those tools cost {usdExact(-totals.net)} per month less than
            Revora, so cancelling them would not save money on its own.
          </p>
        )}
      </div>
      <p id="tools-cancel-note" className="mt-3 text-[12px] leading-snug text-muted-foreground">
        Your amounts are saved in this browser only, never sent to Revora. The total uses your
        numbers and Revora's {usdExact(totals.revoraMonthly)}/month plan price, and leaves out the
        one-time setup fee.
      </p>
    </Panel>
  );
}
