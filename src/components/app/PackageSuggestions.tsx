/**
 * "Make your services stronger": draft package suggestions for a thin service
 * menu. Each suggestion opens the normal Add service form pre-filled, with the
 * price and duration left for the owner, so nothing is saved or shown on the
 * website until they check it and press Save.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { suggestServicePackages } from "@/lib/service-suggestions.functions";
import type { SuggestedPackage } from "@/lib/service-suggestions";

type Props = {
  organizationId: string;
  onUse: (suggestion: SuggestedPackage) => void;
};

export function PackageSuggestionsView({
  packages,
  busy,
  message,
  onAsk,
  onUse,
  onDismiss,
}: {
  packages: SuggestedPackage[] | null;
  busy: boolean;
  message: string | null;
  onAsk: () => void;
  onUse: (suggestion: SuggestedPackage) => void;
  onDismiss: (suggestion: SuggestedPackage) => void;
}) {
  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Make your services stronger" title="Suggested packages" />
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
        A website built from one-word services comes out thin. Ask for draft packages, then edit each one to match what you really
        do and set your own price and time. Nothing is saved or shown on your website until you press Save.
      </p>
      {packages === null ? (
        <Button className="mt-4" variant="signal" onClick={onAsk} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          {busy ? "Writing drafts…" : "Suggest packages"}
        </Button>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {packages.map((item) => (
            <li key={item.name} className="rounded-lg border border-border bg-elevated p-4">
              <p className="font-display text-[15px] font-semibold">{item.name}</p>
              {item.category ? <p className="mt-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">{item.category}</p> : null}
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-[12px] text-muted-foreground">Draft: check it matches what you do, then add your price and time.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="signal" onClick={() => onUse(item)}>
                  Edit and add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDismiss(item)}>
                  Not for me
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message ? (
        <p role="status" className="mt-3 text-[13px] text-muted-foreground">
          {message}
        </p>
      ) : null}
    </Panel>
  );
}

export function PackageSuggestions({ organizationId, onUse }: Props) {
  const ask = useServerFn(suggestServicePackages);
  const [packages, setPackages] = useState<SuggestedPackage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await ask({ data: { organizationId } });
      if (result.ok) setPackages(result.packages);
      else setMessage(result.message);
    } catch {
      setMessage("That didn't work just now. Try again in a moment, or add a service yourself.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PackageSuggestionsView
      packages={packages}
      busy={busy}
      message={message}
      onAsk={run}
      onUse={onUse}
      onDismiss={(item) => setPackages((current) => (current ? current.filter((entry) => entry.name !== item.name) : current))}
    />
  );
}
