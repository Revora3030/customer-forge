import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyImportedFacts, importExistingWebsite } from "@/lib/site-import.functions";
import { foundLabels, type ImportedFacts } from "@/lib/site-import";

/**
 * For owners already on Revora: read their other (older) website and add
 * what it states to their business details — only into empty fields — so the
 * builder can upgrade the Revora site from it.
 */
export function UpgradeFromWebsite({ organizationId }: { organizationId: string | null }) {
  const read = useServerFn(importExistingWebsite);
  const apply = useServerFn(applyImportedFacts);
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ url: string; facts: ImportedFacts } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!organizationId) return null;

  const run = async () => {
    setBusy(true);
    setMessage(null);
    setSaved(null);
    try {
      const result = await read({ data: { url } });
      if (!result.ok) setMessage(result.message);
      else if (!foundLabels(result.facts).length) setMessage("Revora read that site but found no details it could use.");
      else setFound({ url: result.url, facts: result.facts });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Revora couldn't read that website.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!found) return;
    setBusy(true);
    try {
      const result = await apply({ data: { organizationId, url: found.url, facts: found.facts } });
      const parts = [
        ...result.filled,
        ...(result.servicesAdded ? [`${result.servicesAdded} services`] : []),
        ...(result.socialAdded ? [`${result.socialAdded} social links`] : []),
      ];
      setSaved(
        parts.length
          ? `Added to your business details: ${parts.join(", ")}.`
          : "Your business details already had everything this site states, so nothing changed.",
      );
      setFound(null);
      void qc.invalidateQueries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save those details.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-5">
      <SectionHeading eyebrow="Upgrade" title="Bring in your existing website" />
      <p className="mt-1 text-[13px] text-muted-foreground">
        Have another website? Revora reads the details it states — contact info, hours, services, logo and main photo —
        and adds them where your business details are still empty. Nothing you've saved is overwritten.
      </p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <Input
          aria-label="Your existing website"
          inputMode="url"
          placeholder="yourbusiness.com"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || url.trim().length < 4} className="shrink-0">
          {busy && !found ? "Reading…" : "Read my website"}
        </Button>
      </form>
      {found ? (
        <div className="mt-3 rounded-lg border border-border p-3 text-[13px]">
          <p className="font-medium">Found on {new URL(found.url).hostname}: {foundLabels(found.facts).join(", ")}.</p>
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-muted-foreground">
            {found.facts.phone ? <li>Phone: {found.facts.phone}</li> : null}
            {found.facts.email ? <li>Email: {found.facts.email}</li> : null}
            {found.facts.address ? <li>Address: {found.facts.address}</li> : null}
            {found.facts.hours ? <li>Hours: {found.facts.hours}</li> : null}
            {found.facts.services.length ? <li>Services: {found.facts.services.map((service) => service.name).join(", ")}</li> : null}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="signal" size="sm" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Add these to my business"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setFound(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {saved ? (
        <p className="mt-3 text-[13px]" role="status">
          {saved}{" "}
          <Link to="/app/website" className="text-primary underline-offset-2 hover:underline">
            Open the builder
          </Link>{" "}
          and ask Revora to "upgrade my site with my business details".
        </p>
      ) : null}
      {message ? <p className="mt-3 text-[12.5px] text-muted-foreground" role="status">{message}</p> : null}
    </Panel>
  );
}
